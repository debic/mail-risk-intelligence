import { getModelName } from '../agents/groqClient.js';
import { loadSeedEmails } from '../ingestion/seed.js';
import type { EmailRepository } from '../storage/emailRepository.js';
import type { AnalysisQueue } from './queue.js';
import { loadSnapshot } from './snapshot.js';

/**
 * Startup: resume interrupted work, add seed emails that are not stored yet
 * (using the committed snapshot when available, so no API calls are needed), then start the queue.
 */
export function bootstrap(repo: EmailRepository, queue: AnalysisQueue): void {
  const resumed = repo.requeueInterrupted();
  if (resumed > 0) console.log(`[startup] re-queued ${resumed} interrupted analyses`);

  const snapshot = loadSnapshot();
  let fromSnapshot = 0;
  let queued = 0;

  for (const email of loadSeedEmails()) {
    if (!repo.insertEmail(email, 'seed')) continue; // already stored: never re-analyze on restart

    const cached = snapshot?.results[email.id];
    if (cached) {
      repo.saveResult(email.id, cached, snapshot.model);
      fromSnapshot++;
    } else {
      queued++;
    }
  }

  if (fromSnapshot || queued) {
    console.log(`[startup] seed emails: ${fromSnapshot} loaded from snapshot, ${queued} queued for analysis`);
  }
  if (queued > 0 && !process.env.GROQ_API_KEY) {
    console.warn(`[startup] no GROQ_API_KEY: queued emails will be marked failed (model ${getModelName()})`);
  }

  queue.kick();
}
