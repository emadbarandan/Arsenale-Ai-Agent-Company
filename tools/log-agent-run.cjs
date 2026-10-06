#!/usr/bin/env node
/* Records agent activity for the dashboard. Any coding agent, script or
 * supervising session can call it; it only writes JSON files under
 * ARSENALE_HOME (paths.cjs) and never starts a process.
 *
 * Usually called through the launcher, `arsenale log <mode> …` (or a short
 * alias such as `arsenale start`); `node tools/log-agent-run.cjs <mode> …` is
 * the same thing. The full list of modes, inputs and exit codes is HELP below
 * (`--help`).
 *
 * Every mode that takes JSON accepts it three ways:
 *   inline        '{"agent":"tester","task":"…"}'   (fine for fixed text)
 *   --stdin       the JSON on standard input        (any text, no quoting)
 *   --file F      the JSON in a file; @F is the same (PowerShell: quote "@F")
 * Text that comes from a task, an issue or a file must use --stdin or --file:
 * a quote inside inline JSON ends the shell's string early.
 *
 * One file per run, so two agents finishing at once cannot overwrite each
 * other and a bad record can be deleted by hand. The supervising session is
 * the one that knows the task, the model and what actually came back, so it
 * logs start and finish; the agent itself adds progress lines.
 */
const fs = require('fs')
const path = require('path')
const P = require('./paths.cjs')
const { build, saveGate } = require('./build-agent-dashboard.cjs')

const { RUNS } = P

const HELP = `Arsenale run log: records what agents do, for the dashboard.

usage: arsenale log <mode> [json] [flags]     (or: node tools/log-agent-run.cjs ...)

JSON input, for every mode that takes it:
  '{"key":"value"}'   inline, for fixed text only
  --stdin | -         read it from standard input
  --file <f> | @<f>   read it from a file (UTF-8; a byte-order mark is fine)

Runs
  --start <json>      {"agent","task", optional "model","effort","project","parent",
                      "projectId","officeId","session","issue","doing"}
                      prints the new run id
  --progress <json>   {"id","doing"}: one line of what the agent is doing now
  <json>              finish (no mode): {"id","agent","task","status": ok|findings|
                      failed|stopped, optional "summary","findings":[...],"files":[...],
                      "usage":{"tokens","toolUses","durationMs","model"},"transcript"}
                      prints the path of the run record

Gates and decisions
  --gate <json>       {"project","question", optional "kind": A|B|C|approval,"label",
                      "choices":[...],"run"}: prints the gate id. With "id" and
                      "status": waiting|answered|expired it updates that gate
  --decision <json>   {"project","by": user|supervisor|agent,"text", optional
                      "reason","run","agent","state":"open","closes"}
  --answers [--peek|--all|--json]   answers given on the dashboard since the
                      last read (then marked read)
  --dismiss <gate id> [<gate id> ...]    close waiting gates without an answer
  --dismiss-older-than <n>h|<n>d|<n>m [--dry-run]

Company (optional; see company.example/seed.json)
  --company-init [--seed <file>]   create the company folder (refuses if it exists)
  --company-status [--json]        offices, who works where, this month's spend
  --budget-check <json>            {"agent", optional "project"}: prints ok, warn ...
                                   or stop ...; read-only
  --budget <json>     {"scope": company|office|employee,"id","budget":{...}|null,"by":"board"}
  --budgets on|off <json>          every budget on or off: {"by":"board"}
  --employee <json>   {"id", "homeOfficeId","zone","reportsTo","status","pauseReason",
                      "title","aliases", "by":"board"}
  --inbox [--peek|--all|--json]    what the owner changed on the dashboard
  --heartbeat [json]               "the supervisor is here"

Tasks, deliverables and the safety rules
  --task <json>       create: {"title", optional "description","assignee","officeId",
                      "parentId"}: prints the new task id. Update: {"id","status":
                      in_progress|in_review|blocked|done, optional "assignee"}: prints ok
  --comment <json>    {"task","text"}: a comment on a task
  --deliverable <json>  {"title","kind": document|image|link|file|text, and one of
                      "url","path","content" (+ "mime"); optional "run","task","agent"}
                      prints the id and "stored" or "link-only (<reason>)"
  --check-action <json> {"agent","category","summary", optional "target","run"}
                      before an action that leaves this computer: prints allow,
                      never, or ask <question id> (then wait for --answers)

Exit codes
  0  done (also: --budget-check said ok or warn; --check-action said allow)
  1  failed: bad or missing input, unknown run or gate id, unreadable file
  2  --budget-check: stop (over a hard limit, or paused); --check-action: never
  3  --check-action: ask (an approval question is waiting for the owner)

Data folder: ${P.HOME}  (set ARSENALE_HOME to change it)`

const args = process.argv.slice(2)
const company = () => require('./agent-company.cjs')
const shown = (iso) => { const d = new Date(iso); return isNaN(d) ? String(iso || '?') : d.toLocaleString('en-GB', { hour12: false }).replace(',', '') }
const die = (e) => { console.error(e.message || String(e)); process.exit(1) }

if (!args.length || ['--help', '-h', 'help'].includes(args[0])) {
  console.log(HELP)
  process.exit(args.length ? 0 : 1)
}

/** The JSON argument at args[i], in any of its three forms, or null when
 *  there is none. A parse error is one plain sentence, never a stack trace. */
function jsonAt(i) {
  const a = args[i]
  if (a === undefined) return null
  let text
  let from = 'the argument'
  try {
    if (a === '--stdin' || a === '-') { text = fs.readFileSync(0, 'utf8'); from = 'standard input' }
    else if (a === '--file') { if (!args[i + 1]) throw new Error('--file needs a file name'); text = fs.readFileSync(path.resolve(args[i + 1]), 'utf8'); from = args[i + 1] }
    else if (a.startsWith('@')) { text = fs.readFileSync(path.resolve(a.slice(1)), 'utf8'); from = a.slice(1) }
    else text = a
  } catch (e) { die(new Error('cannot read the JSON input: ' + e.message)) }
  try { return JSON.parse(P.stripBom(text)) } catch (e) {
    die(new Error('the JSON from ' + from + ' is not valid (' + e.message + '). Pass it with --stdin or --file to avoid shell quoting; see --help.'))
  }
}

// Nothing is being logged here: this one only reads, so it is handled before
// the "needs a JSON argument" check below.
if (args[0] === '--answers') {
  const { unreadAnswers, readAnswers } = require('./build-agent-dashboard.cjs')
  const flags = args.slice(1)
  const peek = flags.includes('--peek')
  const all = flags.includes('--all')
  const asJson = flags.includes('--json')
  const { fresh } = all ? { fresh: readAnswers().filter(Boolean) } : unreadAnswers(!peek)
  // reading the answers is the supervisor's start of a turn: it is here
  try { company().stampHeartbeat() } catch { /* no company: nothing to stamp */ }
  if (asJson) { console.log(JSON.stringify(fresh, null, 2)); process.exit(0) }
  if (!fresh.length) { console.log(all ? 'No answers recorded yet.' : 'No new answers.'); process.exit(0) }
  console.log((all ? 'All answers' : fresh.length + ' new answer' + (fresh.length === 1 ? '' : 's')) + (all || peek ? '' : ' (now marked read)') + ':')
  for (const a of fresh) {
    const what = a.type === 'dismiss' ? 'DISMISSED (no answer needed, settled elsewhere)' : 'ANSWER: ' + a.answer
    console.log('\n[' + shown(a.at) + '] ' + (a.project || '-') + ' · gate ' + a.gate + (a.kind ? ' (' + a.kind + ')' : '') + (a.run ? ' · run ' + a.run : ''))
    console.log('  Q: ' + a.question)
    console.log('  ' + what)
  }
  process.exit(0)
}
// ---------- closing gates from the command line
if (args[0] === '--dismiss' || args[0] === '--dismiss-older-than') {
  const readJsonDirGates = () => {
    const dir = path.join(RUNS, 'gates')
    if (!fs.existsSync(dir)) return []
    return fs.readdirSync(dir).filter((n) => n.endsWith('.json')).map((n) => { try { return JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8')) } catch { return null } }).filter(Boolean)
  }
  const dry = args.includes('--dry-run')
  let ids
  if (args[0] === '--dismiss') ids = args.slice(1).filter((a) => !a.startsWith('--'))
  else {
    const m = /^(\d+)\s*([hdm])$/i.exec(String(args[1] || ''))
    if (!m) die(new Error('usage: --dismiss-older-than <n>h|<n>d|<n>m [--dry-run]'))
    const age = Number(m[1]) * { m: 60000, h: 3600000, d: 86400000 }[m[2].toLowerCase()]
    ids = readJsonDirGates().filter((g) => g.status === 'waiting' && Date.now() - Date.parse(g.askedAt) > age).sort((a, b) => String(a.askedAt).localeCompare(String(b.askedAt))).map((g) => g.id)
  }
  if (!ids.length) { console.log('No waiting gate to dismiss.'); process.exit(0) }
  let bad = 0
  for (const id of ids) {
    const file = path.join(RUNS, 'gates', String(id).replace(/[^\w.-]/g, '') + '.json')
    let g
    try { g = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { console.error('no such gate: ' + id); bad++; continue }
    if (g.status !== 'waiting') { console.error('gate ' + id + ' is ' + g.status + ', left as it is'); bad++; continue }
    if (!dry) saveGate({ id: g.id, status: 'expired', by: 'supervisor' }, 'log')
    console.log((dry ? 'would dismiss ' : 'dismissed ') + g.id + ' · ' + (g.project || '-') + ' · ' + String(g.label || g.question).slice(0, 70))
  }
  if (!dry) { try { build() } catch { /* the page is rebuilt on the next event */ } }
  process.exit(bad && bad === ids.length ? 1 : 0)
}

// ---------- the company: modes that take no JSON, or optional JSON
if (args[0] === '--company-init') {
  const i = args.indexOf('--seed')
  let seed = null
  if (i > 0) {
    try { seed = JSON.parse(fs.readFileSync(path.resolve(args[i + 1] || ''), 'utf8')) } catch (e) { die(new Error('cannot read the seed: ' + e.message)) }
  }
  const files = [...P.agentFiles()].filter(([n]) => /^[a-z0-9][\w.-]*$/.test(n) && n === n.toLowerCase())
  try {
    // only real agent definitions: a file without frontmatter (WORKFLOW.md, a template) is no employee
    const real = files.filter(([, f]) => /^---\r?\n[\s\S]*?\bname:/.test(fs.readFileSync(f, 'utf8').slice(0, 2000))).map(([n]) => n)
    const r = company().companyInit(seed, real)
    try { build() } catch { /* rebuilt on the next event */ }
    console.log('Company created in ' + r.dir + ': ' + r.offices + ' offices, ' + r.projects + ' projects, ' + r.employees + ' employees.')
  } catch (e) { die(e) }
  process.exit(0)
}
if (args[0] === '--inbox') {
  const flags = args.slice(1)
  const peek = flags.includes('--peek'), all = flags.includes('--all'), asJson = flags.includes('--json')
  let out
  try { out = company().unreadInbox(!peek && !all) } catch (e) { die(e) }
  const list = all ? out.all : out.fresh
  if (asJson) { console.log(JSON.stringify(list, null, 2)); process.exit(0) }
  if (!list.length) { console.log(all ? 'Nothing in the inbox yet.' : 'No new items.'); process.exit(0) }
  console.log((all ? 'All inbox items' : list.length + ' new item' + (list.length === 1 ? '' : 's')) + (all || peek ? '' : ' (now marked read)') + ':')
  for (const l of list) console.log('\n[' + shown(l.at) + '] ' + l.type + ' · ' + (l.by || 'board') + ' via ' + (l.via || '?') + '\n  ' + l.summary)
  process.exit(0)
}
if (args[0] === '--budgets') {
  const on = String(args[1] || '').toLowerCase()
  if (on !== 'on' && on !== 'off') die(new Error('usage: --budgets on|off \'{"by":"board"}\''))
  const input = jsonAt(2) || {}
  const L = require('./runlog.cjs')
  try { console.log(L.setBudgetsEnabled(on === 'on', L.cliActor(input)).summary) } catch (e) { die(e) }
  try { build() } catch { /* rebuilt on the next event */ }
  process.exit(0)
}
if (args[0] === '--heartbeat') {
  const input = jsonAt(1) || {}
  console.log(company().stampHeartbeat(input.session) ? 'ok' : 'no company configured: nothing stamped')
  process.exit(0)
}
if (args[0] === '--company-status') {
  const { collect } = require('./build-agent-dashboard.cjs')
  const C = company()
  const state = collect()
  const cs = C.companyState(state)
  if (args.includes('--json')) { console.log(JSON.stringify(cs, null, 2)); process.exit(0) }
  if (!cs.configured) { console.log('No company configured. Create one with --company-init [--seed <file>].'); process.exit(0) }
  const fmt = (sp) => !sp ? '-' : sp.tokens + ' tokens, ' + (sp.usdStatus === 'na' || (sp.usdStatus === 'none' && sp.runs) ? 'USD n/a' : '$' + sp.usd.toFixed(2) + (sp.usdStatus === 'partial' ? ' (+' + sp.usdMissing + ' runs unpriced)' : '')) + ', ' + sp.runs + ' runs' + (sp.unmeasured ? ' (' + sp.unmeasured + ' unmeasured)' : '')
  const bud = (b) => !b || b.level === 'none' ? 'no budget' : b.level === 'off' ? 'budget off' : b.level + ' ' + Math.round(b.pct) + '%'
  console.log(cs.company.name + ' · ' + cs.periodKey + ' · budgets ' + (cs.company.budgetsEnabled ? 'on' : 'OFF') + (cs.readOnly ? ' · READ-ONLY (newer schema)' : ''))
  console.log('company: ' + fmt(cs.standing.spend) + ' · ' + bud(cs.standing.budget))
  const working = new Map()
  for (const a of state.active) working.set(a.officeId, (working.get(a.officeId) || []).concat(a.agent))
  for (const o of cs.offices) {
    if (o.builtIn && !working.has(o.id) && !o.standing.spend.runs) continue
    console.log('  ' + o.id.padEnd(14) + ' ' + (working.get(o.id) || []).length + ' working' + ((working.get(o.id) || []).length ? ' (' + working.get(o.id).join(', ') + ')' : '') + ' · ' + fmt(o.standing.spend) + ' · ' + bud(o.standing.budget))
  }
  const flagged = cs.employees.filter((e) => e.status === 'paused' || (e.standing && e.standing.budget && ['soft', 'over', 'stop'].includes(e.standing.budget.level)))
  for (const e of flagged) console.log('  employee ' + e.id + ': ' + (e.status === 'paused' ? 'PAUSED ' : '') + bud(e.standing.budget))
  const un = Object.keys(cs.unmapped || {})
  if (un.length) console.log('unmapped project names this month: ' + un.join(', '))
  console.log('supervisor last seen: ' + (cs.heartbeat && cs.heartbeat.lastSeenAt ? shown(cs.heartbeat.lastSeenAt) : 'never'))
  process.exit(0)
}

const MODES = ['--start', '--progress', '--budget-check', '--budget', '--employee', '--decision', '--gate', '--task', '--comment', '--deliverable', '--check-action']
// no mode: the JSON (inline, --stdin, --file or @file) is a finish
const mode = MODES.includes(args[0]) ? args[0] : ''
if (!mode && /^--[a-z]/.test(args[0]) && args[0] !== '--stdin' && args[0] !== '--file') die(new Error('unknown mode ' + args[0] + ' (see --help)'))
const input = jsonAt(mode ? 1 : 0)
if (!input || typeof input !== 'object' || Array.isArray(input)) die(new Error((mode || 'finish') + ' needs a JSON object (see --help)'))

// Every write goes through runlog.cjs, the library the MCP server and the
// dashboard use too. This door's actor is whatever the JSON says ("by"), as
// it always was: the CLI runs as the user and proves nothing more.
const L = require('./runlog.cjs')
const actor = L.cliActor(input)

// Every write rebuilds the page, so a window left open follows the work.
const refresh = () => { try { build() } catch (e) { console.warn('dashboard not rebuilt: ' + e.message) } }

if (mode === '--progress') {
  try { L.progress(input, actor) } catch (e) { die(e) }
  refresh()
  console.log('ok')
  process.exit(0)
}

if (mode === '--budget-check') {
  try {
    const r = L.budgetCheck(input)
    console.log(r.lines.join('\n'))
    process.exit(r.level === 'stop' ? 2 : 0)
  } catch (e) { die(e) }
}
if (mode === '--budget' || mode === '--employee') {
  try {
    const r = mode === '--budget' ? L.setBudget(input, actor) : L.updateEmployee(input, actor)
    refresh()
    console.log(r.summary)
    process.exit(0)
  } catch (e) { die(e) }
}

if (mode === '--decision' || mode === '--gate') {
  try {
    const saved = mode === '--gate' ? L.gate(input, actor) : L.decision(input, actor)
    refresh()
    if (saved.reused) console.error('closed the waiting gate ' + saved.id + ' (' + saved.project + ') instead of creating a new one')
    console.log(saved.id)
    process.exit(0)
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }
}

if (mode === '--task' || mode === '--comment' || mode === '--deliverable' || mode === '--check-action') {
  let line, code = 0
  try {
    if (mode === '--task') {
      const T = require('./tasks.cjs')
      if (input.id) { T.updateTask(input, actor); line = 'ok' } else line = T.createTask(input, actor).id
    } else if (mode === '--comment') {
      require('./tasks.cjs').addComment(String(input.task || input.id || ''), input.text, actor)
      line = 'ok'
    } else if (mode === '--deliverable') {
      const d = require('./deliverables.cjs').addDeliverable(Object.assign({}, input, { job_id: input.run, task_id: input.task, team_member: input.agent }), actor)
      line = d.id + ' ' + d.state + (d.reason ? ' (' + d.reason + ')' : '')
    } else {
      const r = require('./policy.cjs').checkAction(Object.assign({}, input, { team_member: input.agent, job_id: input.run }), actor)
      line = r.verdict + (r.question_id ? ' ' + r.question_id : '') + ': ' + r.message
      code = r.verdict === 'never' ? 2 : r.verdict === 'ask' ? 3 : 0
    }
  } catch (e) { die(e) }
  refresh()
  console.log(line)
  process.exit(code)
}

if (mode === '--start') {
  let r
  try { r = L.startRun(input, actor) } catch (e) { die(e) }
  for (const w of r.warnings) console.error(w)
  refresh()
  console.log(r.id)
  process.exit(0)
}

let done
try { done = L.finishRun(input, actor) } catch (e) { die(e) }
refresh()
// a threshold this run crossed is logged once, for the company, its office and its employee
try {
  for (const i of L.noteIncidents()) console.error('WARNING: budget ' + i.kind + ' — ' + i.scope + ' ' + i.scopeId + ' at ' + i.pct + '% of its ' + i.periodKey + ' budget')
} catch { /* no company */ }
console.log(path.relative(process.cwd(), done.file))
