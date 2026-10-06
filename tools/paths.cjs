/* Where Arsenale keeps its data, and where it reads agents and transcripts.
 *
 * Data lives in one folder, ARSENALE_HOME (default ~/.arsenale), never next to
 * the code: a checkout can be updated, linked or deleted without touching the
 * run logs, and a `git add .` in the repo can never publish them.
 *
 *   <home>/agent-runs/         run records, active runs, gates, decisions, answers
 *   <home>/company/            offices, projects, employees, budgets (optional)
 *   <home>/model-prices.json   USD per million tokens, typed in by the user
 *   <home>/config.json         the optional settings below
 *   <home>/agents/             team members Arsenale manages (packs, the hire form)
 *   <home>/pack-updates/       a pack's new text for a member the owner edited
 *   <home>/launch-key          the owner's dashboard key (launch-key.cjs)
 *   <home>/agent-dashboard.html, agent-dashboard-archive.html   the built pages
 *
 * config.json (every key optional; "~" is expanded here, by Node, so the same
 * file works from PowerShell, cmd and a POSIX shell):
 *   { "agentDirs": ["~/.claude/agents"],          agent definitions to show
 *     "transcriptRoots": ["~/.claude/projects"] } transcripts that may be read
 *
 * Environment variables win over the file: ARSENALE_AGENT_DIRS and
 * ARSENALE_TRANSCRIPT_ROOTS, each a list split by the platform's path
 * delimiter (";" on Windows, ":" elsewhere).
 *
 * Read once per process. The tests and the demo set ARSENALE_HOME before the
 * first require.
 */
const fs = require('fs')
const os = require('os')
const path = require('path')

const expandHome = (p) => {
  const s = String(p || '')
  if (s === '~') return os.homedir()
  if (/^~[\\/]/.test(s)) return path.join(os.homedir(), s.slice(2))
  return s
}

function home() {
  return path.resolve(expandHome(process.env.ARSENALE_HOME || path.join(os.homedir(), '.arsenale')))
}

function readConfig(dir) {
  try {
    const j = JSON.parse(stripBom(fs.readFileSync(path.join(dir, 'config.json'), 'utf8')))
    return j && typeof j === 'object' && !Array.isArray(j) ? j : {}
  } catch { return {} }
}

// Windows PowerShell 5.1 writes UTF-8 with a byte-order mark, which JSON.parse refuses
const stripBom = (s) => String(s).replace(/^﻿/, '')

function listOf(envName, value, fallback) {
  const raw = process.env[envName]
  const list = raw ? raw.split(path.delimiter) : Array.isArray(value) ? value : fallback
  return [...new Set(list.map((p) => String(p || '').trim()).filter(Boolean).map((p) => path.resolve(expandHome(p))))]
}

const HOME = home()
const CONFIG = readConfig(HOME)
const RUNS = path.join(HOME, 'agent-runs')

const P = {
  HOME,
  CONFIG,
  RUNS,
  ACTIVE: path.join(RUNS, 'active'),
  GATES: path.join(RUNS, 'gates'),
  DECISIONS: path.join(RUNS, 'decisions'),
  ANSWERS: path.join(RUNS, 'answers.jsonl'),
  ANSWERS_READ: path.join(RUNS, 'answers.read.json'),
  COMPANY: path.join(HOME, 'company'),
  OUT: path.join(HOME, 'agent-dashboard.html'),
  OUT_ARCHIVE: path.join(HOME, 'agent-dashboard-archive.html'),
  PRICES: path.join(HOME, 'model-prices.json'),
  // the empty template in the repo, used until the user has a file of their own
  PRICES_TEMPLATE: path.join(__dirname, 'model-prices.json'),
  // Arsenale's own agent folder: the only one the dashboard writes team
  // members into (office packs, the hire form)
  MANAGED_AGENTS: path.join(HOME, 'agents'),
  AGENT_DIRS: listOf('ARSENALE_AGENT_DIRS', CONFIG.agentDirs, [path.join(HOME, 'agents')]),
  TRANSCRIPT_ROOTS: listOf('ARSENALE_TRANSCRIPT_ROOTS', CONFIG.transcriptRoots, []),
}
// The managed folder is always read, last: a member hired or installed from
// a pack shows up even when agentDirs names other folders, and a name that
// already exists in one of those keeps resolving to it as before.
if (!P.AGENT_DIRS.includes(P.MANAGED_AGENTS)) P.AGENT_DIRS.push(P.MANAGED_AGENTS)

/** Agent definition files by name, first folder first: a name defined in two
 *  folders is taken from the folder listed first. */
function agentFiles() {
  const out = new Map()
  for (const dir of P.AGENT_DIRS) {
    let names = []
    try { names = fs.readdirSync(dir) } catch { continue }
    for (const n of names.sort()) {
      // <id>.pack-new.md: an edited pack member's new text, where earlier builds left it
      if (!n.endsWith('.md') || n === 'AGENT-RULES.md' || n.endsWith('.pack-new.md')) continue
      const name = n.slice(0, -3)
      if (!out.has(name)) out.set(name, path.join(dir, n))
    }
  }
  return out
}

/** A path is readable as a transcript only inside a configured root, after
 *  links are resolved: a run record cannot point the dashboard at any file.
 *  `realpath` may be fs.realpathSync.native, for both sides alike. */
function insideRoots(file, roots, realpath = fs.realpathSync) {
  let real
  try { real = realpath(path.resolve(String(file))) } catch { return '' }
  for (const r of roots || P.TRANSCRIPT_ROOTS) {
    let root
    try { root = realpath(r) } catch { continue }
    const rel = path.relative(root, real)
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) return real
  }
  return ''
}

module.exports = Object.assign(P, { expandHome, stripBom, agentFiles, insideRoots })
