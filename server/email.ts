import nodemailer from 'nodemailer';

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
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const port = Number(process.env.SMTP_PORT || '587');
  const from = process.env.SMTP_FROM?.trim() || 'Maheep News Portal <noreply@maheepnews.in>';
  const adminEmail = process.env.ADMIN_EMAIL?.trim() || 'maheepmedia@gmail.com';

  if (!host || !user || !pass) {
    return {
      sent: false,
      note: 'Submission saved to portal database. SMTP credentials are not configured yet for live email forwarding.',
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
      to: adminEmail,
      replyTo: payload.email,
      subject: `[Maheep News Portal · ${payload.inquiryType}] ${payload.subject}`,
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

    return {
      sent: true,
      note: `Notification email delivered to ${adminEmail}.`,
    };
  } catch (err) {
    return {
      sent: false,
      note: `Submission saved to portal database, but email delivery failed: ${err instanceof Error ? err.message : 'SMTP error'}`,
    };
  }
}
