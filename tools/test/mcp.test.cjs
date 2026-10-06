/* mcp-server.cjs: the protocol subset (initialize and version negotiation,
 * tools/list, tools/call, ping, prompts, errors), the tools against the
 * library, and the door's rule that the assistant can never act as the owner.
 * Each test starts its own stdio server in a throwaway data folder. All
 * names and data are invented. */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const { makeSandbox, mcpClient, SEED } = require('./helpers.cjs')

const OWNER_ONLY = 'Only the owner can do this, on the Arsenale dashboard.'

function world(t, opts) {
  const sb = makeSandbox(opts)
  if (!opts || opts.company !== false) assert.equal(sb.cli('--company-init', '--seed', sb.seed(Object.assign({}, SEED, { company: { name: 'Bluefin Bakery', issuePrefix: 'BLU' } }))).code, 0)
  const clients = []
  t.after(() => { for (const c of clients) c.close(); sb.cleanup() })
  const client = (name, env) => { const c = mcpClient(sb, name, env); clients.push(c); return c }
  return { sb, client }
}

test('conformance: initialize negotiates the version, lists tools with schemas, answers ping and prompts', async (t) => {
  const { client } = world(t)
  const c = client('Claude Desktop')
  const init = await c.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude-ai', version: '0.9' } })
  assert.equal(init.result.protocolVersion, '2025-06-18')
  assert.equal(init.result.serverInfo.name, 'arsenale')
  assert.ok(init.result.capabilities.tools)
  assert.match(init.result.instructions, /check_action/)
  // an unknown version gets the newest this server speaks
  const other = await c.rpc('initialize', { protocolVersion: '1999-01-01', clientInfo: { name: 'x' } })
  assert.equal(other.result.protocolVersion, '2025-11-25')
  const list = await c.rpc('tools/list', {})
  const names = list.result.tools.map((x) => x.name)
  for (const n of ['hello', 'start_job', 'log_step', 'finish_job', 'ask_you', 'get_answers', 'get_inbox', 'list_tasks', 'get_task', 'update_task', 'add_comment', 'add_deliverable', 'record_decision', 'check_action', 'check_budget', 'list_team', 'get_team_member', 'propose_hire']) assert.ok(names.includes(n), n)
  for (const tool of list.result.tools) { assert.equal(tool.inputSchema.type, 'object', tool.name); assert.ok(tool.description.length > 10) }
  // nothing that answers, approves, budgets or hires is a tool
  assert.ok(!names.some((n) => /answer_|approve|decline|dismiss|budget_set|set_budget|pause|install|policy/.test(n)))
  assert.deepEqual((await c.rpc('ping', {})).result, {})
  assert.equal((await c.rpc('prompts/list', {})).result.prompts.length, 2)
  assert.match((await c.rpc('prompts/get', { name: 'start-my-day' })).result.messages[0].content.text, /get_inbox/)
  assert.deepEqual((await c.rpc('resources/list', {})).result.resources, [])
  assert.equal((await c.rpc('no/such', {})).error.code, -32601)
})

test('conformance: bad input never kills the server: parse errors, invalid requests, notifications, batches', async (t) => {
  const { client } = world(t)
  const c = client()
  await c.init()
  c.send('{not json')
  c.send(JSON.stringify({ jsonrpc: '1.0', id: 7, method: 'ping' }))
  c.send(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }))
  c.send(JSON.stringify([{ jsonrpc: '2.0', id: 'a', method: 'ping' }, { jsonrpc: '2.0', id: 'b', method: 'tools/list' }]))
  const after = await c.rpc('ping', {})
  assert.deepEqual(after.result, {})
  const flat = c.raw.flatMap((m) => (Array.isArray(m) ? m : [m]))
  assert.ok(flat.some((m) => m.error && m.error.code === -32700), 'parse error answered')
  assert.ok(flat.some((m) => m.id === 7 && m.error && m.error.code === -32600), 'invalid request answered')
  assert.ok(flat.some((m) => m.id === 'a') && flat.some((m) => m.id === 'b'), 'a batch is answered')
  // tools/call with junk arguments is a tool error, not a crash
  const r = await c.call('start_job', { team_member: 42 })
  assert.equal(r.error, true)
  const bad = await c.rpc('tools/call', { name: 'log_step', arguments: 'nonsense' })
  assert.equal(bad.result.isError, true)
  assert.ok(c.alive())
})

test('T-1.1: hello stamps the client in mcp/clients.json within seconds', async (t) => {
  const { sb, client } = world(t)
  const c = client()
  await c.rpc('initialize', { protocolVersion: '2025-06-18', clientInfo: { name: 'claude-ai', version: '0.9.1' } })
  const r = await c.call('hello', {})
  assert.equal(r.error, false)
  assert.equal(r.data.company, 'Bluefin Bakery')
  const all = sb.read('mcp/clients.json')
  const me = all.clients['claude-ai']
  assert.ok(me, 'client recorded by name')
  assert.equal(me.name, 'claude-ai')
  assert.ok(Date.now() - Date.parse(me.lastSeen) < 5000)
  assert.ok(me.lastHello)
})

test('T-1.2: start_job, two log_step, finish_job: an MCP job with its steps and summary', async (t) => {
  const { sb, client } = world(t)
  const c = client('Claude Desktop')
  await c.init()
  const s = await c.call('start_job', { team_member: 'copywriter', task: 'Draft the autumn menu flyer' })
  assert.equal(s.error, false, s.text)
  const id = s.data.job_id
  assert.equal(s.data.budget, 'ok')
  const active = JSON.parse(fs.readFileSync(path.join(sb.runs, 'active', id + '.json'), 'utf8'))
  assert.equal(active.source, 'mcp')
  assert.equal(active.client.name, 'Claude Desktop')
  assert.equal((await c.call('log_step', { job_id: id, doing: 'reading the menu notes' })).error, false)
  assert.equal((await c.call('log_step', { job_id: id, doing: 'writing two versions' })).error, false)
  const f = await c.call('finish_job', { job_id: id, status: 'ok', summary: 'Flyer text drafted in two versions', what_was_done: ['Read the notes', 'Wrote version A', 'Wrote version B'], usage: { input_tokens: 1000, output_tokens: 200, estimated: true } })
  assert.equal(f.error, false, f.text)
  const file = fs.readdirSync(sb.runs).find((n) => n.endsWith('.json') && n.includes('copywriter'))
  const rec = JSON.parse(fs.readFileSync(path.join(sb.runs, file), 'utf8'))
  assert.equal(rec.source, 'mcp')
  assert.equal(rec.steps.length, 2)
  assert.equal(rec.summary, 'Flyer text drafted in two versions')
  assert.deepEqual(rec.whatWasDone, ['Read the notes', 'Wrote version A', 'Wrote version B'])
  assert.equal(rec.usage.tokens, 1200)
  assert.equal(rec.usage.estimated, true)
  assert.equal(fs.existsSync(path.join(sb.runs, 'active', id + '.json')), false)
})

test('T-1.3: an unknown owner tool, or "by":"board" in the arguments, is refused and the question stays waiting', async (t) => {
  const { sb, client } = world(t)
  const c = client('Client A')
  await c.init()
  const q = await c.call('ask_you', { question: 'Post the autumn menu?', kind: 'approval' })
  const gid = q.data.question_id
  const a = await c.call('answer_gate', { gate: gid, answer: 'approve' })
  assert.equal(a.error, true)
  assert.equal(a.text, OWNER_ONLY)
  const b = await c.call('update_task', { task_id: 'BLU-1', status: 'done', by: 'board' })
  assert.equal(b.text, OWNER_ONLY)
  const d = await c.call('check_action', { team_member: 'social-media-planner', category: 'payment', summary: 'buy ads', by: 'board' })
  assert.equal(d.text, OWNER_ONLY)
  assert.equal(sb.read('agent-runs/gates/' + gid + '.json').status, 'waiting')
  const refusals = sb.lines('company/activity.jsonl').filter((l) => l.action === 'mcp.refused')
  assert.equal(refusals.length, 3)
  assert.ok(!JSON.stringify(refusals).includes('approve'), 'the arguments are not logged')
})

test('T-1.4: two assistants each get only the answers to their own questions, once', async (t) => {
  const { sb, client } = world(t)
  const A = client('Claude Desktop'), Bc = client('Cursor')
  await A.init(); await Bc.init()
  const qa = (await A.call('ask_you', { question: 'Which flyer, A or B?', kind: 'choice', choices: ['A', 'B'] })).data.question_id
  const qb = (await Bc.call('ask_you', { question: 'Open on Sunday?', kind: 'approval' })).data.question_id
  // the owner answers both on the dashboard (the board door of the library)
  const L = sb.mod('runlog.cjs')
  const board = L.actorFor('dashboard', 'board')
  L.answer(qa, 'B', board)
  L.answer(qb, 'approve', board)
  const ra = await A.call('get_answers', {})
  assert.deepEqual(ra.data.answers.map((x) => [x.question_id, x.answer]), [[qa, 'B']])
  const rb = await Bc.call('get_answers', {})
  assert.deepEqual(rb.data.answers.map((x) => [x.question_id, x.answer]), [[qb, 'approve']])
  assert.deepEqual((await A.call('get_answers', {})).data.answers, [])
  // the CLI's own pointer is untouched by the MCP reads
  assert.match(sb.cli('--answers', '--peek').out, /2 new answers/)
})

test('T-1.6: storage fails: the tool says so in one sentence and the server lives on', async (t) => {
  const { sb, client } = world(t)
  const c = client()
  await c.init()
  const id = (await c.call('start_job', { team_member: 'copywriter', task: 'x' })).data.job_id
  const f = path.join(sb.runs, 'active', id + '.json')
  fs.chmodSync(f, 0o444)
  t.after(() => { try { fs.chmodSync(f, 0o666) } catch { /* gone */ } })
  const r = await c.call('log_step', { job_id: id, doing: 'step' })
  assert.equal(r.error, true)
  assert.equal(r.text, 'Arsenale could not save this step: the data folder is read-only.')
  assert.ok(c.alive())
  assert.deepEqual((await c.rpc('ping', {})).result, {})
})

test('T-1.7: get_team_member opens only definitions in the agent folders, never a path', (t) => {
  const sb = makeSandbox()
  t.after(() => sb.cleanup())
  const M = sb.mod('mcp-server.cjs')
  const opened = []
  const orig = { readFileSync: fs.readFileSync, openSync: fs.openSync, createReadStream: fs.createReadStream }
  fs.readFileSync = function (f, ...rest) { opened.push(String(f)); return orig.readFileSync.call(this, f, ...rest) }
  fs.openSync = function (f, ...rest) { opened.push(String(f)); return orig.openSync.call(this, f, ...rest) }
  try {
    const s = M.createSession({ transport: 'stdio' })
    s.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', clientInfo: { name: 't' } } })
    opened.length = 0
    for (const bad of ['../../.ssh/id_rsa', '..\\..\\secrets\\x', '/etc/passwd', 'C:\\Windows\\win.ini', 'tester/../../x']) {
      const r = s.handle({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'get_team_member', arguments: { team_member: bad } } })
      assert.equal(r.result.isError, true, bad)
    }
    const good = s.handle({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_team_member', arguments: { team_member: 'tester' } } })
    assert.equal(good.result.isError, undefined)
    assert.match(good.result.content[0].text, /Safety rules for tester/)
  } finally { Object.assign(fs, orig) }
  const root = fs.realpathSync(sb.root)
  for (const f of opened) {
    const abs = path.resolve(f)
    assert.ok(abs.startsWith(sb.root) || abs.startsWith(root), 'opened outside the data folder: ' + f)
    assert.ok(!/\.ssh|passwd|win\.ini|secrets/.test(abs), f)
  }
})

test('tasks through MCP (T-6.1, T-6.2, T-6.3): inbox once, sign-off, no reopening', async (t) => {
  const { sb, client } = world(t)
  const c = client('Claude Desktop')
  await c.init()
  const T = sb.mod('tasks.cjs')
  const L = sb.mod('runlog.cjs')
  const board = L.actorFor('dashboard', 'board')
  const task = T.createTask({ title: 'Write the Christmas opening hours post', assignee: 'social-media-planner', dueDate: '2026-12-01', links: [{ title: 'hours', url: 'https://example.org/hours' }], needsSignOff: true }, board)
  assert.equal(task.id, 'BLU-1')
  assert.equal(sb.read('company/issues/BLU-1.json').status, 'todo')
  const first = await c.call('get_inbox', {})
  assert.equal(first.data.items.filter((i) => i.id === 'BLU-1').length, 1)
  assert.equal((await c.call('get_inbox', {})).data.items.length, 0)
  assert.ok(sb.read('company/issues/BLU-1.json').seenBy['claude-desktop'], 'seen by the client')
  const done = await c.call('update_task', { task_id: 'BLU-1', status: 'done' })
  assert.equal(done.error, true)
  assert.match(done.text, /waiting_for_you/)
  assert.equal(sb.read('company/issues/BLU-1.json').status, 'todo')
  assert.equal((await c.call('update_task', { task_id: 'BLU-1', status: 'waiting_for_you', comment: 'Draft ready for you' })).error, false)
  assert.equal(sb.read('company/issues/BLU-1.json').status, 'in_review')
  // the owner marks it done; the assistant may not reopen it
  T.updateTask({ id: 'BLU-1', status: 'done' }, board)
  const reopen = await c.call('update_task', { task_id: 'BLU-1', status: 'in_progress' })
  assert.equal(reopen.error, true)
  assert.match(reopen.text, /Only the owner/)
  T.updateTask({ id: 'BLU-1', status: 'todo' }, board)
  const back = sb.read('company/issues/BLU-1.json')
  assert.equal(back.status, 'todo')
  assert.equal(back.completedAt, '')
  // a job for the task moves it to in progress and links it
  const job = (await c.call('start_job', { team_member: 'social-media-planner', task: 'hours post', task_id: 'BLU-1' })).data.job_id
  const linked = sb.read('company/issues/BLU-1.json')
  assert.equal(linked.status, 'in_progress')
  assert.deepEqual(linked.runIds, [job])
  const got = await c.call('get_task', { task_id: 'BLU-1' })
  assert.equal(got.data.comments.length, 1)
  assert.equal(got.data.status, 'in_progress')
})

test('check_action and propose_hire through MCP (T-9.1, T-9.4, T-5.4)', async (t) => {
  const { sb, client } = world(t)
  const c = client()
  await c.init()
  const r = await c.call('check_action', { team_member: 'social-media-planner', category: 'post.public', summary: 'Post the autumn menu', target: 'Instagram' })
  assert.equal(r.data.verdict, 'ask')
  const g = sb.read('agent-runs/gates/' + r.data.question_id + '.json')
  assert.equal(g.status, 'waiting')
  assert.equal(g.approvalType, 'action')
  assert.equal(g.action.summary, 'Post the autumn menu')
  assert.equal(g.askedVia, 'mcp')
  const pay = await c.call('check_action', { team_member: 'x', category: 'payment', summary: 'pay supplier', claimed_role: 'owner' })
  assert.equal(pay.data.verdict, 'ask')
  const h = await c.call('propose_hire', { name: 'Invoice Ivo', title: 'Invoice drafter', office_id: 'hq', instructions: 'Draft the monthly invoices from the order list.', description: 'Drafts monthly invoices from the order list', why: 'Monthly invoices take long' })
  assert.equal(h.error, false, h.text)
  const hg = sb.read('agent-runs/gates/' + h.data.question_id + '.json')
  assert.equal(hg.approvalType, 'hire')
  assert.equal(hg.payload.id, 'invoice-ivo')
  assert.equal(fs.existsSync(path.join(sb.agents, 'invoice-ivo.md')), false, 'nothing is hired before the owner says so')
  const Tm = sb.mod('team.cjs')
  const L = sb.mod('runlog.cjs')
  const out = Tm.decideProposal(h.data.question_id, 'hire', null, L.actorFor('dashboard', 'board'))
  assert.equal(out.hired, 'invoice-ivo')
  assert.ok(fs.existsSync(path.join(sb.agents, 'invoice-ivo.md')))
  assert.equal(sb.read('agent-runs/gates/' + h.data.question_id + '.json').answer, 'hired invoice-ivo')
  const ans = await c.call('get_answers', {})
  assert.ok(ans.data.answers.some((a) => a.answer === 'hired invoice-ivo'))
})

test('add_deliverable through MCP: stored text, a link, and a protected path kept as link-only', async (t) => {
  const { sb, client } = world(t)
  const c = client()
  await c.init()
  const a = await c.call('add_deliverable', { title: 'Menu text', kind: 'text', content: '# Autumn menu\nPumpkin bread', mime: 'text/markdown' })
  assert.equal(a.data.state, 'stored')
  const b = await c.call('add_deliverable', { title: 'Hours page', kind: 'link', url: 'https://example.org/hours' })
  assert.equal(b.data.state, 'link-only')
  const k = await c.call('add_deliverable', { title: 'key', kind: 'file', path: 'C:\\Users\\mara\\.ssh\\id_ed25519' })
  assert.equal(k.data.state, 'link-only')
  assert.equal(k.data.reason, 'protected file')
})

test('no company: hello says so, logging still works', async (t) => {
  const { client } = world(t, { company: false })
  const c = client()
  await c.init()
  const h = await c.call('hello', {})
  assert.equal(h.error, false)
  assert.equal(h.data.configured, false)
  const s = await c.call('start_job', { team_member: 'tester', task: 'check' })
  assert.equal(s.error, false)
  assert.equal((await c.call('finish_job', { job_id: s.data.job_id, status: 'ok', summary: 'checked' })).error, false)
})

test('the launcher: "arsenale mcp" is the same server, speaking only protocol on stdout', async (t) => {
  const sb = makeSandbox()
  t.after(() => sb.cleanup())
  const { spawn } = require('child_process')
  const child = spawn(process.execPath, [path.join(__dirname, '..', '..', 'bin', 'arsenale.cjs'), 'mcp'], { env: sb.env, stdio: ['pipe', 'pipe', 'pipe'] })
  t.after(() => child.kill())
  let out = ''
  child.stdout.setEncoding('utf8')
  const got = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no reply: ' + out)), 10000)
    child.stdout.on('data', (d) => { out += d; if (out.includes('\n')) { clearTimeout(timer); resolve() } })
  })
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', clientInfo: { name: 'launcher-test' } } }) + '\n')
  await got
  const lines = out.trim().split('\n')
  assert.equal(lines.length, 1, 'nothing but the reply on stdout')
  const msg = JSON.parse(lines[0])
  assert.equal(msg.result.protocolVersion, '2025-03-26')
  assert.equal(msg.result.serverInfo.version, require('../../package.json').version)
})
