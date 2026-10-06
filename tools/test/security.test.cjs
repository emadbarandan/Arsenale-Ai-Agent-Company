/* The v1.0 security and polling fixes: JSON input without shell quoting, the
 * finish file name, transcript roots, own-key ids, anti-framing and CSP
 * headers, and the ETag/gzip state that keeps an idle tab nearly silent.
 * Run: npm test */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const http = require('http')
const path = require('path')
const zlib = require('zlib')
const { makeSandbox, SEED, startServer: start } = require('./helpers.cjs')

function sandbox(t, opts) {
  const sb = makeSandbox(opts)
  t.after(() => sb.cleanup())
  return sb
}

// the owner's key cookie per server port: every request carries it unless a
// test sends its own Cookie header
const cookies = {}
async function startServer(sb) {
  const s = await start(sb, { portBase: 43000 })
  cookies[s.port] = s.cookie
  return s
}

function get(port, url, headers = {}) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: url, agent: false, headers: Object.assign({ Host: '127.0.0.1:' + port }, cookies[port] ? { Cookie: cookies[port] } : {}, headers) }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }))
    }).on('error', reject)
  })
}

test('JSON input: --stdin, --file and @file carry quotes and non-ASCII text that inline JSON cannot', (t) => {
  const sb = sandbox(t)
  const task = "it's \"quoted\" & `ticked` $HOME; rm -rf / — ünïcödé"
  sb.stdin = JSON.stringify({ agent: 'tester', task })
  const a = sb.cli('--start', '--stdin')
  sb.stdin = undefined
  assert.equal(a.code, 0, a.err)
  assert.equal(sb.read('agent-runs/active/' + a.out + '.json').task, task)
  // a file written by Windows PowerShell 5.1 starts with a byte-order mark
  const f = path.join(sb.base, 'p.json')
  fs.writeFileSync(f, '﻿' + JSON.stringify({ id: a.out, doing: "reading 'App.jsx'" }), 'utf8')
  assert.equal(sb.cli('--progress', '--file', f).code, 0)
  assert.equal(sb.cli('--progress', '@' + f).code, 0)
  assert.equal(sb.read('agent-runs/active/' + a.out + '.json').steps.length, 2)
  fs.writeFileSync(f, JSON.stringify({ id: a.out, agent: 'tester', task, status: 'ok' }))
  const fin = sb.cli('--file', f)
  assert.equal(fin.code, 0, fin.err)
  assert.equal(JSON.parse(fs.readFileSync(path.join(sb.base, fin.out), 'utf8')).task, task)
})

test('bad JSON gives one plain sentence and exit 1, never a stack trace', (t) => {
  const sb = sandbox(t)
  const r = sb.cli('--start', '{agent:tester}')
  assert.equal(r.code, 1)
  assert.match(r.err, /not valid .*--stdin or --file/)
  assert.doesNotMatch(r.err, /at JSON\.parse|\n\s+at /)
  assert.equal(sb.cli('--start', '--file', path.join(sb.base, 'missing.json')).code, 1)
  assert.equal(sb.cli('--no-such-mode', '{}').code, 1)
})

test('--help lists every mode and the exit codes; no arguments prints it and fails', (t) => {
  const sb = sandbox(t)
  const h = sb.cli('--help')
  assert.equal(h.code, 0)
  for (const m of ['--start', '--progress', '--gate', '--decision', '--answers', '--dismiss', '--dismiss-older-than', '--company-init', '--company-status', '--budget-check', '--budget', '--budgets', '--employee', '--inbox', '--heartbeat', '--stdin', '--file', 'Exit codes']) assert.ok(h.out.includes(m), 'help lacks ' + m)
  assert.equal(sb.cli().code, 1)
})

test('finish: an agent name with a path or a stream in it stays inside agent-runs/', (t) => {
  const sb = sandbox(t)
  for (const agent of ['x/../../../../escaped', 'x\\..\\..\\escaped', 'a:stream', '..']) {
    const r = sb.cli(JSON.stringify({ agent, task: 'invented', finishedAt: '../../nope' }))
    assert.equal(r.code, 0, r.err)
    const file = path.resolve(sb.base, r.out)
    assert.equal(path.dirname(file), sb.runs, agent + ' wrote ' + file)
    const rec = JSON.parse(fs.readFileSync(file, 'utf8'))
    assert.equal(rec.agent, agent, 'the record keeps the name as given')
    assert.ok(!isNaN(Date.parse(rec.finishedAt)), 'a bad date is replaced by now')
  }
  assert.equal(fs.readdirSync(sb.base).filter((n) => /escaped/.test(n)).length, 0)
})

test('a transcript path outside the configured roots is not read', (t) => {
  const sb = sandbox(t)
  const outside = path.join(sb.base, 'outside.jsonl')
  fs.writeFileSync(outside, JSON.stringify({ type: 'assistant', message: { id: 'm', model: 'x', usage: { input_tokens: 5 }, content: [] } }) + '\n')
  const r = sb.cli(JSON.stringify({ agent: 'tester', task: 'invented', transcript: outside }))
  const rec = JSON.parse(fs.readFileSync(path.join(sb.base, r.out), 'utf8'))
  assert.equal(rec.transcript.found, false)
  assert.equal(rec.transcript.reason, 'no-roots')
  fs.mkdirSync(path.join(sb.base, 'roots'))
  fs.writeFileSync(path.join(sb.root, 'config.json'), JSON.stringify({ transcriptRoots: [path.join(sb.base, 'roots')] }))
  const r2 = sb.cli(JSON.stringify({ agent: 'tester', task: 'invented', transcript: path.join(sb.base, 'roots', '..', 'outside.jsonl') }))
  assert.equal(JSON.parse(fs.readFileSync(path.join(sb.base, r2.out), 'utf8')).transcript.reason, 'outside-roots')
})

test('ids that are Object property names are not employees', (t) => {
  const sb = sandbox(t)
  assert.equal(sb.cli('--company-init', '--seed', sb.seed()).code, 0)
  for (const id of ['constructor', 'toString', 'hasOwnProperty']) {
    const r = sb.cli('--budget', JSON.stringify({ scope: 'employee', id, budget: { monthlyTokens: 1 }, by: 'board' }))
    assert.equal(r.code, 1, id)
    assert.match(r.err, /no such employee/)
  }
  assert.equal(Object.hasOwn(sb.read('company/employees.json'), 'constructor'), false)
})

test('esc() in the pages escapes the single quote too', (t) => {
  const sb = sandbox(t)
  const B = sb.mod('build-agent-dashboard.cjs')
  const html = B.renderPage(B.collect(), {}) + B.renderArchive(B.collect(), {})
  const escs = html.match(/const esc = \(s\) => [^\n]+/g)
  assert.ok(escs && escs.length >= 2)
  for (const e of escs) assert.match(e, /'&#39;'/)
})

test('server: no framing, a nonce CSP on the pages, and the same headers on errors', async (t) => {
  const sb = sandbox(t)
  const { port, child } = await startServer(sb)
  t.after(() => child.kill())
  for (const url of ['/', '/archive']) {
    const r = await get(port, url)
    assert.equal(r.status, 200)
    assert.equal(r.headers['x-frame-options'], 'DENY')
    const csp = r.headers['content-security-policy']
    assert.match(csp, /frame-ancestors 'none'/)
    const nonce = /script-src 'nonce-([^']+)'/.exec(csp)[1]
    const scripts = r.body.toString().match(/<script[^>]*>/g)
    assert.ok(scripts.length >= 1)
    for (const s of scripts) assert.equal(s, '<script nonce="' + nonce + '">')
    assert.doesNotMatch(csp, /script-src[^;]*unsafe-inline/)
  }
  const a = await get(port, '/')
  const b = await get(port, '/')
  assert.notEqual(a.headers['content-security-policy'], b.headers['content-security-policy'], 'a fresh nonce per response')
  for (const url of ['/api/state', '/api/company', '/nothing', '/api/token']) {
    const r = await get(port, url)
    assert.equal(r.headers['x-frame-options'], 'DENY', url)
  }
  assert.equal((await get(port, '/', { Host: 'evil.test' })).headers['x-frame-options'], 'DENY')
})

test('api/state: ETag and 304 while idle, gzip when accepted, a new state after a log call', async (t) => {
  const sb = sandbox(t)
  assert.equal(sb.cli('--company-init', '--seed', sb.seed(SEED)).code, 0)
  for (let i = 0; i < 30; i++) sb.measured('tester', 'democalc', 1000 + i, { task: 'invented task ' + i })
  const { port, child } = await startServer(sb)
  t.after(() => child.kill())
  const first = await get(port, '/api/state', { 'Accept-Encoding': 'gzip' })
  assert.equal(first.status, 200)
  assert.equal(first.headers['content-encoding'], 'gzip')
  const state = JSON.parse(zlib.gunzipSync(first.body).toString())
  assert.equal(state.runs.length, 30)
  const tag = first.headers.etag
  assert.ok(tag)
  const idle = await get(port, '/api/state', { 'If-None-Match': tag, 'Accept-Encoding': 'gzip' })
  assert.equal(idle.status, 304)
  assert.equal(idle.body.length, 0)
  const plain = await get(port, '/api/state')
  assert.equal(plain.headers['content-encoding'], undefined)
  assert.equal(JSON.parse(plain.body.toString()).runs.length, 30)
  // a new run on disk, logged by another process, changes the state
  const st = sb.cli('--start', '{"agent":"tester","task":"invented live task","project":"democalc"}')
  assert.equal(st.code, 0)
  const after = await get(port, '/api/state', { 'If-None-Match': tag })
  assert.equal(after.status, 200)
  assert.equal(JSON.parse(after.body.toString()).active.length, 1)
  // progress written in place in active/ is seen too
  const tag2 = after.headers.etag
  sb.cli('--progress', JSON.stringify({ id: st.out, doing: 'step two' }))
  const moved = await get(port, '/api/state', { 'If-None-Match': tag2 })
  assert.equal(moved.status, 200)
  assert.equal(JSON.parse(moved.body.toString()).active[0].doing, 'step two')
  const co = await get(port, '/api/company')
  assert.equal((await get(port, '/api/company', { 'If-None-Match': co.headers.etag })).status, 304)
})
