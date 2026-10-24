import path from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import type { AppState } from '../../shared/contracts';
import { DEFAULT_APP_STATE } from '../../shared/contracts';

const STATE_FILE_NAME = 'app-state.json';

export class AppStateStore {
  private readonly statePath: string;

  public constructor(private readonly storageRoot: string) {
    this.statePath = path.join(storageRoot, STATE_FILE_NAME);
  }

  public async load(): Promise<AppState> {
    try {
      const raw = await readFile(this.statePath, 'utf8');
      return normalizeState(JSON.parse(raw));
    } catch (error) {
      const code = error instanceof Error && 'code' in error ? String(error.code) : 'unknown';
      if (code === 'ENOENT' || error instanceof SyntaxError) {
        return { ...DEFAULT_APP_STATE, projectRoots: [] };
      }
      throw error;
    }
  }

  public async save(state: AppState): Promise<AppState> {
    const normalized = normalizeState(state);
    await mkdir(this.storageRoot, { recursive: true });
    const temporaryPath = `${this.statePath}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(temporaryPath, `${JSON.stringify(normalized, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    await rename(temporaryPath, this.statePath);
    return normalized;
  }
}

function normalizeState(value: unknown): AppState {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_APP_STATE, projectRoots: [] };
  }

  const candidate = value as Partial<AppState>;
  const language = candidate.language === 'vi' ? 'vi' : 'en';
  const projectRoots = Array.isArray(candidate.projectRoots)
    ? candidate.projectRoots.filter((root): root is string => typeof root === 'string' && root.length > 0)
    : [];

  return { schemaVersion: 1, language, projectRoots: [...new Set(projectRoots)] };
}
