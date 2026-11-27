import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import { hashPassword, verifyPassword } from './auth.ts';
import { db } from './db.ts';

const READER_SECRET =
  process.env.READER_SESSION_SECRET?.trim() ||
  process.env.SESSION_SECRET?.trim() ||
  crypto.randomBytes(32).toString('hex');

const FIREBASE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const GIS_CERTS_URL = 'https://www.googleapis.com/oauth2/v1/certs';

let cachedFirebaseConfig: { projectId: string; oAuthClientId: string } | null = null;
function getFirebaseConfigValues(): { projectId: string; oAuthClientId: string } {
  if (cachedFirebaseConfig) return cachedFirebaseConfig;
  let projectId = process.env.FIREBASE_PROJECT_ID?.trim() || process.env.VITE_FIREBASE_PROJECT_ID?.trim() || '';
  let oAuthClientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() || '';
  try {
    const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    const raw = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) as {
      projectId?: string;
      oAuthClientId?: string;
    };
    if (!projectId && raw.projectId) projectId = raw.projectId.trim();
    if (!oAuthClientId && raw.oAuthClientId) oAuthClientId = raw.oAuthClientId.trim();
  } catch {
    // Ignore missing config file
  }
  cachedFirebaseConfig = { projectId, oAuthClientId };
  return cachedFirebaseConfig;
}

const certCaches = new Map<string, { certs: Record<string, string>; expiresAt: number }>();

async function getGooglePublicCerts(url: string, forceRefresh = false): Promise<Record<string, string>> {
  const now = Date.now();
  const cached = certCaches.get(url);
  if (!forceRefresh && cached && cached.expiresAt > now && Object.keys(cached.certs).length > 0) {
    return cached.certs;
  }
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error('Unable to fetch Google token verification certificates.');
  }
  const certs = (await resp.json()) as Record<string, string>;
  const cc = resp.headers.get('cache-control') || '';
  const match = cc.match(/max-age=(\d+)/i);
  const maxAgeSec = match ? Math.max(60, Number(match[1])) : 3600;
  certCaches.set(url, { certs, expiresAt: now + maxAgeSec * 1000 });
  return certs;
}

export async function verifyFirebaseGoogleIdToken(
  idToken: string,
): Promise<{ uid: string; email: string; name: string }> {
  const { projectId, oAuthClientId } = getFirebaseConfigValues();
  if (!projectId && !oAuthClientId) {
    throw new Error('Google authentication configuration is not available on server.');
  }
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid Google ID token format.');
  }
  const [headerB64, payloadB64, sigB64] = parts;
  let header: { alg?: string; kid?: string };
  let payload: {
    aud?: string;
    iss?: string;
    sub?: string;
    exp?: number;
    iat?: number;
    auth_time?: number;
    email?: string;
    email_verified?: boolean;
    name?: string;
  };
  try {
    header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Invalid Google ID token encoding.');
  }
  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Unsupported Google ID token algorithm.');
  }

  const isFirebaseToken = Boolean(projectId) && payload.iss === `https://securetoken.google.com/${projectId}`;
  const isGisToken =
    Boolean(oAuthClientId) &&
    (payload.iss === 'https://accounts.google.com' || payload.iss === 'accounts.google.com');

  if (!isFirebaseToken && !isGisToken) {
    throw new Error('Google ID token issuer mismatch.');
  }
  if (isFirebaseToken && payload.aud !== projectId) {
    throw new Error('Google ID token audience mismatch.');
  }
  if (isGisToken && payload.aud !== oAuthClientId) {
    throw new Error('Google ID token client audience mismatch.');
  }

  const certsUrl = isFirebaseToken ? FIREBASE_CERTS_URL : GIS_CERTS_URL;
  let certs = await getGooglePublicCerts(certsUrl, false);
  let pem = certs[header.kid];
  if (!pem) {
    certs = await getGooglePublicCerts(certsUrl, true);
    pem = certs[header.kid];
  }
  if (!pem) {
    throw new Error('Unknown Google signing key.');
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();
  const isValidSig = verifier.verify(pem, Buffer.from(sigB64, 'base64url'));
  if (!isValidSig) {
    throw new Error('Google ID token signature verification failed.');
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (!payload.sub || typeof payload.sub !== 'string' || payload.sub.length > 128) {
    throw new Error('Google ID token missing subject.');
  }
  if (!payload.exp || payload.exp <= nowSec) {
    throw new Error('Google session token has expired. Please try again.');
  }
  if (payload.iat && payload.iat > nowSec + 300) {
    throw new Error('Google ID token issued in the future.');
  }
  if (payload.auth_time && payload.auth_time > nowSec + 300) {
    throw new Error('Google ID token auth_time invalid.');
  }
  const cleanEmail = String(payload.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || payload.email_verified !== true) {
    throw new Error('A verified Google email address is required.');
  }

  const cleanName = String(payload.name || '').trim() || cleanEmail.split('@')[0];
  return {
    uid: payload.sub,
    email: cleanEmail,
    name: cleanName.slice(0, 120),
  };
}

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

export function authenticateOrRegisterGoogleReader(verified: { uid: string; email: string; name: string }) {
  const cleanEmail = verified.email.trim().toLowerCase();
  const existing = db.prepare('SELECT * FROM reader_users WHERE email = ?').get(cleanEmail) as
    | {
        id: string;
        name: string;
        email: string;
        preferred_language: 'all' | 'en' | 'hi';
        font_size: 'sm' | 'md' | 'lg';
        streak_days?: number;
        last_epaper_edition?: string;
        last_epaper_page?: number;
      }
    | undefined;

  if (existing) {
    const token = signReaderToken({ sub: existing.id, email: existing.email, name: existing.name });
    return {
      isNewAccount: false,
      token,
      user: {
        id: existing.id,
        name: existing.name,
        email: existing.email,
        preferred_language: existing.preferred_language,
        font_size: existing.font_size,
        streak_days: existing.streak_days || 0,
        last_epaper_edition: existing.last_epaper_edition || '',
        last_epaper_page: existing.last_epaper_page || 1,
      },
    };
  }

  const id = `rdr-${crypto.randomUUID().slice(0, 10)}`;
  const cleanName = verified.name.trim() || cleanEmail.split('@')[0];
  db.prepare(`
    INSERT INTO reader_users (id, name, email, password_hash, password_salt, preferred_language, font_size)
    VALUES (?, ?, ?, '', '', 'all', 'md')
  `).run(id, cleanName, cleanEmail);

  const token = signReaderToken({ sub: id, email: cleanEmail, name: cleanName });
  return {
    isNewAccount: true,
    token,
    user: {
      id,
      name: cleanName,
      email: cleanEmail,
      preferred_language: 'all' as const,
      font_size: 'md' as const,
      streak_days: 0,
      last_epaper_edition: '',
      last_epaper_page: 1,
    },
  };
}
