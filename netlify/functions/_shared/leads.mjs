// Lead intake: validate -> dedupe -> score -> store -> notify. Storage never depends on email.
import crypto from 'node:crypto';
import pricing from './pricing.gen.mjs';
import scoring from './scoring.gen.mjs';
import { store } from './store.mjs';
import { sha256, log } from './http.mjs';
import { sendEmail, renderEmail } from './email.mjs';

export const STAGES = ['New', 'Contacted', 'Qualified', 'Consultation', 'Proposal', 'Negotiation', 'Won', 'Lost'];
const TYPES = ['real-estate', 'ecommerce', 'other'];
const NEEDS = { website: 'Website', leads: 'Lead generation', conversion: 'Conversion', marketing: 'Brand and marketing', systems: 'Sales systems and automation', automate: 'Sales systems and automation', combine: 'Several services', care: 'Website care' };
const BUDGETS = Object.keys(scoring.points.budget);
const TIMELINES = Object.keys(scoring.points.timeline);
const FORMS = ['brief', 'configurator', 'ask-sociam'];
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validate(p) {
  const fields = {};
  const name = str(p.name, 100), email = str(p.email, 200).toLowerCase(), phone = str(p.phone, 40);
  if (!name) fields.name = 'Please tell us your name.';
  if (!email) fields.email = 'Please enter your email address.';
  else if (!EMAIL_RE.test(email)) fields.email = 'That email address looks incomplete.';
  if (phone && (phone.replace(/\D/g, '').length < 7 || phone.replace(/\D/g, '').length > 15)) fields.phone = 'Please include the full number with country code.';
  if (p.consent !== true) fields.consent = 'We need your permission to reply.';
  const form = FORMS.includes(p.form) ? p.form : 'brief';
  const businessType = TYPES.includes(p.businessType) ? p.businessType : (form === 'ask-sociam' ? 'other' : '');
  if (form !== 'ask-sociam' && !businessType) fields.businessType = 'Please choose your business type.';
  return { ok: !Object.keys(fields).length, fields, clean: { name, email, phone, form, businessType } };
}

// Prices are always recomputed here from the approved configuration. Client-sent amounts are ignored.
export function priceItems(keys) {
  const items = [];
  for (const k of new Set((Array.isArray(keys) ? keys : []).map(String))) {
    if (pricing.packages[k]) items.push({ key: k, name: pricing.packages[k].name, amount: pricing.packages[k].amount ?? null, billing: pricing.packages[k].billing });
    else if (pricing.services[k]) items.push({ key: k, name: pricing.services[k].name, amount: pricing.services[k].amount ?? null, billing: pricing.services[k].billing });
  }
  const oneTime = items.filter(i => i.billing === 'one-time' && i.amount != null).reduce((a, i) => a + i.amount, 0);
  const monthly = items.filter(i => i.billing === 'monthly' && i.amount != null).reduce((a, i) => a + i.amount, 0);
  return { items, oneTimeFrom: oneTime || null, monthlyFrom: monthly || null, currency: pricing.baseCurrency, hasQuotes: items.some(i => i.amount == null) };
}

export function score(lead) {
  const P = scoring.points, reasons = [];
  let s = 0;
  const add = (n, why) => { if (n) { s += n; reasons.push(`${why} (+${n})`); } };
  add(P.businessType[lead.businessType] || 0, `Business type: ${lead.businessType}`);
  add(P.budget[lead.budget] || 0, `Budget: ${lead.budget}`);
  add(P.timeline[lead.timeline] || 0, `Timeline: ${lead.timeline}`);
  if (lead.contact.phone) add(P.hasPhone, 'Phone provided');
  if (lead.contact.businessName) add(P.hasBusinessName, 'Business name provided');
  if ((lead.requirements || '').length >= 80) add(P.detailedRequirements, 'Detailed requirements');
  if (lead.estimate.items.length > 1) add(P.multipleServices, 'Several services');
  if (lead.form === 'configurator') add(P.fromConfigurator, 'Completed configurator');
  const level = s >= scoring.thresholds.high ? 'High' : s >= scoring.thresholds.medium ? 'Medium' : 'Low';
  return { level, score: s, reasons };
}

function nextAction(lead) {
  if (lead.escalation) return 'Reply personally today: the visitor asked Ask Sociam for a human.';
  if (lead.priority.level === 'High') return lead.contact.phone ? 'Call or WhatsApp today; offer a 20-minute scoping call.' : 'Reply today with two call slots.';
  if (lead.estimate.items.some(i => i.key === 're-website' || i.key === 'ec-website')) return 'Reply within one working day with scope questions for the package.';
  return 'Reply within one working day; ask about goals, budget and timeline.';
}
function subjectFor(lead) {
  if (lead.escalation) return 'Ask Sociam: Human Follow-up Request | Sociam';
  if (lead.businessType === 'real-estate' && lead.priority.level === 'High') return 'Qualified Real Estate Lead | Sociam';
  if (lead.estimate.items.some(i => i.key === 're-website' || i.key === 'ec-website') || lead.need === 'website') return 'New Website Enquiry | Sociam';
  if (lead.estimate.hasQuotes || ['systems', 'leads', 'combine'].includes(lead.need)) return 'New Proposal Request | Sociam';
  return 'New Contact Submission | Sociam';
}
const newId = () => { const d = new Date(); return `SOC-${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`; };

export async function createLead(payload) {
  const v = validate(payload);
  if (!v.ok) return { ok: false, status: 422, fields: v.fields, error: 'Please check the highlighted fields.' };
  const c = v.clean;
  const need = NEEDS[payload.need] ? (payload.need === 'automate' ? 'systems' : payload.need) : (payload.form === 'ask-sociam' ? 'ask' : 'website');
  const now = new Date();
  const s = await store('leads');

  // Duplicate protection: the same person, form and need within 15 minutes returns the original lead.
  const dkey = `dedupe/${sha256([c.email, c.form, need].join('|')).slice(0, 32)}`;
  const prior = await s.get(dkey);
  if (prior && Date.now() - prior.at < 15 * 60 * 1000) return { ok: true, id: prior.id, duplicate: true };

  const details = {};
  for (const k of ['role', 'projects', 'products', 'platform', 'adBudget', 'markets', 'currentTools', 'teamSize']) { const val = str(payload[k], 200); if (val) details[k] = val; }
  const services = Array.isArray(payload.services) ? payload.services : (payload.configuration && Array.isArray(payload.configuration.items) ? payload.configuration.items.map(i => i.key) : []);
  const estimate = priceItems(services);
  const a = payload.attribution && typeof payload.attribution === 'object' ? payload.attribution : {};
  const lead = {
    id: newId(), createdAt: now.toISOString(), updatedAt: now.toISOString(),
    form: c.form, page: str(payload.page, 200),
    contact: { name: c.name, email: c.email, phone: c.phone, businessName: str(payload.businessName, 160), country: str(payload.country, 80) },
    businessType: c.businessType || 'other', need, details,
    budget: BUDGETS.includes(payload.budget) ? payload.budget : 'not-sure',
    timeline: TIMELINES.includes(payload.timeline) ? payload.timeline : 'exploring',
    requirements: str(payload.requirements, 4000),
    estimate, displayCurrency: str(payload.configuration && payload.configuration.displayCurrency, 3),
    consent: { given: true, at: now.toISOString(), text: 'Sociam may contact me by email or phone about this enquiry.' },
    attribution: Object.fromEntries(Object.entries(a).filter(([k]) => /^(landing|referrer|at|utm_\w+|gclid|fbclid)$/.test(k)).map(([k, val]) => [k, str(String(val), 200)])),
    escalation: payload.escalation === true,
    transcript: Array.isArray(payload.transcript) ? payload.transcript.slice(-20).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: str(m.content, 1500) })) : undefined,
    stage: 'New', owner: process.env.PIPELINE_OWNER || 'Venkatesh',
    estimatedValue: estimate.oneTimeFrom, expectedMrr: null, lostReason: null, lastContactAt: null,
    notes: [], activity: [{ at: now.toISOString(), type: 'created', text: `Created from ${c.form}` }],
    email: { status: 'pending', attempts: 0 },
  };
  lead.priority = score(lead);
  lead.nextAction = nextAction(lead);
  const due = new Date(now); due.setUTCDate(due.getUTCDate() + (lead.priority.level === 'High' || lead.escalation ? 0 : lead.priority.level === 'Medium' ? 1 : 2));
  lead.followUpAt = due.toISOString().slice(0, 10);

  // 1. Store first. If this fails, the visitor is told it failed.
  try {
    await s.setJSON(`lead/${lead.id}`, lead);
    await s.setJSON(dkey, { id: lead.id, at: Date.now() });
  } catch (e) {
    log('error', 'lead_store_failed', { error: e.message });
    return { ok: false, status: 503, error: 'We could not save your details just now. Please try again in a minute, or email venki@sociam.in.' };
  }
  log('info', 'lead_stored', { id: lead.id, priority: lead.priority.level, form: lead.form });

  // 2. Notify. A failure here is recorded and retried by the daily job; the lead is already safe.
  const result = await notifyLead(lead);
  lead.email = { status: result.status, attempts: result.attempts, id: result.id, lastError: result.error, at: new Date().toISOString() };
  lead.activity.push({ at: new Date().toISOString(), type: 'email', text: `Notification ${result.status}${result.error ? ': ' + result.error : ''}` });
  try { await s.setJSON(`lead/${lead.id}`, lead); } catch (e) { log('error', 'lead_update_failed', { id: lead.id, error: e.message }); }
  return { ok: true, id: lead.id, priority: lead.priority.level };
}

export async function notifyLead(lead) {
  const site = process.env.URL || 'https://sociam.in';
  const money = n => (n ? '$' + n.toLocaleString('en-US') : '');
  const { text, html } = renderEmail(subjectFor(lead).replace(' | Sociam', ''), [
    ['Received', new Date(lead.createdAt).toUTCString()],
    ['Reference', lead.id],
    ['Priority', `${lead.priority.level} (score ${lead.priority.score}): ${lead.priority.reasons.join('; ')}`],
    ['Name', lead.contact.name],
    ['Email', lead.contact.email],
    ['Phone / WhatsApp', lead.contact.phone],
    ['Business', lead.contact.businessName],
    ['Country', lead.contact.country],
    ['Business type', lead.businessType],
    ['Need', NEEDS[lead.need] || lead.need],
    ['Services', lead.estimate.items.map(i => `${i.name}${i.amount ? ' (' + money(i.amount) + ')' : ' (quote)'}${i.billing === 'monthly' ? ' monthly' : ''}`).join(', ')],
    ['Priced from', lead.estimate.oneTimeFrom ? `${money(lead.estimate.oneTimeFrom)} USD one-time${lead.estimate.hasQuotes ? ' + quoted items' : ''}` : ''],
    ['Budget', lead.budget], ['Timeline', lead.timeline],
    ['Details', Object.entries(lead.details).map(([k, v]) => `${k}: ${v}`).join('\n')],
    ['Requirements', lead.requirements],
    ['Source', [lead.attribution.utm_source, lead.attribution.utm_medium, lead.attribution.utm_campaign].filter(Boolean).join(' / ') || lead.attribution.referrer || 'direct'],
    ['Landing page', lead.attribution.landing], ['Submitted from', lead.page],
    ['Ask Sociam transcript', lead.transcript ? lead.transcript.map(m => `${m.role === 'user' ? 'Visitor' : 'Ask Sociam'}: ${m.content}`).join('\n\n') : ''],
    ['Recommended next action', lead.nextAction],
  ], `Open the pipeline: ${site}/admin/\nReply directly to this email to answer ${lead.contact.name}.`);
  return sendEmail({ subject: subjectFor(lead), text, html, replyTo: lead.contact.email, idempotencyKey: `lead-${lead.id}` });
}
