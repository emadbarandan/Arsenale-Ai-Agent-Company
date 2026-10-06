/* The run log as a library: the one write path behind every door.
 *
 * Three doors write through these functions, and each door fixes who is
 * writing (the actor) itself; nothing in a request body can change it:
 *
 *   door        actor                                  checked by
 *   cli         "by" in the JSON, as it always was     nothing: same-user trust (SECURITY.md)
 *   mcp         supervisor, or agent:<name> for steps  the client started the process / bearer token
 *               and comments on a job of that name
 *   dashboard   board                                  Host + Origin + page token (the server)
 *   phone       board, via phone:<channel>             a signed, single-use, expiring token (notify.cjs)
 *
 * Board-only work (answering questions, budgets, pauses, the org chart,
 * hiring, packs, the safety rules, notification settings) is refused here for
 * every actor that is not the board, not hidden in the UI.
 *
 * Every function returns a value or throws an Error with a numeric `code`
 * (400 bad input, 403 not allowed, 404 unknown id, 409 state conflict). None
 * prints, exits or starts a process: log-agent-run.cjs (the CLI) and
 * mcp-server.cjs turn the results into text.
 */
const fs = require('fs')
const path = require('path')
const P = require('./paths.cjs')

const { RUNS, ACTIVE } = P
const B = () => require('./build-agent-dashboard.cjs')
const company = () => require('./agent-company.cjs')

function fail(code, message) { const e = new Error(message); e.code = code; return e }

/** The sentence every refused Board-only call ends in. MCP clients relay it. */
const OWNER_ONLY = 'Only the owner can do this, on the Arsenale dashboard.'

/** An actor as a door makes it. `role` is board | supervisor | agent. */
function actorFor(door, role, extra) {
  const r = role === 'board' || role === 'agent' ? role : 'supervisor'
  return Object.assign({ door: door || 'cli', role: r, name: '' }, extra || {})
}
/** The CLI's actor comes from the JSON it was given, as before 1.0. */
const cliActor = (input) => actorFor('cli', input && String(input.by || '') === 'board' ? 'board' : input && /^agent/.test(String(input.by || '')) ? 'agent' : 'supervisor')
/** How the company files spell an actor ("board", "supervisor", "agent:tester"). */
const actorLabel = (a) => (a.role === 'agent' ? 'agent:' + (a.name || 'agent') : a.role)

function requireBoard(actor) {
  if (!actor || actor.role !== 'board') throw fail(403, OWNER_ONLY)
}

/** Clips on code points, so a Persian letter or an emoji is never cut in half. */
const clipCp = (s, n) => { const a = Array.from(String(s == null ? '' : s)); return a.length > n ? a.slice(0, n).join('') : a.join('') }

// Agents that started another agent used to name it only in the task text,
// "(under <run id>)", so that form still counts as the parent.
const parentOf = (input) => String(input.parent || (/\(under\s+([\w.:-]+)\)/i.exec(String(input.task || '')) || [])[1] || '')
const activeFileFor = (id) => path.join(ACTIVE, String(id).replace(/[^\w.-]/g, '') + '.json')

// The company fields a run may carry (spec 6.13): new records only, all optional.
const companyFields = (input, from) => {
  const out = {}
  for (const k of ['projectId', 'officeId', 'session', 'issue']) {
    const v = input[k] !== undefined ? input[k] : from && from[k]
    if (v) out[k] = String(v).slice(0, 80)
  }
  return out
}

/** Which door a record came through, for records written by a door other
 *  than the CLI (old records without `source` read as cli). */
function sourceFields(actor) {
  if (!actor || actor.door === 'cli') return {}
  const out = { source: actor.door === 'mcp' ? 'mcp' : actor.door }
  if (actor.client) out.client = { name: clipCp(actor.client.name, 60), version: clipCp(actor.client.version, 60) }
  if (actor.clientId) out.clientId = String(actor.clientId)
  return out
}

/** One active run (a job that started and has not finished). */
function readActive(id) {
  const file = activeFileFor(id)
  if (!id || !fs.existsSync(file)) return null
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return null }
}

/** Starts a job. The budget is checked, never enforced, here: a refused log
 *  would hide work that happens anyway. Over a limit the run is recorded and
 *  flagged, and `warnings` carries the line the CLI prints. */
function startRun(input, actor) {
  if (!input || !input.agent || !input.task) throw fail(400, 'an entry needs at least "agent" and "task"')
  const now = new Date()
  fs.mkdirSync(ACTIVE, { recursive: true })
  const id = now.toISOString().replace(/[:.]/g, '-') + '-' + Math.random().toString(36).slice(2, 6)
  const warnings = []
  let budget = null
  try {
    const C = company()
    const state = B().collect()
    budget = C.budgetCheck(state, input)
    if (budget.level !== 'ok') {
      warnings.push('WARNING: budget ' + budget.level + ' — ' + budget.lines.filter((l) => /^(stop|warn)/.test(l)).join('; ') + (budget.level === 'stop' ? '. The run is recorded and flagged "started despite stop".' : ''))
      if (budget.level === 'stop') C.activity({ actor: actorLabel(actor || cliActor({})), action: 'budget.violation', entityType: 'employee', entityId: budget.employeeId, officeId: budget.officeId, summary: String(input.agent) + ' started despite stop: ' + budget.lines.filter((l) => /^stop/.test(l)).join('; '), via: (actor && actor.door) || 'cli' })
    }
  } catch { /* no company, or it cannot be read: the run is logged as always */ }
  const record = Object.assign({
    id,
    agent: String(input.agent),
    model: input.model || '',
    effort: input.effort || '',
    project: input.project || '',
    task: String(input.task),
    parent: parentOf(input),
    doing: input.doing || '',            // the latest line
    steps: input.doing ? [{ at: input.startedAt || now.toISOString(), text: String(input.doing) }] : [],
    startedAt: input.startedAt || now.toISOString(),
  }, companyFields(input), sourceFields(actor), budget && budget.level !== 'ok' ? { budgetWarned: true, budgetLevel: budget.level } : {})
  fs.writeFileSync(path.join(ACTIVE, id + '.json'), JSON.stringify(record, null, 2))
  // a job started for a task links to it and moves it from "to do" to "in
  // progress" (never backwards); a missing or unreadable task never stops the log
  if (record.issue) { try { require('./tasks.cjs').linkRun(record.issue, id, actor || cliActor({})) } catch { /* not a task here */ } }
  return { id, budget, warnings, record }
}

/** One line of what the agent is doing now, kept as a log (at most 200). */
function progress(input, actor) {
  const file = activeFileFor(input && input.id)
  if (!input || !input.id || !fs.existsSync(file)) throw fail(404, 'no run is active with that id')
  const run = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (actor && actor.role === 'agent' && actor.name && actor.name !== run.agent) throw fail(403, 'agents may only log steps on their own job')
  // "text" is accepted too: briefs and agents often use it instead of "doing".
  const text = String(input.doing || input.text || '')
  run.doing = text
  // Kept as a log, not a single line: the dashboard shows it like a terminal,
  // so the reader can see the whole path the agent took, not only where it is.
  run.steps = Array.isArray(run.steps) ? run.steps : []
  if (text) run.steps.push({ at: new Date().toISOString(), text })
  if (run.steps.length > 200) run.steps = run.steps.slice(-200)
  fs.writeFileSync(file, JSON.stringify(run, null, 2))
  return { ok: true, run }
}

/** Finishes a job: one record file per finished run, never rewritten. */
function finishRun(input, actor) {
  if (!input || !input.agent || !input.task) throw fail(400, 'an entry needs at least "agent" and "task"')
  fs.mkdirSync(ACTIVE, { recursive: true })
  const now = new Date()
  let startedAt = input.startedAt || ''
  let parent = parentOf(input)
  let steps = []
  let fromActive = null
  if (input.id) {
    const activeFile = activeFileFor(input.id)
    if (fs.existsSync(activeFile)) {
      try {
        const run = JSON.parse(fs.readFileSync(activeFile, 'utf8'))
        startedAt = startedAt || run.startedAt
        parent = parent || run.parent || ''
        // The log is what the user watched while the agent worked; without it a
        // finished run can only be read from its summary.
        if (Array.isArray(run.steps)) steps = run.steps
        fromActive = run
      } catch { /* keep going */ }
      fs.unlinkSync(activeFile)
    }
  }
  const usage = input.usage && typeof input.usage === 'object' ? {
    tokens: Number(input.usage.tokens || input.usage.totalTokens) || 0,
    toolUses: Number(input.usage.toolUses) || 0,
    durationMs: Number(input.usage.durationMs) || 0,
    model: String(input.usage.model || ''),
  } : null
  // reported by an MCP client: split counts, and whether the client guessed them
  if (usage && actor && actor.door !== 'cli') {
    if (Number(input.usage.inputTokens) >= 0 && input.usage.inputTokens !== undefined) usage.inputTokens = Number(input.usage.inputTokens) || 0
    if (Number(input.usage.outputTokens) >= 0 && input.usage.outputTokens !== undefined) usage.outputTokens = Number(input.usage.outputTokens) || 0
    if (input.usage.estimated === true) usage.estimated = true
  }
  // Counted now, while the transcript is surely there; it may be cleaned up later.
  const transcript = input.id || input.transcript ? B().transcriptFor(String(input.id || ''), startedAt, input.transcript) : null
  const record = {
    id: input.id ? String(input.id) : '',
    parent,
    agent: String(input.agent),
    model: input.model || (usage && usage.model) || '',
    effort: input.effort || '',
    project: input.project || '',
    task: String(input.task),
    status: input.status || 'ok',            // ok | findings | failed | stopped
    summary: input.summary || '',
    findings: Array.isArray(input.findings) ? input.findings : [],
    files: Array.isArray(input.files) ? input.files : [],
    command: input.command || '',
    durationMs: Number(input.durationMs) || (usage && usage.durationMs) || 0,
    tokens: Number(input.tokens) || (usage && usage.tokens) || 0,
    startedAt,
    finishedAt: input.finishedAt || now.toISOString(),
    steps,
  }
  if (usage) record.usage = usage
  if (transcript) record.transcript = transcript
  Object.assign(record, companyFields(input, fromActive))
  if (fromActive && fromActive.budgetWarned) { record.budgetWarned = true; record.budgetLevel = fromActive.budgetLevel || 'warn' }
  // the plain-language fields a door other than the CLI may add (spec 5.7)
  if (actor && actor.door !== 'cli') {
    Object.assign(record, sourceFields(actor))
    if (fromActive && fromActive.source && !record.source) record.source = fromActive.source
    if (Array.isArray(input.whatWasDone)) record.whatWasDone = input.whatWasDone.slice(0, 10).map((s) => clipCp(s, 200)).filter(Boolean)
    if (Array.isArray(input.deliverables)) record.deliverables = input.deliverables.slice(0, 50).map((s) => String(s).replace(/[^\w.-]/g, '').slice(0, 80)).filter(Boolean)
  }
  // The file name is built from a parsed date and a cleaned agent name: a name
  // such as "x/../../elsewhere", or "a:b" (an NTFS stream), must never take the
  // record out of agent-runs/.
  const finished = new Date(record.finishedAt)
  if (isNaN(finished)) record.finishedAt = now.toISOString()
  const stamp = (isNaN(finished) ? now : finished).toISOString().replace(/[:.]/g, '-')
  const safeAgent = record.agent.replace(/[^\w.-]/g, '').replace(/^\.+/, '').slice(0, 60) || 'agent'
  fs.mkdirSync(RUNS, { recursive: true })
  const file = path.join(RUNS, stamp + '-' + safeAgent + '-' + Math.random().toString(36).slice(2, 6) + '.json')
  fs.writeFileSync(file, JSON.stringify(record, null, 2))
  if (record.issue) { try { require('./tasks.cjs').linkRun(record.issue, record.id, actor || cliActor({}), { finish: true }) } catch { /* not a task here */ } }
  return { file, record }
}

/** Budget thresholds this run crossed, logged once per scope and month. */
function noteIncidents() {
  return company().noteIncidents(B().collect())
}

/** The read-only budget check: ok, warn or stop, with the lines. */
function budgetCheck(input) {
  return company().budgetCheck(B().collect(), input || {})
}

// ---------- questions (gates) and decisions
/** Asks the owner something, or updates a question. From the CLI every field
 *  works as before; other doors may only ask (a question they asked closes
 *  only through the owner's answer). */
function gate(input, actor, via) {
  actor = actor || cliActor(input)
  if (actor.door !== 'cli') {
    if (input.id || input.status) throw fail(403, OWNER_ONLY)
    const extra = { askedBy: actor.role === 'agent' ? 'agent' : 'supervisor', askedVia: actor.door }
    if (actor.clientId) extra.clientId = String(actor.clientId)
    return B().saveGate(Object.assign({}, input, extra, { by: undefined }), actor.door)
  }
  return B().saveGate(input, via)
}

/** A decision. From MCP, `by` is the door's, never the body's. */
function decision(input, actor) {
  actor = actor || cliActor(input)
  if (actor.door !== 'cli') {
    const by = actor.role === 'agent' ? 'agent' : 'supervisor'
    return B().saveDecision(Object.assign({}, input, { by, agent: actor.role === 'agent' ? actor.name : input.agent, id: undefined }))
  }
  return B().saveDecision(input)
}

/** The owner answers a question. Board only: on the dashboard, or from a
 *  phone through a signed token (`via` says which). */
function answer(id, text, actor, opts) {
  requireBoard(actor)
  return B().answerGate(id, text, Object.assign({ via: actor.via || actor.door }, opts || {}))
}
function dismiss(id, actor) {
  requireBoard(actor)
  return B().dismissGate(id)
}

// ---------- Board-only company writes, with the actor from the door
const asBoard = (input, actor) => Object.assign({}, input, { by: actor && actor.role === 'board' ? 'board' : '' })
function setBudget(input, actor) { return company().setBudget(asBoard(input, actor), actor.door) }
function setBudgetsEnabled(on, actor) { return company().setBudgetsEnabled(on, actor && actor.role === 'board' ? 'board' : '', actor.door) }
function updateEmployee(input, actor) { return company().updateEmployee(asBoard(input, actor), actor.door) }

module.exports = {
  OWNER_ONLY, fail, actorFor, cliActor, actorLabel, requireBoard, clipCp,
  startRun, progress, finishRun, noteIncidents, budgetCheck, readActive,
  gate, decision, answer, dismiss, setBudget, setBudgetsEnabled, updateEmployee,
}
