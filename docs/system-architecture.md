# System architecture

Updated: 2026-10-24. Target: a working local configuration manager, not a demo or recommendation-only interface. Implementation is in progress; the sections below distinguish shipped code from pending requirements.

## Scope

The Windows Electron application uses a React renderer and a TypeScript main process. Passive discovery reads actual Claude source files, without CLI execution, network calls or watchers. The instructions editor reads and writes actual allowlisted Markdown targets after a native confirmation dialog, preserving UTF-8/BOM/newline and refusing stale drafts. Tests exercise the same implementation on isolated directories, never substitute fake production connections or write the primary Claude profile. Project `.mcp.json` create/update/delete is connected to the UI with a Claude Code 2.1.310 version gate. A separate consented HTTP MCP handshake performs real network requests; stdio checks, user/local MCP writers, selective copy and skills lifecycle remain required but incomplete.

## Process boundaries

- **Main process:** filesystem access, path policy, fingerprints, discovery, app-state persistence, and transaction journal primitives.
- **Preload:** a small allowlisted API exposed through `contextBridge`; no generic file, shell, or IPC endpoint.
- **Renderer:** React UI for inventory, registry, refresh, locale, allowlisted instructions text, project MCP forms/one-entry JSON, endpoint edit/delete, and HTTP check results. MCP inventory is metadata-only: existing command/URL/env/args/headers are not projected. New JSON and endpoint inputs are visually masked; source values stay in main.
- **Shared contracts:** typed artifact, capability, app-state, and IPC models.

Electron security defaults are `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`. The renderer has no direct Node.js access.

## Discovery behavior

Discovery resolves the Claude root using `CLAUDE_CONFIG_DIR` when present, otherwise the supplied home directory and `.claude`. It checks artifact-specific candidate paths for MCP, skills, instructions, rules, settings, and permissions. Missing, unreadable, invalid, and unsupported states remain distinct. The passive discovery table still describes inventory-only capabilities; dedicated panels apply their own operation gates. This capability projection is not yet unified. Instructions have a narrow writer; project MCP writes require explicit native consent to execute a selected `claude.exe --version` and an exact supported version. Version output is compatibility evidence, not executable authenticity proof.

Discovery does not infer effective runtime configuration, session state, connectivity, or approval/trust state. Project folders are explicitly registered by the user; removing a registry entry does not delete the folder.

## Safe foundation

- Canonical paths are checked against an approved boundary.
- Symbolic links are not silently approved.
- Fingerprints use SHA-256 and bounded file/directory traversal.
- App metadata is staged and renamed under Electron `userData`, separate from Claude sources; no claim of power-loss-proof directory durability.
- `FileTransactionStore` saves encrypted original bytes and a flushed pending receipt before staging/replacing a single file, then verifies bytes and records the post-write hash. Receipt metadata is validated when read, including dates, status, and fingerprint structure. Restore checks the post-write hash, verifies decrypted snapshot bytes against the original SHA-256, restores original absence or bytes, and refuses external edits. Pending receipts are visible but not automatically rolled back.
- Windows `safeStorage` encrypts raw snapshots; absent encryption blocks existing-file writes. Explicit per-user ACL enforcement and retention cleanup remain incomplete.
- Dedicated instructions open/save and transaction list/restore routes are exposed through a bundled sandbox preload. Main validates window, main frame, document URL, source identifier and supported target; the renderer has no arbitrary-path writer. Permission/settings restore is not allowed.
- Existing instructions require a native management/save confirmation each time (stricter than once); durable ownership receipts remain pending.

## MCP implementation and evidence

- `src/main/mcp/mcp-service.ts` patches parsed project JSON while preserving unrelated top-level/server fields and untouched secret fields. Names cannot overwrite existing entries. Endpoint edits change only command or URL; no trust/approval/settings mutation.
- An isolated installed CLI probe on 2026-10-24 confirmed Claude Code 2.1.310 writes the HTTP `.mcp.json` schema, but `mcp add-json` **removed an unrelated top-level field**. Consequently the app does not use CLI mutation as a preserving writer. Reproduce with `node tests/integration/verify-cli-project-schema.cjs <absolute-claude.exe>`; it uses temporary roots and does not connect.
- `http-health-check.ts` performs initialize, initialized, and best-effort session DELETE. JSON and SSE initialization responses are bounded to 256 KiB; total timeout is 10 seconds; redirects are refused. Saved static headers are used only in main. Dynamic header helpers, environment interpolation, OAuth, stdio and legacy SSE checks are unsupported. No business tools are called.
- Every check needs fresh native consent and a source fingerprint recheck. Results carry a fingerprint and timestamp; known configuration changes mark them stale and Refresh clears them. No watcher means undetected external changes remain possible until reread. A passed manager handshake does not establish a live Claude session connection. Authentication/network failures do not remove configuration.
- Native runtime tests drive UI create/edit/delete/cancel, unknown/secret preservation, encrypted restore, denied checks with zero requests, a successful real loopback handshake, and authentication failure retaining configuration. Loopback servers are test infrastructure; production uses the actual selected saved endpoint.

## Known limitations

A fingerprint narrows, but does not eliminate, TOCTOU races with external writers. The discovery parser currently records source shape and parse availability; artifact-specific semantic parsers and mutation adapters belong to later phases after installed-version evidence is collected.
