export interface HttpCheckConfig { url: string; headers?: Record<string, string> }
export interface HttpCheckResult { status: 'passed' | 'failed'; reason: string }

class CheckFailure extends Error {}

function initializeResult(message: unknown): string {
  if (!message || typeof message !== 'object') throw new CheckFailure('invalid-response');
  const value = message as Record<string, unknown>;
  const result = value.result as Record<string, unknown> | undefined;
  const info = result?.serverInfo as Record<string, unknown> | undefined;
  if (value.jsonrpc !== '2.0' || value.id !== 1 || value.error || !result || Array.isArray(result)
    || !['2025-11-25', '2025-06-18', '2025-03-26'].includes(String(result.protocolVersion))
    || !result.capabilities || typeof result.capabilities !== 'object' || Array.isArray(result.capabilities)
    || !info || typeof info !== 'object' || Array.isArray(info)
    || typeof info.name !== 'string' || typeof info.version !== 'string') throw new CheckFailure('invalid-response');
  return String(result.protocolVersion);
}

async function initialization(response: Response): Promise<string> {
  const type = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  if (!['application/json', 'text/event-stream'].includes(type ?? '') || !response.body) throw new CheckFailure('invalid-response');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let text = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.length;
      if (bytes > 256 * 1024) throw new CheckFailure('response-limit');
      text += decoder.decode(chunk.value, { stream: true });
      if (type === 'text/event-stream') {
        text = text.replace(/\r\n/g, '\n');
        let end: number;
        while ((end = text.indexOf('\n\n')) !== -1) {
          const event = text.slice(0, end); text = text.slice(end + 2);
          const data = event.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
          if (!data) continue;
          const message = JSON.parse(data) as Record<string, unknown>;
          if (message.id === 1 && (message.result || message.error)) return initializeResult(message);
        }
      }
    }
    text += decoder.decode();
    if (type !== 'application/json') throw new CheckFailure('invalid-response');
    return initializeResult(JSON.parse(text));
  } finally { await reader.cancel().catch(() => undefined); }
}

export async function checkHttpMcp(config: HttpCheckConfig, timeoutMs = 10000): Promise<HttpCheckResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let session: string | null = null;
  let version: string | undefined;
  try {
    const url = new URL(config.url);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new CheckFailure('unsupported-url');
    const headers = new Headers(config.headers);
    for (const name of ['host', 'content-length', 'connection', 'transfer-encoding', 'mcp-session-id', 'mcp-protocol-version']) {
      if (headers.has(name)) throw new CheckFailure('unsupported-headers');
    }
    headers.set('Content-Type', 'application/json');
    headers.set('Accept', 'application/json, text/event-stream');
    const request = async (method: string, message?: unknown) => {
      const response = await fetch(url, { method, headers, body: message === undefined ? undefined : JSON.stringify(message), redirect: 'manual', signal: controller.signal });
      if (!response.ok) {
        await response.body?.cancel();
        if ([401, 403].includes(response.status)) throw new CheckFailure('authentication-required');
        if (response.status >= 300 && response.status < 400) throw new CheckFailure('redirect-refused');
        throw new CheckFailure('http-error');
      }
      return response;
    };
    const response = await request('POST', { jsonrpc: '2.0', id: 1, method: 'initialize', params: {
      protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'workspace-manager-check', version: '0.1.0' },
    } });
    session = response.headers.get('mcp-session-id');
    if (session && (!/^[\x21-\x7e]{1,1024}$/.test(session))) { await response.body?.cancel(); throw new CheckFailure('invalid-response'); }
    if (session) headers.set('Mcp-Session-Id', session);
    try {
      version = await initialization(response);
      headers.set('MCP-Protocol-Version', version);
      const initialized = await request('POST', { jsonrpc: '2.0', method: 'notifications/initialized' });
      await initialized.body?.cancel();
      if (initialized.status !== 202) throw new CheckFailure('invalid-response');
    } finally {
      if (session && !controller.signal.aborted) {
        const cleanup = await fetch(url, { method: 'DELETE', headers, redirect: 'manual', signal: controller.signal }).catch(() => null);
        await cleanup?.body?.cancel();
      }
    }
    return { status: 'passed', reason: 'handshake-complete' };
  } catch (error) {
    return { status: 'failed', reason: controller.signal.aborted ? 'timeout' : error instanceof CheckFailure ? error.message : error instanceof SyntaxError || error instanceof TypeError && !String(error.message).includes('fetch') ? 'invalid-response' : 'connection-failed' };
  } finally { clearTimeout(timer); }
}
