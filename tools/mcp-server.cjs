#!/usr/bin/env node
/* Arsenale as an MCP server: the door through which an assistant (Claude
 * Desktop, Claude Code, Cursor, VS Code, Codex, Gemini CLI …) logs its work,
 * asks the owner, and reads its tasks, by itself.
 *
 *   arsenale mcp                     stdio: the client starts this process
 *   POST http://127.0.0.1:<port>/mcp the running dashboard (opt-in, bearer token)
 *
 * No dependency: a hand-written subset of the protocol (JSON-RPC 2.0;
 * initialize with version negotiation, ping, tools/list, tools/call,
 * prompts/list, prompts/get; resources/list answers an empty list). No
 * sampling, no roots, no server-to-client requests.
 *
 * The actor is fixed by this door: always the supervisor ("your assistant").
 * Nothing in a tool's arguments can make a call the owner's: answering,
 * approving, budgets, pauses, hiring, packs and the safety rules have no tool
 * here, and an argument "by":"board" is refused (runlog.cjs OWNER_ONLY).
 *
 * A logging tool must never make the assistant fail its real task: a storage
 * error comes back as a tool result with isError and one plain sentence, and
 * the server keeps running for the next call. Nothing is written to stdout
 * except protocol messages; diagnostics go to stderr.
 *
 * No process is ever started here.
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const P = require('./paths.cjs')
const L = require('./runlog.cjs')

const VERSION = (() => { try { return require('../package.json').version } catch { return '1.0.0' } })()
// newest first; a client asking for another gets the newest (the spec's rule)
const PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']
const MCP_DIR = path.join(P.HOME, 'mcp')
const CLIENTS = path.join(MCP_DIR, 'clients.json')
const READ_DIR = path.join(MCP_DIR, 'read')
const MAX_WAITING_PER_CLIENT = 50
const MAX_ACTIVE_PER_CLIENT = 50
// a JSON-RPC batch is at most this long, and every message in it counts
// toward the HTTP rate limit (20 a second)
const MAX_BATCH = 20
const { OWNER_ONLY, clipCp } = L

// A client calling unknown tools in a loop must not fill the activity log:
// at most this many "mcp.refused" lines a minute in this process, then one
// line saying the rest is not listed.
const REFUSED_PER_MINUTE = 10
const refusedLog = { from: 0, n: 0 }
function refusedLine() {
  const now = Date.now()
  if (now - refusedLog.from >= 60000) { refusedLog.from = now; refusedLog.n = 0 }
  refusedLog.n++
  return refusedLog.n <= REFUSED_PER_MINUTE ? 'one' : refusedLog.n === REFUSED_PER_MINUTE + 1 ? 'summary' : ''
}

const INSTRUCTIONS = `Arsenale is the owner's dashboard for the work you do. Use it like this:
- At the start of every conversation call hello, then get_inbox: it holds the tasks and changes the owner made on the dashboard.
- Before a distinct piece of work call start_job (the team member, the task); call log_step for each real step; end with finish_job and a plain one-line summary of what was done, in the user's language.
- When the owner may be away, use ask_you instead of asking in the chat, then read the answer with get_answers.
- Before anything that leaves this computer (sending a message, posting, paying, deleting, sharing, changing an account) call check_action and follow its verdict: allow = go ahead; ask = wait for the answer; never = do not do it.
- Register what you produce with add_deliverable.
- A team member is a role: call get_team_member and follow that brief for the task, and log the job under that member's name.
You cannot answer or approve questions, change budgets, hire, or change the safety rules: only the owner can, on the dashboard.`

// ---------- small helpers
const str = (v, n) => clipCp(v == null ? '' : String(v), n)
const ok = (text, data) => ({ content: [{ type: 'text', text }], structuredContent: data && typeof data === 'object' && !Array.isArray(data) ? data : { result: data } })
const err = (text) => ({ content: [{ type: 'text', text }], isError: true })
function readJson(f, fb) { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return fb } }
function writeJson(f, v) { fs.mkdirSync(path.dirname(f), { recursive: true }); require('./build-agent-dashboard.cjs').writeAtomic(f, JSON.stringify(v, null, 2)) }
const company = () => require('./agent-company.cjs')

/** A stable id per client program, from the name it gives at initialize. A
 *  label, not proof of identity: any program can claim any name. */
function clientIdOf(info) {
  const n = String(info && info.name || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
  return n || 'unknown-client'
}

/** Notes the client in mcp/clients.json: first and last seen, calls today. */
function stampClient(s, tool) {
  try {
    const all = readJson(CLIENTS, { clients: {} })
    all.clients = all.clients && typeof all.clients === 'object' ? all.clients : {}
    const now = new Date().toISOString()
    const day = now.slice(0, 10)
    const c = Object.hasOwn(all.clients, s.clientId) ? all.clients[s.clientId] : { firstSeen: now, calls: 0 }
    c.name = str(s.clientInfo.name, 60); c.version = str(s.clientInfo.version, 60); c.transport = s.transport; c.lastSeen = now
    if (c.day !== day) { c.day = day; c.callsToday = 0 }
    if (tool) { c.callsToday = (c.callsToday || 0) + 1; c.calls = (c.calls || 0) + 1; c.lastTool = tool }
    if (tool === 'hello') c.lastHello = now
    all.clients[s.clientId] = c
    writeJson(CLIENTS, all)
  } catch { /* a read-only folder: the call itself reports it */ }
}

function pointer(clientId) { return readJson(path.join(READ_DIR, clientId + '.json'), {}) || {} }
function savePointer(clientId, p) { writeJson(path.join(READ_DIR, clientId + '.json'), p) }

function readLinesOf(file) {
  let text = ''
  try { text = fs.readFileSync(file, 'utf8') } catch { return [] }
  return text.split('\n').filter((l) => l.trim()).map((l) => { try { return JSON.parse(l) } catch { return null } })
}

/** The plain sentence for a storage failure (R-1.8). */
function storageSentence(e, what) {
  const c = e && e.code
  if (c === 'EACCES' || c === 'EPERM' || c === 'EROFS') return 'Arsenale could not save ' + what + ': the data folder is read-only.'
  if (c === 'ENOSPC') return 'Arsenale could not save ' + what + ': the disk is full.'
  return null
}

// ---------- the tools
const S = (props, required) => ({ type: 'object', properties: props, required: required || [], additionalProperties: true })
const T = (type, description, extra) => Object.assign({ type, description }, extra || {})
const TOOLS = [
  { name: 'hello', description: 'Say hello to Arsenale at the start of a conversation. Returns the company, its offices, unread counts and the house rules digest.', inputSchema: S({ client: T('string', 'Your name, optional'), note: T('string', 'Optional note') }) },
  { name: 'start_job', description: 'Start a job before a distinct piece of work. Returns job_id and the budget verdict.', inputSchema: S({ team_member: T('string', 'Team member id doing the work (e.g. copywriter), or "supervisor" for yourself'), task: T('string', 'What the job is, one line'), project: T('string', 'Project name, optional'), office_id: T('string', 'Office id, optional'), task_id: T('string', 'Arsenale task id this job works on, e.g. BLU-4'), parent_job_id: T('string', 'The job that started this one, optional'), model: T('string', 'Model name, optional') }, ['team_member', 'task']) },
  { name: 'log_step', description: 'Log one real step of a job, in a short line in the user\'s language.', inputSchema: S({ job_id: T('string', 'From start_job'), doing: T('string', 'What you are doing now') }, ['job_id', 'doing']) },
  { name: 'finish_job', description: 'Finish a job with a plain one-line summary of what was done.', inputSchema: S({ job_id: T('string', 'From start_job'), status: T('string', 'ok | findings | failed | stopped', { enum: ['ok', 'findings', 'failed', 'stopped'] }), summary: T('string', 'What was done, one plain sentence'), what_was_done: T('array', 'Up to 10 short items', { items: { type: 'string' } }), findings: T('array', 'Up to 20 findings', { items: { type: 'string' } }), deliverable_ids: T('array', 'Ids from add_deliverable', { items: { type: 'string' } }), usage: T('object', '{tokens, input_tokens, output_tokens, duration_ms, model, estimated}') }, ['job_id', 'status', 'summary']) },
  { name: 'ask_you', description: 'Ask the owner on the dashboard (use when they may be away). kind: question (free answer), choice (2-8 choices), approval (yes/no). Read the answer later with get_answers.', inputSchema: S({ question: T('string', 'The question'), kind: T('string', 'question | choice | approval', { enum: ['question', 'choice', 'approval'] }), choices: T('array', '2 to 8 choices for kind choice', { items: { type: 'string' } }), project: T('string', 'optional'), job_id: T('string', 'optional'), task_id: T('string', 'optional') }, ['question', 'kind']) },
  { name: 'get_answers', description: 'Answers the owner gave to questions you asked, since your last read.', inputSchema: S({ question_ids: T('array', 'Only these questions (also ones asked before you connected)', { items: { type: 'string' } }), peek: T('boolean', 'Do not mark them read') }) },
  { name: 'get_inbox', description: 'New tasks, comments and changes the owner made on the dashboard since your last read.', inputSchema: S({ peek: T('boolean', 'Do not mark them read') }) },
  { name: 'list_tasks', description: 'List tasks (summaries).', inputSchema: S({ status: T('array', 'Filter: todo, in_progress, waiting_for_you, blocked, done, cancelled, backlog', { items: { type: 'string' } }), office_id: T('string', 'optional'), assignee: T('string', 'team member id, optional'), limit: T('number', 'at most 50') }) },
  { name: 'get_task', description: 'One task with its comments and links.', inputSchema: S({ task_id: T('string', 'e.g. BLU-4') }, ['task_id']) },
  { name: 'create_task', description: 'Create a task, for example to split work. The owner sees it on the dashboard.', inputSchema: S({ title: T('string', '1-200 characters'), description: T('string', 'optional'), assignee: T('string', 'team member id, optional'), office_id: T('string', 'optional'), parent_id: T('string', 'optional parent task id') }, ['title']) },
  { name: 'update_task', description: 'Move a task (in_progress, waiting_for_you, blocked, done) and/or comment on it. A task that needs the owner\'s sign-off cannot be set done: set waiting_for_you.', inputSchema: S({ task_id: T('string', 'e.g. BLU-4'), status: T('string', 'in_progress | waiting_for_you | blocked | done', { enum: ['in_progress', 'waiting_for_you', 'blocked', 'done'] }), comment: T('string', 'optional'), job_id: T('string', 'optional: link this job') }, ['task_id']) },
  { name: 'add_comment', description: 'Comment on a task.', inputSchema: S({ task_id: T('string', 'e.g. BLU-4'), text: T('string', 'at most 4000 characters'), job_id: T('string', 'optional') }, ['task_id', 'text']) },
  { name: 'add_deliverable', description: 'Register something the team produced: a link (url), a file (path, copied only from the owner\'s deliverable folders) or content (text, or a base64 image with mime).', inputSchema: S({ title: T('string', 'at most 120 characters'), kind: T('string', 'document | image | link | file | text', { enum: ['document', 'image', 'link', 'file', 'text'] }), url: T('string', 'http(s) link'), path: T('string', 'absolute file path'), content: T('string', 'text, or base64 for an image'), mime: T('string', 'for content: text/markdown, text/plain, text/csv, image/png, image/jpeg, image/gif, image/webp'), job_id: T('string', 'optional'), task_id: T('string', 'optional'), team_member: T('string', 'optional'), note: T('string', 'optional') }, ['title', 'kind']) },
  { name: 'record_decision', description: 'Record a decision you took (or an open question you leave to the owner, with open true).', inputSchema: S({ text: T('string', 'The decision'), reason: T('string', 'optional'), job_id: T('string', 'optional'), project: T('string', 'optional'), open: T('boolean', 'optional') }, ['text']) },
  { name: 'check_action', description: 'Before any action that leaves this computer, ask whether it is allowed. Categories: message.send, post.public, payment, delete, share.external, account.change, other.external. Verdict allow, ask (+ question_id: wait for get_answers) or never.', inputSchema: S({ team_member: T('string', 'who acts'), category: T('string', 'the action category'), summary: T('string', 'what exactly, one line'), target: T('string', 'where or to whom, optional'), job_id: T('string', 'optional'), ask_now: T('boolean', 'default true: open the approval question now') }, ['team_member', 'category', 'summary']) },
  { name: 'check_budget', description: 'Read-only budget check for a team member before work: ok, warn or stop.', inputSchema: S({ team_member: T('string', 'team member id'), project: T('string', 'optional') }, ['team_member']) },
  { name: 'list_team', description: 'The team: id, title, office, strength, one line, and the safety rules summary.', inputSchema: S({ office_id: T('string', 'optional') }) },
  { name: 'get_team_member', description: 'A team member\'s role brief to follow for a task, with their safety rules.', inputSchema: S({ team_member: T('string', 'team member id') }, ['team_member']) },
  { name: 'propose_hire', description: 'Propose a new team member when a role is missing. The owner approves it on the dashboard; nothing is created before that.', inputSchema: S({ name: T('string', 'display name'), title: T('string', 'job title'), office_id: T('string', 'office id'), instructions: T('string', 'plain-language instructions, at most 8000 characters'), description: T('string', 'one line, 10-300 characters'), tier: T('string', 'light | standard | heavy'), reports_to: T('string', 'optional'), why: T('string', 'why this role is needed') }, ['name', 'title', 'office_id', 'instructions', 'why']) },
]
const TOOL_NAMES = new Set(TOOLS.map((t) => t.name))

const PROMPTS = [
  { name: 'start-my-day', description: 'Say hello to Arsenale, read the inbox and list the tasks waiting.' },
  { name: 'log-this-work', description: 'Log the work of this conversation in Arsenale as a job with a plain summary.' },
]
const PROMPT_TEXT = {
  'start-my-day': 'Call the Arsenale tools hello and get_inbox, then list_tasks with status todo and in_progress. Tell me in plain words what is waiting, newest first, and ask which task to start.',
  'log-this-work': 'Log the work we did in this conversation in Arsenale: start_job for the team member who did it, log_step for each real step, then finish_job with a one-line summary of what was done and a short what_was_done list.',
}

/** What the employees are, for list_team and hello: the definitions plus
 *  the company overlay, plus the safety rules that apply to each. */
function team(officeId) {
  const B = require('./build-agent-dashboard.cjs')
  const pol = require('./policy.cjs')
  const co = company().readCompany()
  const policy = pol.readPolicy()
  const agents = B.collect().agents
  return agents.map((a) => {
    const ov = co.configured && Object.hasOwn(co.employees, a.name) ? co.employees[a.name] : {}
    const eff = pol.effective(a.name, policy)
    const asks = Object.entries(eff).filter(([, v]) => v.value !== 'allow').map(([k, v]) => k + ':' + v.value)
    return { id: a.name, title: str(ov.title || '', 60), office_id: ov.homeOfficeId || '', tier: ov.tier || '', description: str(a.descriptionEn || a.description, 300), status: ov.status || 'active', policy: asks.join(', ') }
  }).filter((m) => m.status !== 'retired' && (!officeId || m.office_id === officeId))
}

/** One session: one MCP connection (a stdio process, or an HTTP session). */
function createSession(opts) {
  const s = { transport: (opts && opts.transport) || 'stdio', clientInfo: { name: '', version: '' }, clientId: 'unknown-client', protocol: PROTOCOLS[0], initialized: false }
  const actor = () => L.actorFor('mcp', 'supervisor', { client: s.clientInfo, clientId: s.clientId })

  function refused(tool) {
    const line = refusedLine()
    const who = s.clientInfo.name || s.clientId
    const summary = line === 'one' ? 'refused ' + str(tool, 60) + ' from ' + who : 'more than ' + REFUSED_PER_MINUTE + ' refused calls this minute (the last from ' + who + '): the rest of the minute is not listed'
    if (line) { try { company().activity({ actor: 'supervisor', action: 'mcp.refused', entityType: 'mcp', entityId: line === 'one' ? str(tool, 60) : 'many', summary, via: 'mcp' }) } catch { /* no company */ } }
    return err(OWNER_ONLY)
  }

  const H = {
    hello() {
      try { company().stampHeartbeat(s.clientInfo.name) } catch { /* no company */ }
      const co = company().readCompany()
      const p = pointer(s.clientId)
      const inbox = readLinesOf(company().fileOf('inbox')).length - (Number(p.inboxLines) || 0)
      const answers = readLinesOf(P.ANSWERS).slice(Number(p.answersLines) || 0).filter((a) => a && a.clientId === s.clientId).length
      let tasks = 0
      try { tasks = require('./tasks.cjs').listTasks({ status: ['todo', 'in_progress', 'blocked'] }).length } catch { /* none */ }
      const data = {
        company: co.configured ? co.company.name : '', configured: co.configured,
        offices: co.configured ? co.offices.filter((o) => !o.builtIn && !o.archived).map((o) => ({ id: o.id, name: o.name })) : [],
        unread: { inbox: Math.max(0, inbox), answers, open_tasks: tasks }, house_rules: INSTRUCTIONS,
      }
      return ok('Hello from Arsenale' + (data.company ? ' (' + data.company + ')' : '') + '. Unread: ' + data.unread.inbox + ' inbox, ' + answers + ' answers; ' + tasks + ' open tasks.' + (co.configured ? '' : ' No company is set up yet: the owner can set it up on the dashboard.'), data)
    },
    start_job(a) {
      const member = str(a.team_member, 60)
      if (!member) return err('team_member is required')
      const open = (() => { try { return fs.readdirSync(P.ACTIVE).map((n) => readJson(path.join(P.ACTIVE, n), null)).filter((r) => r && r.clientId === s.clientId).length } catch { return 0 } })()
      if (open >= MAX_ACTIVE_PER_CLIENT) return err('You have ' + open + ' jobs open already. Finish some with finish_job before starting more.')
      const r = L.startRun({ agent: member, task: str(a.task, 200), project: str(a.project, 80), officeId: a.office_id ? str(a.office_id, 40) : undefined, issue: a.task_id ? str(a.task_id, 20) : undefined, parent: a.parent_job_id ? str(a.parent_job_id, 80) : undefined, model: str(a.model, 60) }, actor())
      const verdict = r.budget ? r.budget.level : 'ok'
      return ok('Job started: ' + r.id + '. Budget: ' + verdict + (r.warnings.length ? ' (' + r.warnings[0].replace(/^WARNING: /, '') + ')' : ''), { job_id: r.id, budget: verdict, budget_line: r.budget ? r.budget.lines.join('; ') : 'ok' })
    },
    log_step(a) {
      L.progress({ id: str(a.job_id, 80), doing: str(a.doing, 300) }, actor())
      return ok('ok', { ok: true })
    },
    finish_job(a) {
      const id = str(a.job_id, 80)
      const run = L.readActive(id)
      if (!run) return err('No job is active with that id. Start one with start_job.')
      const status = ['ok', 'findings', 'failed', 'stopped'].includes(a.status) ? a.status : 'ok'
      const u = a.usage && typeof a.usage === 'object' ? a.usage : null
      const usage = u ? { tokens: Number(u.tokens) || (Number(u.input_tokens) || 0) + (Number(u.output_tokens) || 0), inputTokens: u.input_tokens, outputTokens: u.output_tokens, durationMs: Number(u.duration_ms) || 0, model: str(u.model, 60), estimated: u.estimated === true } : undefined
      const r = L.finishRun({
        id, agent: run.agent, task: run.task, project: run.project, status, summary: str(a.summary, 300),
        findings: Array.isArray(a.findings) ? a.findings.slice(0, 20).map((f) => str(f, 300)) : [],
        whatWasDone: Array.isArray(a.what_was_done) ? a.what_was_done : [], deliverables: Array.isArray(a.deliverable_ids) ? a.deliverable_ids : [], usage,
      }, actor())
      try { L.noteIncidents() } catch { /* no company */ }
      return ok('Job finished: ' + path.basename(r.file), { job_id: id, record: path.basename(r.file) })
    },
    ask_you(a) {
      const kinds = { question: 'A', choice: 'B', approval: 'approval' }
      if (!Object.hasOwn(kinds, a.kind)) return err('kind must be question, choice or approval')
      const question = str(a.question, 1000).trim()
      if (!question) return err('question is required')
      let choices
      if (a.kind === 'choice') {
        choices = (Array.isArray(a.choices) ? a.choices : []).map((c) => str(c, 60)).filter(Boolean)
        if (choices.length < 2 || choices.length > 8) return err('A choice question needs 2 to 8 choices')
      }
      const waiting = (() => { try { return fs.readdirSync(P.GATES).map((n) => readJson(path.join(P.GATES, n), null)).filter((g) => g && g.status === 'waiting' && g.clientId === s.clientId).length } catch { return 0 } })()
      if (waiting >= MAX_WAITING_PER_CLIENT) return err('You have ' + waiting + ' questions waiting already. Wait for the owner to answer some before asking more.')
      const g = L.gate({ question, kind: kinds[a.kind], choices, project: str(a.project, 80), run: a.job_id ? str(a.job_id, 80) : undefined, taskId: a.task_id ? str(a.task_id, 20) : undefined }, actor())
      try { require('./notify.cjs').onQuestion(g) } catch { /* phone channels are optional */ }
      return ok('Question sent to the owner: ' + g.id + '. Read the answer later with get_answers.', { question_id: g.id })
    },
    get_answers(a) {
      const all = readLinesOf(P.ANSWERS)
      const p = pointer(s.clientId)
      const from = Number(p.answersLines) || 0
      const ids = Array.isArray(a.question_ids) ? new Set(a.question_ids.slice(0, 50).map((x) => String(x))) : null
      const pick = (x) => x && (ids ? ids.has(x.gate) : x.clientId === s.clientId)
      const list = (ids ? all : all.slice(from)).filter(pick).map((x) => ({ question_id: x.gate, type: x.type === 'dismiss' ? 'dismissed' : 'answer', answer: x.answer || '', question: str(x.question, 300), at: x.at, via: x.via || 'dashboard' }))
      if (!a.peek && all.length > from) savePointer(s.clientId, Object.assign(p, { answersLines: all.length }))
      if (!list.length) return ok('No new answers.', { answers: [] })
      return ok(list.map((x) => (x.type === 'dismissed' ? 'Dismissed (no answer needed): ' : 'Answer to ' + x.question_id + ': ') + x.answer + (x.question ? ' — Q: ' + x.question : '')).join('\n'), { answers: list })
    },
    get_inbox(a) {
      const all = readLinesOf(company().fileOf('inbox'))
      const p = pointer(s.clientId)
      const from = Number(p.inboxLines) || 0
      const fresh = all.slice(from).filter(Boolean).map((l) => ({ at: l.at, type: l.type, id: l.id || '', summary: l.summary }))
      if (!a.peek && all.length > from) {
        savePointer(s.clientId, Object.assign(p, { inboxLines: all.length }))
        const taskIds = fresh.filter((l) => /^(task|comment)\./.test(l.type) && l.id).map((l) => l.id)
        if (taskIds.length) { try { require('./tasks.cjs').markSeen([...new Set(taskIds)], s.clientId) } catch { /* gone */ } }
      }
      if (!fresh.length) return ok('Nothing new in the inbox.', { items: [] })
      return ok(fresh.map((l) => '[' + l.type + '] ' + l.summary).join('\n'), { items: fresh })
    },
    list_tasks(a) {
      const Tk = require('./tasks.cjs')
      const back = { in_review: 'waiting_for_you' }
      const want = Array.isArray(a.status) ? a.status.map((x) => (x === 'waiting_for_you' ? 'in_review' : String(x))) : undefined
      const list = Tk.listTasks({ status: want, officeId: a.office_id ? str(a.office_id, 40) : '', assignee: a.assignee ? str(a.assignee, 60) : '' }).slice(0, Math.min(50, Number(a.limit) || 50))
        .map((t) => Object.assign({}, t, { status: back[t.status] || t.status }))
      if (!list.length) return ok('No tasks.', { tasks: [] })
      return ok(list.map((t) => t.id + ' [' + t.status + '] ' + t.title + (t.assigneeAgentId ? ' → ' + t.assigneeAgentId : '') + (t.dueDate ? ' (due ' + t.dueDate + ')' : '')).join('\n'), { tasks: list })
    },
    get_task(a) {
      const t = require('./tasks.cjs').getTask(str(a.task_id, 20), { seenBy: s.clientId })
      const view = { id: t.id, title: t.title, description: t.description, status: t.status === 'in_review' ? 'waiting_for_you' : t.status, assignee: t.assigneeAgentId || t.assigneeUserId || '', office_id: t.assigneeOfficeId || '', due: t.dueDate || '', needs_sign_off: !!t.needsSignOff, links: t.links || [], jobs: t.runIds || [], comments: t.comments.map((c) => ({ by: c.by, at: c.at, text: c.text })) }
      return ok(t.id + ': ' + t.title + ' [' + view.status + ']' + (t.description ? '\n' + t.description : '') + (view.comments.length ? '\nComments:\n' + view.comments.map((c) => c.by + ': ' + c.text).join('\n') : ''), view)
    },
    create_task(a) {
      const t = require('./tasks.cjs').createTask({ title: a.title, description: a.description, assignee: a.assignee, assigneeOfficeId: a.office_id, parentId: a.parent_id }, actor())
      return ok('Task created: ' + t.id, { task_id: t.id })
    },
    update_task(a) {
      const Tk = require('./tasks.cjs')
      const id = str(a.task_id, 20)
      let changed = []
      if (a.status !== undefined) {
        if (!Object.hasOwn(Tk.MCP_STATUS, a.status)) return err('status must be in_progress, waiting_for_you, blocked or done')
        changed = Tk.updateTask({ id, status: Tk.MCP_STATUS[a.status] }, actor()).changed
      }
      if (a.job_id) Tk.linkRun(id, str(a.job_id, 80), actor(), { finish: true })
      if (a.comment) Tk.addComment(id, a.comment, actor(), { jobId: a.job_id })
      if (a.status === undefined && !a.comment && !a.job_id) return err('Give a status, a comment or a job_id')
      return ok('ok', { ok: true, changed })
    },
    add_comment(a) {
      const Tk = require('./tasks.cjs')
      const id = str(a.task_id, 20)
      let who = actor()
      const job = a.job_id ? L.readActive(str(a.job_id, 80)) : null
      const t = Tk.readTask(id)
      // a job of a team member linked to this task: the comment is theirs (R-1.2)
      if (job && t && (t.runIds || []).includes(job.id) && job.agent && job.agent !== 'supervisor') who = L.actorFor('mcp', 'agent', { name: job.agent, client: s.clientInfo, clientId: s.clientId })
      const c = Tk.addComment(id, a.text, who, { jobId: job ? job.id : undefined, jobAgent: job ? job.agent : undefined })
      return ok('Comment added.', { comment_id: c.id })
    },
    add_deliverable(a) {
      const r = require('./deliverables.cjs').addDeliverable(a, actor())
      return ok('Deliverable ' + r.id + ': ' + r.state + (r.reason ? ' (' + r.reason + ')' : ''), { deliverable_id: r.id, state: r.state, reason: r.reason })
    },
    record_decision(a) {
      const d = L.decision({ text: str(a.text, 1000), reason: str(a.reason, 1000), run: a.job_id ? str(a.job_id, 80) : undefined, project: str(a.project, 80), state: a.open ? 'open' : undefined }, actor())
      return ok('Decision recorded: ' + d.id, { decision_id: d.id })
    },
    check_action(a) {
      const r = require('./policy.cjs').checkAction(a, actor())
      if (r.verdict === 'ask' && r.question_id) { try { require('./notify.cjs').onQuestion({ id: r.question_id }) } catch { /* optional */ } }
      return ok(r.verdict + (r.question_id ? ' (question ' + r.question_id + ')' : '') + ': ' + r.message, { verdict: r.verdict, question_id: r.question_id || '', message: r.message })
    },
    check_budget(a) {
      const r = L.budgetCheck({ agent: str(a.team_member, 60), project: str(a.project, 80) })
      return ok(r.lines.join('\n'), { verdict: r.level === 'stop' ? 'stop' : r.level === 'warn' ? 'warn' : 'ok', lines: r.lines })
    },
    list_team(a) {
      const list = team(a.office_id ? str(a.office_id, 40) : '')
      if (!list.length) return ok('No team members yet.', { team: [] })
      return ok(list.map((m) => m.id + (m.title ? ' (' + m.title + ')' : '') + (m.office_id ? ' · ' + m.office_id : '') + ': ' + m.description).join('\n'), { team: list })
    },
    get_team_member(a) {
      const id = String(a.team_member || '')
      // the same check as an employee id, and the name must be a defined agent:
      // nothing here opens a path the caller made up
      if (!/^[A-Za-z0-9][\w.-]{0,59}$/.test(id) || id.includes('..')) return err('team_member must be a team member id')
      const file = P.agentFiles().get(id)
      if (!file || require('./deliverables.cjs').SECRET.test(file)) return err('No team member named ' + str(id, 60))
      let text = ''
      try { text = fs.readFileSync(file, 'utf8') } catch { return err('Arsenale could not read this team member\'s file.') }
      const body = clipCp(text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, ''), 32 * 1024)
      const eff = require('./policy.cjs').effective(id)
      const rules = Object.entries(eff).map(([k, v]) => k + ': ' + (v.value === 'allow' ? 'allowed' : v.value === 'ask' ? 'ask the owner first (check_action)' : 'never')).join('\n')
      return ok('Role brief for ' + id + ':\n\n' + body + '\n\nSafety rules for ' + id + ':\n' + rules, { team_member: id, brief: body, policy: Object.fromEntries(Object.entries(eff).map(([k, v]) => [k, v.value])), house_rules: INSTRUCTIONS })
    },
    propose_hire(a) {
      const r = require('./team.cjs').propose(a, actor())
      return ok('Hire proposed to the owner: question ' + r.question_id + ' (id ' + r.id + '). Read the decision with get_answers.', r)
    },
  }

  function callTool(params) {
    const name = String(params && params.name || '')
    const args = params && params.arguments && typeof params.arguments === 'object' && !Array.isArray(params.arguments) ? params.arguments : {}
    if (!TOOL_NAMES.has(name)) return refused(name)
    // a body cannot speak for the owner (R-0.1)
    if (String(args.by || '').toLowerCase() === 'board' || String(args.actor || '').toLowerCase() === 'board') return refused(name)
    stampClient(s, name)
    try {
      return H[name](args)
    } catch (e) {
      if (e && e.code === 403) { const r = refused(name); if (String(e.message).includes(OWNER_ONLY)) r.content[0].text = String(e.message); return r }
      const sentence = storageSentence(e, name === 'log_step' ? 'this step' : 'this')
      if (sentence) return err(sentence)
      return err(String(e && e.message || e).split('\n')[0].slice(0, 300))
    }
  }

  /** One JSON-RPC message in, the reply out (null for a notification). */
  function handle(msg) {
    if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
      if (msg && typeof msg === 'object' && msg.jsonrpc === '2.0' && msg.method === undefined && (msg.result !== undefined || msg.error !== undefined)) return null // a reply to nothing we sent
      return { jsonrpc: '2.0', id: msg && (typeof msg.id === 'string' || typeof msg.id === 'number') ? msg.id : null, error: { code: -32600, message: 'Invalid Request' } }
    }
    const isNote = msg.id === undefined || msg.id === null
    const reply = (result) => (isNote ? null : { jsonrpc: '2.0', id: msg.id, result })
    const fault = (code, message) => (isNote ? null : { jsonrpc: '2.0', id: msg.id, error: { code, message } })
    const p = msg.params && typeof msg.params === 'object' ? msg.params : {}
    switch (msg.method) {
      case 'initialize': {
        const want = String(p.protocolVersion || '')
        s.protocol = PROTOCOLS.includes(want) ? want : PROTOCOLS[0]
        const ci = p.clientInfo && typeof p.clientInfo === 'object' ? p.clientInfo : {}
        s.clientInfo = { name: str(ci.name, 60), version: str(ci.version, 60) }
        s.clientId = clientIdOf(s.clientInfo)
        s.initialized = true
        stampClient(s, '')
        return reply({ protocolVersion: s.protocol, capabilities: { tools: { listChanged: false }, prompts: { listChanged: false } }, serverInfo: { name: 'arsenale', title: 'Arsenale', version: VERSION }, instructions: INSTRUCTIONS })
      }
      case 'notifications/initialized': case 'notifications/cancelled': case 'notifications/progress': case 'notifications/roots/list_changed':
        return null
      case 'ping': return reply({})
      case 'tools/list': return reply({ tools: TOOLS })
      case 'tools/call': return reply(callTool(p))
      case 'prompts/list': return reply({ prompts: PROMPTS })
      case 'prompts/get': {
        const name = String(p.name || '')
        if (!Object.hasOwn(PROMPT_TEXT, name)) return fault(-32602, 'Unknown prompt: ' + str(name, 60))
        return reply({ description: PROMPTS.find((x) => x.name === name).description, messages: [{ role: 'user', content: { type: 'text', text: PROMPT_TEXT[name] } }] })
      }
      case 'resources/list': return reply({ resources: [] })
      case 'resources/templates/list': return reply({ resourceTemplates: [] })
      case 'logging/setLevel': return reply({})
      default:
        if (isNote) return null
        return fault(-32601, 'Method not found: ' + str(msg.method, 80))
    }
  }

  /** A parsed body that may be one message or a batch. */
  function handleAny(parsed) {
    if (Array.isArray(parsed)) {
      if (!parsed.length) return { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } }
      if (parsed.length > MAX_BATCH) return { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request: a batch holds at most ' + MAX_BATCH + ' messages' } }
      const out = parsed.map((m) => { try { return handle(m) } catch (e) { return { jsonrpc: '2.0', id: m && m.id != null ? m.id : null, error: { code: -32603, message: 'Internal error' } } } }).filter(Boolean)
      return out.length ? out : null
    }
    try { return handle(parsed) } catch { return { jsonrpc: '2.0', id: parsed && parsed.id != null ? parsed.id : null, error: { code: -32603, message: 'Internal error' } } }
  }

  return { handle, handleAny, state: s }
}

/** The stdio transport: newline-delimited JSON-RPC on stdin and stdout. */
function runStdio(input, output) {
  input = input || process.stdin
  output = output || process.stdout
  const session = createSession({ transport: 'stdio' })
  let buf = ''
  const send = (obj) => { if (obj) output.write(JSON.stringify(obj) + '\n') }
  input.setEncoding('utf8')
  input.on('data', (chunk) => {
    buf += chunk
    let i
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).replace(/\r$/, '')
      buf = buf.slice(i + 1)
      if (!line.trim()) continue
      let parsed
      try { parsed = JSON.parse(line) } catch { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); continue }
      send(session.handleAny(parsed))
    }
    // a line that never ends is not allowed to grow without limit
    if (buf.length > 8 * 1024 * 1024) { buf = ''; send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error: message too large' } }) }
  })
  input.on('end', () => process.exit(0))
  return session
}

// ---------- the HTTP transport, mounted by the dashboard server at /mcp
/** The token for MCP over HTTP comes only from the environment
 *  (ARSENALE_MCP_TOKEN, at least 32 characters), never from a file: with no
 *  token the endpoint is off. */
function httpToken() {
  const t = String(process.env.ARSENALE_MCP_TOKEN || '')
  return t.length >= 32 ? t : ''
}

function httpTransport() {
  const sessions = new Map() // id -> { session, at }
  const hits = [] // call times in the last second, for the rate limit
  const IDLE_MS = 3600000
  // every initialize opens one; past this the least recently used is dropped
  const MAX_SESSIONS = 32
  const LIMIT = 64 * 1024, DELIVERABLE_LIMIT = 7 * 1024 * 1024

  function send(res, code, body, head) {
    res.writeHead(code, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }, head || {}))
    res.end(body === undefined ? '' : JSON.stringify(body))
  }
  const sameToken = (given, want) => {
    const a = Buffer.from(String(given || '')), b = Buffer.from(want)
    return a.length === b.length && crypto.timingSafeEqual(a, b)
  }

  /** Host is checked by the server before this. */
  function handle(req, res, ownOrigins) {
    const token = httpToken()
    if (!token) return send(res, 404, { error: 'MCP over HTTP is off: set ARSENALE_MCP_TOKEN (32+ characters) and restart the dashboard' })
    const origin = req.headers.origin
    if (origin !== undefined && !ownOrigins.includes(String(origin))) return send(res, 403, { error: 'origin' })
    const auth = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || ''))
    if (!auth || !sameToken(auth[1].trim(), token)) return send(res, 401, { error: 'token' }, { 'WWW-Authenticate': 'Bearer' })
    const now = Date.now()
    while (hits.length && now - hits[0] > 1000) hits.shift()
    if (hits.length >= 20) return send(res, 429, { error: 'too many calls: at most 20 a second' }, { 'Retry-After': '1' })
    hits.push(now)
    for (const [id, x] of sessions) if (now - x.at > IDLE_MS) sessions.delete(id)
    const sid = String(req.headers['mcp-session-id'] || '')
    if (req.method === 'DELETE') { if (sid && sessions.delete(sid)) return send(res, 204); return send(res, 404, { error: 'no such session' }) }
    if (req.method !== 'POST') return send(res, 405, { error: 'POST only: this server offers no event stream' }, { Allow: 'POST, DELETE' })
    if (!/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) return send(res, 415, { error: 'json only' })
    let size = 0, over = false
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > DELIVERABLE_LIMIT && !over) { over = true; send(res, 413, { error: 'too large' }); req.destroy() } else if (!over) chunks.push(c)
    })
    req.on('end', () => {
      if (over) return
      let parsed
      try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { return send(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) }
      // only a deliverable with content may be large (spec R-1.12)
      const big = !Array.isArray(parsed) && parsed && parsed.method === 'tools/call' && parsed.params && parsed.params.name === 'add_deliverable'
      if (size > LIMIT && !big) return send(res, 413, { error: 'too large' })
      // each message of a batch is a call: one request must not carry hundreds
      if (Array.isArray(parsed) && parsed.length > 1) {
        if (parsed.length > MAX_BATCH) return send(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request: a batch holds at most ' + MAX_BATCH + ' messages' } })
        const t = Date.now()
        while (hits.length && t - hits[0] > 1000) hits.shift()
        if (hits.length + parsed.length - 1 > 20) return send(res, 429, { error: 'too many calls: at most 20 a second' }, { 'Retry-After': '1' })
        for (let i = 1; i < parsed.length; i++) hits.push(t)
      }
      const init = !Array.isArray(parsed) && parsed && parsed.method === 'initialize'
      let entry
      if (init) {
        while (sessions.size >= MAX_SESSIONS) {
          let oldest = null
          for (const [id, x] of sessions) if (!oldest || x.at < oldest[1].at) oldest = [id, x]
          sessions.delete(oldest[0])
        }
        const id = crypto.randomBytes(16).toString('hex')
        entry = { session: createSession({ transport: 'http' }), at: now }
        sessions.set(id, entry)
        const out = entry.session.handleAny(parsed)
        return send(res, 200, out, { 'Mcp-Session-Id': id })
      }
      if (!sid) return send(res, 400, { error: 'Mcp-Session-Id header required: send initialize first' })
      entry = sessions.get(sid)
      if (!entry) return send(res, 404, { error: 'session expired: send initialize again' })
      entry.at = now
      const out = entry.session.handleAny(parsed)
      if (out === null) return send(res, 202)
      return send(res, 200, out)
    })
  }
  return { handle, sessions }
}

/** The connected clients for Settings: name, transport, last call, calls today. */
function listClients() {
  const all = readJson(CLIENTS, { clients: {} })
  const day = new Date().toISOString().slice(0, 10)
  return Object.entries(all.clients || {}).map(([id, c]) => ({ id, name: str(c.name, 60), version: str(c.version, 60), transport: c.transport || 'stdio', firstSeen: c.firstSeen || '', lastSeen: c.lastSeen || '', lastHello: c.lastHello || '', callsToday: c.day === day ? c.callsToday || 0 : 0, lastTool: str(c.lastTool, 40) }))
    .sort((a, b) => String(b.lastSeen).localeCompare(String(a.lastSeen))).slice(0, 50)
}
/** Forget: drop a client's record and read pointer (it can still reconnect). */
function forgetClient(id, actor) {
  L.requireBoard(actor)
  const clean = String(id || '').replace(/[^\w.-]/g, '')
  const all = readJson(CLIENTS, { clients: {} })
  if (!all.clients || !Object.hasOwn(all.clients, clean)) throw L.fail(404, 'no such client')
  delete all.clients[clean]
  writeJson(CLIENTS, all)
  fs.rmSync(path.join(READ_DIR, clean + '.json'), { force: true })
  return { id: clean }
}

module.exports = { createSession, runStdio, httpTransport, httpToken, listClients, forgetClient, TOOLS, PROTOCOLS, INSTRUCTIONS, clientIdOf }

if (require.main === module) runStdio()
