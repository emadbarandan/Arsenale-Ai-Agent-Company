/* bin/arsenale.cjs, the demo, the desk generator and the adapters.
 * Run: npm test */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const http = require('http')
const path = require('path')
const { spawn, spawnSync } = require('child_process')
const { makeSandbox, hashTree } = require('./helpers.cjs')

const REPO = path.join(__dirname, '..', '..')
const BIN = path.join(REPO, 'bin', 'arsenale.cjs')

const run = (args, env, input) => spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', env, input })

function get(port, url, cookie) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: url, agent: false, headers: Object.assign({ Host: '127.0.0.1:' + port }, cookie ? { Cookie: cookie } : {}) }, (res) => {
      let s = ''
      res.on('data', (c) => { s += c })
      res.on('end', () => resolve({ status: res.statusCode, text: s, headers: res.headers }))
    }).on('error', reject)
  })
}

test('arsenale --help, --version and unknown commands', () => {
  const h = run(['--help'], process.env)
  assert.equal(h.status, 0)
  for (const w of ['serve', 'demo', 'log', '--port', '--no-open', 'Exit codes', 'ARSENALE_HOME', 'never starts']) assert.ok(h.stdout.includes(w), 'help lacks ' + w)
  assert.equal(run(['--version'], process.env).stdout.trim(), require('../../package.json').version)
  assert.equal(run([], process.env).status, 1)
  assert.equal(run(['frobnicate'], process.env).status, 1)
  assert.equal(run(['serve', '--port', 'abc'], process.env).status, 1)
})

test('arsenale start | progress | finish aliases write to ARSENALE_HOME, through --stdin', (t) => {
  const sb = makeSandbox()
  t.after(() => sb.cleanup())
  const s = run(['start', '--stdin'], sb.env, JSON.stringify({ agent: 'tester', task: "it's a test" }))
  assert.equal(s.status, 0, s.stderr)
  const id = s.stdout.trim()
  assert.ok(fs.existsSync(path.join(sb.runs, 'active', id + '.json')))
  assert.equal(run(['progress', '--stdin'], sb.env, JSON.stringify({ id, doing: 'step' })).status, 0)
  const f = run(['finish', '--stdin'], sb.env, JSON.stringify({ id, agent: 'tester', task: "it's a test", status: 'ok' }))
  assert.equal(f.status, 0, f.stderr)
  assert.equal(fs.existsSync(path.join(sb.runs, 'active', id + '.json')), false)
  const paths = JSON.parse(run(['paths'], sb.env).stdout)
  assert.equal(paths.home, sb.root)
})

test('demo: serves invented data from a temporary folder and never touches the user data folder', async (t) => {
  const sb = makeSandbox()
  // a "real" data folder with a run in it, and a fake home with agent folders
  sb.run({ agent: 'tester', task: 'the user real run' })
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'arsenale-fakehome-'))
  fs.mkdirSync(path.join(home, '.claude', 'agents'), { recursive: true })
  fs.writeFileSync(path.join(home, '.claude', 'agents', 'private-agent.md'), '---\nname: private-agent\ndescription: x\n---\n')
  t.after(() => { sb.cleanup(); fs.rmSync(home, { recursive: true, force: true }) })
  const before = hashTree(sb.root)
  const beforeHome = hashTree(home)
  const port = 41000 + Math.floor(Math.random() * 2000)
  const env = Object.assign({}, sb.env, { HOME: home, USERPROFILE: home, ARSENALE_AGENT_DIRS: path.join(home, '.claude', 'agents') })
  const child = spawn(process.execPath, [BIN, 'demo', '--port', String(port), '--no-open'], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  t.after(() => child.kill())
  let out = ''
  await new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('demo did not start: ' + out)), 15000)
    child.stdout.on('data', (d) => { out += d; if (/Data folder: /.test(out)) { clearTimeout(to); resolve() } })
    child.stderr.on('data', (d) => { out += d })
    child.on('exit', (c) => { clearTimeout(to); reject(new Error('demo exited ' + c + ': ' + out)) })
  })
  const folder = /Data folder: (.+)/.exec(out)[1].trim()
  assert.ok(path.basename(folder).startsWith('arsenale-demo-'), folder)
  assert.notEqual(path.resolve(folder), path.resolve(sb.root))
  // the demo prints the address with its own key; the key buys the cookie
  const key = new URL(/Arsenale demo \(invented data\): (\S+)/.exec(out)[1]).searchParams.get('k')
  assert.match(key, /^[a-f0-9]{64}$/)
  const cookie = (await get(port, '/?k=' + key)).headers['set-cookie'][0].split(';')[0]
  assert.equal((await get(port, '/api/state')).status, 401, 'no key, no data')
  const state = JSON.parse((await get(port, '/api/state', cookie)).text)
  assert.ok(state.runs.length > 10)
  assert.ok(state.active.length >= 3)
  assert.ok(!state.runs.some((r) => r.task === 'the user real run'), 'the user run is not in the demo')
  assert.ok(!state.agents.some((a) => a.name === 'private-agent'), 'the user agents are not in the demo')
  assert.ok(state.agents.some((a) => a.name === 'implementer'), 'the bundled agents are')
  const co = JSON.parse((await get(port, '/api/company', cookie)).text)
  assert.equal(co.company.name, 'Northwind Labs')
  assert.deepEqual(hashTree(sb.root), before, 'the user data folder is untouched')
  assert.deepEqual(hashTree(home), beforeHome, 'the home folder is untouched')
})

test('arsenale open: prints the address with the data folder\'s key; with no key yet it says to serve first', (t) => {
  const sb = makeSandbox()
  t.after(() => sb.cleanup())
  const none = run(['open', '--no-open'], sb.env)
  assert.equal(none.status, 1)
  assert.match(none.stderr, /arsenale serve/)
  const { key } = sb.mod('launch-key.cjs').ensure()
  const r = run(['open', '--no-open', '--port', '4999'], sb.env)
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stdout.trim(), 'Arsenale dashboard: http://localhost:4999/?k=' + key)
  assert.match(run(['--help'], process.env).stdout, /open {2}\[--port N\] \[--no-open\]/)
})

test('desks are generated for any agent list: zones by name or zone line, no desk twice, spill and leads', () => {
  const { homeDesks } = require('../agent-office-page.cjs')
  const names = ['implementer', 'tester', 'code-reviewer', 'ui-designer', 'user-guide', 'my-custom-bot', 'qa-auditor', 'docs-writer', 'product-lead', 'x-reviewer', 'y-reviewer', 'z-reviewer', 'w-reviewer', 'v-reviewer', 'u-reviewer']
  const r = homeDesks(names.map((name) => ({ name })).concat([{ name: 'pinned', dept: 'design' }, { name: 'constructor' }]))
  assert.equal(r.zones['code-reviewer'], 'review')
  assert.equal(r.zones['ui-designer'], 'design')
  assert.equal(r.zones['user-guide'], 'docs')
  assert.equal(r.zones['my-custom-bot'], 'build')
  assert.equal(r.zones.pinned, 'design')
  assert.equal(r.zones['product-lead'], 'lead')
  assert.equal(r.seats['product-lead'], undefined, 'a lead has no desk')
  const used = Object.values(r.seats).map((s) => s.join(':'))
  assert.equal(new Set(used).size, used.length, 'no desk is given twice')
  // eight reviewers for six review desks: two spill into another zone
  const reviewers = Object.keys(r.zones).filter((n) => r.zones[n] === 'review')
  assert.equal(reviewers.length, 8)
  assert.equal(reviewers.filter((n) => r.seats[n] && r.seats[n][0] === 'review').length, 6)
  assert.equal(reviewers.filter((n) => r.seats[n]).length, 8)
  // more agents than the 18 desks: the rest have no home desk, nothing breaks
  const many = homeDesks(Array.from({ length: 40 }, (_, i) => ({ name: 'agent-' + i })))
  assert.equal(Object.keys(many.seats).length, 18)
})

test('adapters: the Cursor rule is the shared block, and every adapter README exists', () => {
  const inst = fs.readFileSync(path.join(REPO, 'adapters', 'instructions.md'), 'utf8')
  const mdc = fs.readFileSync(path.join(REPO, 'adapters', 'cursor', 'arsenale.mdc'), 'utf8')
  assert.equal(mdc.replace(/^---[\s\S]*?---\n\n/, ''), inst, 'regenerate adapters/cursor/arsenale.mdc from instructions.md')
  for (const a of ['claude-code', 'codex', 'gemini', 'cursor', 'aider', 'generic']) assert.ok(fs.existsSync(path.join(REPO, 'adapters', a, 'README.md')), a)
  assert.ok(inst.includes('{{ARSENALE}}'))
})

test('the example seed names only heads that ship, and the version is in the changelog', () => {
  const seed = JSON.parse(fs.readFileSync(path.join(REPO, 'company.example', 'seed.json'), 'utf8'))
  for (const o of seed.offices) {
    if (o.leadEmployeeId && o.leadEmployeeId !== 'supervisor') assert.ok(fs.existsSync(path.join(REPO, 'agents', o.leadEmployeeId + '.md')), o.leadEmployeeId + ' has no definition')
  }
  for (const id of Object.keys(seed.employees)) assert.ok(fs.existsSync(path.join(REPO, 'agents', id + '.md')), id + ' has no definition')
  const version = require('../../package.json').version
  assert.match(fs.readFileSync(path.join(REPO, 'CHANGELOG.md'), 'utf8'), new RegExp('^## ' + version.replace(/\./g, '\\.') + ' ', 'm'))
})

test('Claude Code hook:PreToolUse starts a run, PostToolUse finishes it, junk input is ignored', (t) => {
  const sb = makeSandbox()
  t.after(() => sb.cleanup())
  const hook = path.join(REPO, 'adapters', 'claude-code', 'hooks', 'arsenale-hook.cjs')
  const call = (ev) => spawnSync(process.execPath, [hook], { input: typeof ev === 'string' ? ev : JSON.stringify(ev), encoding: 'utf8', env: sb.env })
  const base = { session_id: 's1', tool_use_id: 'tu1', cwd: '/work/my-app', tool_name: 'Task', tool_input: { subagent_type: 'tester', description: 'Run the suite', prompt: 'Run it' } }
  const pre = call(Object.assign({ hook_event_name: 'PreToolUse' }, base))
  assert.equal(pre.status, 0)
  assert.equal(pre.stdout, '', 'a hook prints nothing')
  const active = fs.readdirSync(path.join(sb.runs, 'active'))
  assert.equal(active.length, 1)
  const a = JSON.parse(fs.readFileSync(path.join(sb.runs, 'active', active[0]), 'utf8'))
  assert.equal(a.agent, 'tester')
  assert.equal(a.project, 'my-app')
  const post = call(Object.assign({ hook_event_name: 'PostToolUse', tool_response: { totalTokens: 1234, totalToolUseCount: 5, totalDurationMs: 9000 } }, base))
  assert.equal(post.status, 0)
  assert.equal(fs.readdirSync(path.join(sb.runs, 'active')).length, 0)
  const done = fs.readdirSync(sb.runs).filter((f) => f.endsWith('.json'))
  assert.equal(done.length, 1)
  const rec = JSON.parse(fs.readFileSync(path.join(sb.runs, done[0]), 'utf8'))
  assert.equal(rec.id, a.id)
  assert.equal(rec.usage.tokens, 1234)
  for (const junk of ['not json', '{}', JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash' })]) assert.equal(call(junk).status, 0)
  assert.equal(fs.readdirSync(path.join(sb.runs, 'active')).length, 0, 'other tools are not logged')
})
