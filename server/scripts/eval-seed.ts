// Evaluate the pipeline against the expected risk levels for the seed data (see CLAUDE.md).
// Dev tool only, not part of the app: `npm run eval -w server`
import { loadSeedEmails } from '../src/ingestion/seed.js';
import { analyzeEmail } from '../src/pipeline/orchestrator.js';

const EXPECTED: Record<string, string[]> = {
  E001: ['high'],
  E002: ['none'],
  E003: ['high'],
  E004: ['high'],
  E005: ['high'],
  E006: ['high'],
  E007: ['none'],
  E008: ['high'],
  E009: ['none'],
  E010: ['medium', 'high'],
};

// Pause between emails to stay under the free tier's per-minute limits.
const PAUSE_MS = 2000;

const rows: string[] = [];
let passed = 0;

for (const email of loadSeedEmails()) {
  const expected = EXPECTED[email.id] ?? [];
  const result = await analyzeEmail(email);

  let got: string;
  let detail: string;
  if (result.status === 'done') {
    got = result.analysis.risk.level;
    detail = result.analysis.risk.tags.join(', ') || '-';
  } else {
    got = 'FAILED';
    detail = `${result.stage}: [${result.error.kind}] ${result.error.message.slice(0, 80)}`;
  }

  const ok = expected.includes(got);
  if (ok) passed++;
  const row = `${email.id}  ${expected.join('/').padEnd(11)}  ${got.padEnd(7)}  ${ok ? 'OK  ' : 'MISS'}  ${detail}`;
  rows.push(row);
  console.log(row);

  if (!ok && result.status === 'done') {
    console.log(`      rationale: ${result.analysis.risk.rationale}`);
  }
  await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
}

console.log(`\nResult: ${passed}/${rows.length} match the expected risk level`);
process.exitCode = passed === rows.length ? 0 : 1;
