// GET /api/rates — indicative USD exchange rates, cached for 12 hours.
// Provider: ExchangeRate-API open access (https://www.exchangerate-api.com). No key needed; attribution shown on site.
import pricing from './_shared/pricing.gen.mjs';
import { json, log } from './_shared/http.mjs';
import { store } from './_shared/store.mjs';

const TTL = 12 * 3600 * 1000;
export default async () => {
  const s = await store('cache');
  const cached = await s.get('rates');
  if (cached && Date.now() - cached.fetchedAt < TTL) return json(200, { ...cached, stale: false }, { 'Cache-Control': 'public, max-age=3600' });
  try {
    const ctrl = AbortSignal.timeout(5000);
    const res = await fetch(`https://open.er-api.com/v6/latest/${pricing.baseCurrency}`, { signal: ctrl });
    const data = await res.json();
    if (data.result !== 'success') throw new Error('provider returned ' + data.result);
    const rates = Object.fromEntries(pricing.displayCurrencies.map(c => [c, data.rates[c]]).filter(([, v]) => typeof v === 'number'));
    const out = { base: pricing.baseCurrency, rates, updated: new Date(data.time_last_update_unix * 1000).toISOString(), fetchedAt: Date.now(), provider: 'ExchangeRate-API' };
    await s.setJSON('rates', out);
    return json(200, { ...out, stale: false }, { 'Cache-Control': 'public, max-age=3600' });
  } catch (e) {
    log('error', 'rates_failed', { error: e.message });
    if (cached) return json(200, { ...cached, stale: true }, { 'Cache-Control': 'public, max-age=600' });
    return json(200, { base: pricing.baseCurrency, rates: { [pricing.baseCurrency]: 1 }, updated: null, unavailable: true }, { 'Cache-Control': 'public, max-age=300' });
  }
};

export const config = { path: '/api/rates' };
