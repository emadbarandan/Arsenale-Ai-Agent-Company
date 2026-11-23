/* Slice S2 of 1.3: the price file and defaults. Invented data, throwaway home. */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const http = require('http')
const path = require('path')
const { spawnSync } = require('child_process')
const { makeSandbox, SEED, startServer } = require('./helpers.cjs')

const BIN = path.join(__dirname, '..', '..', 'bin', 'arsenale.cjs')
const arsenale = (sb, ...args) => { const r = spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', cwd: sb.base, env: sb.env }); return { code: r.status, out: r.stdout.trim(), err: r.stderr.trim() } }

const ownerPath = (sb) => path.join(sb.root, 'model-prices.json')
const owner = (sb) => JSON.parse(fs.readFileSync(ownerPath(sb), 'utf8'))

test('S2-1: prices init fills an empty owner file, refuses a second run, --merge adds only missing', (t) => {
  const sb = makeSandbox(); t.after(() => sb.cleanup())
  const r = arsenale(sb, 'prices', 'init')
  assert.equal(r.code, 0, r.err)
  assert.match(r.out, /2026-11-18/)
  assert.match(r.out, /platform\.claude\.com/)
  const j = owner(sb)
  assert.deepEqual(Object.keys(j.models), ['Fable 5.2', 'Opus 5.5', 'Sonnet 5.5', 'Haiku 5.5'])
  assert.equal(j.source.fetched, '2026-11-18')
  assert.equal(j.models['Haiku 5.5'].over100k.input, 0.5)
  const again = arsenale(sb, 'prices', 'init')
  assert.notEqual(again.code, 0)
  assert.match(again.err, /--force/)
  // --merge keeps the owner's own number and adds the missing
  const mine = { 'Opus 5.5': { input: 1, output: 2, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 } }
  fs.writeFileSync(ownerPath(sb), JSON.stringify({ models: mine }))
  assert.equal(arsenale(sb, 'prices', 'init', '--merge').code, 0)
  const m = owner(sb).models
  assert.equal(m['Opus 5.5'].input, 1)
  assert.equal(m['Sonnet 5.5'].input, 2)
  assert.equal(arsenale(sb, 'prices', 'init', '--force').code, 0)
  assert.equal(owner(sb).models['Opus 5.5'].input, 4)
})

test('S2-2: the shipped template stays empty', () => {
  const tpl = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'model-prices.json'), 'utf8'))
  assert.deepEqual(tpl.models, {})
})

function haikuTranscript(dir) {
  const line = (id, inp, out, cr, cw) => JSON.stringify({ type: 'assistant', message: { id, model: 'claude-haiku-5-5', usage: { input_tokens: inp, output_tokens: out, cache_read_input_tokens: cr, cache_creation_input_tokens: cw, cache_creation: { ephemeral_5m_input_tokens: cw, ephemeral_1h_input_tokens: 0 } }, content: [] } })
  const f = path.join(dir, 't.jsonl')
  // m1: small prompt (base rate); m2: 120,000-token prompt (over100k rate)
  fs.writeFileSync(f, [line('m1', 1000, 200, 5000, 0), line('m2', 20000, 1000, 90000, 10000)].join('\n') + '\n')
  return f
}

test('S2-3: a 120,000-token Haiku prompt is priced at the over100k rate', (t) => {
  const sb = makeSandbox(); t.after(() => sb.cleanup())
  assert.equal(arsenale(sb, 'prices', 'init').code, 0)
  const B = sb.mod('build-agent-dashboard.cjs')
  const tr = B.readTranscript(haikuTranscript(path.dirname(sb.root)))
  assert.equal(tr.models['Haiku 5.5'].long.input, 20000)
  assert.equal(tr.models['Haiku 5.5'].input, 21000)
  const d = B.describe({ id: 'r', startedAt: '2026-11-18T10:00:00Z', finishedAt: '2026-11-18T10:05:00Z', model: 'Haiku 5.5', transcript: tr }, B.readPrices())
  const hand = (1000 * 0.10 + 200 * 0.50 + 5000 * 0.01) / 1e6 + (20000 * 0.50 + 1000 * 2.50 + 90000 * 0.05 + 10000 * 0.625) / 1e6
  assert.ok(Math.abs(d.costUsd - hand) < 1e-12, d.costUsd + ' vs ' + hand)
  // a record without `long` is priced at base, with a note
  const old = JSON.parse(JSON.stringify(tr)); delete old.models['Haiku 5.5'].long
  const o = B.describe({ id: 'r2', startedAt: '2026-11-18T10:00:00Z', finishedAt: '2026-11-18T10:05:00Z', model: 'Haiku 5.5', transcript: old }, B.readPrices())
  assert.equal(o.costNote, 'base rate; prompt size not recorded')
  assert.ok(o.costUsd < d.costUsd)
})

test('S2-4: a malformed price makes the run n/a, never 0', (t) => {
  const sb = makeSandbox({ prices: { 'Sonnet 5.5': { input: '2', output: -1, cacheRead: 0.1, cacheWrite5m: 2.5, cacheWrite1h: NaN } } }); t.after(() => sb.cleanup())
  const B = sb.mod('build-agent-dashboard.cjs')
  const rec = { id: 'r', startedAt: '2026-11-18T10:00:00Z', finishedAt: '2026-11-18T10:05:00Z', model: 'Sonnet 5.5', usage: { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 1, cacheWriteTokens: 1 } }
  const d = B.describe(rec, B.readPrices())
  assert.equal(d.costUsd, null)
  assert.equal(d.costWhy, 'prices')
})

test('S2-5: prices check names an unpriced model seen in runs and flags old prices', (t) => {
  const sb = makeSandbox({ prices: { 'Opus 5.5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite5m: 5, cacheWrite1h: 8 } } }); t.after(() => sb.cleanup())
  fs.mkdirSync(sb.runs, { recursive: true })
  fs.writeFileSync(path.join(sb.runs, 'a.json'), JSON.stringify({ id: 'a', startedAt: '2026-11-18T10:00:00Z', finishedAt: '2026-11-18T10:05:00Z', model: 'Gizmo 9', status: 'ok' }))
  const r = arsenale(sb, 'prices', 'check')
  assert.match(r.out, /Gizmo 9/)
  assert.doesNotMatch(r.out, /Opus 5\.5/)
  fs.writeFileSync(ownerPath(sb), JSON.stringify({ source: { label: 'x', url: 'u', fetched: '2020-01-01' }, models: {} }))
  assert.match(arsenale(sb, 'prices', 'check').out, /check your prices/)
})

function post(port, url, headers, body) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method: 'POST', path: url, agent: false, headers: Object.assign({ Host: '127.0.0.1:' + port, 'Content-Type': 'application/json' }, headers) }, (res) => {
      let d = ''; res.on('data', (c) => { d += c }); res.on('end', () => resolve({ status: res.statusCode, text: d }))
    })
    r.on('error', reject); r.end(JSON.stringify(body || {}))
  })
}

test('S2-6: POST /api/prices-init is refused without the owner key and works with it', async (t) => {
  const sb = makeSandbox(); t.after(() => sb.cleanup())
  assert.equal(sb.cli('--company-init', '--seed', sb.seed(SEED)).code, 0)
  const s = await startServer(sb, { portBase: 37400 }); t.after(() => s.child.kill())
  const origin = { Origin: 'http://127.0.0.1:' + s.port }
  assert.equal((await post(s.port, '/api/prices-init', origin)).status, 401)
  assert.equal((await post(s.port, '/api/prices-init', Object.assign({ Cookie: s.cookie }, origin))).status, 403) // key cookie but no page token
  assert.deepEqual(owner(sb).models, {})
  const ok = await post(s.port, '/api/prices-init', Object.assign({ Cookie: s.cookie, 'X-Dashboard-Token': s.token }, origin))
  assert.equal(ok.status, 200, ok.text)
  assert.equal(Object.keys(owner(sb).models).length, 4)
})
