import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ingestFile, ingestText, IngestionError, MAX_UPLOAD_BYTES } from '../src/ingestion/index.js';
import { parseAddressList } from '../src/ingestion/parseRawText.js';

const sample = (name: string) => readFileSync(fileURLToPath(new URL(`../../samples/${name}`, import.meta.url)));

describe('ingestText', () => {
  it('reads headers and body from pasted text', () => {
    const email = ingestText('From: a@x.com\nTo: b@arcline.com; c@arcline.com\nSubject: Hi\n\nBody line');
    expect(email).toMatchObject({
      from: 'a@x.com',
      to: ['b@arcline.com', 'c@arcline.com'],
      subject: 'Hi',
      body: 'Body line',
    });
  });

  it('uses the first line as subject when there are no headers', () => {
    const email = ingestText('Please wire the money today.\nThanks');
    expect(email.from).toBe('unknown sender');
    expect(email.subject).toBe('Please wire the money today.');
  });

  it('rejects empty text', () => {
    expect(() => ingestText('   \n ')).toThrow(IngestionError);
  });

  it('rejects headers without a body', () => {
    expect(() => ingestText('From: a@x.com\nSubject: Hi')).toThrow(/no body/);
  });
});

describe('ingestFile', () => {
  it('rejects unsupported file types', async () => {
    await expect(ingestFile('report.docx', Buffer.from('x'))).rejects.toThrow(/Only .txt, .eml, .pdf/);
  });

  it('rejects empty files', async () => {
    await expect(ingestFile('empty.txt', Buffer.alloc(0))).rejects.toThrow(/empty/);
  });

  it('parses a .txt sample', async () => {
    const email = await ingestFile('gift-card-request.txt', sample('gift-card-request.txt'));
    expect(email.from).toBe('ceo-office@arcline-secure.co');
    expect(email.subject).toBe('Quick favor - need this done discreetly');
  });

  it('parses an .eml sample including its text attachment', async () => {
    const email = await ingestFile('payroll-change.eml', sample('payroll-change.eml'));
    expect(email.from).toBe('dana.whitfield.home@gmail.com');
    expect(email.to).toEqual(['payroll@arcline.com']);
    expect(email.attachments[0].filename).toBe('direct_deposit_form.txt');
    expect(email.attachments[0].extracted_text).toContain('Account number ending: 4471');
  });

  it('extracts text from a .pdf sample', async () => {
    const email = await ingestFile('supplier-quote.pdf', sample('supplier-quote.pdf'));
    expect(email.subject).toBe('supplier-quote.pdf');
    expect(email.body).toContain('Total: $6,420.00');
  });
});

describe('ingestFile: renamed, malformed and oversized files', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48]);

  it('rejects an image renamed as .pdf', async () => {
    await expect(ingestFile('invoice.pdf', png)).rejects.toThrow(/named .pdf but is not a PDF/);
  });

  it('rejects binary content renamed as .txt', async () => {
    await expect(ingestFile('notes.txt', png)).rejects.toThrow(/does not contain text/);
  });

  it('rejects binary content renamed as .eml', async () => {
    await expect(ingestFile('message.eml', png)).rejects.toThrow(/does not contain text/);
  });

  it('rejects an .eml without email headers', async () => {
    await expect(ingestFile('message.eml', Buffer.from('just some plain text\nno headers here'))).rejects.toThrow(
      /no email headers/,
    );
  });

  it('rejects a corrupted PDF with a fixed message and keeps library details out of it', async () => {
    const broken = Buffer.from('%PDF-1.4\nthis is not really a pdf body');
    const error = await ingestFile('broken.pdf', broken).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(IngestionError);
    expect(error).toMatchObject({
      code: 'unreadable_pdf',
      message: 'This PDF could not be read. It may be corrupted or password-protected.',
    });
    // The parser's own error is kept for the server log only.
    expect((error as IngestionError).detail).toBeTruthy();
  });

  it('classifies each rejection with a code', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]);
    await expect(ingestFile('a.docx', png)).rejects.toMatchObject({ code: 'unsupported_type' });
    await expect(ingestFile('a.pdf', png)).rejects.toMatchObject({ code: 'not_pdf' });
    await expect(ingestFile('a.txt', png)).rejects.toMatchObject({ code: 'binary_content' });
    await expect(ingestFile('a.txt', Buffer.alloc(0))).rejects.toMatchObject({ code: 'empty' });
  });

  it('rejects files over 5 MB', async () => {
    await expect(ingestFile('big.txt', Buffer.alloc(MAX_UPLOAD_BYTES + 1, 'a'))).rejects.toThrow(/larger than 5 MB/);
  });

  it('accepts UTF-8 text with accents and symbols', async () => {
    const email = await ingestFile('note.txt', Buffer.from('Subject: Pago\n\nPor favor, transferí 1.500 € hoy. ✓'));
    expect(email.subject).toBe('Pago');
  });
});

describe('parseAddressList (regression: display names with commas)', () => {
  it('keeps "Smith, John <john@example.com>" as one address', () => {
    expect(parseAddressList('Smith, John <john@example.com>')).toEqual(['john@example.com']);
  });

  it('handles quoted names, commas and semicolons in one list', () => {
    expect(parseAddressList('"Doe, Jane" <jane@example.com>, Bob <BOB@example.com>; ops@arcline.com')).toEqual([
      'jane@example.com',
      'bob@example.com',
      'ops@arcline.com',
    ]);
  });

  it('keeps a value with no address as-is', () => {
    expect(parseAddressList('Finance team')).toEqual(['Finance team']);
  });

  it('is used for pasted To and Cc headers', () => {
    const email = ingestText(
      'From: "Smith, John" <john@example.com>\nTo: Doe, Jane <jane@arcline.com>\nCc: ops@arcline.com\n\nHi',
    );
    expect(email.from).toBe('john@example.com');
    expect(email.to).toEqual(['jane@arcline.com', 'ops@arcline.com']);
  });
});
