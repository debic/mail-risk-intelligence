import { describe, expect, it } from 'vitest';
import type { RawEmail } from '../../shared/types.js';
import type { PipelineResult } from '../src/pipeline/orchestrator.js';
import { openDb } from '../src/storage/db.js';
import { createEmailRepository, normalizeEntityKey } from '../src/storage/emailRepository.js';

const email = (id: string): RawEmail => ({
  id,
  from: 'billing@northgate-suppliers.com',
  to: ['ap@arcline.com'],
  date: '2026-06-01T00:00:00Z',
  subject: `Invoice ${id}`,
  body: 'Please pay.',
  attachments: [],
});

const done = (supplierName: string, account: string): PipelineResult => ({
  status: 'done',
  durationMs: 1,
  extraction: {
    sender: { name: null, email: 'billing@northgate-suppliers.com' },
    recipients: [],
    date: null,
    subject: 'Invoice',
    summary: 'Invoice',
    requestedActions: [],
    keyFacts: { amounts: [], dates: [], accounts: [], references: [] },
    attachments: [],
  },
  analysis: {
    risk: { level: 'high', rationale: 'Changed account.', tags: ['payment-change'] },
    entities: [
      { id: 'e1', type: 'organization', name: supplierName, details: null },
      { id: 'e2', type: 'account', name: account, details: null },
    ],
    relationships: [{ source: 'e1', target: 'e2', type: 'requests_payment_to', evidence: null }],
  },
});

describe('normalizeEntityKey', () => {
  it('ignores case, punctuation and company suffixes', () => {
    expect(normalizeEntityKey('organization', 'Northgate Suppliers Inc.')).toBe(
      normalizeEntityKey('organization', 'northgate suppliers'),
    );
  });

  it('keeps different types apart', () => {
    expect(normalizeEntityKey('person', 'Jordan')).not.toBe(normalizeEntityKey('location', 'Jordan'));
  });
});

describe('emailRepository', () => {
  it('links the same supplier across emails as one entity (knowledge graph)', () => {
    const repo = createEmailRepository(openDb(':memory:'));
    repo.insertEmail(email('E004'), 'seed');
    repo.insertEmail(email('E009'), 'seed');
    repo.saveResult('E004', done('Northgate Suppliers Inc.', 'account ending 9902'), 'test');
    repo.saveResult('E009', done('Northgate Suppliers', 'account ending 6621'), 'test');

    const supplier = repo.getEmail('E004')!.entities.find((entity) => entity.type === 'organization')!;
    expect(supplier.otherEmailIds).toEqual(['E009']);

    const graph = repo.getGraph();
    const supplierNode = graph.nodes.find((node) => node.type === 'organization')!;
    expect(supplierNode.emailIds).toEqual(['E004', 'E009']);
    expect(graph.edges).toHaveLength(2);
  });

  it('never stores the same email twice', () => {
    const repo = createEmailRepository(openDb(':memory:'));
    expect(repo.insertEmail(email('E001'), 'seed')).toBe(true);
    expect(repo.insertEmail(email('E001'), 'seed')).toBe(false);
  });
});

describe('database migrations', () => {
  it('adds prompt_version to a database created by the previous schema, and stores it', async () => {
    const { default: Database } = await import('better-sqlite3');
    const { mkdtempSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const path = join(mkdtempSync(join(tmpdir(), 'mri-')), 'old.db');
    const old = new Database(path);
    old.exec(`CREATE TABLE analyses (email_id TEXT PRIMARY KEY, extraction TEXT, risk_level TEXT, risk_rationale TEXT,
      risk_tags TEXT NOT NULL DEFAULT '[]', model TEXT, duration_ms INTEGER, analyzed_at TEXT NOT NULL)`);
    old.close();

    const repo = createEmailRepository(openDb(path));
    repo.insertEmail(email('E004'), 'seed');
    repo.saveResult('E004', done('Northgate Suppliers', 'account ending 9902'), 'test-model', 'extraction-v2+risk-v5');
    expect(repo.getEmail('E004')!.analysis).toMatchObject({ model: 'test-model', promptVersion: 'extraction-v2+risk-v5' });
  });
});
