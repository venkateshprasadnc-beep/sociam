import crypto from 'node:crypto';
import { store } from './store.mjs';

export const json = (status, body, headers = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
});

export async function readJson(req, maxBytes = 64_000) {
  const text = await req.text();
  if (text.length > maxBytes) throw Object.assign(new Error('Request too large'), { status: 413 });
  try { return JSON.parse(text || '{}'); } catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
}

export const sha256 = s => crypto.createHash('sha256').update(String(s)).digest('hex');

export function clientIp(req, context) {
  return (context && context.ip) || req.headers.get('x-nf-client-connection-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
}

// Fixed-window rate limit. Keys are hashed; nothing identifying is stored.
export async function rateLimit(bucket, id, limit, windowSec) {
  const s = await store('ratelimit');
  const win = Math.floor(Date.now() / 1000 / windowSec);
  const key = `${bucket}/${sha256(id + (process.env.RATE_SALT || 'sociam')).slice(0, 24)}/${win}`;
  const cur = (await s.get(key)) || { n: 0 };
  if (cur.n >= limit) return false;
  await s.setJSON(key, { n: cur.n + 1, exp: (win + 1) * windowSec });
  return true;
}

export const sameOrigin = req => {
  const origin = req.headers.get('origin');
  if (!origin) return true; // non-browser or same-origin navigation
  const allowed = (process.env.ALLOWED_ORIGINS || process.env.URL || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!allowed.length) return true;
  return allowed.some(a => origin === a) || /^https:\/\/[a-z0-9-]+--[a-z0-9-]+\.netlify\.app$/.test(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin);
};

export const log = (level, msg, data = {}) => console[level === 'error' ? 'error' : 'log'](JSON.stringify({ level, msg, ...data, at: new Date().toISOString() }));
