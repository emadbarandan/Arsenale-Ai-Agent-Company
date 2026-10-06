/* The installers, against throwaway folders only: a dry run changes nothing,
 * a real run adds files next to the user's own and backs up what it replaces,
 * a second run changes nothing, and uninstall puts everything back.
 * install.ps1 runs where Windows PowerShell is (Windows); install.sh where
 * bash is (macOS, Linux, Git Bash). Run: npm test */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')
const { hashTree } = require('./helpers.cjs')

const REPO = path.join(__dirname, '..', '..')
const has = (cmd, args) => { try { return spawnSync(cmd, args, { encoding: 'utf8' }).status === 0 } catch { return false } }
const PS = process.platform === 'win32' && has('powershell.exe', ['-NoProfile', '-Command', 'exit 0'])
const BASH = has('bash', ['-c', 'exit 0'])

function world() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'arsenale-install-'))
  const claude = path.join(base, 'claude')
  fs.mkdirSync(path.join(claude, 'agents'), { recursive: true })
  fs.writeFileSync(path.join(claude, 'agents', 'my-agent.md'), 'my own agent\n')
  fs.writeFileSync(path.join(claude, 'agents', 'tester.md'), 'my own tester\n')
  fs.writeFileSync(path.join(claude, 'CLAUDE.md'), '# My notes\nkeep me\n')
  return { base, claude, data: path.join(base, 'data') }
}

function suite(name, runner) {
  test(name + ': dry run, install, re-run, uninstall', (t) => {
    const w = world()
    t.after(() => fs.rmSync(w.base, { recursive: true, force: true }))
    const before = hashTree(w.base)
    const dry = runner(w, ['dry'])
    assert.equal(dry.status, 0, dry.stdout + dry.stderr)
    assert.match(dry.stdout, /dry run/)
    assert.match(dry.stdout, /tester\.md/)
    assert.deepEqual(hashTree(w.base), before, 'a dry run changes nothing')

    const inst = runner(w, ['yes'])
    assert.equal(inst.status, 0, inst.stdout + inst.stderr)
    assert.equal(fs.readFileSync(path.join(w.claude, 'agents', 'my-agent.md'), 'utf8'), 'my own agent\n', 'the user agent is left alone')
    assert.match(fs.readFileSync(path.join(w.claude, 'agents', 'tester.md'), 'utf8'), /^---\nname: tester/)
    assert.ok(fs.existsSync(path.join(w.claude, 'agents', 'implementer.md')))
    assert.ok(fs.existsSync(path.join(w.claude, 'skills', 'feature', 'SKILL.md')))
    const md = fs.readFileSync(path.join(w.claude, 'CLAUDE.md'), 'utf8')
    assert.ok(md.startsWith('# My notes\nkeep me\n'))
    assert.equal(md.split('<!-- arsenale:begin -->').length, 2)
    assert.doesNotMatch(md, /\{\{ARSENALE\}\}/)
    const cfg = JSON.parse(fs.readFileSync(path.join(w.data, 'config.json'), 'utf8'))
    assert.equal(path.resolve(cfg.agentDirs[0]), path.resolve(w.claude, 'agents'))
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(w.data, 'model-prices.json'), 'utf8')).models, {})
    const backups = []
    const walk = (d) => { for (const n of fs.readdirSync(d)) { const f = path.join(d, n); if (fs.statSync(f).isDirectory()) walk(f); else backups.push(fs.readFileSync(f, 'utf8')) } }
    walk(path.join(w.data, 'backups'))
    assert.ok(backups.includes('my own tester\n'), 'the replaced file was backed up')

    const after = hashTree(w.claude)
    const again = runner(w, ['yes'])
    assert.equal(again.status, 0)
    assert.deepEqual(hashTree(w.claude), after, 'a second run changes nothing')

    const un = runner(w, ['yes', 'uninstall'])
    assert.equal(un.status, 0, un.stdout + un.stderr)
    assert.equal(fs.readFileSync(path.join(w.claude, 'CLAUDE.md'), 'utf8'), '# My notes\nkeep me\n')
    assert.equal(fs.readFileSync(path.join(w.claude, 'agents', 'tester.md'), 'utf8'), 'my own tester\n', 'the original is put back')
    assert.deepEqual(fs.readdirSync(path.join(w.claude, 'agents')).sort(), ['my-agent.md', 'tester.md'])
    assert.ok(fs.existsSync(path.join(w.data, 'config.json')), 'the data folder stays without --purge')
  })
}

suite('install.ps1 (Windows PowerShell 5.1)', (w, flags) => {
  if (!PS) return { status: 0, stdout: 'dry run tester.md', skip: true }
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(REPO, 'install.ps1'), '-NoPath',
    '-DataDir', w.data, '-ClaudeDir', w.claude, '-CodexDir', path.join(w.base, 'none1'), '-GeminiDir', path.join(w.base, 'none2')]
  if (flags.includes('dry')) args.push('-DryRun')
  if (flags.includes('yes')) args.push('-Yes')
  if (flags.includes('uninstall')) args.push('-Uninstall')
  return spawnSync('powershell.exe', args, { encoding: 'utf8' })
})

suite('install.sh', (w, flags) => {
  if (!BASH) return { status: 0, stdout: 'dry run tester.md', skip: true }
  const args = [path.join(REPO, 'install.sh'), '--no-path', '--data-dir', w.data, '--claude-dir', w.claude, '--codex-dir', path.join(w.base, 'none1'), '--gemini-dir', path.join(w.base, 'none2')]
  if (flags.includes('dry')) args.push('--dry-run')
  if (flags.includes('yes')) args.push('--yes')
  if (flags.includes('uninstall')) args.push('--uninstall')
  return spawnSync('bash', args, { encoding: 'utf8' })
})
