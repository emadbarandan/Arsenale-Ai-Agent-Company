/* Import and export of plans (spec 1.4 P2). Invented data. */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { makeSandbox, SEED } = require('./helpers.cjs')

const FIX = path.join(__dirname, 'fixtures', 'plan-v1')
const fx = (n) => path.join(FIX, n)
const board = { door: 'dashboard', role: 'board', name: '' }
const PRJ = 'tide-app'

function setup(t) {
  const sb = makeSandbox()
  t.after(() => sb.cleanup())
  sb.mod('agent-company.cjs').companyInit(SEED, ['implementer', 'tester'])
  process.env.ARSENALE_BOARD_TOKEN = sb.boardKey
  const IO = sb.mod('plan-io.cjs')
  const T = sb.mod('tasks.cjs'), Pl = sb.mod('plan.cjs')
  const byPlan = (id, project) => T.listTasks().filter((s) => s.projectId === (project || PRJ)).map((s) => T.readTask(s.id)).find((x) => x.planId === id)
  const cmd = (name, args) => { const out = []; const code = IO.run(args, (l) => out.push(l), name); return { code, out: out.join('\n') } }
  const tmp = (name, obj) => { const f = path.join(sb.company, '..', name); fs.writeFileSync(f, typeof obj === 'string' ? obj : JSON.stringify(obj)); return f }
  return { sb, IO, T, Pl, byPlan, cmd, tmp }
}
const stripAt = (o) => JSON.parse(JSON.stringify(o, (k, v) => (k === 'updated_at' || k === 'project' ? undefined : v)))
const planFile = (sb, p) => path.join(sb.company, 'plan', p + '.json')

test('P2 AT1: plan.json imports with --version 2.1 and the Dock progress equals expected.json', (t) => {
  const { sb, T, Pl, cmd } = setup(t)
  const r = cmd('import-plan', [fx('plan.json'), '--project', PRJ, '--version', '2.1'])
  assert.equal(r.code, 0, r.out)
  const exp = JSON.parse(fs.readFileSync(fx('expected.json'), 'utf8')).progress
  const v = Pl.view(PRJ, T.listTasks()).versions.find((x) => x.name === '2.1')
  for (const e of exp.phases) assert.equal(v.phases.find((p) => p.id === e.id).progress.percent, e.percent, e.id)
  for (const e of exp.phases) assert.equal(v.phases.find((p) => p.id === e.id).progress.doneWeight, e.doneWeight)
  assert.equal(v.progress.percent, exp.overall.percent)
  assert.equal(v.progress.tasks, exp.overall.tasks)
  const t4 = T.listTasks().map((s) => T.readTask(s.id)).find((x) => x.planId === 'B-04')
  assert.equal(t4.ownerTask, true)
  assert.equal(t4.status, 'in_progress')
  assert.ok(t4.history.some((h) => h.by === 'import'), 'history says by import')
  assert.equal(Pl.readPlan(PRJ).lastImport.file, 'plan.json')
  assert.equal(JSON.stringify(Pl.readPlan(PRJ).lastImport).includes(path.dirname(fx('plan.json'))), false, 'no path kept')
})

for (const [file, flags, mode] of [['plan.json', ['--version', '2.1'], { version: '2.1' }], ['plan-versions.json', ['--phases-as', 'versions'], { phasesAs: 'versions' }]]) {
  test('P2 AT2: export -> import into an empty project -> export is equal, and passes plan-check (' + file + ')', (t) => {
    const { sb, IO, tmp, cmd } = setup(t)
    const S = sb.mod('plan-schema.cjs')
    assert.equal(cmd('import-plan', [fx(file), '--project', 'tide-app', ...flags]).code, 0)
    const e1 = IO.exportPlan('tide-app', mode).plan
    assert.equal(S.check(e1).ok, true)
    assert.equal(cmd('import-plan', [tmp('e1-' + file, e1), '--project', 'demo-calc', ...flags]).code, 0)
    const e2 = IO.exportPlan('demo-calc', mode).plan
    assert.deepEqual(stripAt(e2), stripAt(e1))
  })
}

test('P2 AT2b: versions mode reads the version from the phase and lists target_version overrides', (t) => {
  const { sb, T, Pl, cmd, byPlan } = setup(t)
  const r = cmd('import-plan', [fx('plan-versions.json'), '--project', PRJ, '--phases-as', 'versions'])
  assert.equal(r.code, 0, r.out)
  assert.match(r.out, /O-04 -> 2\.1/)
  const p = Pl.readPlan(PRJ)
  assert.deepEqual(p.versions.map((v) => [v.name, v.title]).sort(), [['2.1', 'Ordering'], ['2.2', 'Delivery']])
  assert.equal(byPlan('O-04').targetVersion, '2.1')
  assert.equal(byPlan('O-03').targetVersion, '2.2')
  const no = cmd('import-plan', [fx('plan.json'), '--project', 'demo-calc'])
  assert.equal(no.code, 1)
  assert.match(no.out, /Say how to read the phases/)
})

test('P2 AT3: re-importing the same file changes nothing', (t) => {
  const { sb, T, cmd } = setup(t)
  assert.equal(cmd('import-plan', [fx('plan.json'), '--project', PRJ, '--version', '2.1']).code, 0)
  const snap = () => {
    const out = {}
    const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else out[f] = fs.readFileSync(f, 'utf8') } }
    walk(sb.company); try { walk(path.join(sb.company, '..', 'agent-runs')) } catch { /* none */ }
    return out
  }
  const before = snap()
  const r = cmd('import-plan', [fx('plan.json'), '--project', PRJ, '--version', '2.1', '--json'])
  assert.equal(r.code, 0)
  const c = JSON.parse(r.out).counts
  assert.equal(c.created, 0); assert.equal(c.updated, 0); assert.equal(c.flagged, 0); assert.equal(c.unchanged, 9, '7 tasks and 2 decisions')
  const after = snap()
  assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort())
  for (const k of Object.keys(before)) if (!/activity|inbox/.test(k)) assert.equal(after[k], before[k], k)
  assert.equal(T.listTasks().length, 7)
})

test('P2 AT4: the four rows of the conflict rule', (t) => {
  const { T, cmd, byPlan } = setup(t)
  const A = { door: 'dashboard', role: 'board', name: '' }
  assert.equal(cmd('import-plan', [fx('plan.json'), '--project', PRJ, '--version', '2.1']).code, 0)
  // Arsenale changes: B-02 title (file unchanged), B-03 status, B-05 status, B-06 title
  T.updateTask({ id: byPlan('B-02').id, title: 'Order form, mine' }, A)
  T.updateTask({ id: byPlan('B-03').id, status: 'blocked' }, A)
  T.updateTask({ id: byPlan('B-05').id, status: 'in_progress' }, A)
  T.updateTask({ id: byPlan('B-06').id, title: 'Tracking, mine' }, A)
  const r = cmd('import-plan', [fx('plan-conflict.json'), '--project', PRJ, '--version', '2.1', '--json'])
  assert.equal(r.code, 2, 'done with conflicts')
  const res = JSON.parse(r.out)
  const has = (item, field, kept) => res.conflicts.some((c) => c.item === item && c.field === field && c.kept === kept)
  assert.equal(byPlan('B-01').title, 'Menu page (new look)', 'file changed, Arsenale not: take the file')
  assert.equal(byPlan('B-02').title, 'Order form, mine', 'Arsenale changed, file not: keep Arsenale')
  assert.equal(byPlan('B-03').status, 'blocked'); assert.ok(has('task B-03', 'status', 'arsenale'), 'both changed, file older: Arsenale')
  assert.equal(byPlan('B-05').status, 'todo'); assert.ok(has('task B-05', 'status', 'file'), 'both changed, file newer: file')
  assert.equal(byPlan('B-06').title, 'Tracking, mine'); assert.ok(has('task B-06', 'title', 'arsenale'), 'both changed, no dates: Arsenale wins, listed')
  assert.equal(res.conflicts.length, 3)
  // and the next import of the same file does not list them again as new changes made by the file
  assert.equal(byPlan('B-07').missingInImport, true)
})

test('P2 AT5: an item dropped from the file is flagged, never deleted; native items are never flagged; it leaves the export; it can come back', (t) => {
  const { T, IO, cmd, byPlan } = setup(t)
  const A = { door: 'dashboard', role: 'board', name: '' }
  assert.equal(cmd('import-plan', [fx('plan.json'), '--project', PRJ, '--version', '2.1']).code, 0)
  const native = T.createTask({ title: 'My own task', projectId: PRJ, targetVersion: '2.1' }, A)
  const r = cmd('import-plan', [fx('plan-conflict.json'), '--project', PRJ, '--version', '2.1', '--json'])
  assert.equal(JSON.parse(r.out).counts.flagged, 3, 'B-07 and the two decisions the file no longer has')
  assert.equal(byPlan('B-07').missingInImport, true)
  assert.ok(T.readTask(byPlan('B-07').id), 'not deleted')
  assert.equal(T.readTask(native.id).missingInImport, undefined)
  const ex = IO.exportPlan(PRJ, { version: '2.1' })
  assert.equal(ex.plan.tasks.some((x) => x.id === 'B-07'), false)
  assert.equal(ex.summary.goneFromImport, 1)
  assert.equal(ex.plan.decisions.length, 0)
  assert.equal(cmd('import-plan', [fx('plan.json'), '--project', PRJ, '--version', '2.1']).code, 0)
  assert.equal(byPlan('B-07').missingInImport, undefined, 'back in the file: cleared')
})

test('P2 AT6: an invalid file writes nothing and exits 1', (t) => {
  const { sb, cmd } = setup(t)
  const before = fs.existsSync(path.join(sb.company, 'plan'))
  for (const n of ['invalid-enum.json', 'invalid-duplicate-id.json', 'invalid-phase.json']) {
    const r = cmd('import-plan', [fx(n), '--project', PRJ, '--version', '2.1'])
    assert.equal(r.code, 1, n)
    assert.match(r.out, /Import refused, nothing written/)
  }
  assert.equal(fs.existsSync(path.join(sb.company, 'plan')), before)
  assert.equal(fs.existsSync(path.join(sb.company, 'issues')) ? fs.readdirSync(path.join(sb.company, 'issues')).length : 0, 0)
})

test('P2 AT7: without the owner key the import is refused; --dry-run works and writes nothing', (t) => {
  const { sb, cmd, T } = setup(t)
  const key = process.env.ARSENALE_BOARD_TOKEN
  delete process.env.ARSENALE_BOARD_TOKEN
  try {
    const r = cmd('import-plan', [fx('plan.json'), '--project', PRJ, '--version', '2.1'])
    assert.equal(r.code, 1)
    assert.match(r.out, /Only the owner/)
    assert.equal(T.listTasks().length, 0)
    const d = cmd('import-plan', [fx('plan.json'), '--project', PRJ, '--version', '2.1', '--dry-run', '--json'])
    assert.equal(d.code, 0, d.out)
    assert.equal(JSON.parse(d.out).counts.created, 10, '7 tasks, 2 decisions and the new version 2.1')
  } finally { process.env.ARSENALE_BOARD_TOKEN = key }
  assert.equal(T.listTasks().length, 0)
  assert.equal(fs.existsSync(path.join(sb.company, 'plan')), false)
})

test('P2 AT8: backlog survives a round trip; cancelled is not exported and is counted', (t) => {
  const { sb, T, IO, cmd, tmp, byPlan } = setup(t)
  const A = { door: 'dashboard', role: 'board', name: '' }
  const a = T.createTask({ title: 'Later idea', projectId: PRJ, targetVersion: '2.1', status: 'backlog' }, A)
  const b = T.createTask({ title: 'Dropped', projectId: PRJ, targetVersion: '2.1' }, A)
  T.updateTask({ id: b.id, status: 'cancelled' }, A)
  const ex = IO.exportPlan(PRJ, { version: '2.1' })
  assert.equal(ex.summary.cancelled, 1)
  assert.equal(ex.plan.tasks.length, 1)
  assert.equal(ex.plan.tasks[0].status, 'todo'); assert.equal(ex.plan.tasks[0].arsenale_status, 'backlog')
  assert.equal(cmd('import-plan', [tmp('b.json', ex.plan), '--project', 'demo-calc', '--version', '2.1']).code, 0)
  assert.equal(byPlan(a.id, 'demo-calc').status, 'backlog')
})

test('P2 AT9: imported runs never appear in the ledger; they are kept in the worklog and exported unchanged', (t) => {
  const { sb, IO, cmd } = setup(t)
  assert.equal(cmd('import-plan', [fx('plan.json'), '--project', PRJ, '--version', '2.1']).code, 0)
  const runsDir = path.join(sb.company, '..', 'agent-runs')
  const finished = fs.existsSync(runsDir) ? fs.readdirSync(runsDir).filter((n) => n.endsWith('.json')) : []
  assert.equal(finished.length, 0)
  const wl = JSON.parse(fs.readFileSync(path.join(sb.company, 'plan', PRJ + '.worklog.json'), 'utf8'))
  assert.equal(wl.runs.length, 3)
  const orig = JSON.parse(fs.readFileSync(fx('plan.json'), 'utf8')).runs
  assert.deepEqual(IO.exportPlan(PRJ, { version: '2.1' }).plan.runs, orig)
  const L = sb.mod('ledger.cjs')
  assert.equal(typeof L.ledger, 'function')
})

test('P2: export-plan on the command line: stdout is plan-check clean, --out refuses to overwrite without --force', (t) => {
  const { sb, cmd } = setup(t)
  assert.equal(cmd('import-plan', [fx('plan.json'), '--project', PRJ, '--version', '2.1']).code, 0)
  const bin = path.join(__dirname, '..', '..', 'bin', 'arsenale.cjs')
  const env = Object.assign({}, process.env, { ARSENALE_HOME: path.join(sb.company, '..') })
  const run = (...a) => spawnSync(process.execPath, [bin, ...a], { encoding: 'utf8', env })
  const o = run('export-plan', '--project', PRJ, '--version', '2.1')
  assert.equal(o.status, 0, o.stderr)
  const f = path.join(sb.company, '..', 'out.json')
  fs.writeFileSync(f, o.stdout)
  const c = run('plan-check', f)
  assert.equal(c.status, 0, c.stdout)
  assert.equal(run('export-plan', '--project', PRJ, '--version', '2.1', '--out', f).status, 1)
  assert.equal(run('export-plan', '--project', PRJ, '--version', '2.1', '--out', f, '--force').status, 0)
})
