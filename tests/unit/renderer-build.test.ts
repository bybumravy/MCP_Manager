import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('renderer production build', () => {
  it('uses relative asset URLs for Electron loadFile', async () => {
    const html = await readFile(path.resolve('dist/renderer/index.html'), 'utf8');
    expect(html).not.toMatch(/(?:src|href)="\/(?:assets|src)\//);
    expect(html).toMatch(/(?:src|href)="\.\/assets\//);
  });
});
