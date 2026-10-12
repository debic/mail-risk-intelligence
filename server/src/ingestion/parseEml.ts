import { simpleParser, type AddressObject } from 'mailparser';
import type { Attachment } from '../../../shared/types.js';
import { isDangerousAttachment } from '../security/signals.js';
import { extractPdfText } from './parsePdf.js';
import { IngestionError, UNKNOWN_SENDER, type IngestedEmail } from './types.js';
import { toIsoDate } from './parseRawText.js';

function addresses(field: AddressObject | AddressObject[] | undefined): string[] {
  const list = Array.isArray(field) ? field : field ? [field] : [];
  return list.flatMap((group) => group.value.map((entry) => entry.address || entry.name)).filter(Boolean);
}

const stripHtml = (html: string) =>
  html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** A .eml file: headers, plain-text body (or stripped HTML) and text from .txt/.pdf attachments. */
export async function parseEml(data: Buffer): Promise<IngestedEmail> {
  let parsed;
  try {
    parsed = await simpleParser(data);
  } catch (err) {
    throw new IngestionError('unreadable_eml', 'This .eml file could not be read.', (err as Error).message);
  }

  const body = (parsed.text || (parsed.html ? stripHtml(parsed.html) : '')).trim();
  if (!body && parsed.attachments.length === 0) throw new IngestionError('empty', 'The email is empty.');

  const attachments: Attachment[] = [];
  for (const file of parsed.attachments) {
    const filename = file.filename || 'attachment';
    // Allow-list: only .txt and .pdf are read. Executables and scripts are never opened.
    if (isDangerousAttachment(filename)) {
      attachments.push({ filename, extracted_text: '(blocked: executable or script attachment, not opened)' });
    } else if (/\.txt$/i.test(filename)) {
      attachments.push({ filename, extracted_text: file.content.toString('utf8').trim() });
    } else if (/\.pdf$/i.test(filename) || file.contentType === 'application/pdf') {
      const text = await extractPdfText(file.content).catch(() => '');
      attachments.push({ filename, extracted_text: text || '(no text could be extracted from this PDF)' });
    } else {
      attachments.push({ filename, extracted_text: `(${file.contentType} attachment, content not extracted)` });
    }
  }

  return {
    from: addresses(parsed.from)[0] ?? UNKNOWN_SENDER,
    to: [...addresses(parsed.to), ...addresses(parsed.cc)],
    date: toIsoDate(parsed.date?.toISOString()),
    subject: parsed.subject?.trim() || '(no subject)',
    body: body || '(no body text)',
    attachments,
  };
}
