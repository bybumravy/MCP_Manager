import { useEffect, useState } from 'react';
import type { DiscoveredArtifact, Language, McpView, McpCheckResult, Fingerprint } from '../shared/contracts';

function currentCheck(result: McpCheckResult | undefined, fingerprint: Fingerprint): boolean {
  return result?.fingerprint.kind === 'file' && fingerprint.kind === 'file' && result.fingerprint.sha256 === fingerprint.sha256;
}

export function McpPanel({ artifacts, language, onTransaction }: { artifacts: DiscoveredArtifact[]; language: Language; onTransaction: () => void }) {
  const vi = language === 'vi';
  const [source, setSource] = useState('');
  const [view, setView] = useState<McpView | null>(null);
  const [name, setName] = useState('');
  const [transport, setTransport] = useState('http');
  const [endpoint, setEndpoint] = useState('');
  const [json, setJson] = useState('');
  const [useJson, setUseJson] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ name: string; transport: string } | null>(null);
  const [replacement, setReplacement] = useState('');
  const [checks, setChecks] = useState<Record<string, McpCheckResult>>({});

  useEffect(() => {
    setChecks({});
    setView(null);
    setSource('');
    setEditing(null);
    setReplacement('');
  }, [artifacts]);

  async function action(run: () => Promise<void>) {
    setBusy(true); setError('');
    try { await run(); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }
  async function read(id: string) {
    const next = await window.workspaceManager.readMcp(id);
    if (id !== source) { setChecks({}); setEditing(null); setReplacement(''); setName(''); setEndpoint(''); setJson(''); }
    setView(next); setSource(id);
  }
  return <section className="panel mcp-panel">
    <h2>MCP — {vi ? 'cấu hình project thật' : 'real project configuration'}</h2>
    <p>{vi ? 'Lưu cấu hình không phải kiểm tra kết nối. Có kiểm tra HTTP riêng; user/local writer và kiểm tra stdio chưa hỗ trợ.' : 'Saving configuration is not a connectivity check. HTTP checks are separate; user/local writers and stdio checks are not implemented yet.'}</p>
    <button className="secondary-button" disabled={busy} onClick={() => void action(async () => {
      setStatus('');
      try {
        const result = await window.workspaceManager.verifyCli();
        if (result) setStatus(`${result.version} — ${result.supported ? 'verified' : 'read-only'}`);
      } finally {
        if (source) setView(await window.workspaceManager.readMcp(source));
      }
    })}>{vi ? 'Xác minh Claude Code…' : 'Verify Claude Code…'}</button>
    <p role="status">{status}</p>
    <label>{vi ? 'Chọn scope/project rõ ràng' : 'Choose scope/project explicitly'}
      <select aria-label="MCP source" disabled={busy} value={source} onChange={(event) => void action(() => read(event.target.value))}>
        <option value="" disabled>{vi ? 'Chọn project…' : 'Choose project…'}</option>
        {artifacts.filter((item) => item.kind === 'mcp' && item.scope === 'project' && item.boundary === 'approved').map((item) => <option value={item.id} key={item.id}>project — {item.resolvedPath}</option>)}
      </select>
    </label>
    {view && <>
      <ul>{view.servers.map((server) => <li key={server.name} data-server={server.name}>
        {server.name} — {server.transport} — {vi ? 'đã cấu hình / chưa kiểm tra' : 'configured / not checked'}
        {checks[server.name] && <span role="status"> — {currentCheck(checks[server.name], view.fingerprint) ? `${checks[server.name]?.status}: ${checks[server.name]?.reason}` : vi ? 'kết quả cũ' : 'check stale'} — {checks[server.name]?.checkedAt}</span>}
        <button className="text-button" data-action="check" disabled={busy || server.transport !== 'http'} onClick={() => void action(async () => {
          const result = await window.workspaceManager.checkMcp(source, server.name, view.fingerprint);
          if (result) setChecks((current) => ({ ...current, [server.name]: result }));
        })}>{vi ? 'Kiểm tra HTTP…' : 'Check HTTP…'}</button>
        <button className="text-button" data-action="edit" disabled={busy || !view.writable || server.transport === 'unsupported'} onClick={() => { setEditing(server); setReplacement(''); }}>{vi ? 'Sửa endpoint…' : 'Edit endpoint…'}</button>
        <button className="text-button" data-action="delete" disabled={busy || !view.writable} onClick={() => void action(async () => {
          const result = await window.workspaceManager.changeMcp(source, view.fingerprint, { operation: 'delete', name: server.name });
          if (result) onTransaction();
          await read(source);
        })}>{vi ? 'Xóa…' : 'Delete…'}</button>
      </li>)}</ul>
      {editing && <fieldset disabled={busy || !view.writable}>
        <legend>{vi ? 'Sửa' : 'Edit'} {editing.name}</legend>
        <p>{vi ? 'Chỉ thay command/URL đã nhập; giữ nguyên env, headers, args và trường khác. Không hiển thị giá trị nguồn có thể chứa secret.' : 'Replace only the entered command/URL; preserve env, headers, args and unknown fields. Existing values may contain secrets and are not displayed.'}</p>
        <label>{editing.transport === 'http' ? 'URL' : 'Command'} <input aria-label="MCP replacement" type="password" autoComplete="off" value={replacement} onChange={(event) => setReplacement(event.target.value)} /></label>
        <button className="primary-button" data-action="save-edit" disabled={!replacement.trim()} onClick={() => void action(async () => {
          const mutation = editing.transport === 'http' ? { operation: 'update' as const, name: editing.name, url: replacement } : { operation: 'update' as const, name: editing.name, command: replacement };
          const result = await window.workspaceManager.changeMcp(source, view.fingerprint, mutation);
          if (result) { onTransaction(); setEditing(null); setReplacement(''); }
          await read(source);
        })}>{vi ? 'Lưu thay đổi…' : 'Save change…'}</button>
        <button className="text-button" onClick={() => { setEditing(null); setReplacement(''); }}>{vi ? 'Hủy' : 'Cancel'}</button>
      </fieldset>}
      {!view.writable && <p>{vi ? 'Chỉ đọc đến khi xác minh phiên bản đã hỗ trợ.' : 'Read-only until a supported installed version is verified.'}</p>}
      <fieldset disabled={busy || !view.writable}>
        <legend>{vi ? 'Thêm server (đích trùng tên sẽ bị từ chối)' : 'Add server (existing names are refused)'}</legend>
        <label>{vi ? 'Tên server' : 'Server name'} <input aria-label="MCP name" value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label><input type="checkbox" checked={useJson} onChange={(event) => setUseJson(event.target.checked)} />{vi ? 'Dán JSON một server' : 'Paste one server JSON'}</label>
        {useJson ? <textarea aria-label="MCP JSON" className="masked-input" spellCheck={false} rows={6} value={json} onChange={(event) => setJson(event.target.value)} autoComplete="off" /> : <>
          <label>Transport <select value={transport} onChange={(event) => setTransport(event.target.value)}><option value="http">HTTP</option><option value="stdio">stdio</option></select></label>
          <label>{transport === 'http' ? 'URL' : 'Command'} <input aria-label="MCP endpoint" type="password" value={endpoint} onChange={(event) => setEndpoint(event.target.value)} autoComplete="off" /></label>
        </>}
        <button className="primary-button" onClick={() => void action(async () => {
          let config: unknown;
          if (useJson) {
            try { config = JSON.parse(json); }
            catch { throw new Error(vi ? 'JSON không hợp lệ; chưa ghi file.' : 'Invalid JSON; no file was written.'); }
          } else config = transport === 'http' ? { type: 'http', url: endpoint } : { type: 'stdio', command: endpoint };
          const result = await window.workspaceManager.changeMcp(source, view.fingerprint, { operation: 'create', name, config });
          if (result) { onTransaction(); setJson(''); setEndpoint(''); setName(''); setStatus(vi ? 'Đã lưu cấu hình / chưa kiểm tra kết nối' : 'Configured / not checked'); }
          await read(source);
        })}>{vi ? 'Ghi server thật…' : 'Write real server…'}</button>
      </fieldset>
    </>}
    {error && <p className="error-banner" role="alert">{error}</p>}
  </section>;
}
