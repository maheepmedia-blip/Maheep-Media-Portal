import crypto from 'node:crypto';
import { createVerifiedBackup, getStorageHealth, pruneOldBackups } from './backup.ts';
import { db, getSetting, setSetting } from './db.ts';
import { retryFailedEmails, sendDailyDigestToSubscribers, sendSystemAlertEmail } from './email.ts';
import { generateEditionForDate } from './epaper.ts';
import { runPendingArticlesAiAudit } from './gemini.ts';
import { retryFailedRssSources, runAllEnabledRssSources } from './rss.ts';

export type JobName =
  | 'rss_collect'
  | 'rss_retry_failed'
  | 'publish_scheduled'
  | 'ai_audit_pending'
  | 'epaper_daily'
  | 'digest_daily'
  | 'email_retry'
  | 'db_backup'
  | 'health_monitor'
  | 'cleanup_weekly';

export const ALL_JOB_NAMES: JobName[] = [
  'rss_collect',
  'rss_retry_failed',
  'publish_scheduled',
  'ai_audit_pending',
  'epaper_daily',
  'digest_daily',
  'email_retry',
  'db_backup',
  'health_monitor',
  'cleanup_weekly',
];

function getIstParts(now = new Date()) {
  const dateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const hourStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    hour12: false,
  }).format(now);
  const minuteStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    minute: '2-digit',
  }).format(now);
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
  }).format(now);
  return {
    dateStr,
    hour: Number(hourStr),
    minute: Number(minuteStr),
    weekday,
  };
}

function acquireLock(jobName: string, ttlSeconds = 300): string | null {
  const ownerId = `worker-${crypto.randomUUID().slice(0, 8)}`;
  db.prepare("DELETE FROM job_locks WHERE job_name = ? AND datetime(expires_at) <= datetime('now')").run(jobName);
  try {
    db.prepare(`
      INSERT INTO job_locks (job_name, owner_id, locked_at, expires_at)
      VALUES (?, ?, datetime('now'), datetime('now', '+' || ? || ' seconds'))
    `).run(jobName, ownerId, ttlSeconds);
    return ownerId;
  } catch {
    return null;
  }
}

function releaseLock(jobName: string, ownerId: string): void {
  db.prepare('DELETE FROM job_locks WHERE job_name = ? AND owner_id = ?').run(jobName, ownerId);
}

export function processScheduledArticles(): { published: number; unpublished: number } {
  const nowIso = new Date().toISOString();

  // 1. Publish scheduled articles (only non-archived articles whose scheduled_at has arrived)
  const toPublish = db
    .prepare(`
      SELECT id, title, summary, content, status
      FROM articles
      WHERE scheduled_at IS NOT NULL
        AND scheduled_at != ''
        AND datetime(scheduled_at) <= datetime(?)
        AND status IN ('draft', 'pending')
    `)
    .all(nowIso) as Array<{ id: string; title: string; summary: string; content: string; status: string }>;

  let published = 0;
  for (const art of toPublish) {
    db.prepare(`
      INSERT INTO article_revisions (id, article_id, editor_email, title, summary, content, status, change_note)
      VALUES (?, ?, 'scheduler@maheepnews.in', ?, ?, ?, ?, 'Before scheduled publish')
    `).run(`rev-${crypto.randomUUID().slice(0, 10)}`, art.id, art.title, art.summary, art.content, art.status);

    db.prepare(`
      UPDATE articles
      SET status = 'published',
          published_at = COALESCE(NULLIF(published_at, ''), scheduled_at, datetime('now')),
          scheduled_at = NULL,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(art.id);
    published++;
  }

  // 2. Auto-unpublish articles where unpublish_at is explicitly set and elapsed
  const toUnpublish = db
    .prepare(`
      SELECT id, title, summary, content, status
      FROM articles
      WHERE unpublish_at IS NOT NULL
        AND unpublish_at != ''
        AND datetime(unpublish_at) <= datetime(?)
        AND status = 'published'
    `)
    .all(nowIso) as Array<{ id: string; title: string; summary: string; content: string; status: string }>;

  let unpublished = 0;
  for (const art of toUnpublish) {
    db.prepare(`
      INSERT INTO article_revisions (id, article_id, editor_email, title, summary, content, status, change_note)
      VALUES (?, ?, 'scheduler@maheepnews.in', ?, ?, ?, ?, 'Before scheduled auto-unpublish')
    `).run(`rev-${crypto.randomUUID().slice(0, 10)}`, art.id, art.title, art.summary, art.content, art.status);

    db.prepare(`
      UPDATE articles
      SET status = 'archived',
          unpublish_at = NULL,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(art.id);
    unpublished++;
  }

  return { published, unpublished };
}

function cleanupOldRecords(): { analyticsDeleted: number; cronDeleted: number; locksDeleted: number } {
  const r1 = db.prepare("DELETE FROM analytics_events WHERE datetime(created_at) < datetime('now', '-90 days')").run();
  const r2 = db.prepare("DELETE FROM cron_job_runs WHERE datetime(started_at) < datetime('now', '-60 days')").run();
  const r3 = db.prepare("DELETE FROM job_locks WHERE datetime(expires_at) <= datetime('now')").run();
  return {
    analyticsDeleted: r1.changes,
    cronDeleted: r2.changes,
    locksDeleted: r3.changes,
  };
}

export async function runManagedJob(
  jobName: JobName,
  options: { triggerSource?: 'internal' | 'cron_http' | 'admin'; idempotencyKey?: string; force?: boolean } = {},
): Promise<{
  status: 'success' | 'failed' | 'skipped';
  summary: string;
  error?: string;
  durationMs: number;
}> {
  const triggerSource = options.triggerSource || 'internal';
  const idempotencyKey = options.idempotencyKey || '';

  if (idempotencyKey && !options.force) {
    const existing = db
      .prepare("SELECT id, summary FROM cron_job_runs WHERE job_name = ? AND idempotency_key = ? AND status = 'success' LIMIT 1")
      .get(jobName, idempotencyKey) as { id: string; summary: string } | undefined;
    if (existing) {
      return { status: 'skipped', summary: `Already completed for key ${idempotencyKey}`, durationMs: 0 };
    }
  }

  const lockOwner = acquireLock(jobName, 300);
  if (!lockOwner) {
    return { status: 'skipped', summary: 'Job already running under active lock', durationMs: 0 };
  }

  const runId = `run-${crypto.randomUUID().slice(0, 10)}`;
  const startedAt = Date.now();
  db.prepare(`
    INSERT INTO cron_job_runs (id, job_name, idempotency_key, status, trigger_source)
    VALUES (?, ?, ?, 'running', ?)
  `).run(runId, jobName, idempotencyKey, triggerSource);

  try {
    let summary = 'Completed';

    if (jobName === 'rss_collect') {
      const results = await runAllEnabledRssSources();
      const imported = results.reduce((acc, r) => acc + r.imported, 0);
      const failedCount = results.filter((r) => r.status === 'failed').length;
      summary = `Processed ${results.length} feeds: imported ${imported} articles (${failedCount} feed errors).`;
    } else if (jobName === 'rss_retry_failed') {
      const results = await retryFailedRssSources();
      const recovered = results.filter((r) => r.status !== 'failed').length;
      summary = results.length === 0 ? 'No failed feeds to retry.' : `Retried ${results.length} failed feeds; ${recovered} succeeded.`;
    } else if (jobName === 'publish_scheduled') {
      const res = processScheduledArticles();
      summary = `Published ${res.published} scheduled, archived ${res.unpublished} expired articles.`;
    } else if (jobName === 'ai_audit_pending') {
      const res = await runPendingArticlesAiAudit(5);
      summary = res.skippedNoKey
        ? 'Skipped pending AI audit (GEMINI_API_KEY not configured).'
        : `Audited ${res.checked} pending articles with advisory quality checks.`;
    } else if (jobName === 'epaper_daily') {
      const todayIst = getIstParts().dateStr;
      try {
        generateEditionForDate(todayIst);
        summary = `Generated daily E-Paper edition for ${todayIst} IST.`;
      } catch (err) {
        // Retry with yesterday if early morning 6 AM IST has no new morning dispatches yet
        const msg = err instanceof Error ? err.message : 'No articles yet';
        summary = `E-Paper skipped for ${todayIst}: ${msg}`;
      }
    } else if (jobName === 'digest_daily') {
      const res = await sendDailyDigestToSubscribers();
      summary = `Digest processed for ${res.totalConfirmed} confirmed subscribers: sent=${res.sent}, skipped=${res.skipped}, failed=${res.failed}.`;
    } else if (jobName === 'email_retry') {
      const res = await retryFailedEmails(10);
      summary = `Retried ${res.attempted} failed emails (${res.succeeded} delivered).`;
    } else if (jobName === 'db_backup') {
      const backup = await createVerifiedBackup('auto');
      const pruned = pruneOldBackups(14);
      summary = `Verified backup ${backup.filename} (${backup.articleCount} articles); pruned ${pruned} older backups.`;
    } else if (jobName === 'health_monitor') {
      const health = getStorageHealth();
      if (health.integrity !== 'ok') {
        throw new Error(`SQLite integrity check failed: ${health.integrity}`);
      }
      summary = `DB integrity ok · ${(health.dbSizeBytes / 1024).toFixed(1)} KB · ${health.backupFiles} backups.`;
    } else if (jobName === 'cleanup_weekly') {
      const res = cleanupOldRecords();
      summary = `Cleaned ${res.analyticsDeleted} analytics rows, ${res.cronDeleted} old logs, ${res.locksDeleted} stale locks.`;
    }

    const durationMs = Date.now() - startedAt;
    db.prepare(`
      UPDATE cron_job_runs
      SET status = 'success', summary = ?, finished_at = datetime('now'), duration_ms = ?
      WHERE id = ?
    `).run(summary, durationMs, runId);

    return { status: 'success', summary, durationMs };
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const errorMsg = err instanceof Error ? err.message : 'Job error';
    db.prepare(`
      UPDATE cron_job_runs
      SET status = 'failed', error_message = ?, finished_at = datetime('now'), duration_ms = ?
      WHERE id = ?
    `).run(errorMsg, durationMs, runId);

    void sendSystemAlertEmail(
      `Scheduled Job Failed: ${jobName}`,
      `Job: ${jobName}\nTrigger: ${triggerSource}\nError: ${errorMsg}\nTime: ${new Date().toISOString()}`,
    );

    return { status: 'failed', summary: 'Job failed', error: errorMsg, durationMs };
  } finally {
    releaseLock(jobName, lockOwner);
  }
}

let minuteTicker: ReturnType<typeof setInterval> | null = null;
let startupJobTimer: ReturnType<typeof setTimeout> | null = null;

async function schedulerTick() {
  const ist = getIstParts();

  // 1. Always process scheduled article publish/unpublish every minute
  await runManagedJob('publish_scheduled', { triggerSource: 'internal' });

  // 2. RSS Collection according to configured interval
  const rssEnabled = getSetting('rss_auto_enabled', 'true') === 'true';
  if (rssEnabled) {
    const intervalMin = Math.max(15, Number(getSetting('rss_interval_minutes', '30')) || 30);
    const lastRunRaw = getSetting('rss_last_run_at', '');
    const lastRunMs = lastRunRaw ? new Date(lastRunRaw).getTime() : 0;
    if (!lastRunMs || Number.isNaN(lastRunMs) || Date.now() - lastRunMs >= intervalMin * 60_000) {
      await runManagedJob('rss_collect', { triggerSource: 'internal' });
    } else {
      const nextIso = new Date(lastRunMs + intervalMin * 60_000).toISOString();
      setSetting('rss_next_run_at', nextIso);
    }
  }

  // 3. Retry failed RSS feeds & failed emails every 30 minutes
  if (ist.minute === 15 || ist.minute === 45) {
    await runManagedJob('rss_retry_failed', {
      triggerSource: 'internal',
      idempotencyKey: `rss_retry:${ist.dateStr}:${ist.hour}:${ist.minute}`,
    });
    await runManagedJob('email_retry', {
      triggerSource: 'internal',
      idempotencyKey: `email_retry:${ist.dateStr}:${ist.hour}:${ist.minute}`,
    });
  }

  // 4. Hourly AI audit on pending articles (advisory only)
  if (ist.minute === 5) {
    await runManagedJob('ai_audit_pending', {
      triggerSource: 'internal',
      idempotencyKey: `ai_audit:${ist.dateStr}:${ist.hour}`,
    });
  }

  // 5. 6:00 AM IST Automated Daily E-Paper Generation
  const epaperHour = Number(getSetting('epaper_auto_hour_ist', '6')) || 6;
  if (ist.hour >= epaperHour) {
    await runManagedJob('epaper_daily', {
      triggerSource: 'internal',
      idempotencyKey: `epaper:${ist.dateStr}`,
    });
  }

  // 6. 7:00 AM IST Daily Morning Newsletter Digest
  const digestHour = Number(getSetting('digest_auto_hour_ist', '7')) || 7;
  if (ist.hour >= digestHour) {
    await runManagedJob('digest_daily', {
      triggerSource: 'internal',
      idempotencyKey: `digest:${ist.dateStr}`,
    });
  }

  // 7. Twice-daily health check (00:00 & 12:00 IST)
  if (ist.hour === 0 || ist.hour === 12) {
    await runManagedJob('health_monitor', {
      triggerSource: 'internal',
      idempotencyKey: `health:${ist.dateStr}:${ist.hour}`,
    });
  }

  // 8. Automated Daily Backup (at or after 23:30 IST or at first daily run)
  if (ist.hour >= 2) {
    await runManagedJob('db_backup', {
      triggerSource: 'internal',
      idempotencyKey: `backup:${ist.dateStr}`,
    });
  }

  // 9. Weekly Sunday cleanup
  if (ist.weekday === 'Sun' && ist.hour === 3) {
    await runManagedJob('cleanup_weekly', {
      triggerSource: 'internal',
      idempotencyKey: `cleanup:${ist.dateStr}`,
    });
  }
}

export function startUnifiedScheduler(): void {
  if (minuteTicker) clearInterval(minuteTicker);
  if (startupJobTimer) clearTimeout(startupJobTimer);

  // Initial check 2s after startup so HTTP server binds port 3000 immediately
  startupJobTimer = setTimeout(() => {
    void schedulerTick().catch((err) => console.error('Startup scheduler tick error:', err));
  }, 2000);

  minuteTicker = setInterval(() => {
    void schedulerTick().catch((err) => console.error('Scheduler tick error:', err));
  }, 60_000);
}

export function listRecentCronRuns(limit = 40) {
  return db.prepare('SELECT * FROM cron_job_runs ORDER BY started_at DESC LIMIT ?').all(limit);
}
