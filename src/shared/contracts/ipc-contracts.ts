import type { AppState } from './state-contracts';
import type { DiscoverySnapshot, Fingerprint } from './artifact-contracts';

export interface InstructionDocument { path: string; text: string; fingerprint: Fingerprint }
export interface McpView {
  fingerprint: Fingerprint;
  servers: { name: string; transport: string; hasPrivateFields: boolean }[];
  writable: boolean;
}
export interface McpCheckResult {
  status: 'passed' | 'failed';
  reason: string;
  checkedAt: string;
  fingerprint: Fingerprint;
}
export type McpMutation = { operation: 'create'; name: string; config: unknown }
  | { operation: 'update'; name: string; command?: string; url?: string }
  | { operation: 'delete'; name: string };
export interface TransactionSummary { id: string; target: string; createdAt: string; status: 'pending' | 'committed' | 'restored' | 'unchanged' }

export const IPC_CHANNELS = {
  getBootstrap: 'app:get-bootstrap',
  refresh: 'app:refresh',
  setLanguage: 'app:set-language',
  selectProjectFolder: 'app:select-project-folder',
  removeProjectFolder: 'app:remove-project-folder',
  openInstruction: 'instructions:open',
  saveInstruction: 'instructions:save',
  listTransactions: 'transactions:list',
  restoreTransaction: 'transactions:restore',
  readMcp: 'mcp:read-project',
  changeMcp: 'mcp:change-project',
  verifyCli: 'capabilities:verify-cli',
  checkMcp: 'mcp:check-http',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

export interface BootstrapPayload {
  state: AppState;
  discovery: DiscoverySnapshot;
}

export interface WorkspaceManagerApi {
  getBootstrap(): Promise<BootstrapPayload>;
  refresh(): Promise<BootstrapPayload>;
  setLanguage(language: AppState['language']): Promise<AppState>;
  selectProjectFolder(): Promise<BootstrapPayload | null>;
  removeProjectFolder(path: string): Promise<BootstrapPayload>;
  openInstruction(artifactId: string): Promise<InstructionDocument>;
  saveInstruction(artifactId: string, fingerprint: Fingerprint, text: string): Promise<TransactionSummary | null>;
  listTransactions(): Promise<TransactionSummary[]>;
  restoreTransaction(id: string): Promise<boolean>;
  readMcp(artifactId: string): Promise<McpView>;
  changeMcp(artifactId: string, fingerprint: Fingerprint, mutation: McpMutation): Promise<TransactionSummary | null>;
  verifyCli(): Promise<{ version: string; supported: boolean } | null>;
  checkMcp(artifactId: string, name: string, fingerprint: Fingerprint): Promise<McpCheckResult | null>;
}

declare global {
  interface Window {
    workspaceManager: WorkspaceManagerApi;
  }
}
