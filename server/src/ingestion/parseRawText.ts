import { IngestionError, UNKNOWN_SENDER, type IngestedEmail } from './types.js';

const HEADER = /^(from|to|cc|subject|date|sent)\s*:\s*(.*)$/i;
const MAX_SUBJECT_FROM_BODY = 80;

export function splitAddresses(value: string): string[] {
  return value
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function toIsoDate(value: string | undefined): string {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

/**
 * Pasted text or a .txt file. Reads "From:", "To:", "Subject:", "Date:" lines at the top
 * (as copied from most mail clients); everything after them is the body.
 * Without headers, the whole text is the body and the first line becomes the subject.
 */
export function parseRawText(text: string): IngestedEmail {
  const normalized = text.replace(/\r\n?/g, '\n').trim();
  if (!normalized) throw new IngestionError('The email is empty.');

  const lines = normalized.split('\n');
  const headers: Record<string, string> = {};
  let bodyStart = 0;
  for (const [index, line] of lines.entries()) {
    const match = line.match(HEADER);
    if (!match) break;
    headers[match[1].toLowerCase()] = match[2].trim();
    bodyStart = index + 1;
  }

  const body = lines.slice(bodyStart).join('\n').trim();
  if (!body) throw new IngestionError('The email has headers but no body text.');

  const firstLine = body.split('\n')[0].trim();
  return {
    from: headers.from || UNKNOWN_SENDER,
    to: splitAddresses(headers.to ?? ''),
    date: toIsoDate(headers.date ?? headers.sent),
    subject:
      headers.subject ||
      (firstLine.length > MAX_SUBJECT_FROM_BODY ? `${firstLine.slice(0, MAX_SUBJECT_FROM_BODY)}…` : firstLine),
    body,
    attachments: [],
  };
}
