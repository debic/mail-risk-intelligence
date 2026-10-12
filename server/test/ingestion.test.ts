import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ingestFile, ingestText, IngestionError } from '../src/ingestion/index.js';

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
