/* Fixes for the 1.3 release review (docs/reviews/1.3-review.md). Invented data. */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { makeSandbox, SEED, startServer } = require('./helpers.cjs')
const S = require('../savings.cjs')
const Lg = require('../ledger.cjs')

const BIN = path.join(__dirname, '..', '..', 'bin', 'arsenale.cjs')
const board = { door: 'dashboard', role: 'board', name: '' }
const C = { heavy: ['opus', 'fable'], tierModels: { light: 'haiku', standard: 'sonnet', heavy: 'opus' }, baseline: '' }
const run = (id, o) => Object.assign({ id, agent: 'a', finishedAt: '2026-11-18T10:00:00Z', modelKey: 'Opus 5.5', tokSrc: 'transcript', tokTotal: 1000, costUsd: 1, costSrc: 'transcript', meters: { input: 600, output: 400, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 } }, o)

test('I1: prices init (and --force) need the owner key; the route passes the board', (t) => {
  const sb = makeSandbox(); t.after(() => sb.cleanup())
  const bare = Object.assign({}, sb.env); delete bare.ARSENALE_BOARD_TOKEN
  const go = (env, ...a) => spawnSync(process.execPath, [BIN, 'prices', 'init', ...a], { encoding: 'utf8', cwd: sb.base, env })
  for (const a of [[], ['--force']]) {
    const r = go(bare, ...a)
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /owner/i)
  }
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(sb.root, 'model-prices.json'), 'utf8')).models, {})
  assert.equal(go(sb.env, '--force').status, 0)
  const P = sb.mod('prices.cjs')
  for (const actor of [{ role: 'agent', name: 'x' }, { role: 'supervisor' }, undefined]) assert.throws(() => P.init({ force: true }, actor), (e) => e.code === 403)
  assert.doesNotThrow(() => P.init({ force: true }, board))
})

test('I2: a run with no recorded kind never gets a route-down suggestion (finish-only docs run)', (t) => {
  const sb = makeSandbox(); t.after(() => sb.cleanup())
  const unknown = run('x1', { tier: 'light', kind: '' })
  const X = S.savings({ runs: [unknown], active: [] }, { week: '2026-W47', tasks: [], config: C })
  assert.equal(X.suggestions.length, 0)
  assert.equal(X.warnings.length, 0)
  // with a known build kind the same run does suggest
  assert.equal(S.savings({ runs: [run('x2', { tier: 'light', kind: 'ops' })], active: [] }, { week: '2026-W47', tasks: [], config: C }).suggestions.length, 1)
  // R3 never fires when the model is unknown
  assert.equal(S.savings({ runs: [run('x3', { kind: 'docs', modelKey: '' })], active: [] }, { week: '2026-W47', tasks: [], config: C }).warnings.length, 0)
})

test('I3 + M1: estimated costs say est.; unpriced groups have usd null, never 0', () => {
  const st = { runs: [run('e1', { costSrc: 'estimated', costUsd: 0.0014 }), run('e2', { costUsd: null, costSrc: '', finishedAt: '2026-11-17T10:00:00Z', issue: 'T' }), run('e3', { tokSrc: '', finishedAt: '2026-11-16T10:00:00Z', issue: 'U', meters: null })], active: [] }
  const L = Lg.ledger(st, { by: 'run', tasks: [], versionRuns: {}, office: () => '' })
  const e1 = L.rows.find((g) => g.key === 'e1')
  assert.match(e1.cost, /\(est\.\)/); assert.equal(e1.estimatedRuns, 1)
  assert.match(Lg.text(L), /\$0\.0014 \(est\.\)/)
  const e2 = L.rows.find((g) => g.key === 'e2'); const e3 = L.rows.find((g) => g.key === 'e3')
  assert.equal(e2.cost, 'n/a'); assert.equal(e2.usd, null)
  assert.equal(e3.cost, 'not recorded'); assert.equal(e3.usd, null); assert.equal(e3.input, null)
  const m = S.savings({ runs: [run('e2', { costUsd: null, costSrc: '' })], active: [] }, { week: '2026-W47', tasks: [], config: C }).measured
  assert.equal(m.usd, null)
  assert.match(S.savings({ runs: [run('e1', { costSrc: 'estimated', costUsd: 0.5 })], active: [] }, { week: '2026-W47', tasks: [], config: C }).measured.cost, /est\./)
})

test('M2-M5: context pack money format, unmeasured, Bearer token, fresh after a new run', (t) => {
  const sb = makeSandbox(); t.after(() => sb.cleanup())
  sb.mod('agent-company.cjs').companyInit(SEED, ['implementer', 'tester'])
  const T = sb.mod('tasks.cjs'); const CP = sb.mod('context-pack.cjs')
  T.createTask({ title: 'Use Bearer abcdefSECRETTOKEN1234 and password hunter2xyz', projectId: 'demo-calc' }, board)
  const mk = (runs) => ({ runs, gates: [], decisions: [] })
  const base = { agent: 'implementer', modelKey: 'Sonnet 5.5', projectKey: 'Demo Calc' }
  const r = CP.build('demo-calc', { state: mk([Object.assign({ id: 'a', tokSrc: 'transcript', tokTotal: 150, costUsd: 0.0012 }, base), Object.assign({ id: 'b', tokTotal: 0 }, base)]) })
  assert.match(r.markdown, /150 tok \$0\.0012/); assert.doesNotMatch(r.markdown, /\$0\.00 |(^| )0 tok/m)
  assert.match(r.markdown, /tokens not recorded/)
  assert.ok(!r.markdown.includes('abcdefSECRETTOKEN1234')); assert.ok(!r.markdown.includes('hunter2xyz'))
  // a saved pack is not served once a newer run exists
  const w = CP.write('demo-calc', { state: mk([Object.assign({ id: 'a', finishedAt: '2026-11-01T00:00:00Z', summary: 'OLD-RUN', tokSrc: 'x', tokTotal: 1, costUsd: 1 }, base)]) })
  assert.match(CP.read('demo-calc', { state: mk([Object.assign({ id: 'a', finishedAt: '2026-11-01T00:00:00Z', summary: 'OLD-RUN', tokSrc: 'x', tokTotal: 1, costUsd: 1 }, base)]) }).markdown, /OLD-RUN/)
  const fresh = CP.read('demo-calc', { state: mk([Object.assign({ id: 'n', finishedAt: '2026-11-02T00:00:00Z', summary: 'NEW-RUN', tokSrc: 'x', tokTotal: 1, costUsd: 1 }, base), Object.assign({ id: 'a', finishedAt: '2026-11-01T00:00:00Z', summary: 'OLD-RUN', tokSrc: 'x', tokTotal: 1, costUsd: 1 }, base)]) })
  assert.match(fresh.markdown, /NEW-RUN/); assert.notEqual(fresh.signature, w.signature)
})

test('M6 + M7: reports/ is owner-only; GET /api/state writes no report', async (t) => {
  const sb = makeSandbox(); t.after(() => sb.cleanup())
  const M = sb.mod('savings.cjs')
  const f = M.writeReport(M.savings({ runs: [], active: [] }, { week: '2026-W46', tasks: [], config: C }))
  if (process.platform !== 'win32') assert.equal(fs.statSync(path.dirname(f)).mode & 0o077, 0)
  assert.ok(!/weeklyOnce/.test(fs.readFileSync(path.join(__dirname, '..', 'agent-dashboard-server.cjs'), 'utf8').split("url === '/api/state'")[1].split("url === '/'")[0]), 'no write in the GET /api/state handler')
})

test('M8 + M9: the baseline ends before the current week; the button date comes from the price file', () => {
  const st = { runs: [run('b1', { finishedAt: '2026-11-18T10:00:00Z' })], active: [] }
  const X = S.savings(st, { week: '2026-W47', tasks: [{ id: 'T1', status: 'done', size: 'S', doneAt: '2026-11-18T10:00:00Z' }], config: C })
  if (X.perDone.baselineTo) assert.ok(X.perDone.baselineTo < X.from, X.perDone.baselineTo)
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'price-defaults.json'), 'utf8'))
  assert.equal(X.pricesFetched, d.source.fetched)
  assert.ok(!/fetched 2026-11-18/.test(fs.readFileSync(path.join(__dirname, '..', 'savings.cjs'), 'utf8')))
})

test('M11: the public plan schema names a role, not a person', () => {
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '..', 'plan-schema.cjs'), 'utf8'), /emad/i)
  assert.deepEqual(require('../plan-schema.cjs').ENUM.owner, ['agent', 'owner'])
})
