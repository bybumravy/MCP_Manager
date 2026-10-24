---
phase: 1
title: "Nền tảng và thao tác tệp an toàn"
status: in-progress
priority: P1
dependencies: []
---

# Phase 1: Nền tảng và thao tác tệp an toàn

## Implementation status — 2026-10-24

User đã cho phép code tiếp đến sản phẩm thật. Đã có shell, discovery, bounded JSON parsing, bundled sandbox preload, sender/frame/URL IPC validation, serialized IPC, root/ancestor junction guards và aggregate byte budget. Single-file transactions thực sự lưu encrypted original bytes, pending/committed receipt và post-write hash; receipt fields/fingerprints được validate fail-closed, restore xác minh snapshot hash. UI instructions save/restore đã được kiểm bằng Electron production trên Windows 10. Còn thiếu tree manifest/transactions, recovery UX đầy đủ, explicit ACL/retention và installed-CLI verification. Unit suite (33 tests at 2026-10-24 16:16; 36 tests following added transaction receipt regressions), typecheck, build và production Electron smoke passed; lint là typecheck alias, không có static lint configuration. Không đánh dấu phase complete.

## Context Links

- [Kế hoạch tổng](./plan.md)
- [Đặc tả](./product-spec.md): mục 3–5 về sources, Refresh, transactions; mục 6 về stack/UI; mục 9 về vấn đề chưa chốt.

## Overview

Xây nền tảng desktop Windows và safe IO trước writer MCP/skills/instructions. User chọn Electron + React + TypeScript nếu spike tương thích Windows 10 native; chỉ scaffold sau khi được duyệt triển khai. Shell có Việt/Anh từ đầu, không tray/background/watcher. Phase này không sửa cấu hình Claude thật.

## Requirements

- Functional: app mở được khi thiếu Claude/config; registry chỉ chứa folder user chọn. Bỏ registry không xóa folder; không launcher, terminal/session manager hoặc Orca integration.
- Functional: passive inventory có resolved path, artifact kind, origin/scope, parse state, fingerprint/absence, boundary và read-only reason cho MCP, skills, instructions/rules, settings/permissions.
- Functional: resolver riêng theo artifact; ancestor/import/nested sources không được tự vượt root đã cho phép. Không coi observed sources là runtime effective config.
- Functional: version không xác minh được thì `unverified`; muốn chạy executable xác minh CLI phải là action riêng có consent, timeout và argv cụ thể. Refresh không tự exec.
- Functional: capability matrix ghi evidence theo version/source/operation; unknown/read-only/managed fail closed. Chưa có adapter được chứng minh thì không mở writer UI.
- Functional: safe transaction hỗ trợ single-file, absence marker và tree manifest, snapshot byte gốc, pre/post fingerprints, durable journal và recovery.
- Non-functional: first scan/refresh không process/network/credential file read/source mutation. Có thể lưu metadata giao dịch trong protected app storage, không tạo file Claude.
- Non-functional: narrow typed/validated IPC; sandbox renderer, contextIsolation on, nodeIntegration off; không generic file/shell endpoint.

## Architecture

Main giữ filesystem, source discovery, transaction và protected storage. JSON app-state lưu registry/preferences/pointers/redacted metadata; không raw source/secret. Shared contracts phải đủ cho observed sources, content freshness, editor draft conflict và permission view read-only mà không tạo generic writer.

Config view dùng allowlist projection; raw JSON/unknown values không tự chuyển sang renderer. Markdown editor Phase 3 và JSON/secret input Phase 2 là ngoại lệ có mục đích: raw text user chọn/nhập tới dedicated editor/form, không log/export/autosave. Snapshot raw storage tách khỏi metadata, ACL theo user; không tự export/cloud, không observation baseline/history.

Transaction chuẩn bị patch/manifest → preview/confirm → fingerprint recheck → snapshot+journal durable → stage/write → validate/post fingerprint. Không tuyên bố multi-file atomic hoặc hash check loại bỏ hết TOCTOU với external writers.

## Related Code Files

Implemented and evolving files:

- `src/main/{app-state,claude-discovery,config-transaction,ipc,path-policy,fingerprint,instructions,mcp}/`, `src/preload/`, `src/renderer/`, `src/shared/contracts/`.
- `tests/unit/`, `tests/integration/electron-runtime*.cjs`, architecture/security docs.
- Still outstanding: tree transactions/recovery/retention/ACL; renderer navigation/CSP/dirty exit and unified capabilities; release packaging. No profiles/launcher/Claude Desktop abstractions.

## Implementation Steps

1. Sau approval, spike Electron/toolchain trên Windows 10 target trước khi pin versions; báo nếu runtime không tương thích, không tự đổi stack.
2. Tạo shell và registry thủ công; resolve default/custom config roots theo evidence `CLAUDE_CONFIG_DIR`, không suy luận bằng thay chuỗi đường dẫn.
3. Xây path policy/canonicalization, approved boundaries, symlink/junction checks và size/file-count limits; revalidate target trước commit.
4. Discovery đọc nguồn hỗ trợ, giữ missing/unreadable/invalid/unsupported riêng; không đọc credentials, conversation history hay auto-memory store.
5. Thiết kế capability matrix và action xác minh CLI có consent; test mutation routes trong isolated fixtures, không source thật.
6. Xây transaction/snapshot/journal state machine, tree manifest và original absence; kiểm handle/share/replace behavior Windows và CLI side effects/CAS limitations trước bật capability.
7. Xây protected storage, metadata projection/export allowlist, transaction receipts/recovery và IPC. Scope create/import/copy phải chọn mỗi lần, không default global/project; source/target fingerprints và absence check dùng lại cho copy.
8. Shell Việt/Anh qua locale resources và language switch; read khi open/context/Refresh, dirty-draft/context/close contract, không tray/watcher/startup. Existing local skill/instructions nhận quản lý lần đầu bằng receipt, không source marker.

## Success Criteria

- [x] Thiếu Claude/config vẫn mở UI, không tạo source file Claude hay tự chạy CLI during passive open/Refresh. Desktop fixture verifies UI, sandbox bridge, Refresh, locale persistence and registry removal; MCP/CLI actions now require explicit consent.
- [ ] Artifact-specific discovery/capability and all remaining foundation safety gates below.
- [ ] Passive inventory không exec/network/credential read/source write; version unverified không bị suy đoán supported.
- [ ] Artifact-specific discovery, boundary và source confidence được thể hiện, không giả lập runtime đầy đủ.
- [ ] Snapshot+journal tồn tại trước write trong fixture; external modification/absence collision trước commit thì abort.
- [ ] Pending recovery không tự force rollback; restore so với post-write fingerprint, giữ unrelated `.claude.json` state.
- [ ] IPC không cho arbitrary path/write/shell; config values được project an toàn, Markdown editor exception có boundary rõ.

## Validation

- Unit: resolver per artifact, canonical paths, projections/redaction, fingerprints/absence, journal state machine.
- Integration temp roots: missing/invalid/unreadable source, custom root, denied boundary, symlink/junction escape, disk/storage failure, interruptions và concurrent modification.
- Transaction tests: create/delete/tree restore, no-op preserves bytes, post-write mismatch refuses restore, pending recovery survives app restart.
- Desktop smoke: thiếu Claude, add/select/remove registry folder, partial inventory; assert no process/network/source writes during inspection.

## Risk Assessment

- **Runtime compatibility:** Windows 10 phải được kiểm tra thực tế; không claim dựa vào framework name. Chuyển stack cần review/approval.
- **TOCTOU:** recheck thu hẹp chứ không triệt tiêu race; capability không đạt safety gate giữ read-only, ghi rõ residual risk đã đo.
- **Raw storage:** snapshot có thể chứa secret; ACL không chống malware/admin cùng quyền. Portable encryption chưa nằm trong phase.

## Rollback Notes

Phase này chỉ thử writer bằng isolated fixtures, không sửa cấu hình thật. App-state có schema version/recovery; tắt mutation capabilities nếu foundation chưa chứng minh an toàn, không vô hiệu hóa safeguards để vượt gate.
