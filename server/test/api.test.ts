import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { openDb } from '../src/storage/db.js';
import { createEmailRepository } from '../src/storage/emailRepository.js';

// End-to-end through HTTP: bad uploads return a clear 400 and never leave partial data behind.

const repo = createEmailRepository(openDb(':memory:'));
const queue = { kick: vi.fn(), idle: async () => {} };
let server: Server;
let base: string;

beforeAll(async () => {
  server = createApp(repo, queue).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

afterAll(() => {
  server.close();
});

function upload(filename: string, content: BlobPart) {
  const form = new FormData();
  form.append('file', new Blob([content]), filename);
  return fetch(`${base}/emails/ingest`, { method: 'POST', body: form });
}

const storedCount = () => repo.listEmails().length;

describe('POST /api/emails/ingest', () => {
  it.each([
    ['an unsupported type', 'report.docx', 'hello'],
    ['an empty file', 'empty.txt', ''],
    ['an image renamed as .pdf', 'invoice.pdf', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0])],
    ['binary renamed as .txt', 'notes.txt', new Uint8Array([0, 1, 2, 3, 255, 254])],
    ['an .eml without headers', 'mail.eml', 'no headers at all'],
  ])('rejects %s with a 400 and stores nothing', async (_label, filename, content) => {
    const before = storedCount();
    const response = await upload(filename, content);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBeTruthy();
    expect(storedCount()).toBe(before);
    expect(queue.kick).not.toHaveBeenCalled();
  });

  it('rejects a file over 5 MB with a 400', async () => {
    const response = await upload('big.txt', 'a'.repeat(5 * 1024 * 1024 + 1));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/larger than 5 MB/);
  });

  it('stores a valid email as queued and starts the analysis', async () => {
    const response = await upload('note.txt', 'From: a@example.com\nSubject: Hello\n\nPlease review.');
    expect(response.status).toBe(201);
    const email = await response.json();
    expect(email).toMatchObject({ status: 'queued', source: 'upload', subject: 'Hello' });
    expect(queue.kick).toHaveBeenCalledOnce();
  });

  it('returns 404 for an unknown email', async () => {
    expect((await fetch(`${base}/emails/NOPE`)).status).toBe(404);
  });
});
