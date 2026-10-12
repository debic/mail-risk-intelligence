import express, { type ErrorRequestHandler } from 'express';
import type { AnalysisQueue } from './pipeline/queue.js';
import { createEmailsRouter } from './routes/emails.js';
import { createGraphRouter } from './routes/graph.js';
import type { EmailRepository } from './storage/emailRepository.js';

/** The HTTP app, separate from startup so tests can run it against an in-memory database. */
export function createApp(repo: EmailRepository, queue: AnalysisQueue) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, llmConfigured: Boolean(process.env.GROQ_API_KEY) });
  });
  app.use('/api/emails', createEmailsRouter(repo, queue));
  app.use('/api/graph', createGraphRouter(repo));

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Malformed JSON bodies and unexpected errors return JSON instead of an HTML stack trace.
  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    const status = typeof err?.status === 'number' && err.status < 500 ? err.status : 500;
    if (status === 500) console.error('[api] unexpected error:', err);
    res.status(status).json({ error: status === 500 ? 'Internal server error' : err.message });
  };
  app.use(errorHandler);

  return app;
}
