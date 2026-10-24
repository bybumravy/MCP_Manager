const { app, BrowserWindow, dialog } = require('electron');
const { mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = process.env.WORKSPACE_TEST_ROOT;
if (!root) throw new Error('Run through electron-runtime.cjs for isolated fixtures.');
app.setPath('userData', path.join(root, 'profile'));
app.setPath('home', path.join(root, 'home'));
const failures = [];
app.on('web-contents-created', (_event, contents) => {
  contents.on('preload-error', (_event, _file, error) => failures.push(`Preload: ${error.message}`));
  contents.on('render-process-gone', (_event, details) => failures.push(`Renderer: ${details.reason}`));
});

async function waitFor(contents, expression) {
  return contents.executeJavaScript(`new Promise((resolve, reject) => {
    const end = Date.now() + 10000;
    const check = () => {
      try { if (${expression}) return resolve(true); } catch {}
      if (Date.now() > end) return reject(new Error('UI readiness condition timed out: ' + ${JSON.stringify(expression)}));
      setTimeout(check, 50);
    };
    check();
  })`);
}

const windowCreated = new Promise((resolve) => app.once('browser-window-created', (_event, window) => resolve(window)));
require('../../dist/main/main/main.js');
app.whenReady().then(async () => {
  try {
    const window = await windowCreated;
    assert.ok(window, 'Main window exists');
    const contents = window.webContents;
    await new Promise((resolve, reject) => {
      contents.once('did-finish-load', resolve);
      contents.once('did-fail-load', (_event, code, description) => reject(new Error(`${code}: ${description}`)));
    });
    assert.deepEqual(failures, [], 'Preload loads in sandbox');
    assert.equal(await contents.executeJavaScript('typeof window.workspaceManager?.getBootstrap'), 'function');
    await waitFor(contents, "document.querySelectorAll('tbody tr').length === 14 && !document.querySelector('button.primary-button').disabled");
    assert.equal(await contents.executeJavaScript('typeof window.require'), 'undefined');
    assert.equal(contents.getLastWebPreferences().sandbox, true);
    const untrustedWindow = new BrowserWindow({ show: false, webPreferences: {
      preload: path.resolve('dist/main/preload/preload.js'), sandbox: true, contextIsolation: true, nodeIntegration: false,
    } });
    await untrustedWindow.loadURL('about:blank');
    assert.equal(await untrustedWindow.webContents.executeJavaScript(
      "window.workspaceManager.setLanguage('vi').then(() => false, () => true)"
    ), true, 'IPC rejects a different window');
    untrustedWindow.destroy();
    assert.equal(await contents.executeJavaScript("document.querySelector('[role=alert]') === null"), true);
    await waitFor(contents, "document.querySelector('.mcp-panel') !== null");
    await contents.executeJavaScript("document.querySelector('.artifacts-panel .secondary-button').click()");
    await waitFor(contents, "!document.querySelector('.artifacts-panel .secondary-button').disabled");
    await contents.executeJavaScript(`(() => {
      const select = document.querySelector('select');
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, 'vi');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await waitFor(contents, "document.querySelector('h2').textContent === 'Thư mục dự án'");
    const originalDialog = dialog.showMessageBox;
    let confirmed = 0;
    dialog.showMessageBox = async () => { confirmed++; return { response: 1, checkboxChecked: false }; };
    try {
      const id = `instructions:${path.join(root, 'project', 'CLAUDE.md')}`;
      await contents.executeJavaScript(`(() => {
        const select = document.querySelector('[aria-label="Instructions source"]');
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, ${JSON.stringify(id)});
        select.dispatchEvent(new Event('change', { bubbles: true }));
      })()`);
      await waitFor(contents, "document.querySelector('textarea')?.value.includes('Original')");
      await contents.executeJavaScript(`(() => {
        const input = document.querySelector('textarea');
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, '# Edited in actual UI\\n');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      })()`);
      await waitFor(contents, "!document.querySelector('.instructions-panel .primary-button').disabled");
      await contents.executeJavaScript("document.querySelector('.instructions-panel .primary-button').click()");
      await waitFor(contents, "document.querySelector('.instructions-panel .folder-row')?.textContent.includes('committed')");
      assert.equal(await require('node:fs/promises').readFile(path.join(root, 'project', 'CLAUDE.md'), 'utf8'), '# Edited in actual UI\r\n');
      await contents.executeJavaScript("document.querySelector('.instructions-panel .folder-row button').click()");
      await waitFor(contents, "Array.from(document.querySelectorAll('.instructions-panel .folder-row')).some(row => row.textContent.includes('restored'))");
      assert.equal(confirmed, 2, 'Save and restore each require confirmation');
    } finally { dialog.showMessageBox = originalDialog; }
    let requests = 0;
    let rejectHealth = false;
    const healthServer = require('node:http').createServer((request, response) => {
      requests++;
      let body = '';
      request.on('data', (chunk) => { body += chunk; });
      request.on('end', () => {
        if (rejectHealth) { response.writeHead(401).end(); return; }
        const message = JSON.parse(body);
        if (message.method === 'initialize') {
          response.writeHead(200, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: '2025-11-25', capabilities: {}, serverInfo: { name: 'runtime-local-test', version: '1' } } }));
        } else { assert.equal(message.method, 'notifications/initialized'); response.writeHead(202).end(); }
      });
    });
    await new Promise((resolve) => healthServer.listen(0, '127.0.0.1', resolve));
    const healthUrl = `http://127.0.0.1:${healthServer.address().port}/mcp`;
    const originalOpenDialog = dialog.showOpenDialog;
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path.join(require('node:os').homedir(), '.local', 'bin', 'claude.exe')] });
    let approve = true;
    dialog.showMessageBox = async () => ({ response: approve ? 1 : 0, checkboxChecked: false });
    try {
      const mcpPath = path.join(root, 'project', '.mcp.json');
      const original = await require('node:fs/promises').readFile(mcpPath, 'utf8');
      await contents.executeJavaScript(`(() => {
        const select = document.querySelector('[aria-label="MCP source"]');
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, ${JSON.stringify(`mcp:${mcpPath}`)});
        select.dispatchEvent(new Event('change', { bubbles: true }));
      })()`);
      await waitFor(contents, "document.querySelector('.mcp-panel fieldset')?.disabled === true");
      assert.equal(await contents.executeJavaScript("document.querySelector('.mcp-panel').textContent.includes('fixture-private-value')"), false);
      await contents.executeJavaScript("document.querySelector('.mcp-panel .secondary-button').click()");
      await waitFor(contents, "document.querySelector('.mcp-panel fieldset')?.disabled === false");
      await contents.executeJavaScript(`(() => {
        for (const [label, value] of [['MCP name', 'actual-ui'], ['MCP endpoint', 'https://example.invalid/mcp']]) {
          const input = document.querySelector('[aria-label="' + label + '"]');
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      })()`);
      approve = false;
      await contents.executeJavaScript("document.querySelector('.mcp-panel .primary-button').click()");
      await waitFor(contents, "!document.querySelector('.mcp-panel .primary-button').disabled");
      assert.equal(await require('node:fs/promises').readFile(mcpPath, 'utf8'), original, 'Cancelled write leaves bytes unchanged');
      approve = true;
      await contents.executeJavaScript("document.querySelector('.mcp-panel .primary-button').click()");
      await waitFor(contents, "document.querySelector('[data-server=\"actual-ui\"]') !== null");
      await waitFor(contents, "Array.from(document.querySelectorAll('.instructions-panel .folder-row')).some(row => row.textContent.includes('.mcp.json') && row.textContent.includes('committed'))");
      const added = JSON.parse(await require('node:fs/promises').readFile(mcpPath, 'utf8'));
      assert.deepEqual(added['mcpServers']['actual-ui'], { type: 'http', url: 'https://example.invalid/mcp' });
      assert.equal(added.future.preserve, true);
      assert.equal(added.mcpServers.existing.env.TOKEN, 'fixture-private-value');
      await contents.executeJavaScript("document.querySelector('[data-server=\"actual-ui\"] [data-action=edit]').click()");
      await waitFor(contents, "document.querySelector('[aria-label=\"MCP replacement\"]') !== null");
      await contents.executeJavaScript(`(() => {
        const input = document.querySelector('[aria-label="MCP replacement"]');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(healthUrl)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
      })()`);
      await contents.executeJavaScript("document.querySelector('[data-action=save-edit]').click()");
      await waitFor(contents, "document.querySelector('[aria-label=\"MCP replacement\"]') === null");
      assert.equal(JSON.parse(await require('node:fs/promises').readFile(mcpPath, 'utf8')).mcpServers['actual-ui'].url, healthUrl);
      assert.equal(requests, 0, 'Open and saves never contact MCP');
      approve = false;
      await contents.executeJavaScript("document.querySelector('[data-server=\"actual-ui\"] [data-action=check]').click()");
      await waitFor(contents, "!document.querySelector('[data-server=\"actual-ui\"] [data-action=check]').disabled");
      assert.equal(requests, 0, 'Denied check never contacts MCP');
      approve = true;
      await contents.executeJavaScript("document.querySelector('[data-server=\"actual-ui\"] [data-action=check]').click()");
      await waitFor(contents, "document.querySelector('[data-server=\"actual-ui\"]').textContent.includes('handshake-complete')");
      assert.equal(requests, 2, 'Only initialize and initialized are sent');
      rejectHealth = true;
      await contents.executeJavaScript("document.querySelector('[data-server=\"actual-ui\"] [data-action=check]').click()");
      await waitFor(contents, "document.querySelector('[data-server=\"actual-ui\"]').textContent.includes('authentication-required')");
      assert.ok(JSON.parse(await require('node:fs/promises').readFile(mcpPath, 'utf8')).mcpServers['actual-ui'], 'Failed health check retains configured server');
      await contents.executeJavaScript("document.querySelector('[data-server=\"actual-ui\"] [data-action=delete]').click()");
      await waitFor(contents, "document.querySelector('[data-server=\"actual-ui\"]') === null");
      const receipts = await contents.executeJavaScript('window.workspaceManager.listTransactions()');
      for (const receipt of receipts.filter((entry) => entry.target === mcpPath && entry.status === 'committed')) {
        assert.equal(await contents.executeJavaScript(`window.workspaceManager.restoreTransaction(${JSON.stringify(receipt.id)})`), true);
      }
      assert.equal(await require('node:fs/promises').readFile(mcpPath, 'utf8'), original, 'MCP restore preserves original bytes');
    } finally {
      dialog.showOpenDialog = originalOpenDialog; dialog.showMessageBox = originalDialog;
      healthServer.closeAllConnections();
      await new Promise((resolve) => healthServer.close(resolve));
    }
    await contents.executeJavaScript("document.querySelector('.project-panel .folder-row button').click()");
    await waitFor(contents, "document.querySelectorAll('.project-panel .folder-row').length === 0 && !document.querySelector('.secondary-button').disabled");
    const reportRoot = path.resolve('plans/261024-1028-claude-workspace-manager/reports');
    await mkdir(reportRoot, { recursive: true });
    await writeFile(path.join(reportRoot, 'electron-runtime.png'), (await contents.capturePage()).toPNG());
    assert.deepEqual(failures, []);
    console.log('UI assertions passed; screenshot saved in plan reports.');
    app.exit(0);
  } catch (error) {
    console.error(error);
    console.error(failures);
    app.exit(1);
  }
});
