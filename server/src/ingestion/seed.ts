import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { RawEmail } from '../../../shared/types.js';

const SEED_PATH = fileURLToPath(new URL('../../../data/mock_mailbox_data.json', import.meta.url));

export function loadSeedEmails(): RawEmail[] {
  const parsed = JSON.parse(readFileSync(SEED_PATH, 'utf8')) as { emails: RawEmail[] };
  return parsed.emails;
}
