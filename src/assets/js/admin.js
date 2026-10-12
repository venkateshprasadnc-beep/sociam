/* Sociam pipeline — founder's lead management. Reads and writes only real stored data. */
(() => {
'use strict';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => (n || n === 0) && n !== null ? '$' + Number(n).toLocaleString('en-US') : '—';
const dt = s => s ? new Date(s).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const today = () => new Date().toISOString().slice(0, 10);
let token = sessionStorage.getItem('sociam.admin') || '';
let LEADS = [], STAGES = [];

async function api(path, opts = {}) {
  const res = await fetch('/api/admin/' + path, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token, ...(opts.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== 'login') { signOut(); throw new Error('Session expired'); }
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}
function signOut() { token = ''; sessionStorage.removeItem('sociam.admin'); $('#login').hidden = false; $('#tabs').hidden = true; $('#signout').hidden = true; ['#pipeline', '#overview', '#setup'].forEach(s => { $(s).hidden = true; }); }
$('#signout').addEventListener('click', signOut);
$('#login').addEventListener('submit', async e => {
  e.preventDefault(); $('#login-msg').textContent = '';
  try { const r = await api('login', { method: 'POST', body: JSON.stringify({ password: $('#pw').value }) }); token = r.token; sessionStorage.setItem('sociam.admin', token); start(); }
  catch (err) { $('#login-msg').textContent = err.message; }
});
$$('#tabs button').forEach(b => b.addEventListener('click', () => show(b.dataset.tab)));
function show(tab) {
  $$('#tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  ['pipeline', 'overview', 'setup'].forEach(t => { $('#' + t).hidden = t !== tab; });
  if (tab === 'overview') overview(); if (tab === 'setup') setup();
}

const needsAction = l => !['Won', 'Lost'].includes(l.stage) && ((l.followUpAt && l.followUpAt <= today()) || (l.stage === 'New' && Date.now() - Date.parse(l.createdAt) > 864e5));
async function load() {
  const r = await api('leads'); LEADS = r.leads; STAGES = r.stages;
  const sel = $('#f-stage'); if (sel.options.length === 1) STAGES.forEach(s => sel.add(new Option(s, s)));
  render();
}
function render() {
  const q = $('#q').value.toLowerCase(), st = $('#f-stage').value, pr = $('#f-pri').value, due = $('#f-due').checked;
  const list = LEADS.filter(l => (st ? l.stage === st : !['Won', 'Lost'].includes(l.stage))
    && (!pr || l.priority?.level === pr) && (!due || needsAction(l))
    && (!q || [l.contact.name, l.contact.email, l.contact.businessName, l.id].join(' ').toLowerCase().includes(q)));
  $('#rows').innerHTML = list.map(l => `<tr class="lead-row${needsAction(l) ? ' due' : ''}" data-id="${esc(l.id)}" tabindex="0">
    <td>${dt(l.createdAt)}<br><span class="small muted">${esc(l.id)}</span></td>
    <td><b>${esc(l.contact.name)}</b><br><span class="small muted">${esc(l.contact.businessName || l.contact.email)}</span></td>
    <td>${esc(l.businessType)}<br><span class="small muted">${esc(l.need)}${l.escalation ? ' · human requested' : ''}</span></td>
    <td><span class="pill p-${esc(l.priority?.level)}">${esc(l.priority?.level)}</span></td>
    <td><span class="pill s-pill">${esc(l.stage)}</span></td>
    <td>${esc(l.followUpAt || '—')}</td>
    <td class="num">${money(l.estimatedValue)}${l.expectedMrr ? `<br><span class="small muted">${money(l.expectedMrr)}/mo</span>` : ''}</td>
    <td class="small e-${esc(l.email?.status)}">${esc((l.email?.status || '').replace('_', ' '))}</td></tr>`).join('');
  $('#empty').hidden = LEADS.length > 0;
  $$('tr.lead-row').forEach(tr => { tr.addEventListener('click', () => open(tr.dataset.id)); tr.addEventListener('keydown', e => { if (e.key === 'Enter') open(tr.dataset.id); }); });
  const open7 = LEADS.filter(l => Date.now() - Date.parse(l.createdAt) < 7 * 864e5).length;
  $('#kpis-top').innerHTML = [
    ['New this week', open7], ['Needs action', LEADS.filter(needsAction).length],
    ['Proposals outstanding', LEADS.filter(l => ['Proposal', 'Negotiation'].includes(l.stage)).length],
    ['Won', LEADS.filter(l => l.stage === 'Won').length],
    ['Recurring (won)', money(LEADS.filter(l => l.stage === 'Won').reduce((a, l) => a + (l.expectedMrr || 0), 0)) + '/mo'],
  ].map(([k, v]) => `<div class="kpi"><span>${k}</span><b>${v}</b></div>`).join('');
}
['#q', '#f-stage', '#f-pri', '#f-due'].forEach(s => $(s).addEventListener('input', render));
$('#reload').addEventListener('click', load);

function open(id) {
  const l = LEADS.find(x => x.id === id); if (!l) return;
  const d = $('#drawer'); d.hidden = false;
  const phone = (l.contact.phone || '').replace(/[^\d+]/g, '');
  d.innerHTML = `<div style="display:flex;justify-content:space-between;gap:12px;align-items:start"><div><p class="small muted">${esc(l.id)} · ${dt(l.createdAt)}</p><h2>${esc(l.contact.name)}</h2><p class="muted">${esc(l.contact.businessName || '')}</p></div><button class="btn btn-quiet btn-sm" id="d-x">Close</button></div>
  <div class="cta-row" style="margin-top:8px"><a class="btn btn-ghost btn-sm" href="mailto:${esc(l.contact.email)}?subject=${encodeURIComponent('Your enquiry with Sociam (' + l.id + ')')}">Email</a>${phone ? `<a class="btn btn-ghost btn-sm" href="tel:${esc(phone)}">Call</a><a class="btn btn-ghost btn-sm" href="https://wa.me/${esc(phone.replace('+', ''))}" target="_blank" rel="noopener">WhatsApp</a>` : ''}</div>
  <dl class="dl"><dt>Email</dt><dd>${esc(l.contact.email)}</dd><dt>Phone</dt><dd>${esc(l.contact.phone || '—')}</dd><dt>Country</dt><dd>${esc(l.contact.country || '—')}</dd>
  <dt>Business type</dt><dd>${esc(l.businessType)}</dd><dt>Need</dt><dd>${esc(l.need)}</dd>
  <dt>Services</dt><dd>${l.estimate.items.map(i => `${esc(i.name)} (${i.amount ? money(i.amount) : 'quote'}${i.billing === 'monthly' ? '/mo' : ''})`).join('<br>') || '—'}</dd>
  <dt>Budget · timeline</dt><dd>${esc(l.budget)} · ${esc(l.timeline)}</dd>
  ${Object.entries(l.details || {}).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}
  <dt>Requirements</dt><dd>${esc(l.requirements || '—')}</dd>
  <dt>Priority</dt><dd><span class="pill p-${esc(l.priority.level)}">${esc(l.priority.level)}</span> score ${l.priority.score}<br><span class="small muted">${esc(l.priority.reasons.join('; '))}</span></dd>
  <dt>Source</dt><dd>${esc([l.attribution.utm_source, l.attribution.utm_medium, l.attribution.utm_campaign].filter(Boolean).join(' / ') || l.attribution.referrer || 'direct')}<br><span class="small muted">Landing ${esc(l.attribution.landing || '—')} · form on ${esc(l.page || '—')}</span></dd>
  <dt>Consent</dt><dd>${l.consent?.given ? 'Given ' + dt(l.consent.at) : '—'}</dd>
  <dt>Notification</dt><dd class="e-${esc(l.email?.status)}">${esc(l.email?.status)} ${l.email?.lastError ? '· ' + esc(l.email.lastError) : ''} <button class="btn btn-quiet btn-sm" id="d-resend">Resend</button></dd></dl>
  ${l.transcript ? `<div class="sect"><h3>Ask Sociam transcript</h3>${l.transcript.map(m => `<div class="note"><b>${m.role === 'user' ? 'Visitor' : 'Ask Sociam'}:</b> ${esc(m.content)}</div>`).join('')}</div>` : ''}
  <form class="sect" id="d-form">
    <h3>Pipeline</h3>
    <div class="two">
      <div class="field"><label for="d-stage">Stage</label><select class="select" id="d-stage">${STAGES.map(s => `<option${s === l.stage ? ' selected' : ''}>${s}</option>`).join('')}</select></div>
      <div class="field"><label for="d-follow">Follow-up date</label><input class="input" type="date" id="d-follow" value="${esc(l.followUpAt || '')}"></div>
      <div class="field"><label for="d-val">Estimated deal value (USD)</label><input class="input" inputmode="decimal" id="d-val" value="${l.estimatedValue ?? ''}"></div>
      <div class="field"><label for="d-mrr">Expected recurring (USD/month)</label><input class="input" inputmode="decimal" id="d-mrr" value="${l.expectedMrr ?? ''}"></div>
      <div class="field"><label for="d-owner">Owner</label><input class="input" id="d-owner" value="${esc(l.owner || '')}"></div>
      <div class="field"><label for="d-lost">Reason lost</label><input class="input" id="d-lost" value="${esc(l.lostReason || '')}"></div>
    </div>
    <div class="field"><label for="d-next">Next action</label><input class="input" id="d-next" value="${esc(l.nextAction || '')}"></div>
    <div class="field"><label for="d-note">Add a note</label><textarea class="textarea" id="d-note" rows="3"></textarea></div>
    <label class="small"><input type="checkbox" id="d-contacted"> I contacted them today</label>
    <div class="cta-row"><button class="btn btn-primary btn-sm" type="submit">Save</button><span class="small" id="d-msg"></span></div>
  </form>
  <div class="sect"><h3>Notes and activity</h3>${[...(l.notes || []).map(n => ({ ...n, type: 'note' })), ...(l.activity || [])].sort((a, b) => b.at.localeCompare(a.at)).map(a => `<div class="${a.type === 'note' ? 'note' : 'small muted'}">${dt(a.at)} · ${esc(a.text)}</div>`).join('')}</div>
  <div class="sect"><h3>Privacy</h3><div class="confirm" id="d-del-wrap"><button class="btn btn-quiet btn-sm" id="d-del">Delete this lead permanently</button></div></div>`;
  $('#d-x').addEventListener('click', () => { d.hidden = true; });
  $('#d-resend').addEventListener('click', async e => { e.target.disabled = true; try { const r = await api('resend?id=' + encodeURIComponent(l.id), { method: 'POST' }); Object.assign(l, { email: r.email }); open(l.id); render(); } catch (err) { e.target.disabled = false; e.target.textContent = err.message; } });
  $('#d-del').addEventListener('click', () => {
    $('#d-del-wrap').innerHTML = `<span class="small">Delete ${esc(l.contact.name)}'s record? This cannot be undone.</span><button class="btn btn-dark btn-sm" id="d-del-yes">Delete</button><button class="btn btn-quiet btn-sm" id="d-del-no">Keep</button>`;
    $('#d-del-no').addEventListener('click', () => open(l.id));
    $('#d-del-yes').addEventListener('click', async () => { await api('leads?id=' + encodeURIComponent(l.id), { method: 'DELETE' }); LEADS = LEADS.filter(x => x.id !== l.id); d.hidden = true; render(); });
  });
  $('#d-form').addEventListener('submit', async e => {
    e.preventDefault(); $('#d-msg').textContent = 'Saving…';
    try {
      const r = await api('leads?id=' + encodeURIComponent(l.id), { method: 'PATCH', body: JSON.stringify({ stage: $('#d-stage').value, followUpAt: $('#d-follow').value, estimatedValue: $('#d-val').value, expectedMrr: $('#d-mrr').value, owner: $('#d-owner').value, lostReason: $('#d-lost').value, nextAction: $('#d-next').value, note: $('#d-note').value, contacted: $('#d-contacted').checked }) });
      Object.assign(l, r.lead); render(); open(l.id); $('#d-msg').textContent = 'Saved';
    } catch (err) { $('#d-msg').textContent = err.message; }
  });
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') $('#drawer').hidden = true; });

/* ---------- Overview: computed only from stored leads and counted events ---------- */
const reached = (l, stage) => { const order = STAGES.indexOf(stage); return STAGES.indexOf(l.stage) >= order && l.stage !== 'Lost' || (l.activity || []).some(a => STAGES.slice(order, 7).some(s => (a.text || '').includes('→ ' + s))); };
async function overview() {
  const el = $('#overview'); el.innerHTML = '<p class="muted">Loading…</p>';
  let ev = { days: [] }; try { ev = await api('events?days=30'); } catch {}
  const L = LEADS, n = L.length, pct = (a, b) => b ? Math.round(a / b * 100) + '%' : '—';
  const meet = L.filter(l => reached(l, 'Consultation')).length, prop = L.filter(l => reached(l, 'Proposal')).length, won = L.filter(l => l.stage === 'Won');
  const qualified = L.filter(l => reached(l, 'Qualified')).length;
  const sum = k => ev.days.reduce((a, d) => a + (d.total[k] || 0), 0);
  const bySource = {}; L.forEach(l => { const s = l.attribution.utm_source || l.attribution.referrer || 'direct'; bySource[s] = bySource[s] || { leads: 0, won: 0, value: 0 }; bySource[s].leads++; if (l.stage === 'Won') { bySource[s].won++; bySource[s].value += l.estimatedValue || 0; } });
  const visits = {}; ev.days.forEach(d => Object.entries(d.bySource || {}).forEach(([k, v]) => { visits[k] = (visits[k] || 0) + v; }));
  el.innerHTML = `
  <h2 class="h3" style="margin-bottom:6px">From your pipeline</h2><p class="small muted" style="margin-bottom:14px">Based on ${n} stored lead${n === 1 ? '' : 's'} and the stages you set. Values are your own estimates.</p>
  <div class="kpis">${[
    ['Enquiries (all time)', n], ['Qualified', qualified], ['Lead → consultation', pct(meet, n)], ['Proposal → won', pct(won.length, prop)],
    ['Average contract value', won.length ? money(Math.round(won.reduce((a, l) => a + (l.estimatedValue || 0), 0) / won.length)) : '—'],
    ['Won value', money(won.reduce((a, l) => a + (l.estimatedValue || 0), 0))], ['Recurring monthly (won)', money(won.reduce((a, l) => a + (l.expectedMrr || 0), 0))],
  ].map(([k, v]) => `<div class="kpi"><span>${k}</span><b>${v}</b></div>`).join('')}</div>
  <h2 class="h3" style="margin:28px 0 6px">Measured on the website, last 30 days</h2><p class="small muted" style="margin-bottom:14px">Anonymous daily counts, no cookies. Approximate under heavy concurrent traffic.</p>
  <div class="kpis">${[
    ['Page views', sum('page_view')], ['Configurator started', sum('cfg_start')], ['Configurator sent', sum('cfg_complete')],
    ['Forms started', sum('form_start')], ['Forms sent', sum('form_submit')], ['Ask Sociam opened', sum('ask_open')], ['Ask Sociam questions', sum('ask_message')], ['Briefs from Ask Sociam', sum('ask_lead')],
  ].map(([k, v]) => `<div class="kpi"><span>${k}</span><b>${v}</b></div>`).join('')}</div>
  <div class="two" style="margin-top:20px">
    <div class="tbl-wrap"><table><thead><tr><th>Lead source</th><th>Leads</th><th>Won</th><th>Won value</th></tr></thead><tbody>${Object.entries(bySource).sort((a, b) => b[1].leads - a[1].leads).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${v.leads}</td><td class="num">${v.won}</td><td class="num">${money(v.value)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No leads yet</td></tr>'}</tbody></table></div>
    <div class="tbl-wrap"><table><thead><tr><th>Visit source (30 days)</th><th>Page views</th></tr></thead><tbody>${Object.entries(visits).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${v}</td></tr>`).join('') || '<tr><td colspan="2" class="muted">No visits counted yet</td></tr>'}</tbody></table></div>
  </div>`;
}

/* ---------- Setup: verify integrations end to end ---------- */
async function setup() {
  const el = $('#setup'); el.innerHTML = '<p class="muted">Checking…</p>';
  const h = await api('health');
  const row = (ok, label, detail) => `<p><span class="${ok ? 'ok-dot' : 'bad-dot'}"></span><b>${label}</b> <span class="small muted">${detail}</span></p>`;
  el.innerHTML = `<div class="card" style="max-width:720px">
    <h2 class="h3">Integration status</h2>
    ${row(h.storage, 'Lead storage', h.storage ? 'Netlify Blobs reachable' : 'Storage not reachable')}
    ${row(h.email, 'Email notifications', h.email ? 'Resend key and sender set. Send a test to confirm delivery.' : 'Set RESEND_API_KEY and MAIL_FROM in Netlify')}
    <p class="small muted" style="margin-left:16px">Notifications go to ${esc(h.notifyTo)}</p>
    ${row(h.ai, 'Ask Sociam', h.ai ? 'Anthropic key set · model ' + esc(h.aiModel) + (h.webSearch ? ' · web search on' : '') : 'Set ANTHROPIC_API_KEY in Netlify')}
    <div class="sect"><h3>Email delivery test</h3>
      <p class="small">${h.lastEmailTest ? `Last test ${dt(h.lastEmailTest.at)}: <b class="e-${esc(h.lastEmailTest.status)}">${esc(h.lastEmailTest.status)}</b>${h.lastEmailTest.error ? ' · ' + esc(h.lastEmailTest.error) : ''}` : 'No test sent yet.'}</p>
      <div class="cta-row"><button class="btn btn-primary btn-sm" id="t-email">Send test email</button><span class="small" id="t-msg"></span></div>
      <p class="small muted">"sent" means Resend accepted the message. Check the inbox (and spam) to confirm it arrived.</p>
    </div></div>`;
  $('#t-email').addEventListener('click', async e => { e.target.disabled = true; $('#t-msg').textContent = 'Sending…'; try { const r = await api('test-email', { method: 'POST' }); $('#t-msg').textContent = r.status + (r.error ? ': ' + r.error : ''); } catch (err) { $('#t-msg').textContent = err.message; } e.target.disabled = false; });
}

async function start() {
  $('#login').hidden = true; $('#tabs').hidden = false; $('#signout').hidden = false; show('pipeline');
  try { await load(); } catch (e) { if (token) $('#rows').innerHTML = `<tr><td colspan="8">${esc(e.message)}</td></tr>`; }
}
if (token) start();
})();
