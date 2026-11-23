/* Migration tooling (spec 1.4 P7): shadow, parity, promote, restore. Invented data only. */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const net = require('net')
const http = require('http')
const { makeSandbox, SEED } = require('./helpers.cjs')

const FX = path.join(__dirname, 'fixtures', 'plan-v1', 'hq-like-export.json')
const PRJ = 'tide-app'
const board = { door: 'cli', role: 'board', name: '' }

function setup(t) {
  const sb = makeSandbox()
  t.after(() => sb.cleanup())
  sb.mod('agent-company.cjs').companyInit(SEED, ['implementer', 'tester'])
  process.env.ARSENALE_BOARD_TOKEN = sb.boardKey
  const IO = sb.mod('plan-io.cjs')
  const M = sb.mod('plan-migrate.cjs')
  const cap = (fn, args, cmd) => { const out = []; const code = fn(args, (l) => out.push(l), cmd); return { code, out: out.join('\n') } }
  return { sb, IO, M, parity: (args) => cap(M.run, args, 'plan-parity'), file: (name, obj) => { const f = path.join(sb.base, name); fs.writeFileSync(f, JSON.stringify(obj)); return f } }
}
/** Hash of every file under the data folder, except the given subfolders. */
function hashes(root, skip) {
  const out = {}
  const rec = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) rec(f); else if (e.isFile()) { const rel = path.relative(root, f); if (!(skip || []).some((s) => rel.startsWith(s))) out[rel] = crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') } } }
  rec(root)
  return out
}
const hq = () => JSON.parse(fs.readFileSync(FX, 'utf8'))
const MODE = ['--project', PRJ, '--phases-as', 'versions']

test('P7 AT1: --shadow writes only under shadow/<project>/', (t) => {
  const { sb, IO } = setup(t)
  const before = hashes(sb.root, ['shadow'])
  const r = IO.importPlan(FX, { project: PRJ, phasesAs: 'versions', shadow: true }, board)
  assert.ok(r.shadow.startsWith('shadow'))
  assert.deepEqual(hashes(sb.root, ['shadow']), before)
  const sh = path.join(sb.root, 'shadow', PRJ)
  assert.ok(fs.existsSync(path.join(sh, 'company', 'plan', PRJ + '.json')))
  assert.ok(fs.existsSync(path.join(sh, 'company', 'plan', PRJ + '.worklog.json')))
  assert.ok(fs.existsSync(path.join(sh, 'company', 'plan', '.import-base', PRJ + '.json')))
  assert.ok(fs.readdirSync(path.join(sh, 'company', 'issues')).length >= 5)
  assert.throws(() => IO.importPlan(FX, { project: PRJ, phasesAs: 'versions', shadow: true }, { role: 'agent' }), /owner/)
})

test('P7 AT2: parity of the fixture against its own shadow is clean; a changed size is exactly one difference', (t) => {
  const { sb, IO, parity, file } = setup(t)
  IO.importPlan(FX, { project: PRJ, phasesAs: 'versions', shadow: true }, board)
  let r = parity([FX, ...MODE, '--shadow', '--write'])
  assert.equal(r.code, 0, r.out)
  assert.match(r.out, /Parity: clean/)
  assert.equal(fs.readdirSync(path.join(sb.root, 'plan-parity')).length, 1)
  const d = hq(); d.tasks[2].size = 'L'
  r = parity([file('changed.json', d), ...MODE, '--shadow'])
  assert.equal(r.code, 1)
  assert.match(r.out, /Parity: 1 difference\n/)
  assert.match(r.out, /task T-03 size/)
  const d2 = hq(); d2.tasks.pop()
  assert.match(parity([file('gone.json', d2), ...MODE, '--shadow']).out, /task T-05 missing/)
  // a shadow that does not exist is refused
  assert.equal(parity([FX, '--project', 'demo-calc', '--phases-as', 'versions', '--shadow']).code, 1)
})

test('P7 AT3: --promote backs up first; a planted parity failure undoes it byte for byte', (t) => {
  const { sb, IO } = setup(t)
  IO.importPlan(FX, { project: PRJ, phasesAs: 'versions', shadow: true }, board)
  const before = hashes(sb.root)
  assert.throws(() => IO.importPlan(FX, { project: PRJ, phasesAs: 'versions', promote: true, afterImport: () => { const T = sb.mod('tasks.cjs'); const x = T.listTasks().map((s) => T.readTask(s.id)).find((q) => q.planId === 'T-02'); T.updateTask({ id: x.id, status: 'done' }, board) } }, board), /Promote undone/)
  const after = hashes(sb.root)
  const b = fs.readdirSync(path.join(sb.root, 'backups'))
  assert.equal(b.length, 1)
  for (const k of Object.keys(after)) if (!k.startsWith('backups')) assert.equal(after[k], before[k], k)
  assert.deepEqual(Object.keys(after).filter((k) => !k.startsWith('backups')).sort(), Object.keys(before).sort())
  assert.ok(!fs.existsSync(path.join(sb.company, 'plan', PRJ + '.json')), 'live plan not left behind')
  assert.ok(fs.existsSync(path.join(sb.root, 'shadow', PRJ)), 'shadow kept after an undo')
})

test('P7 AT4: a good promote, then plan restore leaves the company folder byte-identical', (t) => {
  const { sb, IO, M } = setup(t)
  // live data that exists before the move: the project already has one planned task and a decision
  sb.mod('tasks.cjs').createTask({ title: 'Existing live task', projectId: PRJ }, board)
  IO.importPlan(FX, { project: PRJ, phasesAs: 'versions', shadow: true }, board)
  const before = hashes(sb.root)
  const r = IO.importPlan(FX, { project: PRJ, phasesAs: 'versions', promote: true }, board)
  assert.equal(r.promoted, true)
  assert.equal(r.parity.clean, true)
  assert.ok(!fs.existsSync(path.join(sb.root, 'shadow', PRJ)), 'shadow dropped')
  assert.equal(sb.mod('plan.cjs').readPlan(PRJ).master, 'arsenale')
  assert.ok(fs.existsSync(path.join(sb.company, 'plan', PRJ + '.json')))
  const man = JSON.parse(fs.readFileSync(path.join(sb.root, 'backups', r.backup, 'manifest.json'), 'utf8'))
  assert.ok(man.created.length >= 5 && man.files.every((f) => /^[0-9a-f]{64}$/.test(f.sha256)))
  const out = M.restore(r.backup, board)
  assert.ok(out.removed >= 5)
  const after = hashes(sb.root, ['backups'])
  const b4 = Object.fromEntries(Object.entries(before).filter(([k]) => !k.startsWith('backups')))
  assert.deepEqual(after, b4)
  assert.throws(() => M.restore(r.backup, { role: 'agent' }), /owner/)
})

test('P7 AT5: restore refuses a manifest path outside the data folder and changes nothing', (t) => {
  const { sb, IO, M } = setup(t)
  const r = IO.importPlan(FX, { project: PRJ, phasesAs: 'versions', promote: true }, board)
  const mf = path.join(sb.root, 'backups', r.backup, 'manifest.json')
  const man = JSON.parse(fs.readFileSync(mf, 'utf8'))
  man.created.push({ root: 'company', rel: '../../outside.txt' })
  fs.writeFileSync(mf, JSON.stringify(man))
  const victim = path.join(sb.root, '..', 'outside.txt')
  fs.writeFileSync(victim, 'keep')
  const before = hashes(sb.root)
  assert.throws(() => M.restore(r.backup, board), /outside the data folder/)
  assert.equal(fs.readFileSync(victim, 'utf8'), 'keep')
  assert.deepEqual(hashes(sb.root), before)
  man.created.pop(); man.files.push({ root: 'elsewhere', rel: 'x', sha256: 'a'.repeat(64) })
  fs.writeFileSync(mf, JSON.stringify(man))
  assert.throws(() => M.restore(r.backup, board), /unknown folder/)
  assert.throws(() => M.restore('../backups', board), /usage/)
  fs.rmSync(victim)
})

test('P7 AT6: no command opens a network socket; shadow drop removes only the shadow', (t) => {
  const { sb, IO, M, parity } = setup(t)
  const hit = []
  const orig = [net.Socket.prototype.connect, http.request, http.get]
  net.Socket.prototype.connect = function () { hit.push('connect'); throw new Error('network') }
  http.request = () => { hit.push('http'); throw new Error('network') }
  http.get = () => { hit.push('http'); throw new Error('network') }
  t.after(() => { net.Socket.prototype.connect = orig[0]; http.request = orig[1]; http.get = orig[2] })
  IO.importPlan(FX, { project: PRJ, phasesAs: 'versions', shadow: true }, board)
  parity([FX, ...MODE, '--shadow'])
  const before = hashes(sb.root, ['shadow'])
  assert.deepEqual(M.shadowDrop(PRJ, board), { dropped: path.join('shadow', PRJ) })
  assert.deepEqual(hashes(sb.root, ['shadow']), before)
  assert.ok(!fs.existsSync(path.join(sb.root, 'shadow', PRJ)))
  assert.throws(() => M.shadowDrop(PRJ, board), /no shadow/)
  assert.deepEqual(hit, [])
  assert.ok(!/require\(['"](net|http|https|dgram|tls)['"]\)/.test(fs.readFileSync(path.join(__dirname, '..', 'plan-migrate.cjs'), 'utf8')))
})

test('Review 1.4 Important 1: bad project ids never reach the file system', (t) => {
  const { sb, IO, M } = setup(t)
  // a real shadow, a sentinel outside the shadow folder and a sentinel inside the home
  IO.importPlan(FX, { project: PRJ, phasesAs: 'versions', shadow: true }, board)
  const outside = path.join(sb.base, 'outside-sentinel'); fs.mkdirSync(outside); fs.writeFileSync(path.join(outside, 'keep.txt'), 'x')
  fs.writeFileSync(path.join(outside, 'shadow.json'), '{}')
  const before = hashes(sb.root, [])
  const bad = ['..', '../x', '/tmp', '.', 'a/../..', '..\\', '..\\x', '', ' ', outside, 'a/b']
  for (const id of bad) {
    assert.throws(() => M.shadowDrop(id, board), /bad project id|owner/, 'drop ' + JSON.stringify(id))
    assert.throws(() => M.shadowImport(FX, { project: id, phasesAs: 'versions' }, board), /bad project id|no such project/, 'import ' + JSON.stringify(id))
    assert.throws(() => IO.importPlan(FX, { project: id, phasesAs: 'versions' }, board), /bad project id|no such project|project/, 'live import ' + JSON.stringify(id))
    assert.throws(() => IO.exportPlan(id, { phasesAs: 'versions' }), /bad project id/, 'export ' + JSON.stringify(id))
    assert.throws(() => sb.mod('plan.cjs').fileOf(id), /bad project id/)
  }
  assert.deepEqual(hashes(sb.root, []), before)
  assert.ok(fs.existsSync(path.join(sb.root, 'company')))
  assert.ok(fs.existsSync(path.join(outside, 'keep.txt')))
  // the CLI path too
  const out = []
  assert.equal(M.run(['drop', '--project', '..'], (l) => out.push(l), 'shadow'), 1)
  assert.match(out.join('\n'), /bad project id/)
  assert.ok(fs.existsSync(path.join(sb.root, 'company')))
  // a folder without shadow.json is not dropped
  const odd = path.join(sb.root, 'shadow', 'plain'); fs.mkdirSync(odd, { recursive: true }); fs.writeFileSync(path.join(odd, 'a'), '1')
  assert.throws(() => M.shadowDrop('plain', board), /not a shadow copy/)
  assert.ok(fs.existsSync(path.join(odd, 'a')))
  // the real one still drops
  assert.deepEqual(M.shadowDrop(PRJ, board), { dropped: path.join('shadow', PRJ) })
})

test('Review 1.4 Important 1: release notes and the context pack refuse path-like ids', (t) => {
  const { sb } = setup(t)
  const RN = sb.mod('release-notes.cjs'), CP = sb.mod('context-pack.cjs')
  for (const id of ['..', '.', '../x', 'a/b', '..\\x']) {
    assert.throws(() => RN.draft(id, '1.0'), /project/)
    assert.throws(() => RN.fileOf(id, '1.0'))
    assert.throws(() => RN.fileOf(PRJ, id))
  }
  assert.ok(RN.fileOf(PRJ, '2.1+hotfix').endsWith('2.1+hotfix.md'))
  assert.throws(() => CP.write('..'), /no such project|bad project/)
})
