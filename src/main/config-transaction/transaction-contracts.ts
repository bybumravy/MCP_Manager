import type { Fingerprint } from '../../shared/contracts';

export type TransactionStatus = 'prepared' | 'snapshotted' | 'committed' | 'aborted' | 'pending-recovery';

export interface FileSnapshot {
  path: string;
  existed: boolean;
  fingerprint: Fingerprint;
  bytesPath?: string;
}

export interface TransactionJournalEntry {
  id: string;
  createdAt: string;
  status: TransactionStatus;
  affectedPaths: string[];
  snapshots: FileSnapshot[];
  preconditions: Record<string, Fingerprint>;
  postconditions?: Record<string, Fingerprint>;
}
