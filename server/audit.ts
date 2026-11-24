import crypto from 'node:crypto';
import type { AuthenticatedRequest } from './auth.ts';
import { db } from './db.ts';

export interface AuditLogInput {
  req?: AuthenticatedRequest;
  actorId?: string;
  actorEmail?: string;
  actorRole?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
}

export function recordAdminAudit(input: AuditLogInput): void {
  try {
    const actorId = input.actorId || input.req?.adminUser?.sub || '';
    const actorEmail = input.actorEmail || input.req?.adminUser?.email || 'system';
    const actorRole = input.actorRole || input.req?.adminUser?.role || 'system';
    const ip = input.req?.ip || '';

    db.prepare(`
      INSERT INTO admin_audit_logs (
        id, actor_id, actor_email, actor_role, action, target_type, target_id, details_json, ip
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `aud-${crypto.randomUUID().slice(0, 10)}`,
      actorId,
      actorEmail,
      actorRole,
      input.action,
      input.targetType || '',
      input.targetId || '',
      JSON.stringify(input.details || {}),
      ip,
    );
  } catch (err) {
    console.error('Failed to record admin audit log:', err);
  }
}

export function listAdminAuditLogs(limit = 100) {
  return db
    .prepare('SELECT * FROM admin_audit_logs ORDER BY created_at DESC LIMIT ?')
    .all(Math.min(250, Math.max(1, limit)));
}

export function recordSystemError(input: {
  source?: string;
  route?: string;
  error: unknown;
}): void {
  try {
    const err = input.error;
    const message = err instanceof Error ? err.message : String(err || 'Unknown runtime error');
    const stackSummary = err instanceof Error && err.stack ? err.stack.split('\n').slice(0, 4).join(' | ').slice(0, 500) : '';
    db.prepare(`
      INSERT INTO system_errors (id, source, route, message, stack_summary, resolved)
      VALUES (?, ?, ?, ?, ?, 0)
    `).run(
      `err-${crypto.randomUUID().slice(0, 10)}`,
      String(input.source || 'api').slice(0, 40),
      String(input.route || '').slice(0, 180),
      message.slice(0, 500),
      stackSummary,
    );
  } catch (e) {
    console.error('Failed to persist system error:', e);
  }
}

export function listSystemErrors(limit = 50) {
  return db
    .prepare('SELECT * FROM system_errors ORDER BY resolved ASC, created_at DESC LIMIT ?')
    .all(Math.min(200, Math.max(1, limit)));
}

export function resolveSystemError(id: string): void {
  db.prepare('UPDATE system_errors SET resolved = 1 WHERE id = ?').run(id);
}

