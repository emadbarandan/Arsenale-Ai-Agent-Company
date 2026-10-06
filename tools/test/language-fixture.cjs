/* The company the language tests (language.test.cjs) open the dashboard on: every
 * state the screens draw, all of it invented. Also usable by hand, to look at the
 * pages: node -e "require('./language-fixture.cjs').serve(4398)" */
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const { makeSandbox } = require('./helpers.cjs')

const SEED = {
  company: { name: 'Northwind Labs', issuePrefix: 'NW' },
  offices: [
    { id: 'engineering', name: 'Engineering', nameFa: 'مهندسی', leadEmployeeId: 'engineering-lead', theme: 'blue' },
    { id: 'studio', name: 'Software Studio', nameFa: 'استودیوی نرم‌افزار', leadEmployeeId: 'product-lead', theme: 'teal' },
    { id: 'hq', name: 'Headquarters', nameFa: 'دفتر مرکزی', leadEmployeeId: 'supervisor', theme: 'coral' },
    // no Persian name: the Persian page falls back to the English one
    { id: 'ops', name: 'Operations', leadEmployeeId: '', theme: 'violet' },
  ],
  projects: [
    { id: 'demo-calc', name: 'Demo Calc', key: 'DCALC', officeId: 'engineering', aliases: ['democalc', 'Demo Calc'] },
    { id: 'tide-app', name: 'Tide app', key: 'TIDE', officeId: 'studio', aliases: ['tide', 'پروژهٔ نمونه'] },
  ],
  employees: {
    'implementer': { homeOfficeId: 'studio' },
    'tester': { homeOfficeId: 'engineering' },
    'ui-designer': { homeOfficeId: 'studio' },
    'code-reviewer': { homeOfficeId: 'hq' },
    // a person whose definition file is gone: "retired"
    'ghost-agent': { homeOfficeId: 'engineering' },
  },
}

// invented text a person typed: it stays as written in both languages
const FA_TASK = 'کار نمونهٔ فارسی'
const FA_DECISION = 'تصمیم نمونهٔ فارسی'
const EN_DECISION = 'decision sample alpha'
const EN_TASK = 'invented task alpha'
const DATA_FA = [FA_TASK, FA_DECISION, 'پروژهٔ نمونه']

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** A company with every state the screens draw: working and quiet people, a
 *  visitor from another office, an overflow of guests, waiting and answered
 *  gates, decisions, budgets in every level, a paused person, a retired one,
 *  a contractor, unmapped and unassigned work. */
function fixture() {
  const sb = makeSandbox({ packs: true, prices: { Sonnet: { input: 2, output: 10, cacheRead: 0.2, cacheWrite5m: 2.5, cacheWrite1h: 4 } } })
  assert.equal(sb.cli('--company-init', '--seed', sb.seed(SEED)).code, 0)
  sb.cli('--heartbeat')
  sb.measured('tester', 'democalc', 2400000, { task: EN_TASK })
  sb.measured('implementer', 'tide', 130000, { task: FA_TASK })
  sb.measured('implementer', 'پروژهٔ نمونه', 20000, { task: EN_TASK + ' two' })
  sb.measured('code-reviewer', 'democalc', 5000, { model: 'Mystery 9', task: EN_TASK + ' three', status: 'findings', findings: ['finding sample'] })
  sb.measured('stranger-agent', 'democalc', 7000, { task: EN_TASK + ' four' })
  sb.measured('tester', 'no-such-project', 900, { task: EN_TASK + ' five', status: 'failed' })
  assert.equal(sb.cli('--budget', '{"scope":"office","id":"engineering","budget":{"monthlyTokens":150000,"softAlertPct":50,"hardStop":true},"by":"board"}').code, 0)
  assert.equal(sb.cli('--budget', '{"scope":"office","id":"studio","budget":{"monthlyTokens":9000000,"monthlyUsd":40,"softAlertPct":80},"by":"board"}').code, 0)
  assert.equal(sb.cli('--budget', '{"scope":"employee","id":"implementer","budget":{"monthlyTokens":160000,"softAlertPct":80},"by":"board"}').code, 0)
  assert.equal(sb.cli('--budget', '{"scope":"company","budget":{"monthlyTokens":9000000,"monthlyUsd":100},"by":"board"}').code, 0)
  assert.equal(sb.cli('--employee', '{"id":"code-reviewer","status":"paused","pauseReason":"pause sample","by":"board"}').code, 0)
  // running now: one fresh, one quiet, a visitor in another office, a pile of guests, and unassigned work
  const start = (agent, project) => sb.cli('--start', JSON.stringify({ agent, task: EN_TASK + ' ' + agent, project, model: 'sonnet' })).out
  const fresh = start('tester', 'democalc')
  sb.cli('--progress', JSON.stringify({ id: fresh, doing: 'step sample one' }))
  const quiet = start('ui-designer', 'tide')
  const visitor = start('implementer', 'democalc')
  start('guest-one', 'democalc'); start('guest-two', 'democalc'); start('guest-three', 'democalc'); start('guest-four', 'democalc')
  start('tester', 'orphan-project')
  // the quiet one has not reported for 40 minutes
  const aFile = fs.readdirSync(path.join(sb.runs, 'active')).find((f) => f.includes(quiet))
  const rec = JSON.parse(fs.readFileSync(path.join(sb.runs, 'active', aFile), 'utf8'))
  rec.startedAt = new Date(Date.now() - 40 * 60000).toISOString()
  fs.writeFileSync(path.join(sb.runs, 'active', aFile), JSON.stringify(rec))
  void visitor
  // gates: a waiting approval that is late, a waiting question with choices, an answered one
  const late = sb.cli('--gate', JSON.stringify({ project: 'democalc', kind: 'approval', question: 'invented approval question?', run: fresh })).out
  const gFile = path.join(sb.runs, 'gates', late + '.json')
  const g = JSON.parse(fs.readFileSync(gFile, 'utf8'))
  g.askedAt = new Date(Date.now() - 3 * 3600000).toISOString()
  fs.writeFileSync(gFile, JSON.stringify(g))
  sb.cli('--gate', JSON.stringify({ project: 'tide', kind: 'A', question: 'invented choice question?', choices: ['option one', 'option two'] }))
  const done = sb.cli('--gate', JSON.stringify({ project: 'tide', kind: 'B', question: 'invented answered question?' })).out
  sb.cli('--gate', JSON.stringify({ id: done, status: 'answered', answer: 'option two', by: 'user' }))
  sb.cli('--decision', JSON.stringify({ project: 'democalc', by: 'user', text: FA_DECISION }))
  sb.cli('--decision', JSON.stringify({ project: 'democalc', by: 'supervisor', text: EN_DECISION, state: 'open' }))
  sb.cli('--decision', JSON.stringify({ project: 'tide', by: 'agent', agent: 'tester', text: EN_DECISION + ' two' }))
  // the 1.0 screens: an office pack, a task with a comment, deliverables, and a
  // hire proposal and an action approval asked by an assistant over MCP
  const L = sb.mod('runlog.cjs')
  const board = L.actorFor('dashboard', 'board'), sup = L.actorFor('mcp', 'supervisor', { clientId: 'invented-client', client: { name: 'invented-client', version: '1' } })
  sb.mod('packs.cjs').installPack('customer-support', board)
  sb.mod('policy.cjs').ensureDefaults()
  const T = sb.mod('tasks.cjs')
  const task = T.createTask({ title: EN_TASK + ' six', description: 'task details sample', assignee: 'reply-drafter', dueDate: '2026-01-15', links: [{ url: 'https://example.org/sample' }, { path: 'C:\\work\\sample.docx' }], needsSignOff: true }, board)
  T.addComment(task.id, 'comment sample', board)
  T.createTask({ title: FA_TASK }, sup)
  const D = sb.mod('deliverables.cjs')
  D.addDeliverable({ title: 'deliverable sample', kind: 'text', mime: 'text/plain', content: 'deliverable text sample', team_member: 'reply-drafter', task_id: task.id }, sup)
  D.addDeliverable({ title: 'link sample', kind: 'link', url: 'https://example.org/sample', team_member: 'faq-writer' }, sup)
  sb.mod('team.cjs').propose({ name: 'Sample Person', title: 'sample title', office_id: 'support', description: 'drafts sample replies for the tests', instructions: 'sample instructions', why: 'sample reason' }, sup)
  sb.mod('policy.cjs').checkAction({ team_member: 'reply-drafter', category: 'message.send', summary: 'send sample reply', target: 'sample customer' }, sup)
  sb.mod('mcp-server.cjs').createSession({ transport: 'stdio' }).handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', clientInfo: { name: 'invented-client', version: '1' } } })
  return sb
}

/** For looking at the pages by hand: the fixture behind a dashboard server on
 *  the given port. Stops with Ctrl+C and leaves a folder in the temp directory. */
function serve(port) {
  const sb = fixture()
  const child = require('child_process').spawn(process.execPath, [path.join(sb.tools, 'agent-dashboard-server.cjs'), String(port)], { env: sb.env, stdio: 'inherit' })
  process.on('SIGINT', () => { child.kill(); sb.cleanup(); process.exit(0) })
}

module.exports = { SEED, FA_TASK, FA_DECISION, EN_DECISION, EN_TASK, DATA_FA, fixture, serve }
