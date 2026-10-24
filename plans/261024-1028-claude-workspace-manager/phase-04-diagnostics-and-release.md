---
phase: 4
title: "Permissions viewer, diagnostics và phát hành"
status: pending
priority: P1
dependencies: [2, 3]
---

# Phase 4: Permissions viewer, diagnostics và phát hành

## Context Links

- [Kế hoạch tổng](./plan.md), [MCP](./phase-02-mcp-management.md), [Skills/instructions](./phase-03-skills-and-profiles.md).
- [Đặc tả](./product-spec.md): mục 3.4 permissions, mục 4 Refresh/freshness, mục 5 recovery/storage, mục 6–7 UI/release gates.

## Overview

Hoàn thiện permissions chỉ đọc, Refresh/draft UX, diagnostics/recovery và per-user installer Việt/Anh. Theo quyết định phỏng vấn, **không watcher/tray/external change history**. Không launcher/session/Orca/Desktop hoặc permission editor.

## Requirements

- Permissions: allow/ask/deny filters, source/scope/key path/index/tool/pattern trong syntax verified, unknown/incomplete states. Giải thích deny → ask → allow và managed-only restrictions có evidence, không full command enforcement simulator.
- Settings projection read-only; không raw JSON writer, allow-all, trust/approval hoặc restore arbitrary settings. Không run sample commands để test permission. App consent khác quyền Claude.
- Refresh: đọc source khi open/context/manual Refresh; không monitoring/background. Dirty draft/source mismatch cần giữ draft và cho cancel/compare/discard rõ, không auto-merge/overwrite.
- Health freshness: checked-at/last-read-at/fingerprint/context; source liên quan đổi khi được đọc lại thì stale. Giữa hai reads không claim realtime/current-session status; pre-check read lại và consent từng lần.
- Diagnostics có evidence/source/timestamp/severity/action; không auto-fix/generic effective config, không lưu lịch sử external files hoặc actor attribution.
- Transaction history/snapshots: pre-write bytes, post-write restore conflict/absence/tree, pending recovery. Chỉ writer supported, không observed permissions/settings targets.
- Retention đã chọn 30 snapshots hoặc 30 ngày, giữ pending recovery; metadata export allowlist/non-restorable, no raw text/secret. Không observation baseline storage.
- Việt/Anh trong mọi screens/warnings/installer hướng dẫn; Windows native per-user installer cho vài người dùng, không machine-specific paths/admin mặc định/tray/autostart/updater/telemetry.

## Architecture

`permissions-view` chỉ projections, `diagnostics` tiêu thụ adapter facts, transaction storage phục vụ snapshots/recovery. Không `change-tracking` module, Changes page hoặc baseline service. Refresh dùng lại discovery/hash contracts; pre-write checks độc lập Refresh.

Shell đóng cửa sổ thì thoát sau xử lý dirty drafts/pending operations an toàn, không ẩn xuống tray. App-state chỉ lưu preferences (gồm language), registry/redacted receipts, không raw drafts/config. Update thủ công; signing cần certificate/policy thật trước claim signed artifact.

## Related Code Files

Đề xuất sau approval:

- Create: `src/main/permissions-view/`, `src/main/diagnostics/`.
- Create: `src/renderer/features/permissions/`, `src/renderer/features/diagnostics/`, `src/renderer/features/snapshots/`.
- Create: unit/integration/E2E/native-smoke tests, CI/build/per-user packaging configuration.
- Modify: adapters/discovery, journal/protected storage, app-state/IPC, Refresh/draft UI, locale resources.
- Create/update khi behavior thật: `docs/installation.md`, `docs/security-model.md`, `docs/troubleshooting.md`.
- Không watcher/tray/external history files hoặc dự phòng feature flags cho phạm vi đã bỏ.

## Implementation Steps

1. Verify permission source/list/managed rules theo CLI version; build read-only filters/warnings và incomplete states, không full matcher engine.
2. Wire open/context/Refresh → re-read sources; dirty draft handling và health stale evidence, last-read-at rõ. No background/network/process/source write từ refresh.
3. Xây diagnostics và transaction history/recovery preview theo pre/post fingerprints; no force rollback hoặc arbitrary settings restore.
4. Implement retention 30/30, pending recovery exclusion, storage failures và metadata-only export; kiểm logs/clipboard/app-state không raw source/secret.
5. Hoàn thiện Việt/Anh strings, technical evidence nguyên nghĩa, switch language/long-label/accessibility checks, draft close behavior và no tray lifecycle.
6. Focused tests rồi full unit/integration/E2E/lint/type/build, bao gồm MCP paste/copy secret omissions, skills copy/collisions/ownership và instructions preview/import boundaries.
7. Package per-user installer, native Windows 10 clean isolated profiles và vài supported CLI versions; verify install/launch/manual update/uninstall không sửa/xóa config Claude/backups ngầm. Signing khi prerequisites đủ.
8. Independent review và docs theo actual capabilities sau khi được phép implementation; chưa publish/distribute nếu chưa xác nhận kênh và artifact readiness.

## Success Criteria

- [ ] Permission viewer có source/evidence/unknown/incomplete, no settings/permission writer hoặc command simulation.
- [ ] Refresh/open/context không monitoring; no watcher/tray/history; đóng cửa sổ không để process theo dõi lại.
- [ ] Draft conflict giữ dữ liệu, pre-write checks luôn chạy; health checked-at/last-read-at không giả realtime/session state.
- [ ] Protected snapshots/retention 30/30 không prune pending recovery; metadata export không raw source/Markdown/secret.
- [ ] Restore tree/absence/post-write checks đúng, permissions/settings read-only không restore writer.
- [ ] Việt/Anh đầy đủ, per-user installer không hard-coded paths/admin bất ngờ, uninstall không xóa source/backup không xác nhận.
- [ ] Full tests/lint/type/build/native smoke và review đạt trước release; thiếu Claude vẫn mở; không scope creep ngoài user decisions.

## Validation

- Permission tests: category priority, merged observed lists, managed restrictions, unknown parser/mode/CLI/env evidence, broad warning false positives, no sample-command execution.
- Refresh/draft tests: edit ngoài app trước save/restore, dirty draft + Refresh/context/close, missing/unreadable source, freshness after read, no watcher/process/network in inspection.
- Copy/paste tests: JSON secrets không logs/export, collision rename/cancel, source/target races, required secret re-entry, skill full-tree integrity và SKILL.md-only editor.
- Recovery tests: restart pending journal, partial tree write, disk full/denied storage, restore mismatch, retention leaves recovery artifacts.
- Locale/release: Việt/Anh parity/switch/long labels, per-user paths trên isolated Windows profiles, no tray/startup registration, installer/uninstaller preserve sources/backups.
- Security pass: IPC/path boundary, Markdown static rendering, raw storage/metadata, app-owned process cleanup. Native smoke không primary real profile destructive testing. Đây là tests dự kiến, chưa chạy vì repo chưa có code.

## Risk Assessment

- **Không monitoring:** external edit chỉ được biết khi đọc lại, ghi checked-at/last-read-at đúng; pre-write conflict check bắt buộc dù UI cũ.
- **Permission drift:** unknown/incomplete thay vì kết luận enforcement sai.
- **Secrets:** original backups có raw values; ACL và allowlist export, không hứa regex mask mọi free-text secret.
- **Packaging/runtime:** Electron Windows 10 compatibility và signing prerequisites là gates thật; không tự đổi stack hoặc quảng cáo signed/production-ready khi chưa verify.

## Rollback Notes

Unsafe writer khóa capability giữ inventory, không gọi bản thiếu acceptance là MVP hoàn chỉnh. Không auto-revert external edits; pre-write checks không được bỏ vì đã Refresh. Uninstall không tự xóa backups/recovery/Claude source. Không thêm watcher/tray để thay giải pháp user đã bỏ.
