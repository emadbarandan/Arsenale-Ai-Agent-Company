#!/usr/bin/env node
/* The one command: start the dashboard, run the demo, or log what an agent
 * does. Everything else lives in tools/. See HELP below, or `arsenale --help`.
 *
 * The only processes this ever starts: the system's browser opener, once,
 * after `serve` or `demo` is listening and for `open` (skip it with
 * --no-open); and on Windows, when it makes the launch key file, icacls once
 * (an argument list, no shell) to limit that file to the current user. The
 * server, the run log and the MCP server (`arsenale mcp`) never start a
 * process.
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
                                 --shop: a small shop with office packs and no developers
  log <mode> [json] [flags]      record agent activity; "arsenale log --help" lists the modes
  start | progress | finish | gate | decision | answers | inbox | dismiss | budget-check
                                 short for "log --start", "log --progress", "log <json>" …
  mcp                            the MCP server on stdin/stdout, for an assistant to start
                                 (Settings > Connect your assistant shows the exact line)
  task | comment | deliverable | check-action
                                 short for "log --task", "log --comment" …
  build                          write the dashboard as static files into the data folder
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
  if (out.port && (!Number.isInteger(out.port) || out.port < 1 || out.port > 65535)) fail('--port needs a number from 1 to 65535')
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

async function serve(opts, label) {
  launchKey()
  const { start } = require(path.join(TOOLS, 'agent-dashboard-server.cjs'))
  let s
  try { s = await start({ port: opts.port || 4310 }) } catch (e) { fail(e.message) }
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
  const { makeDemoHome, makeShopHome } = require(path.join(TOOLS, 'demo.cjs'))
  const home = shop ? makeShopHome() : makeDemoHome()
  process.env.ARSENALE_HOME = home
  delete process.env.ARSENALE_AGENT_DIRS
  delete process.env.ARSENALE_TRANSCRIPT_ROOTS
  const { seedCompany, seedEveryone, seedShop, simulate } = require(path.join(TOOLS, 'demo.cjs'))
  let stop = () => {}
  if (shop) seedShop(home)
  else {
    seedCompany()
    try { seedEveryone() } catch (e) { console.error('demo: the 1.0 screens have no data (' + e.message + ')') }
    stop = simulate(home)
  }
  const s = await serve({ port: opts.port || 4311, open: opts.open }, 'Arsenale demo (invented data)')
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

if (cmd === 'serve') serve(flags(args))
else if (cmd === 'open') openDashboard(flags(args))
else if (cmd === 'demo') demo(flags(args))
else if (cmd === 'log') log(args)
else if (cmd === 'mcp') require(path.join(TOOLS, 'mcp-server.cjs')).runStdio()
else if (cmd === 'finish') log(args)
else if (Object.hasOwn(ALIASES, cmd)) log([ALIASES[cmd], ...args])
else if (cmd === 'build') {
  const B = require(path.join(TOOLS, 'build-agent-dashboard.cjs'))
  const n = B.build()
  console.log(B.OUT + ': ' + n.runs + ' runs, ' + n.active + ' running, ' + n.agents + ' agents')
} else if (cmd === 'paths') {
  const P = require(path.join(TOOLS, 'paths.cjs'))
  console.log(JSON.stringify({ home: P.HOME, agentDirs: P.AGENT_DIRS, transcriptRoots: P.TRANSCRIPT_ROOTS, prices: fs.existsSync(P.PRICES) ? P.PRICES : P.PRICES_TEMPLATE + ' (empty template)' }, null, 2))
} else fail('unknown command "' + cmd + '" (see arsenale --help)')
