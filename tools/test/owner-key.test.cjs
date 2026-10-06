/* The owner's launch key (launch-key.cjs and the server): without the key
 * cookie nothing is served but the favicon and /mcp; a good key buys the
 * cookie once and leaves the address; a wrong one buys nothing; the key file
 * is the owner's alone. Each test starts its own server from a throwaway
 * data folder and stops only that process. Invented data. */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const http = require('http')
const path = require('path')
const { makeSandbox, SEED, startServer } = require('./helpers.cjs')

function req(port, { method = 'GET', url = '/', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method, path: url, agent: false, headers: Object.assign({ Host: '127.0.0.1:' + port }, headers) }, (res) => {
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

async function setup(t) {
  const sb = makeSandbox()
  assert.equal(sb.cli('--company-init', '--seed', sb.seed(SEED)).code, 0)
  const s = await startServer(sb, { portBase: 37000 })
  t.after(() => { s.child.kill(); sb.cleanup() })
  return Object.assign({ sb }, s)
}

test('no key cookie: every page, API read, deliverable and write answers 401; the favicon and /mcp keep their own rules', async (t) => {
  const { port, cookie, token } = await setup(t)
  for (const url of ['/', '/index.html', '/archive', '/archive?lang=fa', '/deliverables/dl-x', '/nothing']) {
    const r = await req(port, { url })
    assert.equal(r.status, 401, url)
    assert.match(r.headers['content-type'], /^text\/html/, url)
    assert.equal(r.headers['x-frame-options'], 'DENY')
    assert.equal(r.headers['content-security-policy'], "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
    assert.match(r.text, /arsenale open/)
    assert.match(r.text, /\p{Script=Arabic}/u, 'the Persian line is there too')
    assert.doesNotMatch(r.text, /<script/)
  }
  for (const url of ['/api/state', '/api/company', '/api/tasks', '/api/team', '/api/notify', '/api/connect', '/api/deliverables']) {
    const r = await req(port, { url })
    assert.equal(r.status, 401, url)
    assert.deepEqual(r.json, { error: 'key' }, url)
  }
  // a POST with everything else right still needs the cookie
  const post = { method: 'POST', url: '/api/budget', body: { scope: 'master', enabled: false }, headers: { Origin: 'http://127.0.0.1:' + port, 'Content-Type': 'application/json', 'X-Dashboard-Token': token } }
  const refused = await req(port, post)
  assert.equal(refused.status, 401)
  assert.deepEqual(refused.json, { error: 'key' })
  // a cookie for another port, or a made-up value, is no key
  const [name, value] = cookie.split('=')
  assert.equal((await req(port, { url: '/api/state', headers: { Cookie: 'arsenale-key-1=' + value } })).status, 401)
  assert.equal((await req(port, { url: '/api/state', headers: { Cookie: name + '=' + 'a'.repeat(64) } })).status, 401)
  assert.equal((await req(port, { url: '/favicon.ico' })).status, 204)
  // /mcp is off without ARSENALE_MCP_TOKEN: its own answer, not the key's
  const mcp = await req(port, { method: 'POST', url: '/mcp', body: '{}', headers: { 'Content-Type': 'application/json' } })
  assert.equal(mcp.status, 404)
  assert.match(mcp.json.error, /MCP over HTTP is off/)
  // with the key cookie the same requests go through
  assert.equal((await req(port, { url: '/', headers: { Cookie: cookie } })).status, 200)
  assert.equal((await req(port, { url: '/api/state', headers: { Cookie: 'dash-lang=fa; ' + cookie } })).status, 200)
  assert.equal((await req(port, Object.assign({}, post, { headers: Object.assign({ Cookie: cookie }, post.headers) }))).status, 200)
})

test('/api/token is gone, even with the key cookie', async (t) => {
  const { port, cookie } = await setup(t)
  const r = await req(port, { url: '/api/token', headers: { Cookie: cookie } })
  assert.equal(r.status, 404)
  assert.doesNotMatch(r.text, /token/)
})

test('a wrong key buys no cookie; the right one a strict, port-named cookie and a redirect without the key', async (t) => {
  const { port, key } = await setup(t)
  for (const k of ['f'.repeat(64), key.slice(0, 63), key + '0', '']) {
    const r = await req(port, { url: '/?k=' + k })
    assert.equal(r.status, 401, k)
    assert.ok(!(r.headers['set-cookie'] || []).some((c) => c.startsWith('arsenale-key-')), 'no key cookie for ' + k)
  }
  const ok = await req(port, { url: '/archive?lang=fa&k=' + key })
  assert.equal(ok.status, 302)
  assert.equal(ok.headers.location, '/archive?lang=fa', 'other parameters stay, the key goes')
  assert.equal(ok.headers['cache-control'], 'no-store')
  assert.equal(ok.headers['referrer-policy'], 'no-referrer')
  const set = ok.headers['set-cookie'].find((c) => c.startsWith('arsenale-key-'))
  assert.match(set, new RegExp('^arsenale-key-' + port + '=[a-f0-9]{64}; '))
  assert.match(set, /; HttpOnly(;|$)/)
  assert.match(set, /; SameSite=Strict(;|$)/)
  assert.match(set, /; Path=\/(;|$)/)
  assert.ok(!set.includes(key), 'the cookie is not the key itself')
  assert.equal((await req(port, { url: '/?k=' + key })).headers.location, '/')
})

test('the key outlives a restart: the same cookie value and page token from a new server process', async (t) => {
  const sb = makeSandbox()
  t.after(() => sb.cleanup())
  const a = await startServer(sb, { portBase: 37000 })
  a.child.kill()
  const b = await startServer(sb, { portBase: 40000 })
  t.after(() => b.child.kill())
  assert.equal(b.key, a.key)
  assert.equal(b.token, a.token)
  assert.equal(b.cookie.split('=')[1], a.cookie.split('=')[1])
  assert.equal(fs.readFileSync(path.join(sb.root, 'launch-key'), 'utf8').trim(), a.key)
  // the page carries the derived token, never the key
  const page = await req(b.port, { url: '/', headers: { Cookie: b.cookie } })
  assert.ok(page.text.includes(b.token))
  assert.ok(!page.text.includes(b.key))
})

test('the key file is the owner\'s only (mode 0600), and a wider one is narrowed', { skip: process.platform === 'win32' ? 'POSIX file modes' : false }, (t) => {
  const sb = makeSandbox()
  t.after(() => sb.cleanup())
  const LK = sb.mod('launch-key.cjs')
  const first = LK.ensure()
  assert.equal(first.created, true)
  assert.equal(fs.statSync(first.file).mode & 0o777, 0o600)
  fs.chmodSync(first.file, 0o644)
  const again = LK.ensure()
  assert.equal(again.created, false)
  assert.equal(again.key, first.key)
  assert.equal(fs.statSync(first.file).mode & 0o777, 0o600)
})

test('a broken key file is replaced by a new key', (t) => {
  const sb = makeSandbox()
  t.after(() => sb.cleanup())
  const LK = sb.mod('launch-key.cjs')
  fs.writeFileSync(LK.FILE, '')
  const k = LK.ensure()
  assert.equal(k.created, true)
  assert.match(k.key, /^[a-f0-9]{64}$/)
  assert.equal(LK.readKey(), k.key)
})
