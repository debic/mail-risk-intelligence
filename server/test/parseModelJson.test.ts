import { describe, expect, it } from 'vitest';
import { InvalidOutputError, parseModelJson } from '../src/llm/parseModelJson.js';
import { ExtractionSchema, RiskAnalysisSchema } from '../src/agents/schemas.js';

const validExtraction = {
  sender: { name: null, email: 'billing@northgate-suppliers.com' },
  recipients: ['accounts-payable@arcline.com'],
  date: '2026-06-04T11:20:00Z',
  subject: 'Invoice #NS-4471',
  summary: 'Supplier asks to pay a new account.',
  requestedActions: ['Pay to the new account'],
  keyFacts: { amounts: [{ value: '$47,300', context: 'amount due' }], dates: [], accounts: [], references: [] },
  attachments: [],
};

const validRisk = {
  risk: { level: 'high', rationale: 'Bank details changed.', tags: ['Payment Change', 'urgency', 'urgency'] },
  entities: [
    { id: 'e1', type: 'organization', name: 'Northgate Suppliers Inc.', details: null },
    { id: 'e2', type: 'account', name: 'account ending 9902', details: null },
    { id: 'e3', type: 'invoice', name: 'NS-4471', details: null },
  ],
  relationships: [
    { source: 'e1', target: 'e2', type: 'Requests Payment To', evidence: 'invoice' },
    { source: 'e1', target: 'e99', type: 'mentions', evidence: null },
  ],
};

describe('parseModelJson: valid output', () => {
  it('parses a valid extraction', () => {
    const result = parseModelJson(JSON.stringify(validExtraction), ExtractionSchema);
    expect(result.summary).toBe('Supplier asks to pay a new account.');
  });

  it('accepts JSON wrapped in a markdown code fence', () => {
    const raw = '```json\n' + JSON.stringify(validExtraction) + '\n```';
    expect(parseModelJson(raw, ExtractionSchema).subject).toBe('Invoice #NS-4471');
  });

  it('fills missing optional lists with defaults', () => {
    const { keyFacts, attachments, requestedActions, ...minimal } = validExtraction;
    const result = parseModelJson(JSON.stringify(minimal), ExtractionSchema);
    expect(result.keyFacts.amounts).toEqual([]);
    expect(result.attachments).toEqual([]);
    expect(result.requestedActions).toEqual([]);
  });
});

describe('parseModelJson: garbage output', () => {
  it('rejects plain prose', () => {
    expect(() => parseModelJson('Sure! Here is the analysis you asked for.', ExtractionSchema)).toThrow(
      InvalidOutputError,
    );
  });

  it('rejects truncated JSON', () => {
    expect(() => parseModelJson('{"sender": {"email": "a@b.com"', ExtractionSchema)).toThrow(/invalid JSON/);
  });

  it('rejects an empty response', () => {
    expect(() => parseModelJson('', ExtractionSchema)).toThrow(InvalidOutputError);
  });

  it('rejects JSON missing a required field', () => {
    const { summary, ...noSummary } = validExtraction;
    expect(() => parseModelJson(JSON.stringify(noSummary), ExtractionSchema)).toThrow(/summary/);
  });

  it('rejects an invented risk level', () => {
    const raw = JSON.stringify({ ...validRisk, risk: { ...validRisk.risk, level: 'critical' } });
    expect(() => parseModelJson(raw, RiskAnalysisSchema)).toThrow(/did not match schema/);
  });

  it('rejects a JSON array instead of an object', () => {
    expect(() => parseModelJson('[1, 2, 3]', RiskAnalysisSchema)).toThrow(InvalidOutputError);
  });
});

describe('RiskAnalysisSchema normalization', () => {
  const result = parseModelJson(JSON.stringify(validRisk), RiskAnalysisSchema);

  it('normalizes and de-duplicates tags', () => {
    expect(result.risk.tags).toEqual(['payment-change', 'urgency']);
  });

  it('drops placeholder tags', () => {
    const raw = JSON.stringify({ ...validRisk, risk: { level: 'none', rationale: 'Routine.', tags: ['none'] } });
    expect(parseModelJson(raw, RiskAnalysisSchema).risk.tags).toEqual([]);
  });

  it('normalizes relationship types to snake_case', () => {
    expect(result.relationships[0].type).toBe('requests_payment_to');
  });

  it('drops relationships pointing to undeclared entities', () => {
    expect(result.relationships).toHaveLength(1);
  });

  it('maps unknown entity types to "other" instead of failing', () => {
    expect(result.entities.find((entity) => entity.id === 'e3')?.type).toBe('other');
  });
});

describe('RiskAnalysisSchema tolerates a malformed entity', () => {
  it('drops the bad entity and keeps the rest of the analysis', () => {
    const raw = JSON.stringify({
      risk: { level: 'high', rationale: 'Insider trading tip.', tags: ['mnpi-risk'] },
      entities: [{ id: 'e1', type: 'person', name: 'R. Tanaka', details: null }, 'Halvorsen deal', { id: 'e3' }],
      relationships: [],
    });
    const result = parseModelJson(raw, RiskAnalysisSchema);
    expect(result.risk.level).toBe('high');
    expect(result.entities.map((entity) => entity.name)).toEqual(['R. Tanaka']);
  });
});
