/* S4 Ledger (spec 1.3 section 11): invented runs, hand-computed totals. */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const { ledger, weekOf } = require('../ledger.cjs')

const run = (id, finishedAt, o) => Object.assign({ id, agent: 'a', finishedAt, modelKey: 'Sonnet 5.5', tokSrc: 'reported', tokTotal: 1000, costUsd: 1, meters: { input: 600, output: 400, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 } }, o)
const tasks = [
  { id: 'T1', title: 'one', status: 'done', size: 'M', targetVersion: '1.3', tokenEstimate: 2000 },
  { id: 'T2', title: 'two', status: 'done', size: 'S', targetVersion: '1.3', tokenEstimate: null },
  { id: 'T3', title: 'three', status: 'todo', size: 'L', targetVersion: '1.3' },
  { id: 'T4', title: 'gone', status: 'cancelled', size: 'L', targetVersion: '1.3' },
]
const state = {
  runs: [
    run('r1', '2026-11-16T10:00:00Z', { issue: 'T1', officeId: 'o1', costUsd: 1.5 }),
    run('r2', '2026-11-17T10:00:00Z', { issue: 'T1', officeId: 'o1', costUsd: null, tokTotal: 500 }),
    run('r3', '2026-11-18T10:00:00Z', { issue: 'T2', officeId: 'o2', costUsd: 2, versionRun: 'v9' }),
    run('r4', '2026-11-18T11:00:00Z', { officeId: 'o2', versionRun: 'v9', costUsd: null, tokTotal: 300 }),
    run('r5', '2026-11-18T12:00:00Z', { officeId: 'o2', costUsd: null, tokSrc: '', tokTotal: 0, meters: null }),
    run('r6', '2026-11-25T12:00:00Z', { issue: 'T9', officeId: 'o3', costUsd: null, tokTotal: 100 }),
  ],
  active: [{ id: 'live1', agent: 'a', issue: 'T1', startedAt: '2026-11-25T09:00:00Z', tokTotal: 9999, tokSrc: 'reported', costUsd: 9 }],
}
const opts = (by, extra) => Object.assign({ by, tasks, versionRuns: { v9: { version: '1.2.9' } }, office: (r) => r.officeId }, extra)
const g = (L, k) => L.rows.find((x) => x.key === k)

test('totals per task, version, office and week equal hand-computed values', () => {
  const t = ledger(state, opts('task'))
  assert.equal(g(t, 'T1').tokens, 1500); assert.equal(g(t, 'T1').usd, 1.5); assert.equal(g(t, 'T1').usdStatus, 'partial')
  assert.equal(g(t, 'T2').usd, 2); assert.equal(g(t, 'T2').usdStatus, 'ok')
  const v = ledger(state, opts('version'))
  assert.equal(g(v, '1.3').tokens, 2500); assert.equal(g(v, '1.3').usd, 3.5)
  assert.equal(g(v, '1.2.9').tokens, 300)
  const o = ledger(state, opts('office'))
  assert.equal(g(o, 'o1').tokens, 1500); assert.equal(g(o, 'o2').tokens, 1300); assert.equal(g(o, 'o2').unmeasured, 1)
  const w = ledger(state, opts('week'))
  assert.equal(weekOf('2026-11-18T10:00:00Z'), '2026-W47')
  assert.equal(g(w, '2026-W47').tokens, 2800); assert.equal(g(w, '2026-W48').tokens, 100)
})

test('unpriced runs: partial shows a lower bound, none priced n/a, none measured not recorded, never $0', () => {
  const t = ledger(state, opts('task'))
  assert.match(g(t, 'T1').cost, /^≥ \$1\.50 \(1 of 2 runs unpriced\)$/)
  assert.equal(g(t, 'T9').usdStatus, 'na'); assert.equal(g(t, 'T9').cost, 'n/a')
  const none = ledger({ runs: [state.runs[4]], active: [] }, opts('run'))
  assert.equal(none.rows[0].usdStatus, 'none'); assert.equal(none.rows[0].cost, 'not recorded')
  for (const L of [t, none]) for (const x of L.rows) if (x.usdStatus !== 'ok') assert.doesNotMatch(x.cost, /\$0\.00/)
})

test('version: targetVersion, else the version run, else (no version)', () => {
  const v = ledger(state, opts('version'))
  assert.deepEqual(v.rows.map((x) => x.key).sort(), ['(no version)', '1.2.9', '1.3'])
  assert.equal(g(v, '1.3').runs, 3) // r3 has T2 (1.3) and a versionRun: the task wins
  assert.equal(g(v, '1.2.9').runs, 1) // r4: only the version run
  assert.equal(g(v, '(no version)').runs, 2)
})

test('a running run is listed apart and not summed into a closed week', () => {
  const w = ledger(state, opts('week'))
  assert.equal(w.total.tokens, 2900)
  assert.equal(w.running.length, 1); assert.equal(w.running[0].id, 'live1')
  assert.equal(g(w, '2026-W48').tokens, 100)
})

test('tokenEstimate against measured tokens per task; version weights', () => {
  const t = ledger(state, opts('task'))
  assert.equal(g(t, 'T1').tokenEstimate, 2000); assert.equal(g(t, 'T1').estimateRatio, 0.75)
  assert.equal(g(t, 'T2').estimateRatio, null)
  const v = ledger(state, opts('version'))
  assert.equal(g(v, '1.3').weightTotal, 12); assert.equal(g(v, '1.3').weightDone, 4) // M3+S1 done, L8 todo, cancelled out
  assert.equal(g(v, '1.3').usdPerWeight, null) // partial: no per-point figure
})

test('since and until bound the rows', () => {
  const L = ledger(state, opts('run', { since: '2026-11-18', until: '2026-11-18' }))
  assert.equal(L.rows.length, 3)
  assert.throws(() => ledger(state, opts('run', { since: 'nope' })), /ISO/)
  assert.throws(() => ledger(state, opts('bad')), /by must/)
})

test('reading the ledger leaves every file mtime unchanged (collect, ledger, CLI)', () => {
  const { makeSandbox } = require('./helpers.cjs')
  const { spawnSync } = require('child_process')
  const sb = makeSandbox()
  try {
    const L = sb.mod('runlog.cjs')
    L.startRun({ id: 'x1', agent: 'a', task: 't', model: 'Sonnet 5.5' }, { door: 'cli', role: 'supervisor', name: '' })
    L.finishRun({ id: 'x1', agent: 'a', task: 't', status: 'done', usage: { inputTokens: 10, outputTokens: 5 } }, { door: 'cli', role: 'supervisor', name: '' })
    const snap = () => {
      const out = {}
      const walk = (d) => { for (const n of fs.readdirSync(d)) { const f = path.join(d, n); const s = fs.statSync(f); if (s.isDirectory()) { if (n !== 'tools') walk(f) } else out[f] = s.mtimeMs } }
      walk(sb.root)
      return out
    }
    const before = snap()
    const r = spawnSync(process.execPath, [path.join(__dirname, '..', '..', 'bin', 'arsenale.cjs'), 'ledger', '--json'], { env: sb.env, encoding: 'utf8' })
    assert.equal(r.status, 0, r.stderr)
    const out = JSON.parse(r.stdout)
    assert.equal(out.total.runs, 1)
    assert.deepEqual(snap(), before)
  } finally { sb.cleanup() }
})

test('a run with the four meters but no usage.tokens total counts as measured (tokens derived from the meters)', () => {
  const { makeSandbox } = require('./helpers.cjs')
  const sb = makeSandbox()
  try {
    const B = sb.mod('build-agent-dashboard.cjs')
    const rec = { id: 'm', startedAt: '2026-11-18T10:00:00Z', finishedAt: '2026-11-18T10:05:00Z', model: 'Sonnet 5.5', usage: { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 7000, cacheWriteTokens: 200 } }
    const d = B.describe(rec, B.readPrices())
    assert.equal(d.tokSrc, 'reported'); assert.equal(d.tokTotal, 1700) // cache reads are not new tokens
    const none = B.describe({ id: 'n', startedAt: '2026-11-18T10:00:00Z', finishedAt: '2026-11-18T10:05:00Z', model: 'Sonnet 5.5' }, B.readPrices())
    assert.equal(none.tokSrc, ''); assert.equal(none.tokTotal, 0)
  } finally { sb.cleanup() }
})
