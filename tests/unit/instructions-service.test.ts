import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { InstructionsService } from '../../src/main/instructions/instructions-service';
import { FileTransactionStore } from '../../src/main/config-transaction/file-transaction-store';

async function fixture(run: (service: InstructionsService, root: string) => Promise<void>) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cwm-instructions-'));
  try {
    const store = new FileTransactionStore(path.join(root, 'backups'), {
      encrypt: (bytes) => Buffer.from(bytes.toString('base64')),
      decrypt: (bytes) => Buffer.from(bytes.toString(), 'base64'),
    });
    await run(new InstructionsService(store), root);
  } finally { await rm(root, { recursive: true, force: true }); }
}

describe('instructions service', () => {
  it('edits a registered Markdown target with original newline and rejects stale drafts', async () => {
    await fixture(async (service, root) => {
      const target = path.join(root, 'CLAUDE.md');
      await writeFile(target, '# Original\r\n');
      const draft = await service.read(target, root);
      await service.save(target, root, draft.fingerprint, '# Changed\n');
      expect(await readFile(target, 'utf8')).toBe('# Changed\r\n');
      await expect(service.save(target, root, draft.fingerprint, '# Stale')).rejects.toThrow(/conflict/i);
    });
  });
  it('blocks arbitrary files and unsupported encodings', async () => {
    await fixture(async (service, root) => {
      await writeFile(path.join(root, 'settings.json'), '{}');
      await expect(service.read(path.join(root, 'settings.json'), root)).rejects.toThrow(/target/i);
      await writeFile(path.join(root, 'CLAUDE.md'), Buffer.from([0xff, 0xfe, 0x61, 0x00]));
      await expect(service.read(path.join(root, 'CLAUDE.md'), root)).rejects.toThrow(/UTF-8/);
    });
  });
  it('creates only allowed instruction paths and preserves no-op original bytes', async () => {
    await fixture(async (service, root) => {
      const target = path.join(root, 'CLAUDE.local.md');
      const draft = await service.read(target, root);
      await service.save(target, root, draft.fingerprint, '# New\n');
      expect(await readFile(target, 'utf8')).toBe('# New\n');
      await mkdir(path.join(root, '.claude', 'rules'), { recursive: true });
      const rules = path.join(root, '.claude', 'rules', 'code.md');
      await writeFile(rules, '﻿# Rules\r\n');
      const opened = await service.read(rules, root);
      const result = await service.save(rules, root, opened.fingerprint, opened.text);
      expect(result.status).toBe('unchanged');
      expect(await readFile(rules, 'utf8')).toBe('﻿# Rules\r\n');
    });
  });
});
