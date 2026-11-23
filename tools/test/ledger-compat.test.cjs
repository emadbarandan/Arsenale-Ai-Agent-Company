/* 1.3 data under the 1.2.2 code (spec 1.3 section 3.5, S3 tests 4 and 5).
 *
 * The 1.2.2 tools are read out of git at its release commit (git show) and
 * run, in their own process, on a data folder this build wrote. Skipped, with
 * the reason, without git or without that commit. Invented data. */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { makeSandbox, SEED } = require('./helpers.cjs')

const REPO = path.join(__dirname, '..', '..')
const V122 = 'dbaca94' // Arsenale 1.2.2
const board = { door: 'dashboard', role: 'board', name: '' }
const git = (...args) => spawnSync('git', ['-C', REPO, ...args], { encoding: 'buffer', maxBuffer: 1 << 26 })
const can = git('cat-file', '-e', V122 + '^{commit}').status === 0

function checkout(dir) {
  const ls = git('ls-tree', '-r', '--name-only', V122, '--', 'tools')
  if (ls.status !== 0) return null
  const files = ls.stdout.toString('utf8').split('\n').filter((f) => f && !/^tools\/(test|vendor|characters)\//.test(f) && /\.(cjs|js|json|md)$/.test(f))
  for (const f of files) {
    const r = git('show', V122 + ':' + f)
    if (r.status !== 0) return null
    const to = path.join(dir, f)
    fs.mkdirSync(path.dirname(to), { recursive: true })
    fs.writeFileSync(to, r.stdout)
  }
  return path.join(dir, 'tools')
}

const SIX = { type: 'feature', size: 'M', tier: 'standard', targetVersion: '1.3.1', tokenEstimate: 12000, acceptance: 'Opens a 1.2 folder unchanged.' }
const skip = can ? false : 'no git, or the 1.2.2 commit ' + V122 + ' is not in this checkout'

test('AT4: 1.2.2 code edits the title of a 1.3 task and the six fields survive', { skip }, (t) => {
  const sb = makeSandbox()
  t.after(() => sb.cleanup())
  sb.mod('agent-company.cjs').companyInit(SEED, ['implementer', 'tester'])
  const T = sb.mod('tasks.cjs')
  const made = T.createTask(Object.assign({ title: 'Original title' }, SIX), board)
  const tools = checkout(path.join(sb.base, 'v122'))
  assert.ok(tools, 'the 1.2.2 tools could be read from git')
  assert.equal(fs.readFileSync(path.join(tools, 'tasks.cjs'), 'utf8').includes('targetVersion'), false, 'this is the 1.2.2 code, which knows no task fields')
  const script = `
    const T = require('./tasks.cjs')
    T.updateTask({ id: ${JSON.stringify(made.id)}, title: 'Edited by 1.2.2' }, { door: 'dashboard', role: 'board', name: '' })
    process.stdout.write(JSON.stringify(T.getTask(${JSON.stringify(made.id)})))
  `
  const r = spawnSync(process.execPath, ['-e', script], { cwd: tools, env: Object.assign({}, sb.env), encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  const onDisk = JSON.parse(fs.readFileSync(path.join(sb.company, 'issues', made.id + '.json'), 'utf8'))
  assert.equal(onDisk.title, 'Edited by 1.2.2')
  for (const [k, v] of Object.entries(SIX)) assert.equal(onDisk[k], v, k + ' survives')
  // and 1.3 reads it back with the fields intact
  assert.equal(sb.mod('tasks.cjs').getTask(made.id).targetVersion, '1.3.1')
})

test('AT5: 1.2.2 code renders a 1.3 data folder with meters and defaults-format prices without an error', { skip }, (t) => {
  const prices = {
    source: { label: 'Invented list prices', url: 'https://example.org/prices', fetched: '2026-11-18' },
    models: {
      'Sonnet 5.5': { provider: 'anthropic', input: 2, output: 10, cacheRead: 0.1, cacheWrite5m: 2.5, cacheWrite1h: 4 },
      'Haiku 5.5': { provider: 'anthropic', input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite5m: 0.125, cacheWrite1h: 0.2, over100k: { input: 0.5, output: 2.5, cacheRead: 0.05, cacheWrite5m: 0.625, cacheWrite1h: 1 } },
    },
  }
  const sb = makeSandbox({ prices: prices.models })
  t.after(() => sb.cleanup())
  fs.writeFileSync(path.join(sb.root, 'model-prices.json'), JSON.stringify(prices))
  sb.mod('agent-company.cjs').companyInit(SEED, ['implementer', 'tester'])
  const T = sb.mod('tasks.cjs')
  const made = T.createTask(Object.assign({ title: 'With a run' }, SIX), board)
  // a run as 1.3 writes it: reported meters and a transcript with a "long" split
  const meters = { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 5000, cacheWriteTokens: 300 }
  sb.run({ agent: 'tester', project: 'democalc', model: 'Sonnet 5.5', issue: made.id, provider: 'anthropic', strategy: 'standard', meters, usage: Object.assign({ tokens: 6500 }, meters) })
  sb.measured('implementer', 'democalc', 4000, { model: 'Haiku 5.5', issue: made.id })
  const tools = checkout(path.join(sb.base, 'v122'))
  assert.ok(tools)
  const script = `
    const C = require('./agent-company.cjs')
    const B = require('./build-agent-dashboard.cjs')
    const Tk = require('./tasks.cjs')
    const co = C.readCompany()
    const st = B.collect()
    const ev = C.costEvents(st, co)
    process.stdout.write(JSON.stringify({ problems: co.problems, runs: st.runs.length, cost: ev.length, tasks: Tk.listTasks().length, priced: co.pricesSet }))
  `
  const r = spawnSync(process.execPath, ['-e', script], { cwd: tools, env: Object.assign({}, sb.env), encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  const out = JSON.parse(r.stdout)
  assert.deepEqual(out.problems, [])
  assert.equal(out.runs, 2)
  assert.equal(out.tasks, 1)
})

test('reading never rewrites: the company folder is byte-identical after the 1.3 readers run', (t) => {
  const sb = makeSandbox()
  t.after(() => sb.cleanup())
  sb.mod('agent-company.cjs').companyInit(SEED, ['implementer', 'tester'])
  const T = sb.mod('tasks.cjs')
  const made = T.createTask(Object.assign({ title: 'Stays put' }, SIX), board)
  const snap = () => fs.readdirSync(path.join(sb.company, 'issues')).map((f) => f + fs.readFileSync(path.join(sb.company, 'issues', f), 'utf8')).join('|')
  const before = snap()
  T.getTask(made.id); T.listTasks(); T.readTask(made.id)
  assert.equal(snap(), before)
})
