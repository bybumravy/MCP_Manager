import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { mkdir, open, rename, unlink, link, readdir, rm } from 'node:fs/promises';
import type { Fingerprint } from '../../shared/contracts';
import { fingerprintPath } from '../fingerprint/fingerprint';
import { readBoundedFile } from '../fingerprint/bounded-read';
import { checkBoundary } from '../path-policy/path-policy';

export interface SnapshotCodec {
  encrypt(bytes: Buffer): Buffer | Promise<Buffer>;
  decrypt(bytes: Buffer): Buffer | Promise<Buffer>;
}
export interface FileReceipt {
  id: string;
  target: string;
  boundary: string;
  createdAt: string;
  status: 'pending' | 'committed' | 'restored' | 'unchanged';
  before: Fingerprint;
  after?: Fingerprint;
}
interface FileChange {
  target: string;
  boundary: string;
  expected: Fingerprint;
  contents: Buffer;
}

function validFingerprint(value: unknown): value is Fingerprint {
  if (!value || typeof value !== 'object' || !('kind' in value)) return false;
  const fingerprint = value as Record<string, unknown>;
  if (fingerprint.kind === 'absence') return true;
  if (fingerprint.kind === 'file') {
    return typeof fingerprint.sha256 === 'string' && /^[a-f0-9]{64}$/.test(fingerprint.sha256)
      && Number.isSafeInteger(fingerprint.size) && (fingerprint.size as number) >= 0
      && Number.isFinite(fingerprint.modifiedAtMs);
  }
  if (fingerprint.kind === 'directory') {
    return typeof fingerprint.sha256 === 'string' && /^[a-f0-9]{64}$/.test(fingerprint.sha256)
      && Number.isSafeInteger(fingerprint.entryCount) && (fingerprint.entryCount as number) >= 0
      && Number.isFinite(fingerprint.modifiedAtMs);
  }
  return false;
}

function matches(actual: Fingerprint, expected: Fingerprint): boolean {
  if (actual.kind !== expected.kind) return false;
  if (actual.kind === 'absence') return true;
  return expected.kind !== 'absence' && actual.sha256 === expected.sha256;
}

async function durableWrite(file: string, bytes: Buffer): Promise<void> {
  const handle = await open(file, 'wx', 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
}

export class FileTransactionStore {
  private queue: Promise<unknown> = Promise.resolve();
  public constructor(private readonly root: string, private readonly codec: SnapshotCodec) {}

  public commit(change: FileChange): Promise<FileReceipt> {
    return this.serialize(() => this.write(change));
  }

  private serialize<T>(action: () => Promise<T>): Promise<T> {
    const result = this.queue.then(action);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async assertTarget(target: string, boundary: string, expected: Fingerprint): Promise<void> {
    if (!path.isAbsolute(target) || !path.isAbsolute(boundary)
      || (await checkBoundary(target, boundary)).state !== 'approved') throw new Error('Unsafe target boundary.');
    const actual = await fingerprintPath(target);
    if (actual.kind === 'directory' || !matches(actual, expected)) throw new Error('Conflict: source changed since preview.');
  }

  private async write(change: FileChange): Promise<FileReceipt> {
    const { target, boundary, expected, contents } = change;
    if (contents.length > 16 * 1024 * 1024) throw new Error('File exceeds transaction limit.');
    await this.assertTarget(target, boundary, expected);
    const original = expected.kind === 'absence' ? null : await readBoundedFile(target, 16 * 1024 * 1024);
    const receipt: FileReceipt = {
      id: randomUUID(), target, boundary, createdAt: new Date().toISOString(),
      status: 'pending', before: expected,
    };
    if (original?.equals(contents)) return { ...receipt, status: 'unchanged' };
    const directory = this.directory(receipt.id);
    if ((await checkBoundary(directory, path.resolve(this.root))).state !== 'approved') throw new Error('Unsafe backup boundary.');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    if (original) await durableWrite(path.join(directory, 'snapshot.bin'), await this.codec.encrypt(original));
    await this.save(receipt);
    const staged = `${target}.workspace-${receipt.id}.tmp`;
    try {
      await durableWrite(staged, contents);
      await this.assertTarget(target, boundary, expected);
      if (expected.kind === 'absence') {
        await link(staged, target);
        await unlink(staged);
      } else {
        await rename(staged, target);
      }
      receipt.after = await fingerprintPath(target);
      if (receipt.after.kind !== 'file') throw new Error('Post-write file verification failed.');
      const actual = await readBoundedFile(target, 16 * 1024 * 1024);
      if (!actual.equals(contents)) throw new Error('Post-write content verification failed.');
      receipt.status = 'committed';
      await this.save(receipt);
      return receipt;
    } finally {
      await rm(staged, { force: true });
    }
  }

  public restore(id: string): Promise<void> {
    return this.serialize(async () => {
      const receipt = await this.read(id);
      if (receipt.status !== 'committed' || !receipt.after) throw new Error('Transaction is not safely restorable.');
      await this.assertTarget(receipt.target, receipt.boundary, receipt.after);
      if (receipt.before.kind === 'absence') {
        await this.assertTarget(receipt.target, receipt.boundary, receipt.after);
        await unlink(receipt.target);
      } else {
        const encrypted = await readBoundedFile(path.join(this.directory(id), 'snapshot.bin'), 24 * 1024 * 1024);
        const bytes = await this.codec.decrypt(encrypted);
        if (createHash('sha256').update(bytes).digest('hex') !== receipt.before.sha256) throw new Error('Snapshot does not match original fingerprint.');
        await this.write({ target: receipt.target, boundary: receipt.boundary, expected: receipt.after, contents: bytes });
      }
      receipt.status = 'restored';
      await this.save(receipt);
    });
  }

  public async list(): Promise<FileReceipt[]> {
    const names = await readdir(this.root).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    const result: FileReceipt[] = [];
    for (const name of names) {
      if (/^[a-f0-9-]{36}$/.test(name)) result.push(await this.read(name));
    }
    return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  private directory(id: string): string {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid transaction identifier.');
    return path.join(path.resolve(this.root), id);
  }

  private async save(receipt: FileReceipt): Promise<void> {
    const target = path.join(this.directory(receipt.id), 'receipt.json');
    const staged = `${target}.${randomUUID()}.tmp`;
    try {
      await durableWrite(staged, Buffer.from(JSON.stringify(receipt)));
      await rename(staged, target);
    } finally { await rm(staged, { force: true }); }
  }

  private async read(id: string): Promise<FileReceipt> {
    const value = JSON.parse((await readBoundedFile(path.join(this.directory(id), 'receipt.json'), 64 * 1024)).toString('utf8')) as FileReceipt;
    if (value.id !== id || typeof value.target !== 'string' || typeof value.boundary !== 'string'
      || !path.isAbsolute(value.target) || !path.isAbsolute(value.boundary)
      || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))
      || !['pending', 'committed', 'restored', 'unchanged'].includes(value.status)
      || !validFingerprint(value.before)
      || (value.before.kind !== 'file' && value.before.kind !== 'absence')
      || (value.after !== undefined && !validFingerprint(value.after))
      || (value.status === 'committed' && (!value.after || value.after.kind !== 'file'))) throw new Error('Invalid transaction receipt.');
    return value;
  }
}
