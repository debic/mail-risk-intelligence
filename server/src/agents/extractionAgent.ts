import type { RawEmail } from '../../../shared/types.js';
import { escapePromptDelimiters } from '../security/signals.js';
import { callGroq } from '../llm/groqClient.js';
import { parseModelJson } from '../llm/parseModelJson.js';
import { ExtractionSchema, type Extraction } from './schemas.js';
import { EXTRACTION_PROMPT } from '../prompts/index.js';

// Agent A: turns a raw email (plus attachment text) into structured facts.
// It only extracts; judging risk is Agent B's job.

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
  const content = escapePromptDelimiters(formatEmailForPrompt(email));
  const raw = await callGroq({ system: EXTRACTION_PROMPT.system, user: `<email>\n${content}\n</email>` });
  return parseModelJson(raw, ExtractionSchema);
}
