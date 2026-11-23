const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')
const SCRIPT = path.join(__dirname, '..', 'setup-hooks.cjs')
function repo() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'hooks-'))
  spawnSync('git', ['init', '-q', d])
  fs.mkdirSync(path.join(d, 'tools'))
  fs.copyFileSync(SCRIPT, path.join(d, 'tools', 'setup-hooks.cjs'))
  return d
}
const run = (d, ...a) => spawnSync(process.execPath, [path.join(d, 'tools', 'setup-hooks.cjs'), ...a], { encoding: 'utf8' })
const get = (d) => spawnSync('git', ['config', '--get', 'core.hooksPath'], { cwd: d, encoding: 'utf8' }).stdout.trim()

test('sets hooksPath on a fresh checkout', () => {
  const d = repo(); assert.strictEqual(run(d).status, 0); assert.strictEqual(get(d), 'tools/hooks')
})
test('warns and keeps a different hooksPath unless --force', () => {
  const d = repo(); spawnSync('git', ['config', 'core.hooksPath', '.husky'], { cwd: d })
  const r = run(d); assert.strictEqual(r.status, 1); assert.ok(r.stderr.includes('.husky')); assert.strictEqual(get(d), '.husky')
  assert.strictEqual(run(d, '--force').status, 0); assert.strictEqual(get(d), 'tools/hooks')
})
