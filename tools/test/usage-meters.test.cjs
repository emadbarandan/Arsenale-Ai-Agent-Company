/* Slice S1 of 1.3: the run usage block. Invented data, throwaway home. */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const { makeSandbox, mcpClient, SEED } = require('./helpers.cjs')

const PRICES = { 'Sonnet 5.5': { input: 3, output: 15, cacheRead: 0.3, cacheWrite5m: 3.75, cacheWrite1h: 6 } }

function world(t, opts) {
  const sb = makeSandbox(Object.assign({ prices: PRICES }, opts))
  assert.equal(sb.cli('--company-init', '--seed', sb.seed(Object.assign({}, SEED, { company: { name: 'Bluefin Bakery', issuePrefix: 'BLU' } }))).code, 0)
  t.after(() => sb.cleanup())
  return sb
}
const lastRecord = (sb) => {
  const f = fs.readdirSync(sb.runs).filter((n) => n.endsWith('.json')).sort().pop()
  return JSON.parse(fs.readFileSync(path.join(sb.runs, f), 'utf8'))
}
const describeIn = (sb, rec) => {
  const B = sb.mod('build-agent-dashboard.cjs')
  return B.describe(JSON.parse(JSON.stringify(rec)), JSON.parse(fs.readFileSync(path.join(sb.root, 'model-prices.json'), 'utf8')).models)
}
const MET = { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 20000, cacheWriteTokens: 2000 }
const finishJson = (extra) => JSON.stringify(Object.assign({ agent: 'implementer', task: 'invented', status: 'ok', model: 'Sonnet 5.5' }, extra))

test('S1-1: CLI finish with four meters stores them and describe prices them as reported', (t) => {
  const sb = world(t)
  const r = sb.cli('--finish', finishJson({ usage: Object.assign({ tokens: 1500 }, MET, { provider: 'anthropic' }) }))
  assert.equal(r.code, 0, r.err)
  const rec = lastRecord(sb)
  for (const k of Object.keys(MET)) assert.equal(rec.usage[k], MET[k])
  assert.equal(rec.usage.provider, 'anthropic')
  const d = describeIn(sb, rec)
  assert.equal(d.meterSrc, 'reported')
  assert.equal(d.costSrc, 'reported')
  assert.ok(Math.abs(d.costUsd - (1000 * 3 + 500 * 15 + 20000 * 0.3 + 2000 * 3.75) / 1e6) < 1e-12)
  assert.deepEqual(d.meters, { input: 1000, output: 500, cacheRead: 20000, cacheWrite5m: 2000, cacheWrite1h: 0 })
  assert.equal(d.provider, 'anthropic')
  assert.ok(Math.abs(d.cacheShare - 20000 / 23000) < 1e-12)
  assert.equal(d.turns, null)
  // estimated is kept from the CLI too
  sb.cli('--finish', finishJson({ usage: Object.assign({ estimated: true }, MET) }))
  const e = describeIn(sb, lastRecord(sb))
  assert.equal(e.meterSrc, 'estimated'); assert.equal(e.costSrc, 'estimated')
})

test('S1-2: MCP finish_job with snake-case meters gives the same record', async (t) => {
  const sb = world(t)
  const c = mcpClient(sb, 'Test Client'); t.after(() => c.close())
  await c.init()
  const s = await c.call('start_job', { team_member: 'implementer', task: 'invented', tier: 'light', model: 'Sonnet 5.5' })
  assert.equal(s.error, false, s.text)
  const f = await c.call('finish_job', { job_id: s.data.job_id, status: 'ok', summary: 'done', usage: { input_tokens: 1000, output_tokens: 500, cache_read_tokens: 20000, cache_write_tokens: 2000, model: 'Sonnet 5.5', provider: 'anthropic' } })
  assert.equal(f.error, false, f.text)
  const rec = lastRecord(sb)
  for (const k of Object.keys(MET)) assert.equal(rec.usage[k], MET[k])
  assert.equal(rec.usage.provider, 'anthropic')
  assert.equal(rec.usage.tokens, 1500)
  assert.equal(rec.tier, 'light')
  const d = describeIn(sb, rec)
  assert.equal(d.meterSrc, 'reported'); assert.ok(d.costUsd > 0)
})

test('S1-3: a negative or fractional meter is dropped with a warning and the run is logged', (t) => {
  const sb = world(t)
  const r = sb.cli('--finish', finishJson({ usage: { tokens: 10, inputTokens: -5, outputTokens: 1.5, cacheReadTokens: 7 } }))
  assert.equal(r.code, 0, r.err)
  assert.match(r.err, /inputTokens/); assert.match(r.err, /outputTokens/)
  const rec = lastRecord(sb)
  assert.equal(rec.usage.tokens, 10)
  assert.ok(!('inputTokens' in rec.usage)); assert.ok(!('outputTokens' in rec.usage))
  assert.equal(rec.usage.cacheReadTokens, 7)
  assert.equal(describeIn(sb, rec).meters, null)
})

test('S1-4: usage.tokens alone gives costUsd null and costWhy nodata', (t) => {
  const sb = world(t)
  assert.equal(sb.cli('--finish', finishJson({ usage: { tokens: 5000, model: 'Sonnet 5.5' } })).code, 0)
  const d = describeIn(sb, lastRecord(sb))
  assert.equal(d.costUsd, null); assert.equal(d.costWhy, 'nodata'); assert.equal(d.meterSrc, '')
  // three of four meters is still not enough
  sb.cli('--finish', finishJson({ usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 1 } }))
  assert.equal(describeIn(sb, lastRecord(sb)).costWhy, 'nodata')
})

test('S1-5: a transcript wins over reported meters', (t) => {
  const sb = world(t)
  sb.cli('--finish', finishJson({ usage: MET }))
  const rec = lastRecord(sb)
  rec.transcript = { found: true, tokensNew: 100, messages: 4, tokens: { input: 100, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 }, models: { 'Sonnet 5.5': { input: 100, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 } }, toolCounts: {}, files: [] }
  const d = describeIn(sb, rec)
  assert.equal(d.meterSrc, 'transcript'); assert.equal(d.costSrc, 'transcript')
  assert.equal(d.meters.input, 100)
  assert.ok(Math.abs(d.costUsd - 300 / 1e6) < 1e-12)
  assert.equal(d.turns, 4)
})

test('S1-6: tier and strategy set at start are on the finished record', (t) => {
  const sb = world(t)
  const id = sb.cli('--start', JSON.stringify({ agent: 'implementer', task: 'invented', tier: 'heavy', strategy: 'v1' })).out
  assert.ok(id)
  assert.equal(sb.cli('--finish', finishJson({ id })).code, 0)
  const rec = lastRecord(sb)
  assert.equal(rec.tier, 'heavy'); assert.equal(rec.strategy, 'v1')
})

test('S1-7: taskId links the run to the task; issue wins when both differ', (t) => {
  const sb = world(t)
  const L = sb.mod('runlog.cjs')
  const T = sb.mod('tasks.cjs')
  const task = T.createTask({ title: 'Bake bread' }, { door: 'cli', role: 'board' })
  const id = task.id || (task.task && task.task.id)
  assert.match(id, /^BLU-\d+$/)
  const started = L.startRun({ agent: 'implementer', task: 'invented', taskId: id }, { door: 'cli', role: 'board' })
  assert.equal(started.record.issue, id)
  const out = L.finishRun({ id: started.id, agent: 'implementer', task: 'invented', status: 'ok', taskId: id }, { door: 'cli', role: 'board' })
  assert.equal(out.record.issue, id)
  assert.ok(T.readTask(id).runIds.length >= 1)
  const out2 = L.finishRun({ agent: 'implementer', task: 'invented', status: 'ok', taskId: 'BLU-99', issue: id }, { door: 'cli', role: 'board' })
  assert.equal(out2.record.issue, id)
  assert.ok(out2.warnings.some((w) => /differs/.test(w)))
})
