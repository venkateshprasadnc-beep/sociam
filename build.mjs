// Cloudflare Pages build: `node build.mjs`, output directory `public`.
// Runs on every push, so publishing in the CMS (a commit to content/posts) rebuilds the site.
// Scheduled posts appear on the first build after their date; a GitHub Action triggers that build hourly.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSite } from './lib/content.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const read = p => readFileSync(join(root, p), 'utf8');
const list = (dir, ext) => existsSync(join(root, dir)) ? readdirSync(join(root, dir)).filter(f => f.endsWith(ext)).sort() : [];

const { files, live, skipped } = buildSite({
  layout: read('src/layout.html'),
  pages: list('src/pages', '.html').map(f => ({ name: f.replace(/\.html$/, ''), raw: read(`src/pages/${f}`) })),
  posts: list('content/posts', '.md').map(f => ({ file: f, raw: read(`content/posts/${f}`) })),
  now: Date.now()
});

// generated article pages are rebuilt from scratch so unpublished or renamed posts disappear
rmSync(join(root, 'public/blog'), { recursive: true, force: true });
for (const f of files) {
  const out = join(root, 'public', f.path);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, f.html);
}
console.log(`Built ${files.length} files: ${live.length} live posts.`);
for (const s of skipped) console.log(`  not published yet: ${s.slug} (${s.reason}${s.reason === 'scheduled' ? `, ${s.date}` : ''})`);
