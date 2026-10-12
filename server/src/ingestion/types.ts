import type { RawEmail } from '../../../shared/types.js';

/** Ingestion output: the common email shape, before it gets an id in storage. */
export type IngestedEmail = Omit<RawEmail, 'id'>;

export type IngestionErrorCode =
  | 'unsupported_type'
  | 'empty'
  | 'too_large'
  | 'not_pdf'
  | 'unreadable_pdf'
  | 'no_text_pdf'
  | 'binary_content'
  | 'no_headers'
  | 'unreadable_eml'
  | 'no_body'
  | 'upload_failed';

/**
 * Bad input the user can fix. Returned as HTTP 400 with a fixed, user-facing message and a code;
 * `detail` (e.g. a library's internal error) is only logged on the server, never sent to the client.
 */
export class IngestionError extends Error {
  constructor(
    public readonly code: IngestionErrorCode,
    message: string,
    public readonly detail?: string,
  ) {
    super(message);
    this.name = 'IngestionError';
  }
}

export const UNKNOWN_SENDER = 'unknown sender';
