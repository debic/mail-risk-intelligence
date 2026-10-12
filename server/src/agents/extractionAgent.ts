import type { RawEmail } from '../../../shared/types.js';
import { callGroq } from './groqClient.js';
import { parseModelJson } from './parseModelJson.js';
import { ExtractionSchema, type Extraction } from './schemas.js';

// Agent A: turns a raw email (plus attachment text) into structured facts.
// It only extracts; judging risk is Agent B's job.

const SYSTEM_PROMPT = `You are an information extraction assistant for a corporate compliance team.
Read the email (and any attachment text) and extract facts exactly as written. Do not judge risk and do not invent information.

Respond with a single JSON object with this shape:
{
  "sender": { "name": string | null, "email": string },
  "recipients": string[],
  "date": string | null,            // ISO 8601 if known
  "subject": string,
  "summary": string,                // 1-2 neutral sentences: who wants what from whom
  "requestedActions": string[],     // what the sender asks the recipient to do, if anything
  "keyFacts": {
    "amounts":    [{ "value": string, "context": string }],  // money amounts, keep currency symbols
    "dates":      [{ "value": string, "context": string }],  // deadlines, events, periods mentioned in the text
    "accounts":   [{ "value": string, "context": string }],  // bank accounts, routing numbers, partial account numbers
    "references": [{ "value": string, "context": string }]   // invoice numbers, deal names, ticket ids, URLs
  },
  "attachments": [{ "filename": string, "summary": string }]
}

Rules:
- Copy domains, email addresses and URLs character by character. Never correct spelling: lookalike domains matter.
- Keep defanged links (e.g. "hxxp://") exactly as written.
- Use empty arrays when there is nothing to report.`;

export function formatEmailForPrompt(email: RawEmail): string {
  const lines = [
    `From: ${email.from}`,
    `To: ${email.to.join(', ')}`,
    `Date: ${email.date}`,
    `Subject: ${email.subject}`,
    '',
    email.body,
  ];
  for (const attachment of email.attachments) {
    lines.push('', `--- Attachment: ${attachment.filename} ---`, attachment.extracted_text);
  }
  return lines.join('\n');
}

export async function runExtractionAgent(email: RawEmail): Promise<Extraction> {
  const raw = await callGroq({ system: SYSTEM_PROMPT, user: formatEmailForPrompt(email) });
  return parseModelJson(raw, ExtractionSchema);
}
