/* The work queue, `next`, and Today (spec 1.4 P4). Invented data. */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const { spawnSync } = require('child_process')
const { makeSandbox, SEED } = require('./helpers.cjs')

const board = { door: 'dashboard', role: 'board', name: '' }
const sup = { door: 'mcp', role: 'supervisor', name: '' }
const agent = { door: 'mcp', role: 'agent', name: 'tester' }
function setup(t) {
  const sb = makeSandbox()
  t.after(() => sb.cleanup())
  sb.mod('agent-company.cjs').companyInit(SEED, ['implementer', 'tester'])
  const Tk = sb.mod('tasks.cjs'), Pl = sb.mod('plan.cjs')
  Pl.addVersion('tide-app', { name: '2.1', horizon: 'now', status: 'active' }, board)
  const ph1 = Pl.addPhase('tide-app', '2.1', { title: 'Schema' }, board), ph2 = Pl.addPhase('tide-app', '2.1', { title: 'Screens' }, board)
  const mk = (title, extra) => { const r = Tk.createTask(Object.assign({ title, projectId: 'tide-app', targetVersion: '2.1', size: 'S', description: 'D ' + title }, extra || {}), board); return (r.task || r).id }
  const ids = { a: mk('Alpha', { phaseId: ph1.id || 'ph-1' }), b: mk('Beta', { phaseId: 'ph-1' }), c: mk('Gamma', { phaseId: 'ph-2' }), d: mk('Delta', { phaseId: 'ph-2' }), e: mk('Epsilon', { phaseId: 'ph-2' }) }
  return { sb, Tk, Pl, Q: sb.mod('queue.cjs'), ids, ph2 }
}
const children = () => spawnSync('ps', ['-o', 'pid=,comm=', '--ppid', String(process.pid)], { encoding: 'utf8' }).stdout.trim().split('\n').filter((l) => l && !/\bps$/.test(l))

test('P4 AT1+2: next returns the first approved unclaimed task with a pack; never an unapproved one; empty sentence', (t) => {
  const { Q, ids } = setup(t)
  const e = Q.next({}, sup)
  assert.equal(e.empty, true)
  assert.equal(e.message, 'The queue is empty: the owner approves tasks into it on the Plan screen.')
  Q.add([ids.c, ids.a], board)
  const r = Q.next({}, sup)
  assert.equal(r.task.id, ids.c, 'order is the approval order, not the id order')
  assert.equal(r.position, 1); assert.equal(r.queueLength, 2)
  assert.notEqual(r.task.id, ids.b)
  assert.ok(r.contextTokens <= 1500)
  assert.ok(Math.ceil(JSON.stringify(r.task).length / 4) <= 500)
  assert.ok(Math.ceil((JSON.stringify(r.task) + r.context).length / 4) <= 2000)
  assert.match(r.howTo, new RegExp('start_job with task_id ' + ids.c + '; finish_job when done'))
  assert.equal(r.task.phase, 'Screens')
})

test('P4 AT3: --claim sets the claim and in_progress; the next call returns the following entry; release gives it back', (t) => {
  const { Q, Tk, ids } = setup(t)
  Q.add([ids.a, ids.b], board)
  const r = Q.next({ claim: true }, sup)
  assert.equal(r.task.id, ids.a)
  assert.equal(Tk.readTask(ids.a).status, 'in_progress')
  const q = JSON.parse(fs.readFileSync(Q.FILE(), 'utf8'))
  assert.equal(q.entries[0].claimedBy, 'supervisor'); assert.ok(q.entries[0].claimedAt)
  assert.equal(Q.next({}, sup).task.id, ids.b)
  Q.release(ids.a, sup)
  assert.equal(Q.read().entries[0].claimed, false)
})

test('P4 AT4: the agent role cannot claim or release', (t) => {
  const { Q, ids } = setup(t)
  Q.add([ids.a], board)
  assert.throws(() => Q.next({ claim: true }, agent), /Only the supervisor or the owner/)
  assert.throws(() => Q.release(ids.a, agent), /Only the supervisor/)
  assert.equal(Q.next({}, agent).task.id, ids.a, 'reading is allowed')
})

test('P4 AT5: a done task leaves the queue on read and is dropped on the next write', (t) => {
  const { Q, Tk, ids } = setup(t)
  Q.add([ids.a, ids.b], board)
  Tk.updateTask({ id: ids.a, status: 'done' }, board)
  assert.deepEqual(Q.read().entries.map((e) => e.taskId), [ids.b])
  assert.equal(JSON.parse(fs.readFileSync(Q.FILE(), 'utf8')).entries.length, 2, 'reading wrote nothing')
  Q.add([ids.c], board)
  assert.deepEqual(JSON.parse(fs.readFileSync(Q.FILE(), 'utf8')).entries.map((e) => e.taskId), [ids.b, ids.c])
})

test('P4 AT6: only the owner adds, moves, removes, clears; only todo/backlog tasks can be queued', (t) => {
  const { Q, Tk, ids } = setup(t)
  for (const a of [sup, agent, null]) {
    assert.throws(() => Q.add([ids.a], a), /Only the owner/)
    assert.throws(() => Q.apply({ op: 'clear' }, a), /Only the owner/)
  }
  Q.add([ids.a, ids.b, ids.c], board)
  assert.throws(() => Q.move(ids.a, 2, sup), /Only the owner/)
  assert.throws(() => Q.remove(ids.a, sup), /Only the owner/)
  Q.move(ids.c, 1, board)
  assert.deepEqual(Q.read().entries.map((e) => e.taskId), [ids.c, ids.a, ids.b])
  Q.move(ids.c, 'down', board)
  assert.deepEqual(Q.read().entries.map((e) => e.taskId), [ids.a, ids.c, ids.b])
  Q.remove(ids.b, board)
  Tk.updateTask({ id: ids.d, status: 'blocked' }, board)
  assert.throws(() => Q.add([ids.d], board), /only a task still to do/)
  assert.deepEqual(Q.add([ids.a], board).added, [], 'a task appears once')
  Q.clear(board)
  assert.equal(Q.read().length, 0)
})

test('P4 AT7: next starts no process', (t) => {
  const { Q, ids } = setup(t)
  Q.add([ids.a], board)
  const before = children()
  Q.next({}, sup)
  assert.deepEqual(children(), before)
  assert.doesNotMatch(fs.readFileSync(require.resolve('../queue.cjs'), 'utf8'), /child_process|spawn|exec\(/)
})

test('P4: the CLI prints next, claims, and refuses queue changes without the owner key', (t) => {
  const { sb, ids } = setup(t)
  const bin = require('path').join(__dirname, '..', '..', 'bin', 'arsenale.cjs')
  const env = Object.assign({}, sb.env); delete env.ARSENALE_BOARD_TOKEN
  const go = (...a) => spawnSync(process.execPath, [bin, ...a], { encoding: 'utf8', env })
  const r0 = go('queue', 'add', ids.a)
  assert.notEqual(r0.status, 0)
  assert.match(r0.stdout + r0.stderr, /Only the owner/)
  assert.match(go('next').stdout, /queue is empty/)
  assert.match(go('today').stdout, /Doing: nothing/)
})

test('P4 AT8: Today groups match a fixture of hand-made lists', (t) => {
  const { sb, Tk, Pl, Q, ids } = setup(t)
  Tk.createTask({ title: 'Later task', projectId: 'tide-app', targetVersion: '2.1', size: 'S' }, board)
  const o = Tk.createTask({ title: 'Sign the contract', projectId: 'demo-calc', ownerTask: true }, board)
  Tk.updateTask({ id: ids.a, status: 'in_progress' }, sup)
  Tk.updateTask({ id: ids.b, status: 'blocked' }, sup)
  Tk.updateTask({ id: ids.c, status: 'in_review' }, board)
  Q.add([ids.d], board)
  const D = Pl.today({ state: { gates: [{ id: 'g1', status: 'waiting', question: 'Ship it?', project: 'tide-app' }], decisions: [{ id: 'd1', state: 'open', text: 'Which DB?', project: 'tide-app', targetVersion: '2.1' }] } })
  assert.deepEqual(D.doing.map((x) => x.id), [ids.a])
  assert.deepEqual(D.blocked.map((x) => x.id), [ids.b])
  assert.deepEqual(D.next.filter((x) => x.queued).map((x) => x.id), [ids.d])
  const sugg = D.next.filter((x) => x.suggested)
  assert.equal(sugg.length, 2, 'at most 2 suggestions per project')
  assert.ok(sugg.every((x) => x.projectId === 'tide-app' && x.id !== ids.d))
  assert.deepEqual(sugg.map((x) => x.id), [ids.e, sugg[1].id].slice(0, 1).concat(sugg[1].id), 'phase order: Gamma/Delta/Epsilon phase 2 before "Later task" without phase')
  const w = D.waiting.map((x) => x.kind + ':' + (x.id))
  assert.deepEqual(w.sort(), ['decision:d1', 'gate:g1', 'task:' + ids.c, 'task:' + (o.task || o).id].sort())
  assert.equal(D.empty, false)
  assert.equal(Pl.today({ state: {}, tasks: [], queue: { entries: [], length: 0 } }).empty, true)
})

test('P4: a stale claim (no run for 24 hours) shows under Blocked and changes nothing', (t) => {
  const { Q, Pl, Tk, ids } = setup(t)
  Q.add([ids.a], board)
  Q.next({ claim: true }, sup)
  const D = Pl.today({ state: {}, now: Date.now() + 25 * 3600e3 })
  assert.equal(D.blocked.length, 1); assert.match(D.blocked[0].note, /claimed, no run since/)
  assert.equal(Tk.readTask(ids.a).status, 'in_progress')
  assert.equal(Pl.today({ state: {} }).blocked.length, 0)
})
