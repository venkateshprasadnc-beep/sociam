# sociam.in

Website, pricing configurator, lead pipeline and Ask Sociam for Sociam.
Static pages (no framework) plus a few Netlify Functions. One dependency: `@netlify/blobs`.

```
src/pages/        Pages (HTML with a <!--meta --> header). 14 core pages + 3 articles + 404
src/partials/     Shared head, header, footer
src/assets/       CSS, JS, fonts (Poppins, self-hosted), images, logo
src/static/       Copied as-is: /admin/ pipeline screen, _redirects
data/pricing.json Single source of truth for prices and scope (site, configurator, AI and server all read it)
data/scoring.json Transparent lead-priority rules
knowledge/        Approved facts Ask Sociam answers from
netlify/functions lead, rates, event, ask, admin, digest (daily)
scripts/          build.mjs, dev.mjs (local preview), test.mjs (backend tests)
archive/v1/       The previous placeholder site
```

## Run locally
```
npm install
npm test        # 27 backend checks; external services are simulated
npm run dev     # http://localhost:8888, functions run locally, leads saved to .local-data/
```
Set `ADMIN_PASSWORD=...` before `npm run dev` to use `/admin/` locally.

## Deploy on Netlify
1. Netlify → **Add new site → Import an existing project → GitHub →** this repository. Build settings come from `netlify.toml` (build `node scripts/build.mjs`, publish `dist`).
2. **Site configuration → Environment variables** — add the variables from `.env.example`:
   - `ADMIN_PASSWORD`, `SESSION_SECRET`, `RATE_SALT` (long random strings)
   - `RESEND_API_KEY`, `MAIL_FROM`, `NOTIFY_TO=venkateshprasadnc@gmail.com`
   - `ANTHROPIC_API_KEY` (and optionally `ANTHROPIC_MODEL`, `ASK_WEB_SEARCH=1`)
3. **Email (Resend):** create an account at resend.com, add the domain `sociam.in`, add the DNS records it shows (SPF, DKIM, and the recommended DMARC) at your DNS provider, wait for "Verified", then set `MAIL_FROM` to e.g. `Sociam <notifications@sociam.in>`.
4. **Domain:** Netlify → Domain management → add `sociam.in` and follow the DNS instructions. HTTPS is automatic.
5. **Verify end to end** (do not skip):
   - Open `/admin/` → sign in → **Setup** → all three integrations green.
   - **Send test email** → confirm it arrives at venkateshprasadnc@gmail.com (check spam the first time).
   - Submit the configurator once and the project brief once with your own details → both appear under **Leads** and both notification emails arrive.
   - Open Ask Sociam and ask "What does the $300 website include?"
6. **Approve package scope:** review `SCOPE-DRAFT.md`, then set `scope.status` to `"approved"` in `data/pricing.json` for each package.

## What is live vs. not built
| Area | Status |
|---|---|
| 14 pages, SEO metadata, structured data, sitemap, robots, redirects | Built |
| Configurator (business type, country, objective, conditional services) | Built; prices only from `pricing.json` |
| Currency display (8 currencies, cached 12h, stale fallback, attribution) | Built; uses ExchangeRate-API open access |
| Lead storage, validation, spam/rate limits, duplicate protection, priority | Built; tested |
| Email notifications with retries and a daily retry + digest job | Built; **needs Resend setup and a real test** |
| Pipeline (8 stages, values, recurring revenue, notes, follow-ups, delete) | Built at `/admin/` |
| Privacy-first analytics (no cookies) and overview reports | Built |
| Ask Sociam (grounded answers, pricing tool, consent-based handoff) | Built; **needs Anthropic key and a live test** |
| Online payments | Not built. Buying is scope → approval → invoice |
| WhatsApp Business / Instagram / Messenger APIs | Not built; need Meta approval |
| CRM integrations, calendar booking | Not built; scoped per client |
| Case studies / testimonials | Not shown; add only verified material |

## Editing
- **Prices, inclusions, exclusions:** `data/pricing.json`. To give a service a fixed price, add `"amount": 99` to it.
- **What Ask Sociam knows:** files in `knowledge/`. Keep them factual.
- **Lead priority:** `data/scoring.json`.
- **Copy:** `src/pages/*.html`.
