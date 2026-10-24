---
phase: 3
title: "Skills và instructions/rules"
status: in-progress
priority: P1
dependencies: [1]
---

# Phase 3: Skills và instructions/rules

## Implementation status — 2026-10-24

Instructions user/project/local đã có dedicated editor UI → IPC → real file transaction, UTF-8/BOM/newline preservation, stale-draft refusal, native management/save consent, encrypted backup và restore so với post-write hash. Electron runtime test thực sự sửa/khôi phục fixture qua UI. Preview hiện là escaped text comparison, chưa Markdown rendering. Rules target validator có unit coverage nhưng rules chưa có picker/discovery từng file. Skills lifecycle, import graph, durable first-management receipt và đầy đủ dirty-context behavior chưa hoàn tất. Không coi các phần này là demo thay thế sản phẩm.

## Context Links

- [Kế hoạch tổng](./plan.md), [Phase 1](./phase-01-start.md).
- [Đặc tả](./product-spec.md): mục 3.2–3.3 về skills/instructions/copy; mục 4–5 về Refresh/safe IO/editor boundary.
- Giữ tên file cũ `phase-03-skills-and-profiles.md` để không làm hỏng liên kết hiện có. **Profiles không phải deliverable**, kể cả profile design; tiêu đề và nội dung phase này đã thay thế phạm vi cũ.

## Overview

Quản lý local skill theo directory tree đầy đủ; thêm editor `CLAUDE.md`, `CLAUDE.local.md` và rules Markdown. Cả hai dùng transaction nền tảng nhưng có discovery/loading semantics riêng. Không execute nội dung, không claim session đã nạp file vừa lưu.

## Requirements

### Skills

- Inventory user/project skills với exact `SKILL.md`, frontmatter/parse result, origin/scope, tree manifest và collision evidence. Frontmatter chỉ nhận khi delimiter bắt đầu đúng đầu file.
- Local directory import/copy toàn bộ tree/resources, chọn scope mỗi lần; collision chỉ đổi tên/hủy, không overwrite/move. Chặn traversal/junction escapes; không Git/ZIP/download/package install hoặc execute scripts/dynamic interpolation.
- Editor skill chỉ sửa SKILL.md; resources khác giữ đầy đủ, không script editor. Copy giữa scope/project dùng source+target fingerprint/absence check, không tự rewrite relative references, cảnh báo source-specific paths.
- Full-tree free text không thể chứng minh secret-free; manifest review/policy block credential-like files theo đặc tả, không silently drop resources hoặc hứa regex loại mọi secret.
- Create/edit/archive/remove/restore chỉ cho local tree đã xác nhận nhận quản lý lần đầu, có content fingerprint; existing local instructions cũng cần xác nhận lần đầu. Không coi mọi skill tìm được là app-owned.
- Enterprise/managed/plugin/synced/reserved sources read-only; enterprise > personal > project giải thích riêng với plugin namespace.
- `disable-model-invocation` và `user-invocable` không là full-disable. Native override/toggle cần version evidence; chưa verify thì archive ngoài discovery roots, nhãn archived.

### Instructions và rules

- Xem/tạo/sửa user/project/local instructions và user/project rules trong boundary hỗ trợ; managed source read-only, ancestor/import/nested source có origin và read-boundary rõ.
- Instructions cộng dồn theo discovery; không dùng settings winner/override, không khẳng định tất cả nested/path rules đã active ở runtime.
- Imports resolve theo file chứa import, bỏ literal trong code spans/fences; chỉ đọc target trong approved roots. External target reference có badge, không tự follow hoặc sửa Claude approvals.
- Có cycle/depth/file-count/bytes guards theo parser/version verified. `paths` frontmatter/glob chưa hỗ trợ thì unknown, không false-negative rule applicability.
- Markdown editor UTF-8, giữ newline và bytes khi no-op; encoding unsupported read-only. Preview tĩnh đã sanitize/escape, không scripts/remote fetch/images/iframe.
- Free-text editor có thể chứa secret: chỉ mở file user chọn, raw text được phép tới editor đó; không logs/export/telemetry. Không hứa regex phát hiện mọi secret.
- Permission/settings JSON không target của editor. `AGENTS.md`/auto-memory ngoài writer MVP; hiển thị giới hạn nếu chúng ảnh hưởng instruction discovery của CLI đã cài.

## Architecture

`skill-adapter` quản lý tree, `instructions-adapter` quản lý Markdown/source/import graph; cùng dùng path policy, snapshot/journal và IPC hẹp. Không tạo generic arbitrary-file editor. Parser không execute Markdown, shell injection hoặc imported instructions.

Draft editor giữ base fingerprint; save luôn re-read, không có watcher/tray/external history. Refresh/chuyển context/close phải xử lý dirty draft, conflict giữ draft, không tự ghi đè/auto-merge. Editor strings và warnings Việt/Anh. Tạo local instructions không tự chỉnh `.gitignore`.

## Related Code Files

Đề xuất sau approval:

- Create: `src/main/skill-adapter/`, `src/main/instructions-adapter/`.
- Create: `src/renderer/features/skills/`, `src/renderer/features/instructions/`.
- Create: tests unit/integration/E2E tương ứng cho skills/instructions và static preview.
- Modify: discovery, path policy, transaction tree manifest, protected storage và editor IPC contracts Phase 1.
- Không tạo `docs/profile-design.md` hoặc profiles API/model trong MVP.

## Implementation Steps

1. Verify installed-version skill/instruction sources, precedence/loading và reserved/read-only origins trong isolated fixtures.
2. Xây tree scanner có resource bounds, SKILL.md validator/manifest; không execute supporting files.
3. Xây skill inventory và nhận quản lý existing local tree; import/copy wizard chọn scope/name rõ mỗi lần, collision đổi tên/hủy → preview manifest/path warnings → staged transaction. Không editor ngoài SKILL.md.
4. Xây create/edit/archive/remove/restore tree với fingerprints; archive ngoài root discovery, không thay flags để giả disable.
5. Xây instructions source tree và Markdown editor/preview sandbox; whitelist target/source/encoding, draft/base fingerprint và no-op behavior.
6. Parse imports/paths subset verified với boundary/limits/unknown states; diagnostics exact duplicate, invalid metadata, missing reference có evidence, không semantic-conflict AI checker.
7. Wire preview/confirm/snapshot/save và reload guidance; emit receipt/fingerprint cho Phase 4, kiểm editor không sửa settings/managed targets qua IPC.

## Success Criteria

- [ ] Import giữ đầy đủ skill resources và không chạy code; invalid/missing SKILL.md chỉ tạo diagnostic, không phá tree.
- [ ] Local existing skill cần nhận quản lý trước mutation; managed/plugin/synced/reserved source không thể ghi qua UI/IPC.
- [ ] Scope collision dùng đúng skill semantics; archive/restore có tree conflict checks và không claim full-disable/active runtime.
- [ ] Instructions/rules writable đúng source; no-op giữ bytes, unsupported encoding read-only, create không auto-edit gitignore.
- [ ] Imports relative containing file, code literals, cycle/depth/boundary cases đúng; external target không được tự đọc/approve.
- [ ] Cumulative/on-demand/unknown states hiển thị đúng; paths syntax chưa test không được coi là chắc chắn không áp dụng.
- [ ] Markdown preview không execute/fetch; logs/export không raw Markdown; concurrent edit giữ draft và abort save.
- [ ] Copy skill full tree tới explicit scope, collision rename/cancel, không move/overwrite hoặc silently drop resources; editor chỉ SKILL.md.
- [ ] Existing local skill/instructions xác nhận lần đầu; dirty draft + Refresh/context/close giữ dữ liệu; Việt/Anh đúng semantics.
- [ ] Không profiles deliverable, permission/settings writer hoặc launcher nằm trong phase.

## Validation

- Unit: frontmatter-first, reserved names/origin/precedence, manifests, import parsing, paths subset/unknown, UTF-8/newline/no-op.
- Integration temp roots: resources/binary files, large trees/limits, collisions, symlink/junction escapes, staged copy interruption, archive/restore external mutation.
- Editor tests: plain text containing secret-like strings không vào logs/export; escaped/raw HTML/script/image content không execute/network; import ngoài root không read.
- E2E: inspect → nhận quản lý/import → preview/cancel/confirm → archive/restore; instructions edit → external edit → save conflict giữ draft; reload guidance không claim session loaded.

## Risk Assessment

- **Executable skill resources:** coi là untrusted data, không thực thi để validate/preview.
- **Instructions không là enforcement:** static graph chỉ giải thích observed sources, không xác minh runtime/trust hoặc mâu thuẫn ngữ nghĩa.
- **Directory recovery/drafts:** recheck tất cả affected paths; draft có thể chứa secret nên không persist vào metadata/logs mặc định.

## Rollback Notes

Tree/Markdown transactions có pre-write bytes/manifest/absence marker và post-write fingerprints. Recovery chỉ chạm đúng paths của transaction còn khớp; external edits dừng restore. Giữ read-only inventory nếu writer chưa đạt gate, không mở generic editor thay thế.
