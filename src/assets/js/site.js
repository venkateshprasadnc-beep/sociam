/* Sociam — site behaviour. No dependencies. */
(() => {
'use strict';
document.documentElement.classList.add('js');
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ss = { get(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch { return null; } }, set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch {} } };
const ls = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
const page = document.body.dataset.page || 'unknown';

/* ---------- Attribution (first touch in this visit) ---------- */
(function attribution() {
  if (ss.get('sociam.attr')) return;
  const q = new URLSearchParams(location.search);
  const attr = { landing: location.pathname, referrer: document.referrer ? new URL(document.referrer).hostname : '', at: new Date().toISOString() };
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid'].forEach(k => { if (q.get(k)) attr[k] = q.get(k).slice(0, 120); });
  ss.set('sociam.attr', attr);
})();
const attribution = () => ss.get('sociam.attr') || {};

/* ---------- Privacy-friendly events: no cookies, no personal data ---------- */
function track(name, props = {}) {
  const body = JSON.stringify({ name, page, props, attr: { source: attribution().utm_source || attribution().referrer || 'direct', campaign: attribution().utm_campaign || '' } });
  try { if (!navigator.sendBeacon || !navigator.sendBeacon('/api/event', new Blob([body], { type: 'application/json' }))) fetch('/api/event', { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => {}); } catch {}
  (window.dataLayer = window.dataLayer || []).push({ event: name, page, ...props });
}
track('page_view', { path: location.pathname });
document.addEventListener('click', e => { const t = e.target.closest('[data-track]'); if (t) track(t.dataset.track, { label: (t.textContent || '').trim().slice(0, 60) }); });

/* ---------- Header & navigation ---------- */
const hdr = $('#hdr');
const onScroll = () => hdr && hdr.classList.toggle('scrolled', scrollY > 8);
addEventListener('scroll', onScroll, { passive: true }); onScroll();
$$('.has-dd').forEach(item => {
  const btn = $('.nav-link', item);
  const set = open => { item.classList.toggle('open', open); btn.setAttribute('aria-expanded', String(open)); };
  btn.addEventListener('click', () => set(!item.classList.contains('open')));
  item.addEventListener('mouseenter', () => matchMedia('(hover:hover)').matches && set(true));
  item.addEventListener('mouseleave', () => matchMedia('(hover:hover)').matches && set(false));
  item.addEventListener('focusout', e => { if (!item.contains(e.relatedTarget)) set(false); });
  item.addEventListener('keydown', e => { if (e.key === 'Escape') { set(false); btn.focus(); } });
});
const menuBtn = $('.menu-btn'), mnav = $('#mnav');
if (menuBtn) menuBtn.addEventListener('click', () => {
  const open = mnav.hidden; mnav.hidden = !open; menuBtn.setAttribute('aria-expanded', String(open));
  document.body.style.overflow = open ? 'hidden' : '';
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && mnav && !mnav.hidden) { mnav.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); document.body.style.overflow = ''; menuBtn.focus(); } });

/* ---------- Reveal on scroll ---------- */
const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -10% 0px', threshold: .12 });
$$('[data-reveal], .fw.assemble, .cmp, [data-journey]').forEach(el => io.observe(el));

/* ---------- Journey: light each step in sequence when it scrolls into view ---------- */
$$('[data-journey]').forEach(ol => {
  const steps = $$('li', ol);
  const obs = new IntersectionObserver(es => { if (es[0].isIntersecting) { steps.forEach((li, i) => setTimeout(() => li.classList.add('lit'), reduced ? 0 : i * 180)); obs.disconnect(); } }, { threshold: .3 });
  obs.observe(ol);
});

/* ---------- Compare diagram: measure paths for the draw-in ---------- */
$$('.cmp .link-l').forEach(p => { try { p.style.setProperty('--len', Math.ceil(p.getTotalLength())); } catch {} });

/* ---------- The flywheel ---------- */
const STAGES = [
  { k: 'foundation', t: 'Foundation', d: 'Brand, positioning and a website that earns trust.', href: '/website-design/', cta: 'Website design' },
  { k: 'demand', t: 'Demand', d: 'Search, content, social and campaigns that bring the right people.', href: '/lead-generation/', cta: 'Lead generation' },
  { k: 'conversion', t: 'Conversion', d: 'Landing pages, qualification and follow-up that move enquiries forward.', href: '/lead-generation/#conversion', cta: 'Conversion' },
  { k: 'intelligence', t: 'Intelligence', d: 'Analytics, CRM and AI that show what is working.', href: '/sociam-connect-ai/', cta: 'Sociam Connect AI' },
  { k: 'compounding', t: 'Compounding', d: 'Retention, referrals and steady improvement.', href: '/pricing/#care', cta: 'Ongoing support' },
];
const C = 200, RO = 196, RI = 146, RT = 128, RH = 112, GAP = 1.6;
const rad = d => (d - 90) * Math.PI / 180;
const pt = (r, d) => [C + r * Math.cos(rad(d)), C + r * Math.sin(rad(d))];
function sector(a0, a1) {
  const [x0, y0] = pt(RO, a0), [x1, y1] = pt(RO, a1), [x2, y2] = pt(RI, a1), [x3, y3] = pt(RI, a0);
  return `M${x0},${y0} A${RO},${RO} 0 0 1 ${x1},${y1} L${x2},${y2} A${RI},${RI} 0 0 0 ${x3},${y3} Z`;
}
function textArc(id, a0, a1, r, flip) {
  const [x0, y0] = pt(r, flip ? a1 : a0), [x1, y1] = pt(r, flip ? a0 : a1);
  return `<path id="${id}" d="M${x0},${y0} A${r},${r} 0 0 ${flip ? 0 : 1} ${x1},${y1}" fill="none"/>`;
}
let fwCount = 0;
function buildFlywheel(host) {
  const uid = 'fw' + (++fwCount);
  const segs = STAGES.map((s, i) => {
    const a0 = i * 72 + GAP, a1 = (i + 1) * 72 - GAP, mid = (a0 + a1) / 2, flip = mid > 90 && mid < 270;
    return `<g class="fw-seg" data-i="${i}" tabindex="0" role="button" aria-label="${i + 1}. ${s.t}: ${s.d}">
      <path class="arc" d="${sector(a0, a1)}"/>
      <defs>${textArc(`${uid}-t${i}`, a0 + 4, a1 - 4, flip ? 168 : 174, flip)}</defs>
      <text dy="${flip ? 0 : 0}"><textPath href="#${uid}-t${i}" startOffset="50%" text-anchor="middle">${String(i + 1).padStart(2, '0')}  ${s.t}</textPath></text>
    </g>`;
  }).join('');
  const ticks = Array.from({ length: 60 }, (_, i) => { const [x0, y0] = pt(RT + 6, i * 6), [x1, y1] = pt(RT + (i % 12 === 0 ? 14 : 10), i * 6); return `<line class="fw-tick" x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}"/>`; }).join('');
  host.innerHTML = `<svg viewBox="0 0 400 400" aria-hidden="false" role="group" aria-label="The Sociam growth flywheel">
      <g class="fw-segs">${segs}</g>
      <circle class="fw-track" cx="200" cy="200" r="${RT}"/>
      ${ticks}
      <path class="fw-trail" fill="none" stroke="var(--olive-300)" stroke-width="2" stroke-linecap="round" d=""/>
      <circle class="fw-hub" cx="200" cy="200" r="${RH}"/>
      <circle class="fw-dot" r="6" cx="200" cy="${200 - RT}"/>
    </svg>
    <div class="fw-center" aria-live="polite"><span class="n"></span><span class="t"></span><span class="d"></span><a class="link" href="#"></a></div>`;
  const dot = $('.fw-dot', host), trail = $('.fw-trail', host), center = $('.fw-center', host);
  const list = host.dataset.list ? $(host.dataset.list) : null;
  let cur = -1, angle = 0, auto = host.hasAttribute('data-auto') && !reduced, timer = null, anim = null;
  const placeDot = a => { const [x, y] = pt(RT, a); dot.setAttribute('cx', x); dot.setAttribute('cy', y); };
  const drawTrail = a => { const from = a - 50; const [x0, y0] = pt(RT, from), [x1, y1] = pt(RT, a); trail.setAttribute('d', `M${x0},${y0} A${RT},${RT} 0 0 1 ${x1},${y1}`); };
  function moveTo(target) {
    cancelAnimationFrame(anim);
    let to = target; while (to < angle) to += 360; // always travel clockwise: momentum goes one way
    if (reduced) { angle = to % 360; placeDot(angle); drawTrail(angle); return; }
    const from = angle, dur = Math.min(1400, 300 + (to - from) * 6), t0 = performance.now();
    const step = now => { const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3); angle = from + (to - from) * e; placeDot(angle); drawTrail(angle); if (k < 1) anim = requestAnimationFrame(step); else angle %= 360; };
    anim = requestAnimationFrame(step);
  }
  function select(i, fromUser) {
    if (i === cur) return; cur = i;
    $$('.fw-seg', host).forEach((g, k) => g.classList.toggle('on', k === i));
    const s = STAGES[i];
    $('.n', center).textContent = `Stage ${i + 1} of 5`;
    $('.t', center).textContent = s.t;
    $('.d', center).textContent = s.d;
    const a = $('a', center); a.textContent = s.cta + ' →'; a.href = s.href;
    moveTo(i * 72 + 36);
    if (list) $$('.stage-btn', list).forEach((b, k) => b.setAttribute('aria-pressed', String(k === i)));
    if (fromUser) { stopAuto(); track('flywheel_stage', { stage: s.k }); }
  }
  function stopAuto() { auto = false; clearInterval(timer); }
  $$('.fw-seg', host).forEach(g => {
    const i = +g.dataset.i;
    g.addEventListener('click', () => select(i, true));
    g.addEventListener('mouseenter', () => matchMedia('(hover:hover)').matches && select(i, true));
    g.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(i, true); }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); const n = (i + 1) % 5; select(n, true); $$('.fw-seg', host)[n].focus(); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); const n = (i + 4) % 5; select(n, true); $$('.fw-seg', host)[n].focus(); }
    });
  });
  if (list) $$('.stage-btn', list).forEach((b, k) => b.addEventListener('click', () => select(k, true)));
  placeDot(0); select(0, false);
  if (auto) {
    const vis = new IntersectionObserver(es => { clearInterval(timer); if (es[0].isIntersecting && auto) timer = setInterval(() => select((cur + 1) % 5, false), 3400); });
    vis.observe(host);
  }
}
$$('[data-flywheel]').forEach(buildFlywheel);

/* ---------- Currency: indicative conversions from USD ---------- */
const CUR_SYMBOL = { USD: '$', INR: '₹', GBP: '£', EUR: '€', SAR: 'SAR ', AED: 'AED ', CAD: 'CA$', AUD: 'A$' };
let ratesPromise = null;
function getRates() {
  if (!ratesPromise) ratesPromise = fetch('/api/rates').then(r => r.ok ? r.json() : null).catch(() => null);
  return ratesPromise;
}
function fmt(amount, cur) {
  const n = cur === 'USD' ? amount : Math.round(amount / (amount > 2000 ? 100 : 10)) * (amount > 2000 ? 100 : 10);
  return (CUR_SYMBOL[cur] || cur + ' ') + Math.round(n).toLocaleString(cur === 'INR' ? 'en-IN' : 'en-US');
}
const currency = { get: () => ls.get('sociam.cur') || 'USD', set: c => { ls.set('sociam.cur', c); document.dispatchEvent(new CustomEvent('currency', { detail: c })); } };
async function paintAltPrices() {
  const cur = currency.get();
  $$('[data-cur-select]').forEach(s => { s.value = cur; });
  const els = $$('[data-usd]');
  if (!els.length) return;
  if (cur === 'USD') { els.forEach(el => { el.textContent = ''; }); return; }
  const r = await getRates();
  els.forEach(el => {
    const rate = r && r.rates && r.rates[cur];
    el.textContent = rate ? `≈ ${fmt(+el.dataset.usd * rate, cur)} · indicative` : 'Conversion unavailable right now';
  });
  $$('[data-fx-note]').forEach(n => { n.innerHTML = r && r.updated ? `Prices are set in USD. Conversions are indicative, using rates updated ${esc(new Date(r.updated).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }))}${r.stale ? ' (cached)' : ''}. <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener">Rates by Exchange Rate API</a>` : 'Prices are set in USD. Live conversion rates are unavailable right now.'; });
}
$$('[data-cur-select]').forEach(s => s.addEventListener('change', () => { currency.set(s.value); track('currency_change', { currency: s.value }); }));
document.addEventListener('currency', paintAltPrices);
paintAltPrices();

/* ---------- Lead submission (shared by every form) ---------- */
async function submitLead(payload) {
  const body = { ...payload, attribution: attribution(), page: location.pathname, submittedAt: new Date().toISOString() };
  try {
    const res = await fetch('/api/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) return { ok: true, id: data.id, duplicate: data.duplicate };
    return { ok: false, error: data.error || 'We could not save your details. Please try again, or email venki@sociam.in.', fields: data.fields || {} };
  } catch {
    return { ok: false, error: 'We could not reach our server. Check your connection and try again, or email venki@sociam.in.' };
  }
}

/* ---------- Generic project brief forms ---------- */
function setErr(form, name, msg) {
  const input = form.elements[name]; if (!input) return;
  const field = (input.length && !input.tagName ? input[0] : input).closest('.field'); if (!field) return;
  field.classList.toggle('err', !!msg);
  const m = $('.msg', field); if (m) m.textContent = msg || '';
}
function validateBrief(form) {
  let ok = true; const f = form.elements;
  const req = (n, msg) => { const v = (f[n] && f[n].value || '').trim(); if (!v) { setErr(form, n, msg); ok = false; } else setErr(form, n, ''); return v; };
  req('name', 'Please tell us your name.');
  const email = req('email', 'Please enter your email address.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { setErr(form, 'email', 'That email address looks incomplete.'); ok = false; }
  if (f.phone && f.phone.value.trim() && f.phone.value.replace(/\D/g, '').length < 7) { setErr(form, 'phone', 'Please include the full number with country code.'); ok = false; }
  if (f.businessType && !form.querySelector('[name="businessType"]:checked') && f.businessType.tagName !== 'SELECT') { setErr(form, 'businessType', 'Please choose one.'); ok = false; }
  if (f.consent && !f.consent.checked) { setErr(form, 'consent', 'We need your permission to reply.'); ok = false; } else if (f.consent) setErr(form, 'consent', '');
  return ok;
}
function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.type === 'submit' || el.name === 'website') continue;
    if (el.type === 'checkbox' && el.name !== 'consent') { if (el.checked) (out[el.name] = out[el.name] || []).push(el.value); continue; }
    if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; continue; }
    if (el.name === 'consent') { out.consent = el.checked; continue; }
    out[el.name] = el.value.trim();
  }
  out.honeypot = form.elements.website ? form.elements.website.value : '';
  return out;
}
function bindBriefForm(form, extra = () => ({})) {
  let started = false;
  form.addEventListener('input', () => { if (!started) { started = true; track('form_start', { form: form.dataset.form }); } }, { once: false });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (form.dataset.busy) return;
    if (!validateBrief(form)) { const bad = $('.field.err input, .field.err select, .field.err textarea', form); if (bad) bad.focus(); return; }
    form.dataset.busy = '1';
    const btn = $('[type=submit]', form), label = btn.innerHTML; btn.disabled = true; btn.textContent = 'Sending…';
    const payload = { form: form.dataset.form, ...formData(form), ...extra() };
    const res = await submitLead(payload);
    delete form.dataset.busy; btn.disabled = false; btn.innerHTML = label;
    const status = $(form.dataset.status) || form.nextElementSibling;
    if (res.ok) {
      track('form_submit', { form: form.dataset.form, services: (payload.services || []).length });
      form.hidden = true;
      status.hidden = false; status.className = 'status ok';
      status.innerHTML = `<h3>Thank you${payload.name ? ', ' + esc(payload.name.split(' ')[0]) : ''}. Your brief is with Sociam.</h3><p class="body">You'll get a reply from Venkatesh within one working day, usually sooner. Nothing is booked or charged; the next step is a short conversation and a written scope.</p><p class="small muted">Reference: ${esc(res.id)}</p>`;
      status.tabIndex = -1; status.focus();
    } else {
      Object.entries(res.fields || {}).forEach(([k, v]) => setErr(form, k, v));
      status.hidden = false; status.className = 'status bad';
      status.innerHTML = `<h3>Your brief was not sent.</h3><p class="body">${esc(res.error)}</p>`;
      track('form_error', { form: form.dataset.form });
    }
  });
}
// Conditional fields: show only what matters for the chosen business type and need
function bindConditional(form) {
  const update = () => {
    const type = (form.querySelector('[name="businessType"]:checked') || form.elements.businessType || {}).value || '';
    const need = (form.querySelector('[name="need"]:checked') || form.elements.need || {}).value || '';
    $$('[data-show-type]', form).forEach(el => { el.hidden = !el.dataset.showType.split(' ').includes(type); });
    $$('[data-show-need]', form).forEach(el => { el.hidden = !el.dataset.showNeed.split(' ').includes(need); });
  };
  form.addEventListener('change', update); update();
}
$$('form[data-form]').forEach(f => { bindConditional(f); if (!f.dataset.custom) bindBriefForm(f); });
// Prefill from query string (e.g. /contact/?need=leads&type=real-estate)
(function prefill() {
  const q = new URLSearchParams(location.search), f = $('form[data-form="brief"]'); if (!f) return;
  const set = (name, v) => { const el = f.querySelector(`[name="${name}"][value="${CSS.escape(v)}"]`); if (el) { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); } };
  if (q.get('type')) set('businessType', q.get('type'));
  if (q.get('need')) set('need', q.get('need'));
})();

/* Expose for the configurator */
window.Sociam = { track, submitLead, getRates, fmt, currency, esc, attribution, validateBrief, formData, setErr, paintAltPrices };
document.dispatchEvent(new Event('sociam:ready'));

/* ---------- Ask Sociam ---------- */
const ask = $('#ask'), log = $('#ask-log'), askForm = $('#ask-form'), input = $('#ask-input');
const history = ss.get('sociam.ask') || [];
const sessionId = ss.get('sociam.askid') || (() => { const id = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()) + Math.random(); ss.set('sociam.askid', id); return id; })();
function bubble(cls, html) { const d = document.createElement('div'); d.className = 'msg ' + cls; d.innerHTML = html; log.appendChild(d); log.scrollTop = log.scrollHeight; return d; }
function linkify(t) {
  return esc(t)
    .replace(/\[([^\]]+)\]\((\/[^)\s]*|https?:\/\/[^)\s]+)\)/g, (_, txt, url) => `<a href="${url}"${url.startsWith('http') ? ' target="_blank" rel="noopener"' : ''}>${txt}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
}
function quick(items) {
  const q = document.createElement('div'); q.className = 'ask-quick';
  items.forEach(it => {
    const el = it.href ? Object.assign(document.createElement('a'), { href: it.href }) : Object.assign(document.createElement('button'), { type: 'button' });
    el.textContent = it.label;
    if (!it.href) el.addEventListener('click', () => { q.remove(); sendAsk(it.label); });
    q.appendChild(el);
  });
  log.appendChild(q); log.scrollTop = log.scrollHeight;
}
function greet() {
  bubble('bot', 'Hello. I can explain Sociam\'s services and pricing, help you work out what your business needs, and pass a brief to Venkatesh. What are you working on?');
  quick([{ label: 'What does a $300 real estate website include?' }, { label: 'I need more qualified property leads' }, { label: 'How does Sociam Connect AI work?' }]);
}
function openAsk() {
  ask.hidden = false; document.body.classList.add('ask-on');
  if (!log.childElementCount) { if (history.length) history.forEach(m => bubble(m.role === 'user' ? 'me' : 'bot', m.role === 'user' ? esc(m.content) : linkify(m.content))); else greet(); }
  setTimeout(() => input.focus(), 50); track('ask_open');
}
function closeAsk() { ask.hidden = true; document.body.classList.remove('ask-on'); }
$$('.ask-open').forEach(b => b.addEventListener('click', () => { if (mnav && !mnav.hidden) { mnav.hidden = true; document.body.style.overflow = ''; } openAsk(); }));
$('.ask-x').addEventListener('click', closeAsk);
ask.addEventListener('keydown', e => { if (e.key === 'Escape') closeAsk(); });
input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(140, input.scrollHeight) + 'px'; });
input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); askForm.requestSubmit(); } });
askForm.addEventListener('submit', e => { e.preventDefault(); const t = input.value.trim(); if (!t) return; input.value = ''; input.style.height = ''; sendAsk(t); });
function leadCard(summary, escalate) {
  const card = document.createElement('form'); card.className = 'lead-card'; card.noValidate = true;
  card.innerHTML = `<b>${escalate ? 'Pass this to Venkatesh' : 'Send this brief to Sociam'}</b>
    <p class="small muted">${esc(summary)}</p>
    <div class="field"><label class="sr-only" for="lc-name">Name</label><input class="input" id="lc-name" name="name" placeholder="Your name" autocomplete="name"><span class="msg"></span></div>
    <div class="field"><label class="sr-only" for="lc-email">Email</label><input class="input" id="lc-email" name="email" type="email" placeholder="Work email" autocomplete="email"><span class="msg"></span></div>
    <div class="field"><label class="sr-only" for="lc-phone">Phone or WhatsApp (optional)</label><input class="input" id="lc-phone" name="phone" type="tel" placeholder="Phone or WhatsApp (optional)" autocomplete="tel"><span class="msg"></span></div>
    <div class="field"><label class="consent"><input type="checkbox" name="consent"> <span>Sociam may contact me about this enquiry.</span></label><span class="msg"></span></div>
    <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
    <button class="btn btn-primary btn-sm" type="submit">Send brief</button>`;
  card.addEventListener('submit', async e => {
    e.preventDefault();
    if (!validateBrief(card)) return;
    const btn = $('button', card); btn.disabled = true; btn.textContent = 'Sending…';
    const d = formData(card);
    const res = await submitLead({ form: 'ask-sociam', ...d, requirements: summary, escalation: !!escalate, transcript: history.slice(-20) });
    if (res.ok) { card.innerHTML = `<b>Sent.</b><p class="small">Venkatesh will reply within one working day. Reference ${esc(res.id)}.</p>`; track('ask_lead', { escalate: !!escalate }); }
    else { btn.disabled = false; btn.textContent = 'Send brief'; const p = document.createElement('p'); p.className = 'small'; p.style.color = 'var(--err)'; p.textContent = res.error; card.appendChild(p); }
  });
  log.appendChild(card); log.scrollTop = log.scrollHeight;
}
let asking = false;
async function sendAsk(text) {
  if (asking) return; asking = true;
  bubble('me', esc(text)); history.push({ role: 'user', content: text }); ss.set('sociam.ask', history.slice(-30));
  const typing = bubble('bot', '<span class="typing"><i></i><i></i><i></i></span>');
  track('ask_message');
  try {
    const res = await fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session: sessionId, page: location.pathname, messages: history.slice(-16) }) });
    const data = await res.json().catch(() => ({}));
    typing.remove();
    if (!res.ok || !data.reply) throw new Error(data.error || 'unavailable');
    const b = bubble('bot', linkify(data.reply));
    if (data.sources && data.sources.length) b.insertAdjacentHTML('beforeend', `<span class="src">Sources: ${data.sources.map(s => s.url ? `<a href="${esc(s.url)}"${s.url.startsWith('http') ? ' target="_blank" rel="noopener"' : ''}>${esc(s.title)}</a>` : esc(s.title)).join(' · ')}</span>`);
    history.push({ role: 'assistant', content: data.reply }); ss.set('sociam.ask', history.slice(-30));
    (data.actions || []).forEach(a => {
      if (a.type === 'lead_form') leadCard(a.summary || 'Your enquiry', a.escalate);
      if (a.type === 'links') quick(a.links.map(l => ({ label: l.label, href: l.href })));
    });
  } catch {
    typing.remove();
    bubble('bot', 'Ask Sociam is not available right now. You can still get a precise answer from a person:');
    quick([{ label: 'Configure a website', href: '/pricing/#configure' }, { label: 'Send a project brief', href: '/contact/' }, { label: 'Email venki@sociam.in', href: 'mailto:venki@sociam.in' }]);
    history.pop(); ss.set('sociam.ask', history);
  }
  asking = false;
}
})();
