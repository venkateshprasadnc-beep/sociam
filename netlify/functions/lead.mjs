// POST /api/lead — store a validated enquiry, then notify Sociam.
import { json, readJson, clientIp, rateLimit, sameOrigin, log } from './_shared/http.mjs';
import { createLead } from './_shared/leads.mjs';

export default async (req, context) => {
  if (req.method !== 'POST') return json(405, { ok: false, error: 'Method not allowed' }, { Allow: 'POST' });
  if (!sameOrigin(req)) return json(403, { ok: false, error: 'Forbidden' });
  let body;
  try { body = await readJson(req); } catch (e) { return json(e.status || 400, { ok: false, error: e.message }); }
  if (body.honeypot) { log('info', 'lead_honeypot'); return json(400, { ok: false, error: 'Submission rejected.' }); }
  if (!(await rateLimit('lead', clientIp(req, context), 8, 3600))) return json(429, { ok: false, error: 'Too many submissions from this connection. Please try again later or email venki@sociam.in.' });
  try {
    const r = await createLead(body);
    return json(r.ok ? 200 : r.status || 400, r);
  } catch (e) {
    log('error', 'lead_unhandled', { error: e.message });
    return json(500, { ok: false, error: 'Something went wrong on our side and your details were not saved. Please email venki@sociam.in.' });
  }
};

export const config = { path: '/api/lead' };
