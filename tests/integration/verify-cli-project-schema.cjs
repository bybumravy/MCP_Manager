const { mkdtemp, mkdir, readFile, rm, writeFile } = require('node:fs/promises');
const { spawnSync } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

async function main() {
  const executable = process.argv[2];
  if (!executable || !path.isAbsolute(executable)) throw new Error('Pass an absolute Claude executable path.');
  const root = await mkdtemp(path.join(os.tmpdir(), 'cwm-cli-schema-'));
  try {
    const home = path.join(root, 'home');
    const project = path.join(root, 'project');
    await mkdir(home); await mkdir(project);
    await writeFile(path.join(project, '.mcp.json'), '{"future":{"preserve":true},"mcpServers":{}}');
    const env = { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_CONFIG_DIR: path.join(home, '.claude') };
    const result = spawnSync(executable, ['mcp', 'add-json', '--scope', 'project', 'fixture', '{"type":"http","url":"https://example.invalid/mcp"}'], {
      cwd: project, env, encoding: 'utf8', timeout: 15000, windowsHide: true,
    });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, 'Isolated CLI add-json failed');
    const config = JSON.parse(await readFile(path.join(project, '.mcp.json'), 'utf8'));
    assert.deepEqual(config.mcpServers.fixture, { type: 'http', url: 'https://example.invalid/mcp' });
    console.log('PASS: installed CLI writes documented project .mcp.json HTTP schema.');
    console.log(config.future?.preserve === true
      ? 'Preservation probe: unrelated top-level fields retained.'
      : 'Preservation probe: unrelated top-level fields were removed; do not use CLI as a preserving writer.');
  } finally { await rm(root, { recursive: true, force: true }); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
