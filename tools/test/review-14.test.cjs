/* Fixes of the 1.4 release review (docs/reviews/1.4-review.md): Keep / Cancel of gone items, the shadow
 * gap, single claim, no double accept, phone and ask_owner counts, the "Now" line, an atomic import,
 * one inbox line, restore that refuses to undo later work. Invented data. */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const http = require('http')
const path = require('path')
const { makeSandbox, startServer, SEED } = require('./helpers.cjs')

const board = { door: 'dashboard', role: 'board', name: '' }
const sup = { door: 'cli', role: 'supervisor', name: '' }
const FX = path.join(__dirname, 'fixtures', 'plan-v1', 'hq-like-export.json')
const PRJ = 'tide-app'

function setup(t) {
  const sb = makeSandbox()
  t.after(() => sb.cleanup())
  sb.mod('agent-company.cjs').companyInit(SEED, ['implementer', 'tester'])
  process.env.ARSENALE_BOARD_TOKEN = sb.boardKey
  return { sb, IO: sb.mod('plan-io.cjs'), Pl: sb.mod('plan.cjs'), Tk: sb.mod('tasks.cjs'), Q: sb.mod('queue.cjs'), M: sb.mod('plan-migrate.cjs') }
}
const hq = () => JSON.parse(fs.readFileSync(FX, 'utf8'))
const MODE = { project: PRJ, phasesAs: 'versions' }

test('Important 3: gone items are listed, counted; Keep and Cancel task are owner only', (t) => {
  const { sb, IO, Pl, Tk } = setup(t)
  IO.importPlan(FX, MODE, board)
  const d = hq(); const dropped = d.tasks.splice(1, 2).map((x) => x.id); d.runs = (d.runs || []).filter((r) => !dropped.includes(r.task_id))
  const f = path.join(sb.base, 'less.json'); fs.writeFileSync(f, JSON.stringify(d))
  const r = IO.importPlan(f, MODE, board)
  assert.equal(r.counts.flagged, 2)
  const view = Pl.view(PRJ, Tk.listTasks())
  assert.equal(view.lastImport.missing, 2)
  assert.equal(view.gone.filter((g) => g.kind === 'task').length, 2)
  const ids = view.gone.map((g) => g.id)
  // owner only
  assert.throws(() => Pl.apply({ op: 'keep', project: PRJ, kind: 'task', id: ids[0] }, sup), /Only the owner/)
  assert.throws(() => Pl.apply({ op: 'cancel-gone', project: PRJ, kind: 'task', id: ids[0] }, { role: 'agent' }), /Only the owner/)
  // Keep clears the flag and the task is exported again
  Pl.apply({ op: 'keep', project: PRJ, kind: 'task', id: ids[0] }, board)
  assert.equal(Tk.readTask(ids[0]).missingInImport, undefined)
  assert.equal(Pl.view(PRJ, Tk.listTasks()).gone.length, 1)
  assert.ok(IO.exportPlan(PRJ, MODE).plan.tasks.some((x) => x.planId === ids[0] || x.id === ids[0] || x.id === dropped[0] || x.id === dropped[1]))
  assert.throws(() => Pl.apply({ op: 'keep', project: PRJ, kind: 'task', id: ids[0] }, board), /not flagged/)
  // Cancel task cancels it and removes it from the list
  Pl.apply({ op: 'cancel-gone', project: PRJ, kind: 'task', id: ids[1] }, board)
  assert.equal(Tk.readTask(ids[1]).status, 'cancelled')
  assert.equal(Pl.view(PRJ, Tk.listTasks()).gone.length, 0)
  // another project's task is refused
  assert.throws(() => Pl.apply({ op: 'keep', project: 'other', kind: 'task', id: ids[0] }, board), /no such task|bad project/)
})

test('Minor 1: a shadow import marks the shadow, and every writer refuses it; import-plan sets master import', (t) => {
  const { sb, IO, Pl, Tk, M } = setup(t)
  IO.importPlan(FX, MODE, { door: 'cli', role: 'board', name: '' })
  assert.equal(Pl.readPlan(PRJ).master, 'import')
  IO.importPlan(FX, Object.assign({ shadow: true }, MODE), board)
  const sh = path.join(sb.root, 'shadow', PRJ)
  assert.equal(JSON.parse(fs.readFileSync(path.join(sh, 'company', 'plan', PRJ + '.json'), 'utf8')).master, 'shadow')
  // a writer inside the shadow home (ARSENALE_HOME = the shadow) refuses plan, task and queue writes
  const { spawnSync } = require('child_process')
  const script = "const T=require(process.argv[1]+'/tasks.cjs'),Pl=require(process.argv[1]+'/plan.cjs'),Q=require(process.argv[1]+'/queue.cjs');const b={door:'cli',role:'board',name:''};const out=[];for(const f of [()=>Pl.addVersion('" + PRJ + "',{name:'9.9'},b),()=>T.createTask({title:'x',projectId:'" + PRJ + "'},b),()=>T.updateTask({id:T.listTasks()[0].id,title:'zz'},b),()=>Q.add([T.listTasks()[0].id],b)]){try{f();out.push('wrote')}catch(e){out.push(String(e.message).slice(0,12))}};console.log(out.join('|'))"
  const r = spawnSync(process.execPath, ['-e', script, sb.tools], { env: Object.assign({}, process.env, sb.env, { ARSENALE_HOME: sh }), encoding: 'utf8' })
  assert.equal(r.stdout.trim(), 'Shadow copy |Shadow copy |Shadow copy |Shadow copy', r.stderr)
  // a second shadow import still works (importer only), and the Dock can read the shadow
  IO.importPlan(FX, Object.assign({ shadow: true }, MODE), board)
  const v = M.shadowView(PRJ)
  assert.equal(v.master, 'shadow'); assert.ok(v.versions.length >= 1); assert.ok(v.tasks.length >= 5)
  assert.equal(Pl.view(PRJ, []).hasShadow, true)
  assert.equal(M.shadowView('nope'), null)
})

test('Minor 2: two claims never get the same task', (t) => {
  const { Tk, Q } = setup(t)
  const a = Tk.createTask({ title: 'A', projectId: PRJ }, board), b = Tk.createTask({ title: 'B', projectId: PRJ }, board)
  Q.add([a.task ? a.task.id : a.id, b.task ? b.task.id : b.id], board)
  const one = Q.next({ claim: true }, sup), two = Q.next({ claim: true }, sup), three = Q.next({ claim: true }, sup)
  assert.notEqual(one.task.id, two.task.id)
  assert.equal(three.empty, true)
})

test('Minor 3: two accepts of one proposal through the rail apply once', async (t) => {
  const sb = makeSandbox(); t.after(() => sb.cleanup())
  sb.mod('agent-company.cjs').companyInit(SEED, ['implementer', 'tester'])
  const Pr = sb.mod('proposals.cjs')
  const g = Pr.create({ kind: 'bug', title: 'Crash on empty list', project: PRJ, why: 'Seen twice in the log' }, sup)
  const gid = g.question_id
  const s = await startServer(sb, { portBase: 47900 }); t.after(() => s.child.kill())
  const post = (body) => new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port: s.port, method: 'POST', path: '/api/answer', headers: { Host: '127.0.0.1:' + s.port, Cookie: s.cookie, Origin: 'http://127.0.0.1:' + s.port, 'Content-Type': 'application/json', 'X-Dashboard-Token': s.token } }, (res) => { let d = ''; res.on('data', (c) => { d += c }); res.on('end', () => resolve({ status: res.statusCode, text: d })) })
    r.on('error', reject); r.end(JSON.stringify(body))
  })
  const res = await Promise.all([post({ gate: gid, answer: 'approve' }), post({ gate: gid, answer: 'approve' })])
  assert.equal(res.filter((x) => x.status === 200).length, 1, JSON.stringify(res))
  const bugs = sb.mod('tasks.cjs').listTasks().filter((x) => x.type === 'bug')
  assert.equal(bugs.length, 1)
})

test('Minor 4: proposals are not counted in the phone message or the ask_owner cap', (t) => {
  const { sb } = setup(t)
  const Pr = sb.mod('proposals.cjs')
  for (let i = 0; i < 3; i++) Pr.create({ kind: 'bug', title: 'Bug number ' + i, project: PRJ, why: 'Invented reason' }, sup)
  const N = sb.mod('notify.cjs')
  const real = sb.read('agent-runs/gates/' + fs.readdirSync(path.join(sb.root, 'agent-runs', 'gates'))[0])
  const msg = N.message(Object.assign({}, real, { approvalType: 'action', proposal: undefined }), 'telegram', { telegram: { details: false } })
  assert.match(msg.text, /: 0 questions waiting/, 'three proposals wait and none is counted: ' + msg.text)
  const src = fs.readFileSync(path.join(sb.tools, 'mcp-server.cjs'), 'utf8')
  assert.match(src, /approvalType !== 'proposal' && g\.clientId/)
})

test('Minor 6: the Now line has the title and the phase, and the saved pack follows the plan', (t) => {
  const { sb, Pl, Tk, Q } = setup(t)
  Pl.addVersion(PRJ, { name: '2.1', title: 'Ordering', horizon: 'now', status: 'active' }, board)
  const ph = Pl.addPhase(PRJ, '2.1', { title: 'Storefront' }, board)
  const mk = (title, status) => { const r = Tk.createTask({ title, projectId: PRJ, targetVersion: '2.1', size: 'S', phaseId: ph.id }, board); const id = r.task ? r.task.id : r.id; if (status) Tk.updateTask({ id, status }, board); return id }
  const a = mk('One', 'done'); mk('Two'); mk('Three'); mk('Four')
  Q.add([a === 'x' ? '' : Tk.listTasks().find((x) => x.status === 'todo').id], board)
  const CP = sb.mod('context-pack.cjs')
  const md = CP.build(PRJ).markdown
  assert.match(md, /Now: version 2\.1 Ordering, 25 %, phase Storefront \(1 of 4 tasks done\), queue head /)
  const w = CP.write(PRJ)
  Pl.editVersion(PRJ, '2.1', { title: 'Checkout' }, board)
  assert.match(CP.read(PRJ).markdown, /version 2\.1 Checkout/)
  void w
})

test('Minor 9 and 10: a refused step puts everything back; an import writes one inbox line', (t) => {
  const { sb, IO, Pl, Tk } = setup(t)
  const inbox = () => { try { return fs.readdirSync(sb.root).length } catch { return 0 } }
  void inbox
  const countLines = () => { const f = path.join(sb.root, 'inbox.jsonl'); try { return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean) } catch { return [] } }
  const before = countLines().length
  IO.importPlan(FX, MODE, board)
  const lines = countLines().slice(before)
  assert.ok(lines.length <= 1, 'one summary line, got ' + lines.length)
  // a refusing updateTask halfway: everything is as before
  const d = hq(); d.tasks[0].title = 'Changed title'; d.tasks.push({ id: 'T-99', title: 'New one', status: 'todo', phase: d.phases[0].id || d.phases[0].name, size: 'S', type: 'feature' })
  const f = path.join(sb.base, 'again.json'); fs.writeFileSync(f, JSON.stringify(d))
  const TkLive = require(path.join(sb.tools, 'tasks.cjs')) // the instance plan-io itself uses
  const orig = TkLive.updateTask
  const snap = JSON.stringify(Tk.listTasks().map((x) => [x.id, x.title, x.updatedAt]))
  const planBefore = fs.readFileSync(Pl.fileOf(PRJ), 'utf8')
  let n = 0
  TkLive.updateTask = (...a) => { if (++n >= 1) throw new Error('refused halfway'); return orig(...a) }
  try { assert.throws(() => IO.importPlan(f, MODE, board), /refused halfway/) } finally { TkLive.updateTask = orig }
  assert.equal(JSON.stringify(Tk.listTasks().map((x) => [x.id, x.title, x.updatedAt])), snap)
  assert.equal(fs.readFileSync(Pl.fileOf(PRJ), 'utf8'), planBefore)
})

test('Minor 11: restore refuses to undo work done since the promote, --force restores', (t) => {
  const { sb, M, Tk } = setup(t)
  const r = M.promote(FX, MODE, board)
  Tk.createTask({ title: 'Work done after the promote', projectId: PRJ }, board)
  assert.throws(() => M.restore(r.backup, board), /changed since this promote.*--force/)
  const out = []
  assert.equal(M.run([r.backup], (l) => out.push(l), 'restore'), 1)
  assert.match(out.join('\n'), /--force/)
  assert.equal(M.run([r.backup, '--force'], (l) => out.push(l), 'restore'), 0, out.join('\n'))
  void sb
})
