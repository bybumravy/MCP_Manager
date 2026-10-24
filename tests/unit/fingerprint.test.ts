import { mkdtemp, utimes, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fingerprintPath } from '../../src/main/fingerprint/fingerprint';

describe('fingerprintPath', () => {
  it('enforces the byte budget across the whole tree', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'cwm-budget-'));
    try {
      await writeFile(path.join(root, 'a'), 'AAAA');
      await writeFile(path.join(root, 'b'), 'BBBB');
      await expect(fingerprintPath(root, { maxBytes: 6 })).rejects.toThrow(/limit/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it('returns an absence marker for missing paths', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'cwm-fingerprint-'));
    await expect(fingerprintPath(path.join(root, 'missing.json'))).resolves.toEqual({ kind: 'absence' });
  });

  it('fingerprints file bytes without exposing contents', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'cwm-fingerprint-'));
    const file = path.join(root, 'settings.json');
    await writeFile(file, '{"safe":true}', 'utf8');
    const fingerprint = await fingerprintPath(file);
    expect(fingerprint.kind).toBe('file');
    if (fingerprint.kind === 'file') {
      expect(fingerprint.sha256).toHaveLength(64);
      expect(fingerprint.size).toBe(13);
    }
  });

  it('changes a directory fingerprint when file bytes change even with the same size and mtime', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'cwm-fingerprint-'));
    const file = path.join(root, 'skill.md');
    await writeFile(file, 'AAAA', 'utf8');
    const originalTime = new Date('2026-01-01T00:00:00.000Z');
    await utimes(file, originalTime, originalTime);
    const before = await fingerprintPath(root);

    await writeFile(file, 'BBBB', 'utf8');
    await utimes(file, originalTime, originalTime);
    const after = await fingerprintPath(root);

    expect(before.kind).toBe('directory');
    expect(after.kind).toBe('directory');
    if (before.kind === 'directory' && after.kind === 'directory') {
      expect(after.sha256).not.toBe(before.sha256);
    }
  });
});
