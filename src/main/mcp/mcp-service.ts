import path from 'node:path';
import type { Fingerprint } from '../../shared/contracts';
import { readBoundedFile } from '../fingerprint/bounded-read';
import { fingerprintPath } from '../fingerprint/fingerprint';
import { checkBoundary } from '../path-policy/path-policy';
import { FileTransactionStore } from '../config-transaction/file-transaction-store';

type JsonObject = Record<string, unknown>;
export type McpChange =
  | { operation: 'create'; name: string; config: unknown }
  | { operation: 'update'; name: string; command?: string; url?: string }
  | { operation: 'delete'; name: string };

function object(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export class McpService {
  public constructor(private readonly transactions: FileTransactionStore) {}

  private async source(target: string, boundary: string) {
    if (path.basename(target) !== '.mcp.json' || path.dirname(target) !== boundary
      || (await checkBoundary(target, boundary)).state !== 'approved') throw new Error('Unsupported MCP target.');
    const fingerprint = await fingerprintPath(target);
    if (fingerprint.kind === 'absence') return { json: {} as JsonObject, fingerprint };
    if (fingerprint.kind !== 'file') throw new Error('MCP target must be a file.');
    let text: string;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(await readBoundedFile(target, 1024 * 1024)); }
    catch { throw new Error('MCP source must be readable UTF-8. Source was not changed.'); }
    let json: unknown;
    try { json = JSON.parse(text); } catch { throw new Error('Invalid MCP JSON; source was not changed.'); }
    if (!object(json) || (json.mcpServers !== undefined && !object(json.mcpServers))) throw new Error('MCP source must be an object with an object mcpServers.');
    const after = await fingerprintPath(target);
    if (after.kind !== 'file' || after.sha256 !== fingerprint.sha256) throw new Error('Conflict: MCP changed during read.');
    return { json, fingerprint };
  }

  public async read(target: string, boundary: string) {
    const { json, fingerprint } = await this.source(target, boundary);
    const servers = object(json.mcpServers) ? json.mcpServers : {};
    return {
      fingerprint,
      servers: Object.entries(servers).map(([name, config]) => ({
        name,
        transport: object(config) && config.type === 'http' ? 'http' : object(config) && (config.type === undefined || config.type === 'stdio') ? 'stdio' : 'unsupported',
        hasPrivateFields: object(config) && Object.keys(config).some((key) => !['type', 'command', 'url'].includes(key)),
      })),
    };
  }

  public async httpCheckConfig(target: string, boundary: string, expected: Fingerprint, name: string) {
    const { json, fingerprint } = await this.source(target, boundary);
    if (fingerprint.kind !== 'file' || expected.kind !== 'file' || fingerprint.sha256 !== expected.sha256) throw new Error('Conflict: MCP changed since preview.');
    const servers = object(json.mcpServers) ? json.mcpServers : {};
    const config = Object.hasOwn(servers, name) ? servers[name] : undefined;
    if (!object(config) || config.type !== 'http') throw new Error('Only saved HTTP MCP checks are supported.');
    this.validateConfig(config);
    if (typeof config.url !== 'string' || /\$\{/.test(config.url) || (object(config.headers) && Object.values(config.headers).some((value) => typeof value !== 'string' || /\$\{/.test(value)))) throw new Error('Environment interpolation is unsupported for checks.');
    return { url: config.url, headers: config.headers as Record<string, string> | undefined };
  }

  public async change(target: string, boundary: string, expected: Fingerprint, change: McpChange) {
    if (!object(change) || typeof change.name !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(change.name)
      || ['__proto__', 'constructor', 'prototype'].includes(change.name)) throw new Error('Invalid MCP name.');
    const { json, fingerprint } = await this.source(target, boundary);
    if (fingerprint.kind !== expected.kind || (fingerprint.kind === 'file' && (expected.kind !== 'file' || fingerprint.sha256 !== expected.sha256))) throw new Error('Conflict: MCP changed since preview.');
    const servers = object(json.mcpServers) ? json.mcpServers : {};
    const exists = Object.hasOwn(servers, change.name);
    if (change.operation === 'create') {
      if (exists) throw new Error('MCP name already exists; rename or cancel.');
      this.validateConfig(change.config);
      servers[change.name] = change.config;
    } else if (change.operation === 'update') {
      if (!exists || !object(servers[change.name])) throw new Error('MCP server not found.');
      const config = servers[change.name] as JsonObject;
      if (change.command !== undefined) {
        if (config.type !== undefined && config.type !== 'stdio') throw new Error('Transport cannot be changed through command update.');
        config.command = change.command;
      }
      if (change.url !== undefined) {
        if (config.type !== 'http') throw new Error('Transport cannot be changed through URL update.');
        config.url = change.url;
      }
      this.validateConfig(config);
    } else if (change.operation === 'delete') {
      if (!exists) throw new Error('MCP server not found.');
      this.validateConfig(servers[change.name]);
      delete servers[change.name];
    } else throw new Error('Unsupported MCP operation.');
    json.mcpServers = servers;
    return this.transactions.commit({ target, boundary, expected, contents: Buffer.from(`${JSON.stringify(json, null, 2)}\n`) });
  }

  private validateConfig(config: unknown): void {
    if (!object(config)) throw new Error('MCP configuration must be an object.');
    if (config.type === 'http') {
      if (typeof config.url !== 'string') throw new Error('HTTP URL is required.');
      let url: URL;
      try { url = new URL(config.url); } catch { throw new Error('Invalid HTTP URL.'); }
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('HTTP URL required.');
    } else if (config.type === undefined || config.type === 'stdio') {
      if (typeof config.command !== 'string' || !config.command.trim()) throw new Error('stdio command is required.');
      if (config.args !== undefined && (!Array.isArray(config.args) || !config.args.every((item) => typeof item === 'string'))) throw new Error('Arguments must be strings.');
    } else throw new Error('Only stdio and HTTP transports are supported.');
    for (const field of ['env', 'headers']) {
      const value = config[field];
      if (value !== undefined && (!object(value) || !Object.values(value).every((item) => typeof item === 'string'))) throw new Error(`${field} must contain string values.`);
    }
    if (config.headersHelper !== undefined) throw new Error('Dynamic header helpers are not supported for mutations.');
  }
}
