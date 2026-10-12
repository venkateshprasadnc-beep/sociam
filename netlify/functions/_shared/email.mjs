// Transactional email through Resend's HTTP API. Credentials stay server-side.
// Required env: RESEND_API_KEY, MAIL_FROM (e.g. "Sociam <notifications@sociam.in>" on a verified domain)
// Optional env: NOTIFY_TO (defaults to venkateshprasadnc@gmail.com)
import { log } from './http.mjs';

export const NOTIFY_TO = () => process.env.NOTIFY_TO || 'venkateshprasadnc@gmail.com';
export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function sendEmail({ subject, text, html, replyTo, to, idempotencyKey }, { attempts = 3 } = {}) {
  if (!emailConfigured()) return { status: 'not_configured', attempts: 0, error: 'RESEND_API_KEY or MAIL_FROM is not set' };
  let lastError = '';
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        },
        body: JSON.stringify({ from: process.env.MAIL_FROM, to: [to || NOTIFY_TO()], subject, text, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.id) return { status: 'sent', id: body.id, attempts: i };
      lastError = `HTTP ${res.status}: ${(body && (body.message || body.name)) || 'unknown error'}`;
      if (res.status >= 400 && res.status < 500 && res.status !== 429) break; // configuration errors won't fix themselves
    } catch (e) { lastError = e.message; }
    if (i < attempts) await sleep(400 * 3 ** (i - 1));
  }
  log('error', 'email_failed', { subject, error: lastError });
  return { status: 'failed', attempts, error: lastError };
}

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function renderEmail(title, rows, footer = '') {
  const text = `${title}\n\n${rows.filter(r => r[1]).map(([k, v]) => `${k}: ${v}`).join('\n')}\n\n${footer}`.trim();
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;color:#17181a">
  <h2 style="font-weight:600;font-size:18px;margin:0 0 16px">${esc(title)}</h2>
  <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:14px">
  ${rows.filter(r => r[1]).map(([k, v]) => `<tr><td style="padding:8px 12px 8px 0;color:#5d636b;vertical-align:top;white-space:nowrap;border-top:1px solid #eee">${esc(k)}</td><td style="padding:8px 0;border-top:1px solid #eee;white-space:pre-wrap">${esc(v)}</td></tr>`).join('')}
  </table>
  ${footer ? `<p style="font-size:13px;color:#5d636b;margin-top:20px;white-space:pre-wrap">${esc(footer)}</p>` : ''}
</div>`;
  return { text, html };
}
