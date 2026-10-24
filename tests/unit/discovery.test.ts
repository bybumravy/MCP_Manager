import { mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises';
import { checkBoundary } from '../../src/main/path-policy/path-policy';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { discoverArtifacts, resolveConfigRoot } from '../../src/main/claude-discovery';

describe('Claude discovery', () => {
  it('honors CLAUDE_CONFIG_DIR instead of assuming the default root', () => {
    expect(resolveConfigRoot({ CLAUDE_CONFIG_DIR: 'C:/custom-claude' }, 'C:/Users/test')).toBe(path.resolve('C:/custom-claude'));
  });

  it('performs passive inventory in isolated roots', async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), 'cwm-home-'));
    const configRoot = path.join(home, '.claude');
    const projectRoot = path.join(home, 'project');
    await mkdir(configRoot, { recursive: true });
    await mkdir(projectRoot, { recursive: true });
    await writeFile(path.join(projectRoot, '.mcp.json'), '{"mcpServers":{}}', 'utf8');

    const snapshot = await discoverArtifacts({ projectRoots: [projectRoot], homeDirectory: home, env: {} });
    const projectMcp = snapshot.artifacts.find((artifact) => artifact.kind === 'mcp' && artifact.scope === 'project');
    expect(projectMcp?.parseState).toBe('valid');
    expect(snapshot.capabilities.every((capability) => capability.operation !== 'create' || capability.status === 'blocked')).toBe(true);
  });

  it('marks oversized JSON sources unreadable instead of invalid', async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), 'cwm-home-'));
    const configRoot = path.join(home, '.claude');
    await mkdir(configRoot, { recursive: true });
    await writeFile(path.join(configRoot, 'settings.json'), `{"data":"${'x'.repeat(16 * 1024 * 1024)}"}`, 'utf8');

    const snapshot = await discoverArtifacts({ projectRoots: [], homeDirectory: home, env: {} });
    const settings = snapshot.artifacts.find((artifact) => artifact.kind === 'settings');
    expect(settings?.parseState).toBe('unreadable');
  });

  it('does not approve a candidate whose existing parent component is a symlink', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'cwm-boundary-'));
    const boundary = path.join(root, 'project');
    const external = path.join(root, 'external');
    const linkedDirectory = path.join(boundary, '.claude');
    await mkdir(boundary, { recursive: true });
    await mkdir(external, { recursive: true });
    await symlink(external, linkedDirectory, 'junction');

    const result = await checkBoundary(path.join(linkedDirectory, 'settings.json'), boundary);
    expect(result.state).toBe('unknown');
  });

  it('reports malformed JSON as invalid instead of valid', async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), 'cwm-home-'));
    const configRoot = path.join(home, '.claude');
    await mkdir(configRoot, { recursive: true });
    await writeFile(path.join(configRoot, 'settings.json'), '{not-json', 'utf8');

    const snapshot = await discoverArtifacts({ projectRoots: [], homeDirectory: home, env: {} });
    const settings = snapshot.artifacts.find((artifact) => artifact.kind === 'settings');
    expect(settings?.parseState).toBe('invalid');
  });
});
