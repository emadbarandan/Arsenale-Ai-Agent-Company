/* The small security fixes after the 1.0 review: Telegram pairing by a
 * one-time deep link bound to one person; phone buttons only where the
 * safety rules allow them; "Connect your assistant" keeping the file's mode,
 * following links and showing only its own entry; deliverable paths that do
 * not tell what exists; ids that keep their letters; the MCP flood caps; and
 * the leftovers of a pack update and of a failed Create. Each test works in
 * a throwaway data folder. All names, keys and data are invented. */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const http = require('http')
const path = require('path')
const { spawnSync } = require('child_process')
const { makeSandbox, hashTree, SEED, mcpClient, startServer } = require('./helpers.cjs')

const BAKERY = Object.assign({}, SEED, { company: { name: 'Bluefin Bakery', issuePrefix: 'BLU' } })
function setup(t, opts) {
  const sb = makeSandbox(opts)
  if (!opts || opts.company !== false) assert.equal(sb.cli('--company-init', '--seed', sb.seed(BAKERY)).code, 0)
  t.after(() => sb.cleanup())
  const L = sb.mod('runlog.cjs')
  return { sb, L, board: L.actorFor('dashboard', 'board'), sup: L.actorFor('mcp', 'supervisor', { clientId: 'test-client' }) }
}
const gateOf = (sb, id) => sb.read('agent-runs/gates/' + id + '.json')

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------- Telegram pairing (L2)
test('Telegram pairs through a one-time deep link from a private chat; 5 wrong tokens close the window; only the paired person counts', async (t) => {
  const { sb, board } = setup(t)
  process.env.ARSENALE_TELEGRAM_TOKEN = '123456:invented-bot-token'
  t.after(() => { delete process.env.ARSENALE_TELEGRAM_TOKEN })
  const N = sb.mod('notify.cjs')
  const realRequest = N.request
  t.after(() => { N.request = realRequest })
  N.request = async () => ({ status: 200, text: JSON.stringify({ ok: true, result: { username: 'bluefin_bakery_bot' } }) })
  let st = (await N.configure({ channel: 'telegram', op: 'pair' }, board)).telegram
  assert.equal(st.paired, false)
  assert.equal(st.pairedName, '')
  assert.ok(!('pairCode' in st))
  const m = /^https:\/\/t\.me\/bluefin_bakery_bot\?start=([a-f0-9]{32})$/.exec(st.pairLink)
  assert.ok(m, st.pairLink)
  const token = m[1]
  assert.equal(st.pairCommand, '/start ' + token)
  const left = Date.parse(st.pairExpiresAt) - Date.now()
  assert.ok(left > 9 * 60000 && left <= 10 * 60000, 'ten minutes')
  assert.ok(!JSON.stringify(N.publicState()).includes('invented-bot-token'), 'never the bot token')
  const owner = { id: 7001, username: 'bluefin_owner', first_name: 'Owner' }
  const msg = (text, chat, from) => ({ update_id: 1, message: { text, chat, from } })
  // the right token in a group: no pairing, and it is not a guess either
  assert.equal(N.telegramUpdate(msg('/start ' + token, { id: -500, type: 'group' }, owner)), null)
  assert.equal(N.publicState().telegram.paired, false)
  // four wrong tokens: still open; the fifth closes the window
  for (let i = 0; i < 4; i++) assert.equal(N.telegramUpdate(msg('/start ' + 'a'.repeat(32), { id: 900 + i, type: 'private' }, { id: 900 + i })), null)
  assert.notEqual(N.publicState().telegram.pairLink, '')
  assert.equal(N.telegramUpdate(msg('/start 123456', { id: 999, type: 'private' }, { id: 999 })), null)
  st = N.publicState().telegram
  assert.deepEqual([st.pairLink, st.pairCommand, st.pairExpiresAt], ['', '', ''])
  assert.equal(N.telegramUpdate(msg('/start ' + token, { id: 7001, type: 'private' }, owner)), null, 'the window is closed')
  assert.equal(N.publicState().telegram.paired, false)
  assert.ok(N.readConfig().telegram.invalidToday >= 5, 'wrong tokens are counted')
  // getMe failed: no link, but the command to send the bot
  N.request = async () => { throw new Error('offline') }
  st = (await N.configure({ channel: 'telegram', op: 'pair' }, board)).telegram
  assert.equal(st.pairLink, '')
  const token2 = /^\/start ([a-f0-9]{32})$/.exec(st.pairCommand)[1]
  const ok = N.telegramUpdate(msg('/start ' + token2, { id: 7001, type: 'private' }, owner))
  assert.equal(ok.chatId, 7001)
  st = N.publicState().telegram
  assert.deepEqual([st.paired, st.pairedName, st.pairLink], [true, '@bluefin_owner', ''])
  // single use: the same link again changes nothing
  const c = N.readConfig()
  assert.equal(c.telegram.pair, null)
  assert.equal(N.telegramUpdate(msg('/start ' + token2, { id: 8002, type: 'private' }, { id: 8002 })), null)
  assert.equal(N.readConfig().telegram.chatId, '7001')
  // a tap counts only from that person in that chat
  const tap = (chat, from) => N.telegramUpdate({ update_id: 2, callback_query: { id: 'q', data: 'junk', from: { id: from }, message: { chat: { id: chat } } } })
  const before = N.readConfig().telegram.invalidToday
  assert.equal(tap(7001, 8002), null, 'another person in the paired chat')
  assert.equal(tap(-500, 7001), null, 'the owner in another chat')
  assert.equal(N.readConfig().telegram.invalidToday, before + 2)
  assert.deepEqual(tap(7001, 7001), { callbackId: 'q' }, 'the owner gets as far as the format check')
})

test('Telegram: an expired pairing window pairs nobody', async (t) => {
  const { sb, board } = setup(t)
  process.env.ARSENALE_TELEGRAM_TOKEN = '123456:invented-bot-token'
  t.after(() => { delete process.env.ARSENALE_TELEGRAM_TOKEN })
  const N = sb.mod('notify.cjs')
  const realRequest = N.request
  t.after(() => { N.request = realRequest })
  N.request = async () => { throw new Error('offline') }
  const token = /([a-f0-9]{32})$/.exec((await N.configure({ channel: 'telegram', op: 'pair' }, board)).telegram.pairCommand)[1]
  const c = N.readConfig(); c.telegram.pair.until = Date.now() - 1; N.saveConfig(c)
  assert.equal(N.telegramUpdate({ update_id: 1, message: { text: '/start ' + token, chat: { id: 7001, type: 'private' }, from: { id: 7001 } } }), null)
  assert.equal(N.publicState().telegram.paired, false)
})

// ---------- phone buttons (L3)
test('phone buttons: action approvals the rules allow and choice questions only; never a hire, a bare approval or a payment', (t) => {
  const { sb, L, board, sup } = setup(t)
  process.env.ARSENALE_PHONE_KEY = 'k'.repeat(40)
  t.after(() => { delete process.env.ARSENALE_PHONE_KEY })
  const N = sb.mod('notify.cjs')
  const Po = sb.mod('policy.cjs')
  N.rotate()
  const c = N.readConfig(); c.ntfy.details = true; N.saveConfig(c)
  const buttons = (g) => N.message(g, 'ntfy').buttons.length
  // a bare approval can say anything: no buttons
  const bare = L.gate({ question: 'Approve paying invoice 1042, 4,800 EUR?', kind: 'approval' }, sup)
  assert.equal(buttons(bare), 0)
  assert.match(N.message(bare, 'ntfy').text, /Open Arsenale to answer/)
  // a hire proposal: its Approve must hire, which only the dashboard does
  const hire = sb.mod('team.cjs').propose({ name: 'Nora', title: 'Newsletter writer', office_id: 'studio', description: 'Writes the weekly newsletter', instructions: 'Write the weekly newsletter from the notes.', why: 'Nobody writes it now' }, sup)
  const hg = gateOf(sb, hire.question_id)
  assert.equal(hg.approvalType, 'hire')
  assert.equal(buttons(hg), 0)
  // a forged-looking tap on it is still refused, and the proposal waits
  assert.equal(N.accept(N.sign(hg, 'approve'), 'ntfy').reason, 'not-eligible')
  assert.equal(gateOf(sb, hire.question_id).status, 'waiting')
  // an action approval in a category the phone may approve: buttons; off in the rules: none
  const act = gateOf(sb, Po.checkAction({ team_member: 'copywriter', category: 'post.public', summary: 'post the autumn menu' }, sup).question_id)
  assert.equal(buttons(act), 2)
  Po.setPolicy({ category: 'post.public', phoneAllowed: false }, board)
  assert.equal(buttons(act), 0)
  // a payment never
  const pay = gateOf(sb, Po.checkAction({ team_member: 'copywriter', category: 'payment', summary: 'pay the flour bill' }, sup).question_id)
  assert.equal(buttons(pay), 0)
  assert.match(N.message(pay, 'ntfy').text, /approve payments/)
  // a choice question: one button per choice
  assert.equal(buttons(L.gate({ question: 'Which flour?', kind: 'B', choices: ['Rye', 'Spelt', 'Wheat'] }, sup)), 3)
})

// ---------- connect your assistant (L4)
function fakeHome(t, sb) {
  const home = path.join(sb.base, 'home')
  fs.mkdirSync(home)
  const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE, CODEX_HOME: process.env.CODEX_HOME }
  process.env.HOME = home; process.env.USERPROFILE = home; delete process.env.CODEX_HOME
  t.after(() => { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v } })
  assert.equal(os.homedir(), home)
  return home
}
const OTHER = { mcpServers: { weather: { command: 'weather-mcp', env: { WEATHER_API_KEY: 'sk-invented-0000-1111' } }, arsenale: { command: 'old', args: [], env: { NOTE: 'invented-env-value' }, apiToken: 'invented-token-value' } } }

test('connect: the preview shows only the arsenale entry, masked; the file keeps the other servers', (t) => {
  const { sb, board } = setup(t)
  const home = fakeHome(t, sb)
  const C = sb.mod('connect.cjs')
  const file = path.join(home, '.cursor', 'mcp.json')
  fs.mkdirSync(path.dirname(file))
  fs.writeFileSync(file, JSON.stringify(OTHER, null, 2))
  const pv = C.preview('cursor')
  assert.deepEqual(Object.keys(pv).sort(), ['after', 'before', 'client', 'file', 'hash', 'unchanged'])
  for (const s of [pv.before, pv.after]) {
    assert.ok(!s.includes('sk-invented'), 'another server\'s key never reaches the page')
    assert.ok(!s.includes('weather'), 'nor its name')
    assert.ok(!s.includes('invented-env-value') && !s.includes('invented-token-value'), 'env and secret-named values are masked')
  }
  assert.deepEqual(JSON.parse(pv.before).mcpServers.arsenale.env, { NOTE: '••••' })
  assert.equal(JSON.parse(pv.after).mcpServers.arsenale.args.slice(-1)[0], 'mcp')
  const r = C.apply('cursor', pv.hash, board)
  assert.equal(r.written, true)
  const written = JSON.parse(fs.readFileSync(file, 'utf8'))
  assert.deepEqual(written.mcpServers.weather, OTHER.mcpServers.weather)
  // the hash still binds to the whole file: a change elsewhere in it is seen
  const pv2 = C.preview('cursor')
  assert.equal(pv2.unchanged, true)
  written.mcpServers.weather.env.WEATHER_API_KEY = 'sk-invented-2222'
  fs.writeFileSync(file, JSON.stringify(written))
  assert.throws(() => C.apply('cursor', pv2.hash, board), /changed since you looked/)
})

test('connect: the file keeps its mode (0600 stays 0600)', { skip: process.platform === 'win32' ? 'POSIX file modes' : false }, (t) => {
  const { sb, board } = setup(t)
  const home = fakeHome(t, sb)
  const C = sb.mod('connect.cjs')
  const file = path.join(home, '.cursor', 'mcp.json')
  fs.mkdirSync(path.dirname(file))
  fs.writeFileSync(file, JSON.stringify(OTHER))
  fs.chmodSync(file, 0o600)
  C.apply('cursor', C.preview('cursor').hash, board)
  assert.equal(fs.statSync(file).mode & 0o777, 0o600)
})

test('connect: a linked settings file is written through the link; a link out of the home folder is refused', (t) => {
  const { sb, board } = setup(t)
  const home = fakeHome(t, sb)
  const C = sb.mod('connect.cjs')
  const real = path.join(home, 'dotfiles', 'cursor-mcp.json')
  fs.mkdirSync(path.dirname(real))
  fs.writeFileSync(real, JSON.stringify({ mcpServers: {} }))
  const link = path.join(home, '.cursor', 'mcp.json')
  fs.mkdirSync(path.dirname(link))
  try { fs.symlinkSync(real, link, 'file') } catch (e) { t.skip('symlinks cannot be made here: ' + e.code); return }
  C.apply('cursor', C.preview('cursor').hash, board)
  assert.ok(fs.lstatSync(link).isSymbolicLink(), 'the link stays a link')
  assert.ok(JSON.parse(fs.readFileSync(real, 'utf8')).mcpServers.arsenale, 'the real file got the entry')
  // a link that leads out of the home folder
  const outside = path.join(sb.base, 'outside.json')
  fs.writeFileSync(outside, '{}')
  fs.rmSync(link)
  fs.symlinkSync(outside, link, 'file')
  assert.throws(() => C.preview('cursor'), /outside your home folder/)
  assert.equal(fs.readFileSync(outside, 'utf8'), '{}')
})

test('connect: a TOML file that ends inside a multi-line string is not appended to', (t) => {
  const { sb } = setup(t)
  const home = fakeHome(t, sb)
  const C = sb.mod('connect.cjs')
  const file = path.join(home, '.codex', 'config.toml')
  fs.mkdirSync(path.dirname(file))
  fs.writeFileSync(file, 'model = "x"\nnotes = """\nan invented note that never ends\n')
  assert.throws(() => C.preview('codex'), /multi-line string/)
  fs.writeFileSync(file, "model = 'x'\nnotes = '''\nclosed\n'''\n[mcp_servers.weather]\ncommand = \"weather-mcp\"\napi_key = \"sk-invented-3333\"\n")
  const pv = C.preview('codex')
  assert.equal(pv.before, '')
  assert.match(pv.after, /^\[mcp_servers\.arsenale\]\ncommand = /)
  assert.ok(!pv.after.includes('sk-invented') && !pv.after.includes('weather'))
})

// ---------- deliverable paths (L5)
test('deliverables: a missing file and one outside the folders get the same reason; a hard link is refused', (t) => {
  const { sb, sup } = setup(t)
  const D = sb.mod('deliverables.cjs')
  const ws = path.join(sb.root, 'workspace')
  fs.mkdirSync(ws)
  const outside = path.join(sb.base, 'outside.txt')
  fs.writeFileSync(outside, 'hello')
  const there = D.addDeliverable({ title: 'out', kind: 'file', path: outside }, sup).reason
  const gone = D.addDeliverable({ title: 'gone', kind: 'file', path: path.join(sb.base, 'never-made.txt') }, sup).reason
  const goneInside = D.addDeliverable({ title: 'gone inside', kind: 'file', path: path.join(ws, 'never-made.txt') }, sup).reason
  assert.equal(there, 'outside your deliverable folders')
  assert.equal(gone, there, 'a client cannot tell a missing file from a present one')
  assert.equal(goneInside, there)
  // a hard link inside a folder can point at any file of the same disk
  const notes = path.join(ws, 'notes.txt')
  fs.writeFileSync(notes, 'invented notes')
  try { fs.linkSync(outside, path.join(ws, 'linked.txt')) } catch (e) { t.skip('hard links cannot be made here: ' + e.code); return }
  assert.equal(D.addDeliverable({ title: 'linked', kind: 'file', path: path.join(ws, 'linked.txt') }, sup).reason, 'a hard link to another file')
  assert.equal(D.addDeliverable({ title: 'notes', kind: 'file', path: notes }, sup).state, 'stored', 'a plain file is still copied')
})

test('deliverables: a Windows short name does not hide a protected file', { skip: process.platform !== 'win32' ? 'Windows short names' : false }, (t) => {
  const { sb, sup } = setup(t)
  const D = sb.mod('deliverables.cjs')
  const ws = path.join(sb.root, 'workspace')
  fs.mkdirSync(ws)
  const secret = path.join(ws, '.env.invented-notes.txt')
  fs.writeFileSync(secret, 'API_KEY=invented')
  // cmd's own quoting: the whole line in quotes, passed as it is
  const r = spawnSync('cmd', ['/d', '/s', '/c', '"for %I in ("' + secret + '") do @echo %~sI"'], { encoding: 'utf8', windowsHide: true, windowsVerbatimArguments: true })
  const short = String(r.stdout || '').trim()
  if (!short || path.basename(short).toLowerCase() === path.basename(secret).toLowerCase()) { t.skip('this volume makes no short names'); return }
  const d = D.addDeliverable({ title: 'env', kind: 'file', path: short }, sup)
  assert.equal(d.reason, 'protected file')
  assert.equal(d.state, 'link-only')
})

test('deliverables: the store has a hard cap; past it nothing more is stored', (t) => {
  const { sb, sup } = setup(t)
  const D = sb.mod('deliverables.cjs')
  D.addDeliverable({ title: 'first', kind: 'text', content: 'invented first text' }, sup)
  D.LIMITS.store = D.storeSize().bytes + 5
  assert.throws(() => D.addDeliverable({ title: 'second', kind: 'text', content: 'invented second text' }, sup), (e) => e.code === 413 && e.message === D.STORE_FULL)
  // the same content again needs no new space
  assert.equal(D.addDeliverable({ title: 'again', kind: 'text', content: 'invented first text' }, sup).state, 'stored')
  const ws = path.join(sb.root, 'workspace')
  fs.mkdirSync(ws)
  fs.writeFileSync(path.join(ws, 'big.txt'), 'invented text that does not fit')
  const p = D.addDeliverable({ title: 'big', kind: 'file', path: path.join(ws, 'big.txt') }, sup)
  assert.deepEqual([p.state, p.reason], ['link-only', D.STORE_FULL])
})

// ---------- ids keep their letters (L6)
test('an action approval keeps its member id', (t) => {
  const { sb, sup } = setup(t)
  const q = sb.mod('policy.cjs').checkAction({ team_member: 'social-media-planner', category: 'post.public', summary: 'post the autumn menu' }, sup)
  assert.equal(gateOf(sb, q.question_id).action.member, 'social-media-planner')
})

test('POST api/answer "approve" on a waiting hire proposal hires', async (t) => {
  const { sb, sup } = setup(t)
  const hire = sb.mod('team.cjs').propose({ name: 'Nora', title: 'Newsletter writer', office_id: 'studio', description: 'Writes the weekly newsletter', instructions: 'Write the weekly newsletter from the notes.', why: 'Nobody writes it now' }, sup)
  const s = await startServer(sb, { portBase: 34000 })
  t.after(() => s.child.kill())
  const r = await req(s.port, { method: 'POST', url: '/api/answer', body: { gate: hire.question_id, answer: 'approve' }, headers: { Cookie: s.cookie, Origin: 'http://127.0.0.1:' + s.port, 'Content-Type': 'application/json', 'X-Dashboard-Token': s.token } })
  assert.equal(r.status, 200, r.text)
  assert.ok(fs.existsSync(path.join(sb.agents, hire.id + '.md')), 'the member file is written')
  assert.equal(gateOf(sb, hire.question_id).status, 'answered')
})

// ---------- MCP flood caps (L7)
test('MCP over stdio: a batch holds at most 20 messages; unknown tools leave at most 10 lines a minute and one summary', async (t) => {
  const { sb } = setup(t)
  const c = mcpClient(sb, 'Flood Client')
  t.after(() => c.close())
  await c.init()
  const batch = (n) => new Promise((resolve) => {
    const seen = c.raw.length
    c.send(JSON.stringify(Array.from({ length: n }, (_, i) => ({ jsonrpc: '2.0', id: 1000 + n * 100 + i, method: 'ping' }))))
    const tick = setInterval(() => { if (c.raw.length > seen) { clearInterval(tick); resolve(c.raw[c.raw.length - 1]) } }, 20)
  })
  const big = await batch(21)
  assert.equal(big.error.code, -32600)
  assert.match(big.error.message, /at most 20/)
  const fine = await batch(20)
  assert.equal(fine.length, 20)
  for (let i = 0; i < 15; i++) assert.equal((await c.call('approve_everything_' + i, {})).error, true)
  const lines = sb.lines('company/activity.jsonl').filter((l) => l.action === 'mcp.refused')
  assert.equal(lines.length, 11)
  assert.equal(lines.filter((l) => l.entityId === 'many').length, 1)
  assert.match(lines[10].summary, /not listed/)
})

test('MCP: start_job is capped per client while jobs stay open', (t) => {
  const { sb } = setup(t, { company: false })
  const M = sb.mod('mcp-server.cjs')
  const s = M.createSession({ transport: 'stdio' })
  s.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', clientInfo: { name: 'Busy Client' } } })
  const start = (i) => s.handle({ jsonrpc: '2.0', id: 10 + i, method: 'tools/call', params: { name: 'start_job', arguments: { team_member: 'tester', task: 'invented job ' + i } } }).result
  for (let i = 0; i < 50; i++) assert.equal(start(i).isError, undefined, 'job ' + i)
  const over = start(50)
  assert.equal(over.isError, true)
  assert.match(over.content[0].text, /50 jobs open already/)
  // another client has its own count
  const other = M.createSession({ transport: 'stdio' })
  other.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', clientInfo: { name: 'Calm Client' } } })
  assert.equal(other.handle({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'start_job', arguments: { team_member: 'tester', task: 'invented' } } }).result.isError, undefined)
})

test('MCP over HTTP: every batch message counts toward 20 a second; at most 32 sessions, the least recently used goes first', async (t) => {
  const TOKEN = 'mcp-test-token-' + 'y'.repeat(40)
  const { sb } = setup(t)
  const s = await startServer(sb, { portBase: 34000, env: { ARSENALE_MCP_TOKEN: TOKEN } })
  t.after(() => s.child.kill())
  const h = (extra) => Object.assign({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN }, extra || {})
  const init = () => req(s.port, { method: 'POST', url: '/mcp', body: { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', clientInfo: { name: 'Url Client' } } }, headers: h() })
  const pings = (n, sid) => Array.from({ length: n }, (_, i) => ({ jsonrpc: '2.0', id: 100 + i, method: 'ping' }))
  const first = (await init()).headers['mcp-session-id']
  await sleep(1100)
  assert.equal((await req(s.port, { method: 'POST', url: '/mcp', body: pings(21), headers: h({ 'Mcp-Session-Id': first }) })).status, 400, 'a batch of 21')
  await sleep(1100)
  const fifteen = await req(s.port, { method: 'POST', url: '/mcp', body: pings(15), headers: h({ 'Mcp-Session-Id': first }) })
  assert.equal(fifteen.status, 200)
  assert.equal(fifteen.json.length, 15)
  assert.equal((await req(s.port, { method: 'POST', url: '/mcp', body: pings(10), headers: h({ 'Mcp-Session-Id': first }) })).status, 429, '15 + 10 in one second')
  // 32 more sessions, 15 a second: the first one, used longest ago, is dropped
  const ids = []
  for (let i = 0; i < 32; i++) {
    if (i % 15 === 0) await sleep(1100)
    const r = await init()
    assert.equal(r.status, 200, 'session ' + i)
    ids.push(r.headers['mcp-session-id'])
  }
  await sleep(1100)
  const ping = (sid) => req(s.port, { method: 'POST', url: '/mcp', body: { jsonrpc: '2.0', id: 9, method: 'ping' }, headers: h({ 'Mcp-Session-Id': sid }) })
  assert.equal((await ping(first)).status, 404, 'the oldest session was dropped')
  assert.equal((await ping(ids[0])).status, 200)
  assert.equal((await ping(ids[31])).status, 200)
})

// ---------- leftovers (INFO)
test('an old <id>.pack-new.md in the agent folder is not a team member', (t) => {
  const { sb } = setup(t)
  fs.writeFileSync(path.join(sb.agents, 'tester.pack-new.md'), '---\nname: tester\ndescription: invented new text\n---\n')
  const files = sb.mod('paths.cjs').agentFiles()
  assert.equal(files.has('tester.pack-new'), false)
  assert.ok(files.has('tester'))
})

test('Create that fails after the company was made removes company/ too, so "Try again" works', (t) => {
  const { sb, board } = setup(t, { packs: true, company: false })
  const O = sb.mod('onboard.cjs')
  const before = hashTree(sb.agents)
  const C = require(path.join(sb.tools, 'agent-company.cjs'))
  const orig = C.writeOverlay
  C.writeOverlay = () => { throw Object.assign(new Error('disk said no'), { code: 500 }) }
  try { assert.throws(() => O.create({ name: 'Bluefin Bakery', packs: ['hr'] }, board), /disk said no/) } finally { C.writeOverlay = orig }
  assert.equal(fs.existsSync(sb.company), false, 'no half-made company')
  assert.deepEqual(hashTree(sb.agents), before, 'the pack files were removed again')
  const r = O.create({ name: 'Bluefin Bakery', packs: ['hr'] }, board)
  assert.equal(r.company, 'Bluefin Bakery')
  assert.ok(fs.existsSync(path.join(sb.company, 'company.json')))
})
