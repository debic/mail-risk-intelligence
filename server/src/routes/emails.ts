import { Router } from 'express';
import { loadSeedEmails } from '../ingestion/seed.js';

export const emailsRouter = Router();

// Stage 1: serve seed data directly. Replaced by storage-backed data in Stage 3.
emailsRouter.get('/', (_req, res) => {
  res.json(loadSeedEmails());
});
