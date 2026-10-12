import { createApp } from './app.js';
import { bootstrap } from './pipeline/bootstrap.js';
import { createAnalysisQueue } from './pipeline/queue.js';
import { openDb } from './storage/db.js';
import { createEmailRepository } from './storage/emailRepository.js';

const PORT = Number(process.env.PORT) || 3001;

const repo = createEmailRepository(openDb(process.env.DB_PATH || undefined));
const queue = createAnalysisQueue(repo);

createApp(repo, queue).listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  if (!process.env.GROQ_API_KEY) {
    console.warn('GROQ_API_KEY is not set. LLM analysis will be unavailable (see .env.example).');
  }
  bootstrap(repo, queue);
});
