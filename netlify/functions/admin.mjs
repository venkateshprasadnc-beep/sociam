// /api/admin/* — the founder's lead pipeline. Protected by ADMIN_PASSWORD; sessions are signed with SESSION_SECRET.
import crypto from 'node:crypto';
import { json, readJson, clientIp, rateLimit, log } from './_shared/http.mjs';
import { store } from './_shared/store.mjs';
import { STAGES, notifyLead } from './_shared/leads.mjs';
import { sendEmail, emailConfigured, NOTIFY_TO } from './_shared/email.mjs';

const SECRET = () => process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || '';
const sign = v => crypto.createHmac('sha256', SECRET()).update(v).digest('base64url');
const makeToken = () => { const exp = String(Date.now() + 12 * 3600 * 1000); return `${exp}.${sign(exp)}`; };
function authed(req) {
  const t = (req.headers.get('authorization') || '').replace(/^Bearer /, '');
  const [exp, sig] = t.split('.');
  if (!exp || !sig || !SECRET() || Number(exp) < Date.now()) return false;
  const good = sign(exp);
  return sig.length === good.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good));
}
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

async function allLeads() {
  const s = await store('leads');
  const { blobs } = await s.list({ prefix: 'lead/' });
  const leads = (await Promise.all(blobs.map(b => s.get(b.key)))).filter(Boolean);
  return leads.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export default async (req, context) => {
  const url = new URL(req.url);
  const route = url.pathname.replace(/^\/api\/admin\/?/, '');

  if (route === 'login' && req.method === 'POST') {
    if (!process.env.ADMIN_PASSWORD) return json(503, { error: 'ADMIN_PASSWORD is not configured in Netlify environment variables.' });
    if (!(await rateLimit('admin-login', clientIp(req, context), 10, 900))) return json(429, { error: 'Too many attempts. Wait 15 minutes.' });
    const { password } = await readJson(req, 2000).catch(() => ({}));
    if (!password || !safeEq(password, process.env.ADMIN_PASSWORD)) { log('info', 'admin_login_failed'); return json(401, { error: 'Incorrect password.' }); }
    return json(200, { token: makeToken() });
  }
  if (!authed(req)) return json(401, { error: 'Please sign in.' });
  const s = await store('leads');

  if (route === 'leads' && req.method === 'GET') return json(200, { leads: await allLeads(), stages: STAGES });

  if (route === 'leads' && req.method === 'PATCH') {
    const id = url.searchParams.get('id'); const lead = id && await s.get(`lead/${id}`);
    if (!lead) return json(404, { error: 'Lead not found.' });
    const b = await readJson(req, 20000).catch(() => ({}));
    const now = new Date().toISOString(); const changes = [];
    if (b.stage && STAGES.includes(b.stage) && b.stage !== lead.stage) { changes.push(`Stage ${lead.stage} → ${b.stage}`); lead.stage = b.stage; if (lead.stage === 'Contacted' && !lead.lastContactAt) lead.lastContactAt = now; }
    for (const k of ['nextAction', 'owner', 'lostReason']) if (typeof b[k] === 'string' && b[k].trim() !== (lead[k] || '')) { lead[k] = b[k].trim().slice(0, 500) || null; changes.push(`${k} updated`); }
    if (typeof b.followUpAt === 'string' && /^\d{4}-\d{2}-\d{2}$|^$/.test(b.followUpAt) && (b.followUpAt || null) !== (lead.followUpAt || null)) { lead.followUpAt = b.followUpAt || null; changes.push(`Follow-up ${lead.followUpAt || 'cleared'}`); }
    for (const k of ['estimatedValue', 'expectedMrr']) if (b[k] !== undefined) { const n = b[k] === '' || b[k] === null ? null : Number(b[k]); if ((n === null || (Number.isFinite(n) && n >= 0)) && n !== (lead[k] ?? null)) { lead[k] = n; changes.push(`${k === 'estimatedValue' ? 'Deal value' : 'Recurring value'} ${n === null ? 'cleared' : '$' + n}`); } }
    if (b.contacted) { lead.lastContactAt = now; changes.push('Contact logged'); }
    if (typeof b.note === 'string' && b.note.trim()) { lead.notes.push({ at: now, text: b.note.trim().slice(0, 4000) }); changes.push('Note added'); }
    if (changes.length) { lead.updatedAt = now; lead.activity.push({ at: now, type: 'update', text: changes.join('; ') }); await s.setJSON(`lead/${id}`, lead); }
    return json(200, { lead });
  }

  if (route === 'leads' && req.method === 'DELETE') { // privacy requests
    const id = url.searchParams.get('id');
    if (!id || !(await s.get(`lead/${id}`))) return json(404, { error: 'Lead not found.' });
    await s.delete(`lead/${id}`); log('info', 'lead_deleted', { id });
    return json(200, { deleted: id });
  }

  if (route === 'resend' && req.method === 'POST') {
    const id = url.searchParams.get('id'); const lead = id && await s.get(`lead/${id}`);
    if (!lead) return json(404, { error: 'Lead not found.' });
    const r = await notifyLead(lead);
    lead.email = { status: r.status, attempts: (lead.email?.attempts || 0) + r.attempts, id: r.id, lastError: r.error, at: new Date().toISOString() };
    lead.activity.push({ at: lead.email.at, type: 'email', text: `Manual resend: ${r.status}` });
    await s.setJSON(`lead/${id}`, lead);
    return json(200, { email: lead.email });
  }

  if (route === 'events' && req.method === 'GET') {
    const days = Math.min(90, Number(url.searchParams.get('days')) || 30);
    const ev = await store('events'); const out = [];
    for (let i = 0; i < days; i++) { const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10); const v = await ev.get(`day/${d}`); if (v) out.push(v); }
    return json(200, { days: out });
  }

  if (route === 'health' && req.method === 'GET') {
    let blobsOk = true; try { await (await store('cache')).get('rates'); } catch { blobsOk = false; }
    return json(200, {
      storage: blobsOk, email: emailConfigured(), notifyTo: NOTIFY_TO(), ai: Boolean(process.env.ANTHROPIC_API_KEY),
      aiModel: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5', webSearch: process.env.ASK_WEB_SEARCH === '1',
      lastEmailTest: await (await store('cache')).get('email-test'),
    });
  }

  if (route === 'test-email' && req.method === 'POST') {
    const r = await sendEmail({ subject: 'System Alert | Sociam — email delivery test', text: `This is a test from ${process.env.URL || 'your Sociam site'}.\nIf you received it, enquiry notifications will reach this inbox.`, html: `<p>This is a test from ${process.env.URL || 'your Sociam site'}.</p><p>If you received it, enquiry notifications will reach this inbox.</p>` }, { attempts: 1 });
    const rec = { ...r, at: new Date().toISOString(), to: NOTIFY_TO() };
    await (await store('cache')).setJSON('email-test', rec);
    return json(200, rec);
  }

  return json(404, { error: 'Not found' });
};

export const config = { path: ['/api/admin', '/api/admin/*'] };
