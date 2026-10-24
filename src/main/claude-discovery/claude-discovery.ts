import os from 'node:os';
import path from 'node:path';
import { access, readdir } from 'node:fs/promises';
import { readBoundedFile } from '../fingerprint/bounded-read';
import { checkBoundary } from '../path-policy/path-policy';
import { fingerprintPath } from '../fingerprint/fingerprint';
import type {
  ArtifactKind,
  ArtifactOrigin,
  ArtifactScope,
  BoundaryState,
  CapabilityEvidence,
  DiscoveredArtifact,
  DiscoverySnapshot,
  ParseState,
} from '../../shared/contracts';

const DISCOVERY_LIMITS = {
  maxDirectoryEntries: 2_000,
  maxFingerprintBytes: 16 * 1024 * 1024,
};

export interface DiscoveryOptions {
  projectRoots: string[];
  env?: NodeJS.ProcessEnv;
  homeDirectory?: string;
}

interface ArtifactCandidate {
  kind: ArtifactKind;
  path: string;
  origin: ArtifactOrigin;
  scope: ArtifactScope;
  boundaryRoot: string;
  directory?: boolean;
}

export async function discoverArtifacts(options: DiscoveryOptions): Promise<DiscoverySnapshot> {
  const homeDirectory = options.homeDirectory ?? os.homedir();
  const configRoot = resolveConfigRoot(options.env ?? process.env, homeDirectory);
  const candidates = buildCandidates(configRoot, options.projectRoots);
  const artifacts: DiscoveredArtifact[] = [];

  for (const candidate of candidates) {
    artifacts.push(await inspectCandidate(candidate));
  }

  return {
    checkedAt: new Date().toISOString(),
    configRoot,
    artifacts,
    capabilities: buildCapabilities(artifacts),
  };
}

export function resolveConfigRoot(env: NodeJS.ProcessEnv, homeDirectory: string): string {
  const configuredRoot = env.CLAUDE_CONFIG_DIR?.trim();
  return path.resolve(configuredRoot || path.join(homeDirectory, '.claude'));
}

function buildCandidates(configRoot: string, projectRoots: string[]): ArtifactCandidate[] {
  const userBoundaryRoot = path.dirname(configRoot);
  const candidates: ArtifactCandidate[] = [
    candidate('mcp', path.join(userBoundaryRoot, '.claude.json'), 'user', 'user', userBoundaryRoot),
    candidate('settings', path.join(configRoot, 'settings.json'), 'user', 'user', configRoot),
    candidate('permissions', path.join(configRoot, 'settings.json'), 'user', 'user', configRoot),
    candidate('instructions', path.join(configRoot, 'CLAUDE.md'), 'user', 'user', configRoot),
    candidate('rules', path.join(configRoot, 'rules'), 'user', 'user', configRoot, true),
    candidate('skill', path.join(configRoot, 'skills'), 'user', 'user', configRoot, true),
  ];

  for (const projectRoot of projectRoots) {
    const resolvedProjectRoot = path.resolve(projectRoot);
    const projectClaudeRoot = path.join(resolvedProjectRoot, '.claude');
    candidates.push(
      candidate('mcp', path.join(resolvedProjectRoot, '.mcp.json'), 'project', 'project', resolvedProjectRoot),
      candidate('settings', path.join(projectClaudeRoot, 'settings.json'), 'project', 'project', resolvedProjectRoot),
      candidate('permissions', path.join(projectClaudeRoot, 'settings.json'), 'project', 'project', resolvedProjectRoot),
      candidate('instructions', path.join(resolvedProjectRoot, 'CLAUDE.md'), 'project', 'project', resolvedProjectRoot),
      candidate('instructions', path.join(projectClaudeRoot, 'CLAUDE.md'), 'project', 'project', resolvedProjectRoot),
      candidate('instructions', path.join(resolvedProjectRoot, 'CLAUDE.local.md'), 'local', 'local', resolvedProjectRoot),
      candidate('rules', path.join(projectClaudeRoot, 'rules'), 'project', 'project', resolvedProjectRoot, true),
      candidate('skill', path.join(projectClaudeRoot, 'skills'), 'project', 'project', resolvedProjectRoot, true),
    );
  }

  return candidates;
}

function candidate(
  kind: ArtifactKind,
  artifactPath: string,
  origin: ArtifactOrigin,
  scope: ArtifactScope,
  boundaryRoot: string,
  directory = false,
): ArtifactCandidate {
  return { kind, path: artifactPath, origin, scope, boundaryRoot, directory };
}

async function inspectCandidate(candidate: ArtifactCandidate): Promise<DiscoveredArtifact> {
  const boundary = await checkBoundary(candidate.path, candidate.boundaryRoot);
  const id = `${candidate.kind}:${boundary.resolvedPath}`;
  const evidence = [boundary.reason, 'Passive inspection only; no process, network, credential store, or source mutation.'];

  if (boundary.state === 'outside' || boundary.state === 'unknown') {
    return createArtifact(candidate, id, boundary.resolvedPath, boundary.state, { kind: 'absence' }, 'unsupported', evidence);
  }

  try {
    await access(boundary.resolvedPath);
    const fingerprint = await fingerprintPath(boundary.resolvedPath, {
      maxEntries: DISCOVERY_LIMITS.maxDirectoryEntries,
      maxBytes: DISCOVERY_LIMITS.maxFingerprintBytes,
    });
    const parseState = fingerprint.kind === 'absence'
      ? 'missing'
      : await inferParseState(candidate, fingerprint.kind === 'directory', boundary.resolvedPath);
    return createArtifact(candidate, id, boundary.resolvedPath, boundary.state, fingerprint, parseState, evidence);
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? String(error.code) : 'unknown';
    const parseState: ParseState = code === 'ENOENT' ? 'missing' : 'unreadable';
    return createArtifact(candidate, id, boundary.resolvedPath, boundary.state, { kind: 'absence' }, parseState, [
      ...evidence,
      'Content was not parsed by Phase 1 discovery.',
    ]);
  }
}

async function inferParseState(candidate: ArtifactCandidate, isDirectory: boolean, filePath: string): Promise<ParseState> {
  if (candidate.directory) return isDirectory ? 'valid' : 'invalid';
  if (isDirectory) return 'invalid';
  if (!['mcp', 'settings', 'permissions'].includes(candidate.kind)) return 'valid';

  try {
    const raw = new TextDecoder('utf-8', { fatal: true }).decode(await readBoundedFile(filePath, DISCOVERY_LIMITS.maxFingerprintBytes));
    JSON.parse(raw);
    return 'valid';
  } catch {
    return 'invalid';
  }
}

function createArtifact(
  candidate: ArtifactCandidate,
  id: string,
  resolvedPath: string,
  boundary: BoundaryState,
  fingerprint: DiscoveredArtifact['fingerprint'],
  parseState: ParseState,
  evidence: string[],
): DiscoveredArtifact {
  return {
    id,
    kind: candidate.kind,
    path: candidate.path,
    resolvedPath,
    origin: candidate.origin,
    scope: candidate.scope,
    parseState,
    fingerprint,
    boundary,
    readOnlyReason: 'passive-inventory',
    evidence,
  };
}

function buildCapabilities(artifacts: DiscoveredArtifact[]): CapabilityEvidence[] {
  const kinds = new Set(artifacts.map((artifact) => artifact.kind));
  const allKinds: ArtifactKind[] = ['mcp', 'skill', 'instructions', 'rules', 'settings', 'permissions'];
  return allKinds.flatMap((artifact) => [
    {
      operation: 'read' as const,
      artifact,
      status: kinds.has(artifact) ? 'read-only' as const : 'unknown' as const,
      reason: kinds.has(artifact) ? 'Discovery observes sources; it does not establish runtime effective configuration.' : 'No source was observed.',
      evidence: kinds.has(artifact)
        ? ['Artifact-specific discovery is present; this snapshot does not report runtime session state.']
        : ['Source not observed in configured roots.'],
    },
    {
      operation: 'create' as const,
      artifact,
      status: 'blocked' as const,
      reason: 'Writer capability is not enabled in Phase 1.',
      evidence: ['No verified mutation adapter exists.'],
    },
  ]);
}

export async function listManagedProjectRoots(projectRoots: string[]): Promise<string[]> {
  const validRoots: string[] = [];
  for (const root of projectRoots) {
    const boundary = await checkBoundary(root, root);
    if (boundary.state !== 'approved') continue;
    try {
      const entries = await readdir(boundary.resolvedPath, { withFileTypes: true });
      if (entries) validRoots.push(boundary.resolvedPath);
    } catch {
      // Invalid or unreadable registry entries stay out of discovery.
    }
  }
  return [...new Set(validRoots)];
}
