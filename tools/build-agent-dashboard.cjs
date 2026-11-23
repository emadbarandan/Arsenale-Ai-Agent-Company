#!/usr/bin/env node
/* The pages the user watches the agents from: the office
 * (agent-office-page.cjs), which shows today, and the archive below, which
 * lists every run ever recorded.
 *
 * What goes into them (folders from paths.cjs, under ARSENALE_HOME):
 *   agent-runs/active/*.json  what is running right now
 *   agent-runs/*.json         what each agent did, newest first
 *   agent-runs/gates/*.json   what the supervisor asked the user (A/B/C gates)
 *   agent-runs/decisions/*.json  who decided what, and why
 *   <agent dirs>/*.md         the agents that exist, their model and tools
 *   <transcript roots>/…/subagents/*.jsonl  the agents' own transcripts (the
 *                             Claude Code layout): tool calls, files touched
 *                             and token use are counted from them
 *   model-prices.json         USD per million tokens, filled in by the user
 *
 * Two ways to read it, both offline:
 *   - the built files (agent-dashboard.html, and
 *     agent-dashboard-archive.html next to it), opened by double-click.
 *     The data is embedded, and the page reloads itself every few seconds;
 *     every log call rebuilds it, so an open window follows the work.
 *   - the local server (agent-dashboard-server.cjs), which serves the same
 *     pages in live mode: they poll for changes and update in place, without
 *     reloading.
 *
 * Run records are never rewritten here. What older records lack (a clean
 * project or model name, a duration, the parent run) is worked out on every
 * read, in describe() below, and only the page sees the result. Gate files are
 * the one thing updated in place: answering a gate changes its status.
 *
 *   node tools/build-agent-dashboard.cjs
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const P = require('./paths.cjs')

const { RUNS, ACTIVE, OUT, OUT_ARCHIVE, GATES, DECISIONS, ANSWERS } = P
const { renderOffice } = require('./agent-office-page.cjs')
const { renderArchive } = require('./pages/archive/render.cjs')
const { langFromRequest } = require('./dashboard-strings.cjs')

// Other agents log while the server reads, so a file is never seen half
// written: a temp file next to it, then a rename (store.cjs).
const { writeAtomic, withLock } = require('./store.cjs')

function readJsonDir(dir) {
  if (!fs.existsSync(dir)) return []
  const out = []
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.json')) continue
    try {
      out.push(JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')))
    } catch {
      console.warn('Unreadable record skipped: ' + name)
    }
  }
  return out
}

/** The agents that exist, from their definition files. Only the frontmatter is
 *  read — the body is the agent's own instructions, not something to show. */
function readAgents() {
  // labels.json (optional, in any agent folder: { "<agent>": { "dept" } })
  // says which desk an agent takes. A `zone:` line in the frontmatter places
  // the desk too, and wins.
  const labels = {}
  for (const dir of P.AGENT_DIRS.slice().reverse()) {
    try {
      const j = JSON.parse(P.stripBom(fs.readFileSync(path.join(dir, 'labels.json'), 'utf8')))
      for (const [k, v] of Object.entries(j)) if (v && typeof v === 'object') labels[k] = v
    } catch { /* no labels there: English text, desk from the name */ }
  }
  const out = []
  for (const [name, file] of P.agentFiles()) {
    let text = ''
    try { text = fs.readFileSync(file, 'utf8') } catch { continue }
    const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
    if (!block) continue
    const field = (key) => {
      const m = new RegExp('^' + key + ':\\s*(.+)$', 'm').exec(block[1])
      return m ? m[1].trim() : ''
    }
    const agentName = field('name') || name
    const lab = Object.hasOwn(labels, agentName) ? labels[agentName] : {}
    const descriptionEn = field('description')
    out.push({
      name: agentName,
      title: '',
      description: descriptionEn,
      descriptionEn,
      model: field('model'),
      effort: field('effort'),
      tools: field('tools'),
      color: field('color'),
      dept: field('zone') || lab.dept || '', // optional: which department's desk the agent takes
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/** One fixed name per project, whatever the supervisor typed that day
 *  ("MyApp (feature branch)" and "MyApp" are one project). A company maps
 *  other spellings with project aliases (agent-company.cjs). */
function projectKey(text) {
  const s = String(text || '').trim()
  if (!s) return ''
  for (const [rx, name] of PROJECT_ALIASES) if (rx.test(s)) return name
  return s.replace(/\s*\(.*\)\s*$/, '') || s
}
// config.json "projectAliases": [{ "match": "<regular expression>", "project":
// "<name>" }], tried in order, case-insensitive: for a run log that named one
// project several ways before a company with project aliases existed. A bad
// expression is skipped, never fatal.
const PROJECT_ALIASES = (Array.isArray(P.CONFIG.projectAliases) ? P.CONFIG.projectAliases : []).slice(0, 50).map((a) => {
  try { return a && typeof a.match === 'string' && a.match && a.project ? [new RegExp(a.match, 'i'), String(a.project).slice(0, 80)] : null } catch { return null }
}).filter(Boolean)

/** A short, stable model name for grouping and prices. Model ids that carry a
 *  family and a version ("vendor-family-5-5", "family-5.5") become "Family
 *  5.5"; a few well-known family words are recognised for that; anything else
 *  is shown as it was logged ("gpt-5-codex", "gemini-2.5-pro", "my-model"). */
function modelKey(text) {
  const s = String(text || '').trim()
  if (!s) return ''
  const fam = /(opus|sonnet|haiku|fable)/i.exec(s)
  if (!fam) return /^inherit/i.test(s) ? 'inherit' : s
  const name = fam[1][0].toUpperCase() + fam[1].slice(1).toLowerCase()
  const ver = /(\d+)[-.](\d+)/.exec(s.slice(fam.index))
  const key = ver ? name + ' ' + ver[1] + '.' + ver[2] : name
  return modelAlias(key)
}
// config.json "modelAliases": { "Family": "Family 5.5" } names the version a
// bare family meant in older records, so they group and price with it
const MODEL_ALIASES = P.CONFIG.modelAliases && typeof P.CONFIG.modelAliases === 'object' && !Array.isArray(P.CONFIG.modelAliases) ? P.CONFIG.modelAliases : {}
const modelAlias = (key) => (Object.hasOwn(MODEL_ALIASES, key) && typeof MODEL_ALIASES[key] === 'string' && MODEL_ALIASES[key] ? MODEL_ALIASES[key].slice(0, 60) : key)

// Agents that started another agent used to name it only in the task text.
const parentFromTask = (task) => (/\(under\s+([\w.:-]+)\)/i.exec(String(task || '')) || [])[1] || ''

// ---------- transcripts
// Optional, and only for tools that keep one JSONL file per subagent in the
// Claude Code layout: <root>/<project>/<session>/subagents/agent-<id>.jsonl,
// where <root> is one of the configured transcriptRoots. Only names, counts
// and paths are taken from it, never file contents or command text (a
// command line can carry a passcode). Other tools report tokens themselves
// in the finish record ("usage") or not at all.

// Paths that must not appear by name on the page (AGENT-RULES §2); they are
// counted instead.
const SECRET_PATH = /(^|[\\/])secrets[\\/]|\.(lic|pem|key|pfx|p12)$|(^|[\\/])\.env[^\\/]*$|(^|[\\/])id_[^\\/]*$/i
const FILE_TOOLS = { Read: 'read', Edit: 'edit', MultiEdit: 'edit', NotebookEdit: 'edit', Write: 'write' }

const summaryCache = new Map() // path -> { size, mtimeMs, summary }

/** Tool counts, files touched and tokens by type, from one transcript. */
function readTranscript(file, freshMs) {
  let st
  try { st = fs.statSync(file) } catch { return { found: false, path: file, reason: 'missing' } }
  const hit = summaryCache.get(file)
  if (hit && hit.size === st.size && hit.mtimeMs === st.mtimeMs) return hit.summary
  // a running agent's transcript grows on every call; the server polls every
  // 1.5 s, so it is parsed again at most every freshMs
  if (hit && freshMs && Date.now() - hit.at < freshMs) return hit.summary
  const toolCounts = {}
  const files = new Map()
  let hidden = 0
  // One API message is written as several lines (one per content block), each
  // repeating the same usage block, so usage is counted once per message id.
  const usage = new Map()
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line || line.indexOf('"assistant"') < 0) continue
    let j
    try { j = JSON.parse(line) } catch { continue }
    const m = j && j.type === 'assistant' && j.message
    if (!m) continue
    if (m.usage && m.id) {
      const u = m.usage, cc = u.cache_creation || {}
      const w5 = cc.ephemeral_5m_input_tokens, w1 = cc.ephemeral_1h_input_tokens
      const row = {
        model: m.model || '',
        input: u.input_tokens || 0,
        output: u.output_tokens || 0,
        cacheRead: u.cache_read_input_tokens || 0,
        // older transcripts carry only the total cache write; count it as 5-minute
        cacheWrite5m: w5 != null || w1 != null ? (w5 || 0) : (u.cache_creation_input_tokens || 0),
        cacheWrite1h: w1 || 0,
      }
      const old = usage.get(m.id)
      if (old) for (const k of Object.keys(row)) { if (k !== 'model') row[k] = Math.max(row[k], old[k]) }
      usage.set(m.id, row)
    }
    for (const c of Array.isArray(m.content) ? m.content : []) {
      if (!c || c.type !== 'tool_use') continue
      const name = String(c.name || '?')
      toolCounts[name] = (toolCounts[name] || 0) + 1
      const input = c.input || {}
      const kind = FILE_TOOLS[name]
      const p = kind && (input.file_path || input.notebook_path)
      if (p) {
        if (SECRET_PATH.test(String(p))) hidden++
        else {
          const f = files.get(p) || { path: String(p), read: 0, edit: 0, write: 0 }
          f[kind]++
          files.set(p, f)
        }
      }
    }
  }
  const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 }
  const models = {}
  for (const u of usage.values()) {
    const mk = modelKey(u.model) || '?'
    const t = models[mk] || (models[mk] = { input: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0, long: { input: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 } })
    for (const k of Object.keys(tokens)) { tokens[k] += u[k]; t[k] += u[k] }
    // messages whose prompt is over 100,000 tokens: a subset of the sums,
    // priced at a model's over100k rate (spec 1.3 3.2); a 1.2 reader ignores it
    if (u.input + u.cacheRead + u.cacheWrite5m + u.cacheWrite1h > 100000) for (const k of Object.keys(tokens)) t.long[k] += u[k]
  }
  const list = [...files.values()].sort((a, b) => (b.edit + b.write) - (a.edit + a.write) || b.read - a.read)
  const summary = {
    found: true,
    path: file,
    toolCounts,
    toolUses: Object.values(toolCounts).reduce((a, b) => a + b, 0),
    files: list.slice(0, 200),
    moreFiles: Math.max(0, list.length - 200),
    hiddenFiles: hidden,
    tokens,
    tokensTotal: Object.values(tokens).reduce((a, b) => a + b, 0),
    // every call re-reads the whole context from the cache, so cache reads
    // dwarf everything else; "new" tokens are the ones written or generated
    tokensNew: tokens.input + tokens.output + tokens.cacheWrite5m + tokens.cacheWrite1h,
    models,
    messages: usage.size,
    parsedAt: new Date().toISOString(),
  }
  summaryCache.set(file, { size: st.size, mtimeMs: st.mtimeMs, at: Date.now(), summary })
  return summary
}

/** The first line of a transcript is the prompt the agent was given. */
function firstLine(file) {
  let fd
  try {
    fd = fs.openSync(file, 'r')
    const buf = Buffer.alloc(256 * 1024)
    const n = fs.readSync(fd, buf, 0, buf.length, 0)
    const s = buf.toString('utf8', 0, n)
    const i = s.indexOf('\n')
    return i < 0 ? s : s.slice(0, i)
  } catch { return '' } finally { if (fd !== undefined) try { fs.closeSync(fd) } catch { /* ignore */ } }
}

const findCache = new Map() // run id -> { at, file }
/** The transcript of a run, found by its run id in the agent's prompt. Only
 *  files written since the run started are opened, so this stays cheap. A miss
 *  is remembered for 30 seconds, because pages rebuild on every log call. */
function findTranscript(id, startedAt) {
  if (!id) return ''
  const c = findCache.get(id)
  if (c && (c.file || Date.now() - c.at < 30000)) return c.file
  const since = (Date.parse(startedAt) || 0) - 5 * 60000
  const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // an agent started under this run names it as its parent; that is not this run
  const asParent = new RegExp('\\(under\\s+' + esc + '\\)|parent\\\\?"\\s*:\\s*\\\\?"' + esc, 'g')
  const hits = []
  const projects = []
  for (const root of P.TRANSCRIPT_ROOTS) {
    try { for (const p of fs.readdirSync(root)) projects.push(path.join(root, p)) } catch { /* no transcripts there */ }
  }
  for (const p of projects) {
    let sessions = []
    try { sessions = fs.readdirSync(p) } catch { continue }
    for (const s of sessions) {
      const dir = path.join(p, s, 'subagents')
      let names = []
      try { names = fs.readdirSync(dir) } catch { continue }
      for (const n of names) {
        if (!n.endsWith('.jsonl')) continue
        const f = path.join(dir, n)
        let st
        try { st = fs.statSync(f) } catch { continue }
        if (st.mtimeMs < since) continue
        const head = firstLine(f)
        if (head.indexOf(id) < 0 || head.replace(asParent, '').indexOf(id) < 0) continue
        // a reviewer's prompt may cite the builder's run id (its report file,
        // say); a prompt that names its own "Run id" belongs to that run only
        const own = /\brun[\s_-]*id\b[\s:=`"'*]*([\w.:-]{10,})/i.exec(head)
        if (own && own[1].replace(/[.:]+$/, '') !== id) continue
        hits.push({ f, t: st.birthtimeMs || st.mtimeMs })
      }
    }
  }
  hits.sort((a, b) => a.t - b.t)
  const file = hits.length ? hits[0].f : ''
  findCache.set(id, { at: Date.now(), file })
  return file
}

/** What a finished run records about its transcript: the path the supervisor
 *  gave, or the one found by run id. A given path is read only when it lies
 *  inside a configured transcript root; a log line is not allowed to point
 *  the dashboard at any file on the machine. Never throws. */
function transcriptFor(id, startedAt, given, freshMs) {
  try {
    if (!given && !id) return { found: false, reason: 'not-found' }
    if (!P.TRANSCRIPT_ROOTS.length) return { found: false, reason: 'no-roots' }
    const file = given ? P.insideRoots(given) : findTranscript(id, startedAt)
    if (given && !file) return { found: false, reason: 'outside-roots' }
    if (!file) return { found: false, reason: 'not-found' }
    return readTranscript(file, freshMs)
  } catch (e) {
    return { found: false, reason: 'error: ' + e.message }
  }
}

// ---------- prices
/** The owner's price file (else the empty template), parsed, or null. */
function readPricesFile() {
  for (const f of [P.PRICES, P.PRICES_TEMPLATE]) {
    try {
      const j = JSON.parse(P.stripBom(fs.readFileSync(f, 'utf8')))
      if (j && typeof j === 'object') return j
    } catch { /* not there or not readable: try the next */ }
  }
  return null
}
function readPrices() {
  const j = readPricesFile()
  return j && typeof j.models === 'object' && j.models ? j.models : {}
}
const PRICE_FIELDS = ['input', 'output', 'cacheRead', 'cacheWrite5m', 'cacheWrite1h']
/** A price is used only when it is a finite number >= 0 (spec 1.3 3.2). */
const validPrice = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0
const pricesSet = (prices) => Object.values(prices).some((p) => p && PRICE_FIELDS.every((k) => validPrice(p[k])))

/** The price entry of a stored model name, own keys only: a model named
 *  "constructor" must not find Object's. */
function priceOf(prices, stored) {
  // a transcript counted before the alias was set keeps the bare family
  const mk = modelAlias(stored)
  return (Object.hasOwn(prices, mk) && prices[mk]) || (Object.hasOwn(prices, mk.split(' ')[0]) && prices[mk.split(' ')[0]]) || null
}
/** USD of one set of sums at one price entry, or null when a price a token
 *  needs is missing or malformed. */
function priceSums(tok, p) {
  let usd = 0
  for (const k of PRICE_FIELDS) {
    if (!tok[k]) continue
    if (!p || !validPrice(p[k])) return null
    usd += tok[k] * p[k] / 1e6
  }
  return usd
}
function priceTokens(models, prices) {
  let usd = 0
  let note = ''
  for (const [stored, tok] of Object.entries(models)) {
    const p = priceOf(prices, stored)
    if (!p) return { usd: null, why: 'prices' }
    const over = p.over100k && typeof p.over100k === 'object' ? p.over100k : null
    const lg = tok.long && typeof tok.long === 'object' ? tok.long : null
    let part
    if (over && lg) {
      const rest = {}
      for (const k of PRICE_FIELDS) rest[k] = Math.max(0, (tok[k] || 0) - (lg[k] || 0))
      const a = priceSums(rest, p), b = priceSums(lg, over)
      part = a === null || b === null ? null : a + b
    } else {
      part = priceSums(tok, p)
      if (over && !lg && part !== null) note = 'base rate; prompt size not recorded'
    }
    if (part === null) return { usd: null, why: 'prices' }
    usd += part
  }
  return { usd, why: '', note }
}

/** The meters a run reported itself, as the five sums, or null unless input,
 *  output, cache read and a cache write are all there (spec 1.3 3.1). */
function reportedMeters(u) {
  const n = (v) => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : undefined)
  const input = n(u.inputTokens), output = n(u.outputTokens), cacheRead = n(u.cacheReadTokens)
  const w = n(u.cacheWriteTokens), w5 = n(u.cacheWrite5mTokens), w1 = n(u.cacheWrite1hTokens)
  if (input === undefined || output === undefined || cacheRead === undefined || (w === undefined && w5 === undefined && w1 === undefined)) return null
  return { input, output, cacheRead, cacheWrite5m: (w || 0) + (w5 || 0), cacheWrite1h: w1 || 0 }
}

/** USD for a run, or null with the reason. Meters from a found transcript
 *  win; else four reported meters with a model; a bare total is never priced.
 *  A price is only used when the user has typed it into model-prices.json. */
function costOf(t, prices, rep) {
  if (t && t.found && t.models) return Object.assign(priceTokens(t.models, prices), { src: 'transcript' })
  if (rep && rep.meters && rep.model) {
    const c = priceTokens({ [rep.model]: rep.meters }, prices)
    return Object.assign(c, { src: rep.estimated ? 'estimated' : 'reported' })
  }
  return { usd: null, why: 'nodata', src: '' }
}

/** New tokens (no cache reads) of reported meters: a run that gave the four meters but no total is still measured. */
const meterNew = (m) => (m ? m.input + m.output + m.cacheWrite5m + m.cacheWrite1h : 0)

/** The derived fields the pages use, less the brief; the record on disk
 *  stays as it is. */
function describe(r, prices) {
  const took = Date.parse(r.finishedAt) - Date.parse(r.startedAt)
  const u = r.usage && typeof r.usage === 'object' ? r.usage : {}
  const t = r.transcript && typeof r.transcript === 'object' ? r.transcript : null
  const mkey = modelKey(r.model || u.model)
  const reported = reportedMeters(u)
  const cost = costOf(t, prices || {}, { meters: reported, model: mkey, estimated: u.estimated === true })
  const found = !!(t && t.found)
  const meters = found && t.tokens ? t.tokens : reported
  const provider = r.provider || u.provider || (/^(Opus|Sonnet|Haiku|Fable)\b/.test(mkey) ? 'anthropic' : '')
  const cacheDen = meters ? meters.input + meters.cacheRead + meters.cacheWrite5m + meters.cacheWrite1h : 0
  // the brief stays on the server, where a resume reads it from the run file
  // (resume.cjs): never in /api/state, the page's JSON or the saved pages
  delete r.brief
  return Object.assign(r, {
    projectKey: projectKey(r.project),
    modelKey: modelKey(r.model || u.model),
    durMs: Number(r.durationMs) || Number(u.durationMs) || (took > 0 ? took : 0),
    parentId: String(r.parent || parentFromTask(r.task)),
    // The Agent tool's totalTokens is the size of the agent's last context,
    // not a sum over the run, so the transcript's count wins when there is one.
    tokTotal: t && t.found ? t.tokensNew : (Number(r.tokens) || Number(u.tokens) || meterNew(reported)),
    tokSrc: t && t.found ? 'transcript' : (Number(r.tokens) || Number(u.tokens) || meterNew(reported) ? 'reported' : ''),
    toolTotal: Number(u.toolUses) || (t && t.found ? t.toolUses : 0),
    costUsd: cost.usd,
    costWhy: cost.why,
    costNote: cost.usd === null ? '' : (cost.note || ''),
    costSrc: cost.usd === null ? '' : cost.src,
    meters: meters ? { input: meters.input, output: meters.output, cacheRead: meters.cacheRead, cacheWrite5m: meters.cacheWrite5m, cacheWrite1h: meters.cacheWrite1h } : null,
    meterSrc: found && t.tokens ? 'transcript' : reported ? (u.estimated === true ? 'estimated' : 'reported') : '',
    provider,
    cacheShare: meters && cacheDen > 0 ? meters.cacheRead / cacheDen : null,
    wallSeconds: Math.round((Number(r.durationMs) || Number(u.durationMs) || (took > 0 ? took : 0)) / 1000),
    turns: found && Number.isFinite(t.messages) ? t.messages : null,
  })
}

// ---------- gates and decisions
const idFor = (prefix) => prefix + '-' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + Math.random().toString(36).slice(2, 6)
const fileFor = (dir, id) => path.join(dir, String(id).replace(/[^\w.-]/g, '') + '.json')
const clip = (s, n) => String(s == null ? '' : s).slice(0, n)
const GATE_KINDS = ['A', 'B', 'C', 'approval']
const GATE_STATUS = ['waiting', 'answered', 'expired']
const APPROVAL_TYPES = ['gate', 'hire', 'action', 'budget_override', 'proposal', 'generic']
const ACTION_TYPES = ['merge', 'next-phase', 'build', 'publish', 'other']

/** Creates a gate, or updates the one with this id. Each change is kept in
 *  history, so a gate shows who asked, who answered and when. */
function saveGate(input, via) {
  fs.mkdirSync(GATES, { recursive: true })
  const id = input.id ? String(input.id).replace(/[^\w.-]/g, '') : idFor('g')
  if (!id) throw new Error('bad gate id')
  // The supervisor often records "the user answered in chat" as a NEW gate
  // with status answered and no id, which left the original question waiting
  // for ever (nine stale items piled up that way). With no id, an answered or
  // expired gate closes the waiting gate it belongs to instead.
  const closing = input.status === 'answered' || input.status === 'expired'
  const open = !input.id && closing ? waitingMatch(input) : null
  // under the gate's own lock: the owner's answer (answerGate) and a
  // supervisor's edit of the same gate never interleave
  if (open) return withLock(fileFor(GATES, open.id), () => saveGateLocked(input, via, open.id, true))
  return withLock(fileFor(GATES, id), () => saveGateLocked(input, via, id, false))
}
function saveGateLocked(input, via, gateId, reusing) {
  const now = new Date().toISOString()
  let id = gateId
  let file = fileFor(GATES, id)
  let g = null
  let reused = reusing
  try { g = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { /* new gate */ }
  // answered in the meantime: the owner's answer stays, this becomes a gate of its own
  if (reused && (!g || g.status !== 'waiting')) { g = null; reused = false; id = idFor('g'); file = fileFor(GATES, id) }
  const wasWaiting = !!g && g.status === 'waiting'
  if (!g) {
    if (!input.question) throw new Error('a new gate needs "question"')
    g = { id, project: '', kind: 'C', question: '', label: '', choices: [], round: '', status: 'waiting', answer: '', by: '', run: '', askedBy: 'supervisor', askedAt: now, answeredAt: '', history: [] }
  }
  // a reused gate keeps its own question, kind and project: the input only
  // says how it ended
  const keys = reused ? ['run', 'answer', 'by'] : ['project', 'question', 'label', 'round', 'run', 'askedBy', 'answer', 'by']
  for (const k of keys) {
    if (input[k] !== undefined) g[k] = clip(input[k], k === 'question' ? 1000 : 300)
  }
  if (!reused && input.kind !== undefined) g.kind = GATE_KINDS.includes(String(input.kind)) ? String(input.kind) : (/^approv/i.test(input.kind) ? 'approval' : 'C')
  if (!reused && Array.isArray(input.choices)) g.choices = input.choices.slice(0, 8).map((c) => clip(c, 60))
  // Fields added in 1.0 (approvals for hires and actions, the asking client).
  // Only set when given, so a gate written before them keeps its exact shape;
  // an older dashboard ignores them and still shows an approval.
  if (!reused) {
    if (input.approvalType !== undefined) g.approvalType = APPROVAL_TYPES.includes(String(input.approvalType)) ? String(input.approvalType) : 'generic'
    for (const k of ['officeId', 'taskId', 'askedVia', 'clientId', 'versionRun']) if (input[k] !== undefined && input[k] !== '') g[k] = clip(String(input[k]).replace(/[^\w.:-]/g, ''), 80)
    if (input.subject && typeof input.subject === 'object') g.subject = { type: clip(input.subject.type, 20), id: clip(input.subject.id, 80) }
    if (input.action && typeof input.action === 'object') {
      const a = input.action
      const before = JSON.stringify(g.action === undefined ? null : g.action)
      g.action = { category: clip(a.category, 40), target: clip(a.target, 200), summary: clip(a.summary, 300), member: clip(String(a.member || '').replace(/[^\w.-]/g, ''), 60) }
      // spec 1.1, rule 30: what an approval lets happen. Only set when given,
      // so an older gate keeps its shape; an unknown type reads as "other",
      // which never runs by itself (automation.cjs)
      if (a.type !== undefined) g.action.type = ACTION_TYPES.includes(String(a.type)) ? String(a.type) : 'other'
      if (a.ref !== undefined) g.action.ref = clip(a.ref, 200)
      if (a.versionRun !== undefined && a.versionRun !== '') g.action.versionRun = clip(String(a.versionRun).replace(/[^\w.-]/g, ''), 60)
      if (a.gatesPassed !== undefined) g.action.gatesPassed = a.gatesPassed === true
      // what a waiting approval lets happen is fixed once asked: pointing it
      // at another merge or phase would reuse an Approve given for the first
      if (wasWaiting && JSON.stringify(g.action) !== before) { const e = new Error('the action of a waiting gate cannot be changed; ask a new question'); e.code = 409; throw e }
    }
    if (input.payload !== undefined) {
      const s = JSON.stringify(input.payload === null ? null : input.payload)
      if (s && s.length > 8192) throw new Error('payload is larger than 8 KB')
      g.payload = s ? JSON.parse(s) : null
    }
    // spec 1.4 section 8: what an agent proposes (tools/proposals.cjs cleans it before it gets here)
    if (input.proposal && typeof input.proposal === 'object') {
      const pr = input.proposal, s = JSON.stringify(pr.payload === undefined ? {} : pr.payload)
      if (s.length > 8192) throw new Error('proposal is larger than 8 KB')
      g.proposal = { kind: clip(pr.kind, 20), payload: JSON.parse(s), why: clip(pr.why, 300), evidence: clip(pr.evidence, 200), hash: clip(pr.hash, 64) }
    }
  }
  if (input.hiredAt !== undefined) g.hiredAt = clip(input.hiredAt, 40)
  if (input.appliedAt !== undefined) g.appliedAt = clip(input.appliedAt, 40)
  const status = input.status !== undefined ? String(input.status) : ''
  if (status && !GATE_STATUS.includes(status)) throw new Error('status must be ' + GATE_STATUS.join('|'))
  if (status) g.status = status
  if (status === 'answered' && !g.answeredAt) g.answeredAt = input.answeredAt || now
  if (status === 'answered' && !g.by) g.by = 'user'
  if (status === 'expired' && !g.expiredAt) g.expiredAt = now
  if (status === 'waiting') { g.answeredAt = ''; g.expiredAt = '' }
  g.updatedAt = now
  g.history = Array.isArray(g.history) ? g.history : []
  g.history.push({ at: now, status: g.status, answer: status === 'answered' ? g.answer : undefined, by: input.by || undefined, via: via || 'log' })
  if (g.history.length > 50) g.history = g.history.slice(-50)
  writeAtomic(file, JSON.stringify(g, null, 2))
  // not saved in the file; lets the command line say it closed an old gate
  if (reused) Object.defineProperty(g, 'reused', { value: true, enumerable: false })
  return g
}

/** The waiting gate that a new answered/expired record (no id) is about:
 *  same project, and the most similar question or label. With no similar
 *  wording, the project's only waiting gate. Never guesses between several. */
function waitingMatch(input) {
  const want = projectKey(input.project)
  const words = (s) => new Set(String(s || '').toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}.-]{2,}/gu) || [])
  const mine = new Set([...words(input.question), ...words(input.label)])
  const open = readJsonDir(GATES).filter((g) => g.status === 'waiting' && g.approvalType !== 'proposal' && (!want || projectKey(g.project) === want))
  let best = null, bestScore = 0
  for (const g of open) {
    const theirs = new Set([...words(g.question), ...words(g.label)])
    const common = [...mine].filter((w) => theirs.has(w)).length
    const score = common / Math.max(1, Math.min(mine.size, theirs.size))
    if (score > bestScore) { best = g; bestScore = score }
  }
  if (best && bestScore >= 0.4) return best
  return open.length === 1 && want ? open[0] : null
}

/** The user answered from the dashboard. Only a waiting gate takes an answer,
 *  so a double click or a stale page cannot overwrite a given answer. */
function answerGate(id, answer, opts) {
  const file = fileFor(GATES, id)
  // read, check and write under the gate's lock: an edit that lands between
  // the hash check and the answer would be approved blind
  if (!fs.existsSync(file)) { const e = new Error('no such gate'); e.code = 404; throw e }
  return withLock(file, () => answerGateLocked(file, answer, opts))
}
function answerGateLocked(file, answer, opts) {
  let g
  try { g = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { const e = new Error('no such gate'); e.code = 404; throw e }
  if (g.status !== 'waiting') { const e = new Error('gate is ' + g.status); e.code = 409; throw e }
  const text = String(answer || '').trim().slice(0, 500)
  if (!text) { const e = new Error('empty answer'); e.code = 400; throw e }
  // the page sends the hash of the question it showed: one changed since is
  // not answered blind (the phone buttons check the same hash)
  if (opts && opts.hash !== undefined && String(opts.hash) !== require('./notify.cjs').questionHash(g)) { const e = new Error('This question changed since it was shown; read it again'); e.code = 409; throw e }
  // the dashboard, or a phone tap that came back through a signed token
  const via = opts && /^(dashboard|phone:\w+|desktop-notification)$/.test(String(opts.via || '')) ? String(opts.via) : 'dashboard'
  // an Approve for a merge or a next phase must say which question it saw;
  // a phone tap checked the hash in its signed token (notify.accept)
  const type = g.action && typeof g.action === 'object' ? String(g.action.type || '') : ''
  if ((type === 'merge' || type === 'next-phase') && /^(approve|approved|yes)$/i.test(text) && !(opts && opts.hash !== undefined) && !/^phone:/.test(via)) {
    const e = new Error('This approval needs the question it was given for; reload the page and approve again'); e.code = 409; throw e
  }
  const extra = opts && opts.hiredAt ? { hiredAt: opts.hiredAt } : {}
  // decided from the stored gate and the owner's setting only: an autoRun in
  // the request is never read (spec 1.1, rule 31)
  let autoRun = false
  try { autoRun = require('./automation.cjs').grant(g, text) } catch { /* unreadable setting: off */ }
  const saved = saveGate(Object.assign({ id: g.id, status: 'answered', answer: text, by: 'user' }, extra), via)
  // answers.jsonl is what the supervisor session reads to pick the answer up
  // (`log-agent-run.cjs --answers`). `kind` is the gate's kind, so what the
  // line means is in `type`; lines from before `type` existed are answers.
  fs.appendFileSync(ANSWERS, JSON.stringify(Object.assign({
    at: saved.answeredAt, type: 'answer', gate: saved.id, project: saved.project, kind: saved.kind, run: saved.run,
    question: saved.question, answer: text, by: 'user', via,
  }, saved.clientId ? { clientId: saved.clientId } : {}, saved.versionRun ? { versionRun: saved.versionRun } : {},
  saved.action && saved.action.type ? { action: { type: saved.action.type, ref: saved.action.ref || '', versionRun: saved.action.versionRun || '' } } : {},
  autoRun ? { autoRun: true } : {})) + '\n')
  // in the reply only (the page says "runs by itself"); the gate file is written already
  if (autoRun) saved.autoRun = true
  return saved
}

/** The user closes a waiting gate without answering it (settled in chat, or no
 *  longer relevant). The gate becomes "expired" and the supervisor is told. */
function dismissGate(id) {
  const file = fileFor(GATES, id)
  if (!fs.existsSync(file)) { const e = new Error('no such gate'); e.code = 404; throw e }
  return withLock(file, () => dismissGateLocked(file))
}
function dismissGateLocked(file) {
  let g
  try { g = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { const e = new Error('no such gate'); e.code = 404; throw e }
  if (g.status !== 'waiting') { const e = new Error('gate is ' + g.status); e.code = 409; throw e }
  const saved = saveGate({ id: g.id, status: 'expired', by: 'user' }, 'dashboard')
  fs.appendFileSync(ANSWERS, JSON.stringify(Object.assign({
    at: saved.expiredAt, type: 'dismiss', gate: saved.id, project: saved.project, kind: saved.kind, run: saved.run,
    question: saved.question, answer: '', by: 'user', via: 'dashboard',
  }, saved.clientId ? { clientId: saved.clientId } : {})) + '\n')
  return saved
}

// ---------- what the supervisor has already read from answers.jsonl
// A pointer file next to it: how many lines were read and the time of the
// newest one. Nothing is ever removed from answers.jsonl itself.
const { ANSWERS_READ } = P

function readAnswers() {
  let text = ''
  try { text = fs.readFileSync(ANSWERS, 'utf8') } catch { return [] }
  return text.split('\n').filter((l) => l.trim()).map((l) => { try { return JSON.parse(l) } catch { return null } })
}

function answersRead() {
  try {
    const s = JSON.parse(fs.readFileSync(ANSWERS_READ, 'utf8'))
    return { lines: Number(s.lines) || 0, through: String(s.through || ''), markedAt: String(s.markedAt || '') }
  } catch { return { lines: 0, through: '', markedAt: '' } }
}

/** The answers not read yet, oldest first. `mark` records them as read. */
function unreadAnswers(mark) {
  const all = readAnswers()
  const seen = answersRead()
  const fresh = all.slice(seen.lines).filter(Boolean)
  if (mark && all.length > seen.lines) {
    const last = all.filter(Boolean).slice(-1)[0]
    writeAtomic(ANSWERS_READ, JSON.stringify({ lines: all.length, through: last ? last.at : seen.through, markedAt: new Date().toISOString() }, null, 2))
  }
  return { fresh, total: all.length }
}

/** Creates a decision, or updates the one with this id (for example an open
 *  question the supervisor later closes). */
function saveDecision(input) {
  const now = new Date().toISOString()
  fs.mkdirSync(DECISIONS, { recursive: true })
  const id = input.id ? String(input.id).replace(/[^\w.-]/g, '') : idFor('d')
  const file = fileFor(DECISIONS, id)
  let d = null
  try { d = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { /* new decision */ }
  if (!d) {
    if (!input.text) throw new Error('a new decision needs "text"')
    d = { id, project: '', by: 'supervisor', text: '', reason: '', run: '', state: 'taken', closes: '', at: input.at || now }
  }
  // a decision of an autonomous run may name its run as versionRun, like a gate does
  if (input.run === undefined && input.versionRun !== undefined) input = Object.assign({}, input, { run: input.versionRun })
  for (const k of ['project', 'text', 'reason', 'run', 'closes']) if (input[k] !== undefined) d[k] = clip(input[k], k === 'text' || k === 'reason' ? 1000 : 300)
  if (input.by !== undefined) d.by = ['user', 'supervisor', 'agent'].includes(String(input.by)) ? String(input.by) : 'agent'
  if (input.agent !== undefined) d.agent = clip(input.agent, 60)
  if (input.state !== undefined) d.state = String(input.state) === 'open' ? 'open' : 'taken'
  // plan decisions (spec 1.4 3.3): additive fields
  if (input.options !== undefined) d.options = Array.isArray(input.options) ? input.options.slice(0, 8).map((o) => clip(o, 60)).filter(Boolean) : []
  for (const k of ['recommendation', 'answer']) if (input[k] !== undefined) d[k] = clip(input[k], 300)
  for (const k of ['planId', 'source', 'targetVersion']) if (input[k] !== undefined) d[k] = clip(input[k], k === 'source' ? 120 : 60)
  if (input.missingInImport !== undefined) { if (input.missingInImport) d.missingInImport = true; else delete d.missingInImport }
  d.updatedAt = now
  writeAtomic(file, JSON.stringify(d, null, 2))
  return d
}

/** config.json "desks", cleaned: only [zone, slot] pairs of plain names. */
function pinnedDesks(raw) {
  const out = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [name, d] of Object.entries(raw).slice(0, 200)) {
    if (/^[\w.-]{1,80}$/.test(name) && Array.isArray(d) && typeof d[0] === 'string' && Number.isInteger(d[1])) out[name] = [d[0].slice(0, 20), d[1]]
  }
  return out
}

/** Everything the page shows, read fresh from disk. */
function collect() {
  const { questionHash } = require('./notify.cjs')
  const prices = readPrices()
  const seen = answersRead()
  const runs = readJsonDir(RUNS)
  // finishRun writes the final record before it removes the active file: a
  // run in both places is finished
  const done = new Set(runs.map((r) => r && r.id).filter(Boolean))
  // the page cannot test a process: the run monitor's verdict (watch.health,
  // the same one api/live shows) travels with each active run
  let verdict = () => null
  try { verdict = require('./watch.cjs').health() } catch { /* the page falls back to the quiet hint */ }
  const active = readJsonDir(ACTIVE).filter((a) => !(a && a.id && done.has(a.id))).map((a) => {
    // a running agent's counts are read from its transcript as it grows
    const t = a.transcript && a.transcript.found ? a.transcript : transcriptFor(a.id, a.startedAt, a.transcriptPath, 10000)
    let monitor = null
    try { monitor = verdict(a) } catch { /* a record the monitor cannot read */ }
    return describe(Object.assign({}, a, { transcript: t, monitor }), prices)
  })
  const state = {
    runs: runs.map((r) => describe(r, prices)).sort((a, b) => String(b.finishedAt).localeCompare(String(a.finishedAt))),
    active: active.sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt))),
    agents: readAgents(),
    // proposals (spec 1.4 section 8) wait in their own tray: they block no one, so they are neither
    // counted as waiting for the owner nor handed to an agent's context pack
    gates: readJsonDir(GATES).filter((g) => !(g && g.approvalType === 'proposal')).map((g) => Object.assign(g, {
      projectKey: projectKey(g.project),
      // what a page sends back with an answer (answerGate): the gate it showed
      qhash: questionHash(g),
      // answered or dismissed on the dashboard, and the supervisor has read it
      // (log-agent-run --answers) since: shown as "read" next to the answer
      seen: (g.history || []).some((x) => x.via === 'dashboard') && !!seen.through && String(g.answeredAt || g.expiredAt || '') <= seen.through,
    })).sort((a, b) => String(a.askedAt).localeCompare(String(b.askedAt))),
    proposals: readJsonDir(GATES).filter((g) => g && g.approvalType === 'proposal').map((g) => Object.assign(g, { projectKey: projectKey(g.project) })).sort((a, b) => String(b.askedAt).localeCompare(String(a.askedAt))),
    answers: { unread: unreadAnswers(false).fresh.length, through: seen.through },
    decisions: readJsonDir(DECISIONS).map((d) => Object.assign(d, { projectKey: projectKey(d.project) })).sort((a, b) => String(a.at).localeCompare(String(b.at))),
    prices: { file: 'model-prices.json', set: pricesSet(prices), source: ((readPricesFile() || {}).source) || null },
    heavy: Array.isArray(P.CONFIG.heavyModels) ? P.CONFIG.heavyModels.map(String).slice(0, 20) : ['Opus'],
    // config.json "desks": {name: [zone, slot]}, desks kept where an earlier layout had them (homeDesks)
    desks: pinnedDesks(P.CONFIG.desks),
    builtAt: new Date().toISOString(),
  }
  // which office and project each of today's runs and each gate belongs to,
  // when a company is set up (agent-company.cjs); worked out here, never saved
  try { require('./agent-company.cjs').annotate(state) } catch (e) { console.warn('company not read: ' + e.message) }
  return state
}

/** The company as the page shows it, or "none" when it cannot be read. */
function companyOf(state) {
  try { return require('./agent-company.cjs').companyState(state) } catch (e) { return { configured: false, error: e.message } }
}

// ---------- the state, kept while nothing it is made of changed
// A page polls every 1.5 s. Reading and parsing every run file on each poll
// cost about 0.4 s of CPU with a few hundred runs, and sent the whole state
// each time. Instead the server keeps the last state with an ETag and a gzip
// copy, and only rebuilds it when the signature below changes: the folders'
// own times and entry counts (a new run, gate or decision is a new file or a
// rename, which changes its folder), plus the files that are written in place
// (active runs, answers.jsonl, company files, agent definitions, prices) and
// the transcripts of running agents. A minute is the most a missed change can
// stay unseen (a run file edited by hand in place, a coarse file system).
const MAX_AGE_MS = 60000
let snap = null

function statSig(f) {
  try { const s = fs.statSync(f); return s.mtimeMs + ':' + s.size } catch { return '-' }
}
function dirSig(dir, perFile) {
  let names
  try { names = fs.readdirSync(dir) } catch { return '-' }
  const own = statSig(dir) + '#' + names.length
  return perFile ? own + '[' + names.map((n) => n + '=' + statSig(path.join(dir, n))).join(',') + ']' : own
}
function signature(transcripts) {
  const d = new Date()
  return [
    d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(),
    dirSig(RUNS), dirSig(ACTIVE, true), dirSig(GATES), dirSig(DECISIONS),
    statSig(ANSWERS), statSig(ANSWERS_READ), dirSig(P.COMPANY, true),
    statSig(P.PRICES), ...P.AGENT_DIRS.map((a) => dirSig(a, true)),
    ...(transcripts || []).map(statSig),
  ].join('|')
}

/** The current state, its JSON, ETag and (on demand) gzip body. */
function snapshot() {
  const sig = signature(snap && snap.transcripts)
  if (snap && snap.sig === sig && Date.now() - snap.at < MAX_AGE_MS) return snap
  const state = collect()
  const json = JSON.stringify(state)
  let gz = null, company = null
  snap = {
    sig: signature(state.active.map((a) => a.transcript && a.transcript.found && a.transcript.path).filter(Boolean)),
    at: Date.now(), state, json,
    etag: '"' + crypto.createHash('sha1').update(json).digest('hex').slice(0, 20) + '"',
    transcripts: state.active.map((a) => a.transcript && a.transcript.found && a.transcript.path).filter(Boolean),
    gzip() { return gz || (gz = require('zlib').gzipSync(json)) },
    company() { return company || (company = companyOf(state)) },
  }
  return snap
}
/** A write made by the server itself: the next read builds a new state. */
function invalidate() { snap = null }
/** The page the dashboard opens on: the campus when a company is set up,
 *  else today's office. */
const renderPage = (state, opts) => renderOffice(state, Object.assign({}, opts || {}, { company: (opts && opts.company) || companyOf(state) }))

function build() {
  const state = collect()
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, renderPage(state))
  fs.writeFileSync(OUT_ARCHIVE, renderArchive(state))
  return { runs: state.runs.length, active: state.active.length, agents: state.agents.length }
}

module.exports = {
  build, collect, snapshot, invalidate, companyOf, renderPage, renderArchive, projectKey, modelKey, OUT, OUT_ARCHIVE,
  readPrices, readPricesFile, validPrice, priceOf, langFromRequest, saveGate, answerGate, dismissGate, unreadAnswers, readAnswers, saveDecision, transcriptFor, readTranscript, describe, writeAtomic, ANSWERS,
}

if (require.main === module) {
  const n = build()
  console.log(path.relative(process.cwd(), OUT)
    + ' — ' + n.runs + ' runs done, ' + n.active + ' running, ' + n.agents + ' agents')
}
