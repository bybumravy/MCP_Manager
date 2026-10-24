---
title: "Claude Workspace Manager"
description: "App Windows quản lý Claude Code; MCP/skills/instructions/permissions, không launcher hoặc monitoring."
status: in-progress
priority: P1
tags: [claude-code, mcp, skills, instructions, windows, desktop]
created: 2026-10-24
updated: 2026-10-24
---

# Claude Workspace Manager

## Trạng thái và tài liệu

**Đang triển khai, đã được user yêu cầu code hoàn chỉnh ngày 2026-10-24.** User xác nhận: app phải làm thật, không demo hoặc chỉ đề xuất; yêu cầu cập nhật cả tài liệu. Production đọc nguồn filesystem thật; writer đi qua validated IPC, xác nhận thao tác, snapshot mã hóa và kiểm tra xung đột. Tests dùng fixtures riêng để không ghi cấu hình cá nhân. Không coi kiểm thử shell là hoàn thành sản phẩm. Ngày 2026-10-24: bounded JSON discovery được typecheck/test; transaction receipt parsing được siết fail-closed cho status/date/fingerprint và trước/sau phù hợp, snapshot restore kiểm tra SHA-256 gốc. Regression tests đã bắt đầu từ RED; focused/full suite (36 tests sau regression additions), typecheck, build và Electron production smoke đã pass. `npm run lint` hiện chỉ lặp typecheck, chưa có lint engine riêng.

Đặc tả chuẩn: [product-spec.md](./product-spec.md). Đã có Electron/React/TypeScript, discovery và tests. UI instructions đã nối thao tác đọc/sửa/backup/restore file thật; MCP project CRUD và HTTP handshake thật đã nối UI; user/local writers, stdio check, copy, skill lifecycle, rules UI, permissions viewer và installer chưa hoàn tất.

## Phạm vi đã chốt

Cho người dùng và vài người khác, **Windows native**, installer per-user, UI Việt/Anh. Không cần Claude API/API key để quản lý.

| Trong bản đầu | Ngoài phạm vi |
|---|---|
| Chỉ Claude Code, folder selector quản lý config | Claude Desktop, WSL/macOS/Linux, launcher/terminal/session/Orca integration |
| MCP stdio/HTTP form + dán JSON, copy chọn lọc | Marketplace/Git/ZIP/URL/package import, trust/approval writer |
| Local full-tree skill import/copy, chỉ sửa SKILL.md | Script/resource editor hoặc tự execute skill |
| CLAUDE.md/CLAUDE.local.md/rules editor | Hooks/subagents/plugins/profiles managers (deferred) |
| Permissions/settings sources chỉ đọc | Permission editor/generic settings writer/runtime command simulator |
| Refresh, diagnostics/diff/backup/restore/transaction history | Watcher/tray/background/startup/external change history/baseline |

- Cả bốn nhóm đều cần bản đầu, không có ưu tiên cắt nhóm từ câu trả lời multi-select.
- Scope chọn rõ mỗi lần thêm/import/copy; copy không move, collision chỉ rename/cancel; MCP secret phải nhập lại ở đích, không auto-copy.
- Existing local skill/instructions xác nhận nhận quản lý lần đầu. Managed/plugin/synced luôn read-only.
- Health check hỏi từng lần, không auto-run; backups 30 bản hoặc 30 ngày, giữ pending recovery.
- Electron + React + TypeScript được chọn **nếu tương thích Windows 10**. CLI chưa verify thì read-only. Chưa pin runtime versions.
- Không monitoring nhưng **vẫn re-read/fingerprint trước save/restore**. Instruction loading cộng dồn/on-demand, không dùng chung settings precedence. Không khẳng định session Claude đã nạp/kết nối.

## Các giai đoạn

| # | Giai đoạn | Trạng thái | Phụ thuộc |
|---|---|---|---|
| 1 | [Nền tảng và thao tác tệp an toàn](./phase-01-start.md) | In progress — shell/native runtime, single-file transaction; tree/recovery/ACL/retention còn thiếu | Đã được phép triển khai |
| 2 | [Quản lý MCP](./phase-02-mcp-management.md) | In progress — project CRUD/HTTP handshake thật; user/local/copy/stdio còn thiếu | Phase 1 primitives in place; not complete |
| 3 | [Skills và instructions/rules](./phase-03-skills-and-profiles.md) | In progress — instructions editor/backup/restore thật; skill/rules còn thiếu | Single-file primitives exist; Phase 1 incomplete |
| 4 | [Permissions viewer, diagnostics và phát hành](./phase-04-diagnostics-and-release.md) | Pending | Phase 2, 3 |

Tên file Phase 3 giữ nguyên vì liên kết cũ; không profiles deliverable. Chưa phase nào được đánh dấu hoàn thành toàn bộ. Ngày 2026-10-24 đã tái hiện và sửa preload sandbox failure, chặn IPC từ cửa sổ khác, junction trên root và aggregate tree read budget. `npm run test:desktop` dùng Electron production thật; assertions bao gồm UI save/restore trên fixture và Windows-encrypted snapshot, không chỉ process launch.

## Phụ thuộc và cách triển khai

`Approval → Phase 1 → Phase 2 và Phase 3 → Phase 4`. Đây là thứ tự phụ thuộc kỹ thuật. Có thể điều chỉnh thứ tự hoặc chạy song song khi người triển khai kiểm soát được shared contracts và conflict.

Các phase chỉ mô tả deliverable, dependency, acceptance criteria và safety gates. Không ngầm tách nhóm người dùng yêu cầu khỏi bản đầu.

## Tiêu chí thành công

- [ ] Windows native/per-user installer/Việt-Anh, thiếu Claude vẫn mở; no launcher/Orca/Desktop/monitoring/tray.
- [ ] Passive read không exec/network/read credential/source mutation, unknown capability read-only; chỉ app metadata ghi vào protected storage.
- [ ] MCP form/JSON/copy, explicit scope, no overwrite/secret transfer/approval writes; giữ unknown/unrelated state và secret chưa sửa trong edit.
- [ ] Skill full-tree local import/copy, chỉ SKILL.md editor; ownership confirmation và read-only origins đúng; free-text secret limitation rõ.
- [ ] Instructions cumulative/imports/path boundaries, UTF-8/no-op bytes, static preview và draft conflicts an toàn.
- [ ] Permissions/settings chỉ đọc cả UI/IPC/restore, evidence/incomplete state; no sample commands/enforcement simulation.
- [ ] Refresh/open/context không monitoring; checked-at/last-read-at rõ, pre-write fingerprint độc lập Refresh.
- [ ] Transaction snapshot/journal/absence/tree/post-write restore, protected backup 30/30/pending recovery và metadata-only export.
- [ ] Full focused/broad tests/lint/type/build/native smoke/review trước release; không hide failure hoặc claim tests đã chạy khi chưa code.

## Validation Log

### Session 1 — 2026-10-24

**Trigger:** Người dùng yêu cầu hỏi thêm để clear toàn dự án và sửa sai sót. **Questions asked: 21**, chia nhóm; câu 21 làm rõ việc bỏ monitoring, thay thế câu trả lời tray trước đó. Không agents/implementation.

Options dưới đây dùng nhãn đã trình bày; `(R)` chỉ lựa chọn được đề xuất, không ngầm user approval trước trả lời.

1. **[Audience] Bạn muốn bản đầu phục vụ ai để mình chọn đúng mức độ đóng gói, hướng dẫn và cấu hình?**
   - Options: Chỉ tôi dùng | Tôi và vài người khác | Phát hành công khai.
   - Answer: **Tôi và vài người khác**. Impact: onboarding/per-user setup, không hard-code máy cá nhân.
2. **[Environment] Claude Code bạn muốn app quản lý đang chạy ở những môi trường nào?**
   - Options: Windows native | Chỉ WSL | Cả Windows và WSL | Nhiều hệ điều hành.
   - Answer: **Windows native**. Impact: không WSL adapter.
3. **[Priority] Trong bản đầu có thể dùng được, bạn muốn ưu tiên hoàn thiện những việc nào trước? Chọn tối đa hai mục; các mục còn lại không tự bị loại khỏi phạm vi.**
   - Options: Quản lý MCP | Quản lý skills | CLAUDE.md và rules | Kiểm soát thay đổi.
   - Answer: **Cả bốn mục**. Không tự ép thành hai hoặc cắt scope; phần theo dõi sau đó bị hủy rõ ở câu 21, safety diff/backup giữ.
4. **[Scope] Khi thêm MCP hoặc skill, app nên mặc định đề xuất phạm vi nào để tránh ảnh hưởng nhầm các dự án khác?**
   - Options: Chọn rõ mỗi lần (R) | Theo project đang chọn | Dùng chung toàn user.
   - Answer: **Chọn rõ mỗi lần**. Impact: wizard không default global/project.
5. **[MCP input] Bạn muốn thêm cấu hình MCP bằng những cách nào trong bản đầu?**
   - Options: Form và dán JSON (R) | Chỉ form hướng dẫn | Form, JSON và import file.
   - Answer: **Form và dán JSON**. Impact: schema/select/preview, không file-import feature.
6. **[Skills input] Bạn muốn lấy skill từ những nguồn nào ngay trong bản đầu?**
   - Options: Chỉ thư mục local | Local và GitHub | Local, GitHub và ZIP.
   - Answer: **Chỉ thư mục local**. Impact: no download/extract adapters.
7. **[Skill edit] Trong app, bạn cần chỉnh đến mức nào đối với tài nguyên nằm trong một skill?**
   - Options: Chỉ SKILL.md (R) | Mọi file văn bản | Chỉ import và quản lý.
   - Answer: **Chỉ SKILL.md**. Impact: preserve resources, no generic skill IDE.
8. **[Reuse] Khi muốn dùng lại MCP hoặc skill ở project khác, bản đầu có cần chức năng sao chép giữa các phạm vi không?**
   - Options: Chưa cần | Copy có chọn lọc (R) | Copy và chuyển phạm vi.
   - Answer: **Copy có chọn lọc**. Impact: source/target checks, no move/profile.
9. **[Permissions] Phần quyền của Claude Code trong bản đầu nên chỉ giúp bạn hiểu quyền đang cấu hình, hay cần chỉnh sửa trực tiếp?**
   - Options: Chỉ xem (R) | Xem và chỉnh rule.
   - Answer: **Chỉ xem**. Impact: no permission writer.
10. **[Secrets] Nếu cấu hình MCP cần token/header/env nhạy cảm, bạn muốn app xử lý việc nhập và sao chép chúng thế nào?**
    - Options: Nhập mới, không copy (R) | Copy khi xác nhận riêng | Chỉ cấu hình qua biến môi trường.
    - Answer: **Nhập mới, không copy**. Impact: secret input masked, safe copy projection, required re-entry.
11. **[Consent] Khi kiểm tra kết nối MCP có thể chạy command hoặc truy cập mạng, app nên xin phép ở mức nào?**
    - Options: Hỏi mỗi lần (R) | Nhớ trong lần mở app | Nhớ theo cấu hình.
    - Answer: **Hỏi mỗi lần**. Impact: no saved execution approvals.
12. **[Retention] Bạn muốn giữ backup trước các thay đổi do app thực hiện theo chính sách mặc định nào?**
    - Options: 30 bản hoặc 30 ngày | 100 bản hoặc 90 ngày | Tự chọn trong cài đặt.
    - Answer: **30 bản hoặc 30 ngày**. Impact: cleanup/pending recovery exclusions.
13. **[Ownership] Với skill hoặc file CLAUDE.md/rules local đã có sẵn, app nên cho phép chỉnh sửa như thế nào?**
    - Options: Xác nhận lần đầu (R) | Cho sửa ngay khi chọn | Chỉ file app tạo/import.
    - Answer: **Xác nhận lần đầu**. Impact: receipt/canonical source confirmation, không managed bypass.
14. **[Collision] Nếu import hoặc copy gặp MCP/skill trùng tên ở đích, bạn muốn xử lý thế nào?**
    - Options: Đổi tên hoặc hủy (R) | Cho thay thế có xác nhận.
    - Answer: **Đổi tên hoặc hủy**. Impact: no replace/merge import.
15. **[Lifecycle] App cần theo dõi thay đổi ngoài app vào lúc nào?**
    - Options: Chỉ khi app đang mở (R) | Có tray khi đóng cửa sổ | Tray và khởi động cùng Windows.
    - Answer ban đầu: **Có tray khi đóng cửa sổ**. **Đã bị thay thế bởi câu 21**, không còn tray commitment.
16. **[Locale] Giao diện và thông báo cho bạn cùng những người dùng đầu tiên cần ngôn ngữ nào?**
    - Options: Tiếng Việt | Tiếng Anh | Việt và Anh.
    - Answer: **Việt và Anh**. Impact: i18n/resources/tests ngay từ shell.
17. **[Packaging] Bạn muốn phân phối bản đầu cho những người cùng dùng bằng cách nào?**
    - Options: Installer theo user (R) | Bản portable | Cả installer và portable.
    - Answer: **Installer theo user**. Impact: no portable release requirement.
18. **[Monitoring] Khi nằm ở tray, app nên theo dõi những project nào để cân bằng tiện dụng và tài nguyên?**
    - Options: Project đang chọn (R) | Project đánh dấu theo dõi | Tất cả project đã thêm.
    - Custom input verbatim: **“thôi bỏ theo dõi đi”**. Impact: cần làm rõ ở câu 21, không tự chọn một scope.
19. **[Stack] Về nền tảng desktop, bạn muốn chọn hướng nào sau các trade-off dưới đây?**
    - Options: Electron nếu tương thích (R) | Ưu tiên app nhẹ | Bạn chọn sau spike.
    - Answer: **Electron nếu tương thích**. Impact: Windows 10 spike gate, không tự đổi stack.
20. **[Compatibility] Khi chưa biết phiên bản Claude Code hoặc gặp phiên bản/cấu hình app chưa xác minh hỗ trợ, bạn chấp nhận cách xử lý nào?**
    - Options: Chỉ đọc đến khi verify (R) | Cần writer trước phát hành.
    - Answer: **Chỉ đọc đến khi verify**. Impact: fail-closed capability, consented CLI verification riêng.
21. **[Scope correction] Bạn muốn bỏ phần theo dõi thay đổi ở mức nào?**
    - Options: Bỏ tự động và tray | Chỉ bỏ theo dõi nền | Bỏ watcher, giữ so sánh.
    - Answer: **Bỏ tự động và tray**. Option đã giải thích: bỏ watcher/background/tray/external history, read open/context/Refresh; giữ diff trước save/backup/restore/conflict checks. Thay thế câu 15 và monitoring MVP trước đây.

### Tác động lên phases

- Phase 1: Electron compatibility có điều kiện, i18n, explicit scopes, receipt/IPC cho inputs/copy, no baseline service.
- Phase 2: form/JSON/copy secret-safe, collision rename/cancel, health per-action consent/freshness khi read.
- Phase 3: local SKILL.md-only editor, full-tree copy, first-time local ownership, no overwrite/no watcher.
- Phase 4: bỏ change-tracking/tray/history, thêm Refresh/draft/per-user/i18n gates; permissions read-only và retention 30/30.

### Kiểm tra tài liệu và Whole-Plan Consistency Sweep

- Trước interview: `ak plan validate --json` valid; bốn phases pending, chưa implementation. Kiểm tra định dạng không chứng minh supported CLI/runtime behavior.
- Reconciliation sau interview: đặc tả và bốn phases đã cập nhật; quyết định tray cũ ghi rõ superseded, source paths vẫn đề xuất, section references đã sửa.
- Kiểm tra cuối lượt: `ak plan validate --json` → valid, không errors; `ak plan status --json` → 4 phases pending, 0/31 tasks implementation hoàn thành.
- Node read-only check → 6 Markdown files, 18 relative links hợp lệ, không completed implementation checkbox hoặc stale watcher-module contract được kiểm tra. Search semantics phân biệt exclusions và câu trả lời tray đã superseded, không còn active monitoring deliverable.
- Lần đầu thử script read-only bằng Python không chạy vì `Python was not found`; đã chuyển sang Node có sẵn và check thành công, không cài Python hoặc sửa môi trường.
- Không application tests/lint/build vì chưa có code. Các check docs không chứng minh runtime compatibility/security behavior. Không có mâu thuẫn phạm vi còn biết sau đối chiếu; các quyết định kỹ thuật chưa verify ghi ở mục dưới.

## Vấn đề còn mở

1. Đã được phép implementation. Còn thiếu các deliverable nêu trong bảng tiến độ; không chờ user duyệt lại các yêu cầu đã chốt. Không thử writer trên primary profile.
2. Exact Electron/Claude CLI versions cần thực nghiệm; incompatibility Windows 10 phải hỏi lại trade-off, không tự đổi stack/OS.
3. Certificate/signing và kênh giao installer cần chốt trước phân phối. Working name/visual branding có thể quyết định khi UI design.
4. Skill full tree/free text không thể chứng minh không có mọi secret; không claim MCP secret omission là skill sanitizer. Đặc tả nêu rõ manifest review/policy block và limitation.

## Nguồn chính thức

Đối chiếu ngày 2026-10-24; installed-version behavior là gate:

- https://code.claude.com/docs/en/mcp
- https://code.claude.com/docs/en/skills
- https://code.claude.com/docs/en/settings
- https://code.claude.com/docs/en/memory
- https://code.claude.com/docs/en/permissions
