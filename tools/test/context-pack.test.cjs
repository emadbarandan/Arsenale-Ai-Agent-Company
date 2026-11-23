/* S6 Context packs (spec 1.3 section 6): size cap, signature, privacy, scope,
 * read-only MCP. Invented data; secrets below are planted fakes. */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const { makeSandbox, mcpClient, SEED } = require('./helpers.cjs')

const board = { door: 'dashboard', role: 'board', name: '' }
const SECRET = '/home/u/secrets/prod.pem'
const ENVV = 'API_KEY=sk-planted-0123456789'
const BRIEF = 'PLANTED-BRIEF-TEXT'
const TRANSCRIPT = 'PLANTED-TRANSCRIPT-TEXT'

function setup(t) {
  const sb = makeSandbox()
  t.after(() => sb.cleanup())
  sb.mod('agent-company.cjs').companyInit(SEED, ['implementer', 'tester'])
  return { sb, T: sb.mod('tasks.cjs'), C: sb.mod('context-pack.cjs') }
}
const state = () => ({
  runs: [
    { id: 'r1', agent: 'implementer', modelKey: 'Sonnet 5.5', tokSrc: 'transcript', tokTotal: 1200, costUsd: null, summary: 'Did a thing ' + SECRET + ' ' + ENVV, projectKey: 'Demo Calc', brief: BRIEF, transcript: { text: TRANSCRIPT } },
    { id: 'r2', agent: 'tester', modelKey: 'Opus 5.5', tokSrc: 'transcript', tokTotal: 900, costUsd: 0.5, summary: 'OTHER-PROJECT-RUN', projectKey: 'Tide app' },
  ],
  gates: [{ id: 'g1', project: 'Demo Calc', projectKey: 'Demo Calc', status: 'waiting', question: 'Ship it?', choices: [{ label: 'Yes' }] }],
  decisions: [{ id: 'd1', project: 'Demo Calc', projectKey: 'Demo Calc', state: 'open', text: 'Pick a name', reason: 'short is better' }],
})

test('AT1+AT4: demo project pack fits, has the parts, and carries no brief, transcript, secret path or env value', (t) => {
  const { T, C } = setup(t)
  T.createTask({ title: 'Plan the thing ' + SECRET, projectId: 'demo-calc', acceptance: 'It works ' + ENVV, type: 'feature', size: 'M' }, board)
  const r = C.build('demo-calc', { state: state() })
  assert.ok(r.tokens <= 1500)
  assert.equal(r.tokens, Math.ceil(r.markdown.length / 4))
  assert.match(r.markdown, /Demo Calc/); assert.match(r.markdown, /Plan the thing/); assert.match(r.markdown, /Ship it\?/); assert.match(r.markdown, /Pick a name/); assert.match(r.markdown, /implementer/); assert.match(r.markdown, /n\/a/)
  for (const bad of [SECRET, 'prod.pem', 'sk-planted', BRIEF, TRANSCRIPT]) assert.ok(!r.markdown.includes(bad), bad)
})

test('AT2+AT5: 40 long tasks still fit with 5 tasks or fewer; another project\'s tasks never appear', (t) => {
  const { T, C } = setup(t)
  for (let i = 0; i < 40; i++) T.createTask({ title: 'Long task number ' + i + ' ' + 'word '.repeat(80), projectId: 'demo-calc', acceptance: 'accept '.repeat(200) }, board)
  T.createTask({ title: 'TIDE-ONLY-TASK', projectId: 'tide-app' }, board)
  const r = C.build('demo-calc', { state: state() })
  assert.ok(r.tokens <= 1500, String(r.tokens))
  const n = (r.markdown.match(/^- [A-Z]+-\d+ /gm) || []).length
  assert.ok(n >= 1 && n <= 5, 'tasks listed ' + n)
  assert.ok(!r.markdown.includes('TIDE-ONLY-TASK')); assert.ok(!r.markdown.includes('OTHER-PROJECT-RUN'))
})

test('AT3: after a task edit the signature changes and read returns the new title', (t) => {
  const { sb, T, C } = setup(t)
  const a = T.createTask({ title: 'Old title', projectId: 'demo-calc' }, board)
  const w = C.write('demo-calc', { state: state() })
  assert.ok(fs.existsSync(w.file))
  assert.match(C.read('demo-calc', { state: state() }).markdown, /Old title/)
  const sig = w.signature
  const later = new Date(Date.now() + 5000)
  T.updateTask({ id: a.id, title: 'Brand new title' }, board)
  fs.utimesSync(path.join(sb.company, 'issues', a.id + '.json'), later, later)
  const r = C.read('demo-calc', { state: state() })
  assert.notEqual(r.signature, sig)
  assert.match(r.markdown, /Brand new title/)
})

test('AT6: get_context works for an agent role and writes nothing', async (t) => {
  const sb = makeSandbox()
  sb.mod('agent-company.cjs').companyInit(SEED, ['implementer'])
  sb.mod('tasks.cjs').createTask({ title: 'Visible task', projectId: 'demo-calc' }, board)
  const c = mcpClient(sb, 'Claude Desktop')
  t.after(() => { c.close(); sb.cleanup() })
  await c.init()
  const before = fs.readdirSync(sb.root).sort().join()
  const r = await c.call('get_context', { project: 'demo-calc' })
  assert.equal(r.error, false)
  assert.match(r.text, /Visible task/)
  assert.ok(r.data.tokens <= 1500)
  assert.equal(fs.existsSync(path.join(sb.root, 'context')), false)
  assert.equal(fs.readdirSync(sb.root).sort().join(), before)
  const bad = await c.call('get_context', { project: 'nope' })
  assert.equal(bad.error, true)
})
