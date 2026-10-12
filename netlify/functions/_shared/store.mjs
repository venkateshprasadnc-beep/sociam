// Storage: Netlify Blobs in production. A JSON file in .local-data when running scripts/dev.mjs.
import fs from 'node:fs';
import path from 'node:path';

const LOCAL = process.env.SOCIAM_LOCAL === '1';
const LOCAL_DIR = path.resolve(process.env.SOCIAM_LOCAL_DIR || '.local-data');

function localStore(name) {
  const file = path.join(LOCAL_DIR, name + '.json');
  const load = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; } };
  const save = d => { fs.mkdirSync(LOCAL_DIR, { recursive: true }); fs.writeFileSync(file, JSON.stringify(d, null, 1)); };
  return {
    async get(key) { const d = load(); return key in d ? structuredClone(d[key]) : null; },
    async setJSON(key, value) { const d = load(); d[key] = value; save(d); },
    async delete(key) { const d = load(); delete d[key]; save(d); },
    async list({ prefix = '' } = {}) { return { blobs: Object.keys(load()).filter(k => k.startsWith(prefix)).map(key => ({ key })) }; },
  };
}

let blobs;
export async function store(name) {
  if (LOCAL) return localStore(name);
  if (!blobs) blobs = await import('@netlify/blobs');
  const s = blobs.getStore({ name, consistency: 'strong' });
  return {
    get: key => s.get(key, { type: 'json' }),
    setJSON: (key, value) => s.setJSON(key, value),
    delete: key => s.delete(key),
    list: opts => s.list(opts),
  };
}
