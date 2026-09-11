import { HttpError } from './http';

export function emailConfiguration() {
  const relayKey = process.env.TIMECLOCK_EMAIL_RELAY_KEY;
  if (relayKey && relayKey.length >= 32) return { key: relayKey, from: 'accounts@sdsoperations.com', relay: true };
  const key = process.env.RESEND_API_KEY;
  const from = process.env.TIMECLOCK_EMAIL_FROM;
  if (!key || !from || /[\r\n]/.test(from)) {
    throw new HttpError(503, 'Account email is not configured. Contact your administrator.', 'EMAIL_UNAVAILABLE');
  }
  return { key, from, relay: false };
}

export async function sendAccountLink(email: string, token: string, invitation: boolean, id: string) {
  const { key, from, relay } = emailConfiguration();
  // Fragment keeps the credential out of server access logs and Referer headers.
  const link = `https://sdsoperations.com/admin/set-password#token=${token}`;
  const subject = invitation ? 'Your invitation to SDS Operations TimeClock' : 'Reset your SDS Operations password';
  const text = invitation
    ? `You have been invited to administer SDS Operations TimeClock.\n\nChoose your password using this link:\n${link}\n\nSign-in email: ${email}\nThis invitation expires in 48 hours and can be used once. Your account provides full TimeClock administration, including scheduling and employee records.\n\nIf you did not expect this invitation, contact Ian Baer.\n\nSDS Operations\nhttps://sdsoperations.com`
    : `A password reset was requested for your SDS Operations TimeClock account.\n\nChoose a new password:\n${link}\n\nThis link expires in 30 minutes and can be used once. If you did not request this, ignore this email; your password has not changed.\n\nSDS Operations\nhttps://sdsoperations.com`;
  const response = await fetch(relay ? 'https://sdsoperations.com/_account-email' : 'https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': `timeclock-account-${id}` },
    body: JSON.stringify(relay ? { email, token, invitation, id } : { from, to: [email], subject, text }),
    signal: AbortSignal.timeout(15000),
  });
  // Do not log the provider body: it may contain recipient or message content.
  if (!response.ok) throw new HttpError(502, 'The email service did not accept the message. Please try again.', 'EMAIL_SEND_FAILED');
}
