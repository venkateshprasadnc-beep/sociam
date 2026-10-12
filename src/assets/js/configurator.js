/* Sociam — pricing & service configurator.
   Reads /data/pricing.json (the same file the server and Ask Sociam use).
   Only approved amounts are priced; everything else shows "Request a quote". */
(async () => {
'use strict';
const root = document.getElementById('cfg');
if (!root) return;
// site.js defines window.Sociam; deferred scripts run in order, so wait until the document is ready
if (!window.Sociam) await new Promise(r => document.addEventListener('sociam:ready', r, { once: true }));
const { track, submitLead, getRates, fmt, currency, esc, validateBrief, formData, setErr } = window.Sociam;
const $ = (s, r = root) => r.querySelector(s);
const $$ = (s, r = root) => [...r.querySelectorAll(s)];

let P;
try { P = await (await fetch('/data/pricing.json', { cache: 'no-cache' })).json(); }
catch { root.innerHTML = '<p class="status bad">The configurator could not load. Please <a href="/contact/">send a project brief</a> instead.</p>'; return; }

const TYPES = [
  { v: 'real-estate', t: 'Real estate', d: 'Developers, builders, brokers, channel partners' },
  { v: 'ecommerce', t: 'Ecommerce', d: 'Online stores and D2C brands' },
  { v: 'other', t: 'Other business', d: 'Services, education, healthcare and more' },
];
const OBJECTIVES = [
  { v: 'website', t: 'Launch a website', d: 'A new or rebuilt website' },
  { v: 'leads', t: 'Generate qualified leads', d: 'Campaigns, landing pages, capture' },
  { v: 'conversion', t: 'Improve conversion', d: 'More results from current traffic' },
  { v: 'marketing', t: 'Strengthen brand and marketing', d: 'SEO, content, social, brand' },
  { v: 'automate', t: 'Automate sales or operations', d: 'AI, CRM, routing, reporting' },
  { v: 'combine', t: 'Combine several services', d: 'Choose from everything' },
];
const COUNTRIES = ['India', 'United States', 'United Kingdom', 'United Arab Emirates', 'Saudi Arabia', 'Qatar', 'Germany', 'France', 'Netherlands', 'Ireland', 'Canada', 'Australia', 'Singapore', 'Other'];
const COUNTRY_CUR = { India: 'INR', 'United States': 'USD', 'United Kingdom': 'GBP', 'United Arab Emirates': 'AED', 'Saudi Arabia': 'SAR', Germany: 'EUR', France: 'EUR', Netherlands: 'EUR', Ireland: 'EUR', Canada: 'CAD', Australia: 'AUD' };
const OPTIONS = { // services shown for each objective
  website: ['website-care', 'seo'],
  leads: ['landing-pages', 'lead-generation', 'lead-qualification', 'reporting'],
  conversion: ['conversion', 'landing-pages', 'lead-qualification', 'reporting'],
  marketing: ['seo', 'social', 'content', 'brand'],
  automate: ['connect-ai', 'crm', 'routing', 'reporting'],
  combine: Object.keys(P.services).filter(k => k !== 'custom-website'),
};
const DESC = {
  'website-care': 'Updates, security, backups and small content changes', seo: 'Search, answer-engine and AI-search visibility',
  'landing-pages': 'Focused pages for each project or campaign', 'lead-generation': 'Paid and organic campaigns aimed at real buyers',
  'lead-qualification': 'Forms and questions that sort serious enquiries', reporting: 'Clear reports on sources, leads and outcomes',
  conversion: 'Find and fix where enquiries drop off', social: 'Planning, content and publishing', content: 'Articles, guides and project content',
  brand: 'Positioning, identity and guidelines', 'connect-ai': 'AI-assisted qualification and sales intelligence', crm: 'Connect your CRM and automate workflows',
  routing: 'Route enquiries and schedule follow-ups',
};
const GROUP_NAMES = { care: 'Care', leads: 'Leads', conversion: 'Conversion', marketing: 'Marketing', ai: 'Intelligence', website: 'Website' };
const state = { type: '', country: '', objective: '', pkg: '', services: new Set() };

/* ---------- Render ---------- */
const tile = (name, v, t, d, extra = '', type = 'radio', checked = false) => `<div class="opt-tile"><input type="${type}" name="${name}" id="${name}-${v}" value="${v}"${checked ? ' checked' : ''}><label for="${name}-${v}"><b>${esc(t)}</b><span>${esc(d)}</span>${extra}</label></div>`;
root.innerHTML = `
<div class="cfg">
  <div class="cfg-steps">
    <section class="step" aria-labelledby="s1h">
      <div class="step-h"><span class="step-n">1</span><div><h3 id="s1h">Your business</h3><p>What kind of business, and where are you based?</p></div></div>
      <div class="opts" role="radiogroup" aria-labelledby="s1h">${TYPES.map(o => tile('type', o.v, o.t, o.d)).join('')}</div>
      <div class="field" style="max-width:320px"><label for="cfg-country">Country</label><select class="select" id="cfg-country"><option value="">Choose a country</option>${COUNTRIES.map(c => `<option>${c}</option>`).join('')}</select></div>
    </section>
    <section class="step" id="s2" hidden aria-labelledby="s2h">
      <div class="step-h"><span class="step-n">2</span><div><h3 id="s2h">Your main objective</h3><p>Choose the one that matters most right now.</p></div></div>
      <div class="opts" role="radiogroup" aria-labelledby="s2h">${OBJECTIVES.map(o => tile('objective', o.v, o.t, o.d)).join('')}</div>
    </section>
    <section class="step" id="s3" hidden aria-labelledby="s3h">
      <div class="step-h"><span class="step-n">3</span><div><h3 id="s3h">Choose what you need</h3><p id="s3p">Only options relevant to your choices are shown.</p></div></div>
      <div id="s3-body" class="stack"></div>
    </section>
    <section class="step" id="s4" hidden aria-labelledby="s4h">
      <div class="step-h"><span class="step-n">4</span><div><h3 id="s4h">Send your configuration</h3><p>No payment is taken here. Venkatesh replies with a written scope and confirmed price.</p></div></div>
      <form class="form" data-form="configurator" data-custom="1" novalidate id="cfg-form">
        <div class="row">
          <div class="field"><label for="c-name">Name</label><input class="input" id="c-name" name="name" autocomplete="name" required><span class="msg"></span></div>
          <div class="field"><label for="c-email">Work email</label><input class="input" id="c-email" name="email" type="email" autocomplete="email" required><span class="msg"></span></div>
        </div>
        <div class="row">
          <div class="field"><label for="c-biz">Business name <span class="opt">(optional)</span></label><input class="input" id="c-biz" name="businessName" autocomplete="organization"><span class="msg"></span></div>
          <div class="field"><label for="c-phone">Phone or WhatsApp <span class="opt">(optional)</span></label><input class="input" id="c-phone" name="phone" type="tel" autocomplete="tel" placeholder="+91 …"><span class="msg"></span></div>
        </div>
        <div class="row">
          <div class="field"><label for="c-budget">Budget range (USD)</label><select class="select" id="c-budget" name="budget"><option value="not-sure">Not sure yet</option><option value="under-300">Under $300</option><option value="300-1000">$300 – $1,000</option><option value="1000-5000">$1,000 – $5,000</option><option value="5000-plus">$5,000+</option></select></div>
          <div class="field"><label for="c-timeline">Timeline</label><select class="select" id="c-timeline" name="timeline"><option value="1-month">Within a month</option><option value="asap">As soon as possible</option><option value="1-3-months">In 1–3 months</option><option value="exploring">Just exploring</option></select></div>
        </div>
        <div class="field" data-cfg-show="automate combine" hidden><label for="c-crm">Current CRM or tools <span class="opt">(optional)</span></label><input class="input" id="c-crm" name="currentTools" placeholder="For example Zoho, HubSpot, spreadsheets, none yet"></div>
        <div class="field"><label for="c-req">Anything we should know <span class="opt">(optional)</span></label><textarea class="textarea" id="c-req" name="requirements" rows="3" placeholder="Projects, products, markets, deadlines"></textarea></div>
        <label class="consent field"><input type="checkbox" name="consent"> <span>Sociam may contact me by email${''} or phone about this enquiry. See the <a href="/privacy/">privacy policy</a>.</span><span class="msg"></span></label>
        <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
        <div class="cta-row"><button class="btn btn-primary" type="submit">Send my configuration <i class="arr"></i></button><span class="small muted">You'll get a reply within one working day.</span></div>
      </form>
      <div class="status" id="cfg-status" hidden></div>
    </section>
  </div>
  <aside class="summary" aria-labelledby="sumh">
    <h3 id="sumh">Your configuration</h3>
    <div class="sum-lines" id="sum-lines"><p class="sum-empty">Choose your business type to begin.</p></div>
    <div class="sum-total"><span>One-time, starting from</span><b id="sum-total">—</b></div>
    <p class="sum-sub" id="sum-alt"></p>
    <div class="sum-sec" id="sum-recurring" hidden><h4>Monthly services</h4><p class="small">Quoted after a short conversation, based on scope. Nothing recurring starts without your written agreement.</p></div>
    <div class="sum-sec"><h4>Not included</h4><ul class="ticks out small">${P.thirdPartyCosts.slice(0, 4).map(t => `<li>${esc(t)}</li>`).join('')}</ul><a class="link small" href="#exclusions">All exclusions</a></div>
    <label class="cur"><span class="muted">Show in</span><select class="select" data-cur-select aria-label="Currency">${P.displayCurrencies.map(c => `<option>${c}</option>`).join('')}</select></label>
    <p class="fx-note" data-fx-note>Prices are set in USD.</p>
    <button class="btn btn-primary" type="button" id="sum-go" disabled>Continue <i class="arr"></i></button>
  </aside>
</div>`;

const s2 = $('#s2'), s3 = $('#s3'), s4 = $('#s4');
const show = el => { if (el.hidden) { el.hidden = false; el.classList.add('reveal'); } };

function renderStep3() {
  const body = $('#s3-body'); const t = state.type, o = state.objective;
  let html = '';
  if (o === 'website' || o === 'combine') {
    const pk = t === 'real-estate' ? 're-website' : t === 'ecommerce' ? 'ec-website' : '';
    const pkg = pk && P.packages[pk];
    html += `<p class="group-h">Website</p><div class="opts">`;
    if (pkg) html += tile('pkg', pk, pkg.name, pkg.summary, `<em>From ${fmt(pkg.amount, 'USD')} · one-time</em>`, 'radio', state.pkg === pk);
    html += tile('pkg', 'custom-website', 'Custom business website', 'Bespoke design, more pages or special features', '<em>Request a quote</em>', 'radio', state.pkg === 'custom-website');
    if (o === 'combine') html += tile('pkg', 'none', 'No website needed', 'I already have one', '', 'radio', state.pkg === 'none');
    html += `</div>`;
    if (pkg) {
      const approved = pkg.scope.status === 'approved';
      html += `<div class="cfg-scope card" id="pkg-scope" ${state.pkg === pk ? '' : 'hidden'}><b>Included in the ${esc(pkg.name)}</b><ul class="ticks">${pkg.includes.map(i => `<li>${esc(i)}</li>`).join('')}</ul>${approved
        ? `<dl class="kv">${['pages', 'content', 'revisions', 'timeline', 'domain', 'hosting'].map(k => pkg.scope[k] ? `<dt>${k}</dt><dd>${esc(pkg.scope[k])}</dd>` : '').join('')}</dl>`
        : '<p class="scope-note">Page count, revisions, delivery timeline and hosting term are confirmed in a written scope before you pay.</p>'}</div>`;
    }
  }
  const keys = OPTIONS[o] || [];
  if (keys.length) {
    html += `<p class="group-h">${o === 'website' ? 'Optional additions' : o === 'combine' ? 'Services' : 'Services for this objective'}</p>`;
    if (o === 'combine') {
      const groups = {}; keys.forEach(k => (groups[P.services[k].group] = groups[P.services[k].group] || []).push(k));
      html += Object.entries(groups).map(([g, ks]) => `<p class="small muted">${GROUP_NAMES[g] || g}</p><div class="opts">${ks.map(k => svcTile(k)).join('')}</div>`).join('');
    } else html += `<div class="opts">${keys.map(k => svcTile(k)).join('')}</div>`;
  }
  body.innerHTML = html;
  $$('input[name=pkg]', body).forEach(i => i.addEventListener('change', () => { state.pkg = i.value; const sc = $('#pkg-scope'); if (sc) sc.hidden = !i.value.endsWith('-website') || i.value === 'custom-website'; update(); track('cfg_select', { item: i.value }); }));
  $$('input[name=svc]', body).forEach(i => i.addEventListener('change', () => { i.checked ? state.services.add(i.value) : state.services.delete(i.value); update(); track('cfg_select', { item: i.value }); }));
  $$('[data-cfg-show]', root).forEach(el => { el.hidden = !el.dataset.cfgShow.split(' ').includes(o); });
}
function svcTile(k) {
  const s = P.services[k];
  return tile('svc', k, s.name, DESC[k] || '', `<em>${s.amount ? fmt(s.amount, 'USD') : 'Request a quote'} · ${s.billing === 'monthly' ? 'monthly' : 'one-time'}</em>`, 'checkbox', state.services.has(k));
}

/* ---------- Pricing: computed only from approved amounts ---------- */
function selection() {
  const items = [];
  if (state.pkg && state.pkg !== 'none') {
    const pkg = P.packages[state.pkg];
    items.push(pkg ? { key: state.pkg, name: pkg.name, amount: pkg.amount, billing: 'one-time' } : { key: state.pkg, name: P.services[state.pkg].name, amount: null, billing: 'one-time' });
  }
  state.services.forEach(k => { const s = P.services[k]; items.push({ key: k, name: s.name, amount: s.amount ?? null, billing: s.billing }); });
  const oneTime = items.filter(i => i.billing === 'one-time');
  const priced = oneTime.filter(i => i.amount != null).reduce((a, i) => a + i.amount, 0);
  return { items, oneTimeFrom: priced, hasQuotes: items.some(i => i.amount == null), hasMonthly: items.some(i => i.billing === 'monthly') };
}
async function update() {
  const sel = selection(), lines = $('#sum-lines');
  const head = [state.type && TYPES.find(t => t.v === state.type).t, state.country, state.objective && OBJECTIVES.find(o => o.v === state.objective).t].filter(Boolean);
  lines.innerHTML = (head.length ? `<p class="small muted">${head.map(esc).join(' · ')}</p>` : '') +
    (sel.items.length ? sel.items.map(i => `<div class="sum-line${i.amount == null ? ' quote' : ''}"><span>${esc(i.name)}<br><span class="small muted">${i.billing === 'monthly' ? 'Monthly' : 'One-time'}</span></span><span>${i.amount != null ? fmt(i.amount, 'USD') : 'Quote'}</span></div>`).join('')
      : `<p class="sum-empty">${state.objective ? 'Choose at least one option.' : state.type ? 'Now choose your main objective.' : 'Choose your business type to begin.'}</p>`);
  $('#sum-total').textContent = sel.oneTimeFrom ? fmt(sel.oneTimeFrom, 'USD') + (sel.hasQuotes ? ' + quote' : '') : (sel.items.length ? 'Quote' : '—');
  $('#sum-recurring').hidden = !sel.hasMonthly;
  const cur = currency.get(), alt = $('#sum-alt');
  alt.textContent = '';
  if (sel.oneTimeFrom && cur !== 'USD') { const r = await getRates(); const rate = r && r.rates && r.rates[cur]; alt.textContent = rate ? `≈ ${fmt(sel.oneTimeFrom * rate, cur)} · indicative conversion` : ''; }
  $('#sum-go').disabled = !sel.items.length;
}
document.addEventListener('currency', update);

/* ---------- Wiring ---------- */
let started = false;
const start = () => { if (!started) { started = true; track('cfg_start'); } };
$$('input[name=type]').forEach(i => i.addEventListener('change', () => { start(); state.type = i.value; state.pkg = ''; show(s2); if (state.objective) renderStep3(); update(); }));
$('#cfg-country').addEventListener('change', e => {
  state.country = e.target.value; start();
  if (COUNTRY_CUR[state.country] && !localStorage.getItem('sociam.cur.chosen')) currency.set(COUNTRY_CUR[state.country]);
  update();
});
$$('[data-cur-select]', root).forEach(s => s.addEventListener('change', () => { try { localStorage.setItem('sociam.cur.chosen', '1'); } catch {} }));
$$('input[name=objective]').forEach(i => i.addEventListener('change', () => {
  state.objective = i.value; state.services.clear();
  state.pkg = i.value === 'website' ? (state.type === 'real-estate' ? 're-website' : state.type === 'ecommerce' ? 'ec-website' : 'custom-website') : '';
  show(s3); renderStep3(); update();
}));
$('#sum-go').addEventListener('click', () => { show(s4); s4.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); setTimeout(() => $('#c-name').focus({ preventScroll: true }), 400); track('cfg_continue'); });

const form = $('#cfg-form');
form.addEventListener('submit', async e => {
  e.preventDefault();
  if (form.dataset.busy) return;
  if (!state.type) { alertStatus('Please choose your business type in step 1.'); return; }
  if (!validateBrief(form)) { const bad = form.querySelector('.field.err input'); if (bad) bad.focus(); return; }
  form.dataset.busy = '1';
  const btn = form.querySelector('[type=submit]'); const label = btn.innerHTML; btn.disabled = true; btn.textContent = 'Sending…';
  const sel = selection();
  const res = await submitLead({
    form: 'configurator', ...formData(form),
    businessType: state.type, country: state.country, need: state.objective,
    services: sel.items.map(i => i.key),
    configuration: { items: sel.items, displayCurrency: currency.get() },
  });
  delete form.dataset.busy; btn.disabled = false; btn.innerHTML = label;
  const st = $('#cfg-status');
  if (res.ok) {
    track('cfg_complete', { items: sel.items.length });
    form.hidden = true; st.hidden = false; st.className = 'status ok';
    st.innerHTML = `<h3>Configuration received.</h3><p class="body">Venkatesh will reply within one working day with questions or a written scope. Nothing is booked or charged until you approve that scope.</p><p class="small muted">Reference: ${esc(res.id)}</p>`;
    st.tabIndex = -1; st.focus();
  } else {
    Object.entries(res.fields || {}).forEach(([k, v]) => setErr(form, k, v));
    alertStatus(res.error);
  }
});
function alertStatus(msg) { const st = $('#cfg-status'); st.hidden = false; st.className = 'status bad'; st.innerHTML = `<h3>Not sent yet.</h3><p class="body">${esc(msg)}</p>`; }

// Deep links: /pricing/?type=real-estate&need=website#configure
const q = new URLSearchParams(location.search);
const pre = (name, v) => { const el = root.querySelector(`input[name="${name}"][value="${CSS.escape(v)}"]`); if (el) { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); } };
if (q.get('type')) pre('type', q.get('type'));
if (q.get('need') && state.type) pre('objective', q.get('need') === 'systems' ? 'automate' : q.get('need'));
else if (q.get('type')) pre('objective', 'website');
window.Sociam.paintAltPrices();
update();
})();
