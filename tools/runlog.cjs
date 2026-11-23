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
const { writeAtomic, withLock } = require('./store.cjs')

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
/** True when `token` is the owner's launch key (<data>/launch-key), the secret
 *  the dashboard's own board actions rest on. Only a process that can read the
 *  owner's data folder holds it; it is never printed or logged. */
function boardProven(token) {
  if (!token) return false
  const LK = require('./launch-key.cjs')
  const key = LK.readKey()
  return !!key && LK.same(token, key)
}
/** The CLI's actor. The JSON's "by" alone proved nothing (any agent with a
 *  shell could write {"by":"board"}), so "board" now needs the owner's key in
 *  ARSENALE_BOARD_TOKEN (or --board-token); without it the caller is an agent. */
const cliActor = (input, token) => {
  const by = String(input && input.by || '')
  const proof = token === undefined ? process.env.ARSENALE_BOARD_TOKEN : token
  if (by === 'board') return actorFor('cli', boardProven(proof) ? 'board' : 'agent', boardProven(proof) ? {} : { claimedBoard: true })
  return actorFor('cli', /^agent/.test(by) ? 'agent' : 'supervisor')
}
/** How the company files spell an actor ("board", "supervisor", "agent:tester"). */
const actorLabel = (a) => (a.role === 'agent' ? 'agent:' + (a.name || 'agent') : a.role)

function requireBoard(actor) {
  if (!actor || actor.role !== 'board') throw fail(403, OWNER_ONLY)
}

/** Clips on code points, so an emoji or an accented letter is never cut in half. */
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

// Spec 1.3 3.1: `taskId` is an alias of `issue`; `issue` wins, with a warning when they differ.
function aliasTask(input, warnings) {
  if (input.taskId === undefined || input.taskId === null || input.taskId === '') return input
  const out = Object.assign({}, input)
  if (out.issue && String(out.issue) !== String(out.taskId)) warnings.push('WARNING: "taskId" (' + String(out.taskId).slice(0, 40) + ') differs from "issue" (' + String(out.issue).slice(0, 40) + '); "issue" is used')
  else if (!out.issue) out.issue = out.taskId
  delete out.taskId
  return out
}
// The meters a finish may report (spec 1.3 3.1), under their CLI and MCP names.
const METER_NAMES = [['inputTokens', 'input_tokens'], ['outputTokens', 'output_tokens'], ['cacheReadTokens', 'cache_read_tokens'], ['cacheWriteTokens', 'cache_write_tokens'], ['cacheWrite5mTokens', 'cache_write_5m_tokens'], ['cacheWrite1hTokens', 'cache_write_1h_tokens']]
const LABEL = (v) => /^[a-z0-9-]{1,40}$/.test(v) ? v : ''
/** The new usage fields, validated. A bad meter is dropped with a warning (never stored as 0). */
function meterFields(u, input, warnings) {
  const out = {}
  for (const [camel, snake] of METER_NAMES) {
    const v = u[camel] !== undefined ? u[camel] : u[snake]
    if (v === undefined || v === null) continue
    if (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0) out[camel] = v
    else warnings.push('WARNING: usage.' + camel + ' must be a whole number of 0 or more; it was dropped and the run is still logged')
  }
  const prov = u.provider !== undefined ? u.provider : input.provider
  if (prov !== undefined && prov !== null && prov !== '') {
    if (typeof prov === 'string' && LABEL(prov)) out.provider = prov
    else warnings.push('WARNING: provider must be 1-40 characters of a-z, 0-9 and "-"; it was dropped')
  }
  if (u.estimated === true) out.estimated = true
  return out
}
const strategyOf = (input, warnings) => {
  if (input.strategy === undefined || input.strategy === null || input.strategy === '') return {}
  const v = String(input.strategy)
  if (v.length > 40) { warnings.push('WARNING: strategy is longer than 40 characters; it was dropped'); return {} }
  return { strategy: v }
}

// The office a run works for is decided once, here at its start (spec 1.2
// rule 23), and stamped: a later change of kinds or of a project's office
// moves no past run and no past budget. The stamp is an explicit officeId to
// every reader, 1.1 included; officeBy and kind are only read by 1.2. A run
// with no company, or one recorded before 1.2, has no stamp and keeps the
// read rule of resolver().office.
const routeFields = (budget) => (budget && budget.officeBy ? Object.assign({ officeId: budget.officeId, officeBy: budget.officeBy }, budget.kind ? { kind: budget.kind } : {}) : {})
// the stamp of the active record, kept on the finished one whatever the finish says
const keptRoute = (from) => (from && from.officeBy && from.officeId ? Object.assign({ officeId: String(from.officeId), officeBy: String(from.officeBy) }, from.kind ? { kind: String(from.kind) } : {}) : {})

// The autonomous-mode tags (spec autonomous-mode, rule 46): which version run a
// job belongs to and which phase of it. Optional; a record without them reads
// exactly as before, and an older reader ignores them.
const versionFields = (input, from) => {
  const out = {}
  for (const [k, n] of [['versionRun', 60], ['phase', 20]]) {
    const v = input[k] !== undefined ? input[k] : from && from[k]
    const clean = v ? String(v).replace(/[^\w.-]/g, '').slice(0, n) : ''
    if (clean) out[k] = clean
  }
  return out
}

// The agent process (optional): lets `autonomous resume` tell a run whose
// process is gone from one still working. Old readers ignore it.
const pidFields = (input) => {
  const n = Number(input.pid)
  return Number.isSafeInteger(n) && n > 0 ? { pid: n } : {}
}
// When the agent's process started, so a pid reused by another program is not
// taken for the agent (spec 1.1, rule 17). Only Linux tells this without
// starting a process (/proc); elsewhere NaN, "cannot tell". A recorded
// pidStartedAt is therefore always one the system gave: watch.cjs trusts it
// to close a run whose pid is gone without waiting for the stall limit.
function pidStartMs(pid) {
  if (process.platform !== 'linux') return NaN
  try {
    const stat = fs.readFileSync('/proc/' + Number(pid) + '/stat', 'utf8')
    const ticks = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19])
    const boot = Number((/^btime (\d+)$/m.exec(fs.readFileSync('/proc/stat', 'utf8')) || [])[1])
    // USER_HZ is 100 on every Linux build Node supports
    return Number.isFinite(ticks) && boot ? boot * 1000 + ticks * 10 : NaN
  } catch { return NaN }
}
// a pidStartedAt in the input is never read: a made-up one would make a live
// pid look reused, and its run closed (security review of P2, finding 4)
const pidStartFields = (pid) => {
  const real = pid ? pidStartMs(pid) : NaN
  return Number.isFinite(real) ? { pidStartedAt: new Date(real).toISOString() } : {}
}

// Fields of spec 1.1 (all optional, an older reader ignores them): where the
// work happens, the brief it was given (for a resume), and the planned
// counts the estimate is measured against.
const BRIEF_MAX = 8000
const wholeOf = (v, name) => {
  if (v === undefined || v === null || v === '') return undefined
  const n = typeof v === 'number' ? v : /^\d+$/.test(String(v)) ? Number(v) : NaN
  if (!Number.isSafeInteger(n) || n < 0) throw fail(400, '"' + name + '" must be a whole number, 0 or more')
  return n
}
function workFields(input, warnings) {
  const out = {}
  if (input.worktree) out.worktree = clipCp(String(input.worktree).replace(/[\u0000-\u001f]/g, ''), 500)
  if (input.branch) { const b = String(input.branch).replace(/[^\w./-]/g, '').slice(0, 200); if (b) out.branch = b }
  if (input.brief !== undefined && input.brief !== null && input.brief !== '') {
    const all = Array.from(String(input.brief))
    if (all.length > BRIEF_MAX && warnings) warnings.push('note: the brief is longer than ' + BRIEF_MAX + ' characters; only the first ' + BRIEF_MAX + ' are stored')
    out.brief = all.slice(0, BRIEF_MAX).join('')
  }
  // a bad planned count is dropped with a note, not refused: a refused start
  // would hide work that happens anyway
  for (const k of ['plannedFiles', 'plannedTests']) {
    try { const n = wholeOf(input[k], k); if (n !== undefined) out[k] = n } catch (e) { if (warnings) warnings.push('note: ' + e.message + '; not stored') }
  }
  return out
}
const TASK_TIERS = ['light', 'standard', 'heavy']
const MAX_HEAVY = 3 // AGENT-RULES section 9 rule 7, spec rule 62: across every version run
const pidAlive = (pid) => { try { process.kill(pid, 0); return true } catch (e) { return e.code === 'EPERM' } }

/** Heavy-tier runs going now. A record whose recorded PID is gone is not
 *  counted (a crashed run must not block the others); one without a PID is. */
function heavyActive() {
  let names = []
  try { names = fs.readdirSync(ACTIVE) } catch { return [] }
  const out = []
  for (const n of names) {
    if (!n.endsWith('.json')) continue
    try {
      const r = JSON.parse(fs.readFileSync(path.join(ACTIVE, n), 'utf8'))
      if (r && r.tier === 'heavy' && !(r.pid && !pidAlive(r.pid))) out.push(r)
    } catch { /* being written, or not a run */ }
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
  const aliasWarnings = []
  input = aliasTask(input, aliasWarnings)
  const out = startRun2(input, actor)
  out.warnings.unshift(...aliasWarnings)
  return out
}
function startRun2(input, actor) {
  if (input.tier !== undefined && !TASK_TIERS.includes(input.tier)) throw fail(400, 'tier must be one of: ' + TASK_TIERS.join(', '))
  fs.mkdirSync(ACTIVE, { recursive: true })
  // the count and the write sit under one lock, so two starts cannot both pass
  return input.tier === 'heavy' ? withLock(path.join(ACTIVE, '.heavy'), () => startRunLocked(input, actor)) : startRunLocked(input, actor)
}
function startRunLocked(input, actor) {
  if (input.tier === 'heavy') {
    const n = heavyActive().length
    if (n >= MAX_HEAVY) throw fail(409, 'Refused: ' + n + ' heavy-tier runs are already going (the limit is ' + MAX_HEAVY + ' at once, across all version runs). Wait for one to finish, or start this one at the standard tier.')
  }
  const now = new Date()
  const id = now.toISOString().replace(/[:.]/g, '-') + '-' + Math.random().toString(36).slice(2, 6)
  const warnings = []
  const work = workFields(input, warnings)
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
  }, pidFields(input), pidFields(input).pid ? pidStartFields(pidFields(input).pid) : {}, work, TASK_TIERS.includes(input.tier) ? { tier: input.tier } : {}, strategyOf(input, warnings), companyFields(input), versionFields(input), sourceFields(actor), budget && budget.level !== 'ok' ? { budgetWarned: true, budgetLevel: budget.level } : {}, routeFields(budget))
  writeAtomic(path.join(ACTIVE, id + '.json'), JSON.stringify(record, null, 2))
  // a job started for a task links to it and moves it from "to do" to "in
  // progress" (never backwards); a missing or unreadable task never stops the log
  if (record.issue) { try { require('./tasks.cjs').linkRun(record.issue, id, actor || cliActor({})) } catch { /* not a task here */ } }
  return { id, budget, warnings, record }
}

/** One line of what the agent is doing now, kept as a log (at most 200),
 *  and an optional percentage done ("pct"). Spec 1.1 adds, all optional: a
 *  "plan" of weighted steps (taken from the first call that has one) and the
 *  "step" being done, after which "pct" is that step's own progress; and the
 *  counts "files", "plannedFiles", "tests" {run, of}, "testsRun", "plannedTests". */
function progress(input, actor) {
  const file = activeFileFor(input && input.id)
  if (!input || !input.id || !fs.existsSync(file)) throw fail(404, 'no run is active with that id')
  // refused before anything is written
  progressCounts(input)
  // under the lock finishRun takes too: a step written after the finish would
  // bring the run back as active
  return withLock(file, () => progressLocked(file, input, actor))
}
function progressLocked(file, input, actor) {
  if (!fs.existsSync(file)) throw fail(404, 'no run is active with that id')
  const run = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (actor && actor.role === 'agent' && actor.name && actor.name !== run.agent) throw fail(403, 'agents may only log steps on their own job')
  // "text" is accepted too: briefs and agents often use it instead of "doing".
  const text = String(input.doing || input.text || '')
  run.doing = text
  // Optional rough progress, 0-100, sent only at a few fixed milestones; a
  // missing or non-numeric value leaves the last one as it was.
  const Pg = require('./progress.cjs')
  if (!Pg.cleanPlan(run.plan)) { const plan = Pg.cleanPlan(input.plan); if (plan) run.plan = plan }
  const plan = Pg.cleanPlan(run.plan)
  if (plan && input.step !== undefined) {
    const i = Pg.stepIndexOf(plan, input.step)
    // a new step starts at 0 % of itself
    if (i && i !== run.stepIndex) { run.stepIndex = i; delete run.stepPct }
  }
  const raw = input.pct === null || input.pct === '' ? NaN : Number(input.pct)
  const pct = Number.isFinite(raw) ? Math.max(0, Math.min(100, Math.round(raw))) : NaN
  if (plan && run.stepIndex) {
    if (Number.isFinite(pct)) run.stepPct = pct
    // "pct" stays the whole run's percent: the number an older page shows
    const rep = Pg.reportedPercent(run)
    if (rep !== null) run.pct = rep
  } else if (Number.isFinite(pct)) run.pct = pct
  Object.assign(run, progressCounts(input))
  run.lastActivityAt = new Date().toISOString()
  // Kept as a log, not a single line: the dashboard shows it like a terminal,
  // so the reader can see the whole path the agent took, not only where it is.
  run.steps = Array.isArray(run.steps) ? run.steps : []
  if (text) run.steps.push({ at: new Date().toISOString(), text })
  if (run.steps.length > 200) run.steps = run.steps.slice(-200)
  writeAtomic(file, JSON.stringify(run, null, 2))
  return { ok: true, run }
}

/** The counts a progress line may carry, checked: a negative or fractional
 *  count is refused (400). "plannedFiles": 0 means not known. */
function progressCounts(input) {
  const out = {}
  const files = wholeOf(input.files, 'files')
  if (files !== undefined) out.files = files
  const t = input.tests && typeof input.tests === 'object' ? input.tests : {}
  const ran = input.testsRun !== undefined ? wholeOf(input.testsRun, 'testsRun') : wholeOf(t.run, 'tests.run')
  if (ran !== undefined) out.testsRun = ran
  const of = input.plannedTests !== undefined ? wholeOf(input.plannedTests, 'plannedTests') : wholeOf(t.of, 'tests.of')
  if (of !== undefined) out.plannedTests = of
  const pf = wholeOf(input.plannedFiles, 'plannedFiles')
  if (pf !== undefined) out.plannedFiles = pf
  return out
}

/** Marks a run as active now, without a step (the test queue does, while the
 *  run waits for the suite or holds it). A run that is not active is left alone. */
function touch(id) {
  const file = activeFileFor(id)
  if (!id || !fs.existsSync(file)) return false
  return withLock(file, () => {
    let run
    try { run = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return false }
    run.lastActivityAt = new Date().toISOString()
    writeAtomic(file, JSON.stringify(run, null, 2))
    return true
  })
}

/** Closes a run whose process is gone (spec 1.1, rule 16): a finished record
 *  "stopped", its steps kept, through finishRun's own locked path.
 *  `stillDead(run)` is asked again under the lock, so a step that arrived in
 *  the meantime keeps the run alive. Kills nothing. The record, or null. */
function closeDead(id, stillDead) {
  const file = activeFileFor(id)
  if (!id || !fs.existsSync(file)) return null
  const out = withLock(file, () => {
    let run
    try { run = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return null }
    if (!run || (stillDead && !stillDead(run))) return null
    return finishLocked({ id: run.id, agent: run.agent, task: run.task, model: run.model, effort: run.effort, project: run.project, status: 'stopped', summary: 'The process ended; closed by Arsenale' }, null, file, { closedBy: 'arsenale' })
  })
  if (out && out.record.issue) { try { require('./tasks.cjs').linkRun(out.record.issue, out.record.id, actorFor('cli', 'supervisor'), { finish: true }) } catch { /* not a task here */ } }
  return out
}

/** Finishes a job: one record file per finished run, never rewritten. */
function finishRun(input, actor) {
  if (!input || !input.agent || !input.task) throw fail(400, 'an entry needs at least "agent" and "task"')
  const warnings = []
  input = aliasTask(input, warnings)
  fs.mkdirSync(ACTIVE, { recursive: true })
  const activeFile = input.id ? activeFileFor(input.id) : ''
  // The final record is written before the active file goes, both under the
  // lock progress takes: a crash in between leaves the run twice (the
  // dashboard shows the finished one), never nowhere.
  const out = activeFile && fs.existsSync(activeFile) ? withLock(activeFile, () => finishLocked(input, actor, activeFile, undefined, warnings)) : finishLocked(input, actor, '', undefined, warnings)
  out.warnings = warnings
  // "Pre-existing" findings of a version run become bug proposals for the owner (spec 1.4 section 8)
  if (out.record.versionRun && out.record.findings.length) { try { require('./proposals.cjs').fromFinish(out.record) } catch { /* proposals are optional */ } }
  if (out.record.issue) { try { require('./tasks.cjs').linkRun(out.record.issue, out.record.id, actor || cliActor({}), { finish: true }) } catch { /* not a task here */ } }
  return out
}
function finishLocked(input, actor, activeFile, opts, warnings) {
  warnings = warnings || []
  const now = new Date()
  let startedAt = input.startedAt || ''
  let parent = parentOf(input)
  let steps = []
  let fromActive = null
  const hadActive = !!activeFile && fs.existsSync(activeFile)
  if (hadActive) {
    try {
      const run = JSON.parse(fs.readFileSync(activeFile, 'utf8'))
      startedAt = startedAt || run.startedAt
      parent = parent || run.parent || ''
      // The log is what the user watched while the agent worked; without it a
      // finished run can only be read from its summary.
      if (Array.isArray(run.steps)) steps = run.steps
      fromActive = run
    } catch { /* keep going */ }
  }
  const usage = input.usage && typeof input.usage === 'object' ? {
    tokens: Number(input.usage.tokens || input.usage.totalTokens) || 0,
    toolUses: Number(input.usage.toolUses) || 0,
    durationMs: Number(input.usage.durationMs) || 0,
    model: String(input.usage.model || ''),
  } : null
  // reported by either door: the meters, the provider and whether the tool guessed (spec 1.3 3.1)
  if (usage) Object.assign(usage, meterFields(input.usage, input, warnings))
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
  else if (input.provider !== undefined) { const p = meterFields({}, input, warnings); if (p.provider) record.provider = p.provider }
  Object.assign(record, strategyOf(input, warnings))
  if (!record.strategy && fromActive && fromActive.strategy) record.strategy = fromActive.strategy
  { const tier = TASK_TIERS.includes(input.tier) ? input.tier : fromActive && TASK_TIERS.includes(fromActive.tier) ? fromActive.tier : ''; if (tier) record.tier = tier }
  if (transcript) record.transcript = transcript
  Object.assign(record, companyFields(input, fromActive), versionFields(input, fromActive), keptRoute(fromActive))
  if (fromActive && fromActive.budgetWarned) { record.budgetWarned = true; record.budgetLevel = fromActive.budgetLevel || 'warn' }
  // where the work happened: a later run in the same worktree settles a resume
  if (fromActive) for (const k of ['worktree', 'branch']) if (fromActive[k]) record[k] = fromActive[k]
  // only Arsenale's own close says so, never a field of the input; the brief
  // is kept for the resume of that run, which needs its worktree
  if (opts && opts.closedBy === 'arsenale') {
    record.closedBy = 'arsenale'
    if (fromActive && fromActive.brief && fromActive.worktree) record.brief = fromActive.brief
    if (fromActive && fromActive.pid) record.pid = fromActive.pid
    const last = require('./progress.cjs').lastActivity(fromActive || {})
    if (Number.isFinite(last)) record.lastActivityAt = new Date(last).toISOString()
  }
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
  writeAtomic(file, JSON.stringify(record, null, 2))
  // the run is finished once its record is there: an active file that will
  // not go (Windows, a reader holding it) is hidden by the dashboard, and
  // must not make the caller finish the run a second time
  if (hadActive) { try { fs.unlinkSync(activeFile) } catch (e) { if (e.code !== 'ENOENT') process.stderr.write('arsenale: could not remove ' + path.basename(activeFile) + ': ' + e.code + '\n') } }
  return { file, record }
}

// ---------- autonomous version runs
// The mirror the dashboard reads: <data>/version-runs/<id>.json. The state file
// in the project repo is the source; when the two disagree the supervisor
// rewrites the mirror from the file.
const RUN_STATUS = ['planning', 'running', 'waiting for owner', 'stopped', 'blocked', 'done', 'empty']
const TIERS = ['low', 'medium', 'high']
const versionFile = (id) => path.join(P.VERSION_RUNS, id + '.json')

/** Creates or updates a version-run mirror. Fields not given keep their value.
 *  The supervisor writes it; an agent may not. A budget must be a positive
 *  whole number of tokens; anything else is refused and nothing is written. */
function versionRun(input, actor) {
  if (actor && actor.role === 'agent') throw fail(403, 'only the supervisor records a version run')
  const id = input && input.id ? String(input.id).replace(/[^\w.-]/g, '').slice(0, 60) : ''
  if (!id) throw fail(400, 'a version run needs an "id" such as app-x-1.2')
  fs.mkdirSync(P.VERSION_RUNS, { recursive: true })
  return withLock(versionFile(id), () => versionRunLocked(id, input))
}
function versionRunLocked(id, input) {
  let cur = {}
  try { cur = JSON.parse(fs.readFileSync(versionFile(id), 'utf8')) } catch { /* new */ }
  const rec = Object.assign({ id, app: '', version: '', status: 'planning', phases: [], budget: null, stateFile: '', integrationBranch: '' }, cur)
  for (const k of ['app', 'version', 'stateFile', 'integrationBranch']) if (input[k] !== undefined) rec[k] = clipCp(input[k], 200)
  if (input.status !== undefined) {
    if (!RUN_STATUS.includes(input.status)) throw fail(400, 'status must be one of: ' + RUN_STATUS.join(', '))
    rec.status = input.status
  }
  if (input.budget !== undefined) {
    const b = typeof input.budget === 'number' ? input.budget : /^\d+$/.test(String(input.budget)) ? Number(input.budget) : NaN
    if (!Number.isSafeInteger(b) || b <= 0) throw fail(400, 'budget must be a positive whole number of tokens')
    rec.budget = b
  }
  if (input.phases !== undefined) {
    if (!Array.isArray(input.phases)) throw fail(400, '"phases" must be a list')
    rec.phases = input.phases.slice(0, 50).filter((p) => String((p && p.id) || '').replace(/[^\w.-]/g, '')).map((p) => {
      const pct = Number(p && p.percent)
      return Object.assign({
        id: clipCp(String((p && p.id) || '').replace(/[^\w.-]/g, ''), 20),
        name: clipCp(p && p.name, 120),
        tier: TIERS.includes(p && p.tier) ? p.tier : 'medium',
        requests: Array.isArray(p && p.requests) ? p.requests.slice(0, 50).map((r) => clipCp(r, 20)) : [],
        dependsOn: Array.isArray(p && p.dependsOn) ? p.dependsOn.slice(0, 20).map((r) => clipCp(r, 20)) : [],
        status: clipCp((p && p.status) || 'planned', 40),
        percent: Number.isFinite(pct) ? Math.max(0, Math.min(100, Math.round(pct))) : 0,
      },
      // a percent the supervisor gave wins over the live one (progress.overallPercent)
      p && p.percent !== undefined && p.percent !== null && p.percent !== '' && Number.isFinite(pct) ? { percentSet: true } : {},
      // the requests already merged, for the live overall percent
      Array.isArray(p && p.merged) ? { merged: p.merged.slice(0, 50).map((r) => clipCp(r, 20)) } : {})
    })
  }
  if (input.reviews !== undefined) {
    if (!Array.isArray(input.reviews)) throw fail(400, '"reviews" must be a list')
    const n = (v) => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? null : Math.max(0, Math.round(Number(v))))
    rec.reviews = input.reviews.slice(0, 200).map((v) => ({ phase: clipCp(v && v.phase, 20), round: n(v && v.round), findings: n(v && v.findings), confirmed: n(v && v.confirmed), rejected: n(v && v.rejected), unclear: n(v && v.unclear), report: clipCp(v && v.report, 300) }))
  }
  rec.updatedAt = new Date().toISOString()
  writeAtomic(versionFile(id), JSON.stringify(rec, null, 2))
  return rec
}

/** Tokens per phase for one version run, from the run log (finished records
 *  and runs still going, tagged with that versionRun). A phase whose runs
 *  carry no token count reports `tokens: null` ("not recorded"), never 0. */
function versionLedger(id) {
  const key = String(id || '').replace(/[^\w.-]/g, '')
  if (!key) throw fail(400, 'a version run id is needed')
  const phases = {}
  const seen = new Set() // a run can sit in both folders for a moment while it finishes
  const take = (dir, running) => {
    let names = []
    try { names = fs.readdirSync(dir) } catch { return }
    for (const n of names) {
      if (!n.endsWith('.json')) continue
      let r
      try { r = JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8')) } catch { continue }
      if (!r || r.versionRun !== key) continue
      if (r.id) { if (seen.has(r.id)) continue; seen.add(r.id) }
      const ph = r.phase || '(none)'
      const e = phases[ph] || (phases[ph] = { phase: ph, runs: 0, running: 0, tokens: null })
      e.runs++
      if (running) e.running++
      const t = Number(r.tokens) || Number(r.usage && r.usage.tokens) || Number(r.transcript && r.transcript.tokensNew) || 0
      if (t > 0) e.tokens = (e.tokens || 0) + t
    }
  }
  take(RUNS, false)
  take(ACTIVE, true)
  const list = Object.values(phases).sort((a, b) => a.phase.localeCompare(b.phase, undefined, { numeric: true }))
  return { versionRun: key, phases: list, tokens: list.some((e) => e.tokens !== null) ? list.reduce((s, e) => s + (e.tokens || 0), 0) : null }
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
  // What an approval lets run (merge, next phase, build, publish) and whether
  // its gates passed are the supervisor's word: the version-run mirror does
  // not record that a phase passed its gates, so an agent saying so for its
  // own merge is refused here, where
  // the gate is written (security review of spec 1.1 P2, finding 2).
  const a = input && input.action && typeof input.action === 'object' ? input.action : null
  if (a && (a.type !== undefined || a.gatesPassed !== undefined) && actor.role === 'agent') throw fail(403, 'only the supervisor asks for a merge, next-phase, build or publish approval')
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

/** Campus changes (place, move, rotate, remove): campus.cjs decides who may. */
function campus(input, actor) { return require('./campus.cjs').apply(input, actor, actor.door) }
/** New office, edit, archive (spec 1.2): the owner only, campus.cjs refuses the rest. */
function office(input, actor) { return require('./campus.cjs').office(input, actor, actor.door) }

/** A shadow copy of HQ (spec 1.4 section 10.2) is read-only: nothing but the import of the shadow
 *  itself (the owner, with the importer flag) changes its plan, tasks or queue. */
function refuseInShadow(actor) {
  if (actor && actor.role === 'board' && actor.importer === true) return
  if (fs.existsSync(path.join(P.HOME, 'shadow.json'))) throw fail(409, 'Shadow copy of HQ. HQ is the master; editing is off.')
}

module.exports = {
  refuseInShadow, campus, office, OWNER_ONLY, fail, actorFor, cliActor, boardProven, actorLabel, requireBoard, clipCp,
  startRun, heavyActive, pidAlive, pidStartMs, progress, touch, closeDead, finishRun, activeFileFor, versionRun, versionLedger, noteIncidents, budgetCheck, readActive,
  gate, decision, answer, dismiss, setBudget, setBudgetsEnabled, updateEmployee,
}
