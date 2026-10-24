import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

export class ProtectedStorage {
  public constructor(private readonly root: string) {}

  public async writeMetadata(relativePath: string, value: unknown): Promise<void> {
    const destination = this.safePath(relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  }

  private safePath(relativePath: string): string {
    if (!relativePath || path.isAbsolute(relativePath)) throw new Error('Storage path must be relative.');
    const root = path.resolve(this.root);
    const destination = path.resolve(root, relativePath);
    const relative = path.relative(root, destination);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error('Storage path escapes protected storage.');
    }
    return destination;
  }
}
