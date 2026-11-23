const test = require('node:test')
const assert = require('node:assert')
const path = require('path')
const { spawnSync } = require('child_process')
const HOOK = path.join(__dirname, '..', 'hooks', 'pre-push')
const { MESSAGE } = require(HOOK)
const SHA = 'a'.repeat(40), ZERO = '0'.repeat(40)
const run = (url, line) => spawnSync(process.execPath, [HOOK, 'origin', url], { input: line, encoding: 'utf8' })
const branch = 'refs/heads/main ' + SHA + ' refs/heads/main ' + ZERO + '\n'
const tag = 'refs/tags/v1.2.2 ' + SHA + ' refs/tags/v1.2.2 ' + ZERO + '\n'
const PUB = 'https://github.com/emadbarandan/Arsenale-Ai-Agent-Company.git'

test('branch push to the public repo is refused with the message', () => {
  const r = run(PUB, branch)
  assert.strictEqual(r.status, 1)
  assert.ok(r.stderr.includes(MESSAGE))
})
test('release tag push to the public repo passes', () => assert.strictEqual(run(PUB, tag).status, 0))
test('non-release tag, tag deletion and mixed pushes are refused', () => {
  assert.strictEqual(run(PUB, 'refs/tags/x ' + SHA + ' refs/tags/x ' + ZERO + '\n').status, 1)
  assert.strictEqual(run(PUB, '(delete) ' + ZERO + ' refs/tags/v1.0.0 ' + SHA + '\n').status, 1)
  assert.strictEqual(run(PUB, tag + branch).status, 1)
})
test('branch push to another remote passes', () => {
  assert.strictEqual(run('https://github.com/emadbarandan/arsenale-dev.git', branch).status, 0)
  assert.strictEqual(run('git@github.com:emadbarandan/Arsenale-Ai-Agent-Company-fork.git', branch).status, 0)
})
test('url variants of the public repo are all guarded', () => {
  for (const u of [
    'git@github.com:emadbarandan/Arsenale-Ai-Agent-Company.git',
    'ssh://git@github.com/emadbarandan/Arsenale-Ai-Agent-Company.git',
    'https://github.com/emadbarandan/Arsenale-Ai-Agent-Company',
    'https://github.com/emadbarandan/Arsenale-Ai-Agent-Company/',
    'HTTPS://GITHUB.COM/EMADBARANDAN/ARSENALE-AI-AGENT-COMPANY.GIT',
    'https://user@github.com/emadbarandan/arsenale-ai-agent-company.git'
  ]) {
    assert.strictEqual(run(u, branch).status, 1, u)
    assert.strictEqual(run(u, tag).status, 0, u)
  }
})
test('empty stdin passes', () => assert.strictEqual(run(PUB, '').status, 0))

test('ssh with a port and the old repo name are guarded', () => {
  for (const u of ['ssh://git@github.com:22/emadbarandan/Arsenale-Ai-Agent-Company.git', 'https://github.com/emadbarandan/Arsenale.git', 'git@github.com:emadbarandan/Arsenale']) {
    assert.strictEqual(run(u, branch).status, 1, u)
    assert.strictEqual(run(u, tag).status, 0, u)
  }
})
test('only v<digit> tags pass', () => {
  for (const t of ['refs/tags/v', 'refs/tags/vx', 'refs/tags/release']) {
    assert.strictEqual(run(PUB, t + ' ' + SHA + ' ' + t + ' ' + ZERO + '\n').status, 1, t)
  }
})
