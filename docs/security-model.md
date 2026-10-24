# Security model

Updated: 2026-10-24. Implementation is in progress, not a production release certification.

## Threat boundaries

Claude configuration, instructions and skill resources are untrusted data and may contain secrets. Open/Refresh discovery must not execute content, invoke a CLI helper, access the network, read credential stores or mutate Claude files. Dedicated explicit actions may write supported source files or contact a saved HTTP MCP endpoint after native confirmation. Imported Markdown/scripts are never executed by the manager.

## Implemented controls

- Sandboxed Electron renderer, context isolation, Node integration disabled; bundled CommonJS preload has no arbitrary filesystem/shell/IPC endpoint.
- IPC validates the owning window, main frame and exact application document URL. Main resolves artifact IDs against freshly discovered registered roots; renderer paths are not write authority.
- Path checks reject traversal, junction/symbolic-link boundaries and linked ancestors. SHA-256 fingerprints and bounded reads support pre-write conflicts; tree bytes are aggregate-budgeted.
- Instructions writer only accepts supported Markdown paths. It preserves UTF-8 BOM/newline and exact no-op bytes, requires native management/save confirmation, and refuses stale drafts.
- Project MCP writes are version-gated to installed Claude Code 2.1.310 verified by an explicitly selected executable and separate `--version` consent. Cancellation/failure resets the verification gate. This is not executable identity verification. User/local `.claude.json`, settings, permissions and trust writers are not exposed.
- MCP inventory omits existing command/URL/args/env/header values. New JSON/endpoint inputs are visually masked. Endpoint edits retain untouched private/unknown fields. Collision means refusal, not replacement.
- Single-file changes snapshot original bytes with Windows async `safeStorage` encryption, flush a pending receipt, recheck before replacement and verify output. Restore requires current post-write fingerprint, checks decrypted snapshot hash against original fingerprint, and restores original absence/bytes. Settings/permissions restore is not allowed.
- HTTP checks require native consent every time, use saved configuration after a fresh fingerprint check, refuse redirects, bound initialization output to 256 KiB and apply a 10-second overall deadline. They send protocol initialization only, never business tools or commands. Authentication headers remain in main; no raw response/error output is returned to UI. Session cleanup is best effort within the deadline.
- App metadata stores registry/preferences separately; no watcher, tray, startup service, hidden monitoring, telemetry or cloud sync.

## Verified behavior

Unit tests exercise actual filesystem changes, encrypted snapshot integrity, external conflicts, absence collisions, no-op preservation, junction boundaries and HTTP JSON/SSE endpoints. The production Electron runtime test exercises UI save/restore, sandbox bridge, unrelated-window IPC rejection, MCP CRUD/cancellation/private-field preservation and real loopback HTTP requests. Denied checks produce zero requests; failed authentication leaves the configured entry intact. Fixtures and profile roots are isolated from the primary Claude profile.

The installed CLI preservation probe found `mcp add-json` drops unrelated top-level project JSON fields. It is therefore not used as the app's preserving writer.

## Remaining release blockers and limits

Fingerprints narrow, but do not eliminate, TOCTOU races with external writers. Explicit Windows ACL enforcement, 30 snapshots/30 days retention, pending recovery, tree transactions and durable ownership receipts remain incomplete. Unix mode arguments are not proof of Windows ACL isolation. Pending receipts are visible, not automatically recovered; no power-loss-proof directory durability claim is made.

Navigation/new-window/CSP hardening, unified capability projection, managed-policy discovery, bounded directory enumeration and full draft/context lifecycle still need work. HTTP checks do not implement OAuth, dynamic helpers, environment interpolation, legacy SSE or stdio. A check failure is not missing configuration, and a handshake pass is not proof that a running Claude session is connected. Before release, complete these controls and installer/native validation; do not treat a passing development suite as blanket safety certification.
