import path from 'node:path';
import type { Fingerprint } from '../../shared/contracts';
import { readBoundedFile } from '../fingerprint/bounded-read';
import { fingerprintPath } from '../fingerprint/fingerprint';
import { checkBoundary, isPathWithinBoundary } from '../path-policy/path-policy';
import { FileTransactionStore } from '../config-transaction/file-transaction-store';

export interface InstructionDraft {
  path: string;
  text: string;
  fingerprint: Fingerprint;
}

export class InstructionsService {
  public constructor(private readonly transactions: FileTransactionStore) {}

  private async validate(target: string, boundary: string): Promise<void> {
    const relative = path.relative(boundary, target).split(path.sep).join('/');
    const allowed = ['CLAUDE.md', 'CLAUDE.local.md', '.claude/CLAUDE.md'].includes(relative)
      || /^(?:\.claude\/)?rules\/(?:[^/]+\/)*[^/]+\.md$/.test(relative);
    if (!allowed || !isPathWithinBoundary(target, boundary)
      || (await checkBoundary(target, boundary)).state !== 'approved') throw new Error('Unsupported instruction target.');
  }

  public async read(target: string, boundary: string): Promise<InstructionDraft> {
    await this.validate(target, boundary);
    const fingerprint = await fingerprintPath(target);
    if (fingerprint.kind === 'absence') return { path: target, text: '', fingerprint };
    if (fingerprint.kind !== 'file') throw new Error('Instruction target is not a file.');
    const bytes = await readBoundedFile(target, 1024 * 1024);
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
      if (text.includes('\u0000')) throw new Error('NUL in text');
    } catch { throw new Error('Only UTF-8 instruction files can be edited.'); }
    const after = await fingerprintPath(target);
    if (after.kind !== 'file' || after.sha256 !== fingerprint.sha256) throw new Error('Conflict: source changed while opening.');
    return { path: target, text, fingerprint };
  }

  public async save(target: string, boundary: string, expected: Fingerprint, text: string) {
    await this.validate(target, boundary);
    if (typeof text !== 'string' || Buffer.byteLength(text) > 1024 * 1024 || text.includes('\u0000')) throw new Error('Invalid instruction text.');
    const draft = await this.read(target, boundary);
    let output = text;
    if (draft.text !== text) {
      const newline = draft.text.includes('\r\n') ? '\r\n' : '\n';
      output = text.replace(/\r\n|\r|\n/g, newline);
      if (draft.text.startsWith('﻿') && !output.startsWith('﻿')) output = `﻿${output}`;
    }
    return this.transactions.commit({ target, boundary, expected, contents: Buffer.from(output, 'utf8') });
  }
}
