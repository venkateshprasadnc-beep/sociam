// POST /api/ask — Ask Sociam. Retrieval-grounded answers with validated pricing and consent-based handoff.
// Env: ANTHROPIC_API_KEY (required), ANTHROPIC_MODEL (default claude-sonnet-5-5), ASK_WEB_SEARCH=1 (optional)
import knowledge from './_shared/knowledge.gen.mjs';
import pricing from './_shared/pricing.gen.mjs';
import { priceItems } from './_shared/leads.mjs';
import { json, readJson, clientIp, rateLimit, sameOrigin, log } from './_shared/http.mjs';

const SITE_PATHS = ['/', '/pricing/', '/pricing/#configure', '/pricing/#care', '/contact/', '/website-design/', '/real-estate-websites/', '/ecommerce-websites/', '/lead-generation/', '/lead-generation/#seo', '/lead-generation/#conversion', '/sociam-connect-ai/', '/social-media-management/', '/brand-strategy/', '/about/', '/insights/', '/privacy/', '/terms/'];

/* ---------- Retrieval: BM25 over the knowledge passages ---------- */
const STOP = new Set('a an and are as at be but by can do does for from how i if in is it me my of on or our so that the this to we what when where which who why will with you your'.split(' '));
const tok = s => String(s).toLowerCase().replace(/[^a-z0-9$₹ ]+/g, ' ').split(/\s+/).filter(w => w && !STOP.has(w)).map(w => w.replace(/(ing|es|s)$/, ''));
const DOCS = knowledge.map(k => ({ ...k, toks: tok(k.title + ' ' + k.text) }));
const AVG = DOCS.reduce((a, d) => a + d.toks.length, 0) / DOCS.length;
const DF = {}; DOCS.forEach(d => new Set(d.toks).forEach(t => { DF[t] = (DF[t] || 0) + 1; }));
function retrieve(query, k = 6) {
  const q = [...new Set(tok(query))];
  return DOCS.map(d => {
    const tf = {}; d.toks.forEach(t => { tf[t] = (tf[t] || 0) + 1; });
    let s = 0;
    for (const t of q) { if (!tf[t]) continue; const idf = Math.log(1 + (DOCS.length - DF[t] + .5) / (DF[t] + .5)); s += idf * (tf[t] * 2.2) / (tf[t] + 1.2 * (.25 + .75 * d.toks.length / AVG)); }
    return { d, s };
  }).filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, k).map(x => x.d);
}

const SYSTEM = (passages, page) => `You are Ask Sociam, the assistant on sociam.in, the website of Sociam: a website design and business growth systems company in Bengaluru led by its founder Venkatesh (Venki). Visitors are business owners, mostly in real estate and ecommerce. The visitor is on ${page || 'the website'}.

Your job: help visitors understand their problem, find the right Sociam service, get reliable answers and take a sensible next step. Guide; never pressure.

Rules you must follow:
1. Answer only from the KNOWLEDGE below and from tool results. If something isn't covered, say plainly that you don't know and offer to pass the question to Venkatesh.
2. Prices: only the amounts in KNOWLEDGE or from the estimate_price tool. Never invent prices, discounts, page counts, revision limits, delivery times or hosting terms. If asked for limits that aren't in KNOWLEDGE, say they are confirmed in a written scope before any payment.
3. Never mention or imply clients, case studies, testimonials, results or statistics. Never claim an integration or feature exists unless KNOWLEDGE says so. Never guarantee outcomes.
4. When you recommend something, say it's your suggestion and give the reason in one line.
5. If the request is ambiguous, ask one short clarifying question.
6. Keep replies short: two to five sentences, or a short list. Plain, warm, direct language. No hype. Link pages with markdown, e.g. [pricing](/pricing/).
7. When the visitor wants to proceed, asks for a quote or a human, or has described a project, call offer_brief_form with a concise summary of what they need. Do not ask for their name, email or phone in the chat; the form collects them with consent.
8. Escalate (offer_brief_form with escalate=true) for complaints, legal or contractual questions, anything sensitive, or when you're unsure.
9. Use suggest_links to offer up to three relevant pages when helpful.
10. If web search results are used, cite them, and keep sourced facts clearly separate from Sociam's own recommendations.
11. Prices are in USD; other currencies on the site are indicative conversions. No payment is taken on the website.

KNOWLEDGE
${passages.map(p => `[${p.title}]\n${p.text}`).join('\n\n')}`;

const TOOLS = [
  { name: 'estimate_price', description: 'Compute a starting price from Sociam\'s approved pricing configuration. Use for any price question about specific packages or services. Returns only approved amounts; unpriced items are marked as quote.',
    input_schema: { type: 'object', properties: { items: { type: 'array', items: { type: 'string', enum: [...Object.keys(pricing.packages), ...Object.keys(pricing.services)] }, description: 'Package or service keys' } }, required: ['items'] } },
  { name: 'offer_brief_form', description: 'Show the visitor a short form (name, email, optional phone, consent) that sends a project brief to Venkatesh. Use when they want to proceed, want a quote or a human, or have described a project.',
    input_schema: { type: 'object', properties: { summary: { type: 'string', description: 'One or two sentences summarising what the visitor needs, in plain language' }, escalate: { type: 'boolean', description: 'True when a human should take over' }, reason: { type: 'string' } }, required: ['summary'] } },
  { name: 'suggest_links', description: 'Offer up to three relevant pages on sociam.in as buttons.',
    input_schema: { type: 'object', properties: { links: { type: 'array', maxItems: 3, items: { type: 'object', properties: { label: { type: 'string' }, href: { type: 'string', enum: SITE_PATHS } }, required: ['label', 'href'] } } }, required: ['links'] } },
];

async function callClaude(body) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal: AbortSignal.timeout(25000),
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${data.error?.message || 'error'}`);
  return data;
}

export default async (req, context) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!sameOrigin(req)) return json(403, { error: 'Forbidden' });
  if (!process.env.ANTHROPIC_API_KEY) return json(503, { error: 'Ask Sociam is not configured yet.' });
  let b; try { b = await readJson(req, 40000); } catch (e) { return json(400, { error: e.message }); }
  const msgs = (Array.isArray(b.messages) ? b.messages : []).slice(-16)
    .filter(m => m && typeof m.content === 'string' && m.content.trim())
    .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content.slice(0, 2000) }));
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') return json(400, { error: 'No question received.' });
  const ip = clientIp(req, context);
  if (!(await rateLimit('ask-ip', ip, 40, 3600)) || !(await rateLimit('ask-session', String(b.session || ip), 80, 86400))) return json(429, { error: 'You\'ve reached the question limit for now. Please send a project brief instead.' });

  const userText = msgs.filter(m => m.role === 'user').slice(-2).map(m => m.content).join(' ');
  const found = retrieve(userText);
  const pricingDocs = knowledge.filter(k => k.id.startsWith('pricing#'));
  const passages = [...new Map([...found, ...pricingDocs].map(p => [p.id, p])).values()];
  const tools = [...TOOLS];
  if (process.env.ASK_WEB_SEARCH === '1') tools.push({ type: 'web_search_20250305', name: 'web_search', max_uses: 2 });

  const actions = [], sources = [];
  const conv = [...msgs];
  try {
    for (let turn = 0; turn < 5; turn++) {
      const data = await callClaude({ model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5', max_tokens: 700, system: SYSTEM(passages, String(b.page || '').slice(0, 100)), tools, messages: conv });
      const toolUses = data.content.filter(c => c.type === 'tool_use');
      data.content.filter(c => c.type === 'text').forEach(c => (c.citations || []).forEach(ci => ci.url && sources.push({ title: ci.title || ci.url, url: ci.url })));
      if (data.stop_reason === 'pause_turn') { conv.push({ role: 'assistant', content: data.content }); continue; }
      if (data.stop_reason !== 'tool_use' || !toolUses.length) {
        const reply = data.content.filter(c => c.type === 'text').map(c => c.text).join('').trim();
        const pageSources = [...new Set(found.slice(0, 3).map(p => (p.text.match(/Page: (\/[^\s.]*)/) || [])[1]).filter(Boolean))].map(u => ({ title: knowledge.find(k => k.text.includes('Page: ' + u))?.title.split(' — ')[0] || u, url: u }));
        return json(200, { reply: reply || 'Sorry, I don\'t have a good answer to that. Would you like me to pass your question to Venkatesh?', actions, sources: [...new Map([...sources, ...pageSources].map(s => [s.url, s])).values()].slice(0, 4) });
      }
      conv.push({ role: 'assistant', content: data.content });
      const results = toolUses.map(t => {
        let out;
        if (t.name === 'estimate_price') { const e = priceItems(t.input.items || []); out = { ...e, note: 'Starting prices in USD. Exact scope (pages, revisions, timeline, hosting term) is confirmed in writing before payment. Third-party costs are extra.' }; }
        else if (t.name === 'offer_brief_form') { actions.push({ type: 'lead_form', summary: String(t.input.summary || '').slice(0, 400), escalate: !!t.input.escalate }); out = { shown: true, note: 'The form is now visible below your message. Tell the visitor briefly what happens next.' }; }
        else if (t.name === 'suggest_links') { const links = (t.input.links || []).filter(l => SITE_PATHS.includes(l.href)).slice(0, 3); if (links.length) actions.push({ type: 'links', links }); out = { shown: links.length }; }
        else out = { error: 'unknown tool' };
        return { type: 'tool_result', tool_use_id: t.id, content: JSON.stringify(out) };
      });
      conv.push({ role: 'user', content: results });
    }
    return json(200, { reply: 'Let me pass this to Venkatesh so you get a precise answer.', actions: [{ type: 'lead_form', summary: userText.slice(0, 300), escalate: true }], sources: [] });
  } catch (e) {
    log('error', 'ask_failed', { error: e.message });
    return json(502, { error: 'Ask Sociam is temporarily unavailable.' });
  }
};

export const config = { path: '/api/ask' };
