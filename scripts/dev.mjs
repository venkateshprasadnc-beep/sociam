// Local preview: serves dist/ and runs the Netlify functions in-process with file-based storage.
// Usage: npm run dev   then open http://localhost:8888
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.SOCIAM_LOCAL = '1';
process.env.SOCIAM_LOCAL_DIR ||= path.join(ROOT, '.local-data');
process.env.URL ||= 'http://localhost:8888';
if (fs.existsSync(path.join(ROOT, '.env'))) for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*([^#]*?)\s*(#.*)?$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
}
const PORT = Number(process.env.PORT || 8888);
const DIST = path.join(ROOT, 'dist');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain' };

const routes = [];
for (const f of fs.readdirSync(path.join(ROOT, 'netlify/functions')).filter(f => f.endsWith('.mjs'))) {
  const mod = await import(pathToFileURL(path.join(ROOT, 'netlify/functions', f)));
  const p = mod.config && mod.config.path; if (!p) continue;
  for (const pattern of [].concat(p)) routes.push({ re: new RegExp('^' + pattern.replace(/\*/g, '.*') + '$'), handler: mod.default });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const route = routes.find(r => r.re.test(url.pathname));
  if (route) {
    const chunks = []; for await (const c of req) chunks.push(c);
    const request = new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
    try {
      const out = await route.handler(request, { ip: req.socket.remoteAddress });
      res.writeHead(out.status, Object.fromEntries(out.headers)); res.end(Buffer.from(await out.arrayBuffer()));
    } catch (e) { console.error(e); res.writeHead(500); res.end('Function error'); }
    return;
  }
  let file = path.join(DIST, decodeURIComponent(url.pathname));
  if (!file.startsWith(DIST)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404, { 'Content-Type': TYPES['.html'] }); return res.end(fs.readFileSync(path.join(DIST, '404.html'))); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`Sociam preview on http://localhost:${PORT}  (functions: ${routes.length} routes, storage: ${process.env.SOCIAM_LOCAL_DIR})`));
