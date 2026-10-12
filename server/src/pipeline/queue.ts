import { analyzeEmail, toPipelineError, type PipelineResult } from './orchestrator.js';
import { getModelName } from '../llm/groqClient.js';
import { PROMPT_VERSION } from '../prompts/index.js';
import type { RawEmail } from '../../../shared/types.js';
import type { EmailRepository } from '../storage/emailRepository.js';

// Background worker: processes "queued" emails one at a time (the free LLM tier is
// rate limited), so API requests return immediately and the UI polls for progress.

export interface AnalysisQueue {
  /** Start processing if idle. Safe to call any number of times. */
  kick(): void;
  /** Resolves when the queue is empty (used by scripts and tests). */
  idle(): Promise<void>;
}

export function createAnalysisQueue(
  repo: EmailRepository,
  analyze: (email: RawEmail) => Promise<PipelineResult> = analyzeEmail,
): AnalysisQueue {
  let running: Promise<void> | null = null;

  async function drain(): Promise<void> {
    let id: string | null;
    while ((id = repo.nextQueuedId())) {
      const email = repo.getRawEmail(id);
      if (!email) continue;
      repo.setStatus(id, 'analyzing');

      let result: PipelineResult;
      try {
        result = await analyze(email);
      } catch (err) {
        // analyzeEmail never throws, but a custom analyzer might; never let it stop the queue.
        result = { status: 'failed', stage: 'extraction', error: toPipelineError(err), extraction: null, durationMs: 0 };
      }
      repo.saveResult(id, result, getModelName(), PROMPT_VERSION);

      const outcome =
        result.status === 'done' ? `done (${result.analysis.risk.level})` : `failed at ${result.stage}: ${result.error.kind}`;
      console.log(`[queue] ${id} ${outcome} in ${(result.durationMs / 1000).toFixed(1)}s`);
    }
  }

  return {
    kick() {
      if (!running) {
        running = drain()
          .catch((err) => console.error('[queue] stopped unexpectedly:', err))
          .finally(() => {
            running = null;
          });
      }
    },
    async idle() {
      while (running) await running;
    },
  };
}
