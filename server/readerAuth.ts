import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { hashPassword, verifyPassword } from './auth.ts';
import { db } from './db.ts';

const READER_SECRET =
  process.env.READER_SESSION_SECRET?.trim() ||
  process.env.SESSION_SECRET?.trim() ||
  crypto.randomBytes(32).toString('hex');

export interface ReaderTokenPayload {
  sub: string;
  email: string;
  name: string;
  kind: 'reader';
  exp: number;
}

export interface ReaderAuthenticatedRequest extends Request {
  readerUser?: ReaderTokenPayload;
}

export function signReaderToken(payload: Omit<ReaderTokenPayload, 'exp' | 'kind'>): string {
  const fullPayload: ReaderTokenPayload = {
    ...payload,
    kind: 'reader',
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7, // 7 days
  };
  const encoded = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const sig = crypto.createHmac('sha256', READER_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifyReaderToken(token: string): ReaderTokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [encoded, sig] = parts;
    const expectedSig = crypto.createHmac('sha256', READER_SECRET).update(encoded).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as ReaderTokenPayload;
    if (payload.kind !== 'reader' || !payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function requireReader(req: ReaderAuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    res.status(401).json({ error: 'Reader sign-in required.' });
    return;
  }
  const payload = verifyReaderToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Reader session expired. Please sign in again.' });
    return;
  }
  req.readerUser = payload;
  next();
}

export function registerReaderAccount(name: string, email: string, password: string) {
  const cleanEmail = email.trim().toLowerCase();
  const cleanName = name.trim();
  const existing = db.prepare('SELECT id FROM reader_users WHERE email = ?').get(cleanEmail);
  if (existing) {
    throw new Error('An account with this email already exists.');
  }
  const { hash, salt } = hashPassword(password);
  const id = `rdr-${crypto.randomUUID().slice(0, 10)}`;
  db.prepare(`
    INSERT INTO reader_users (id, name, email, password_hash, password_salt, preferred_language, font_size)
    VALUES (?, ?, ?, ?, ?, 'all', 'md')
  `).run(id, cleanName, cleanEmail, hash, salt);

  const token = signReaderToken({ sub: id, email: cleanEmail, name: cleanName });
  return {
    token,
    user: {
      id,
      name: cleanName,
      email: cleanEmail,
      preferred_language: 'all',
      font_size: 'md',
      streak_days: 0,
      last_epaper_edition: '',
      last_epaper_page: 1,
    },
  };
}

export function authenticateReaderAccount(email: string, password: string) {
  const cleanEmail = email.trim().toLowerCase();
  const user = db.prepare('SELECT * FROM reader_users WHERE email = ?').get(cleanEmail) as
    | {
        id: string;
        name: string;
        email: string;
        password_hash: string;
        password_salt: string;
        preferred_language: 'all' | 'en' | 'hi';
        font_size: 'sm' | 'md' | 'lg';
        streak_days?: number;
        last_epaper_edition?: string;
        last_epaper_page?: number;
      }
    | undefined;

  if (!user || !verifyPassword(password, user.password_hash, user.password_salt)) {
    return null;
  }
  const token = signReaderToken({ sub: user.id, email: user.email, name: user.name });
  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      preferred_language: user.preferred_language,
      font_size: user.font_size,
      streak_days: user.streak_days || 0,
      last_epaper_edition: user.last_epaper_edition || '',
      last_epaper_page: user.last_epaper_page || 1,
    },
  };
}
