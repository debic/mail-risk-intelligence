// Run Agent A then Agent B on one seed email and print the results: `npm run try:agents -w server -- E004`
import { loadSeedEmails } from '../src/ingestion/seed.js';
import { runExtractionAgent } from '../src/agents/extractionAgent.js';
import { runRiskAgent } from '../src/agents/riskAgent.js';

const id = process.argv[2] ?? 'E001';
const email = loadSeedEmails().find((e) => e.id === id);
if (!email) {
  console.error(`No seed email with id ${id}`);
  process.exit(1);
}

try {
  const extraction = await runExtractionAgent(email);
  console.log(`Agent A (extraction) for ${id}: ${extraction.summary}`);

  const analysis = await runRiskAgent(extraction);
  console.log(`Agent B (risk) for ${id}:`);
  console.log(JSON.stringify(analysis, null, 2));
} catch (err) {
  console.error(`Agents failed for ${id}: ${(err as Error).name}: ${(err as Error).message}`);
  process.exitCode = 1;
}
