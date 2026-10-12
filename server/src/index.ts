import express from 'express';
import { emailsRouter } from './routes/emails.js';

const PORT = Number(process.env.PORT) || 3001;

const app = express();
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});
app.use('/api/emails', emailsRouter);

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  if (!process.env.GROQ_API_KEY) {
    console.warn('GROQ_API_KEY is not set. LLM analysis will be unavailable (see .env.example).');
  }
});
