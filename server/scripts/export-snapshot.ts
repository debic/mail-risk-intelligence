// Write data/seed-analysis.json from the current database: `npm run snapshot -w server`
// Run the server once with an API key first, so the seed emails are analyzed.
import { openDb } from '../src/storage/db.js';
import { createEmailRepository } from '../src/storage/emailRepository.js';
import { loadSeedEmails } from '../src/ingestion/seed.js';
import { buildSnapshot, writeSnapshot, SNAPSHOT_PATH } from '../src/pipeline/snapshot.js';
import { getModelName } from '../src/agents/groqClient.js';

const repo = createEmailRepository(openDb(process.env.DB_PATH || undefined));
const ids = loadSeedEmails().map((e) => e.id);
const snapshot = buildSnapshot(repo, ids, getModelName());

const count = Object.keys(snapshot.results).length;
const missing = ids.filter((id) => !snapshot.results[id]);
writeSnapshot(snapshot);
console.log(`Wrote ${count}/${ids.length} seed analyses to ${SNAPSHOT_PATH}`);
if (missing.length) console.warn(`Not analyzed yet (skipped): ${missing.join(', ')}`);
