/* The plan model (spec 1.4 P1): progress, versions and phases, unlisted
 * versions, next patch, owner-only writes. Invented data. */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { makeSandbox, SEED } = require('./helpers.cjs')

const board = { door: 'dashboard', role: 'board', name: '' }
const sup = { door: 'cli', role: 'supervisor', name: '' }
function setup(t) {
  const sb = makeSandbox()
  t.after(() => sb.cleanup())
  sb.mod('agent-company.cjs').companyInit(SEED, ['implementer', 'tester'])
  return sb
}
const row = (status, size) => ({ status, size })

test('P1 AT1: weights 1/3/8, cancelled excluded, unsized counts 1 with the note', (t) => {
  const { progress } = setup(t).mod('plan.cjs')
  const p = progress([row('done', 'S'), row('todo', 'M'), row('done', 'L'), row('cancelled', 'L'), row('todo', undefined)])
  assert.equal(p.totalWeight, 1 + 3 + 8 + 1)
  assert.equal(p.doneWeight, 9)
  assert.equal(p.percent, Math.round((9 / 13) * 100))
  assert.equal(p.tasks, 4)
  assert.equal(p.unsized, 1)
  assert.match(p.note, /1 task has no size \(counted as 1\)/)
  assert.equal(progress([row('done', 'M')]).label, '100 %, ready to release')
})

test('P1 AT2: a version with no tasks reads "No plan", not 0', (t) => {
  const sb = setup(t)
  const Pl = sb.mod('plan.cjs')
  assert.equal(Pl.progress([]).label, 'No plan')
  assert.equal(Pl.progress([]).percent, null)
  assert.equal(Pl.progress([row('cancelled', 'S')]).label, 'No plan')
  Pl.addVersion('tide-app', { name: '2.1' }, board)
  assert.equal(Pl.view('tide-app', []).versions[0].progress.label, 'No plan')
})

test('P1 AT3: targetVersion with no plan file shows an unlisted version, and nothing is written', (t) => {
  const sb = setup(t)
  const T = sb.mod('tasks.cjs'), Pl = sb.mod('plan.cjs')
  T.createTask({ title: 'Old work', projectId: 'tide-app', targetVersion: '2.1.1', size: 'M' }, board)
  assert.equal(fs.existsSync(path.join(sb.company, 'plan')), false)
  const v = Pl.view('tide-app', T.listTasks())
  assert.equal(v.versions.length, 0)
  assert.equal(v.unlisted.length, 1)
  assert.equal(v.unlisted[0].name, '2.1.1')
  assert.equal(v.unlisted[0].unlisted, true)
  assert.equal(v.unlisted[0].horizon, 'later')
  assert.equal(fs.existsSync(path.join(sb.company, 'plan')), false, 'reading wrote nothing')
})

test('P1 AT4: next patch of 2.1 is 2.1.1 and of 2.1.1 is 2.1.2', (t) => {
  const { nextPatch, cmpName } = setup(t).mod('plan.cjs')
  assert.equal(nextPatch('2.1'), '2.1.1')
  assert.equal(nextPatch('2.1.1'), '2.1.2')
  assert.equal(nextPatch('2.1', ['2.1.1']), '2.1.2')
  assert.ok(cmpName('2.10', '2.9') > 0, 'numeric parts compare as numbers')
})

test('P1 AT5: the supervisor is refused (403) on phaseId and targetVersion, and nothing is written', (t) => {
  const sb = setup(t)
  const T = sb.mod('tasks.cjs'), Pl = sb.mod('plan.cjs')
  Pl.addVersion('tide-app', { name: '2.1' }, board)
  const ph = Pl.addPhase('tide-app', '2.1', { title: 'Storefront' }, board)
  const made = T.createTask({ title: 'Form', projectId: 'tide-app', targetVersion: '2.1', phaseId: ph.id }, board)
  const before = fs.readFileSync(path.join(sb.company, 'issues', made.id + '.json'), 'utf8')
  for (const patch of [{ phaseId: ph.id }, { targetVersion: '2.2' }, { ownerTask: true }]) {
    assert.throws(() => T.updateTask(Object.assign({ id: made.id }, patch), sup), (e) => e.code === 403)
  }
  assert.throws(() => T.createTask({ title: 'x', phaseId: 'ph-1' }, sup), (e) => e.code === 403)
  assert.throws(() => T.createTask({ title: 'x', targetVersion: '2.1' }, sup), (e) => e.code === 403)
  assert.equal(fs.readFileSync(path.join(sb.company, 'issues', made.id + '.json'), 'utf8'), before)
  assert.throws(() => Pl.addVersion('tide-app', { name: '3.0' }, sup), (e) => e.code === 403)
  assert.equal(Pl.readPlan('tide-app').versions.length, 1)
})

test('P1: phaseId belongs to its version, is cleared when the version changes, derived status', (t) => {
  const sb = setup(t)
  const T = sb.mod('tasks.cjs'), Pl = sb.mod('plan.cjs')
  Pl.addVersion('tide-app', { name: '2.1', horizon: 'now' }, board)
  const a = Pl.addPhase('tide-app', '2.1', { title: 'A' }, board)
  const b = Pl.addPhase('tide-app', '2.1', { title: 'B' }, board)
  assert.throws(() => T.createTask({ title: 'x', phaseId: a.id }, board), (e) => e.code === 400)
  assert.throws(() => T.createTask({ title: 'x', targetVersion: '2.1', phaseId: 'ph-99' }, board), (e) => e.code === 400)
  const t1 = T.createTask({ title: 'one', projectId: 'tide-app', targetVersion: '2.1', phaseId: a.id, size: 'S', ownerTask: true }, board)
  const t2 = T.createTask({ title: 'two', projectId: 'tide-app', targetVersion: '2.1', phaseId: a.id, size: 'S' }, board)
  assert.equal(t1.ownerTask, true)
  let v = Pl.view('tide-app', T.listTasks()).versions[0]
  assert.equal(v.phases.find((p) => p.id === a.id).status, 'todo')
  assert.equal(v.phases.find((p) => p.id === b.id).status, 'todo', 'a phase with no tasks keeps its stored status')
  T.updateTask({ id: t1.id, status: 'done' }, board)
  v = Pl.view('tide-app', T.listTasks()).versions[0]
  assert.equal(v.phases.find((p) => p.id === a.id).status, 'doing')
  assert.equal(v.phases.find((p) => p.id === a.id).progress.percent, 50)
  T.updateTask({ id: t2.id, status: 'done' }, board)
  assert.equal(Pl.view('tide-app', T.listTasks()).versions[0].phases[0].status, 'done')
  const moved = T.updateTask({ id: t1.id, targetVersion: '2.2' }, board).task
  assert.equal(moved.phaseId, undefined)
})

test('P1: versions CRUD rules: unique name, one active, released stamps the date, drop keeps tasks', (t) => {
  const sb = setup(t)
  const Pl = sb.mod('plan.cjs')
  Pl.addVersion('tide-app', { name: '2.1', status: 'active', horizon: 'now' }, board)
  assert.throws(() => Pl.addVersion('tide-app', { name: '2.1' }, board), (e) => e.code === 409)
  assert.throws(() => Pl.addVersion('tide-app', { name: 'bad name' }, board), (e) => e.code === 400)
  assert.throws(() => Pl.addVersion('tide-app', { name: '2.2', status: 'active' }, board), (e) => e.code === 409)
  Pl.addVersion('tide-app', { name: '2.2' }, board)
  Pl.moveVersion('tide-app', '2.2', 'next', undefined, board)
  assert.equal(Pl.readPlan('tide-app').versions.find((v) => v.name === '2.2').horizon, 'next')
  const rel = Pl.editVersion('tide-app', '2.1', { status: 'released' }, board)
  assert.ok(rel.releasedAt)
  Pl.dropVersion('tide-app', '2.2', board)
  assert.equal(Pl.readPlan('tide-app').versions.find((v) => v.name === '2.2').status, 'dropped')
  assert.equal(Pl.readPlan('tide-app').schemaVersion, 1)
  // the CLI text and the JSON agree with the view
  const r = spawnSync(process.execPath, [path.join(sb.tools, '..', 'tools', 'plan.cjs')].slice(0, 0).concat([path.join(__dirname, '..', '..', 'bin', 'arsenale.cjs'), 'plan', '--project', 'tide-app', '--json']), { env: sb.env, encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(JSON.parse(r.stdout).versions.length, 2)
})

test('P1 AT7: reading the plan leaves every mtime unchanged', (t) => {
  const sb = setup(t)
  const T = sb.mod('tasks.cjs'), Pl = sb.mod('plan.cjs')
  Pl.addVersion('tide-app', { name: '2.1' }, board)
  T.createTask({ title: 'a', projectId: 'tide-app', targetVersion: '2.1', size: 'M' }, board)
  T.createTask({ title: 'b', projectId: 'tide-app', targetVersion: '9.9' }, board)
  const snap = () => {
    const out = {}
    const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else out[f] = fs.statSync(f).mtimeMs } }
    walk(sb.company)
    return out
  }
  const before = snap()
  Pl.view('tide-app', T.listTasks()); Pl.readPlan('tide-app'); Pl.readPlan('no-file')
  spawnSync(process.execPath, [path.join(__dirname, '..', '..', 'bin', 'arsenale.cjs'), 'plan', '--project', 'tide-app'], { env: sb.env })
  assert.deepEqual(snap(), before)
})

test('P3: a plan whose master is "shadow" refuses every plan write (409), and the release-notes draft reads', (t) => {
  const sb = setup(t)
  const Pl = sb.mod('plan.cjs')
  Pl.addVersion('tide-app', { name: '2.1' }, board)
  const f = Pl.fileOf('tide-app'); const j = JSON.parse(fs.readFileSync(f, 'utf8')); j.master = 'shadow'; fs.writeFileSync(f, JSON.stringify(j))
  for (const fn of [() => Pl.addVersion('tide-app', { name: '2.2' }, board), () => Pl.editVersion('tide-app', '2.1', { title: 'x' }, board), () => Pl.dropVersion('tide-app', '2.1', board)]) {
    assert.throws(fn, (e) => e.code === 409 && /HQ is the master/.test(e.message))
  }
  assert.equal(Pl.view('tide-app', []).master, 'shadow')
  assert.match(sb.mod('release-notes.cjs').draft('tide-app', '2.1').markdown, /# 2\.1/)
})
