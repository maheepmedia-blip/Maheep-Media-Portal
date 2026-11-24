import crypto from 'node:crypto';
import { generateVAPIDKeys, sendNotification, setVapidDetails } from 'web-push';
import { db, getSetting, setSetting } from './db.ts';

let vapidInitialized = false;

export function ensureVapidConfigured(): { publicKey: string; subject: string } {
  let publicKey = process.env.VAPID_PUBLIC_KEY?.trim() || getSetting('vapid_public_key', '');
  let privateKey = process.env.VAPID_PRIVATE_KEY?.trim() || getSetting('vapid_private_key', '');
  const subject = process.env.VAPID_SUBJECT?.trim() || 'mailto:maheepmedia@gmail.com';

  if (!publicKey || !privateKey) {
    const generated = generateVAPIDKeys();
    publicKey = generated.publicKey;
    privateKey = generated.privateKey;
    setSetting('vapid_public_key', publicKey);
    setSetting('vapid_private_key', privateKey);
  }

  if (!vapidInitialized) {
    setVapidDetails(subject, publicKey, privateKey);
    vapidInitialized = true;
  }

  return { publicKey, subject };
}

export function savePushSubscription(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
  language?: string;
}): void {
  const lang = input.language === 'hi' || input.language === 'en' ? input.language : 'all';
  db.prepare(`
    INSERT INTO push_subscriptions (id, endpoint, p256dh, auth, language)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET
      p256dh = excluded.p256dh,
      auth = excluded.auth,
      language = excluded.language
  `).run(`push-${crypto.randomUUID().slice(0, 10)}`, input.endpoint, input.p256dh, input.auth, lang);
}

export function removePushSubscription(endpoint: string): void {
  db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
}

export async function broadcastBreakingPush(payload: {
  title: string;
  body: string;
  url: string;
  language?: 'en' | 'hi' | 'all';
}): Promise<{ sent: number; failed: number; removed: number }> {
  ensureVapidConfigured();
  const lang = payload.language === 'hi' || payload.language === 'en' ? payload.language : 'all';
  const rows = (
    lang === 'all'
      ? db.prepare('SELECT * FROM push_subscriptions').all()
      : db.prepare("SELECT * FROM push_subscriptions WHERE language = 'all' OR language = ?").all(lang)
  ) as Array<{ id: string; endpoint: string; p256dh: string; auth: string }>;

  let sent = 0;
  let failed = 0;
  let removed = 0;

  const notification = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || '/',
    tag: 'maheep-breaking',
  });

  for (const sub of rows) {
    try {
      await sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        notification,
      );
      sent++;
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(sub.id);
        removed++;
      } else {
        failed++;
      }
    }
  }

  return { sent, failed, removed };
}
