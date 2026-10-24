export type Language = 'en' | 'vi';

export interface AppState {
  schemaVersion: 1;
  language: Language;
  projectRoots: string[];
}

export const DEFAULT_APP_STATE: AppState = {
  schemaVersion: 1,
  language: 'en',
  projectRoots: [],
};
