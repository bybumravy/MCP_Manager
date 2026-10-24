import { useEffect, useState } from 'react';
import type { DiscoveredArtifact, InstructionDocument, Language, TransactionSummary } from '../shared/contracts';

export function InstructionsPanel({ artifacts, language, transactionRevision }: { artifacts: DiscoveredArtifact[]; language: Language; transactionRevision: number }) {
  const vi = language === 'vi';
  const [selected, setSelected] = useState('');
  const [document, setDocument] = useState<InstructionDocument | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [receipts, setReceipts] = useState<TransactionSummary[]>([]);
  const dirty = document !== null && text !== document.text;
  const targets = artifacts.filter((item) => item.kind === 'instructions' && item.boundary === 'approved');

  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);

  useEffect(() => {
    let active = true;
    void window.workspaceManager.listTransactions().then((items) => { if (active) setReceipts(items); })
      .catch((reason: Error) => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [transactionRevision]);

  async function open(id: string) {
    if (dirty && !window.confirm(vi ? 'Hủy bản sửa chưa lưu?' : 'Discard unsaved changes?')) return;
    setBusy(true); setError('');
    try {
      const draft = await window.workspaceManager.openInstruction(id);
      setSelected(id); setDocument(draft); setText(draft.text);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  async function save() {
    if (!document) return;
    setBusy(true); setError('');
    try {
      const receipt = await window.workspaceManager.saveInstruction(selected, document.fingerprint, text);
      if (receipt) {
        const draft = await window.workspaceManager.openInstruction(selected);
        setDocument(draft); setText(draft.text);
        setReceipts(await window.workspaceManager.listTransactions());
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  async function restore(id: string) {
    if (dirty && !window.confirm(vi ? 'Hủy bản sửa chưa lưu trước khi khôi phục?' : 'Discard unsaved changes before restore?')) return;
    setBusy(true); setError('');
    try {
      if (await window.workspaceManager.restoreTransaction(id)) {
        setReceipts(await window.workspaceManager.listTransactions());
        if (selected) {
          const draft = await window.workspaceManager.openInstruction(selected);
          setDocument(draft); setText(draft.text);
        }
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  return <section className="panel instructions-panel">
    <h2>{vi ? 'Instructions — chỉnh sửa file thật' : 'Instructions — edit real files'}</h2>
    <p>{vi ? 'Chọn đúng nguồn. Khi lưu, app yêu cầu xác nhận nhận quản lý; backup mã hóa bằng Windows. Không tự chạy nội dung.' : 'Select the intended source. Saving requires management confirmation and creates a Windows-encrypted backup. Content is never executed.'}</p>
    <label>{vi ? 'Nguồn instructions' : 'Instructions source'}
      <select aria-label="Instructions source" value={selected} disabled={busy} onChange={(event) => void open(event.target.value)}>
        <option value="" disabled>{vi ? 'Chọn nguồn…' : 'Choose source…'}</option>
        {targets.map((item) => <option key={item.id} value={item.id}>{item.scope} — {item.resolvedPath}</option>)}
      </select>
    </label>
    {document && <>
      <textarea aria-label="Instruction text" rows={14} value={text} disabled={busy} spellCheck={false} onChange={(event) => setText(event.target.value)} style={{ width: '100%', boxSizing: 'border-box', marginTop: 16, padding: 12, background: '#0b111a', color: '#e5edf9', fontFamily: 'monospace' }} />
      <details><summary>{vi ? 'So sánh trước khi lưu (bản gốc / bản mới)' : 'Review before saving (original / new)'}</summary>
        <div className="overview-grid"><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{document.text}</pre><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{text}</pre></div>
      </details>
      <button className="primary-button" disabled={busy || !dirty} onClick={() => void save()}>{vi ? 'Lưu vào file thật…' : 'Save real file…'}</button>
    </>}
    {error && <p role="alert" className="error-banner">{error}</p>}
    <h3>{vi ? 'Backup và khôi phục' : 'Backups and restore'}</h3>
    {!receipts.length && <p>{vi ? 'Chưa có giao dịch do app thực hiện.' : 'No app transactions yet.'}</p>}
    <ul className="folder-list">{receipts.map((receipt) => <li className="folder-row" key={receipt.id}>
      <span>{receipt.target} — {receipt.status} — {receipt.createdAt}</span>
      <button className="text-button" disabled={busy || receipt.status !== 'committed'} onClick={() => void restore(receipt.id)}>{vi ? 'Khôi phục…' : 'Restore…'}</button>
    </li>)}</ul>
  </section>;
}
