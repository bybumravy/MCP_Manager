import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { FileTransactionStore } from '../../src/main/config-transaction/file-transaction-store';
import { fingerprintPath } from '../../src/main/fingerprint/fingerprint';

const key = randomBytes(32);
const codec = {
  encrypt(bytes: Buffer) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const data = Buffer.concat([cipher.update(bytes), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), data]);
  },
  decrypt(bytes: Buffer) {
    const cipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
    cipher.setAuthTag(bytes.subarray(12, 28));
    return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]);
  },
};

async function fixture(run: (store: FileTransactionStore, target: string, storage: string) => Promise<void>) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cwm-transaction-'));
  try {
    const storage = path.join(root, 'backups');
    await run(new FileTransactionStore(storage, codec), path.join(root, 'CLAUDE.md'), storage);
  } finally { await rm(root, { recursive: true, force: true }); }
}

describe('file transactions', () => {
  it('writes real bytes and restores the exact original bytes after restart', async () => {
    await fixture(async (store, target, storage) => {
      const original = Buffer.from('﻿# Original\r\n');
      await writeFile(target, original);
      const receipt = await store.commit({ target, boundary: path.dirname(target), expected: await fingerprintPath(target), contents: Buffer.from('# Updated\n') });
      expect(await readFile(target, 'utf8')).toBe('# Updated\n');
      expect((await readFile(path.join(storage, receipt.id, 'snapshot.bin'))).includes(original)).toBe(false);
      const restarted = new FileTransactionStore(storage, codec);
      await restarted.restore(receipt.id);
      expect(await readFile(target)).toEqual(original);
    });
  });

  it('restores original absence without deleting later external edits', async () => {
    await fixture(async (store, target) => {
      const receipt = await store.commit({ target, boundary: path.dirname(target), expected: { kind: 'absence' }, contents: Buffer.from('created') });
      await store.restore(receipt.id);
      expect(await fingerprintPath(target)).toEqual({ kind: 'absence' });
      const next = await store.commit({ target, boundary: path.dirname(target), expected: { kind: 'absence' }, contents: Buffer.from('created') });
      await writeFile(target, 'external edit');
      await expect(store.restore(next.id)).rejects.toThrow(/conflict/i);
      expect(await readFile(target, 'utf8')).toBe('external edit');
    });
  });

  it('refuses changes since preview, including absence collisions', async () => {
    await fixture(async (store, target, storage) => {
      await writeFile(target, 'external');
      await expect(store.commit({ target, boundary: path.dirname(target), expected: { kind: 'absence' }, contents: Buffer.from('replacement') })).rejects.toThrow(/conflict/i);
      expect(await readFile(target, 'utf8')).toBe('external');
      expect(await readdir(storage).catch(() => [])).toEqual([]);
    });
  });

  it('refuses a decryptable snapshot whose bytes do not match the original fingerprint', async () => {
    await fixture(async (store, target, storage) => {
      await writeFile(target, 'original');
      const receipt = await store.commit({ target, boundary: path.dirname(target), expected: await fingerprintPath(target), contents: Buffer.from('updated') });
      await writeFile(path.join(storage, receipt.id, 'snapshot.bin'), codec.encrypt(Buffer.from('wrong original')));
      await expect(store.restore(receipt.id)).rejects.toThrow(/snapshot.*fingerprint/i);
      expect(await readFile(target, 'utf8')).toBe('updated');
    });
  });

  it('rejects a receipt with an invalid post-write fingerprint', async () => {
    await fixture(async (store, target, storage) => {
      const receipt = await store.commit({ target, boundary: path.dirname(target), expected: { kind: 'absence' }, contents: Buffer.from('created') });
      const receiptPath = path.join(storage, receipt.id, 'receipt.json');
      const saved = JSON.parse(await readFile(receiptPath, 'utf8')) as Record<string, unknown>;
      saved.after = { kind: 'file', sha256: 'not-a-hash', size: -1, modifiedAtMs: 0 };
      await writeFile(receiptPath, JSON.stringify(saved));

      await expect(store.list()).rejects.toThrow(/invalid transaction receipt/i);
    });
  });

  it('rejects a receipt that claims a directory target fingerprint', async () => {
    await fixture(async (store, target, storage) => {
      await writeFile(target, 'created');
      const receipt = await store.commit({ target, boundary: path.dirname(target), expected: await fingerprintPath(target), contents: Buffer.from('updated') });
      const receiptPath = path.join(storage, receipt.id, 'receipt.json');
      const saved = JSON.parse(await readFile(receiptPath, 'utf8')) as Record<string, unknown>;
      saved.before = { kind: 'directory', sha256: 'a'.repeat(64), entryCount: 1, modifiedAtMs: 0 };
      await writeFile(receiptPath, JSON.stringify(saved));

      await expect(store.list()).rejects.toThrow(/invalid transaction receipt/i);
    });
  });

  it('rejects a committed receipt without a file postcondition', async () => {
    await fixture(async (store, target, storage) => {
      const receipt = await store.commit({ target, boundary: path.dirname(target), expected: { kind: 'absence' }, contents: Buffer.from('created') });
      const receiptPath = path.join(storage, receipt.id, 'receipt.json');
      const saved = JSON.parse(await readFile(receiptPath, 'utf8')) as Record<string, unknown>;
      saved.after = { kind: 'absence' };
      await writeFile(receiptPath, JSON.stringify(saved));

      await expect(store.list()).rejects.toThrow(/invalid transaction receipt/i);
    });
  });

  it('does not write or snapshot a no-op', async () => {
    await fixture(async (store, target) => {
      await writeFile(target, 'same');
      const before = await fingerprintPath(target);
      const result = await store.commit({ target, boundary: path.dirname(target), expected: before, contents: Buffer.from('same') });
      expect(result.status).toBe('unchanged');
      expect(await fingerprintPath(target)).toEqual(before);
      expect(await store.list()).toEqual([]);
    });
  });
});
