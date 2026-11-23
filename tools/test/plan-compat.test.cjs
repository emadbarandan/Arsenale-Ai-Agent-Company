/* 1.4 plan data under the 1.3 code (spec 1.4 section 3.6, P1 test 6): the 1.3
 * tools are read out of git at the rel/1.3 merge commit and run on a folder
 * this build wrote. Skipped, with the reason, without git or the commit.
 * Invented data. */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { makeSandbox, SEED } = require('./helpers.cjs')

const REPO = path.join(__dirname, '..', '..')
const V13 = '2e96e56' // Merge S6: context packs, the last 1.3 commit before the 1.4 spec
const board = { door: 'dashboard', role: 'board', name: '' }
const git = (...args) => spawnSync('git', ['-C', REPO, ...args], { encoding: 'buffer', maxBuffer: 1 << 26 })
const can = git('cat-file', '-e', V13 + '^{commit}').status === 0
const skip = can ? false : 'no git, or the 1.3 commit ' + V13 + ' is not in this checkout'

function checkout(dir) {
  const ls = git('ls-tree', '-r', '--name-only', V13, '--', 'tools')
  if (ls.status !== 0) return null
  const files = ls.stdout.toString('utf8').split('\n').filter((f) => f && !/^tools\/(test|vendor|characters)\//.test(f) && /\.(cjs|js|json|md)$/.test(f))
  for (const f of files) {
    const r = git('show', V13 + ':' + f)
    if (r.status !== 0) return null
    const to = path.join(dir, f)
    fs.mkdirSync(path.dirname(to), { recursive: true })
    fs.writeFileSync(to, r.stdout)
  }
  return path.join(dir, 'tools')
}

test('P1 AT6: 1.3 code edits a 1.4 task title and every 1.4 field survives; 1.3 ignores the plan file', { skip }, (t) => {
  const sb = makeSandbox()
  t.after(() => sb.cleanup())
  sb.mod('agent-company.cjs').companyInit(SEED, ['implementer', 'tester'])
  const T = sb.mod('tasks.cjs'), Pl = sb.mod('plan.cjs')
  Pl.addVersion('tide-app', { name: '2.1', horizon: 'now' }, board)
  const ph = Pl.addPhase('tide-app', '2.1', { title: 'Storefront' }, board)
  const made = T.createTask({ title: 'Original', projectId: 'tide-app', targetVersion: '2.1', phaseId: ph.id, ownerTask: true, size: 'M' }, board)
  // import-only fields, as import-plan writes them
  const imp = Object.assign({}, board, { importer: true })
  T.updateTask({ id: made.id, planId: 'plan-x', source: 'plan.json#T-1', missingInImport: true }, imp)
  const file = path.join(sb.company, 'issues', made.id + '.json')
  const before = JSON.parse(fs.readFileSync(file, 'utf8'))
  for (const k of ['phaseId', 'ownerTask', 'planId', 'source', 'missingInImport']) assert.notEqual(before[k], undefined, k + ' is on disk')
  const tools = checkout(path.join(sb.base, 'v13'))
  assert.ok(tools, 'the 1.3 tools could be read from git')
  assert.equal(fs.existsSync(path.join(tools, 'plan.cjs')), false, 'this is the 1.3 code')
  const script = `
    const T = require('./tasks.cjs')
    T.updateTask({ id: ${JSON.stringify(made.id)}, title: 'Edited by 1.3' }, { door: 'dashboard', role: 'board', name: '' })
    process.stdout.write(JSON.stringify(T.getTask(${JSON.stringify(made.id)})))
  `
  const r = spawnSync(process.execPath, ['-e', script], { cwd: tools, env: Object.assign({}, sb.env), encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  const after = JSON.parse(fs.readFileSync(file, 'utf8'))
  assert.equal(after.title, 'Edited by 1.3')
  for (const k of ['phaseId', 'ownerTask', 'planId', 'source', 'missingInImport', 'targetVersion', 'size']) assert.equal(after[k], before[k], k + ' survives')
  assert.ok(fs.existsSync(path.join(sb.company, 'plan', 'tide-app.json')), 'the plan file is untouched')
})

test('P1: a 1.3 folder (no plan dir) reads as no versions, with targetVersion shown unlisted', (t) => {
  const sb = makeSandbox()
  t.after(() => sb.cleanup())
  sb.mod('agent-company.cjs').companyInit(SEED, ['implementer'])
  const T = sb.mod('tasks.cjs'), Pl = sb.mod('plan.cjs')
  T.createTask({ title: 'Legacy', projectId: 'tide-app', targetVersion: '1.3.1', size: 'S', type: 'bug' }, board)
  const v = Pl.view('tide-app', T.listTasks())
  assert.equal(v.exists, false)
  assert.deepEqual(v.unlisted.map((x) => x.name), ['1.3.1'])
  const ledger = sb.mod('ledger.cjs').ledger({ runs: [], active: [] }, { by: 'version', tasks: T.listTasks() })
  assert.ok(Array.isArray(ledger.rows))
})
