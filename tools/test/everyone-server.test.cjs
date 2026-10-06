/* The 1.0 endpoints of agent-dashboard-server.cjs: every write is the
 * board's and needs the page's Origin and token; MCP over HTTP needs its
 * bearer token and checks Host and Origin; stored deliverables are served
 * sandboxed. Each test starts its own server on its own port, from a
 * throwaway data folder, and stops only that process. Invented data. */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const http = require('http')
const path = require('path')
const { makeSandbox, hashTree, SEED, startServer } = require('./helpers.cjs')

const TOKEN = 'mcp-test-token-' + 'x'.repeat(40)

// the owner's key cookie per server port: every request carries it unless a
// test sends its own Cookie header
const cookies = {}
function req(port, { method = 'GET', url = '/', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method, path: url, agent: false, headers: Object.assign({ Host: '127.0.0.1:' + port }, cookies[port] ? { Cookie: cookies[port] } : {}, headers) }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        const buf = Buffer.concat(chunks)
        let json = null
        try { json = JSON.parse(buf.toString('utf8')) } catch { /* not json */ }
        resolve({ status: res.statusCode, headers: res.headers, text: buf.toString('utf8'), buf, json })
      })
    })
    r.on('error', reject)
    if (body !== undefined) r.write(typeof body === 'string' ? body : JSON.stringify(body))
    r.end()
  })
}
async function setup(t, opts) {
  const sb = makeSandbox(opts)
  if (!opts || opts.company !== false) assert.equal(sb.cli('--company-init', '--seed', sb.seed(Object.assign({}, SEED, { company: { name: 'Bluefin Bakery', issuePrefix: 'BLU' } }))).code, 0)
  const { port, child, cookie, token } = await startServer(sb, { env: opts && opts.env })
  cookies[port] = cookie
  t.after(() => { child.kill(); sb.cleanup() })
  const post = (url, body, extra = {}) => req(port, { method: 'POST', url, body, headers: Object.assign({ Origin: 'http://127.0.0.1:' + port, 'Content-Type': 'application/json', 'X-Dashboard-Token': token }, extra) })
  return { sb, port, token, post }
}

test('T-5.5: the new write endpoints refuse a request without the page token or Origin, and write nothing', async (t) => {
  const { sb, port, post } = await setup(t)
  const before = hashTree(sb.root)
  const hire = { id: 'newsletter-nora', name: 'Nora', officeId: 'studio', description: 'Writes the weekly newsletter' }
  for (const url of ['/api/team-member', '/api/task', '/api/policy', '/api/pack', '/api/onboard', '/api/connect-apply', '/api/hire-decision', '/api/notify', '/api/task-comment']) {
    const noToken = await req(port, { method: 'POST', url, body: hire, headers: { Origin: 'http://127.0.0.1:' + port, 'Content-Type': 'application/json' } })
    assert.equal(noToken.status, 403, url)
    const other = await post(url, hire, { Origin: 'https://evil.example' })
    assert.equal(other.status, 403, url)
    const site = await post(url, hire, { 'Sec-Fetch-Site': 'cross-site' })
    assert.equal(site.status, 403, url)
  }
  assert.deepEqual(hashTree(sb.root), before)
  assert.equal(fs.existsSync(path.join(sb.agents, 'newsletter-nora.md')), false)
  // from the page itself the hire goes through
  const ok = await post('/api/team-member', hire)
  assert.equal(ok.status, 200, ok.text)
  assert.ok(fs.existsSync(path.join(sb.agents, 'newsletter-nora.md')))
  // the hire form allows 32 KB; other writes keep 8 KB
  const big = await post('/api/team-member', Object.assign({}, hire, { id: 'big-one', instructions: 'x'.repeat(20000) }))
  assert.equal(big.status, 400, 'a 20 KB body is read, then refused by the 8000-character rule')
  assert.match(big.json.error, /8000/)
  assert.equal((await post('/api/policy', { category: 'payment', value: 'ask', pad: 'x'.repeat(9000) })).status, 413)
})

test('tasks from the page: create, comment, read back; the assistant sees them; a bad link says why', async (t) => {
  const { sb, port, post } = await setup(t)
  const c = await post('/api/task', { title: 'Write the Christmas opening hours post', assignee: 'ui-designer', dueDate: '2026-12-01', links: [{ url: 'https://example.org/hours' }], needsSignOff: true })
  assert.equal(c.status, 200, c.text)
  assert.equal(c.json.result.id, 'BLU-1')
  assert.equal((await post('/api/task-comment', { id: 'BLU-1', text: 'Use the winter photo' })).status, 200)
  const list = await req(port, { url: '/api/tasks' })
  assert.equal(list.json.tasks[0].comments, 1)
  const one = await req(port, { url: '/api/task?id=BLU-1' })
  assert.equal(one.json.comments[0].by, 'board')
  const bad = await post('/api/task', { title: 'x', links: [{ url: 'javascript:alert(1)' }] })
  assert.equal(bad.status, 400)
  assert.equal(bad.json.error, "Links must start with https:// or http://; for a file, use 'add file path'")
  const up = await post('/api/task', { op: 'update', id: 'BLU-1', status: 'cancelled' })
  assert.equal(up.json.result.status, 'cancelled')
  assert.ok(sb.lines('company/inbox.jsonl').some((l) => l.type === 'comment.added'))
})

test('T-1.5: MCP over HTTP: off without a token; Host 421, Origin 403, token 401; then a full session', async (t) => {
  const off = await setup(t)
  assert.equal((await req(off.port, { method: 'POST', url: '/mcp', body: '{}', headers: { 'Content-Type': 'application/json' } })).status, 404)
  const { port } = await setup(t, { env: { ARSENALE_MCP_TOKEN: TOKEN } })
  const init = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', clientInfo: { name: 'Url Client', version: '1' } } }
  const h = (extra) => Object.assign({ 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, extra || {})
  assert.equal((await req(port, { method: 'POST', url: '/mcp', body: init, headers: h({ Origin: 'https://evil.example', Authorization: 'Bearer ' + TOKEN }) })).status, 403)
  assert.equal((await req(port, { method: 'POST', url: '/mcp', body: init, headers: h() })).status, 401)
  assert.equal((await req(port, { method: 'POST', url: '/mcp', body: init, headers: h({ Authorization: 'Bearer wrong' }) })).status, 401)
  assert.equal((await req(port, { method: 'POST', url: '/mcp', body: init, headers: h({ Host: 'attacker.example:' + port, Authorization: 'Bearer ' + TOKEN }) })).status, 421)
  const ok = await req(port, { method: 'POST', url: '/mcp', body: init, headers: h({ Authorization: 'Bearer ' + TOKEN }) })
  assert.equal(ok.status, 200)
  const sid = ok.headers['mcp-session-id']
  assert.match(sid, /^[a-f0-9]{32}$/)
  assert.equal(ok.json.result.serverInfo.name, 'arsenale')
  const auth = h({ Authorization: 'Bearer ' + TOKEN, 'Mcp-Session-Id': sid })
  assert.equal((await req(port, { method: 'POST', url: '/mcp', body: { jsonrpc: '2.0', method: 'notifications/initialized' }, headers: auth })).status, 202)
  const hello = await req(port, { method: 'POST', url: '/mcp', body: { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'hello', arguments: {} } }, headers: auth })
  assert.equal(hello.json.result.structuredContent.company, 'Bluefin Bakery')
  assert.equal((await req(port, { method: 'POST', url: '/mcp', body: { jsonrpc: '2.0', id: 3, method: 'ping' }, headers: h({ Authorization: 'Bearer ' + TOKEN }) })).status, 400, 'no session header')
  assert.equal((await req(port, { method: 'POST', url: '/mcp', body: { jsonrpc: '2.0', id: 3, method: 'ping' }, headers: h({ Authorization: 'Bearer ' + TOKEN, 'Mcp-Session-Id': 'f'.repeat(32) }) })).status, 404, 'unknown session')
  assert.equal((await req(port, { method: 'GET', url: '/mcp', headers: { Authorization: 'Bearer ' + TOKEN } })).status, 405, 'no event stream')
  const big = await req(port, { method: 'POST', url: '/mcp', body: { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'log_step', arguments: { job_id: 'x', doing: 'y'.repeat(70000) } } }, headers: auth })
  assert.equal(big.status, 413)
  // more than 20 calls in a second: 429
  const many = await Promise.all(Array.from({ length: 30 }, (_, i) => req(port, { method: 'POST', url: '/mcp', body: { jsonrpc: '2.0', id: 10 + i, method: 'ping' }, headers: auth })))
  assert.ok(many.some((r) => r.status === 429))
  await new Promise((r) => setTimeout(r, 1100)) // past the one-second window
  assert.equal((await req(port, { method: 'DELETE', url: '/mcp', headers: auth })).status, 204)
})

test('T-7.3: a stored image is served with its type, nosniff and a sandbox CSP; the page may show it, nothing else', async (t) => {
  const { sb, port } = await setup(t)
  const D = sb.mod('deliverables.cjs')
  const L = sb.mod('runlog.cjs')
  const png = fs.readFileSync(path.join(__dirname, 'fixtures', 'tiny.png'))
  const d = D.addDeliverable({ title: 'Flyer draft A', kind: 'image', mime: 'image/png', content: png.toString('base64') }, L.actorFor('mcp', 'supervisor'))
  const r = await req(port, { url: '/deliverables/' + d.id })
  assert.equal(r.status, 200)
  assert.equal(r.headers['content-type'], 'image/png')
  assert.equal(r.headers['x-content-type-options'], 'nosniff')
  assert.equal(r.headers['content-security-policy'], "sandbox; default-src 'none'")
  assert.match(r.headers['content-disposition'], /^inline/)
  assert.deepEqual(r.buf, png)
  assert.equal((await req(port, { url: '/deliverables/dl-nope' })).status, 404)
  assert.equal((await req(port, { url: '/deliverables/..%2F..%2Fconfig.json' })).status, 404)
  const page = await req(port, { url: '/' })
  assert.match(page.headers['content-security-policy'], new RegExp("img-src data: http://localhost:" + port + "/deliverables/ http://127.0.0.1:" + port + "/deliverables/;"))
  const list = await req(port, { url: '/api/deliverables' })
  assert.equal(list.json.deliverables[0].image, true)
})

test('read endpoints: team with the safety rules, packs, connect cards, the wizard status', async (t) => {
  const { port } = await setup(t, { packs: true })
  const team = await req(port, { url: '/api/team' })
  assert.ok(team.json.members.some((m) => m.id === 'tester' && m.policy.payment.value === 'ask'))
  const packs = await req(port, { url: '/api/packs' })
  assert.equal(packs.json.packs.length, 7)
  const conn = await req(port, { url: '/api/connect' })
  assert.deepEqual(conn.json.cards.map((c) => c.id), ['claude-desktop', 'claude-code', 'cursor', 'vscode', 'codex', 'gemini', 'other', 'chatgpt'])
  assert.equal(conn.json.http.on, false)
  const ob = await req(port, { url: '/api/onboard' })
  assert.equal(ob.json.hasCompany, true)
  assert.equal(ob.json.wizard, false)
})
