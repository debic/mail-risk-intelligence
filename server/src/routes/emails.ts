import { randomUUID } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { ingestFile, ingestText, IngestionError, MAX_UPLOAD_BYTES } from '../ingestion/index.js';
import type { RawEmail } from '../../../shared/types.js';
import type { AnalysisQueue } from '../pipeline/queue.js';
import type { EmailRepository } from '../storage/emailRepository.js';

const MAX_BODY_CHARS = 50_000;

// JSON input for a new email. Only the body is required; ingestion (Stage 5) fills headers from raw text/files.
const NewEmailSchema = z.object({
  from: z.string().trim().max(320).optional(),
  to: z.array(z.string().trim().max(320)).max(50).optional(),
  subject: z.string().trim().max(500).optional(),
  date: z.string().trim().optional(),
  body: z.string({ error: 'body is required' }).trim().min(1, 'body is required').max(MAX_BODY_CHARS),
  attachments: z
    .array(z.object({ filename: z.string().max(255), extracted_text: z.string().max(MAX_BODY_CHARS) }))
    .max(10)
    .optional(),
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });

/** Run multer and turn its errors (e.g. file too large) into a readable 400. */
function receiveUpload(req: Request, res: Response): Promise<boolean> {
  return new Promise((resolve) => {
    upload.single('file')(req, res, (err: unknown) => {
      if (!err) return resolve(true);
      const message =
        err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
          ? `File is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`
          : `Upload failed: ${(err as Error).message}`;
      res.status(400).json({ error: message });
      resolve(false);
    });
  });
}

export function newEmailId(): string {
  return `U-${randomUUID().slice(0, 8)}`;
}

export function createEmailsRouter(repo: EmailRepository, queue: AnalysisQueue): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json(repo.listEmails());
  });

  router.get('/:id', (req, res) => {
    const email = repo.getEmail(req.params.id);
    if (!email) {
      res.status(404).json({ error: `Email ${req.params.id} not found` });
      return;
    }
    res.json(email);
  });

  // Store the email and analyze it in the background; the client polls GET /:id for the result.
  router.post('/', (req, res) => {
    const parsed = NewEmailSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid email',
        details: parsed.error.issues.map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`),
      });
      return;
    }
    const input = parsed.data;
    const email: RawEmail = {
      id: newEmailId(),
      from: input.from || 'unknown sender',
      to: input.to ?? [],
      date: input.date || new Date().toISOString(),
      subject: input.subject || '(no subject)',
      body: input.body,
      attachments: input.attachments ?? [],
    };
    repo.insertEmail(email, 'paste');
    queue.kick();
    res.status(201).json(repo.getEmail(email.id));
  });

  // Raw input from the "Add email" dialog: multipart with a "file" (.txt/.eml/.pdf) or a "text" field.
  router.post('/ingest', async (req, res) => {
    if (!(await receiveUpload(req, res))) return;
    try {
      const text = typeof req.body?.text === 'string' ? req.body.text : '';
      const ingested = req.file
        ? await ingestFile(req.file.originalname, req.file.buffer)
        : text.trim()
          ? ingestText(text)
          : null;
      if (!ingested) {
        res.status(400).json({ error: 'Paste the email text or choose a file.' });
        return;
      }
      if (ingested.body.length > MAX_BODY_CHARS) {
        res.status(400).json({ error: 'The email is too long to analyze (50,000 characters max).' });
        return;
      }

      const email: RawEmail = { id: newEmailId(), ...ingested };
      repo.insertEmail(email, req.file ? 'upload' : 'paste');
      queue.kick();
      res.status(201).json(repo.getEmail(email.id));
    } catch (err) {
      if (err instanceof IngestionError) {
        res.status(400).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  // Retry a failed analysis, or re-analyze a finished one.
  router.post('/:id/retry', (req, res) => {
    const email = repo.getEmail(req.params.id);
    if (!email) {
      res.status(404).json({ error: `Email ${req.params.id} not found` });
      return;
    }
    if (email.status === 'queued' || email.status === 'analyzing') {
      res.status(409).json({ error: `Email ${email.id} is already being analyzed` });
      return;
    }
    repo.requeue(email.id);
    queue.kick();
    res.status(202).json(repo.getEmail(email.id));
  });

  return router;
}
