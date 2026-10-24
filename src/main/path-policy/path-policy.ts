import path from 'node:path';
import { lstat } from 'node:fs/promises';

export interface BoundaryCheck {
  state: 'approved' | 'outside' | 'unknown';
  resolvedPath: string;
  reason: string;
}

export function canonicalizePath(inputPath: string): string {
  if (!inputPath.trim()) {
    throw new Error('Path must not be empty.');
  }

  return path.resolve(inputPath);
}

export function isPathWithinBoundary(candidatePath: string, boundaryPath: string): boolean {
  const candidate = canonicalizePath(candidatePath);
  const boundary = canonicalizePath(boundaryPath);
  const relative = path.relative(boundary, candidate);

  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

export async function checkBoundary(candidatePath: string, boundaryPath: string): Promise<BoundaryCheck> {
  const resolvedPath = canonicalizePath(candidatePath);
  const boundary = canonicalizePath(boundaryPath);

  if (!isPathWithinBoundary(resolvedPath, boundary)) {
    return { state: 'outside', resolvedPath, reason: 'Path is outside the approved boundary.' };
  }

  const filesystemRoot = path.parse(resolvedPath).root;
  const relativePath = path.relative(filesystemRoot, resolvedPath);
  let currentPath = filesystemRoot;

  for (const component of relativePath.split(path.sep).filter(Boolean)) {
    currentPath = path.join(currentPath, component);
    try {
      const stats = await lstat(currentPath);
      if (stats.isSymbolicLink()) {
        return { state: 'unknown', resolvedPath, reason: 'A path component is a symbolic link or junction.' };
      }
    } catch (error) {
      const code = error instanceof Error && 'code' in error ? String(error.code) : 'unknown';
      if (code === 'ENOENT') {
        return { state: 'approved', resolvedPath, reason: 'Path is absent but inside the approved boundary.' };
      }

      return { state: 'unknown', resolvedPath, reason: 'Path could not be inspected safely.' };
    }
  }

  return { state: 'approved', resolvedPath, reason: 'Path is inside the approved boundary.' };
}
