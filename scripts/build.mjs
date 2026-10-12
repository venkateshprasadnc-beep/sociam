// Zero-dependency static builder for sociam.in
// - Pages live in src/pages as HTML with a <!--meta {...} --> header.
// - Shared head/header/footer live in src/partials.
// - Prices come from data/pricing.json, so the site and the configurator never disagree.
// Run: node scripts/build.mjs   (Netlify runs this automatically)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const SITE = (process.env.SITE_URL || 'https://sociam.in').replace(/\/$/, '');
const pricing = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/pricing.json'), 'utf8'));

const read = p => fs.readFileSync(p, 'utf8');
const partial = name => read(path.join(SRC, 'partials', name + '.html'));
const money = n => '$' + Number(n).toLocaleString('en-US');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p) : (p.endsWith('.html') ? [p] : []);
  });
}
function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const d of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, d.name), b = path.join(to, d.name);
    d.isDirectory() ? copyDir(a, b) : fs.copyFileSync(a, b);
  }
}

const ORG = {
  '@context': 'https://schema.org',
  '@type': 'ProfessionalService',
  '@id': SITE + '/#org',
  name: 'Sociam',
  url: SITE + '/',
  logo: SITE + '/assets/img/logo-512.png',
  slogan: 'Systems that Scale. Intelligence that Compounds.',
  description: 'Website design and business growth systems for real estate and ecommerce businesses.',
  email: 'venki@sociam.in',
  address: { '@type': 'PostalAddress', addressLocality: 'Bengaluru', addressRegion: 'Karnataka', postalCode: '560003', addressCountry: 'IN' },
  areaServed: ['IN', 'US', 'GB', 'EU', 'AE', 'SA'],
  founder: { '@type': 'Person', name: 'Venkatesh' },
};

function render(file) {
  let html = read(file);
  const m = html.match(/^<!--meta\s*([\s\S]*?)-->\s*/);
  if (!m) throw new Error('Missing <!--meta --> in ' + file);
  const meta = JSON.parse(m[1]);
  html = html.slice(m[0].length);
  const url = SITE + meta.path;
  const schema = [ORG, ...(meta.schema || [])];
  if (meta.path !== '/' && meta.crumb) {
    schema.push({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' },
      ...(meta.crumbParent ? [{ '@type': 'ListItem', position: 2, name: meta.crumbParent[0], item: SITE + meta.crumbParent[1] }] : []),
      { '@type': 'ListItem', position: meta.crumbParent ? 3 : 2, name: meta.crumb, item: url },
    ] });
  }
  let out = partial('head') + partial('header') + `<main id="main" tabindex="-1" data-page="${meta.page}">\n` + html + '\n</main>\n' + partial('footer');
  const tokens = {
    title: meta.title,
    description: meta.description,
    canonical: url,
    robots: meta.noindex ? 'noindex, nofollow' : 'index, follow',
    year: String(new Date().getFullYear()),
    schema: schema.map(s => `<script type="application/ld+json">${JSON.stringify(s)}</script>`).join('\n'),
    page: meta.page,
    ogimage: SITE + '/assets/img/og.png',
  };
  out = out.replace(/\{\{price:([a-z-]+)\}\}/g, (_, k) => { if (!pricing.packages[k]) throw new Error('Unknown price ' + k); return money(pricing.packages[k].amount); });
  out = out.replace(/\{\{(\w+)\}\}/g, (all, k) => (k in tokens ? tokens[k] : all));
  // Mark the active navigation item
  out = out.replace(/data-nav="([\w-]+)"/g, (all, k) => (meta.nav === k ? `${all} aria-current="page"` : all));
  const dest = path.join(DIST, meta.file || (meta.path.replace(/^\//, '') + 'index.html'));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, out);
  return meta;
}

// Knowledge for Ask Sociam: markdown files plus the live pricing configuration
function buildKnowledge() {
  const kdir = path.join(ROOT, 'knowledge');
  const chunks = [];
  for (const f of fs.readdirSync(kdir).filter(f => f.endsWith('.md')).sort()) {
    const text = read(path.join(kdir, f));
    // Split on second-level headings so retrieval returns focused passages
    const parts = text.split(/\n(?=## )/);
    const docTitle = (text.match(/^# (.+)/m) || [, f])[1];
    parts.forEach((p, i) => {
      const heading = (p.match(/^##? (.+)/m) || [, docTitle])[1];
      chunks.push({ id: `${f.replace('.md', '')}#${i}`, title: `${docTitle} — ${heading}`, text: p.trim() });
    });
  }
  for (const [key, pkg] of Object.entries(pricing.packages)) {
    const approved = pkg.scope.status === 'approved';
    chunks.push({
      id: 'pricing#' + key,
      title: `Pricing — ${pkg.name}`,
      text: `${pkg.name}: starts at ${money(pkg.amount)} (${pricing.baseCurrency}, ${pkg.billing}). ${pkg.summary}\nIncludes: ${pkg.includes.join('; ')}.\n` +
        (approved ? `Scope: ${Object.entries(pkg.scope).filter(([k]) => k !== 'status').map(([k, v]) => `${k}: ${v}`).join('; ')}.`
          : 'Exact limits (pages, revisions, timeline, hosting duration) are confirmed in a written scope before any payment. Do not state specific limits.'),
    });
  }
  chunks.push({ id: 'pricing#quote', title: 'Pricing — services quoted individually', text: `These services are quoted after a short conversation; there is no fixed public price: ${Object.values(pricing.services).map(s => s.name).join(', ')}.\nThird-party costs not included: ${pricing.thirdPartyCosts.join('; ')}.\nPrices are set in USD. Other currencies are indicative conversions only. Sociam does not take payment on the website; payment follows a written, agreed scope.` });
  const out = `// Generated by scripts/build.mjs — do not edit. Edit /knowledge/*.md or /data/pricing.json instead.\nexport default ${JSON.stringify(chunks, null, 1)};\n`;
  fs.writeFileSync(path.join(ROOT, 'netlify/functions/_shared/knowledge.gen.mjs'), out);
  return chunks.length;
}

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
copyDir(path.join(SRC, 'assets'), path.join(DIST, 'assets'));
copyDir(path.join(SRC, 'static'), DIST); // standalone files such as /admin/ and _redirects
fs.mkdirSync(path.join(DIST, 'data'), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'data/pricing.json'), path.join(DIST, 'data/pricing.json'));

const metas = walk(path.join(SRC, 'pages')).map(render);
const urls = metas.filter(m => !m.noindex && !m.file).map(m => `  <url><loc>${SITE}${m.path}</loc><changefreq>${m.page === 'home' ? 'weekly' : 'monthly'}</changefreq><priority>${m.page === 'home' ? '1.0' : m.priority || '0.7'}</priority></url>`);
fs.writeFileSync(path.join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);
fs.writeFileSync(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/\n\nSitemap: ${SITE}/sitemap.xml\n`);
const k = buildKnowledge();
// Server-side copies of the pricing and scoring configuration (functions never trust client prices)
for (const [name, file] of [['pricing', 'data/pricing.json'], ['scoring', 'data/scoring.json']]) {
  fs.writeFileSync(path.join(ROOT, `netlify/functions/_shared/${name}.gen.mjs`), `// Generated by scripts/build.mjs from ${file} — do not edit.\nexport default ${read(path.join(ROOT, file)).trim()};\n`);
}
console.log(`Built ${metas.length} pages, sitemap with ${urls.length} URLs, ${k} knowledge passages.`);
