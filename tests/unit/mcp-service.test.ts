import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { describe, expect, it } from 'vitest';
import { McpService } from '../../src/main/mcp/mcp-service';
import { FileTransactionStore } from '../../src/main/config-transaction/file-transaction-store';

async function fixture(run: (service: McpService, target: string) => Promise<void>) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cwm-mcp-'));
  try {
    const store = new FileTransactionStore(path.join(root, 'backups'), {
      encrypt: (bytes) => Buffer.from(bytes.toString('base64')),
      decrypt: (bytes) => Buffer.from(bytes.toString(), 'base64'),
    });
    await run(new McpService(store), path.join(root, '.mcp.json'));
  } finally { await rm(root, { recursive: true, force: true }); }
}

describe('MCP project configuration', () => {
  it('writes an actual server while preserving unknown fields and never projects secret values', async () => {
    await fixture(async (service, target) => {
      await writeFile(target, JSON.stringify({ future: { preserve: true }, mcpServers: {
        existing: { command: 'node', args: ['private-argument'], env: { TOKEN: 'test-sensitive' }, unknown: 7 },
      } }));
      const view = await service.read(target, path.dirname(target));
      expect(JSON.stringify(view)).not.toContain('test-sensitive');
      expect(JSON.stringify(view)).not.toContain('private-argument');
      await service.change(target, path.dirname(target), view.fingerprint, { operation: 'create', name: 'remote', config: { type: 'http', url: 'https://example.test/mcp' } });
      const json = JSON.parse(await readFile(target, 'utf8'));
      expect(json.future).toEqual({ preserve: true });
      expect(json.mcpServers.existing.env.TOKEN).toBe('test-sensitive');
      expect(json.mcpServers.remote.type).toBe('http');
    });
  });

  it('refuses duplicate names, malformed shapes and stale changes', async () => {
    await fixture(async (service, target) => {
      await writeFile(target, '{"mcpServers":{"one":{"command":"node"}}}');
      const view = await service.read(target, path.dirname(target));
      await expect(service.change(target, path.dirname(target), view.fingerprint, { operation: 'create', name: 'one', config: { command: 'node' } })).rejects.toThrow(/exists/);
      await writeFile(target, '{}');
      await expect(service.change(target, path.dirname(target), view.fingerprint, { operation: 'delete', name: 'one' })).rejects.toThrow(/conflict/i);
      await writeFile(target, '[]');
      await expect(service.read(target, path.dirname(target))).rejects.toThrow(/object/);
    });
  });

  it('resolves HTTP check configuration only from a fresh saved source', async () => {
    await fixture(async (service, target) => {
      await writeFile(target, JSON.stringify({ mcpServers: { remote: { type: 'http', url: 'https://example.invalid/mcp', headers: { Authorization: 'fixture' } }, dynamic: { type: 'http', url: 'https://example.invalid', headersHelper: 'do-not-run' } } }));
      const view = await service.read(target, path.dirname(target));
      expect(await service.httpCheckConfig(target, path.dirname(target), view.fingerprint, 'remote')).toEqual({ url: 'https://example.invalid/mcp', headers: { Authorization: 'fixture' } });
      await expect(service.httpCheckConfig(target, path.dirname(target), view.fingerprint, 'dynamic')).rejects.toThrow(/helper/i);
      await writeFile(target, '{}');
      await expect(service.httpCheckConfig(target, path.dirname(target), view.fingerprint, 'remote')).rejects.toThrow(/conflict/i);
    });
  });

  it('keeps unsupported transports read-only even for deletion', async () => {
    await fixture(async (service, target) => {
      const original = '{"mcpServers":{"legacy":{"type":"sse","url":"https://example.invalid"}}}';
      await writeFile(target, original);
      const view = await service.read(target, path.dirname(target));
      await expect(service.change(target, path.dirname(target), view.fingerprint, { operation: 'delete', name: 'legacy' })).rejects.toThrow(/unsupported|transport/i);
      expect(await readFile(target, 'utf8')).toBe(original);
    });
  });

  it('refuses invalid UTF-8 instead of silently rewriting replacement characters', async () => {
    await fixture(async (service, target) => {
      const original = Buffer.concat([Buffer.from('{"future":"'), Buffer.from([0xff]), Buffer.from('","mcpServers":{}}')]);
      await writeFile(target, original);
      await expect(service.read(target, path.dirname(target))).rejects.toThrow(/UTF-8/i);
      expect(await readFile(target)).toEqual(original);
    });
  });

  it('updates only explicit safe fields, retaining existing secret and unknown values', async () => {
    await fixture(async (service, target) => {
      await writeFile(target, '{"mcpServers":{"one":{"command":"old","env":{"TOKEN":"test-value"},"future":42}}}');
      let view = await service.read(target, path.dirname(target));
      await service.change(target, path.dirname(target), view.fingerprint, { operation: 'update', name: 'one', command: 'new' });
      expect(JSON.parse(await readFile(target, 'utf8')).mcpServers.one).toEqual({ command: 'new', env: { TOKEN: 'test-value' }, future: 42 });
      view = await service.read(target, path.dirname(target));
      await service.change(target, path.dirname(target), view.fingerprint, { operation: 'delete', name: 'one' });
      expect(JSON.parse(await readFile(target, 'utf8')).mcpServers).toEqual({});
    });
  });
});
