import { open } from 'node:fs/promises';
import { checkBoundary } from '../path-policy/path-policy';

export async function readBoundedFile(filePath: string, maxBytes: number): Promise<Buffer> {
  if ((await checkBoundary(filePath, filePath)).state !== 'approved') {
    throw new Error('File boundary could not be verified.');
  }
  const handle = await open(filePath, 'r');
  try {
    const stats = await handle.stat();
    if (!stats.isFile() || stats.size > maxBytes) throw new Error('File exceeds read limit or is not a regular file.');
    const chunks: Buffer[] = [];
    let size = 0;
    while (true) {
      const buffer = Buffer.alloc(Math.min(64 * 1024, maxBytes - size + 1));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      size += bytesRead;
      if (size > maxBytes) throw new Error('File exceeds read limit.');
      chunks.push(buffer.subarray(0, bytesRead));
    }
    return Buffer.concat(chunks);
  } finally {
    await handle.close();
  }
}
