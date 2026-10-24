---
title: "Đặc tả sản phẩm: Claude Workspace Manager"
status: in-progress
scope: "Chỉ Claude Code; Windows native"
created: 2026-10-24
updated: 2026-10-24
---

# Đặc tả sản phẩm: Claude Workspace Manager

## 1. Mục tiêu và quyết định đã chốt

App cục bộ quản lý cấu hình/tài nguyên **Claude Code**: hiểu nguồn/phạm vi, sửa có kiểm soát, chẩn đoán và khôi phục. Cho người dùng và vài người khác, không phải hệ thống quản trị team/cloud. Chức năng quản lý không cần Claude API/API key.

Quyết định ngày **2026-10-24**, gồm phỏng vấn trong [plan.md](./plan.md):

- Chỉ Claude Code, Windows native; không Claude Desktop/WSL/macOS/Linux.
- Người dùng đã dùng Orca: không launcher, terminal/session manager hoặc Orca integration. Folder selector chỉ chọn ngữ cảnh cấu hình.
- Bản đầu đủ MCP, skills, instructions/rules, permissions chỉ xem và diagnostics/diff/backup/restore; cả bốn nhóm đều cần, không tự cắt nhóm.
- **Bỏ theo dõi tự động, tray và lịch sử thay đổi ngoài app.** Đọc lại khi mở, đổi project hoặc Refresh; vẫn kiểm xung đột trước write/restore.
- MCP nhập bằng form hoặc dán JSON; skills chỉ import thư mục local, editor chỉ sửa `SKILL.md`.
- Có copy MCP/skill có chọn lọc sang scope/project khác, không move/profile. Chọn scope rõ mỗi lần; đích trùng tên chỉ đổi tên hoặc hủy, không replace/merge.
- Cho nhập secret MCP mới, che mặc định; copy MCP không mang secret sang đích. Existing local skill/instructions cần xác nhận nhận quản lý lần đầu.
- Permissions chỉ đọc; health check hỏi mỗi lần; backup tối đa 30 transaction snapshots hoặc 30 ngày, luôn giữ pending recovery.
- UI Việt/Anh, installer theo user; chọn Electron + React + TypeScript nếu spike tương thích Windows 10. Unknown/unverified CLI capability read-only.
- Hooks/subagents/plugins/profiles manager deferred, không API/model dự phòng trong MVP.

**Đã được phép triển khai ngày 2026-10-24.** Người dùng yêu cầu code hoàn chỉnh và kiểm tra kỹ, đồng thời xác nhận app phải thao tác thật, không demo hay chỉ đề xuất. Đầu ra bắt buộc là UI → validated IPC → adapter → filesystem/protocol thật: đọc nguồn Claude thật; thêm/sửa/xóa/copy supported MCP; quản lý local skills/instructions; backup/restore và kiểm tra kết nối thật có consent. Không dùng dữ liệu giả hoặc success giả trong production. Test fixtures chỉ cô lập kiểm thử, không thay thế implementation. Phần chưa làm phải ghi chưa hoàn thành; không gọi shell chỉ đọc là sản phẩm xong. Việc triển khai không tự cho phép chạy thử ghi/xóa trên cấu hình cá nhân: người dùng chọn target và xác nhận từng thao tác trong app; các safety/version/read-only gates dưới đây vẫn áp dụng.

## 2. Phạm vi và giá trị

| Nhóm MVP | Kết quả |
|---|---|
| Ngữ cảnh/discovery | Folder registry thủ công, origin/path/scope/parse state/capability, source không thấy ghi not observed |
| MCP | stdio/HTTP CRUD, form/JSON, copy chọn lọc, native toggle chỉ nếu verified; check riêng có consent |
| Skills | Full-tree local import/copy, tạo/sửa SKILL.md, archive/remove/restore local tree đã nhận quản lý |
| Instructions/rules | User/project/local Markdown editor, static preview, imports/paths diagnostics trong boundary |
| Permissions/settings | Read-only allow/ask/deny và nguồn, warning có evidence, incomplete/unknown state; không raw JSON writer |
| An toàn/diagnostics | Diff trước ghi, snapshot/journal, conflict checks, transaction history/restore; Refresh không monitoring |
| Phân phối/UX | Per-user installer, Việt/Anh, không hard-code đường dẫn máy developer |

Ngoài MVP: permission editor, generic settings writer, hooks/subagents/plugins/profiles lifecycle, Git/URL/ZIP/package import, marketplace, updater, telemetry, cloud sync, vault/OAuth/auth manager, token/cost analytics. Không chat/agent runtime/sandbox. Không watcher, tray, startup service, observation history/baseline hoặc external-change notification.

## 3. Hợp đồng nguồn và semantics

`~` là home/config root theo CLI đã kiểm chứng; không thay chuỗi `~/.claude`/`~/.claude.json` máy móc khi có `CLAUDE_CONFIG_DIR`. Hiển thị resolved path/evidence. Env app có thể khác terminal/Orca.

| Artifact | Nguồn tiêu biểu | Writer | Diễn giải |
|---|---|---|---|
| MCP | User/local trong `~/.claude.json`, project `.mcp.json` | Entry/source verified | Local > project > user; managed/plugin/connectors chú thích riêng |
| Skills | User/project `.claude/skills/<name>/SKILL.md` | Local đã nhận quản lý | Enterprise > personal > project; plugin namespace riêng |
| Settings/permissions | User settings.json, project `.claude/settings.json`, `.claude/settings.local.json`, managed quan sát được | Không | Managed > CLI > local > project > user; list thường merge, ngoại lệ theo key |
| Instructions | User `~/.claude/CLAUDE.md`, project `CLAUDE.md`/`.claude/CLAUDE.md`, `CLAUDE.local.md`, ancestors/nested khi được phép | Supported local target đã nhận quản lý | Cộng dồn theo discovery, không settings winner |
| Rules | User/project `.claude/rules/**/*.md` | Supported local target | Có/không paths, có thể conditional/on-demand |

Managed/plugin/synced read-only. Không thấy/không đọc được là `not observed`, không nghĩa không tồn tại. Không đọc credential/token files, conversation history hoặc auto-memory store. Không một precedence hay effective runtime config chung cho mọi artifact.

### 3.1 MCP và dán JSON

- `claude mcp add` không connectivity/auth proof; `list/get` có thể connect/helper, không passive inventory. `.claude.json` có account/trust state, preserve unknown/unrelated fields.
- CLI-first chỉ khi spike chứng minh preservation/side effects/route safety; không safe route thì read-only. Không universal enabled boolean từ `disabledMcpServers` và `disabledMcpjsonServers`; không approval/trust writer.
- Thiết kế input JSON: một server entry hoặc object `mcpServers` gồm entries; entry đơn cần nhập tên. Unsupported/ambiguous format báo lỗi rõ, không eval hoặc nhận shell command thành config. Đây là chi tiết thiết kế đề xuất từ lựa chọn form/JSON, không tuyên bố user đã chọn exact schema.
- Multi-entry paste chọn từng entry/tên/target scope và preview; unsupported không silently drop. Cancel zero writes, multi-file không atomic.
- JSON/secret input chỉ tới dedicated form, không log/autosave/export hoặc tự đọc clipboard. Value mới có thể được ghi vào field config Claude hỗ trợ, app không vault; raw input không được để vào command-line args của child process nếu lộ qua process listing.
- Masked placeholder không ghi ngược thành literal hoặc làm mất secret chưa sửa. SSE legacy, WS/in-process/SDK transports unsupported/deferred.

### 3.2 Skills và instructions

- Full local tree/resources, không execute scripts/dynamic injection/npm/git; chỉ editor SKILL.md, file khác tree/metadata view. Exact SKILL.md/frontmatter ở đầu file; invalid source không tự sửa.
- `disable-model-invocation`/`user-invocable` không full-disable; newer override version-gated. Chưa native toggle verified thì archive ngoài discovery root, nhãn archived.
- Existing local skill/instructions lần đầu mutation xác nhận canonical target/scope và nhận quản lý, lưu receipt/fingerprint metadata không sửa source để gắn ownership. Target bị thay thế/đổi origin đánh giá lại; không nhận quản lý managed/plugin/synced để bypass.
- Instructions editor UTF-8, giữ newline/no-op bytes, encoding unsupported read-only; tạo local instructions không tự sửa gitignore.
- Ancestor instructions có thể startup, nested/path rules có thể on-demand; instructions cộng dồn, không claim paragraph override/enforcement.
- Imports `@path` relative file chứa import, không CWD; code span/fence literals không là imports. Cycle/depth/file-count/bytes guards theo version verified. Chỉ follow approved root, external target chỉ reference, không URL fetch/read tùy tiện hoặc sửa Claude trust/import approvals.
- Paths glob match subset verified; unsupported unknown, không false-negative. Diagnostics missing refs/invalid metadata/exact duplicates có evidence; không semantic-conflict AI checker hoặc token count giả.
- Markdown preview sanitize/escape, không JS/iframe/remote images/active content. File text được chọn có thể chứa secret và tới editor, nhưng không logs/export/telemetry; không hứa tìm mọi secret bằng regex.
- AGENTS.md/auto-memory writer ngoài MVP; supported CLI có nguồn này thì badge/reference cảnh báo instruction view incomplete.

### 3.3 Copy có chọn lọc

- Chọn MCP entries hoặc local skills → source fingerprint → target folder/scope/name rõ → preview → confirm transaction. Không move/xóa nguồn hoặc generic profile engine.
- Đích mới, collision đổi tên/hủy; sửa existing item là flow khác. Recheck source/target absence trước commit, khác preview thì abort; không replace/merge.
- MCP không clone raw object rồi regex-redact. Allowlist safe fields; env/header values, URL userinfo/query, argv/unknown data có thể chứa secret nên field không chứng minh an toàn bị bỏ, UI liệt kê phần phải nhập lại. Thiếu required data không báo ready/không ghi cấu hình thiếu hợp lệ. Không auto-copy value nhạy cảm sang đích.
- Skill là full tree/free text nên không thể chứng minh mọi nội dung không có secret bằng heuristic. Không tự sửa/lược resources rồi gọi complete. Manifest review và cảnh báo người dùng kiểm nội dung, không đọc credential files ngoài tree; target escape hoặc credential-like file bị policy phát hiện thì block tree import/copy thay vì silently drop. Không claim skill secret-free; yêu cầu không-copy-secret đã hỏi ở nhóm **MCP**, không tự biến thành text sanitizer cho skills.
- Relative imports/resources, command working directory hoặc absolute path có thể không hợp đích; báo evidence/reload guidance, không rewrite scripts/imports ngầm. Managed/plugin/synced không được clone nhằm bỏ policy.

### 3.4 Permissions/settings read-only

- Allow/ask/deny entries có origin/scope/key path/index/tool/pattern theo parser supported; unknown/sensitive field mask, unsupported state rõ.
- Giải thích deny → ask → allow, không specificity-overrides-deny hoặc một settings source xóa rule khác giả định. Managed-only restriction như allowManagedPermissionRulesOnly có evidence thì chú thích, không thấy managed/CLI/env thì incomplete.
- Runtime mode/trust/hooks/sandbox/CLI/tool matcher ảnh hưởng enforcement; không simulator quyết định lệnh chắc chắn chạy, không run sample command để test permissions.
- Broad/overlap warning subset verified, có rationale, không audit verdict/auto-fix. Instructions không là permission enforcement.
- Không permission/settings mutation IPC, raw JSON editor, allow-all, trust writer hoặc restore arbitrary settings. Observed settings không tự thành restorable snapshots; chỉ transaction writer hỗ trợ được restore.

## 4. Refresh, freshness và conflict

- Đọc khi mở app, đổi project hoặc Refresh. Không watcher/tray/background/startup; đóng cửa sổ thoát sau xử lý dirty draft/pending operations an toàn, không process monitoring còn lại.
- Không observation baseline/external history/actor attribution. Transaction history chỉ ghi app operations; external edit không tự có backup. Hash/read state và draft base fingerprint không phải history feature.
- Draft dirty khi Refresh/chuyển context/thoát: cho giữ/hủy/hủy hành động phù hợp, không mất draft tự động. Source đổi thì conflict; không auto-merge hoặc overwrite.
- Save/restore luôn re-read fingerprints, không phụ thuộc Refresh. Restore so **post-write** fingerprint; mismatch dừng, không force.
- Check evidence có checked-at/config fingerprint/context và last-read-at. Khi read/save/copy phát hiện relevant source đổi thì stale. Không watcher nên chưa đọc lại có thể chưa biết external change; không realtime/current-session claim. Trước check re-read target, đổi cấu hình/target phải consent lại.

## 5. Safe IO, secret và storage

Passive inventory/refresh không exec/network/read credential store/source write. Có thể ghi app metadata trong storage riêng; không tạo Claude files. Version unverified thì read-only; action verify CLI executable/version riêng có consent/timeout, không mở interactive session.

Main giữ filesystem/raw config; renderer sandbox/contextIsolation on/nodeIntegration off. Typed validated IPC theo action/source whitelist, không generic file write/run command. Config allowlist projections; Markdown/pasted JSON/new-secret input raw exceptions chỉ trong editor/form có mục đích, không logs/export/autosave.

Transaction: canonical/source/capability check → parse/patch/manifest → target/scope/diff preview/confirm → source/target recheck (cả absence) → original-byte/tree snapshot + pending journal durable → stage/write/validate → committed/post-write fingerprints. Failure/crash recovery chỉ chạm state nhận diện còn khớp.

Multi-file không atomic, app lock không khóa external editors/Claude. Hash không triệt hết TOCTOU; spike Windows handle/share/replace và CLI route, document residual race, unsafe capability read-only. Recheck symlink/junction/boundary trước commit; root ngoài phạm vi cần approval riêng, managed luôn read-only.

Claude files source of truth; JSON app-state chỉ registry/preferences/pointers/fingerprints/redacted receipts/check metadata, không mirror source. Raw backups có thể chứa secret: local ACL per-user, no cloud/default export; không claim chống admin/malware cùng quyền. Encrypted portable backup deferred. Metadata export allowlist, non-restorable, không raw source/Markdown/argv/env.

Retention đã chọn **30 snapshots hoặc 30 ngày**: dọn oldest khi vượt một giới hạn, giữ pending recovery. Đơn vị snapshot là transaction (có thể gồm nhiều files); giới hạn toàn app là mặc định thiết kế cần thể hiện rõ trong UI, không nhân theo mỗi file. Cleanup lỗi báo diagnostic, không bỏ pending artifacts. Không baseline/history storage.

Restore đúng original absence/tree; unrelated `.claude.json` state đổi thì stop full-file restore, không reset account/trust. Backup original bytes có thể invalid, không tự chữa corruption để gọi backup.

Health checks xin phép **mỗi lần**, target/command/env names/side effects rõ, timeout/output bounds, không auto-check sau save/open/Refresh. Không arbitrary MCP tool call, chỉ handshake/metadata subset verified. CLI helper side effects nằm trong consent. App không sandbox command. Cleanup chỉ app-owned process tree (Job Objects hoặc equivalent tested), không kill Claude/Orca/server khác. Connection fail ≠ unconfigured; save/check/runtime statuses độc lập.

## 6. Kiến trúc, UI và phân phối

- Electron + React + TypeScript **có điều kiện Windows 10 compatibility spike**; chưa pin versions hoặc benchmark footprint. Fail compatibility thì trình user trade-off trước đổi stack/OS.
- JSON app-state đủ ban đầu, chưa cần SQLite; không hard-code machine-specific paths.
- Modules logical: app-state, claude-discovery, config-transaction, mcp-adapter, skill-adapter, instructions-adapter, permissions-view, health-check, diagnostics. Copy dùng adapters/transactions, không profile engine; không watcher module dự phòng.
- Việt/Anh resources từ đầu, switch trong Settings; technical keys/commands/evidence không dịch sai. Locale parity và label overflow có tests.
- Per-user installer, OS-user storage, no admin nếu không prerequisite bắt buộc. Update thủ công, không auto-start/tray/updater. Uninstall không tự xóa Claude config/backups; cleanup cần xác nhận riêng. Signing/certificate chưa có thì không claim signed release.

Màn hình: Overview/project selector; MCP; Skills; Instructions & rules; Permissions & settings sources (read-only); Transaction history & snapshots; Diagnostics; App settings/privacy/language. Không external Changes hoặc launch/session buttons.

## 7. Acceptance và tests

Các checkbox là yêu cầu tương lai, không claim đã có tests/implementation:

- [ ] Windows native/per-user installer, Việt/Anh; thiếu Claude vẫn mở; no launcher/Orca/Desktop/tray/watchers/external history.
- [ ] Passive read không exec/network/credential/source mutation; artifact-specific resolver/capability gates, unknown CLI read-only.
- [ ] MCP form/JSON/select entries/target scope, no approval writes; unknown/unrelated/unchanged secret preservation, independent save/check/runtime states.
- [ ] Skill full-tree local import/copy, chỉ SKILL.md edit; first-time existing local ownership confirmation, managed/plugin/synced read-only.
- [ ] Copy explicit scope/no move/no overwrite, MCP secrets omitted with required inputs; skill free-text safety limitation/policy blocking clear.
- [ ] Instructions imports/paths/cumulative/on-demand boundaries đúng; no-op bytes/static preview, no active content.
- [ ] Permissions/settings read-only UI/IPC/restore, verified categories và incomplete state; no command simulation.
- [ ] Dirty draft/Refresh/context/close safe, pre-write recheck luôn chạy; health checked-at/last-read-at không realtime claim.
- [ ] Snapshot/journal/absence/tree/post-write restore, ACL/retention/pending recovery và metadata-only export.
- [ ] Focused unit/integration rồi full tests/lint/type/build/E2E/native Windows smoke và independent review trước release.

Test fixtures cô lập, không fake production behavior. Native smoke không destructive test trên primary profile. Verify paste/log secret leaks, copy collisions/required inputs, locale parity, closing window exits safely, install/uninstall preserve sources/backups. Kiểm thử Electron production đã xác nhận bridge trong sandbox, UI hiển thị, Refresh, đổi ngôn ngữ và bỏ registry trên fixture; đây không phải bằng chứng các writer/installer/health checks đã hoàn tất.

## 8. Phases và phụ thuộc

| Phase | Deliverable | Dependency |
|---|---|---|
| 1 | Compatibility, shell/i18n, discovery/safe IO/IPC/storage | Approval implementation |
| 2 | MCP form/JSON/copy và consented checks | Phase 1 |
| 3 | Local skills/copy, instructions/rules editor | Phase 1 |
| 4 | Permissions, Refresh UX/diagnostics/recovery, per-user release | Phase 2, 3 |

Dependency chỉ thể hiện thứ tự cần thiết giữa các deliverable; cách phân công và triển khai do người dùng quyết định. Cả bốn nhóm cần cho bản đầu, không gọi bản thiếu nhóm là MVP đầy đủ.

## 9. Vấn đề chưa chốt

- Implementation đang tiến hành; nền tảng shell đã có, chưa hoàn tất tất cả chức năng quản lý thật. Tiến độ và bằng chứng kiểm thử được ghi tại plan.md.
- Exact Electron/Claude Code versions và safe mutation routes cần spike được phép. Windows 10 incompatibility phải quay lại quyết định với user.
- Chưa có certificate/signing và kênh giao installer: giải quyết trước phân phối, không tự publish. Product name hiện là working name; branding/theme có thể chốt lúc UI design.
- Skill free-text không thể chứng minh secret-free bằng heuristic; manifest review/policy blocking không được quảng cáo là bảo đảm tuyệt đối.

## 10. Nguồn chính thức

Đối chiếu **2026-10-24**, installed version vẫn là gate:

- https://code.claude.com/docs/en/mcp
- https://code.claude.com/docs/en/skills
- https://code.claude.com/docs/en/settings
- https://code.claude.com/docs/en/memory
- https://code.claude.com/docs/en/permissions
