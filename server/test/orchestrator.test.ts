import { describe, expect, it, vi } from 'vitest';
import type { RawEmail } from '../../shared/types.js';
import { LlmError } from '../src/llm/groqClient.js';
import { analyzeEmail, type PipelineDeps } from '../src/pipeline/orchestrator.js';
import { InvalidOutputError } from '../src/llm/parseModelJson.js';
import type { Extraction, RiskAnalysis } from '../src/agents/schemas.js';

// Fake agents: no LLM calls, deterministic failures.

const email: RawEmail = {
  id: 'T1',
  from: 'a@example.com',
  to: ['b@arcline.com'],
  date: '2026-06-01T00:00:00Z',
  subject: 'Test',
  body: 'Hello',
  attachments: [],
};

const extraction: Extraction = {
  sender: { name: null, email: 'a@example.com' },
  recipients: ['b@arcline.com'],
  date: null,
  subject: 'Test',
  summary: 'A test email.',
  requestedActions: [],
  keyFacts: { amounts: [], dates: [], accounts: [], references: [] },
  attachments: [],
};

const analysis: RiskAnalysis = {
  risk: { level: 'none', rationale: 'Routine.', tags: [] },
  entities: [],
  relationships: [],
};

function deps(overrides: Partial<PipelineDeps>): PipelineDeps {
  return {
    extract: vi.fn().mockResolvedValue(extraction),
    assessRisk: vi.fn().mockResolvedValue(analysis),
    retryDelayMs: 0,
    maxRetries: 1,
    ...overrides,
  };
}

describe('analyzeEmail', () => {
  it('runs Agent A then Agent B and returns done', async () => {
    const d = deps({});
    const result = await analyzeEmail(email, d);
    expect(result.status).toBe('done');
    expect(d.assessRisk).toHaveBeenCalledWith(extraction, expect.objectContaining({ promptInjection: [] }));
  });

  it('retries a transient failure once, then succeeds', async () => {
    const extract = vi
      .fn()
      .mockRejectedValueOnce(new LlmError('timeout', 'slow'))
      .mockResolvedValueOnce(extraction);
    const result = await analyzeEmail(email, deps({ extract }));
    expect(result.status).toBe('done');
    expect(extract).toHaveBeenCalledTimes(2);
  });

  it('retries garbage model output once', async () => {
    const assessRisk = vi
      .fn()
      .mockRejectedValueOnce(new InvalidOutputError('not json'))
      .mockResolvedValueOnce(analysis);
    expect((await analyzeEmail(email, deps({ assessRisk }))).status).toBe('done');
    expect(assessRisk).toHaveBeenCalledTimes(2);
  });

  it('gives up after one retry and reports the failing stage', async () => {
    const extract = vi.fn().mockRejectedValue(new LlmError('network', 'offline'));
    const result = await analyzeEmail(email, deps({ extract }));
    expect(extract).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ status: 'failed', stage: 'extraction', error: { kind: 'network' } });
  });

  it('honors a configured number of retries', async () => {
    const extract = vi.fn().mockRejectedValue(new LlmError('timeout', 'slow'));
    await analyzeEmail(email, deps({ extract, maxRetries: 3 }));
    expect(extract).toHaveBeenCalledTimes(4);
  });

  it('does not retry when the API key is missing', async () => {
    const extract = vi.fn().mockRejectedValue(new LlmError('no_key', 'missing'));
    const result = await analyzeEmail(email, deps({ extract }));
    expect(extract).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ status: 'failed', error: { kind: 'no_key' } });
  });

  it('does not retry a rejected key (HTTP 401)', async () => {
    const extract = vi.fn().mockRejectedValue(new LlmError('http', 'Invalid API Key', 401));
    await analyzeEmail(email, deps({ extract }));
    expect(extract).toHaveBeenCalledTimes(1);
  });

  it('keeps Agent A output when Agent B fails', async () => {
    const assessRisk = vi.fn().mockRejectedValue(new InvalidOutputError('garbage'));
    const result = await analyzeEmail(email, deps({ assessRisk }));
    expect(result).toMatchObject({ status: 'failed', stage: 'risk', extraction });
  });

  it('never throws, even on unexpected errors', async () => {
    const extract = vi.fn().mockRejectedValue(new TypeError('boom'));
    await expect(analyzeEmail(email, deps({ extract }))).resolves.toMatchObject({
      status: 'failed',
      error: { kind: 'unknown', message: 'boom' },
    });
  });
});
