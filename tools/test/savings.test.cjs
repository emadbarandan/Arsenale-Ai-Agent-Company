/* S5 Savings (spec 1.3 section 5, 11): rule v1, est. labelling, the weekly
 * report, the board-only adopt mark. Invented runs; throwaway home. */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const http = require('http')
const path = require('path')
const { spawnSync } = require('child_process')
const { makeSandbox, SEED, startServer } = require('./helpers.cjs')
const S = require('../savings.cjs')

const BIN = path.join(__dirname, '..', '..', 'bin', 'arsenale.cjs')
const C = { heavy: ['opus', 'fable'], tierModels: { light: 'haiku', standard: 'sonnet', heavy: 'opus' }, baseline: '' }
const W = '2026-W47' // 2026-11-16 .. 2026-11-22
const run = (id, agent, o) => Object.assign({ id, agent, finishedAt: '2026-11-18T10:00:00Z', modelKey: 'Opus 5.5', kind: 'build', tokSrc: 'transcript', tokTotal: 1000, costUsd: 1, costSrc: 'transcript', meters: { input: 600, output: 400, cacheRead: 3000, cacheWrite5m: 0, cacheWrite1h: 0 } }, o)
const tasks = [{ id: 'T1', status: 'todo', type: 'bug', size: 'S' }, { id: 'T2', status: 'todo', type: 'feature', size: 'M' }]
const state = {
  runs: [
    run('r1', 'scanner', { tier: 'light', kind: 'ops', costUsd: 0.26 }), // R1
    run('r2', 'builder', { costUsd: 0.9, issue: 'T2' }), // R2
    run('r3', 'fixer', { costUsd: 0.5 }), // R2
    run('r4', 'writer', { kind: 'docs', modelKey: 'Sonnet 5.5', costUsd: 0.4 }), // R3
    run('r5', 'docs-on-opus', { kind: 'docs', costUsd: 1.2 }), // never down: nothing
    run('r6', 'bugfix', { issue: 'T1', costUsd: 0.45 }), // small bug on Opus: nothing
    run('r7', 'security-on-opus', { kind: 'security' }), // never down
    run('r8', 'plain', { kind: '', costUsd: 3 }), // neither kind nor tier: nothing
  ],
  active: [],
}

test('S5-1: three mis-tiered runs and one writing run give 3 saving suggestions and 1 R3 warning, each with its method', () => {
  const X = S.savings(state, { week: W, tasks, config: C })
  assert.deepEqual(X.suggestions.map((s) => s.rule).sort(), ['R1', 'R2', 'R2'])
  assert.equal(X.suggestions.length, 3)
  assert.equal(X.warnings.length, 1)
  assert.equal(X.warnings[0].rule, 'R3')
  assert.equal(X.warnings[0].saving, 'no saving: quality warning')
  for (const s of X.suggestions.concat(X.warnings)) { assert.ok(s.method.length > 40, 'method'); assert.match(s.atbRows, /ATB-1/); assert.match(s.lite, /docs\/benchmarks\/atb-1\.md/) }
  const r1 = X.suggestions.find((s) => s.rule === 'R1')
  assert.equal(r1.to, 'haiku'); assert.equal(r1.runs, 1)
  assert.equal(X.suggestions.find((s) => s.agent === 'builder').to, 'sonnet')
})

test('S5-2: a docs run on Opus yields no suggestion; S5-3: a build bug of size S on Opus yields none; security, review and kindless runs neither', () => {
  const only = (r) => S.suggest([r], tasks, C)
  assert.equal(only(run('a', 'w', { kind: 'docs' })).length, 0)
  assert.equal(only(run('b', 'w', { kind: 'build', issue: 'T1' })).length, 0)
  assert.equal(only(run('c', 'w', { kind: 'security' })).length, 0)
  assert.equal(only(run('d', 'w', { kind: 'review', tier: 'light' })).length, 0)
  assert.equal(only(run('e', 'w', { kind: '' })).length, 0)
  // a bug that is not size S is still R2
  assert.equal(only(run('f', 'w', { kind: 'build', issue: 'T2' })).length, 1)
})

test('S5-4: every suggested amount carries "est."; an unpriced run reads n/a; a mix shows what is unpriced', () => {
  const X = S.savings(state, { week: W, tasks, config: C })
  const b = X.suggestions.find((s) => s.agent === 'builder')
  assert.equal(b.saving, 'est. $0.3060') // 0.9 x 34 %
  assert.equal(X.suggestions.find((s) => s.rule === 'R1').saving, 'est. $0.2470')
  for (const s of X.suggestions) assert.match(s.saving, /^est\. \$/)
  assert.match(X.suggestions[0].pct, /^est\. -/)
  const un = S.suggest([run('u', 'x', { costUsd: null }), run('v', 'x', { costUsd: 1 }), run('w', 'y', { costUsd: null })], [], C)
  assert.equal(un.find((s) => s.agent === 'y').saving, 'n/a')
  assert.equal(un.find((s) => s.agent === 'x').saving, 'est. $0.3400 (1 of 2 runs unpriced)')
})

test('S5-4b: the week figures keep the ledger display rule; a plan pay model reads API-equivalent', () => {
  const X = S.savings(state, { week: W, tasks, config: C })
  assert.equal(X.measured.runs, 8); assert.equal(X.measured.usdStatus, 'ok')
  assert.equal(X.measured.cacheShare, 83) // 8 x 3000 read of 8 x 3600 input-side tokens
  const none = S.savings({ runs: [run('z', 'a', { tokSrc: '', costUsd: null, meters: null })], active: [] }, { week: W, tasks, config: C })
  assert.equal(none.measured.cost, 'not recorded'); assert.equal(none.suggestions[0].saving, 'n/a') // the suggestion still shows
  const na = S.savings({ runs: [run('z', 'a', { costUsd: null })], active: [] }, { week: W, tasks, config: C })
  assert.equal(na.measured.cost, 'n/a')
  assert.match(S.savings(state, { week: W, tasks, config: C, payModel: 'plan' }).measured.costLabel, /^API-equivalent \$/)
  const empty = S.savings({ runs: [], active: [] }, { week: W, tasks: [], config: C })
  assert.equal(empty.empty, true)
})

test('S5-4c: a change against the baseline needs 5 done tasks on both sides', () => {
  const mk = (n, from, cost) => {
    const ts = [], rs = []
    for (let i = 0; i < n; i++) {
      const id = 'D' + from + i
      ts.push({ id, status: 'done', size: 'M', completedAt: from + 'T12:00:00Z' })
      rs.push(run('x' + id, 'a', { issue: id, costUsd: cost, finishedAt: from + 'T11:00:00Z' }))
    }
    return { ts, rs }
  }
  const base = mk(5, '2026-11-02', 2), cur = mk(5, '2026-11-18', 1)
  const full = S.savings({ runs: base.rs.concat(cur.rs), active: [] }, { week: W, tasks: base.ts.concat(cur.ts), config: C })
  assert.equal(full.perDone.baselineFrom, '2026-11-02')
  assert.equal(full.perDone.change.perTask, -50)
  const few = mk(4, '2026-11-18', 1)
  const short = S.savings({ runs: base.rs.concat(few.rs), active: [] }, { week: W, tasks: base.ts.concat(few.ts), config: C })
  assert.equal(short.perDone.change, null); assert.equal(short.perDone.note, 'too few done tasks to compare')
})

const cli = (sb, ...args) => { const r = spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', cwd: sb.base, env: sb.env }); return { code: r.status, out: r.stdout.trim(), err: r.stderr.trim() } }
const tree = (d) => { const o = {}; const w = (x) => { for (const n of fs.readdirSync(x)) { const f = path.join(x, n); const s = fs.statSync(f); if (s.isDirectory()) { if (n !== 'tools') w(f) } else o[f] = s.mtimeMs } }; w(d); return o }

test('S5-5: savings --write writes one file; a second call the same week rewrites only that file', () => {
  const sb = makeSandbox(); t_cleanup(sb)
  fs.mkdirSync(sb.runs, { recursive: true })
  fs.writeFileSync(path.join(sb.runs, 'a.json'), JSON.stringify({ id: 'a', agent: 'builder', kind: 'build', startedAt: '2026-11-18T10:00:00Z', finishedAt: '2026-11-18T10:05:00Z', model: 'Opus 5.5', status: 'ok', usage: { inputTokens: 1000, outputTokens: 500 } }))
  const before = tree(sb.root)
  const r = cli(sb, 'savings', '--week', W, '--write')
  assert.equal(r.code, 0, r.err)
  const file = path.join(sb.root, 'reports', 'savings-' + W + '.md')
  assert.ok(fs.existsSync(file))
  const after = tree(sb.root)
  assert.deepEqual(Object.keys(after).filter((k) => !(k in before)), [file])
  for (const k of Object.keys(before)) assert.equal(after[k], before[k], k + ' untouched')
  assert.match(fs.readFileSync(file, 'utf8'), /^# Savings, 2026-W47/)
  assert.match(fs.readFileSync(file, 'utf8'), /est\./)
  const again = cli(sb, 'savings', '--week', W, '--write')
  assert.equal(again.code, 0, again.err)
  const last = tree(sb.root)
  for (const k of Object.keys(after)) if (k !== file) assert.equal(last[k], after[k], k + ' untouched on the second call')
  assert.equal(cli(sb, 'savings', '--week', 'nope').code, 1)
  assert.match(cli(sb, 'savings', '--week', W).out, /Cost per done task/)
})

function t_cleanup(sb) { test.after(() => sb.cleanup()) }

test('S5-5b: the weekly write happens once, for last week, only when that week had runs and the file is missing', () => {
  const sb = makeSandbox(); t_cleanup(sb)
  const M = sb.mod('savings.cjs')
  const now = Date.parse('2026-11-25T12:00:00') // local noon in W48
  const st = { runs: [run('q', 'builder', { finishedAt: '2026-11-18T10:00:00Z' })], active: [] }
  const f = M.weeklyOnce(st, now)
  assert.equal(path.basename(f), 'savings-2026-W47.md')
  assert.equal(M.weeklyOnce(st, now), null) // checked already this week
  const sb2 = makeSandbox(); t_cleanup(sb2)
  assert.equal(sb2.mod('savings.cjs').weeklyOnce({ runs: [], active: [] }, now), null)
  assert.ok(!fs.existsSync(path.join(sb2.root, 'reports')))
})

function post(port, url, headers, body) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method: 'POST', path: url, agent: false, headers: Object.assign({ Host: '127.0.0.1:' + port, 'Content-Type': 'application/json' }, headers) }, (res) => {
      let d = ''; res.on('data', (c) => { d += c }); res.on('end', () => resolve({ status: res.statusCode, text: d }))
    })
    r.on('error', reject); r.end(JSON.stringify(body || {}))
  })
}

test('S5-6: adopt is board only (function and HTTP); GET /api/savings returns the page content', async (t) => {
  const sb = makeSandbox(); t.after(() => sb.cleanup())
  const M = sb.mod('savings.cjs')
  const agent = { door: 'cli', role: 'agent', name: 'x' }
  assert.throws(() => M.adopt({ rule: 'R2', agent: 'builder', adopted: true }, agent), (e) => e.code === 403)
  assert.deepEqual(M.readAdopted(), [])
  assert.equal(sb.cli('--company-init', '--seed', sb.seed(SEED)).code, 0)
  const s = await startServer(sb, { portBase: 37600 }); t.after(() => s.child.kill())
  const origin = { Origin: 'http://127.0.0.1:' + s.port }
  const body = { rule: 'R2', agent: 'builder', adopted: true }
  assert.equal((await post(s.port, '/api/savings-adopt', origin, body)).status, 401)
  assert.equal((await post(s.port, '/api/savings-adopt', Object.assign({ Cookie: s.cookie }, origin), body)).status, 403)
  assert.equal(M.readAdopted().length, 0)
  const ok = await post(s.port, '/api/savings-adopt', Object.assign({ Cookie: s.cookie, 'X-Dashboard-Token': s.token }, origin), body)
  assert.equal(ok.status, 200, ok.text)
  const f = path.join(sb.root, 'savings', 'adopted.json')
  assert.equal(JSON.parse(fs.readFileSync(f, 'utf8')).items[0].rule, 'R2')
  const bad = await post(s.port, '/api/savings-adopt', Object.assign({ Cookie: s.cookie, 'X-Dashboard-Token': s.token }, origin), { rule: 'R3', agent: 'a', adopted: true })
  assert.equal(bad.status, 400)
  const g = await new Promise((res, rej) => http.get({ host: '127.0.0.1', port: s.port, path: '/api/savings', agent: false, headers: { Host: '127.0.0.1:' + s.port, Cookie: s.cookie } }, (r) => { let d = ''; r.on('data', (c) => { d += c }); r.on('end', () => res({ status: r.statusCode, json: JSON.parse(d) })) }).on('error', rej))
  assert.equal(g.status, 200)
  assert.ok(Array.isArray(g.json.suggestions)); assert.equal(g.json.adopted[0].effect.status, 'measuring')
})

test('S5-7: the adopted effect shows "measuring" until 5 runs follow, then before and after', () => {
  const item = { rule: 'R2', agent: 'builder', date: '2026-11-10T00:00:00Z' }
  const mkT = (id, done, size) => ({ id, status: 'done', size, completedAt: done })
  const ts = [mkT('A', '2026-11-05T00:00:00Z', 'M'), mkT('B', '2026-11-12T00:00:00Z', 'M')]
  const rs = (n) => Array.from({ length: n }, (_, i) => run('e' + i, 'builder', { issue: i % 2 ? 'B' : 'A', finishedAt: i < 1 ? '2026-11-04T00:00:00Z' : '2026-11-1' + (1 + (i % 5)) + 'T00:00:00Z', costUsd: 3 }))
  const sb = makeSandbox(); try {
    const M = sb.mod('savings.cjs')
    fs.mkdirSync(path.join(sb.root, 'savings'), { recursive: true })
    fs.writeFileSync(path.join(sb.root, 'savings', 'adopted.json'), JSON.stringify({ items: [item] }))
    const few = M.savings({ runs: rs(3), active: [] }, { week: W, tasks: ts, config: C })
    assert.equal(few.adopted[0].effect.status, 'measuring')
    const many = M.savings({ runs: rs(8), active: [] }, { week: W, tasks: ts, config: C })
    assert.equal(many.adopted[0].effect.status, 'measured')
    assert.equal(typeof many.adopted[0].effect.before, 'number')
  } finally { sb.cleanup() }
})
