import { Router } from 'express';
import type { EmailRepository } from '../storage/emailRepository.js';

export function createGraphRouter(repo: EmailRepository): Router {
  const router = Router();

  // Entities and relationships aggregated across all analyzed emails.
  router.get('/', (_req, res) => {
    res.json(repo.getGraph());
  });

  return router;
}
