// Run the full pipeline (Agent A then Agent B) on one seed email: `npm run try:agents -w server -- E004`
import { loadSeedEmails } from '../src/ingestion/seed.js';
import { analyzeEmail } from '../src/agents/orchestrator.js';

const id = process.argv[2] ?? 'E001';
const email = loadSeedEmails().find((e) => e.id === id);
if (!email) {
  console.error(`No seed email with id ${id}`);
  process.exit(1);
}

const result = await analyzeEmail(email);
if (result.status === 'done') {
  console.log(`${id}: done in ${result.durationMs} ms`);
  console.log(`Summary: ${result.extraction.summary}`);
  console.log(JSON.stringify(result.analysis, null, 2));
} else {
  console.log(`${id}: failed at "${result.stage}" after ${result.durationMs} ms`);
  console.log(`Error [${result.error.kind}]: ${result.error.message}`);
  console.log(`Partial extraction kept: ${result.extraction ? 'yes' : 'no'}`);
}
