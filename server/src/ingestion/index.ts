import { parseEml } from './parseEml.js';
import { parsePdf } from './parsePdf.js';
import { parseRawText } from './parseRawText.js';
import { IngestionError, type IngestedEmail } from './types.js';

// Every input (pasted text, .txt, .eml, .pdf) becomes the same IngestedEmail shape,
// so new emails go through exactly the same pipeline as the seed data.

export const SUPPORTED_EXTENSIONS = ['.txt', '.eml', '.pdf'];
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const EMAIL_HEADER = /^(from|to|subject|date|received|mime-version|message-id|return-path|reply-to)\s*:/im;

/** Every PDF starts with "%PDF-" (the spec allows a little leading junk, so look in the first 1 KB). */
export function looksLikePdf(data: Buffer): boolean {
  return data.subarray(0, 1024).toString('latin1').includes('%PDF-');
}

/** Binary content (images, executables, archives) renamed as .txt or .eml. */
export function looksBinary(data: Buffer): boolean {
  const sample = data.subarray(0, 8192);
  if (sample.includes(0)) return true;
  const text = sample.toString('utf8');
  let suspicious = 0;
  for (const char of text) {
    const code = char.codePointAt(0)!;
    // Invalid UTF-8 decodes to U+FFFD; control characters other than tab/newline/CR are not text.
    if (code === 0xfffd || (code < 32 && char !== '\n' && char !== '\r' && char !== '\t')) suspicious++;
  }
  return suspicious / Math.max(text.length, 1) > 0.05;
}

export function ingestText(text: string): IngestedEmail {
  return parseRawText(text);
}

/** Checks the content, not just the extension, before choosing a parser. */
export async function ingestFile(filename: string, data: Buffer): Promise<IngestedEmail> {
  const extension = filename.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? '';
  if (!SUPPORTED_EXTENSIONS.includes(extension)) {
    throw new IngestionError('unsupported_type', `Only ${SUPPORTED_EXTENSIONS.join(', ')} files are supported.`);
  }
  if (data.length === 0) throw new IngestionError('empty', 'The file is empty.');
  if (data.length > MAX_UPLOAD_BYTES) throw new IngestionError('too_large', 'File is larger than 5 MB.');

  if (extension === '.pdf') {
    if (!looksLikePdf(data)) throw new IngestionError('not_pdf', 'This file is named .pdf but is not a PDF.');
    return parsePdf(data, filename);
  }

  if (looksBinary(data)) {
    throw new IngestionError('binary_content', `This file is named ${extension} but does not contain text.`);
  }
  if (extension === '.eml') {
    if (!EMAIL_HEADER.test(data.subarray(0, 16384).toString('utf8'))) {
      throw new IngestionError('no_headers', 'This .eml file has no email headers (From, To, Subject...).');
    }
    return parseEml(data);
  }
  return parseRawText(data.toString('utf8'));
}

export { IngestionError };
