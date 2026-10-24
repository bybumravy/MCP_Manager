import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent, dialog, safeStorage, app } from 'electron';
import { FileTransactionStore } from '../config-transaction/file-transaction-store';
import { InstructionsService } from '../instructions/instructions-service';
import type { Fingerprint, TransactionSummary, McpMutation } from '../../shared/contracts';
import { McpService } from '../mcp/mcp-service';
import { checkHttpMcp } from '../mcp/http-health-check';
import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { checkBoundary } from '../path-policy/path-policy';
import path from 'node:path';
import { access, stat } from 'node:fs/promises';
import { IPC_CHANNELS, type AppState, type BootstrapPayload, type Language } from '../../shared/contracts';
import { discoverArtifacts } from '../claude-discovery';
import { AppStateStore } from '../app-state/app-state-store';

export class IpcController {
  private operationQueue: Promise<unknown> = Promise.resolve();
  private readonly transactions = new FileTransactionStore(path.join(app.getPath('userData'), 'transactions'), {
    encrypt: async (bytes) => {
      if (process.platform !== 'win32' || !await safeStorage.isAsyncEncryptionAvailable()) throw new Error('Windows protected encryption is unavailable.');
      return safeStorage.encryptStringAsync(bytes.toString('base64'));
    },
    decrypt: async (bytes) => {
      if (process.platform !== 'win32' || !await safeStorage.isAsyncEncryptionAvailable()) throw new Error('Windows protected encryption is unavailable.');
      return Buffer.from((await safeStorage.decryptStringAsync(bytes)).result, 'base64');
    },
  });
  private readonly instructions = new InstructionsService(this.transactions);
  private readonly mcp = new McpService(this.transactions);
  private verifiedVersion: string | null = null;
  public constructor(
    private readonly window: BrowserWindow,
    private readonly stateStore: AppStateStore,
    private state: AppState,
    private readonly homeDirectory: string,
  ) {}

  public register(): void {
    this.handle(IPC_CHANNELS.getBootstrap, () => this.bootstrap());
    this.handle(IPC_CHANNELS.refresh, () => this.bootstrap());
    this.handle(IPC_CHANNELS.setLanguage, (language) => this.setLanguage(language));
    this.handle(IPC_CHANNELS.selectProjectFolder, () => this.selectProjectFolder());
    this.handle(IPC_CHANNELS.removeProjectFolder, (projectPath) => this.removeProjectFolder(projectPath));
    this.handle(IPC_CHANNELS.openInstruction, (id) => this.openInstruction(id));
    this.handle(IPC_CHANNELS.saveInstruction, (id, fingerprint, text) => this.saveInstruction(id, fingerprint, text));
    this.handle(IPC_CHANNELS.listTransactions, async () => (await this.transactions.list()).map(this.projectReceipt));
    this.handle(IPC_CHANNELS.restoreTransaction, (id) => this.restoreTransaction(id));
    this.handle(IPC_CHANNELS.readMcp, async (id) => {
      const target = await this.mcpTarget(id);
      return { ...await this.mcp.read(target, path.dirname(target)), writable: this.verifiedVersion === '2.1.310' };
    });
    this.handle(IPC_CHANNELS.changeMcp, (id, fingerprint, mutation) => this.changeMcp(id, fingerprint, mutation));
    this.handle(IPC_CHANNELS.verifyCli, () => this.verifyCli());
    this.handle(IPC_CHANNELS.checkMcp, (id, name, fingerprint) => this.checkMcp(id, name, fingerprint));
  }

  private handle(channel: string, action: (...args: unknown[]) => Promise<unknown>): void {
    ipcMain.handle(channel, (event: IpcMainInvokeEvent, ...args: unknown[]) => {
      const expectedUrl = process.env.VITE_DEV_SERVER_URL
        ? new URL(process.env.VITE_DEV_SERVER_URL).href
        : pathToFileURL(path.join(__dirname, '../../../renderer/index.html')).href;
      if (event.sender !== this.window.webContents
        || event.senderFrame !== this.window.webContents.mainFrame
        || event.senderFrame.url !== expectedUrl) {
        throw new Error('Untrusted IPC sender.');
      }
      const operation = this.operationQueue.then(() => action(...args));
      this.operationQueue = operation.catch(() => undefined);
      return operation;
    });
  }

  public dispose(): void {
    for (const channel of Object.values(IPC_CHANNELS)) ipcMain.removeHandler(channel);
  }

  private async checkMcp(id: unknown, name: unknown, fingerprint: unknown) {
    if (typeof name !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(name) || !fingerprint || typeof fingerprint !== 'object') throw new Error('Invalid check request.');
    const base = fingerprint as Fingerprint;
    if (base.kind !== 'file' || !/^[a-f0-9]{64}$/.test(base.sha256)) throw new Error('Invalid check fingerprint.');
    const target = await this.mcpTarget(id);
    const config = await this.mcp.httpCheckConfig(target, path.dirname(target), base, name);
    const url = new URL(config.url);
    const consent = await dialog.showMessageBox(this.window, {
      type: 'warning', buttons: ['Cancel / Hủy', 'Check / Kiểm tra'], defaultId: 0, cancelId: 0,
      message: `${name} — ${url.origin}`,
      detail: 'Send MCP initialize/initialized to the saved HTTP URL, including saved headers. May contact a remote service. Timeout 10s, output limit 256 KiB, redirects refused. No tools, commands or OAuth helpers. URL path/query and headers are masked. This does not verify a running Claude session. / Gửi handshake HTTP thật, có dùng headers đã lưu; không gọi tools hoặc chạy command. Không chứng minh session Claude đã kết nối.',
    });
    if (consent.response !== 1) return null;
    const fresh = await this.mcp.httpCheckConfig(target, path.dirname(target), base, name);
    return { ...await checkHttpMcp(fresh), checkedAt: new Date().toISOString(), fingerprint: base };
  }

  private async verifyCli() {
    const previousVersion = this.verifiedVersion;
    this.verifiedVersion = null;
    let executable: Awaited<ReturnType<typeof dialog.showOpenDialog>>;
    try {
      executable = await dialog.showOpenDialog(this.window, {
      properties: ['openFile'], title: 'Choose Claude Code executable / Chọn claude.exe', filters: [{ name: 'Executable', extensions: ['exe'] }],
    });
      if (executable.canceled || !executable.filePaths[0]) { this.verifiedVersion = previousVersion; return null; }
    } catch (error) {
      this.verifiedVersion = previousVersion;
      throw error;
    }
    const file = executable.filePaths[0];
    if (!file || path.basename(file).toLowerCase() !== 'claude.exe') throw new Error('Choose claude.exe.');
    let consent: Awaited<ReturnType<typeof dialog.showMessageBox>>;
    try {
      consent = await dialog.showMessageBox(this.window, {
        type: 'warning', buttons: ['Cancel / Hủy', 'Verify / Xác minh'], defaultId: 0, cancelId: 0,
        message: `${file} --version`, detail: 'Run only the selected executable with --version (10 second timeout). No MCP health check. / Chỉ chạy executable đã chọn với --version; không kiểm tra kết nối MCP.',
      });
    } catch (error) { this.verifiedVersion = previousVersion; throw error; }
    if (consent.response !== 1) { this.verifiedVersion = previousVersion; return null; }
    let version: string;
    try {
      version = await new Promise<string>((resolve, reject) => {
        execFile(file, ['--version'], { timeout: 10000, maxBuffer: 16384, windowsHide: true }, (error, stdout) => {
          if (error) return reject(new Error('CLI version verification failed.'));
          const value = stdout.match(/\b\d+\.\d+\.\d+\b/)?.[0];
          if (!value) return reject(new Error('CLI version not recognized.'));
          resolve(value);
        });
      });
    } catch (error) {
      this.verifiedVersion = previousVersion;
      throw error;
    }
    this.verifiedVersion = version;
    return { version, supported: version === '2.1.310' };
  }

  private async mcpTarget(id: unknown): Promise<string> {
    if (typeof id !== 'string') throw new Error('Invalid MCP source.');
    const { discovery } = await this.bootstrap();
    const artifact = discovery.artifacts.find((item) => item.id === id && item.kind === 'mcp' && item.scope === 'project');
    if (!artifact || artifact.boundary !== 'approved') throw new Error('Only registered project MCP targets are supported.');
    return artifact.resolvedPath;
  }

  private async changeMcp(id: unknown, fingerprint: unknown, mutation: unknown) {
    if (this.verifiedVersion !== '2.1.310') throw new Error('Verify a supported installed CLI before MCP writes.');
    const target = await this.mcpTarget(id);
    if (!fingerprint || typeof fingerprint !== 'object' || !mutation || typeof mutation !== 'object') throw new Error('Invalid MCP request.');
    const base = fingerprint as Fingerprint;
    if (base.kind !== 'absence' && (base.kind !== 'file' || !/^[a-f0-9]{64}$/.test(base.sha256))) throw new Error('Invalid source fingerprint.');
    if (Buffer.byteLength(JSON.stringify(mutation)) > 1024 * 1024) throw new Error('MCP input exceeds limit.');
    const consent = await dialog.showMessageBox(this.window, {
      type: 'warning', buttons: ['Cancel / Hủy', 'Write / Ghi file'], defaultId: 0, cancelId: 0,
      message: target, detail: 'Write project MCP configuration with encrypted backup. Does not connect, run commands, or approve trust. / Ghi MCP project với backup mã hóa; không chạy command, kết nối hay cấp trust.',
    });
    if (consent.response !== 1) return null;
    return this.projectReceipt(await this.mcp.change(target, path.dirname(target), base, mutation as McpMutation));
  }

  private projectReceipt(receipt: TransactionSummary): TransactionSummary {
    return { id: receipt.id, target: receipt.target, createdAt: receipt.createdAt, status: receipt.status };
  }

  private async instructionTarget(id: unknown) {
    if (typeof id !== 'string') throw new Error('Invalid artifact identifier.');
    const { discovery } = await this.bootstrap();
    const artifact = discovery.artifacts.find((item) => item.id === id);
    if (!artifact || artifact.kind !== 'instructions' || artifact.boundary !== 'approved'
      || !['project', 'local', 'user'].includes(artifact.origin)) throw new Error('Unsupported instruction source.');
    const boundary = artifact.origin === 'user' ? discovery.configRoot
      : this.state.projectRoots.find((root) => artifact.resolvedPath.startsWith(`${root}${path.sep}`));
    if (!boundary) throw new Error('Instruction root is not registered.');
    return { artifact, boundary };
  }

  private async openInstruction(id: unknown) {
    const { artifact, boundary } = await this.instructionTarget(id);
    return this.instructions.read(artifact.resolvedPath, boundary);
  }

  private async saveInstruction(id: unknown, fingerprint: unknown, text: unknown) {
    const { artifact, boundary } = await this.instructionTarget(id);
    if (typeof text !== 'string' || !fingerprint || typeof fingerprint !== 'object') throw new Error('Invalid instruction draft.');
    const base = fingerprint as Fingerprint;
    if (base.kind !== 'absence' && (base.kind !== 'file' || !/^[a-f0-9]{64}$/.test(base.sha256))) throw new Error('Invalid draft fingerprint.');
    const result = await dialog.showMessageBox(this.window, {
      type: 'warning', buttons: this.state.language === 'vi' ? ['Hủy', 'Nhận quản lý và lưu'] : ['Cancel', 'Manage and save'],
      defaultId: 0, cancelId: 0, title: this.state.language === 'vi' ? 'Ghi file thật' : 'Write real file',
      message: artifact.resolvedPath,
      detail: this.state.language === 'vi'
        ? 'Thay đổi file instructions này. Bản gốc được backup mã hóa; dừng nếu nguồn đã đổi. Nội dung được đưa vào Claude ở lần đọc tiếp theo, không chứng minh session hiện tại đã nạp.'
        : 'Modify this instructions file. Original bytes are backed up with Windows encryption; changed sources cause a conflict. This does not prove a running Claude session has reloaded.',
    });
    if (result.response !== 1) return null;
    return this.projectReceipt(await this.instructions.save(artifact.resolvedPath, boundary, base, text));
  }

  private async restoreTransaction(id: unknown) {
    if (typeof id !== 'string') throw new Error('Invalid transaction identifier.');
    const receipt = (await this.transactions.list()).find((entry) => entry.id === id);
    if (!receipt) throw new Error('Unknown transaction.');
    const { discovery } = await this.bootstrap();
    if (!discovery.artifacts.some((item) => (item.kind === 'instructions' || (item.kind === 'mcp' && item.scope === 'project' && this.verifiedVersion === '2.1.310')) && item.resolvedPath === receipt.target && item.boundary === 'approved')) {
      throw new Error('Restore target is not a registered supported source.');
    }
    const result = await dialog.showMessageBox(this.window, {
      type: 'warning', buttons: ['Cancel / Hủy', 'Restore / Khôi phục'], defaultId: 0, cancelId: 0,
      message: receipt.target, detail: 'Restore original bytes only if the current file still matches the saved result. / Chỉ khôi phục nếu file chưa bị sửa ngoài app.',
    });
    if (result.response !== 1) return false;
    await this.transactions.restore(id);
    return true;
  }

  private async bootstrap(): Promise<BootstrapPayload> {
    const discovery = await discoverArtifacts({ projectRoots: this.state.projectRoots, homeDirectory: this.homeDirectory });
    return { state: this.state, discovery };
  }

  private async setLanguage(value: unknown): Promise<AppState> {
    if (value !== 'en' && value !== 'vi') throw new Error('Unsupported language.');
    const language = value as Language;
    this.state = await this.stateStore.save({ ...this.state, language });
    return this.state;
  }

  private async selectProjectFolder(): Promise<BootstrapPayload | null> {
    const result = await dialog.showOpenDialog(this.window, {
      properties: ['openDirectory'],
      title: 'Choose a project folder',
    });
    const selectedPath = result.filePaths[0];
    if (result.canceled || !selectedPath) return null;

    const selected = path.resolve(selectedPath);
    if ((await checkBoundary(selected, selected)).state !== 'approved') throw new Error('Selected folder has an unsafe boundary.');
    await access(selected);
    const selectedStats = await stat(selected);
    if (!selectedStats.isDirectory()) throw new Error('Selected path is not a directory.');

    this.state = await this.stateStore.save({
      ...this.state,
      projectRoots: [...new Set([...this.state.projectRoots, selected])],
    });
    return this.bootstrap();
  }

  private async removeProjectFolder(value: unknown): Promise<BootstrapPayload> {
    if (typeof value !== 'string' || !value.trim()) throw new Error('Project path is required.');
    const projectPath = path.resolve(value);
    if (!this.state.projectRoots.some((root) => path.resolve(root) === projectPath)) {
      throw new Error('Project folder is not registered.');
    }

    this.state = await this.stateStore.save({
      ...this.state,
      projectRoots: this.state.projectRoots.filter((root) => path.resolve(root) !== projectPath),
    });
    return this.bootstrap();
  }
}
