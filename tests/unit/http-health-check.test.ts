import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { describe, expect, it } from 'vitest';
import { checkHttpMcp } from '../../src/main/mcp/http-health-check';

async function endpoint(handler: (request: IncomingMessage, response: ServerResponse) => void, run: (url: string) => Promise<void>) {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test endpoint unavailable');
  try { await run(`http://127.0.0.1:${address.port}/mcp`); }
  finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
}

describe('HTTP MCP handshake', () => {
  it('initializes a real endpoint, sends initialized, and closes the session without calling tools', async () => {
    const methods: string[] = [];
    await endpoint((request, response) => {
      if (request.method === 'DELETE') { methods.push('DELETE'); response.writeHead(204).end(); return; }
      let body = '';
      request.on('data', (chunk) => { body += chunk; });
      request.on('end', () => {
        const message = JSON.parse(body);
        methods.push(message.method);
        expect(request.headers.accept).toContain('text/event-stream');
        if (message.method === 'initialize') {
          expect(request.headers.authorization).toBe('Bearer fixture');
          response.writeHead(200, { 'Content-Type': 'application/json', 'Mcp-Session-Id': 'fixture-session' });
          response.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: '2025-11-25', capabilities: {}, serverInfo: { name: 'local-test', version: '1' } } }));
        } else {
          expect(request.headers['mcp-session-id']).toBe('fixture-session');
          expect(request.headers['mcp-protocol-version']).toBe('2025-11-25');
          response.writeHead(202).end();
        }
      });
    }, async (url) => {
      expect(await checkHttpMcp({ url, headers: { Authorization: 'Bearer fixture' } })).toEqual({ status: 'passed', reason: 'handshake-complete' });
    });
    expect(methods).toEqual(['initialize', 'notifications/initialized', 'DELETE']);
  });

  it('accepts bounded SSE initialization responses', async () => {
    await endpoint((request, response) => {
      let body = '';
      request.on('data', (chunk) => { body += chunk; });
      request.on('end', () => {
        const message = JSON.parse(body);
        if (message.method !== 'initialize') { response.writeHead(202).end(); return; }
        response.writeHead(200, { 'Content-Type': 'text/event-stream' });
        response.write(': keepalive\r\n\r\n');
        response.write(`data: ${JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: '2025-11-25', capabilities: {}, serverInfo: { name: 'local-test', version: '1' } } })}\r\n\r\n`);
      });
    }, async (url) => {
      expect((await checkHttpMcp({ url })).status).toBe('passed');
    });
  });

  it('rejects malformed initialize results instead of reporting a successful handshake', async () => {
    await endpoint((request, response) => {
      let body = '';
      request.on('data', (chunk) => { body += chunk; });
      request.on('end', () => {
        const message = JSON.parse(body);
        if (message.method !== 'initialize') { response.writeHead(202).end(); return; }
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2025-11-25', capabilities: [], serverInfo: {} } }));
      });
    }, async (url) => {
      expect(await checkHttpMcp({ url })).toEqual({ status: 'failed', reason: 'invalid-response' });
    });
  });

  it('reports authentication, redirects, invalid responses, oversized output and timeout without raw output', async () => {
    for (const [mode, reason] of [['auth', 'authentication-required'], ['redirect', 'redirect-refused'], ['invalid', 'invalid-response'], ['oversized', 'response-limit'], ['timeout', 'timeout']] as const) {
      await endpoint((_request, response) => {
        if (mode === 'timeout') return;
        if (mode === 'auth') { response.writeHead(401).end('private response'); return; }
        if (mode === 'redirect') { response.writeHead(302, { Location: 'http://example.invalid' }).end(); return; }
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(mode === 'oversized' ? 'x'.repeat(256 * 1024 + 1) : '{"secret":"private response"}');
      }, async (url) => {
        const result = await checkHttpMcp({ url }, 100);
        expect(result).toEqual({ status: 'failed', reason });
        expect(JSON.stringify(result)).not.toContain('private response');
      });
    }
  });
});
