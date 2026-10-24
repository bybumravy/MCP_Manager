---
phase: 2
title: "Quản lý MCP"
status: in-progress
priority: P1
dependencies: [1]
---

# Phase 2: Quản lý MCP

## Context Links

- [Kế hoạch tổng](./plan.md), [Phase 1](./phase-01-start.md).
- [Đặc tả](./product-spec.md): mục 3.1/3.3 về MCP/JSON/copy; mục 4 về freshness; mục 5 về transaction/health checks.

## Overview

Inventory và safe CRUD cho MCP Claude Code trong capability đã verify. Tách lưu config, check của app và trạng thái session Claude: không có launcher hay session inspection.

## Tiến độ thực tế — 2026-10-24

- Đã nối UI → validated IPC → project `.mcp.json` thật: stdio/HTTP form, JSON một entry, tạo/sửa command hoặc URL/xóa, collision từ chối, native consent và Windows-encrypted backup/restore. Existing secret và unknown/unrelated fields được giữ; inventory không đưa raw env/args/headers/URL/command sang renderer.
- Writer chỉ bật sau chọn `claude.exe` và consent `--version`; hiện exact version 2.1.310. Isolated installed CLI probe xác nhận HTTP schema nhưng phát hiện `mcp add-json` xóa top-level field không liên quan, nên app dùng preserving adapter riêng, không CLI mutation.
- HTTP check là network handshake thật với endpoint đã lưu, consent từng lần, source recheck, timeout 10s/output 256 KiB/no redirect. JSON/SSE initialize, initialized, best-effort session DELETE; không tools/command/OAuth/helper. Result có fingerprint/timestamp; check failure không xóa server. Stdio checks chưa có.
- Native Electron tests đã chạy tạo/sửa/xóa/hủy/restore, secret/unknown preservation, denied-check zero requests, handshake loopback thật và authentication failure vẫn giữ cấu hình. Fixtures chỉ bảo vệ primary profile, không thay production bằng demo.
- Còn thiếu user/local writers, multi-entry selection, selective copy/secret re-entry wizard, đầy đủ form args/env/headers, stdio runner/tree cleanup, unified capability/managed evidence, preview/diff và release safety gates. Không đánh dấu phase hoàn tất.

## Requirements

- Functional: đọc local/user/project MCP, origin/path, transport, parse state, collision/shadow và read-only/managed reason. Managed/plugin/connectors chỉ có nhãn evidence khi quan sát được.
- Functional: stdio/HTTP form và dán JSON; schema input một entry hoặc mcpServers object theo đặc tả, không eval/execute. Multi-entry chọn entries trước preview, chọn scope rõ mỗi lần; SSE/WS/SDK unsupported.
- Functional: copy MCP chọn lọc đến source/project mới; không move, collision đổi tên/hủy. Không copy raw env/header/argv/URL secret hoặc unknown fields; allowlist safe fields, yêu cầu nhập lại missing values trước save. Cho nhập secret mới có mask, không vault/log/autosave/child argv secret.
- Functional: create/edit/delete theo scope verified; `.claude.json` chứa account/trust state nên patch hẹp, giữ unknown/unrelated fields. CLI-first chỉ khi preservation và side effects đã test.
- Functional: toggle enable chỉ nếu exact version/source semantics verified; không universal enabled flag, không approval/trust writer hoặc permission/settings editor.
- Functional: diff/confirm/snapshot/recheck/recovery qua Phase 1; masked placeholder không được ghi ngược làm mất secret.
- Functional: health check riêng có consent theo lần, target/command và side effects rõ, timeout/output/process bounds; không gọi arbitrary tool nghiệp vụ, không auto-approve `.mcp.json`.
- Functional: check result gắn timestamp, source identity/config fingerprint/context, ready cho Phase 4 invalidation; không lưu raw output/env/URL secret.

## Architecture

`mcp-adapter` có source-specific parser/writer và resolver riêng, không dùng settings precedence. Capability matrix kiểm version/source/transport/operation; thiếu safe route thì read-only.

`health-check` chỉ tạo process/network từ action có consent. Connector chỉ thực hiện handshake/metadata trong phạm vi verify; CLI diagnostics có thể chạy server/helper nên phải chứng minh và đưa vào consent. App không sandbox arbitrary command. Job Objects hoặc cơ chế tương đương đã kiểm chứng cleanup tree app sở hữu, không kill Claude/Orca/server khác.

Status tối thiểu: `configured/not checked`, `check passed`, `check failed`, `check stale`, `unsupported/unavailable`; failure connection không bị coi server unconfigured. Session active/connected luôn unknown nếu chỉ dựa vào file/check này.

## Related Code Files

Đã triển khai: `src/main/mcp/mcp-service.ts`, `src/main/mcp/http-health-check.ts`, `src/renderer/mcp-panel.tsx`, shared/preload/controller IPC routes; unit tests trong `tests/unit/mcp-service.test.ts`, `tests/unit/http-health-check.test.ts`; runtime/CLI probes trong `tests/integration/`. Các adapter còn thiếu mở rộng theo boundary này; chưa có subsystem copy hoặc stdio runner.

## Implementation Steps

1. Spike actual supported CLI versions trong isolated roots, phân biệt mutation với `list/get` có thể connect/helper. Không chạy tự động khi inventory.
2. Parse inventory và local > project > user precedence được verify; managed/plugin overlays giải thích riêng, unknown source không bị giả định absent.
3. Tạo form stdio/HTTP, conservative safe projection, fields giữ nguyên khi masked; duplicate/missing executable/malformed URL diagnostics không spawn command.
4. Wire preview/confirm/snapshot/write cho source supported; recheck config trước route ghi, preserve unrelated keys, capability đóng nếu route không đạt safety gate.
5. Toggle chỉ cho native mechanism đã verify; `disabledMcpServers` khác `disabledMcpjsonServers`, không sửa approval array để enable ngầm.
6. Xây consent/check runner, bounded process tree cleanup và sanitized evidence; result gắn fingerprints/timestamp, config save không tự check.
7. Xây JSON parse/select-entry flow và copy wizard; source/target fingerprint/absence recheck, name collision đổi tên/hủy, safe allowlist không copy secret, required input diagnostics. Không raw clipboard/history persistence.
8. Wire recovery/restore và freshness qua open/context/Refresh/pre-check, không watcher. UI Việt/Anh ghi checked-at/last-read-at, giữa hai lần đọc không claim realtime hoặc session status.

## Success Criteria

- [ ] Save thành công hiển thị configured/not checked; `claude mcp add` không được coi là connectivity/auth success.
- [ ] Health fail không undo saved config; health pass không chứng minh session Claude connected. Connection failure vẫn giữ inventory entry.
- [ ] Cancel/deny check không process/network; không implicit approval/trust mutation.
- [x] Project HTTP/stdio create/edit/delete preserve untouched unknown/private fields and unrelated top-level state; masked values are not written back.
- [ ] Complete scope coverage (user/local writers), selective copy and conflict/ownership requirements.
- [ ] Unsupported/managed/invalid JSON hoặc detected concurrent edit không bị writer sửa; restore từ chối post-write mismatch.
- [ ] Check result có fingerprint/timestamp/context, bounded output và cleanup chỉ app-owned tree; checked-at/last-read-at không realtime claim.
- [ ] Form/JSON input và selected multi-entry preview không execute/log raw input; scope phải chọn rõ, unsupported entry không silently drop.
- [ ] Copy không move/overwrite; collision rename/cancel, không tự chuyển secret/unknown values, required input thiếu thì không lưu cấu hình không hợp lệ.

## Validation

- Unit: scopes/origins, form/JSON schema/transport, invalid/ambiguous paste, multi-entry selection, safe projections/placeholder, toggle/capability/freshness.
- Copy tests: collision rename/cancel, source đổi sau preview, target xuất hiện giữa chừng, secret trong argv/URL/header/env/unknown keys không tự chuyển, required fields chưa nhập không save; strings Việt/Anh.
- Integration isolated roots: representative real-format source fixtures, malformed JSON, unknown/unrelated state preservation, concurrent edit/absence collision, CLI route side effects.
- Explicit runner tests trong isolated test environment: failed handshake/auth/DNS/timeout, oversized output, descendants cleanup; không arbitrary tool execution.
- E2E: create preview → cancel/confirm → snapshot/restore; save success/check fail riêng; denied check zero process/network; changed config stale result.

## Risk Assessment

- **CLI lacks CAS/has side effects:** snapshot không tạo atomic concurrency; route chỉ bật sau spike, residual race documented và unsafe capability giữ read-only.
- **Arbitrary stdio execution:** consent không biến app thành sandbox; không auto-test, không run scripts để kiểm executable.
- **Auth/OAuth:** chỉ báo authentication required/unknown; user xử lý bằng Claude ngoài manager. Không đọc token store hoặc xây credential vault.

## Rollback Notes

Mọi write có pre-write snapshot/absence marker và post-write fingerprint. Recovery/restore không overwrite external edits hoặc reset full `.claude.json` nếu unrelated fields đã đổi. Không force override hoặc sửa trust để làm health check pass.
