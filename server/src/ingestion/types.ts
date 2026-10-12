import type { RawEmail } from '../../../shared/types.js';

/** Ingestion output: the common email shape, before it gets an id in storage. */
export type IngestedEmail = Omit<RawEmail, 'id'>;

/** Bad input the user can fix (wrong type, empty, unreadable). Returned as HTTP 400. */
export class IngestionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IngestionError';
  }
}

export const UNKNOWN_SENDER = 'unknown sender';
