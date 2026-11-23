/* Plan schema v1 task fields (spec 1.3, S3): who may set them, what is
 * refused, what history records, and that a 1.2 task reads with all six absent.
 * Invented data. */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const { makeSandbox, SEED } = require('./helpers.cjs')

const board = { door: 'dashboard', role: 'board', name: '' }
const sup = { door: 'cli', role: 'supervisor', name: '' }
const agent = { door: 'mcp', role: 'agent', name: 'tester' }
const SIX = { type: 'feature', size: 'M', tier: 'standard', targetVersion: '1.3.1', tokenEstimate: 12000, acceptance: 'Opens a 1.2 folder unchanged.' }

function setup(t) {
  const sb = makeSandbox()
  t.after(() => sb.cleanup())
  sb.mod('agent-company.cjs').companyInit(SEED, ['implementer', 'tester'])
  return { sb, T: sb.mod('tasks.cjs') }
}
const files = (sb) => { try { return fs.readdirSync(path.join(sb.company, 'issues')).sort() } catch { return [] } }
const code = (fn) => { try { fn() } catch (e) { return e.code } return null }

test('AT1: the board sets all six fields on create and on update, and each change is in history', (t) => {
  const { T } = setup(t)
  const made = T.createTask(Object.assign({ title: 'Plan fields' }, SIX), board)
  for (const [k, v] of Object.entries(SIX)) assert.equal(made[k], v, k)
  const r = T.updateTask({ id: made.id, type: 'bug', size: 'L', tier: 'heavy', targetVersion: '1.4', tokenEstimate: 5, acceptance: 'Changed.' }, board)
  assert.deepEqual(r.changed.sort(), ['acceptance', 'size', 'targetVersion', 'tier', 'tokenEstimate', 'type'])
  const hist = T.readTask(made.id).history
  for (const f of r.changed) assert.ok(hist.some((h) => h.field === f), f + ' is in history')
  assert.deepEqual(hist.find((h) => h.field === 'size'), Object.assign({}, hist.find((h) => h.field === 'size'), { from: 'M', to: 'L' }))
  // clearing a field with '' removes it and is also recorded
  T.updateTask({ id: made.id, size: '' }, board)
  const after = T.readTask(made.id)
  assert.equal('size' in after, false)
  assert.equal(after.history.filter((h) => h.field === 'size').length, 2)
  assert.equal(T.getTask(made.id).tier, 'heavy')
  assert.equal(T.listTasks()[0].tier, 'heavy')
})

test('AT2: the supervisor sets five on create and is refused (403) on targetVersion, on create and on update', (t) => {
  const { sb, T } = setup(t)
  const { targetVersion, ...five } = SIX
  const made = T.createTask(Object.assign({ title: 'By the assistant' }, five), sup)
  for (const [k, v] of Object.entries(five)) assert.equal(made[k], v, k)
  assert.equal('targetVersion' in made, false)
  const n = files(sb).length
  assert.equal(code(() => T.createTask(Object.assign({ title: 'Nope' }, SIX), sup)), 403)
  assert.equal(files(sb).length, n, 'nothing written')
  // on update the supervisor and the agent may set none of the six
  for (const actor of [sup, agent]) for (const k of Object.keys(SIX)) assert.equal(code(() => T.updateTask({ id: made.id, [k]: SIX[k] }, actor)), 403, k)
  assert.equal(code(() => T.createTask({ title: 'x', type: 'bug' }, agent)), 403)
  assert.deepEqual(T.readTask(made.id).history, [])
})

test('AT3: bad enums, versions, estimates and acceptance are refused with a sentence and nothing is written', (t) => {
  const { sb, T } = setup(t)
  const made = T.createTask({ title: 'Base' }, board)
  const before = fs.readFileSync(path.join(sb.company, 'issues', made.id + '.json'), 'utf8')
  const n = files(sb).length
  const bad = [{ type: 'epic' }, { size: 'XL' }, { size: 's' }, { tier: 'ultra' }, { tokenEstimate: -1 }, { tokenEstimate: 1.5 }, { tokenEstimate: 'lots' }, { targetVersion: 'v 1.3' }, { targetVersion: '1'.repeat(21) }, { acceptance: 'x'.repeat(2001) }]
  for (const b of bad) {
    assert.equal(code(() => T.createTask(Object.assign({ title: 'Bad' }, b), board)), 400, JSON.stringify(b).slice(0, 40))
    assert.equal(code(() => T.updateTask(Object.assign({ id: made.id, title: 'Changed' }, b), board)), 400)
  }
  assert.equal(files(sb).length, n, 'no task created')
  assert.equal(fs.readFileSync(path.join(sb.company, 'issues', made.id + '.json'), 'utf8'), before, 'the task file is untouched')
  assert.throws(() => T.createTask({ title: 'Bad', tokenEstimate: -1 }, board), /whole number/)
  // the edges are fine
  const ok = T.createTask({ title: 'Edge', tokenEstimate: 0, targetVersion: '1'.repeat(20), acceptance: 'x'.repeat(2000) }, board)
  assert.equal(ok.tokenEstimate, 0)
})

test('AT6: a 1.2 task opens in 1.3 with all six absent; reading writes nothing', (t) => {
  const { sb, T } = setup(t)
  const made = T.createTask({ title: 'Old style' }, board)
  const file = path.join(sb.company, 'issues', made.id + '.json')
  const text = fs.readFileSync(file, 'utf8')
  for (const k of Object.keys(SIX)) assert.equal(k in JSON.parse(text), false, k + ' absent on disk')
  const view = T.getTask(made.id)
  const sum = T.listTasks()[0]
  for (const k of ['type', 'size', 'tier', 'targetVersion', 'acceptance']) { assert.equal(view[k], undefined); assert.equal(sum[k], '') }
  assert.equal(sum.tokenEstimate, null)
  assert.equal(fs.readFileSync(file, 'utf8'), text)
})

test('the CLI door carries the fields and refuses a bad one', (t) => {
  const { sb } = setup(t)
  sb.stdin = JSON.stringify({ title: 'Via CLI', type: 'chore', size: 'S', tokenEstimate: 40 })
  const r = sb.cli('--task', '--stdin')
  assert.equal(r.code, 0, r.err)
  const t1 = JSON.parse(fs.readFileSync(path.join(sb.company, 'issues', r.out + '.json'), 'utf8'))
  assert.deepEqual([t1.type, t1.size, t1.tokenEstimate], ['chore', 'S', 40])
  sb.stdin = JSON.stringify({ title: 'Bad', tier: 'ultra' })
  assert.notEqual(sb.cli('--task', '--stdin').code, 0)
})
