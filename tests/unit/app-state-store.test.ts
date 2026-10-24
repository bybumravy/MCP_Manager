import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AppStateStore } from '../../src/main/app-state/app-state-store';

describe('AppStateStore', () => {
  it('loads defaults without creating Claude files', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'cwm-state-'));
    const store = new AppStateStore(root);
    await expect(store.load()).resolves.toEqual({ schemaVersion: 1, language: 'en', projectRoots: [] });
  });

  it('persists only registry and preference metadata', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'cwm-state-'));
    const store = new AppStateStore(root);
    await store.save({ schemaVersion: 1, language: 'vi', projectRoots: ['C:/projects/demo'] });
    const contents = await readFile(path.join(root, 'app-state.json'), 'utf8');
    expect(contents).toContain('C:/projects/demo');
    expect(contents).not.toContain('settings.json');
  });
});
