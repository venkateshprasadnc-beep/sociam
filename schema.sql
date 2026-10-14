-- Sociam D1 schema. Apply once: wrangler d1 execute sociam --remote --file=schema.sql
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT, company TEXT, country TEXT,
  need TEXT, industry TEXT, message TEXT,
  details TEXT,            -- JSON: form extras, plan selection, optional assistant transcript
  source TEXT,             -- utm_source / referring host / direct
  attribution TEXT,        -- JSON: landing page, referrer, utm_*
  page TEXT,
  idem_key TEXT UNIQUE,
  fingerprint TEXT,
  stage TEXT NOT NULL DEFAULT 'New',   -- New, Contacted, Qualified, Consultation, Proposal, Won, Lost
  deal_value REAL, deal_currency TEXT,
  owner TEXT, next_action TEXT, follow_up TEXT,
  email_status TEXT        -- pending, sent, failed, not_configured
);
CREATE INDEX IF NOT EXISTS leads_created ON leads (created_at);
CREATE INDEX IF NOT EXISTS leads_fingerprint ON leads (fingerprint, created_at);

CREATE TABLE IF NOT EXISTS email_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id TEXT NOT NULL, at TEXT NOT NULL, attempt INTEGER, ok INTEGER, status INTEGER, detail TEXT
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL, day TEXT NOT NULL, name TEXT NOT NULL, path TEXT, props TEXT
);
CREATE INDEX IF NOT EXISTS events_day ON events (day, name);

CREATE TABLE IF NOT EXISTS rate (
  key TEXT NOT NULL, day TEXT NOT NULL, n INTEGER NOT NULL,
  PRIMARY KEY (key, day)
);
