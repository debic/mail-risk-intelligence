import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Db = Database.Database;

export const DEFAULT_DB_PATH = fileURLToPath(new URL('../../../data/app.db', import.meta.url));

// Entities are shared across emails (unique "key"), so the knowledge graph can
// connect the same supplier, person or account seen in different emails.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS emails (
  id            TEXT PRIMARY KEY,
  source        TEXT NOT NULL,              -- seed | paste | upload
  sender        TEXT NOT NULL,
  recipients    TEXT NOT NULL,              -- JSON array
  date          TEXT NOT NULL,
  subject       TEXT NOT NULL,
  body          TEXT NOT NULL,
  attachments   TEXT NOT NULL,              -- JSON array
  status        TEXT NOT NULL,              -- queued | analyzing | done | failed
  error_stage   TEXT,
  error_kind    TEXT,
  error_message TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS analyses (
  email_id       TEXT PRIMARY KEY REFERENCES emails(id) ON DELETE CASCADE,
  extraction     TEXT,                      -- JSON, Agent A output
  risk_level     TEXT,                      -- null when Agent B failed
  risk_rationale TEXT,
  risk_tags      TEXT NOT NULL DEFAULT '[]',
  model          TEXT,
  duration_ms    INTEGER,
  analyzed_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS entities (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  key  TEXT NOT NULL UNIQUE                 -- normalized "type:name"
);

CREATE TABLE IF NOT EXISTS email_entities (
  email_id  TEXT NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  entity_id INTEGER NOT NULL REFERENCES entities(id),
  details   TEXT,
  PRIMARY KEY (email_id, entity_id)
);

CREATE TABLE IF NOT EXISTS relationships (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  email_id         TEXT NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  source_entity_id INTEGER NOT NULL REFERENCES entities(id),
  target_entity_id INTEGER NOT NULL REFERENCES entities(id),
  type             TEXT NOT NULL,
  evidence         TEXT
);

CREATE INDEX IF NOT EXISTS idx_email_entities_entity ON email_entities(entity_id);
CREATE INDEX IF NOT EXISTS idx_relationships_email ON relationships(email_id);
`;

/** Open (or create) the database and make sure the schema exists. Pass ":memory:" in tests. */
export function openDb(path: string = DEFAULT_DB_PATH): Db {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}
