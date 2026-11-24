import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import { db, getSetting } from './db.ts';

const rateMap = new Map<string, number[]>();

export function checkRateLimit(key: string, maxRequests = 5, windowMs = 10 * 60_000): boolean {
  const now = Date.now();
  const timestamps = (rateMap.get(key) || []).filter((ts) => now - ts < windowMs);
  if (timestamps.length >= maxRequests) {
    rateMap.set(key, timestamps);
    return false;
  }
  timestamps.push(now);
  rateMap.set(key, timestamps);
  return true;
}

export function isSmtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST?.trim() && process.env.SMTP_USER?.trim() && process.env.SMTP_PASS?.trim(),
  );
}

function getPublicBaseUrl(fallbackOrigin?: string): string {
  const appUrl = process.env.APP_URL?.trim();
  if (appUrl && appUrl !== 'MY_APP_URL') {
    return appUrl.replace(/\/$/, '');
  }
  return (fallbackOrigin || 'http://localhost:3000').replace(/\/$/, '');
}

async function sendLoggedEmail(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  templateType: string;
  existingLogId?: string;
}): Promise<{ sent: boolean; note: string; logId: string }> {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const port = Number(process.env.SMTP_PORT || '587');
  const from = process.env.SMTP_FROM?.trim() || 'Maheep News Portal <noreply@maheepnews.in>';
  const logId = input.existingLogId || `eml-${crypto.randomUUID().slice(0, 10)}`;

  if (!host || !user || !pass) {
    if (!input.existingLogId) {
      db.prepare(`
        INSERT INTO email_logs (id, recipient, subject, template_type, status, error_message, payload_json)
        VALUES (?, ?, ?, ?, 'skipped', ?, ?)
      `).run(
        logId,
        input.to,
        input.subject,
        input.templateType,
        'SMTP credentials not configured.',
        JSON.stringify({ text: input.text, html: input.html, replyTo: input.replyTo }),
      );
    }
    return {
      sent: false,
      note: 'Saved to portal database. SMTP credentials are not configured yet for outbound email delivery.',
      logId,
    };
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    await transporter.sendMail({
      from,
      to: input.to,
      replyTo: input.replyTo,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });

    if (input.existingLogId) {
      db.prepare("UPDATE email_logs SET status = 'sent', error_message = '', sent_at = datetime('now') WHERE id = ?").run(
        logId,
      );
    } else {
      db.prepare(`
        INSERT INTO email_logs (id, recipient, subject, template_type, status, payload_json, sent_at)
        VALUES (?, ?, ?, ?, 'sent', ?, datetime('now'))
      `).run(
        logId,
        input.to,
        input.subject,
        input.templateType,
        JSON.stringify({ text: input.text, html: input.html, replyTo: input.replyTo }),
      );
    }

    return { sent: true, note: `Email delivered to ${input.to}.`, logId };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'SMTP error';
    if (input.existingLogId) {
      db.prepare("UPDATE email_logs SET status = 'failed', error_message = ?, retries = retries + 1 WHERE id = ?").run(
        errMsg,
        logId,
      );
    } else {
      db.prepare(`
        INSERT INTO email_logs (id, recipient, subject, template_type, status, error_message, payload_json)
        VALUES (?, ?, ?, ?, 'failed', ?, ?)
      `).run(
        logId,
        input.to,
        input.subject,
        input.templateType,
        errMsg,
        JSON.stringify({ text: input.text, html: input.html, replyTo: input.replyTo }),
      );
    }
    return {
      sent: false,
      note: `Saved to database, but email delivery failed: ${errMsg}`,
      logId,
    };
  }
}

export interface ContactNotificationPayload {
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  inquiryType: string;
}

export async function sendAdminContactNotification(
  payload: ContactNotificationPayload,
): Promise<{ sent: boolean; note: string }> {
  const adminEmail = getSetting('admin_email', process.env.ADMIN_EMAIL?.trim() || 'maheepmedia@gmail.com');

  const adminResult = await sendLoggedEmail({
    to: adminEmail,
    replyTo: payload.email,
    subject: `[Maheep News Portal · ${payload.inquiryType}] ${payload.subject}`,
    templateType: 'contact_admin_alert',
    text: [
      `New submission from Maheep News Portal`,
      `Type: ${payload.inquiryType}`,
      `Name: ${payload.name}`,
      `Email: ${payload.email}`,
      `Phone: ${payload.phone || 'Not provided'}`,
      `Subject: ${payload.subject}`,
      '',
      payload.message,
    ].join('\n'),
  });

  // Also send an acknowledgement reply to the reader/sender
  await sendLoggedEmail({
    to: payload.email,
    subject: `We received your message: ${payload.subject} — Maheep News Portal`,
    templateType: 'contact_reader_ack',
    text: [
      `Dear ${payload.name},`,
      '',
      `Thank you for contacting Maheep News Portal (${payload.inquiryType}).`,
      `Our editorial desk (${adminEmail}) has received your inquiry titled "${payload.subject}" and will respond shortly.`,
      '',
      `Regards,`,
      `Maheep News Portal Editorial Team`,
      `सच के साथ, जनता के विश्वास के साथ`,
    ].join('\n'),
  });

  return {
    sent: adminResult.sent,
    note: adminResult.sent
      ? `Notification delivered to ${adminEmail} and confirmation sent to ${payload.email}.`
      : adminResult.note,
  };
}

export async function sendNewsletterConfirmationEmail(input: {
  email: string;
  confirmToken: string;
  unsubscribeToken: string;
  origin?: string;
}): Promise<{ sent: boolean; confirmUrl: string }> {
  const baseUrl = getPublicBaseUrl(input.origin);
  const confirmUrl = `${baseUrl}/api/newsletter/confirm/${encodeURIComponent(input.confirmToken)}`;
  const unsubUrl = `${baseUrl}/api/newsletter/unsubscribe/${encodeURIComponent(input.unsubscribeToken)}`;

  const res = await sendLoggedEmail({
    to: input.email,
    subject: 'Confirm your Maheep News Portal Daily Briefing subscription',
    templateType: 'newsletter_confirm',
    text: [
      `Namaste,`,
      '',
      `Please confirm your subscription to the Maheep Daily Briefing (7:00 AM IST):`,
      confirmUrl,
      '',
      `If you did not request this, you can safely ignore this message or unsubscribe anytime:`,
      unsubUrl,
    ].join('\n'),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #e5e7eb;padding:24px;border-radius:8px;">
        <h2 style="color:#00652E;margin-top:0;">MAHEEP NEWS PORTAL</h2>
        <p style="font-size:13px;color:#4b5563;">सच के साथ, जनता के विश्वास के साथ · News from India &amp; Beyond</p>
        <p>Please confirm your email address to start receiving our verified Morning Digital Edition &amp; News Digest:</p>
        <p style="margin:24px 0;">
          <a href="${confirmUrl}" style="background:#00652E;color:#ffffff;padding:10px 20px;text-decoration:none;border-radius:6px;font-weight:bold;">Confirm Subscription</a>
        </p>
        <p style="font-size:12px;color:#6b7280;">Unsubscribe anytime: <a href="${unsubUrl}">${unsubUrl}</a></p>
      </div>
    `,
  });

  return { sent: res.sent, confirmUrl };
}

export async function sendDailyDigestToSubscribers(origin?: string): Promise<{
  totalConfirmed: number;
  sent: number;
  skipped: number;
  failed: number;
}> {
  const baseUrl = getPublicBaseUrl(origin);
  const subscribers = db
    .prepare("SELECT id, email, unsubscribe_token, language_pref FROM newsletter_subscribers WHERE status = 'active' AND confirmed = 1")
    .all() as Array<{ id: string; email: string; unsubscribe_token: string; language_pref: string }>;

  if (subscribers.length === 0) {
    return { totalConfirmed: 0, sent: 0, skipped: 0, failed: 0 };
  }

  const headlines = db
    .prepare(`
      SELECT a.title, a.slug, a.summary, a.language, c.name as category_name
      FROM articles a
      LEFT JOIN categories c ON c.id = a.category_id
      WHERE a.status = 'published'
      ORDER BY a.featured DESC, a.published_at DESC
      LIMIT 8
    `)
    .all() as Array<{ title: string; slug: string; summary: string; language: string; category_name: string }>;

  if (headlines.length === 0) {
    return { totalConfirmed: subscribers.length, sent: 0, skipped: subscribers.length, failed: 0 };
  }

  const todayIst = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const sub of subscribers) {
    const filtered =
      sub.language_pref === 'en' || sub.language_pref === 'hi'
        ? headlines.filter((h) => h.language === sub.language_pref)
        : headlines;
    const picks = (filtered.length > 0 ? filtered : headlines).slice(0, 6);
    const unsubUrl = `${baseUrl}/api/newsletter/unsubscribe/${encodeURIComponent(sub.unsubscribe_token || sub.id)}`;

    const textBody = [
      `MAHEEP NEWS PORTAL — Morning Briefing (${todayIst} IST)`,
      'सच के साथ, जनता के विश्वास के साथ',
      '',
      ...picks.map((a, i) => `${i + 1}. [${a.category_name || 'News'}] ${a.title}\n   ${baseUrl}/news/${a.slug}\n   ${a.summary}`),
      '',
      `Read Today's E-Paper: ${baseUrl}/epaper`,
      `Unsubscribe: ${unsubUrl}`,
    ].join('\n\n');

    const res = await sendLoggedEmail({
      to: sub.email,
      subject: `Maheep Morning Briefing — ${todayIst}`,
      templateType: 'daily_digest',
      text: textBody,
    });

    if (res.sent) sent++;
    else if (!isSmtpConfigured()) skipped++;
    else failed++;
  }

  return { totalConfirmed: subscribers.length, sent, skipped, failed };
}

export async function sendSystemAlertEmail(subject: string, details: string): Promise<void> {
  const adminEmail = getSetting('admin_email', process.env.ADMIN_EMAIL?.trim() || 'maheepmedia@gmail.com');
  await sendLoggedEmail({
    to: adminEmail,
    subject: `[Maheep Portal Alert] ${subject}`,
    templateType: 'system_alert',
    text: details,
  });
}

export async function retryFailedEmails(limit = 10): Promise<{ attempted: number; succeeded: number }> {
  if (!isSmtpConfigured()) {
    return { attempted: 0, succeeded: 0 };
  }
  const rows = db
    .prepare("SELECT * FROM email_logs WHERE status = 'failed' AND retries < 3 ORDER BY created_at ASC LIMIT ?")
    .all(limit) as Array<{
    id: string;
    recipient: string;
    subject: string;
    template_type: string;
    payload_json: string;
  }>;

  let succeeded = 0;
  for (const row of rows) {
    let payload: { text?: string; html?: string; replyTo?: string } = {};
    try {
      payload = JSON.parse(row.payload_json || '{}');
    } catch {
      payload = {};
    }
    const res = await sendLoggedEmail({
      to: row.recipient,
      subject: row.subject,
      text: payload.text || row.subject,
      html: payload.html,
      replyTo: payload.replyTo,
      templateType: row.template_type,
      existingLogId: row.id,
    });
    if (res.sent) succeeded++;
  }
  return { attempted: rows.length, succeeded };
}
