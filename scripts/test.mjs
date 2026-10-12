// Backend journey tests. External services (Resend, Anthropic, exchange rates) are simulated;
// everything else runs the real function code against file-based storage.
// Usage: npm test
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sociam-test-'));
Object.assign(process.env, { SOCIAM_LOCAL: '1', SOCIAM_LOCAL_DIR: TMP, URL: 'https://sociam.in', ADMIN_PASSWORD: 'test-pass-123', SESSION_SECRET: 'secret' });
delete process.env.RESEND_API_KEY; delete process.env.MAIL_FROM; delete process.env.ANTHROPIC_API_KEY;
const fn = async name => (await import(pathToFileURL(path.join(ROOT, 'netlify/functions', name + '.mjs')))).default;
const lead = await fn('lead'), admin = await fn('admin'), rates = await fn('rates'), ask = await fn('ask'), event = await fn('event');
const { runDigest } = await import(pathToFileURL(path.join(ROOT, 'netlify/functions/digest.mjs')));
let n = 0; const ok = msg => { n++; console.log('  ✓ ' + msg); };
const post = (url, body, headers = {}) => new Request('https://sociam.in' + url, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://sociam.in', ...headers }, body: JSON.stringify(body) });
const ctx = ip => ({ ip: ip || '203.0.113.' + Math.floor(Math.random() * 250) });
const realFetch = globalThis.fetch;
const sent = [];
const mockFetch = (handlers) => { globalThis.fetch = async (url, opts) => { for (const [match, h] of handlers) if (String(url).includes(match)) return h(url, opts); return realFetch(url, opts); }; };
const resendOK = ['api.resend.com', (u, o) => { sent.push(JSON.parse(o.body)); return new Response(JSON.stringify({ id: 'em_' + sent.length }), { status: 200 }); }];
const resendDown = ['api.resend.com', () => new Response(JSON.stringify({ message: 'service unavailable' }), { status: 503 })];
const leads = () => JSON.parse(fs.readFileSync(path.join(TMP, 'leads.json'), 'utf8'));

const valid = { form: 'configurator', name: 'Asha Rao', email: 'asha@example.com', phone: '+91 98450 12345', businessName: 'Rao Developers', country: 'India', businessType: 'real-estate', need: 'website', budget: '1000-5000', timeline: 'asap', requirements: 'Two residential projects in North Bengaluru launching next quarter; need project pages and WhatsApp.', consent: true, services: ['re-website', 'website-care'], configuration: { items: [{ key: 're-website', amount: 1 }], displayCurrency: 'INR' }, attribution: { landing: '/real-estate-websites/', utm_source: 'google', utm_campaign: 'launch' } };

console.log('\nLead intake');
{
  let r = await lead(post('/api/lead', { ...valid, email: 'bad', consent: false, businessType: '' }), ctx());
  let b = await r.json(); assert.equal(r.status, 422); assert.ok(b.fields.email && b.fields.consent && b.fields.businessType); ok('rejects invalid input with field messages');
  r = await lead(post('/api/lead', { ...valid, honeypot: 'spam' }), ctx()); assert.equal(r.status, 400); ok('rejects honeypot submissions');
  r = await lead(post('/api/lead', valid, { origin: 'https://evil.example' }), ctx()); assert.equal(r.status, 403); ok('rejects other origins');

  r = await lead(post('/api/lead', valid), ctx('198.51.100.1')); b = await r.json();
  assert.equal(r.status, 200); assert.ok(b.ok && /^SOC-\d{6}-[0-9A-F]{6}$/.test(b.id));
  const L = leads()[`lead/${b.id}`];
  assert.equal(L.estimate.oneTimeFrom, 300, 'price recomputed from config, client amount ignored');
  assert.equal(L.estimate.items.find(i => i.key === 'website-care').amount, null);
  assert.equal(L.priority.level, 'High'); assert.equal(L.stage, 'New');
  assert.equal(L.email.status, 'not_configured'); assert.equal(L.attribution.utm_source, 'google');
  ok('stores the lead even when email is not configured (status recorded)');
  ok(`scores priority transparently: ${L.priority.level} (${L.priority.reasons.length} reasons)`);
  ok('recomputes prices server-side ($300 package, care quoted)');

  r = await lead(post('/api/lead', valid), ctx('198.51.100.1')); const b2 = await r.json();
  assert.equal(b2.id, b.id); assert.equal(b2.duplicate, true); ok('prevents duplicate submissions within 15 minutes');

  mockFetch([resendOK]); process.env.RESEND_API_KEY = 're_test'; process.env.MAIL_FROM = 'Sociam <notifications@sociam.in>';
  r = await lead(post('/api/lead', { ...valid, email: 'dev@example.com' }), ctx()); b = await r.json();
  const last = sent.at(-1);
  assert.deepEqual(last.to, ['venkateshprasadnc@gmail.com']); assert.equal(last.subject, 'Qualified Real Estate Lead | Sociam');
  assert.equal(last.reply_to, 'dev@example.com'); assert.ok(last.text.includes('Recommended next action'));
  assert.equal(leads()[`lead/${b.id}`].email.status, 'sent');
  ok('sends notification to venkateshprasadnc@gmail.com with subject, details and next action');

  mockFetch([resendDown]);
  r = await lead(post('/api/lead', { ...valid, email: 'down@example.com', businessType: 'ecommerce', need: 'website', services: ['ec-website'] }), ctx()); b = await r.json();
  assert.equal(r.status, 200); const D = leads()[`lead/${b.id}`];
  assert.equal(D.email.status, 'failed'); assert.equal(D.email.attempts, 3);
  ok('keeps the lead and records failure when email delivery is down (3 attempts)');

  mockFetch([resendOK]);
  const before = sent.length; const dg = await runDigest();
  assert.ok(dg.retried >= 2, 'retries failed and unconfigured notifications'); assert.ok(sent.length > before);
  assert.equal(leads()[`lead/${b.id}`].email.status, 'sent'); ok(`daily job retried ${dg.retried} notifications and they were delivered`);

  r = await lead(post('/api/lead', { form: 'ask-sociam', name: 'Sam', email: 'sam@example.com', consent: true, escalation: true, requirements: 'Wants to discuss portal integration', transcript: [{ role: 'user', content: 'Do you integrate with 99acres?' }, { role: 'assistant', content: 'That is scoped per project.' }] }), ctx());
  assert.equal(r.status, 200); assert.equal(sent.at(-1).subject, 'Ask Sociam: Human Follow-up Request | Sociam'); assert.ok(sent.at(-1).text.includes('99acres'));
  ok('Ask Sociam escalations arrive as a human follow-up request with transcript');

  const ip = '192.0.2.77'; let limited = false;
  for (let i = 0; i < 10; i++) { const x = await lead(post('/api/lead', { ...valid, email: `r${i}@example.com` }), { ip }); if (x.status === 429) { limited = true; break; } }
  assert.ok(limited); ok('rate-limits repeated submissions from one connection');
}

console.log('\nPipeline (admin)');
{
  const get = (u, t) => new Request('https://sociam.in' + u, { headers: { authorization: 'Bearer ' + t } });
  let r = await admin(post('/api/admin/login', { password: 'wrong' }), ctx()); assert.equal(r.status, 401); ok('rejects a wrong password');
  r = await admin(get('/api/admin/leads', 'forged.token'), ctx()); assert.equal(r.status, 401); ok('rejects forged sessions');
  r = await admin(post('/api/admin/login', { password: 'test-pass-123' }), ctx()); const { token } = await r.json(); assert.ok(token);
  r = await admin(get('/api/admin/leads', token), ctx()); const { leads: list, stages } = await r.json();
  assert.ok(list.length >= 4); assert.deepEqual(stages, ['New', 'Contacted', 'Qualified', 'Consultation', 'Proposal', 'Negotiation', 'Won', 'Lost']); ok(`lists ${list.length} real leads across all eight pipeline stages`);
  const id = list[0].id;
  r = await admin(new Request('https://sociam.in/api/admin/leads?id=' + id, { method: 'PATCH', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify({ stage: 'Proposal', estimatedValue: 1200, expectedMrr: 150, note: 'Sent proposal', followUpAt: '2026-10-20', contacted: true }) }), ctx());
  const { lead: up } = await r.json();
  assert.equal(up.stage, 'Proposal'); assert.equal(up.expectedMrr, 150); assert.equal(up.notes.at(-1).text, 'Sent proposal'); assert.ok(up.lastContactAt);
  assert.ok(up.activity.some(a => a.text.includes('Stage New → Proposal'))); ok('updates stage, value, recurring revenue, notes and contact log with history');
  r = await admin(get('/api/admin/health', token), ctx()); const h = await r.json(); assert.equal(h.email, true); assert.equal(h.ai, false); ok('health check reports which integrations are configured');
  r = await admin(post('/api/admin/test-email', {}, { authorization: 'Bearer ' + token }), ctx()); assert.equal((await r.json()).status, 'sent'); ok('test email endpoint verifies delivery to the notification inbox');
  r = await admin(new Request('https://sociam.in/api/admin/leads?id=' + id, { method: 'DELETE', headers: { authorization: 'Bearer ' + token } }), ctx()); assert.equal(r.status, 200);
  assert.equal(leads()[`lead/${id}`], undefined); ok('deletes a lead on request (privacy)');
}

console.log('\nCurrency');
{
  mockFetch([['open.er-api.com', () => new Response(JSON.stringify({ result: 'success', time_last_update_unix: 1760227200, rates: { USD: 1, INR: 88.7, GBP: 0.75, EUR: 0.86, SAR: 3.75, AED: 3.67, CAD: 1.4, AUD: 1.53, JPY: 150 } }))]]);
  let r = await rates(new Request('https://sociam.in/api/rates')); let b = await r.json();
  assert.equal(b.rates.INR, 88.7); assert.equal(b.rates.JPY, undefined); assert.ok(b.updated); ok('fetches rates for the eight display currencies with an update time');
  mockFetch([['open.er-api.com', () => { throw new Error('network down'); }]]);
  const cache = JSON.parse(fs.readFileSync(path.join(TMP, 'cache.json'), 'utf8')); cache.rates.fetchedAt = 0; fs.writeFileSync(path.join(TMP, 'cache.json'), JSON.stringify(cache));
  r = await rates(new Request('https://sociam.in/api/rates')); b = await r.json(); assert.equal(b.stale, true); assert.equal(b.rates.INR, 88.7); ok('falls back to cached rates, marked stale, when the provider fails');
}

console.log('\nAsk Sociam');
{
  let r = await ask(post('/api/ask', { messages: [{ role: 'user', content: 'hi' }] }), ctx()); assert.equal(r.status, 503); ok('reports unavailable when no API key is set (site shows human fallback)');
  process.env.ANTHROPIC_API_KEY = 'sk-test';
  const calls = [];
  mockFetch([['api.anthropic.com', (u, o) => {
    const body = JSON.parse(o.body); calls.push(body);
    if (calls.length === 1) return new Response(JSON.stringify({ stop_reason: 'tool_use', content: [{ type: 'text', text: 'Let me check.' }, { type: 'tool_use', id: 't1', name: 'estimate_price', input: { items: ['re-website', 'connect-ai'] } }, { type: 'tool_use', id: 't2', name: 'offer_brief_form', input: { summary: 'Real estate website plus qualification', escalate: false } }, { type: 'tool_use', id: 't3', name: 'suggest_links', input: { links: [{ label: 'Pricing', href: '/pricing/' }, { label: 'Bad', href: 'https://evil.example' }] } }] }));
    return new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'The Real Estate Website starts at $300. Sociam Connect AI is quoted after a short conversation. [See pricing](/pricing/)' }] }));
  }]]);
  r = await ask(post('/api/ask', { session: 's1', page: '/', messages: [{ role: 'user', content: 'How much is a real estate website with lead qualification?' }] }), ctx()); const b = await r.json();
  assert.equal(r.status, 200); assert.ok(b.reply.includes('$300'));
  const sys = calls[0].system; assert.ok(sys.includes('Pricing — Real Estate Website') && sys.includes('Never invent prices'));
  const toolRes = JSON.parse(calls[1].messages.at(-1).content[0].content); assert.equal(toolRes.oneTimeFrom, 300); assert.equal(toolRes.items[1].amount, null);
  assert.equal(b.actions.find(a => a.type === 'lead_form').summary, 'Real estate website plus qualification');
  assert.deepEqual(b.actions.find(a => a.type === 'links').links, [{ label: 'Pricing', href: '/pricing/' }]);
  ok('grounds answers in retrieved knowledge and approved pricing');
  ok('estimate_price returns only approved amounts ($300; Connect AI as quote)');
  ok('offers a consent-based brief form instead of collecting details in chat');
  ok('filters suggested links to real site pages');
}

console.log('\nEvents');
{
  await event(post('/api/event', { name: 'cfg_start', page: 'pricing', props: { item: 're-website' } }));
  await event(post('/api/event', { name: 'Bad Name!', page: 'x' }));
  const ev = JSON.parse(fs.readFileSync(path.join(TMP, 'events.json'), 'utf8'));
  const day = Object.values(ev)[0]; assert.equal(day.total.cfg_start, 1); assert.equal(day.total['Bad Name!'], undefined);
  assert.ok(!JSON.stringify(ev).includes('203.0.113')); ok('counts events per day without storing IP addresses; rejects malformed names');
}

globalThis.fetch = realFetch;
fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\nAll ${n} checks passed.\n`);
