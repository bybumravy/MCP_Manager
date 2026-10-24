import { describe, expect, it } from 'vitest';
import { checkBoundary, isPathWithinBoundary } from '../../src/main/path-policy/path-policy';
import { mkdtemp, mkdir, symlink, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

describe('path policy', () => {
  it('rejects junctions in the boundary itself and above the boundary', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'cwm-boundary-'));
    try {
      const target = path.join(root, 'target');
      const link = path.join(root, 'link');
      await mkdir(path.join(target, 'project'), { recursive: true });
      await symlink(target, link, 'junction');
      expect((await checkBoundary(link, link)).state).toBe('unknown');
      const project = path.join(link, 'project');
      expect((await checkBoundary(path.join(project, 'missing.json'), project)).state).toBe('unknown');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it('accepts the boundary itself and descendants', () => {
    expect(isPathWithinBoundary('C:/workspace', 'C:/workspace')).toBe(true);
    expect(isPathWithinBoundary('C:/workspace/project/file.json', 'C:/workspace')).toBe(true);
  });

  it('rejects traversal outside the boundary', () => {
    expect(isPathWithinBoundary('C:/workspace/../secrets', 'C:/workspace')).toBe(false);
    expect(isPathWithinBoundary('C:/workspace-other', 'C:/workspace')).toBe(false);
  });
});
