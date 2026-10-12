// POST /api/event — privacy-first counters. No cookies, IP addresses or personal data are stored.
// Counts are aggregated per day; concurrent writes can occasionally drop a count, so treat totals as approximate.
import { json, readJson } from './_shared/http.mjs';
import { store } from './_shared/store.mjs';

const NAME = /^[a-z0-9_]{2,40}$/;
const clip = (s, n) => String(s || '').replace(/[^\w\-./ ]/g, '').slice(0, n);

export default async req => {
  if (req.method !== 'POST') return new Response(null, { status: 204 });
  let b;
  try { b = await readJson(req, 4000); } catch { return new Response(null, { status: 204 }); }
  if (!NAME.test(b.name || '')) return new Response(null, { status: 204 });
  const day = new Date().toISOString().slice(0, 10);
  const s = await store('events');
  const key = `day/${day}`;
  const d = (await s.get(key)) || { day, total: {}, byPage: {}, bySource: {}, labels: {} };
  const page = clip(b.page, 40) || 'unknown';
  d.total[b.name] = (d.total[b.name] || 0) + 1;
  d.byPage[page] = d.byPage[page] || {}; d.byPage[page][b.name] = (d.byPage[page][b.name] || 0) + 1;
  if (b.name === 'page_view') { const src = clip(b.attr && b.attr.source, 60) || 'direct'; d.bySource[src] = (d.bySource[src] || 0) + 1; }
  if (b.props && (b.props.item || b.props.stage || b.props.form)) { const l = `${b.name}:${clip(b.props.item || b.props.stage || b.props.form, 40)}`; d.labels[l] = (d.labels[l] || 0) + 1; }
  await s.setJSON(key, d);
  return new Response(null, { status: 204 });
};

export const config = { path: '/api/event' };
