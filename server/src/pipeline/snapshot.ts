import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { PipelineResult } from './orchestrator.js';
import type { EmailRepository } from '../storage/emailRepository.js';

// Pre-computed analysis of the seed emails, committed to the repo. Lets the app show
// a fully analyzed inbox instantly, even without an API key or when Groq is down.

export const SNAPSHOT_PATH = fileURLToPath(new URL('../../../data/seed-analysis.json', import.meta.url));

type DoneResult = Extract<PipelineResult, { status: 'done' }>;

export interface Snapshot {
  model: string;
  /** Prompt versions the snapshot was generated with (absent in older snapshots). */
  promptVersion?: string;
  generatedAt: string;
  results: Record<string, DoneResult>;
}

export function loadSnapshot(path = SNAPSHOT_PATH): Snapshot | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Snapshot;
  } catch (err) {
    console.warn(`Ignoring unreadable snapshot ${path}: ${(err as Error).message}`);
    return null;
  }
}

/** Rebuild pipeline results from stored analyses (only emails that finished successfully). */
export function buildSnapshot(repo: EmailRepository, ids: string[], model: string, promptVersion: string): Snapshot {
  const results: Record<string, DoneResult> = {};
  for (const id of ids) {
    const email = repo.getEmail(id);
    if (!email || email.status !== 'done' || !email.extraction || !email.risk) continue;
    results[id] = {
      status: 'done',
      durationMs: email.analysis?.durationMs ?? 0,
      extraction: email.extraction,
      analysis: {
        risk: email.risk,
        entities: email.entities.map((e) => ({ id: `e${e.id}`, type: e.type, name: e.name, details: e.details })),
        relationships: email.relationships.map((r) => ({
          source: `e${r.source.id}`,
          target: `e${r.target.id}`,
          type: r.type,
          evidence: r.evidence,
        })),
      },
    };
  }
  return { model, promptVersion, generatedAt: new Date().toISOString(), results };
}

export function writeSnapshot(snapshot: Snapshot, path = SNAPSHOT_PATH): void {
  writeFileSync(path, `${JSON.stringify(snapshot, null, 2)}\n`);
}
