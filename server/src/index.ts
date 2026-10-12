import express, { type ErrorRequestHandler } from 'express';
import { createEmailsRouter } from './routes/emails.js';
import { createGraphRouter } from './routes/graph.js';
import { openDb } from './storage/db.js';
import { createEmailRepository } from './storage/emailRepository.js';
import { createAnalysisQueue } from './pipeline/queue.js';
import { bootstrap } from './pipeline/bootstrap.js';

const PORT = Number(process.env.PORT) || 3001;

const repo = createEmailRepository(openDb(process.env.DB_PATH || undefined));
const queue = createAnalysisQueue(repo);

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

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  if (!process.env.GROQ_API_KEY) {
    console.warn('GROQ_API_KEY is not set. LLM analysis will be unavailable (see .env.example).');
  }
  bootstrap(repo, queue);
});
