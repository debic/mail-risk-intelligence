// Storage smoke test with an in-memory database and hand-written results (no LLM calls):
// `npx tsx scripts/check-storage.ts`
import { openDb } from '../src/storage/db.js';
import { createEmailRepository } from '../src/storage/emailRepository.js';
import { loadSeedEmails } from '../src/ingestion/seed.js';
import type { PipelineResult } from '../src/agents/orchestrator.js';
import type { Extraction } from '../src/agents/schemas.js';

const repo = createEmailRepository(openDb(':memory:'));
const seeds = loadSeedEmails();
const e004 = seeds.find((e) => e.id === 'E004')!;
const e009 = seeds.find((e) => e.id === 'E009')!;

console.log('insert E004:', repo.insertEmail(e004, 'seed'));
console.log('insert E004 again (should be false):', repo.insertEmail(e004, 'seed'));
repo.insertEmail(e009, 'seed');
console.log('next queued:', repo.nextQueuedId());

const extraction = (summary: string): Extraction => ({
  sender: { name: null, email: 'billing@northgate-suppliers.com' },
  recipients: ['accounts-payable@arcline.com'],
  date: null,
  subject: 'Invoice',
  summary,
  requestedActions: [],
  keyFacts: { amounts: [], dates: [], accounts: [], references: [] },
  attachments: [],
});

const doneE004: PipelineResult = {
  status: 'done',
  durationMs: 4000,
  extraction: extraction('New bank details for invoice NS-4471'),
  analysis: {
    risk: { level: 'high', rationale: 'Bank account change with a higher amount.', tags: ['payment-change'] },
    entities: [
      { id: 'e1', type: 'organization', name: 'Northgate Suppliers Inc.', details: null },
      { id: 'e2', type: 'account', name: 'account ending 9902', details: 'new account' },
    ],
    relationships: [{ source: 'e1', target: 'e2', type: 'requests_payment_to', evidence: 'invoice' }],
  },
};

const doneE009: PipelineResult = {
  status: 'done',
  durationMs: 3500,
  extraction: extraction('Monthly invoice NS-4188'),
  analysis: {
    risk: { level: 'none', rationale: 'Routine invoice.', tags: [] },
    // Same supplier written differently: must map to the same entity.
    entities: [
      { id: 'e1', type: 'organization', name: 'Northgate Suppliers', details: null },
      { id: 'e2', type: 'account', name: 'account ending 6621', details: 'account on file' },
    ],
    relationships: [{ source: 'e1', target: 'e2', type: 'paid_to_account', evidence: 'invoice' }],
  },
};

repo.saveResult('E004', doneE004, 'test-model');
repo.saveResult('E009', doneE009, 'test-model');

const detail = repo.getEmail('E004')!;
console.log('\nE004 status:', detail.status, '| risk:', detail.risk?.level, '| tags:', detail.risk?.tags);
console.log('E004 entities:', detail.entities.map((e) => `${e.id}:${e.name}`));
console.log('E004 relationships:', detail.relationships.map((r) => `${r.source.name} -${r.type}-> ${r.target.name}`));

const supplierIds = new Set(
  [...repo.getEmail('E004')!.entities, ...repo.getEmail('E009')!.entities]
    .filter((e) => e.type === 'organization')
    .map((e) => e.id),
);
console.log('\nSupplier entity ids across E004 and E009 (should be one id):', [...supplierIds]);

const failed: PipelineResult = {
  status: 'failed',
  stage: 'risk',
  error: { kind: 'timeout', message: 'Groq did not respond within 20s' },
  extraction: extraction('Partial'),
  durationMs: 20000,
};
repo.saveResult('E009', failed, 'test-model');
const failedDetail = repo.getEmail('E009')!;
console.log('\nE009 after failure:', failedDetail.status, failedDetail.error, '| extraction kept:', Boolean(failedDetail.extraction));
console.log('\nInbox list:', repo.listEmails().map((e) => `${e.id} ${e.status} ${e.riskLevel ?? '-'}`));
