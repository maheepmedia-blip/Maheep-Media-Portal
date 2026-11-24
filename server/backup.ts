import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { backupsDir, dataDir, db, dbPath, uploadsDir } from './db.ts';

export interface BackupEntry {
  filename: string;
  sizeBytes: number;
  createdAt: string;
  verified: boolean;
  integrityMessage: string;
  articleCount: number;
  editionCount: number;
}

function getBackupTimestampLabel(): string {
  const now = new Date();
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const hms = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
    .format(now)
    .replace(/:/g, '');
  return `${ymd}_${hms}`;
}

export function verifySqliteFile(filePath: string): {
  ok: boolean;
  integrityMessage: string;
  articleCount: number;
  editionCount: number;
} {
  let checkDb: Database.Database | null = null;
  try {
    checkDb = new Database(filePath, { readonly: true, fileMustExist: true });
    const row = checkDb.prepare('PRAGMA integrity_check(1)').get() as Record<string, string> | undefined;
    const integrityMessage = row ? Object.values(row)[0] || 'unknown' : 'unknown';
    if (integrityMessage !== 'ok') {
      return { ok: false, integrityMessage, articleCount: 0, editionCount: 0 };
    }
    const artRow = checkDb.prepare('SELECT COUNT(*) as count FROM articles').get() as { count: number } | undefined;
    const edRow = checkDb.prepare('SELECT COUNT(*) as count FROM editions').get() as { count: number } | undefined;
    return {
      ok: true,
      integrityMessage: 'ok',
      articleCount: artRow?.count ?? 0,
      editionCount: edRow?.count ?? 0,
    };
  } catch (err) {
    return {
      ok: false,
      integrityMessage: err instanceof Error ? err.message : 'Verification failed',
      articleCount: 0,
      editionCount: 0,
    };
  } finally {
    checkDb?.close();
  }
}

export function resolveSafeBackupPath(filename: string): string {
  const clean = path.basename(filename.trim());
  if (!clean || !clean.endsWith('.db') || clean.includes('..')) {
    throw new Error('Invalid backup filename.');
  }
  const resolved = path.resolve(backupsDir, clean);
  if (!resolved.startsWith(backupsDir + path.sep)) {
    throw new Error('Backup path outside confined backups directory.');
  }
  return resolved;
}

export async function createVerifiedBackup(reason = 'manual'): Promise<BackupEntry> {
  const safeReason = reason.replace(/[^a-z0-9_-]/gi, '').slice(0, 20) || 'manual';
  const filename = `maheep-backup-${getBackupTimestampLabel()}-${safeReason}-${crypto.randomBytes(2).toString('hex')}.db`;
  const destPath = resolveSafeBackupPath(filename);

  await db.backup(destPath);
  const verification = verifySqliteFile(destPath);
  if (!verification.ok) {
    try {
      fs.unlinkSync(destPath);
    } catch {
      // Ignore cleanup error
    }
    throw new Error(`Backup verification failed: ${verification.integrityMessage}`);
  }

  const stat = fs.statSync(destPath);
  return {
    filename,
    sizeBytes: stat.size,
    createdAt: stat.mtime.toISOString(),
    verified: true,
    integrityMessage: verification.integrityMessage,
    articleCount: verification.articleCount,
    editionCount: verification.editionCount,
  };
}

export function pruneOldBackups(keepCount = 14): number {
  if (!fs.existsSync(backupsDir)) return 0;
  const files = fs
    .readdirSync(backupsDir)
    .filter((f) => f.endsWith('.db'))
    .map((f) => {
      const full = path.join(backupsDir, f);
      return { name: f, full, mtime: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);

  let removed = 0;
  for (const file of files.slice(keepCount)) {
    try {
      fs.unlinkSync(file.full);
      removed++;
    } catch {
      // Ignore deletion failure
    }
  }
  return removed;
}

export function listBackups(): BackupEntry[] {
  if (!fs.existsSync(backupsDir)) return [];
  const files = fs
    .readdirSync(backupsDir)
    .filter((f) => f.endsWith('.db'))
    .map((f) => {
      const full = path.join(backupsDir, f);
      const stat = fs.statSync(full);
      const check = verifySqliteFile(full);
      return {
        filename: f,
        sizeBytes: stat.size,
        createdAt: stat.mtime.toISOString(),
        verified: check.ok,
        integrityMessage: check.integrityMessage,
        articleCount: check.articleCount,
        editionCount: check.editionCount,
      };
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return files;
}

export async function restoreFromVerifiedBackup(filename: string): Promise<{
  restoredFrom: string;
  safetySnapshot: string;
  articleCount: number;
  editionCount: number;
}> {
  const sourcePath = resolveSafeBackupPath(filename);
  if (!fs.existsSync(sourcePath)) {
    throw new Error('Selected backup file does not exist.');
  }

  const check = verifySqliteFile(sourcePath);
  if (!check.ok) {
    throw new Error(`Refused to restore corrupted backup: ${check.integrityMessage}`);
  }

  // Always create a pre-restore safety snapshot before overwriting live tables
  const snapshot = await createVerifiedBackup('pre-restore');

  // Attach backup and copy tables atomically in a transaction OR reopen via SQLite backup API
  // Using SQLite backup API from source -> live db file path works safely without closing process handles
  const srcDb = new Database(sourcePath, { readonly: true, fileMustExist: true });
  try {
    await srcDb.backup(dbPath);
  } finally {
    srcDb.close();
  }

  const postCheck = verifySqliteFile(dbPath);
  return {
    restoredFrom: path.basename(sourcePath),
    safetySnapshot: snapshot.filename,
    articleCount: postCheck.articleCount,
    editionCount: postCheck.editionCount,
  };
}

export function getStorageHealth() {
  const dbStat = fs.existsSync(dbPath) ? fs.statSync(dbPath) : null;
  let integrity = 'ok';
  try {
    const res = db.prepare('PRAGMA integrity_check(1)').get() as Record<string, string> | undefined;
    integrity = res ? Object.values(res)[0] || 'unknown' : 'unknown';
  } catch (err) {
    integrity = err instanceof Error ? err.message : 'error';
  }

  const uploadFiles = fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir).length : 0;
  const backupFiles = fs.existsSync(backupsDir) ? fs.readdirSync(backupsDir).filter((f) => f.endsWith('.db')).length : 0;

  return {
    dataDirConfigured: Boolean(process.env.DATA_DIR || process.env.RENDER_DISK_PATH),
    dataDir,
    dbSizeBytes: dbStat?.size ?? 0,
    integrity,
    uploadFiles,
    backupFiles,
  };
}
