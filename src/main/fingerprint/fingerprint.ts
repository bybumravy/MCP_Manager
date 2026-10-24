import crypto from 'node:crypto';
import path from 'node:path';
import { lstat, readdir } from 'node:fs/promises';
import { readBoundedFile } from './bounded-read';
import { checkBoundary } from '../path-policy/path-policy';
import type { Fingerprint } from '../../shared/contracts';

export interface FingerprintOptions {
  maxEntries?: number;
  maxBytes?: number;
}

const DEFAULT_OPTIONS: Required<FingerprintOptions> = {
  maxEntries: 2_000,
  maxBytes: 16 * 1024 * 1024,
};

function sha256(value: Buffer | string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export async function fingerprintPath(inputPath: string, options: FingerprintOptions = {}): Promise<Fingerprint> {
  const limits = { ...DEFAULT_OPTIONS, ...options };
  if ((await checkBoundary(inputPath, inputPath)).state !== 'approved') throw new Error('Unsafe fingerprint boundary.');
  let stats;

  try {
    stats = await lstat(inputPath);
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? String(error.code) : 'unknown';
    if (code === 'ENOENT') {
      return { kind: 'absence' };
    }
    throw error;
  }

  if (stats.isSymbolicLink()) {
    throw new Error('Symbolic links are not fingerprintable sources.');
  }

  if (stats.isFile()) {
    if (stats.size > limits.maxBytes) {
      throw new Error(`File exceeds fingerprint limit of ${limits.maxBytes} bytes.`);
    }
    const contents = await readBoundedFile(inputPath, limits.maxBytes);
    return { kind: 'file', sha256: sha256(contents), size: stats.size, modifiedAtMs: stats.mtimeMs };
  }

  if (!stats.isDirectory()) {
    return { kind: 'absence' };
  }

  const entries = await collectDirectoryEntries(inputPath, limits);
  return {
    kind: 'directory',
    sha256: sha256(entries.join('\n')),
    entryCount: entries.length,
    modifiedAtMs: stats.mtimeMs,
  };
}

async function collectDirectoryEntries(rootPath: string, options: Required<FingerprintOptions>): Promise<string[]> {
  const result: string[] = [];
  const pending = [rootPath];
  let bytesRead = 0;

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;

    if ((await checkBoundary(current, rootPath)).state !== 'approved') throw new Error('Unsafe directory boundary.');
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (result.length >= options.maxEntries) {
        throw new Error(`Directory exceeds fingerprint limit of ${options.maxEntries} entries.`);
      }

      const entryPath = path.join(current, entry.name);
      const relativePath = path.relative(rootPath, entryPath);
      if (entry.isSymbolicLink()) {
        result.push(`${relativePath}:symlink`);
        continue;
      }

      if (entry.isDirectory()) {
        result.push(`${relativePath}:directory`);
        pending.push(entryPath);
      } else if (entry.isFile()) {
        const entryStats = await lstat(entryPath);
        if (entryStats.size > options.maxBytes) {
          throw new Error(`File exceeds fingerprint limit of ${options.maxBytes} bytes.`);
        }
        const contents = await readBoundedFile(entryPath, options.maxBytes - bytesRead);
        bytesRead += contents.length;
        result.push(`${relativePath}:file:${entryStats.size}:${entryStats.mtimeMs}:${sha256(contents)}`);
      } else {
        result.push(`${relativePath}:other`);
      }
    }
  }

  return result.sort();
}
