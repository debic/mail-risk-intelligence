import { IngestionError, UNKNOWN_SENDER, type IngestedEmail } from './types.js';

const HEADER = /^(from|to|cc|subject|date|sent)\s*:\s*(.*)$/i;
const MAX_SUBJECT_FROM_BODY = 80;

const EMAIL_ADDRESS = /[a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

/**
 * Address header value -> list of addresses. Finds the addresses themselves instead of
 * splitting on commas, so display names with commas or quotes work:
 * `"Smith, John" <john@example.com>; Jane <jane@example.com>` -> both addresses.
 * A value with no address at all (e.g. "Finance team") is kept as-is.
 */
export function parseAddressList(value: string): string[] {
  const addresses = value.match(EMAIL_ADDRESS)?.map((address) => address.toLowerCase()) ?? [];
  if (addresses.length > 0) return [...new Set(addresses)];
  const trimmed = value.trim();
  return trimmed ? [trimmed] : [];
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
  if (!normalized) throw new IngestionError('empty', 'The email is empty.');

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
  if (!body) throw new IngestionError('no_body', 'The email has headers but no body text.');

  const firstLine = body.split('\n')[0].trim();
  return {
    from: parseAddressList(headers.from ?? '')[0] ?? UNKNOWN_SENDER,
    to: [...new Set([...parseAddressList(headers.to ?? ''), ...parseAddressList(headers.cc ?? '')])],
    date: toIsoDate(headers.date ?? headers.sent),
    subject:
      headers.subject ||
      (firstLine.length > MAX_SUBJECT_FROM_BODY ? `${firstLine.slice(0, MAX_SUBJECT_FROM_BODY)}…` : firstLine),
    body,
    attachments: [],
  };
}
