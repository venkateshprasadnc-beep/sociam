# Sociam website

Static site + Cloudflare Pages Functions. No framework.

```
src/layout.html, src/pages/*.html   page sources (edit these)
build.ps1                           builds public/*.html, sitemap.xml, robots.txt
public/                             what gets deployed
public/assets/js/pricing-config.js  ALL offers, prices, scope and policies (single source of truth)
functions/api/lead.js               stores enquiries in D1, then emails a notification
functions/api/ask.js                Ask Sociam assistant (Claude), grounded in pricing-config.js
functions/api/event.js              cookieless analytics events
functions/api/admin/leads.js        pipeline API behind ADMIN_TOKEN (UI at /admin)
schema.sql, wrangler.toml           database schema and Pages config
```

## Edit and preview

```
powershell -ExecutionPolicy Bypass -File build.ps1
powershell -ExecutionPolicy Bypass -File serve.ps1     # http://localhost:4173 (pages only, no /api)
```

To run the API locally as well, install Node, then `npm install` and `npx wrangler pages dev public`.

## Changing prices or scope

Edit `public/assets/js/pricing-config.js` only. The pricing page, Premium builder, offers, scope lists and the
assistant's knowledge base all read from it. USD and INR are real prices; other currencies are indicative
conversions from USD. Offers switch off automatically after
`offerEnds`.

## Writing a blog post

Add `src/posts/<slug>.html` starting with `@title`, `@desc`, `@date` (YYYY-MM-DD), `@category` and `@dek` lines,
a blank line, then the article HTML. Run `build.ps1`. The post appears at /blog/<slug>, in the blog list and on the home page.

The static text in `src/pages/*.html` is the no-JavaScript fallback for prices and scope; keep it in step with the config.

## Before launch

1. `npm install` (pins `@anthropic-ai/sdk` and `wrangler`; commit the lockfile).
2. Done 2026-10-14: D1 database `sociam` created (APAC) and `schema.sql` applied; its id is in `wrangler.toml`.
3. Resend: verify the sociam.in domain, set `MAIL_FROM` in `wrangler.toml`,
   then `npx wrangler pages secret put RESEND_API_KEY`.
4. `npx wrangler pages secret put ANTHROPIC_API_KEY` (assistant) and
   `npx wrangler pages secret put ADMIN_TOKEN` (24+ random characters, for /admin).
5. Optional, in `pricing-config.js`: `contact.whatsapp` and `contact.bookingUrl`. Their links stay hidden while empty.
6. Deploy: `npx wrangler pages deploy public` (or connect the repo in Cloudflare Pages with output directory `public`).
7. Send one real enquiry from /contact and one plan from /pricing. Confirm the row in /admin and the email.

The previous site's `/api/venki` and `/api/venki-lead` functions are not part of this project; the new
site uses `/api/ask` and `/api/lead`.

## Not built

Payments, calendar booking, WhatsApp / Instagram / Messenger APIs, CRM sync and web search in the
assistant are not implemented. Nothing on the site claims otherwise.
