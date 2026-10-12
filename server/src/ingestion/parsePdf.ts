import { PDFParse } from 'pdf-parse';
import { IngestionError, UNKNOWN_SENDER, type IngestedEmail } from './types.js';

export async function extractPdfText(data: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(data) });
  try {
    const result = await parser.getText();
    return result.text.replace(/\n{3,}/g, '\n\n').trim();
  } catch (err) {
    throw new IngestionError(`This PDF could not be read: ${(err as Error).message}`);
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

/** A standalone PDF is treated as a document landing in the mailbox: its text is the body. */
export async function parsePdf(data: Buffer, filename: string): Promise<IngestedEmail> {
  const text = await extractPdfText(data);
  if (!text) throw new IngestionError('No text found in this PDF (it may be a scanned image).');
  return {
    from: UNKNOWN_SENDER,
    to: [],
    date: new Date().toISOString(),
    subject: filename,
    body: text,
    attachments: [],
  };
}
