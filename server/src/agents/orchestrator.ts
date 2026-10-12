import type { RawEmail } from '../../../shared/types.js';
import { runExtractionAgent } from './extractionAgent.js';
import { LlmError } from './groqClient.js';
import { InvalidOutputError } from './parseModelJson.js';
import { runRiskAgent } from './riskAgent.js';
import type { Extraction, RiskAnalysis } from './schemas.js';

// Runs Agent A then Agent B. Agents throw on failure; the orchestrator catches
// everything and returns a result object, so one bad email can never crash the server.

export type PipelineStage = 'extraction' | 'risk';

export interface PipelineError {
  kind: string; // LlmError kinds, "invalid_output" or "unknown"
  message: string;
}

export type PipelineResult =
  | { status: 'done'; extraction: Extraction; analysis: RiskAnalysis; durationMs: number }
  // A partial extraction is kept when only Agent B failed, so the UI can still show it.
  | { status: 'failed'; stage: PipelineStage; error: PipelineError; extraction: Extraction | null; durationMs: number };

export interface PipelineDeps {
  extract: (email: RawEmail) => Promise<Extraction>;
  assessRisk: (extraction: Extraction) => Promise<RiskAnalysis>;
  retryDelayMs: number;
}

const defaultDeps: PipelineDeps = {
  extract: runExtractionAgent,
  assessRisk: runRiskAgent,
  retryDelayMs: 1500,
};

/** Transient failures are worth one retry; a missing or rejected key will fail again. */
export function isRetryable(err: unknown): boolean {
  if (err instanceof InvalidOutputError) return true;
  if (err instanceof LlmError) {
    if (err.kind === 'no_key') return false;
    if (err.kind === 'http') return err.status === 429 || (err.status ?? 0) >= 500;
    return true; // timeout, network, empty
  }
  return false;
}

export function toPipelineError(err: unknown): PipelineError {
  if (err instanceof LlmError) return { kind: err.kind, message: err.message };
  if (err instanceof InvalidOutputError) return { kind: 'invalid_output', message: err.message };
  return { kind: 'unknown', message: err instanceof Error ? err.message : String(err) };
}

async function withOneRetry<T>(task: () => Promise<T>, retryDelayMs: number): Promise<T> {
  try {
    return await task();
  } catch (err) {
    if (!isRetryable(err)) throw err;
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    return task();
  }
}

export async function analyzeEmail(email: RawEmail, deps: PipelineDeps = defaultDeps): Promise<PipelineResult> {
  const startedAt = Date.now();
  const elapsed = () => Date.now() - startedAt;

  let extraction: Extraction;
  try {
    extraction = await withOneRetry(() => deps.extract(email), deps.retryDelayMs);
  } catch (err) {
    return { status: 'failed', stage: 'extraction', error: toPipelineError(err), extraction: null, durationMs: elapsed() };
  }

  try {
    const analysis = await withOneRetry(() => deps.assessRisk(extraction), deps.retryDelayMs);
    return { status: 'done', extraction, analysis, durationMs: elapsed() };
  } catch (err) {
    return { status: 'failed', stage: 'risk', error: toPipelineError(err), extraction, durationMs: elapsed() };
  }
}
