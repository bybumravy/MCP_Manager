export type ArtifactKind =
  | 'mcp'
  | 'skill'
  | 'instructions'
  | 'rules'
  | 'settings'
  | 'permissions';

export type ArtifactOrigin =
  | 'user'
  | 'project'
  | 'local'
  | 'managed'
  | 'plugin'
  | 'synced'
  | 'unknown';

export type ArtifactScope = 'user' | 'project' | 'local' | 'managed' | 'unknown';

export type ParseState =
  | 'missing'
  | 'unreadable'
  | 'valid'
  | 'invalid'
  | 'unsupported';

export type BoundaryState = 'approved' | 'outside' | 'unknown';

export type ReadOnlyReason =
  | 'passive-inventory'
  | 'managed-source'
  | 'plugin-source'
  | 'synced-source'
  | 'unverified-capability'
  | 'unsupported-source'
  | 'read-only-artifact'
  | 'unknown';

export type Fingerprint =
  | {
      kind: 'file';
      sha256: string;
      size: number;
      modifiedAtMs: number;
    }
  | {
      kind: 'directory';
      sha256: string;
      entryCount: number;
      modifiedAtMs: number;
    }
  | {
      kind: 'absence';
    };

export interface DiscoveredArtifact {
  id: string;
  kind: ArtifactKind;
  path: string;
  resolvedPath: string;
  origin: ArtifactOrigin;
  scope: ArtifactScope;
  parseState: ParseState;
  fingerprint: Fingerprint;
  boundary: BoundaryState;
  readOnlyReason: ReadOnlyReason;
  evidence: string[];
}

export interface ProjectRootRecord {
  path: string;
  addedAt: string;
}

export interface CapabilityEvidence {
  operation: 'read' | 'create' | 'update' | 'delete' | 'verify';
  artifact: ArtifactKind;
  status: 'enabled' | 'read-only' | 'unknown' | 'blocked';
  reason: string;
  evidence: string[];
}

export interface DiscoverySnapshot {
  checkedAt: string;
  configRoot: string;
  artifacts: DiscoveredArtifact[];
  capabilities: CapabilityEvidence[];
}
