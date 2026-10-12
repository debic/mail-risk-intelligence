import { parseEml } from './parseEml.js';
import { parsePdf } from './parsePdf.js';
import { parseRawText } from './parseRawText.js';
import { IngestionError, type IngestedEmail } from './types.js';

// Every input (pasted text, .txt, .eml, .pdf) becomes the same IngestedEmail shape,
// so new emails go through exactly the same pipeline as the seed data.

export const SUPPORTED_EXTENSIONS = ['.txt', '.eml', '.pdf'];
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export function ingestText(text: string): IngestedEmail {
  return parseRawText(text);
}

export async function ingestFile(filename: string, data: Buffer): Promise<IngestedEmail> {
  const extension = filename.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? '';
  if (data.length === 0) throw new IngestionError('The file is empty.');

  switch (extension) {
    case '.txt':
      return parseRawText(data.toString('utf8'));
    case '.eml':
      return parseEml(data);
    case '.pdf':
      return parsePdf(data, filename);
    default:
      throw new IngestionError(`Only ${SUPPORTED_EXTENSIONS.join(', ')} files are supported.`);
  }
}

export { IngestionError };
