#!/usr/bin/env node
/* The one command: start the dashboard, run the demo, or log what an agent
 * does. Everything else lives in tools/. See HELP below, or `arsenale --help`.
 *
 * The only processes this ever starts: the system's browser opener, once,
 * after `serve` or `demo` is listening and for `open` (skip it with
 * --no-open); and on Windows icacls (an argument list, no shell) once when it
 * makes the launch key file, and once per data folder for the notify folder,
 * to limit them to the current user. The
 * server, the run log and the MCP server (`arsenale mcp`) never start a
 * process, with two exceptions the caller asks for by name: `testq run` runs
 * the command the caller gave, with the caller's console, when its turn
 * comes, and `resume-scan` runs read-only git in each worktree.
 */
const path = require('path')
const fs = require('fs')

const VERSION = require('../package.json').version
const TOOLS = path.join(__dirname, '..', 'tools')

const HELP = `Arsenale ${VERSION}: run a company of AI agents you can watch at work.

usage: arsenale <command> [options]

Commands
  serve [--port N] [--no-open]   start the dashboard on http://localhost:N (default 4310);
                                 it prints and opens the address with your key in it
  open  [--port N] [--no-open]   open the running dashboard again with your key
                                 (--no-open only prints the address)
  demo  [--port N] [--no-open]   the dashboard on an invented company, in a temporary
                                 folder that is deleted when it stops (default port 4311);
                                 --shop: a small shop with office packs and no developers;
                                 --showcase: hide the dock, legends and notes, for recordings
  log <mode> [json] [flags]      record agent activity; "arsenale log --help" lists the modes
  start | progress | finish | gate | decision | answers | inbox | dismiss | budget-check
                                 | version-run | version-ledger | campus | office | alerts
                                 short for "log --start", "log --progress", "log <json>" …
  progress <run id> "<step>" [<pct>]   a progress line for fixed text, without JSON
  testq run --run <id> [--repo <path>] -- <command ...>  |  testq status | leave
                                 one full test suite at a time on this machine
  resume-scan [--dir D] [--json] unfinished runs whose worktree still has changes
  init [--dir D] [--dry-run] [--yes] [--force]
                                 install agents, rules and skills; scaffold PROJECT.md, REVIEW.md, docs/specs
  autonomous start|status|resume <version>
                                 state file docs/specs/<version>-list.md for an autonomous run
  awake start [--pid N] | stop   keep the machine awake while a process lives (macOS, Linux)
  mcp                            the MCP server on stdin/stdout, for an assistant to start
                                 (Settings > Connect your assistant shows the exact line)
  task | comment | deliverable | check-action
                                 short for "log --task", "log --comment" …
  ledger [--by run|task|version|office|model|week] [--since D] [--until D] [--json]
                                 finished runs grouped, with tokens and cost (n/a or "not recorded", never $0 for unknown)
  savings [--week 2026-W47] [--json] [--write]
                                 this week's spend, cost per done task, tier suggestions (est.); --write saves reports/savings-<week>.md
  context [--project ID] [--write] [--json]
                                 a short brief of one project (at most 1,500 tokens) for an assistant; --write saves it in the data folder
  prices [show|init|check] [--force|--merge]
                                 the price file: show it, fill it with list prices (init), list models without a price
  plan [show] [--project ID] [--json]   versions, phases and progress; owner key: plan version add|edit|move|drop <name>, plan into <task> <version> [--phase ID]
  today [--json]   what is doing, next, waiting for you and blocked, across projects
  next [--project ID] [--claim] [--release <task>] [--json]   the next approved task with its context pack (starts nothing); --claim: supervisor claims it
  queue [list|add <task>...|remove <task>|move <task> <n|up|down>|clear]   the work queue; changes need the owner key
  import-plan <file> --project ID (--phases-as versions | --version N) [--dry-run] [--shadow | --promote]   owner key: read a schema-v1 plan in (three-way merge, never deletes)
  plan-parity <hq.json> --project ID (--phases-as versions | --version N) [--shadow] [--only-imported] [--write]   compare HQ export and Arsenale: counts, progress, weights
  shadow drop --project ID   owner key: delete the M2 shadow copy (and nothing else)
  plan restore <plan-m3-stamp> [--force]   owner key: undo a --promote from its backup (refuses to undo later work without --force)
  release-notes VERSION --project ID [--write] [--json]   draft notes from the version's done tasks
  export-plan --project ID (--phases-as versions | --version N) [--out F] [--force]   write the plan as schema v1
  build                          write the dashboard as static files into the data folder
  plan-check <file> [--expect <expected.json>] [--json]   check a schema-v1 plan file (JSON) and print its progress
  paths                          print the data folder and where agents and transcripts are read
  help | --help                  this text;  --version  the version

JSON for log commands: inline for fixed text, otherwise --stdin or --file <f>.
  bash:        arsenale progress --stdin <<'EOF'
               {"id":"<run id>","doing":"reading src/app.ts"}
               EOF
  PowerShell:  arsenale progress --file "$env:TEMP\\step.json"

Exit codes
  0  done            1  failed (bad input, port taken, unknown command)
  2  "budget-check" said stop

Environment
  ARSENALE_HOME               data folder (default: ~/.arsenale)
  ARSENALE_AGENT_DIRS         agent definition folders, ; or : separated
  ARSENALE_TRANSCRIPT_ROOTS   folders whose transcripts may be read

Arsenale only watches: it never starts, stops or controls an agent.`

const ALIASES = {
  start: '--start', progress: '--progress', gate: '--gate', decision: '--decision', answers: '--answers', inbox: '--inbox',
  dismiss: '--dismiss', 'budget-check': '--budget-check', budget: '--budget', budgets: '--budgets', employee: '--employee',
  heartbeat: '--heartbeat', 'company-init': '--company-init', 'company-status': '--company-status',
  task: '--task', comment: '--comment', deliverable: '--deliverable', 'check-action': '--check-action',
  campus: '--campus', office: '--office', 'version-run': '--version-run', 'version-ledger': '--version-ledger',
  testq: '--testq', 'resume-scan': '--resume-scan', alerts: '--alerts',
}

function flags(args) {
  const out = { port: 0, open: true, rest: [] }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--no-open') out.open = false
    else if (a === '--port' || a === '-p') out.port = Number(args[++i])
    else if (/^--port=/.test(a)) out.port = Number(a.slice(7))
    else out.rest.push(a)
  }
  // 0 means "not given"; NaN ("--port abc") is falsy too, so it is tested apart, or serve would fall back to 4310
  if (out.port !== 0 && (!Number.isInteger(out.port) || out.port < 1 || out.port > 65535)) fail('--port needs a number from 1 to 65535')
  return out
}

function fail(msg) { console.error(msg); process.exit(1) }

/** Opens the address in the default browser. Never fatal: the address is printed anyway. */
function openBrowser(url) {
  const { spawn } = require('child_process')
  const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]]
  try {
    const p = spawn(cmd, args, { stdio: 'ignore', detached: true, windowsHide: true })
    p.on('error', () => { /* no opener installed: the printed address is enough */ })
    p.unref()
  } catch { /* the same */ }
}

/** The launch key of the data folder, made when there is none. A new file on
 *  Windows is limited to this user with icacls: mode 0600 means nothing
 *  there, and the folder's inherited rights may let other accounts read it.
 *  Never fatal: the warning says what to check. */
function launchKey() {
  const LK = require(path.join(TOOLS, 'launch-key.cjs'))
  let k
  try { k = LK.ensure() } catch (e) { fail('Could not write the launch key ' + LK.FILE + ': ' + e.message) }
  if (k.created && process.platform === 'win32') {
    const who = (process.env.USERDOMAIN ? process.env.USERDOMAIN + '\\' : '') + (process.env.USERNAME || require('os').userInfo().username)
    let r
    try { r = require('child_process').spawnSync('icacls', [k.file, '/inheritance:r', '/grant:r', who + ':F'], { encoding: 'utf8', windowsHide: true }) } catch (e) { r = { error: e } }
    if (!r || r.error || r.status !== 0) console.warn('Warning: could not limit ' + k.file + ' to your account (icacls: ' + String((r && r.error && r.error.message) || (r && (r.stderr || r.stdout)) || 'failed').trim() + '). Check that only you can read it.')
  }
  return k
}

/** Windows: the notify folder, where Settings saves the phone channels'
 *  secrets (tools/notify.cjs), limited to this user with inheritance, so
 *  every file the server writes there later (atomic writes make a new file
 *  each time) is the owner's only. Read back at every start and re-applied
 *  when wrong (tools/owner-only.cjs): an ACL changed after the first start
 *  must not hide behind the mark file. On macOS and Linux notify.cjs keeps
 *  the folder 0700 and its files 0600. */
function ownerOnlyNotifyFolder() {
  if (process.platform !== 'win32') return
  const dir = path.join(require(path.join(TOOLS, 'paths.cjs')).HOME, 'notify')
  const r = require(path.join(TOOLS, 'owner-only.cjs')).ensure(dir)
  if (!r.ok) console.warn('Warning: could not limit ' + dir + ' to your account (' + r.reason + '). Check that only you can read it before you save phone secrets in Settings.')
}

async function serve(opts, label) {
  launchKey()
  ownerOnlyNotifyFolder()
  const { start } = require(path.join(TOOLS, 'agent-dashboard-server.cjs'))
  let s
  try { s = await start({ port: opts.port || 4310, demo: !!opts.demo, showcase: !!opts.showcase }) } catch (e) { fail(e.message) }
  console.log((label || 'Arsenale dashboard') + ': ' + s.keyUrl + '   (Ctrl+C to stop)')
  console.log('Data folder: ' + require(path.join(TOOLS, 'paths.cjs')).HOME)
  if (opts.open) openBrowser(s.keyUrl)
  return s
}

/** `arsenale open`: the address with the key, for a dashboard already running
 *  from this data folder (a new browser, or a cookie that was cleared). */
function openDashboard(opts) {
  const LK = require(path.join(TOOLS, 'launch-key.cjs'))
  const key = LK.readKey()
  if (!key) fail('No launch key in ' + require(path.join(TOOLS, 'paths.cjs')).HOME + ' yet: start the dashboard with "arsenale serve" first.')
  const url = 'http://localhost:' + (opts.port || 4310) + '/?k=' + key
  console.log('Arsenale dashboard: ' + url)
  if (opts.open) openBrowser(url)
}

async function demo(opts) {
  // before anything reads paths.cjs: the demo must never see the user's data
  // --shop: a small shop with no developers, as the first-start wizard sets it up
  const shop = opts.rest.includes('--shop')
  const showcase = opts.rest.includes('--showcase')
  const { makeDemoHome, makeShopHome } = require(path.join(TOOLS, 'demo.cjs'))
  const home = shop ? makeShopHome() : makeDemoHome()
  process.env.ARSENALE_HOME = home
  delete process.env.ARSENALE_AGENT_DIRS
  delete process.env.ARSENALE_TRANSCRIPT_ROOTS
  const { seedCompany, seedEveryone, seedShop, simulate } = require(path.join(TOOLS, 'demo.cjs'))
  // The address first, then the seed (seconds on a busy machine), then the
  // browser: a script reading the output gets the key URL at once. The seed
  // runs in one synchronous stretch, so a request that arrives meanwhile
  // waits for it and never sees half the invented company.
  const s = await serve({ port: opts.port || 4311, open: false, demo: true, showcase }, 'Arsenale demo (invented data)')
  let stop = () => {}
  if (shop) seedShop(home)
  else {
    seedCompany()
    try { seedEveryone() } catch (e) { console.error('demo: the 1.0 screens have no data (' + e.message + ')') }
    stop = simulate(home)
  }
  require(path.join(TOOLS, 'build-agent-dashboard.cjs')).invalidate()
  if (opts.open) openBrowser(s.keyUrl)
  const cleanup = () => {
    stop()
    try { s.server.close() } catch { /* already closed */ }
    try { fs.rmSync(home, { recursive: true, force: true }) } catch { /* the OS cleans its temp folder later */ }
    process.exit(0)
  }
  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)
}

function log(args) {
  // the run log is a script with its own exit codes: run it in this process
  process.argv = [process.argv[0], path.join(TOOLS, 'log-agent-run.cjs'), ...args]
  require(path.join(TOOLS, 'log-agent-run.cjs'))
}

const [cmd, ...args] = process.argv.slice(2)
if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') { console.log(HELP); process.exit(cmd ? 0 : 1) }
if (cmd === '--version' || cmd === '-v' || cmd === 'version') { console.log(VERSION); process.exit(0) }

// the showcase look is for recordings of the invented company only
if (cmd === 'serve' && args.includes('--showcase')) fail('--showcase works with "arsenale demo" only.')
else if (cmd === 'serve') serve(flags(args))
else if (cmd === 'open') openDashboard(flags(args))
else if (cmd === 'demo') demo(flags(args))
else if (cmd === 'log') log(args)
else if (cmd === 'init' || cmd === 'autonomous' || cmd === 'awake') {
  const A = require(path.join(TOOLS, 'autonomous.cjs'))
  process.exitCode = A[cmd](args, console.log)
} else if (cmd === 'mcp') require(path.join(TOOLS, 'mcp-server.cjs')).runStdio()
else if (cmd === 'finish') log(args)
else if (cmd === 'ledger') process.exitCode = require(path.join(TOOLS, 'ledger.cjs')).run(args, console.log)
else if (cmd === 'savings') process.exitCode = require(path.join(TOOLS, 'savings.cjs')).run(args, console.log)
else if (cmd === 'context') process.exitCode = require(path.join(TOOLS, 'context-pack.cjs')).run(args, console.log)
else if (cmd === 'plan-parity' || cmd === 'shadow' || (cmd === 'plan' && args[0] === 'restore')) process.exitCode = require(path.join(TOOLS, 'plan-migrate.cjs')).run(cmd === 'plan' ? args.slice(1) : args, console.log, cmd === 'plan' ? 'restore' : cmd)
else if (cmd === 'today') { const Pl = require(path.join(TOOLS, 'plan.cjs')); const D = Pl.today(); console.log(args.includes('--json') ? JSON.stringify(D, null, 2) : Pl.todayText(D)) }
else if (cmd === 'next') process.exitCode = require(path.join(TOOLS, 'queue.cjs')).run(args, console.log, 'next')
else if (cmd === 'queue') process.exitCode = require(path.join(TOOLS, 'queue.cjs')).run(args, console.log, 'queue')
else if (cmd === 'plan') process.exitCode = require(path.join(TOOLS, 'plan.cjs')).run(args, console.log)
else if (cmd === 'release-notes') process.exitCode = require(path.join(TOOLS, 'release-notes.cjs')).run(args, console.log)
else if (cmd === 'import-plan' || cmd === 'export-plan') process.exitCode = require(path.join(TOOLS, 'plan-io.cjs')).run(args, console.log, cmd)
else if (cmd === 'prices') process.exitCode = require(path.join(TOOLS, 'prices.cjs')).run(args, console.log)
else if (Object.hasOwn(ALIASES, cmd)) log(args.length === 1 && ['--help', '-h'].includes(args[0]) ? ['--help'] : [ALIASES[cmd], ...args])
else if (cmd === 'build') {
  const B = require(path.join(TOOLS, 'build-agent-dashboard.cjs'))
  const n = B.build()
  console.log(B.OUT + ': ' + n.runs + ' runs, ' + n.active + ' running, ' + n.agents + ' agents')
} else if (cmd === 'paths') {
  const P = require(path.join(TOOLS, 'paths.cjs'))
  console.log(JSON.stringify({ home: P.HOME, runs: P.RUNS, company: P.COMPANY, agentDirs: P.AGENT_DIRS, transcriptRoots: P.TRANSCRIPT_ROOTS, prices: fs.existsSync(P.PRICES) ? P.PRICES : P.PRICES_TEMPLATE + ' (empty template)' }, null, 2))
} else if (cmd === 'plan-check') {
  const S = require(path.join(TOOLS, 'plan-schema.cjs'))
  const file = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--expect')
  if (!file) fail('usage: arsenale plan-check <file> [--expect <expected.json>] [--json]')
  let raw
  try { const st = fs.statSync(file); if (st.size > S.MAX_BYTES) fail(file + ' is larger than 5 MB, refused'); raw = fs.readFileSync(file) } catch (e) { fail('cannot read ' + file + ': ' + e.code) }
  const r = S.check(raw)
  let diffs = []
  const ei = args.indexOf('--expect')
  if (ei >= 0) {
    if (!args[ei + 1]) fail('--expect needs a file')
    try { diffs = r.ok ? S.compareExpected(r, JSON.parse(fs.readFileSync(args[ei + 1], 'utf8'))) : ['plan is invalid'] } catch (e) { fail('cannot read expected file: ' + e.message) }
  }
  console.log(args.includes('--json') ? JSON.stringify({ ...r, expectDiffs: ei >= 0 ? diffs : undefined }, null, 2) : S.format(r) + (diffs.length ? '\nDiffers from expected:\n' + diffs.map((d) => '  - ' + d).join('\n') : ei >= 0 ? '\nMatches expected.' : ''))
  process.exit(r.ok && !diffs.length ? 0 : 1)
} else fail('unknown command "' + cmd + '" (see arsenale --help)')
