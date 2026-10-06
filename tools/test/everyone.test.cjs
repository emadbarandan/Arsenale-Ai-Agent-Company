/* The 1.0 libraries behind the doors: tasks, the team (hire form), the
 * safety rules, deliverables, office packs, the wizard's Create, phone
 * tokens and "Connect your assistant". Each test works in a throwaway data
 * folder through fresh module copies (helpers.cjs sb.mod). All names,
 * companies and data are invented. */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const { makeSandbox, hashTree, SEED } = require('./helpers.cjs')

const BAKERY = Object.assign({}, SEED, { company: { name: 'Bluefin Bakery', issuePrefix: 'BLU' } })
function setup(t, opts) {
  const sb = makeSandbox(opts)
  if (!opts || opts.company !== false) assert.equal(sb.cli('--company-init', '--seed', sb.seed(BAKERY)).code, 0)
  t.after(() => sb.cleanup())
  const L = sb.mod('runlog.cjs')
  return { sb, L, board: L.actorFor('dashboard', 'board'), sup: L.actorFor('mcp', 'supervisor', { clientId: 'test-client' }), cliSup: L.actorFor('cli', 'supervisor') }
}
const throwsCode = (fn, code, re) => assert.throws(fn, (e) => { assert.equal(e.code, code, e.message); if (re) assert.match(e.message, re); return true })

// ---------- the library and its doors
test('R-0.1/R-0.2: Board-only library calls refuse every actor that is not the board, whatever the body says', (t) => {
  const { sb, L, board, sup } = setup(t)
  const before = hashTree(sb.company)
  throwsCode(() => L.setBudget({ scope: 'company', budget: { monthlyTokens: 5 }, by: 'board' }, sup), 403)
  throwsCode(() => L.updateEmployee({ id: 'tester', status: 'paused', by: 'board' }, sup), 403)
  throwsCode(() => L.setBudgetsEnabled(false, sup), 403)
  const g = L.gate({ question: 'Ship?', kind: 'approval' }, sup)
  throwsCode(() => L.answer(g.id, 'approve', sup), 403, /Only the owner/)
  throwsCode(() => L.dismiss(g.id, sup), 403)
  // an assistant cannot close or rewrite a question through the gate call
  throwsCode(() => L.gate({ id: g.id, status: 'answered', answer: 'approve' }, sup), 403)
  assert.deepEqual(hashTree(sb.company), before, 'nothing in company/ changed')
  assert.equal(sb.read('agent-runs/gates/' + g.id + '.json').status, 'waiting')
  assert.equal(L.answer(g.id, 'approve', board).status, 'answered')
  assert.equal(L.setBudget({ scope: 'company', budget: { monthlyTokens: 5 } }, board).scope, 'company')
})

test('the CLI door keeps its "by" rule and its exact messages', (t) => {
  const { sb } = setup(t)
  const r = sb.cli('--budget', '{"scope":"company","budget":{"monthlyTokens":100}}')
  assert.equal(r.code, 1)
  assert.match(r.err, /only the Board may change budgets/)
  assert.equal(sb.cli('--progress', '{"id":"none","doing":"x"}').err, 'no run is active with that id')
  assert.equal(sb.cli('{"agent":"x"}').err, 'an entry needs at least "agent" and "task"')
})

test('new CLI modes: --task, --comment, --deliverable, --check-action (exit 0 allow, 2 never, 3 ask)', (t) => {
  const { sb } = setup(t)
  const id = sb.cli('--task', JSON.stringify({ title: 'Split the menu work', assignee: 'copywriter' })).out
  assert.equal(id, 'BLU-1')
  assert.equal(sb.read('company/issues/BLU-1.json').createdBy, 'supervisor')
  assert.equal(sb.cli('--comment', JSON.stringify({ task: 'BLU-1', text: 'started' })).out, 'ok')
  assert.equal(sb.cli('--task', JSON.stringify({ id: 'BLU-1', status: 'in_progress' })).out, 'ok')
  assert.match(sb.cli('--deliverable', JSON.stringify({ title: 'Hours', kind: 'link', url: 'https://example.org' })).out, /^dl-.* link-only$/)
  const ask = sb.cli('--check-action', JSON.stringify({ agent: 'copywriter', category: 'message.send', summary: 'email the supplier' }))
  assert.equal(ask.code, 3)
  assert.match(ask.out, /^ask g-/)
  fs.writeFileSync(path.join(sb.root, 'policy.json'), JSON.stringify({ schemaVersion: 1, defaults: { 'message.send': 'allow' }, members: { copywriter: { payment: 'never' } } }))
  assert.equal(sb.cli('--check-action', JSON.stringify({ agent: 'copywriter', category: 'message.send', summary: 'email' })).code, 0)
  assert.equal(sb.cli('--check-action', JSON.stringify({ agent: 'copywriter', category: 'payment', summary: 'pay' })).code, 2)
})

// ---------- tasks
test('tasks: keys per prefix, validation with units, links only http(s) or a path (T-6.4)', (t) => {
  const { sb, board } = setup(t)
  const T = sb.mod('tasks.cjs')
  assert.equal(T.createTask({ title: 'First' }, board).id, 'BLU-1')
  assert.equal(T.createTask({ title: 'Calc', projectId: 'demo-calc' }, board).id, 'DCALC-1')
  assert.equal(T.createTask({ title: 'Second' }, board).id, 'BLU-2')
  throwsCode(() => T.createTask({ title: '' }, board), 400, /title/)
  throwsCode(() => T.createTask({ title: 'x', dueDate: '2026-02-30' }, board), 400, /calendar date/)
  for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'ftp://example.org']) {
    throwsCode(() => T.createTask({ title: 'x', links: [{ url }] }, board), 400, /^Links must start with https:\/\/ or http:\/\/; for a file, use 'add file path'$/)
  }
  const ok = T.createTask({ title: 'With links', links: [{ title: 'brief', path: 'C:\\work\\brief.docx' }, { url: 'https://example.org/a' }], dueDate: '2025-01-01' }, board)
  assert.equal(ok.links[0].path, 'C:\\work\\brief.docx')
  assert.equal(ok.dueDate, '2025-01-01', 'a past date is allowed')
  // the board's task is in the assistant's inbox
  assert.ok(sb.lines('company/inbox.jsonl').some((l) => l.type === 'task.created' && l.id === 'BLU-1'))
  // a Persian title is clipped on characters, never in the middle of one
  const long = T.createTask({ title: 'ن'.repeat(150) + '😀'.repeat(100) }, board)
  assert.equal(Array.from(long.title).length, 200)
  assert.ok(!/[\uD800-\uDBFF]$/.test(long.title))
})

test('tasks: who may do what (R-6.6, R33)', (t) => {
  const { sb, board, sup } = setup(t)
  const T = sb.mod('tasks.cjs')
  const L = sb.mod('runlog.cjs')
  const agent = L.actorFor('mcp', 'agent', { name: 'tester' })
  const task = T.createTask({ title: 'Check it', needsSignOff: true }, board)
  throwsCode(() => T.updateTask({ id: task.id, status: 'cancelled' }, sup), 403)
  throwsCode(() => T.updateTask({ id: task.id, title: 'mine now' }, sup), 403)
  throwsCode(() => T.updateTask({ id: task.id, needsSignOff: false }, sup), 403)
  throwsCode(() => T.updateTask({ id: task.id, status: 'done' }, sup), 409, /sign-off/)
  throwsCode(() => T.createTask({ title: 'agent task' }, agent), 403)
  throwsCode(() => T.addComment(task.id, 'not mine', agent), 403)
  // the assistant cannot ask for a sign-off on its own task
  assert.equal(T.createTask({ title: 'split', needsSignOff: true }, sup).needsSignOff, false)
  // an agent comments on a task its own job is linked to
  const job = L.startRun({ agent: 'tester', task: 'check', issue: task.id }, sup)
  assert.equal(T.addComment(task.id, 'looked at it', agent).by, 'agent:tester')
  assert.equal(sb.read('company/issues/' + task.id + '.json').status, 'in_progress')
  void job
  // only the owner sets cancelled and reopens
  T.updateTask({ id: task.id, status: 'cancelled' }, board)
  throwsCode(() => T.updateTask({ id: task.id, status: 'in_progress' }, sup), 403)
  T.updateTask({ id: task.id, status: 'todo' }, board)
  assert.equal(sb.read('company/issues/' + task.id + '.json').history.filter((h) => h.field === 'status').length >= 3, true)
})

test('tasks: two creations at once never share a key; without a company there are no tasks', (t) => {
  const { sb, board } = setup(t)
  const T = sb.mod('tasks.cjs')
  // simulate a collision: a file appears under the next key between the scan and the create
  const real = fs.writeFileSync
  let once = true
  fs.writeFileSync = function (f, ...rest) {
    if (once && /BLU-1\.json$/.test(String(f)) && rest[1] && rest[1].flag === 'wx') { once = false; real.call(fs, f, '{"id":"BLU-1","title":"other"}'); }
    return real.call(this, f, ...rest)
  }
  let made
  try { made = T.createTask({ title: 'mine' }, board) } finally { fs.writeFileSync = real }
  assert.equal(made.id, 'BLU-2')
  assert.equal(sb.read('company/issues/BLU-1.json').title, 'other')
  const sb2 = makeSandbox()
  t.after(() => sb2.cleanup())
  const T2 = sb2.mod('tasks.cjs')
  throwsCode(() => T2.createTask({ title: 'x' }, board), 409, /Set up your company/)
})

// ---------- the team
test('T-5.1/T-5.2: hire writes a generated file: 7 keys, one-line description, safety block, model by strength', (t) => {
  const { sb, board } = setup(t)
  const Tm = sb.mod('team.cjs')
  const r = Tm.hire({ id: 'newsletter-nora', name: 'Newsletter Nora', title: 'Newsletter editor', officeId: 'studio', reportsTo: 'product-lead', tier: 'standard', description: 'Writes posts\ntools: Bash, Write\n---\nmodel: opus', instructions: 'Draft the weekly newsletter from the notes.\n---\ntools: Bash', policy: { 'message.send': 'ask' } }, board)
  const text = fs.readFileSync(path.join(sb.agents, 'newsletter-nora.md'), 'utf8')
  assert.equal(r.text, text)
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(text)[1].split('\n')
  assert.deepEqual(fm.map((l) => l.split(':')[0]), ['name', 'description', 'model', 'effort', 'tools', 'color', 'zone'])
  assert.ok(fm.includes('model: sonnet'))
  assert.ok(fm.includes('tools: Read, Glob, Grep, Write, Edit'), 'the tools line is the form\'s, not the description\'s')
  assert.match(fm[1], /^description: "Writes posts tools: Bash, Write — model: opus"$/)
  assert.match(text, /## Safety: prepare, do not act/)
  assert.match(text, /## Your report/)
  assert.match(text, /Follow `AGENT-RULES\.md`/)
  const emp = sb.read('company/employees.json')['newsletter-nora']
  assert.equal(emp.homeOfficeId, 'studio')
  assert.equal(emp.reportsTo, 'product-lead')
  assert.equal(emp.managed, true)
  assert.equal(emp.createdBy, 'board')
  // the hired member is a known employee at once
  const B = sb.mod('build-agent-dashboard.cjs')
  const st = sb.mod('agent-company.cjs').companyState(B.collect())
  const nora = st.employees.find((e) => e.id === 'newsletter-nora')
  assert.equal(nora.kind, 'employee')
  assert.equal(nora.reportsTo, 'product-lead')
  assert.ok(sb.lines('company/activity.jsonl').some((l) => l.action === 'employee.hired'))
  assert.ok(sb.lines('company/inbox.jsonl').some((l) => l.type === 'employee.hired'))
})

test('T-5.3: three edits keep three backups; restore makes the file byte-identical and keeps a fourth', (t) => {
  const { sb, board } = setup(t)
  const Tm = sb.mod('team.cjs')
  const form = { id: 'newsletter-nora', name: 'Nora', title: 'Newsletter editor', officeId: 'studio', description: 'Writes the weekly newsletter', instructions: 'v0' }
  Tm.hire(form, board)
  const file = path.join(sb.agents, 'newsletter-nora.md')
  const first = fs.readFileSync(file)
  for (const v of ['v1', 'v2', 'v3']) Tm.edit(Object.assign({}, form, { instructions: v }), board)
  const list = Tm.backups('newsletter-nora')
  assert.equal(list.length, 3)
  const oldest = list[list.length - 1]
  assert.deepEqual(fs.readFileSync(path.join(sb.root, 'backups', 'agents', 'newsletter-nora', oldest)), first)
  Tm.restore('newsletter-nora', oldest, board)
  assert.deepEqual(fs.readFileSync(file), first)
  assert.equal(Tm.backups('newsletter-nora').length, 4)
})

test('T-5.6: bad and reserved ids are refused and nothing is written; a taken id too', (t) => {
  const { sb, board, sup } = setup(t)
  const Tm = sb.mod('team.cjs')
  const before = hashTree(sb.agents)
  const base = { name: 'X', officeId: 'studio', description: 'Does a careful job' }
  throwsCode(() => Tm.hire(Object.assign({ id: '../evil' }, base), board), 400, /^Short id: letters, digits and hyphens, starting with a letter$/)
  throwsCode(() => Tm.hire(Object.assign({ id: 'con' }, base), board), 400, /^This name is reserved on Windows$/)
  throwsCode(() => Tm.hire(Object.assign({ id: 'Tester' }, base), board), 400)
  throwsCode(() => Tm.hire(Object.assign({ id: 'tester' }, base), board), 409, /taken/)
  throwsCode(() => Tm.hire(Object.assign({ id: 'new-one' }, base), sup), 403)
  throwsCode(() => Tm.hire(Object.assign({ id: 'new-one', budget: { monthlyUsd: '25,50' } }, base), board), 400, /Enter an amount in USD/)
  assert.deepEqual(hashTree(sb.agents), before)
})

test('retire moves the file to backups and keeps history; un-retire brings it back; another tool\'s file needs a confirm', (t) => {
  const { sb, board } = setup(t)
  const Tm = sb.mod('team.cjs')
  Tm.hire({ id: 'helper-hal', name: 'Hal', officeId: 'hq', description: 'Keeps the to-do list tidy' }, board)
  Tm.retire('helper-hal', board)
  assert.equal(fs.existsSync(path.join(sb.agents, 'helper-hal.md')), false)
  assert.equal(sb.read('company/employees.json')['helper-hal'].status, 'retired')
  Tm.unretire('helper-hal', board)
  assert.ok(fs.existsSync(path.join(sb.agents, 'helper-hal.md')))
  // a definition in a folder Arsenale does not manage
  const other = path.join(sb.base, 'their-agents')
  fs.mkdirSync(other)
  fs.writeFileSync(path.join(other, 'outside.md'), '---\nname: outside\ndescription: x\n---\nbody\n')
  const sb2env = Object.assign({}, sb.env, { ARSENALE_AGENT_DIRS: other })
  sb.env.ARSENALE_AGENT_DIRS = other
  const Tm2 = sb.mod('team.cjs')
  const L2 = sb.mod('runlog.cjs')
  const b2 = L2.actorFor('dashboard', 'board')
  const f = { id: 'outside', name: 'Outside', description: 'Belongs to another tool', instructions: 'new' }
  throwsCode(() => Tm2.edit(f, b2), 409, /belongs to another tool/)
  Tm2.edit(Object.assign({ confirmForeign: true }, f), b2)
  assert.match(fs.readFileSync(path.join(other, 'outside.md'), 'utf8'), /new/)
  assert.equal(Tm2.backups('outside').length, 1)
  throwsCode(() => Tm2.retire('outside', b2), 409)
  void sb2env
  delete sb.env.ARSENALE_AGENT_DIRS
})

// ---------- the safety rules
test('T-9.2/T-9.3: never writes no question and logs policy.never; no file reads as ask; a newer file too', (t) => {
  const { sb, sup, board } = setup(t)
  const Po = sb.mod('policy.cjs')
  fs.rmSync(Po.FILE, { force: true })
  for (const c of Po.IDS) assert.equal(Po.checkAction({ team_member: 'x', category: c, summary: 's', ask_now: false }, sup).verdict, 'ask')
  Po.ensureDefaults()
  Po.setPolicy({ scope: 'member', id: 'finance-lead', category: 'payment', value: 'never' }, board)
  const gates = () => fs.readdirSync(path.join(sb.runs, 'gates')).length
  const n = gates()
  const r = Po.checkAction({ team_member: 'finance-lead', category: 'payment', summary: 'pay the flour supplier' }, sup)
  assert.equal(r.verdict, 'never')
  assert.equal(gates(), n)
  assert.ok(sb.lines('company/activity.jsonl').some((l) => l.action === 'policy.never'))
  assert.ok(sb.lines('company/inbox.jsonl').some((l) => l.type === 'policy.changed'))
  throwsCode(() => Po.setPolicy({ category: 'payment', value: 'allow' }, sup), 403)
  throwsCode(() => Po.setPolicy({ category: 'payment', phoneAllowed: true }, board), 400, /computer only/)
  fs.writeFileSync(Po.FILE, JSON.stringify({ schemaVersion: 2, defaults: { payment: 'allow' } }))
  assert.equal(Po.readPolicy().newer, true)
  assert.equal(Po.checkAction({ team_member: 'x', category: 'payment', summary: 's', ask_now: false }, sup).verdict, 'ask')
})

// ---------- deliverables
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex')
test('T-7.4/T-7.5/T-7.6: protected and outside paths stay link-only; markup posing as an image is refused; the copy outlives the file', (t) => {
  const { sb, sup } = setup(t)
  const D = sb.mod('deliverables.cjs')
  const blobs = () => (fs.existsSync(D.BLOBS) ? fs.readdirSync(D.BLOBS).length : 0)
  const k = D.addDeliverable({ title: 'key', kind: 'file', path: 'C:\\Users\\mara\\.ssh\\id_ed25519' }, sup)
  assert.equal(k.state, 'link-only'); assert.equal(k.reason, 'protected file'); assert.equal(blobs(), 0)
  const ws = path.join(sb.root, 'workspace')
  fs.mkdirSync(ws)
  fs.writeFileSync(path.join(ws, '.env'), 'X=1')
  assert.equal(D.addDeliverable({ title: 'env', kind: 'file', path: path.join(ws, '.env') }, sup).reason, 'protected file')
  const outside = path.join(sb.base, 'outside.txt')
  fs.writeFileSync(outside, 'hello')
  assert.equal(D.addDeliverable({ title: 'out', kind: 'file', path: outside }, sup).reason, 'outside your deliverable folders')
  assert.throws(() => D.addDeliverable({ title: 'fake', kind: 'image', mime: 'image/png', content: Buffer.from('<html><script>alert(1)</script></html>').toString('base64') }, sup), /not a valid image/)
  assert.throws(() => D.addDeliverable({ title: 'svg', kind: 'text', mime: 'image/svg+xml', content: '<svg/>' }, sup), /SVG and HTML/)
  // a scratch file inside the workspace is copied, then deleted: the gallery still has it
  const draft = path.join(ws, 'flyer.png')
  fs.writeFileSync(draft, PNG)
  const d = D.addDeliverable({ title: 'Flyer draft A', kind: 'image', path: draft, job_id: 'j1' }, sup)
  assert.equal(d.state, 'stored')
  fs.rmSync(draft)
  const b = D.blobFor(d.id)
  assert.ok(b && fs.existsSync(b.file))
  assert.equal(b.mime, 'image/png')
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(b.file)).digest('hex'), d.blob.sha256)
  const listed = D.listDeliverables()
  assert.equal(listed.find((x) => x.id === d.id).image, true)
  // the protected path was never on this machine: the gallery says it is not there
  assert.equal(listed.find((x) => x.id === k.id).state, 'missing')
  // limits are said with their unit
  assert.throws(() => D.addDeliverable({ title: 'big', kind: 'text', content: 'x'.repeat(1024 * 1024 + 10) }, sup), /limit is 1 MB/)
})

// ---------- office packs
test('packs: every bundled pack is valid, tool-agnostic and invented (T-4.6, T-4.5 lines)', (t) => {
  const sb = makeSandbox({ packs: true })
  t.after(() => sb.cleanup())
  const Pk = sb.mod('packs.cjs')
  const list = Pk.bundled()
  assert.deepEqual(list.map((p) => p.id).sort(), ['content-marketing', 'customer-support', 'design', 'finance', 'hr', 'operations', 'research'])
  const repo = path.join(__dirname, '..', '..', 'packs')
  for (const p of list) {
    for (const m of p.members) {
      const text = fs.readFileSync(path.join(repo, p.id, 'agents', m.id + '.md'), 'utf8')
      const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)[1]
      assert.deepEqual(fm.split(/\r?\n/).map((l) => l.split(':')[0]), ['name', 'description', 'model', 'effort', 'tools', 'color', 'zone'], m.id)
      const body = text.slice(text.indexOf('---', 4) + 3)
      assert.doesNotMatch(body, /\b(Bash|PowerShell|WebFetch|Claude|Anthropic|OpenAI|GPT|Gemini|Sonnet|Opus|Haiku|ChatGPT|Copilot)\b/, m.id)
      assert.match(body, /## Safety: prepare, do not act/, m.id)
      assert.match(body, /Follow `AGENT-RULES\.md`/, m.id)
      if (p.id === 'hr' || p.id === 'finance') assert.match(body, /not legal, tax or employment advice/, m.id)
    }
  }
  for (const f of fs.readdirSync(repo, { recursive: true })) {
    const full = path.join(repo, f)
    if (fs.statSync(full).isDirectory()) continue
    const text = fs.readFileSync(full, 'utf8')
    for (const email of text.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g) || []) assert.match(email, /@example\./, f + ': ' + email)
    assert.doesNotMatch(text, /\bBash\b/, f)
  }
  assert.ok(list.find((p) => p.id === 'finance').policyRows['finance-lead'].payment === 'never')
})

test('T-4.1/T-4.2: install Customer support, then remove it: the edited file stays, the office is archived', (t) => {
  const { sb, board } = setup(t, { packs: true })
  const Pk = sb.mod('packs.cjs')
  const r = Pk.installPack('customer-support', board)
  assert.equal(r.files.length, 5)
  const inst = sb.read('packs/installed.json').packs['customer-support']
  assert.equal(inst.files.length, 5)
  for (const f of inst.files) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(sb.agents, f.path))).digest('hex'), f.sha256)
  const offices = sb.read('company/offices.json')
  assert.ok(offices.some((o) => o.id === 'support' && o.leadEmployeeId === 'support-lead'))
  const B = sb.mod('build-agent-dashboard.cjs')
  const st = sb.mod('agent-company.cjs').companyState(B.collect())
  assert.equal(st.employees.filter((e) => e.reportsTo === 'support-lead').length, 4)
  assert.equal(st.employees.find((e) => e.id === 'support-lead').reportsTo, 'supervisor')
  // a job of reply-drafter, then an edit by hand
  sb.run({ agent: 'reply-drafter', task: 'draft replies' })
  fs.appendFileSync(path.join(sb.agents, 'reply-drafter.md'), '\nMy own note.\n')
  const out = Pk.uninstallPack('customer-support', board)
  assert.deepEqual(out.kept, ['reply-drafter'])
  assert.equal(out.removed.length, 4)
  assert.ok(fs.existsSync(path.join(sb.agents, 'reply-drafter.md')))
  assert.equal(fs.existsSync(path.join(sb.agents, 'ticket-triager.md')), false)
  assert.equal(sb.read('company/offices.json').find((o) => o.id === 'support').archived, true)
  assert.ok(fs.readdirSync(sb.runs).some((n) => n.includes('reply-drafter')), 'past jobs stay')
})

test('T-4.3/T-4.4: an existing member is never overwritten; a pack that loosens the rules is refused', (t) => {
  const { sb, board } = setup(t, { packs: true })
  const Pk = sb.mod('packs.cjs')
  const mine = path.join(sb.agents, 'copywriter.md')
  fs.writeFileSync(mine, '---\nname: copywriter\ndescription: my own\n---\nmine\n')
  const before = fs.readFileSync(mine)
  assert.throws(() => Pk.installPack('content-marketing', board), (e) => e.code === 409 && /copywriter already exists/.test(e.message))
  assert.deepEqual(fs.readFileSync(mine), before)
  const kept = Pk.installPack('content-marketing', board, { onConflict: 'keep' })
  assert.deepEqual(kept.kept, ['copywriter'])
  assert.deepEqual(fs.readFileSync(mine), before)
  Pk.uninstallPack('content-marketing', board)
  const renamed = Pk.installPack('content-marketing', board, { onConflict: 'rename' })
  assert.equal(renamed.renamed.copywriter, 'copywriter-2')
  assert.match(fs.readFileSync(path.join(sb.agents, 'copywriter-2.md'), 'utf8'), /^---\nname: copywriter-2\n/)
  assert.deepEqual(fs.readFileSync(mine), before)
  // a test pack that tries to allow payments
  const bad = path.join(sb.root, 'packs', 'loose-pack')
  fs.cpSync(path.join(sb.root, 'packs', 'finance'), bad, { recursive: true })
  const pj = JSON.parse(fs.readFileSync(path.join(bad, 'pack.json'), 'utf8'))
  pj.id = 'loose-pack'; pj.policy = { members: { 'finance-lead': { payment: 'allow' } } }
  fs.writeFileSync(path.join(bad, 'pack.json'), JSON.stringify(pj))
  assert.throws(() => Pk.readPack(bad), /^Error: A pack can only make the rules stricter\.$/)
  assert.ok(!Pk.bundled().some((p) => p.id === 'loose-pack'), 'a refused pack is not offered')
})

test('packs: update replaces unedited files and leaves the new text beside an edited one', (t) => {
  const { sb, board } = setup(t, { packs: true })
  const Pk = sb.mod('packs.cjs')
  Pk.installPack('research', board)
  fs.appendFileSync(path.join(sb.agents, 'fact-checker.md'), '\nmine\n')
  const pj = path.join(sb.root, 'packs', 'research', 'pack.json')
  const j = JSON.parse(fs.readFileSync(pj, 'utf8')); j.version = '1.1.0'; fs.writeFileSync(pj, JSON.stringify(j))
  fs.appendFileSync(path.join(sb.root, 'packs', 'research', 'agents', 'desk-researcher.md'), '\nNew in 1.1.\n')
  const r = Pk.updatePack('research', board)
  assert.ok(r.replaced.includes('desk-researcher'))
  assert.deepEqual(r.keptWithNewBeside, ['fact-checker'])
  assert.match(fs.readFileSync(path.join(sb.agents, 'desk-researcher.md'), 'utf8'), /New in 1\.1\./)
  // the new text waits outside the agent folder, where it would be a team member
  assert.ok(fs.existsSync(path.join(sb.root, 'pack-updates', 'fact-checker.md')))
  assert.equal(r.newTextDir, path.join(sb.root, 'pack-updates'))
  assert.deepEqual(fs.readdirSync(sb.agents).filter((n) => /pack-new/.test(n)), [])
  assert.throws(() => Pk.updatePack('research', board), /No newer version/)
})

// ---------- the wizard
test('T-3.1: Create with three packs: offices, employees, policy, config; a sample task to start with', (t) => {
  const { sb, board } = setup(t, { packs: true, company: false })
  const O = sb.mod('onboard.cjs')
  assert.equal(O.status().wizard, true)
  const r = O.create({ name: 'Bluefin Bakery', mission: 'Three bakeries and a delivery service', payModel: 'plan', packs: ['content-marketing', 'customer-support', 'operations'], assistants: ['claude-desktop'] }, board)
  assert.equal(r.issuePrefix, 'BLU')
  assert.deepEqual(sb.read('company/offices.json').map((o) => o.id), ['marketing', 'support', 'operations'])
  const emp = sb.read('company/employees.json')
  for (const id of ['marketing-lead', 'copywriter', 'reply-drafter', 'support-lead', 'operations-lead', 'process-writer']) assert.ok(emp[id], id)
  assert.equal(emp['reply-drafter'].homeOfficeId, 'support')
  assert.equal(emp['reply-drafter'].reportsTo, 'support-lead')
  const pol = sb.read('policy.json')
  assert.ok(Object.values(pol.defaults).every((v) => v === 'ask'))
  const co = sb.read('company/company.json')
  assert.equal(co.payModel, 'plan'); assert.deepEqual(co.assistants, ['claude-desktop']); assert.equal(co.mission, 'Three bakeries and a delivery service')
  assert.equal(co.budgetsEnabled, false, 'plan payers: budgets off by default')
  assert.ok(sb.read('config.json').onboarding.completedAt)
  assert.ok(r.sampleTask && r.sampleTask.title)
  assert.equal(O.status().wizard, false)
  assert.throws(() => O.create({ name: 'Again', packs: ['research'] }, board), /exists already/)
})

test('T-3.2/T-3.6/R-3.2: nothing before Create; a bad amount writes nothing; a failed company undoes the files', (t) => {
  const { sb, board } = setup(t, { packs: true, company: false })
  const O = sb.mod('onboard.cjs')
  const before = hashTree(sb.agents)
  O.preview({ name: 'x', packs: ['hr'] })
  assert.throws(() => O.create({ name: 'Shop', payModel: 'api', budget: { monthlyUsd: '25,50' }, packs: ['hr'] }, board), /^Error: Enter an amount in USD, for example 25\.50$/)
  assert.equal(fs.existsSync(sb.company), false)
  assert.deepEqual(hashTree(sb.agents), before)
  // the company step fails (an invented broken issue prefix through a non-Latin name is fine; force a failure instead)
  const O2 = sb.mod('onboard.cjs')
  const C = require(path.join(sb.tools, 'agent-company.cjs'))
  const orig = C.companyInit
  C.companyInit = () => { throw Object.assign(new Error('disk said no'), { code: 500 }) }
  try { assert.throws(() => O2.create({ name: 'Shop', packs: ['hr', 'design'] }, board), /disk said no/) } finally { C.companyInit = orig }
  assert.deepEqual(hashTree(sb.agents), before, 'the pack files were removed again')
  assert.equal(fs.existsSync(sb.company), false)
  // with runs but no company: a banner, not the wizard (T-3.3)
  sb.run({ agent: 'tester' })
  assert.deepEqual([O2.status().wizard, O2.status().banner], [false, true])
  // a Persian name: the prefix falls back to CO, the name is stored in both fields (T-3.5)
  const r = O2.create({ name: 'نانوایی آبی', lang: 'fa', packs: ['design'] }, board)
  assert.equal(r.issuePrefix, 'CO')
  const co = sb.read('company/company.json')
  assert.equal(co.name, 'نانوایی آبی'); assert.equal(co.nameFa, 'نانوایی آبی')
})

// ---------- phone approvals (token core)
test('T-8.3/T-8.4/T-8.5/T-8.9: a phone token works once, never with another key, never late, never after an edit', (t) => {
  const { sb, sup } = setup(t)
  process.env.ARSENALE_PHONE_KEY = 'k'.repeat(40)
  t.after(() => { delete process.env.ARSENALE_PHONE_KEY })
  const N = sb.mod('notify.cjs')
  const L = sb.mod('runlog.cjs')
  N.rotate()
  // an action approval in a category the phone may approve (a bare yes/no question gets no button)
  const asked = sb.mod('policy.cjs').checkAction({ team_member: 'copywriter', category: 'post.public', summary: 'Post the autumn menu on Instagram' }, sup)
  const g = sb.read('agent-runs/gates/' + asked.question_id + '.json')
  const tok = N.sign(g, 'approve')
  // another key: refused, counted, the gate still waits
  const other = (() => { process.env.ARSENALE_PHONE_KEY = 'z'.repeat(40); const x = N.sign(g, 'approve'); process.env.ARSENALE_PHONE_KEY = 'k'.repeat(40); return x })()
  const forged = N.accept(other, 'ntfy')
  assert.equal(forged.ok, false); assert.equal(forged.reason, 'signature')
  assert.equal(sb.read('agent-runs/gates/' + g.id + '.json').status, 'waiting')
  assert.equal(N.readConfig().ntfy.invalidToday, 1)
  // late: refused with the sentence
  const late = N.accept(tok, 'ntfy', { now: Date.now() + 31 * 60000 })
  assert.deepEqual([late.ok, late.message], [false, 'This request expired; open Arsenale to answer'])
  // good: answered as the owner, from the phone
  const yes = N.accept(tok, 'ntfy')
  assert.equal(yes.ok, true)
  const saved = sb.read('agent-runs/gates/' + g.id + '.json')
  assert.equal(saved.status, 'answered'); assert.equal(saved.answer, 'approve')
  const line = sb.lines('agent-runs/answers.jsonl').pop()
  assert.equal(line.via, 'phone:ntfy')
  // again: "Already answered"
  const again = N.accept(tok, 'ntfy')
  assert.equal(again.ok, false); assert.match(again.message, /^Already answered/)
  // a question edited after sending
  const g2 = L.gate({ question: 'Open on Sunday?', kind: 'approval' }, sup)
  const t2 = N.sign(g2, 'decline')
  const f = path.join(sb.runs, 'gates', g2.id + '.json')
  const raw = JSON.parse(fs.readFileSync(f, 'utf8')); raw.question = 'Open on Sunday and Monday?'; fs.writeFileSync(f, JSON.stringify(raw))
  assert.equal(N.accept(t2, 'ntfy').reason, 'changed')
  // sign out all phones: every outstanding button dies
  const g3 = L.gate({ question: 'Third?', kind: 'approval' }, sup)
  const t3 = N.sign(g3, 'approve')
  N.rotate()
  assert.equal(N.accept(t3, 'telegram').reason, 'signature')
})

test('T-8.6/T-8.7/T-8.8: minimal messages carry nothing; payments get no buttons; only the paired chat counts', (t) => {
  const { sb, sup } = setup(t)
  const N = sb.mod('notify.cjs')
  const Po = sb.mod('policy.cjs')
  Po.ensureDefaults()
  const L = sb.mod('runlog.cjs')
  const g = L.gate({ question: 'Post the autumn menu?', kind: 'approval', officeId: 'studio' }, sup)
  const min = N.message(g, 'ntfy')
  assert.deepEqual([min.text, min.buttons.length], ['Arsenale: 1 question waiting (Studio)', 0])
  const c = N.readConfig(); c.ntfy.details = true; N.saveConfig(c)
  // a plain yes/no question: its text, but no buttons (no category behind it)
  const det = N.message(g, 'ntfy')
  assert.equal(det.buttons.length, 0)
  assert.match(det.text, /Post the autumn menu/)
  assert.match(det.text, /Open Arsenale to answer/)
  const act = Po.checkAction({ team_member: 'copywriter', category: 'post.public', summary: 'post the autumn menu' }, sup)
  assert.equal(N.message(sb.read('agent-runs/gates/' + act.question_id + '.json'), 'ntfy').buttons.length, 2)
  const pay = Po.checkAction({ team_member: 'finance-lead', category: 'payment', summary: 'pay the flour bill' }, sup)
  const pg = sb.read('agent-runs/gates/' + pay.question_id + '.json')
  const pm = N.message(pg, 'ntfy')
  assert.equal(pm.buttons.length, 0)
  assert.match(pm.text, /Open Arsenale on your computer to approve payments/)
  // an open question is notify-only
  assert.equal(N.message(L.gate({ question: 'Which flour?', kind: 'A' }, sup), 'ntfy').buttons.length, 0)
  // telegram: a callback from another chat is ignored
  const cfg = N.readConfig(); cfg.telegram.chatId = '111'; N.saveConfig(cfg)
  assert.equal(N.telegramUpdate({ update_id: 1, callback_query: { id: 'q', data: 'a:abcdefgh', message: { chat: { id: 222 } } } }), null)
  assert.equal(N.readConfig().telegram.invalidToday, 1)
})

// ---------- connect your assistant
test('connect: a preview shows the change; apply needs the same hash, keeps a backup and refuses JSON with comments', (t) => {
  const { sb, board, sup } = setup(t)
  const fakeHome = path.join(sb.base, 'home')
  fs.mkdirSync(fakeHome)
  const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE }
  process.env.HOME = fakeHome; process.env.USERPROFILE = fakeHome
  t.after(() => { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v } })
  assert.equal(os.homedir(), fakeHome)
  const C = sb.mod('connect.cjs')
  const file = path.join(fakeHome, '.cursor', 'mcp.json')
  fs.mkdirSync(path.dirname(file))
  fs.writeFileSync(file, JSON.stringify({ mcpServers: { other: { command: 'x' } } }))
  const pv = C.preview('cursor')
  assert.equal(pv.file, file)
  // the page sees only the arsenale entry; the other servers stay in the file (below)
  assert.deepEqual(Object.keys(JSON.parse(pv.after).mcpServers), ['arsenale'])
  assert.deepEqual(JSON.parse(pv.after).mcpServers.arsenale.args.slice(-1), ['mcp'])
  assert.throws(() => C.apply('cursor', pv.hash, sup), /Only the owner/)
  assert.throws(() => C.apply('cursor', 'stale', board), /changed since you looked/)
  const r = C.apply('cursor', pv.hash, board)
  assert.ok(r.written && fs.existsSync(r.backup))
  assert.deepEqual(JSON.parse(fs.readFileSync(r.backup, 'utf8')), { mcpServers: { other: { command: 'x' } } })
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).mcpServers.other, { command: 'x' }, 'other servers stay')
  assert.equal(C.preview('cursor').unchanged, true)
  fs.writeFileSync(file, '{ // a comment\n "mcpServers": {} }')
  assert.throws(() => C.preview('cursor'), /comments or is not plain JSON/)
  // the cards carry the exact command and links, and ChatGPT says plainly it cannot connect
  const cc = C.card('claude-code')
  assert.match(cc.command, /^claude mcp add --scope user arsenale -- .+ mcp$/)
  assert.match(C.card('cursor').link, /^cursor:\/\/anysphere\.cursor-deeplink\/mcp\/install\?name=arsenale&config=/)
  assert.match(C.card('vscode').link, /^vscode:mcp\/install\?/)
  assert.match(C.card('chatgpt').note, /public internet/)
  const codex = C.preview('codex')
  assert.match(codex.after, /\[mcp_servers\.arsenale\]/)
})
