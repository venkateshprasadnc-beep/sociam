// Scheduled daily at 03:00 UTC (08:30 IST):
// 1. Retries enquiry notifications that failed to send.
// 2. Emails the founder a short digest of leads needing action. Sends nothing if there is nothing to act on.
import { store } from './_shared/store.mjs';
import { notifyLead } from './_shared/leads.mjs';
import { sendEmail, renderEmail, emailConfigured } from './_shared/email.mjs';
import { log } from './_shared/http.mjs';

export async function runDigest() {
  const s = await store('leads');
  const { blobs } = await s.list({ prefix: 'lead/' });
  const leads = (await Promise.all(blobs.map(b => s.get(b.key)))).filter(Boolean);
  const today = new Date().toISOString().slice(0, 10);
  let retried = 0, stillFailing = [];

  if (emailConfigured()) {
    for (const lead of leads) {
      if (!['failed', 'not_configured', 'pending'].includes(lead.email?.status)) continue;
      if ((lead.email?.attempts || 0) >= 9) { stillFailing.push(lead); continue; }
      const r = await notifyLead(lead);
      lead.email = { status: r.status, attempts: (lead.email?.attempts || 0) + r.attempts, id: r.id, lastError: r.error, at: new Date().toISOString() };
      lead.activity.push({ at: lead.email.at, type: 'email', text: `Retry: ${r.status}` });
      await s.setJSON(`lead/${lead.id}`, lead); retried++;
      if (r.status !== 'sent') stillFailing.push(lead);
    }
  }

  const open = leads.filter(l => !['Won', 'Lost'].includes(l.stage));
  const uncontacted = open.filter(l => l.stage === 'New' && Date.now() - Date.parse(l.createdAt) > 24 * 3600 * 1000);
  const due = open.filter(l => l.followUpAt && l.followUpAt <= today);
  const proposals = open.filter(l => ['Proposal', 'Negotiation'].includes(l.stage));
  if (!uncontacted.length && !due.length && !proposals.length && !stillFailing.length) return { retried, sent: false };

  const line = l => `${l.id} · ${l.contact.name}${l.contact.businessName ? ' (' + l.contact.businessName + ')' : ''} · ${l.priority?.level || ''} · ${l.stage} · next: ${l.nextAction || '—'}`;
  const { text, html } = renderEmail('Sociam pipeline — today', [
    ['Follow-ups due or overdue', due.map(line).join('\n') || 'None'],
    ['New for over 24 hours, not yet contacted', uncontacted.map(line).join('\n') || 'None'],
    ['Proposals outstanding', proposals.map(line).join('\n') || 'None'],
    ['System alert: notifications still failing', stillFailing.map(l => `${l.id}: ${l.email?.lastError || 'unknown'}`).join('\n')],
  ], `Open the pipeline: ${(process.env.URL || 'https://sociam.in')}/admin/`);
  const r = await sendEmail({ subject: stillFailing.length ? 'System Alert | Sociam — daily pipeline' : 'Sociam pipeline — follow-ups for today', text, html, idempotencyKey: `digest-${today}` });
  log('info', 'digest', { retried, due: due.length, uncontacted: uncontacted.length, status: r.status });
  return { retried, sent: r.status === 'sent' };
}

export default async () => { await runDigest(); return new Response('ok'); };
export const config = { schedule: '0 3 * * *' };
