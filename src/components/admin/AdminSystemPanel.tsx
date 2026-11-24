import { Database, Download, HardDrive, Play, RefreshCw, RotateCcw, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { AdminAuditLog, AiUsageLog, BackupEntry, CronJobRun, EmailLog, SystemErrorLog } from '../../types/news.ts';
import { formatIndiaDateTime } from '../../utils/date.ts';

interface SystemPayload {
  storage: {
    dataDirConfigured: boolean;
    dataDir: string;
    dbSizeBytes: number;
    integrity: string;
    uploadFiles: number;
    backupFiles: number;
  };
  services: {
    geminiConfigured: boolean;
    smtpConfigured: boolean;
    ephemeralSessionSecret: boolean;
    cronSecretConfigured: boolean;
  };
  availableJobs: string[];
  cronRuns: CronJobRun[];
  auditLogs: AdminAuditLog[];
  aiLogs: AiUsageLog[];
  emailLogs: EmailLog[];
  systemErrors?: SystemErrorLog[];
}

export function AdminSystemPanel({ token }: { token: string }) {
  const [sys, setSys] = useState<SystemPayload | null>(null);
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [busyJob, setBusyJob] = useState('');
  const [backingUp, setBackingUp] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const loadSystem = useCallback(async () => {
    try {
      const [sRes, bRes] = await Promise.all([
        fetch('/api/admin/system', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/admin/backups', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (sRes.ok) setSys(await sRes.json());
      if (bRes.ok) {
        const bJson = await bRes.json();
        setBackups(bJson.backups || []);
      }
    } catch {
      // Ignore transient error
    }
  }, [token]);

  useEffect(() => {
    loadSystem();
  }, [loadSystem]);

  const createBackup = async () => {
    setBackingUp(true);
    setNotice('');
    setError('');
    try {
      const res = await fetch('/api/admin/backups', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Backup failed');
      setNotice(`Created and verified backup ${json.backup.filename}.`);
      loadSystem();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backup failed');
    } finally {
      setBackingUp(false);
    }
  };

  const restoreBackup = async (filename: string) => {
    setError('');
    setNotice('');
    const res = await fetch(`/api/admin/backups/${encodeURIComponent(filename)}/restore`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || 'Restore failed');
      return;
    }
    setNotice(`Restored database from ${json.restoredFrom}. Pre-restore snapshot: ${json.safetySnapshot}.`);
    loadSystem();
  };

  const triggerJob = async (jobName: string) => {
    setBusyJob(jobName);
    setError('');
    setNotice('');
    try {
      const res = await fetch(`/api/admin/cron/${encodeURIComponent(jobName)}/run`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Job trigger failed');
      setNotice(`${jobName}: ${json.summary}`);
      loadSystem();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Job error');
    } finally {
      setBusyJob('');
    }
  };

  const downloadBackup = async (filename: string) => {
    const res = await fetch(`/api/admin/backups/${encodeURIComponent(filename)}/download`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!sys) {
    return <div className="p-6 text-xs text-neutral-500">Loading system diagnostics (Administrator privileges required)...</div>;
  }

  return (
    <div className="space-y-6">
      {notice && (
        <div className="p-3 rounded bg-[#EAF5E5] dark:bg-[#00451F] text-xs font-semibold text-[#00451F] dark:text-[#EAF5E5]">
          {notice}
        </div>
      )}
      {error && (
        <div className="p-3 rounded bg-red-50 dark:bg-red-950/40 text-xs font-semibold text-[#DF2525]">
          {error}
        </div>
      )}

      {/* Storage & Environment Readiness */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
          <div className="flex items-center gap-2 text-xs font-semibold text-neutral-500">
            <Database className="w-4 h-4 text-[#00652E]" /> SQLite Integrity
          </div>
          <div className="text-lg font-bold mt-1 uppercase">{sys.storage.integrity}</div>
          <div className="text-[11px] text-neutral-500 font-mono-tabular">
            {(sys.storage.dbSizeBytes / 1024).toFixed(1)} KB · {sys.storage.uploadFiles} media files
          </div>
        </div>

        <div className="p-4 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
          <div className="flex items-center gap-2 text-xs font-semibold text-neutral-500">
            <HardDrive className="w-4 h-4 text-[#00652E]" /> Persistent Disk
          </div>
          <div className="text-sm font-bold mt-1">{sys.storage.dataDirConfigured ? 'External Mount Active' : 'Local Workspace Path'}</div>
          <div className="text-[11px] text-neutral-500 truncate font-mono-tabular">{sys.storage.dataDir}</div>
        </div>

        <div className="p-4 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
          <div className="flex items-center gap-2 text-xs font-semibold text-neutral-500">
            <ShieldCheck className="w-4 h-4 text-[#00652E]" /> Integrations
          </div>
          <div className="text-xs mt-1.5 space-y-0.5">
            <div>Gemini AI: <strong>{sys.services.geminiConfigured ? 'Configured' : 'Unset'}</strong></div>
            <div>SMTP Email: <strong>{sys.services.smtpConfigured ? 'Configured' : 'Unset'}</strong></div>
          </div>
        </div>

        <div className="p-4 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
          <div className="text-xs font-semibold text-neutral-500">Security Keys</div>
          <div className="text-xs mt-1.5 space-y-0.5">
            <div>Session Secret: <strong>{sys.services.ephemeralSessionSecret ? 'In-Memory' : 'Static Env'}</strong></div>
            <div>Cron Secret: <strong>{sys.services.cronSecretConfigured ? 'Configured' : 'Not Set'}</strong></div>
          </div>
        </div>
      </div>

      {/* Verified Database Backups & Restore */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold">Verified Database Backups &amp; Restore ({backups.length})</h2>
            <p className="text-xs text-neutral-500">Every backup executes SQLite online snapshot + PRAGMA integrity_check before saving.</p>
          </div>
          <button
            type="button"
            disabled={backingUp}
            onClick={createBackup}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded bg-[#00652E] text-white text-xs font-semibold hover:bg-[#00451F]"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${backingUp ? 'animate-spin' : ''}`} />
            {backingUp ? 'Creating Backup...' : 'Create Verified Backup'}
          </button>
        </div>

        {backups.length === 0 ? (
          <p className="text-xs text-neutral-500">No backups created yet.</p>
        ) : (
          <div className="divide-y divide-neutral-100 dark:divide-neutral-800 text-xs">
            {backups.map((b) => (
              <div key={b.filename} className="py-2.5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-mono-tabular font-semibold">{b.filename}</div>
                  <div className="text-neutral-500">
                    {(b.sizeBytes / 1024).toFixed(1)} KB · {b.articleCount} articles · {b.editionCount} editions ·{' '}
                    <span className={b.verified ? 'text-[#00652E] font-semibold' : 'text-[#DF2525]'}>
                      {b.verified ? 'Verified OK' : b.integrityMessage}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => downloadBackup(b.filename)}
                    className="inline-flex items-center gap-1 text-[#00652E] font-semibold underline"
                  >
                    <Download className="w-3.5 h-3.5" /> Download
                  </button>
                  <button
                    type="button"
                    onClick={() => restoreBackup(b.filename)}
                    className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 font-semibold underline"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Restore
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Scheduled Jobs & Cron Endpoints */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5 space-y-4">
        <h2 className="text-base font-bold">Automation Jobs Queue &amp; Manual Triggers</h2>
        <div className="flex flex-wrap gap-2">
          {sys.availableJobs.map((job) => (
            <button
              key={job}
              type="button"
              disabled={busyJob === job}
              onClick={() => triggerJob(job)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-neutral-300 dark:border-neutral-700 text-xs font-semibold hover:border-[#00652E]"
            >
              <Play className="w-3 h-3 text-[#00652E]" />
              {busyJob === job ? 'Running...' : job}
            </button>
          ))}
        </div>

        <div className="divide-y divide-neutral-100 dark:divide-neutral-800 text-xs max-h-64 overflow-y-auto">
          {sys.cronRuns.map((run) => (
            <div key={run.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-mono-tabular font-bold">{run.job_name}</span>{' '}
                <span className={`font-semibold ${run.status === 'failed' ? 'text-[#DF2525]' : 'text-[#00652E]'}`}>
                  [{run.status}]
                </span>{' '}
                <span className="text-neutral-600 dark:text-neutral-400">{run.error_message || run.summary}</span>
              </div>
              <span className="font-mono-tabular text-neutral-500">
                {formatIndiaDateTime(run.started_at)} ({run.duration_ms}ms)
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Email Delivery, AI Logs & Admin Audit Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold">Email Delivery Logs ({sys.emailLogs.length})</h3>
            <button
              type="button"
              onClick={async () => {
                await fetch('/api/admin/emails/retry', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
                loadSystem();
              }}
              className="text-xs font-semibold text-[#00652E] underline"
            >
              Retry Failed
            </button>
          </div>
          <div className="divide-y divide-neutral-100 dark:divide-neutral-800 text-xs max-h-60 overflow-y-auto">
            {sys.emailLogs.map((e) => (
              <div key={e.id} className="py-2">
                <div className="flex justify-between">
                  <span className="font-semibold truncate">{e.recipient} · {e.template_type}</span>
                  <span className={e.status === 'sent' ? 'text-[#00652E]' : e.status === 'failed' ? 'text-[#DF2525]' : 'text-neutral-500'}>
                    {e.status}
                  </span>
                </div>
                {e.error_message && <div className="text-neutral-500 text-[11px]">{e.error_message}</div>}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5 space-y-3">
          <h3 className="text-sm font-bold">AI Assistant Usage Logs ({sys.aiLogs.length})</h3>
          <div className="divide-y divide-neutral-100 dark:divide-neutral-800 text-xs max-h-60 overflow-y-auto">
            {sys.aiLogs.map((a) => (
              <div key={a.id} className="py-2">
                <div className="flex justify-between">
                  <span className="font-semibold">{a.action} · {a.actor_email}</span>
                  <span className="font-mono-tabular text-neutral-500">{a.latency_ms}ms</span>
                </div>
                <div className="text-neutral-500 truncate">{a.result_summary}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5 space-y-3">
        <h3 className="text-sm font-bold">
          Runtime Error Monitor ({(sys.systemErrors || []).filter((e) => !e.resolved).length} open / {(sys.systemErrors || []).length} total)
        </h3>
        {(sys.systemErrors || []).length === 0 ? (
          <p className="text-xs text-neutral-500">No runtime errors recorded.</p>
        ) : (
          <div className="divide-y divide-neutral-100 dark:divide-neutral-800 text-xs max-h-56 overflow-y-auto">
            {(sys.systemErrors || []).map((err) => (
              <div key={err.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <span className={`font-semibold ${err.resolved ? 'text-neutral-400' : 'text-[#DF2525]'}`}>
                    [{err.source}] {err.route}
                  </span>{' '}
                  <span className={err.resolved ? 'line-through text-neutral-400' : ''}>{err.message}</span>
                  <div className="text-[11px] text-neutral-500 font-mono-tabular">{formatIndiaDateTime(err.created_at)}</div>
                </div>
                {!err.resolved && (
                  <button
                    type="button"
                    onClick={async () => {
                      await fetch(`/api/admin/system/errors/${err.id}/resolve`, {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${token}` },
                      });
                      loadSystem();
                    }}
                    className="px-2.5 py-1 rounded border border-neutral-300 dark:border-neutral-700 font-semibold hover:border-[#00652E]"
                  >
                    Mark Resolved
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5 space-y-3">
        <h3 className="text-sm font-bold">Administrator Audit Trail ({sys.auditLogs.length})</h3>
        <div className="divide-y divide-neutral-100 dark:divide-neutral-800 text-xs max-h-64 overflow-y-auto">
          {sys.auditLogs.map((log) => (
            <div key={log.id} className="py-2 flex flex-wrap justify-between gap-2">
              <div>
                <span className="font-mono-tabular font-semibold">{log.action}</span> ·{' '}
                <span>{log.actor_email} ({log.actor_role})</span> ·{' '}
                <span className="text-neutral-500">{log.target_type} {log.target_id}</span>
              </div>
              <span className="font-mono-tabular text-neutral-500">{formatIndiaDateTime(log.created_at)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

