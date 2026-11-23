const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')
const S = require('../plan-schema.cjs')
const FX = path.join(__dirname, 'fixtures', 'plan-v1')
const CLI = path.join(__dirname, '..', '..', 'bin', 'arsenale.cjs')
const cli = (...a) => spawnSync(process.execPath, [CLI, 'plan-check', ...a], { encoding: 'utf8' })

test('S7: plan.json passes and --expect exits 0', () => {
  const r = cli(path.join(FX, 'plan.json'), '--expect', path.join(FX, 'expected.json'))
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.match(r.stdout, /Matches expected/)
})

test('S7: --expect exits 1 on a difference', () => {
  const exp = JSON.parse(fs.readFileSync(path.join(FX, 'expected.json'), 'utf8'))
  exp.progress.overall.percent = 99
  const f = path.join(os.tmpdir(), 'plan-exp-' + process.pid + '.json')
  fs.writeFileSync(f, JSON.stringify(exp))
  const r = cli(path.join(FX, 'plan.json'), '--expect', f)
  fs.unlinkSync(f)
  assert.equal(r.status, 1)
  assert.match(r.stdout, /overall\.percent/)
})

test('S7: each invalid-*.json exits 1 naming its problem', () => {
  const want = { 'version': /schema_version/, 'enum': /tasks\[0\]\.status.*finished/, 'phase': /tasks\[1\]\.phase.*P9/, 'duplicate-id': /duplicate id "B-01"/, 'cost-zero': /runs\[2\]\.cost.*n\/a/ }
  const files = fs.readdirSync(FX).filter((f) => f.startsWith('invalid-'))
  assert.equal(files.length, Object.keys(want).length)
  for (const f of files) {
    const r = cli(path.join(FX, f))
    assert.equal(r.status, 1, f)
    assert.match(r.stdout, want[f.slice(8, -5)], f)
  }
})

test('S7: unknown fields are reported, not refused', () => {
  const r = S.check(fs.readFileSync(path.join(FX, 'plan.json')))
  assert.ok(r.ok)
  assert.deepEqual(r.unknown, ['tasks[3].mood'])
})

test('S7: every problem is listed; non-JSON is refused', () => {
  const p = JSON.parse(fs.readFileSync(path.join(FX, 'plan.json'), 'utf8'))
  p.schema_version = 3; p.tasks[0].size = 'XL'; p.decisions[0].status = 'maybe'
  assert.equal(S.check(p).errors.length, 3)
  assert.match(S.check('a: 1\n').errors[0], /save the plan as JSON/)
})

test('S7: a 6 MB file is refused', () => {
  const f = path.join(os.tmpdir(), 'plan-big-' + process.pid + '.json')
  fs.writeFileSync(f, JSON.stringify({ schema_version: 1, notes: 'x'.repeat(6 * 1024 * 1024) }))
  const r = cli(f)
  fs.unlinkSync(f)
  assert.equal(r.status, 1)
  assert.match(r.stdout + r.stderr, /5 MB/)
})

test('S7: cost "n/a" is never summed as 0 (status partial); no tasks reads No plan', () => {
  const r = S.check(fs.readFileSync(path.join(FX, 'plan.json')))
  assert.equal(r.runs.usdStatus, 'partial')
  assert.equal(r.runs.unpricedRuns, 1)
  assert.equal(r.runs.costUsd, 1.75)
  const e = S.check({ schema_version: 1 })
  assert.equal(e.progress.label, 'No plan')
  assert.match(S.format(e), /No plan/)
})
