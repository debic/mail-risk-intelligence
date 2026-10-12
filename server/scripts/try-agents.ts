// Run the agents on one seed email and print the result: `npm run try:agents -w server -- E004`
import { loadSeedEmails } from '../src/ingestion/seed.js';
import { runExtractionAgent } from '../src/agents/extractionAgent.js';

const id = process.argv[2] ?? 'E001';
const email = loadSeedEmails().find((e) => e.id === id);
if (!email) {
  console.error(`No seed email with id ${id}`);
  process.exit(1);
}

try {
  const extraction = await runExtractionAgent(email);
  console.log(`Agent A (extraction) for ${id}:`);
  console.log(JSON.stringify(extraction, null, 2));
} catch (err) {
  console.error(`Agent A failed for ${id}: ${(err as Error).name}: ${(err as Error).message}`);
  process.exitCode = 1;
}
