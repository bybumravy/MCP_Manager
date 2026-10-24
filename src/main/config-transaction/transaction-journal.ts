import crypto from 'node:crypto';
import path from 'node:path';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import type { TransactionJournalEntry } from './transaction-contracts';

export class TransactionJournal {
  public constructor(private readonly journalRoot: string) {}

  public async append(entry: TransactionJournalEntry): Promise<void> {
    await mkdir(this.journalRoot, { recursive: true });
    const journalPath = this.entryPath(entry.id);
    await writeFile(journalPath, `${JSON.stringify(entry, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  }

  public async read(id: string): Promise<TransactionJournalEntry | null> {
    try {
      const raw = await readFile(this.entryPath(id), 'utf8');
      return JSON.parse(raw) as TransactionJournalEntry;
    } catch (error) {
      const code = error instanceof Error && 'code' in error ? String(error.code) : 'unknown';
      if (code === 'ENOENT') return null;
      throw error;
    }
  }

  public async listPending(): Promise<TransactionJournalEntry[]> {
    try {
      const names = await readdir(this.journalRoot);
      const entries: TransactionJournalEntry[] = [];
      for (const name of names.filter((name) => name.endsWith('.json'))) {
        const raw = await readFile(path.join(this.journalRoot, name), 'utf8');
        const entry = JSON.parse(raw) as TransactionJournalEntry;
        if (entry.status === 'pending-recovery') entries.push(entry);
      }
      return entries;
    } catch (error) {
      const code = error instanceof Error && 'code' in error ? String(error.code) : 'unknown';
      if (code === 'ENOENT') return [];
      throw error;
    }
  }

  public static createId(): string {
    return `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID()}`;
  }

  private entryPath(id: string): string {
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Invalid transaction id.');
    return path.join(this.journalRoot, `${id}.json`);
  }
}
