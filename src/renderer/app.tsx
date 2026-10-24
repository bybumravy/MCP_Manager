import { useCallback, useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import type { BootstrapPayload, DiscoveredArtifact, Language } from '../shared/contracts';
import { InstructionsPanel } from './instructions-panel';
import { McpPanel } from './mcp-panel';
import { messages, type MessageKey } from '../shared/i18n/messages';

function formatDate(value: string, language: Language): string {
  return new Intl.DateTimeFormat(language === 'vi' ? 'vi-VN' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function App(): JSX.Element {
  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [transactionRevision, setTransactionRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (loader: () => Promise<BootstrapPayload>) => {
    setLoading(true);
    setError(null);
    try {
      setBootstrap(await loader());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(() => window.workspaceManager.getBootstrap());
  }, [load]);

  const language = bootstrap?.state.language ?? 'en';
  const t = useMemo(() => messages[language], [language]);
  const translate = (key: MessageKey): string => t[key];

  const setLanguage = async (nextLanguage: Language) => {
    if (!bootstrap || nextLanguage === language) return;
    try {
      const state = await window.workspaceManager.setLanguage(nextLanguage);
      setBootstrap((current) => (current ? { ...current, state } : current));
    } catch (languageError) {
      setError(languageError instanceof Error ? languageError.message : 'Unknown error');
    }
  };

  const selectFolder = async () => {
    await load(() => window.workspaceManager.selectProjectFolder().then((result) => result ?? bootstrap!));
  };

  const removeFolder = async (path: string) => {
    await load(() => window.workspaceManager.removeProjectFolder(path));
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">CLAUDE CODE · WORKSPACE CONFIGURATION</p>
          <h1>{translate('appTitle')}</h1>
          <p className="subtitle">{translate('subtitle')}</p>
        </div>
        <label className="language-picker">
          <span>{translate('language')}</span>
          <select value={language} onChange={(event) => void setLanguage(event.target.value as Language)}>
            <option value="en">{translate('english')}</option>
            <option value="vi">{translate('vietnamese')}</option>
          </select>
        </label>
      </header>

      <section className="notice" role="note">
        <span className="notice-icon">i</span>
        <span>{translate('passiveNote')}</span>
      </section>

      {error && <div className="error-banner" role="alert">{error}</div>}

      <section className="overview-grid">
        <article className="panel project-panel">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">{translate('overview')}</p>
              <h2>{translate('projectFolders')}</h2>
            </div>
            <button className="primary-button" onClick={() => void selectFolder()} disabled={loading}>
              + {translate('addFolder')}
            </button>
          </div>
          {bootstrap?.state.projectRoots.length ? (
            <ul className="folder-list">
              {bootstrap.state.projectRoots.map((folder) => (
                <li key={folder} className="folder-row">
                  <span className="folder-path">{folder}</span>
                  <button className="text-button" onClick={() => void removeFolder(folder)} disabled={loading}>
                    {translate('remove')}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-state">{translate('noFolders')}</p>
          )}
        </article>

        <article className="panel status-panel">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">{translate('capability')}</p>
              <h2>{language === 'vi' ? 'Ghi có xác nhận' : 'Confirmed writes'}</h2>
            </div>
            <span className="status-pill">{loading ? translate('checking') : language === 'vi' ? 'HỖN HỢP' : 'MIXED'}</span>
          </div>
          <div className="status-stat">
            <strong>{bootstrap?.discovery.artifacts.length ?? 0}</strong>
            <span>{translate('artifacts')}</span>
          </div>
          <div className="last-read">
            <span>{translate('lastRead')}</span>
            <strong>{bootstrap ? formatDate(bootstrap.discovery.checkedAt, language) : '—'}</strong>
          </div>
        </article>
      </section>

      {bootstrap && <McpPanel artifacts={bootstrap.discovery.artifacts} language={language} onTransaction={() => setTransactionRevision((current) => current + 1)} />}
      {bootstrap && <InstructionsPanel artifacts={bootstrap.discovery.artifacts} language={language} transactionRevision={transactionRevision} />}

      <section className="panel artifacts-panel">
        <div className="panel-heading">
          <div>
            <p className="section-kicker">{translate('overview')}</p>
            <h2>{translate('artifacts')}</h2>
          </div>
          <button className="secondary-button" onClick={() => void load(() => window.workspaceManager.refresh())} disabled={loading}>
            ↻ {translate('refresh')}
          </button>
        </div>
        {bootstrap?.discovery.artifacts.length ? (
          <ArtifactTable artifacts={bootstrap.discovery.artifacts} translate={translate} />
        ) : (
          <p className="empty-state">{translate('noArtifacts')}</p>
        )}
      </section>
    </main>
  );
}

function ArtifactTable({ artifacts, translate }: { artifacts: DiscoveredArtifact[]; translate: (key: MessageKey) => string }): JSX.Element {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{translate('kind')}</th>
            <th>{translate('path')}</th>
            <th>{translate('state')}</th>
            <th>{translate('origin')}</th>
            <th>{translate('boundary')}</th>
            <th>{translate('readOnly')}</th>
          </tr>
        </thead>
        <tbody>
          {artifacts.map((artifact) => (
            <tr key={artifact.id}>
              <td><span className="kind-label">{artifact.kind}</span></td>
              <td className="path-cell" title={artifact.resolvedPath}>{artifact.resolvedPath}</td>
              <td><span className={`state-label state-${artifact.parseState}`}>{translate(artifact.parseState)}</span></td>
              <td>{translate(artifact.origin)}</td>
              <td>{artifact.boundary}</td>
              <td>{translate('readOnly')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
