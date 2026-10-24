const { mkdtemp, mkdir, writeFile, readFile, rm } = require('node:fs/promises');
const { spawn } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'workspace-electron-'));
  const home = path.join(root, 'home');
  const profile = path.join(root, 'profile');
  const project = path.join(root, 'project');
  try {
    await Promise.all([mkdir(home), mkdir(profile), mkdir(project)]);
    await mkdir(path.join(profile, 'state'));
    await writeFile(path.join(profile, 'state', 'app-state.json'), JSON.stringify({
      schemaVersion: 1, language: 'en', projectRoots: [project],
    }));
    const mcpOriginal = JSON.stringify({ future: { preserve: true }, mcpServers: { existing: { command: 'fixture-command', env: { TOKEN: 'fixture-private-value' } } } });
    await writeFile(path.join(project, '.mcp.json'), mcpOriginal);
    await writeFile(path.join(project, 'CLAUDE.md'), '# Original\r\n');
    const env = { ...process.env, WORKSPACE_TEST_ROOT: root, CLAUDE_CONFIG_DIR: path.join(home, '.claude') };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.VITE_DEV_SERVER_URL;
    const child = spawn(require('electron'), [path.join(__dirname, 'electron-runtime-harness.cjs')], {
      cwd: path.resolve(__dirname, '../..'), env, stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);
    const timer = setTimeout(() => child.kill(), 45_000);
    try {
      const code = await new Promise((resolve, reject) => {
        child.on('error', reject);
        child.on('exit', resolve);
      });
      assert.equal(code, 0, 'Electron runtime checks failed');
    } finally {
      clearTimeout(timer);
    }
    const state = JSON.parse(await readFile(path.join(profile, 'state', 'app-state.json'), 'utf8'));
    assert.equal(state.language, 'vi');
    assert.deepEqual(state.projectRoots, []);
    assert.equal(await readFile(path.join(project, '.mcp.json'), 'utf8'), mcpOriginal);
    assert.equal(await readFile(path.join(project, 'CLAUDE.md'), 'utf8'), '# Original\r\n');
    console.log('PASS: production UI, sandbox bridge, refresh, locale persistence, registry removal, source unchanged.');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
