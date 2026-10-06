/* agent-dashboard-server.cjs: api/company with its ETag, and the write
 * endpoint api/budget behind the Host, Origin, token, content-type and size
 * checks (AT-12). Each test starts its own server, from a throwaway data
 * folder, on a port of its own, and stops only that process. */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const http = require('http')
const path = require('path')
const { makeSandbox, hashTree, startServer } = require('./helpers.cjs')

// the owner's key cookie per server port: every request carries it unless a
// test sends its own Cookie header
const cookies = {}
function req(port, { method = 'GET', url = '/', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method, path: url, agent: false, headers: Object.assign({ Host: '127.0.0.1:' + port }, cookies[port] ? { Cookie: cookies[port] } : {}, headers) }, (res) => {
      let data = ''
      res.setEncoding('utf8')
      res.on('data', (c) => { data += c })
      res.on('end', () => {
        let json = null
        try { json = JSON.parse(data) } catch { /* not json */ }
        resolve({ status: res.statusCode, headers: res.headers, text: data, json })
      })
    })
    r.on('error', reject)
    if (body !== undefined) r.write(typeof body === 'string' ? body : JSON.stringify(body))
    r.end()
  })
}

async function setup(t, withCompany = true) {
  const sb = makeSandbox()
  if (withCompany) assert.equal(sb.cli('--company-init', '--seed', sb.seed()).code, 0)
  const { port, child, cookie, token } = await startServer(sb)
  cookies[port] = cookie
  t.after(() => { child.kill(); sb.cleanup() })
  const post = (body, extra = {}) => req(port, {
    method: 'POST', url: '/api/budget', body,
    headers: Object.assign({ Origin: 'http://127.0.0.1:' + port, 'Content-Type': 'application/json', 'X-Dashboard-Token': token }, extra),
  })
  return { sb, port, token, post }
}

test('api/company: 200 with an ETag, then 304 while nothing changed', async (t) => {
  const { sb, port } = await setup(t)
  const a = await req(port, { url: '/api/company' })
  assert.equal(a.status, 200)
  assert.equal(a.json.configured, true)
  assert.equal(a.json.offices.find((o) => o.id === 'engineering').name, 'Engineering')
  assert.ok(a.headers.etag)
  const b = await req(port, { url: '/api/company', headers: { 'If-None-Match': a.headers.etag } })
  assert.equal(b.status, 304)
  sb.cli('--budget', '{"scope":"company","budget":{"monthlyTokens":5},"by":"board"}')
  const c = await req(port, { url: '/api/company', headers: { 'If-None-Match': a.headers.etag } })
  assert.equal(c.status, 200, 'a change gives a new tag')
  assert.notEqual(c.headers.etag, a.headers.etag)
})

test('AT-12: api/budget refuses every request that is not this page\'s, and writes nothing', async (t) => {
  const { sb, port, post } = await setup(t)
  const before = hashTree(sb.root)
  const good = { scope: 'employee', id: 'tester', budget: { monthlyTokens: 500000 } }
  assert.equal((await post(good, { 'X-Dashboard-Token': 'wrong' })).status, 403)
  assert.equal((await post(good, { 'X-Dashboard-Token': '' })).status, 403)
  assert.equal((await post(good, { Origin: 'http://evil.example' })).status, 403)
  assert.equal((await post(good, { 'Sec-Fetch-Site': 'cross-site' })).status, 403)
  assert.equal((await post(good, { Host: 'attacker.test' })).status, 421)
  assert.equal((await post(good, { 'Content-Type': 'text/plain' })).status, 415)
  // the size guard answers 413 and cuts the connection, so the client may see the reset first
  const big = await post({ scope: 'office', id: 'studio', budget: { monthlyTokens: 1 }, pad: 'x'.repeat(20000) }).catch((e) => ({ status: e.code }))
  assert.ok(big.status === 413 || big.status === 'ECONNRESET' || big.status === 'EPIPE', 'got ' + big.status)
  assert.equal((await post({ scope: 'employee', id: '../../agents/x', budget: { monthlyTokens: 1 } })).status, 400)
  assert.equal((await post({ scope: 'employee', id: 'nobody', budget: { monthlyTokens: 1 } })).status, 404)
  assert.equal((await post({ scope: 'employee', id: 'tester', budget: { monthlyTokens: '1M' } })).status, 400)
  assert.equal((await post({ scope: 'secrets', id: 'x' })).status, 400)
  assert.equal((await post('{not json')).status, 400)
  assert.equal((await req(port, { url: '/api/budget' })).status, 405)
  assert.deepEqual(hashTree(sb.root), before, 'a refused request must not change any file')
})

test('api/budget from the page: saved, logged, and put in the supervisor\'s inbox', async (t) => {
  const { sb, post } = await setup(t)
  const r = await post({ scope: 'office', id: 'studio', budget: { monthlyTokens: '3000000', monthlyUsd: '40', softAlertPct: 75, hardStop: true } })
  assert.equal(r.status, 200, r.text)
  assert.equal(r.json.saved.scope, 'office')
  const studio = sb.read('company/offices.json').find((o) => o.id === 'studio')
  assert.deepEqual(studio.budget, { enabled: true, period: 'monthly', monthlyTokens: 3000000, monthlyUsd: 40, softAlertPct: 75, hardStop: true })
  assert.equal(sb.lines('company/activity.jsonl').filter((l) => l.action === 'budget.set' && l.via === 'dashboard').length, 1)
  const m = await post({ scope: 'master', enabled: false })
  assert.equal(m.status, 200)
  assert.equal(sb.read('company/company.json').budgetsEnabled, false)
  const inbox = sb.cli('--inbox')
  assert.match(inbox.out, /2 new items/)
  assert.match(inbox.out, /office studio budget/)
  assert.match(inbox.out, /budgets switched off/)
  const clear = await post({ scope: 'office', id: 'studio', budget: null })
  assert.equal(clear.status, 200)
  assert.equal(sb.read('company/offices.json').find((o) => o.id === 'studio').budget, null)
})

test('AT-18 on the server: newer company data refuses writes with 409', async (t) => {
  const { sb, post } = await setup(t)
  const c = sb.read('company/company.json')
  c.schemaVersion = 2
  fs.writeFileSync(path.join(sb.company, 'company.json'), JSON.stringify(c))
  const before = hashTree(sb.company)
  const r = await post({ scope: 'company', budget: { monthlyTokens: 5 } })
  assert.equal(r.status, 409)
  assert.match(r.json.error, /newer dashboard/)
  assert.deepEqual(hashTree(sb.company), before)
})

test('no company: the page is the single office, api/company says so, api/budget is refused', async (t) => {
  const { sb, port, post } = await setup(t, false)
  const page = await req(port, { url: '/' })
  assert.equal(page.status, 200)
  assert.match(page.text, /<title>Arsenale<\/title>/)
  assert.equal((await req(port, { url: '/api/company' })).json.configured, false)
  const r = await post({ scope: 'company', budget: { monthlyTokens: 5 } })
  assert.equal(r.status, 409)
  assert.equal(fs.existsSync(sb.company), false)
})

test('the gate rail still works: dismiss and answer from the page', async (t) => {
  const { sb, port, token } = await setup(t)
  const g1 = sb.cli('--gate', '{"project":"demo","kind":"C","question":"invented question?"}').out
  const g2 = sb.cli('--gate', '{"project":"demo","kind":"approval","question":"invented approval?"}').out
  const h = { Origin: 'http://127.0.0.1:' + port, 'Content-Type': 'application/json', 'X-Dashboard-Token': token }
  const d = await req(port, { method: 'POST', url: '/api/dismiss', headers: h, body: { gate: g1 } })
  assert.equal(d.status, 200, d.text)
  assert.equal(sb.read('agent-runs/gates/' + g1 + '.json').status, 'expired')
  const a = await req(port, { method: 'POST', url: '/api/answer', headers: h, body: { gate: g2, answer: 'approve' } })
  assert.equal(a.status, 200)
  assert.equal(sb.read('agent-runs/gates/' + g2 + '.json').answer, 'approve')
  assert.match(sb.cli('--answers').out, /2 new answers/)
  const page = await req(port, { url: '/?lang=fa' })
  assert.match(page.text, /<title>Arsenale<\/title>/)
  assert.match(page.text, /<html lang="fa" dir="rtl">/)
  assert.match(page.headers['set-cookie'].join(';'), /dash-lang=fa/)
})
