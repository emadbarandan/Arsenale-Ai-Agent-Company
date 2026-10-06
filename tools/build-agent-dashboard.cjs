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
const { t, langSwitch, langScript, langFromRequest } = require('./dashboard-strings.cjs')

/** Other agents log while the server reads, so a file is never seen half
 *  written: write a temp file next to it, then rename over. */
function writeAtomic(file, text) {
  const tmp = file + '.' + process.pid + '-' + Math.random().toString(36).slice(2, 8) + '.tmp'
  fs.writeFileSync(tmp, text)
  fs.renameSync(tmp, file)
}

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
  // The page shows each agent's own English frontmatter description in
  // English mode. labels.fa.json (optional, in any agent folder: a Persian
  // title and one-line "what" per agent) supplies the card text in Persian
  // mode, and `dept` (which desk an agent takes) in both. A `zone:` line in
  // the frontmatter places the desk too, and wins.
  const labels = {}
  for (const dir of P.AGENT_DIRS.slice().reverse()) {
    try {
      const j = JSON.parse(P.stripBom(fs.readFileSync(path.join(dir, 'labels.fa.json'), 'utf8')))
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
    const fa = Object.hasOwn(labels, agentName) ? labels[agentName] : {}
    const descriptionEn = field('description')
    out.push({
      name: agentName,
      title: '',
      description: descriptionEn,
      descriptionEn,
      titleFa: fa.title || '',
      descriptionFa: fa.what || descriptionEn,
      hasFa: !!fa.what,
      persian: false,
      model: field('model'),
      effort: field('effort'),
      tools: field('tools'),
      color: field('color'),
      dept: field('zone') || fa.dept || '', // optional: which department's desk the agent takes
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
  return s.replace(/\s*\(.*\)\s*$/, '') || s
}

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
  return ver ? name + ' ' + ver[1] + '.' + ver[2] : name
}

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
    const t = models[mk] || (models[mk] = { input: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 })
    for (const k of Object.keys(tokens)) { tokens[k] += u[k]; t[k] += u[k] }
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
function readPrices() {
  for (const f of [P.PRICES, P.PRICES_TEMPLATE]) {
    try {
      const j = JSON.parse(P.stripBom(fs.readFileSync(f, 'utf8')))
      return j && typeof j.models === 'object' && j.models ? j.models : {}
    } catch { /* not there or not readable: try the next */ }
  }
  return {}
}
const PRICE_FIELDS = ['input', 'output', 'cacheRead', 'cacheWrite5m', 'cacheWrite1h']
const pricesSet = (prices) => Object.values(prices).some((p) => p && PRICE_FIELDS.every((k) => typeof p[k] === 'number'))

/** USD for a transcript's tokens, or null with the reason. A price is only
 *  used when the user has typed it into model-prices.json. */
function costOf(t, prices) {
  if (!t || !t.found || !t.models) return { usd: null, why: 'nodata' }
  let usd = 0
  for (const [mk, tok] of Object.entries(t.models)) {
    // own keys only: a model named "constructor" must not find Object's
    const p = (Object.hasOwn(prices, mk) && prices[mk]) || (Object.hasOwn(prices, mk.split(' ')[0]) && prices[mk.split(' ')[0]])
    if (!p) return { usd: null, why: 'prices' }
    for (const k of PRICE_FIELDS) {
      if (!tok[k]) continue
      if (typeof p[k] !== 'number') return { usd: null, why: 'prices' }
      usd += tok[k] * p[k] / 1e6
    }
  }
  return { usd, why: '' }
}

/** The derived fields the pages use; the record on disk stays as it is. */
function describe(r, prices) {
  const took = Date.parse(r.finishedAt) - Date.parse(r.startedAt)
  const u = r.usage && typeof r.usage === 'object' ? r.usage : {}
  const t = r.transcript && typeof r.transcript === 'object' ? r.transcript : null
  const cost = costOf(t, prices || {})
  return Object.assign(r, {
    projectKey: projectKey(r.project),
    modelKey: modelKey(r.model || u.model),
    durMs: Number(r.durationMs) || Number(u.durationMs) || (took > 0 ? took : 0),
    parentId: String(r.parent || parentFromTask(r.task)),
    // The Agent tool's totalTokens is the size of the agent's last context,
    // not a sum over the run, so the transcript's count wins when there is one.
    tokTotal: t && t.found ? t.tokensNew : (Number(r.tokens) || Number(u.tokens) || 0),
    tokSrc: t && t.found ? 'transcript' : (Number(r.tokens) || Number(u.tokens) ? 'reported' : ''),
    toolTotal: Number(u.toolUses) || (t && t.found ? t.toolUses : 0),
    costUsd: cost.usd,
    costWhy: cost.why,
  })
}

// ---------- gates and decisions
const idFor = (prefix) => prefix + '-' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + Math.random().toString(36).slice(2, 6)
const fileFor = (dir, id) => path.join(dir, String(id).replace(/[^\w.-]/g, '') + '.json')
const clip = (s, n) => String(s == null ? '' : s).slice(0, n)
const GATE_KINDS = ['A', 'B', 'C', 'approval']
const GATE_STATUS = ['waiting', 'answered', 'expired']
const APPROVAL_TYPES = ['gate', 'hire', 'action', 'budget_override', 'generic']

/** Creates a gate, or updates the one with this id. Each change is kept in
 *  history, so a gate shows who asked, who answered and when. */
function saveGate(input, via) {
  const now = new Date().toISOString()
  fs.mkdirSync(GATES, { recursive: true })
  let id = input.id ? String(input.id).replace(/[^\w.-]/g, '') : idFor('g')
  if (!id) throw new Error('bad gate id')
  let file = fileFor(GATES, id)
  let g = null
  let reused = false
  try { g = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { /* new gate */ }
  // The supervisor often records "the user answered in chat" as a NEW gate
  // with status answered and no id, which left the original question waiting
  // for ever (nine stale items piled up that way). With no id, an answered or
  // expired gate closes the waiting gate it belongs to instead.
  const closing = input.status === 'answered' || input.status === 'expired'
  if (!g && !input.id && closing) {
    const open = waitingMatch(input)
    if (open) { g = open; id = open.id; file = fileFor(GATES, id); reused = true }
  }
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
    for (const k of ['officeId', 'taskId', 'askedVia', 'clientId']) if (input[k] !== undefined && input[k] !== '') g[k] = clip(String(input[k]).replace(/[^\w.:-]/g, ''), 80)
    if (input.subject && typeof input.subject === 'object') g.subject = { type: clip(input.subject.type, 20), id: clip(input.subject.id, 80) }
    if (input.action && typeof input.action === 'object') g.action = { category: clip(input.action.category, 40), target: clip(input.action.target, 200), summary: clip(input.action.summary, 300), member: clip(String(input.action.member || '').replace(/[^\w.-]/g, ''), 60) }
    if (input.payload !== undefined) {
      const s = JSON.stringify(input.payload === null ? null : input.payload)
      if (s && s.length > 8192) throw new Error('payload is larger than 8 KB')
      g.payload = s ? JSON.parse(s) : null
    }
  }
  if (input.hiredAt !== undefined) g.hiredAt = clip(input.hiredAt, 40)
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
  const open = readJsonDir(GATES).filter((g) => g.status === 'waiting' && (!want || projectKey(g.project) === want))
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
  let g
  try { g = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { const e = new Error('no such gate'); e.code = 404; throw e }
  if (g.status !== 'waiting') { const e = new Error('gate is ' + g.status); e.code = 409; throw e }
  const text = String(answer || '').trim().slice(0, 500)
  if (!text) { const e = new Error('empty answer'); e.code = 400; throw e }
  // the dashboard, or a phone tap that came back through a signed token
  const via = opts && /^(dashboard|phone:\w+|desktop-notification)$/.test(String(opts.via || '')) ? String(opts.via) : 'dashboard'
  const extra = opts && opts.hiredAt ? { hiredAt: opts.hiredAt } : {}
  const saved = saveGate(Object.assign({ id: g.id, status: 'answered', answer: text, by: 'user' }, extra), via)
  // answers.jsonl is what the supervisor session reads to pick the answer up
  // (`log-agent-run.cjs --answers`). `kind` is the gate's kind, so what the
  // line means is in `type`; lines from before `type` existed are answers.
  fs.appendFileSync(ANSWERS, JSON.stringify(Object.assign({
    at: saved.answeredAt, type: 'answer', gate: saved.id, project: saved.project, kind: saved.kind, run: saved.run,
    question: saved.question, answer: text, by: 'user', via,
  }, saved.clientId ? { clientId: saved.clientId } : {})) + '\n')
  return saved
}

/** The user closes a waiting gate without answering it (settled in chat, or no
 *  longer relevant). The gate becomes "expired" and the supervisor is told. */
function dismissGate(id) {
  const file = fileFor(GATES, id)
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
  for (const k of ['project', 'text', 'reason', 'run', 'closes']) if (input[k] !== undefined) d[k] = clip(input[k], k === 'text' || k === 'reason' ? 1000 : 300)
  if (input.by !== undefined) d.by = ['user', 'supervisor', 'agent'].includes(String(input.by)) ? String(input.by) : 'agent'
  if (input.agent !== undefined) d.agent = clip(input.agent, 60)
  if (input.state !== undefined) d.state = String(input.state) === 'open' ? 'open' : 'taken'
  d.updatedAt = now
  writeAtomic(file, JSON.stringify(d, null, 2))
  return d
}

/** Everything the page shows, read fresh from disk. */
function collect() {
  const prices = readPrices()
  const seen = answersRead()
  const active = readJsonDir(ACTIVE).map((a) => {
    // a running agent's counts are read from its transcript as it grows
    const t = a.transcript && a.transcript.found ? a.transcript : transcriptFor(a.id, a.startedAt, a.transcriptPath, 10000)
    return describe(Object.assign({}, a, { transcript: t }), prices)
  })
  const state = {
    runs: readJsonDir(RUNS).map((r) => describe(r, prices)).sort((a, b) => String(b.finishedAt).localeCompare(String(a.finishedAt))),
    active: active.sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt))),
    agents: readAgents(),
    gates: readJsonDir(GATES).map((g) => Object.assign(g, {
      projectKey: projectKey(g.project),
      // answered or dismissed on the dashboard, and the supervisor has read it
      // (log-agent-run --answers) since: shown as "read" next to the answer
      seen: (g.history || []).some((x) => x.via === 'dashboard') && !!seen.through && String(g.answeredAt || g.expiredAt || '') <= seen.through,
    })).sort((a, b) => String(a.askedAt).localeCompare(String(b.askedAt))),
    answers: { unread: unreadAnswers(false).fresh.length, through: seen.through },
    decisions: readJsonDir(DECISIONS).map((d) => Object.assign(d, { projectKey: projectKey(d.project) })).sort((a, b) => String(a.at).localeCompare(String(b.at))),
    prices: { file: 'model-prices.json', set: pricesSet(prices) },
    heavy: Array.isArray(P.CONFIG.heavyModels) ? P.CONFIG.heavyModels.map(String).slice(0, 20) : ['Opus'],
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

const STYLE = `
  :root {
    --mono: "Cascadia Code", "JetBrains Mono", "Fira Code", Consolas, monospace;
    --ink: #C6D0DA; --ink-soft: #A6B1BD; --ink-dim: #8A97A6;
    --ground: #0A0F14; --panel: #10161D; --panel-raised: #141B23; --line: #1E2A36;
    --accent: #3BE8B0; --accent-soft: rgba(59, 232, 176, 0.1); --accent-line: rgba(59, 232, 176, 0.3);
    --cyan: #56B6C2; --cyan-soft: rgba(86, 182, 194, 0.1);
    --ok: #3BE8B0; --ok-bg: rgba(59, 232, 176, 0.1); --warn: #E5A33D; --warn-bg: rgba(229, 163, 61, 0.12);
    --bad: #FF5F5F; --bad-bg: rgba(255, 95, 95, 0.12); --idle: #8A97A6; --idle-bg: rgba(138, 151, 166, 0.12);
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--ground); color: var(--ink);
    font: 14.5px/1.85 var(--mono), Tahoma, sans-serif;
    padding: 28px 20px 60px;
    position: relative;
  }
  /* one restrained ambient touch: a faint scanline field, gone when motion is reduced */
  body::before {
    content: ""; position: fixed; inset: 0; pointer-events: none; z-index: 0;
    background: repeating-linear-gradient(to bottom, rgba(255,255,255,0.018) 0px, rgba(255,255,255,0.018) 1px, transparent 1px, transparent 3px),
      radial-gradient(ellipse at 50% 0%, rgba(59,232,176,0.05), transparent 60%);
  }
  @media (prefers-reduced-motion: reduce) { body::before { display: none; } }
  .wrap { max-width: 1060px; margin: 0 auto; position: relative; z-index: 1; }

  /* header, styled as a shell prompt */
  .shell-prompt {
    direction: ltr; text-align: left; color: var(--ink-dim); font-size: 0.82rem;
    margin-bottom: 6px; white-space: nowrap; overflow-x: auto;
  }
  .shell-prompt .u { color: var(--accent); }
  .shell-prompt .p { color: var(--cyan); }
  .shell-prompt .d { color: var(--ink-dim); }
  .shell-prompt .cmd { color: var(--ink); }
  header { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; margin-bottom: 2px; }
  h1 { font-size: 1.4rem; margin: 0; font-weight: 650; letter-spacing: -0.01em; }
  h1 .cursor { color: var(--accent); animation: blink 1.1s step-end infinite; margin-right: 2px; }
  @media (prefers-reduced-motion: reduce) { h1 .cursor { animation: none; } }
  h2 {
    font-size: 0.78rem; font-weight: 700; color: var(--accent); text-transform: uppercase;
    margin: 30px 0 10px; letter-spacing: 0.06em;
  }
  h2::before { content: "# "; color: var(--ink-dim); }
  .built { color: var(--ink-dim); font-size: 0.78rem; margin-inline-start: auto; direction: ltr; }
  .lede { color: var(--ink-dim); margin: 0; font-size: 0.86rem; }

  /* status strip */
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-top: 18px; }
  .tile {
    background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: 12px 16px;
  }
  .tile-key {
    display: block; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.05em;
    color: var(--accent); direction: ltr; text-align: left; margin-bottom: 6px;
  }
  .tile b { display: block; font-size: 1.65rem; font-weight: 650; line-height: 1.4; direction: ltr; text-align: left; }
  .tile-label { color: var(--ink-dim); font-size: 0.78rem; }
  .tile.alert b { color: var(--bad); }
  .tile.alert .tile-key { color: var(--bad); }
  .tile.live b { color: var(--accent); }

  /* usage/statistics — bar lists and a small sparkline, same terminal look */
  .stat-block { margin-bottom: 16px; }
  .stat-block h3 {
    font-size: 0.78rem; font-weight: 700; color: var(--ink-soft); margin: 0 0 8px;
    letter-spacing: 0.02em;
  }
  .bar-list { display: flex; flex-direction: column; gap: 7px; }
  .bar-row { display: flex; align-items: center; gap: 10px; }
  .bar-label { width: 150px; flex: none; font-size: 0.82rem; color: var(--ink-soft); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; direction: ltr; text-align: left; }
  .bar-track { flex: 1; height: 8px; border-radius: 4px; background: var(--panel-raised); border: 1px solid var(--line); overflow: hidden; min-width: 40px; }
  .bar-fill { display: block; height: 100%; background: var(--accent); opacity: 0.75; border-radius: 4px; }
  .bar-value { flex: none; font-size: 0.8rem; color: var(--ink); direction: ltr; text-align: left; white-space: nowrap; }
  .bar-sub { color: var(--ink-dim); font-size: 0.76rem; }

  .spark { display: flex; align-items: flex-end; gap: 10px; height: 130px; padding-top: 6px; }
  .spark-col { display: flex; flex-direction: column; align-items: center; gap: 4px; flex: 1; height: 100%; justify-content: flex-end; }
  .spark-val { font-size: 0.7rem; color: var(--ink-dim); direction: ltr; }
  .spark-bar { width: 100%; max-width: 34px; background: var(--accent); opacity: 0.75; border-radius: 3px 3px 0 0; min-height: 2px; }
  .spark-day { font-size: 0.72rem; color: var(--ink-dim); direction: ltr; }

  /* pager for the completed-runs list */
  .pager { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
  .pager button {
    font: inherit; font-size: 0.82rem; padding: 5px 10px; border-radius: 5px;
    border: 1px solid var(--line); background: var(--panel); color: var(--ink-soft); cursor: pointer;
  }
  .pager button:hover:not(:disabled) { background: var(--panel-raised); color: var(--ink); }
  .pager button.current { background: var(--accent-soft); color: var(--accent); border-color: var(--accent-line); font-weight: 650; }
  .pager button:disabled { opacity: 0.4; cursor: default; }
  .pager-total { color: var(--ink-dim); font-size: 0.78rem; margin-right: 4px; }

  /* running now — one terminal window per agent, side by side when several are working */
  .live-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 12px; }
  .live-card {
    background: var(--panel); border: 1px solid var(--line); border-radius: 8px;
    overflow: hidden; display: flex; flex-direction: column;
  }
  .win-bar {
    display: flex; align-items: center; gap: 9px; flex-wrap: wrap;
    background: var(--panel-raised); border-bottom: 1px solid var(--line); padding: 8px 12px;
  }
  .win-dots { display: inline-flex; gap: 5px; flex: none; }
  .win-dots i { width: 8px; height: 8px; border-radius: 50%; display: inline-block; background: var(--line); }
  .win-dots i:nth-child(1) { background: #FF5F5F; opacity: 0.7; }
  .win-dots i:nth-child(2) { background: #E5A33D; opacity: 0.7; }
  .win-dots i:nth-child(3) { background: #3BE8B0; opacity: 0.7; }

  /* the log, read like a terminal */
  .term {
    background: var(--ground); padding: 9px 11px;
    max-height: 210px; overflow-y: auto;
    font-family: var(--mono);
    font-size: 0.76rem; line-height: 1.8;
  }
  .term-line { display: flex; gap: 8px; align-items: baseline; }
  .term-prompt { color: var(--accent); opacity: 0.6; direction: ltr; flex: none; }
  .term-at { color: var(--ink-dim); direction: ltr; flex: none; font-size: 0.72rem; }
  .term-text { color: var(--ink-soft); min-width: 0; }
  .term-line.now .term-text { color: var(--ink); }
  .term-line.now .term-text::after {
    content: "▌"; margin-right: 2px; color: var(--accent); animation: blink 1.1s step-end infinite;
  }
  @keyframes blink { 50% { opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .term-line.now .term-text::after { animation: none; } }
  .term-empty { color: var(--ink-dim); }
  .dot {
    width: 8px; height: 8px; border-radius: 50%; background: var(--accent); flex: none;
    animation: pulse 1.6s ease-in-out infinite;
  }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
  @media (prefers-reduced-motion: reduce) { .dot { animation: none; } }
  .live-task { font-weight: 600; flex: 1; min-width: 0; }
  .live-doing { color: var(--ink-dim); font-size: 0.85rem; margin-top: 4px; }
  .elapsed { color: var(--accent); font-size: 0.8rem; font-weight: 650; direction: ltr; }
  .live-card .kv { padding: 9px 12px 11px; margin: 0 !important; border-top: 1px solid var(--line); }

  .chip {
    font-size: 0.74rem; font-weight: 650; padding: 3px 9px; border-radius: 4px;
    border: 1px solid transparent; white-space: nowrap; font-family: var(--mono);
  }
  .agent-chip { background: var(--cyan-soft); color: var(--cyan); border-color: rgba(86,182,194,0.3); direction: ltr; }
  .langsw { display: flex; border: 1px solid var(--line); border-radius: 4px; overflow: hidden; margin-inline-start: auto; }
  .langsw button { font: 0.74rem var(--mono); color: var(--ink-dim); background: var(--panel); border: 0; padding: 3px 9px; cursor: pointer; }
  .langsw button + button { border-inline-start: 1px solid var(--line); }
  .langsw button[aria-pressed="true"] { color: var(--ink); background: var(--panel-raised); }
  .live-chip { background: transparent; color: var(--cyan); border: 0; padding: 0; direction: ltr; }
  .status-ok { background: var(--ok-bg); color: var(--ok); border-color: rgba(59,232,176,0.3); }
  .status-findings { background: var(--warn-bg); color: var(--warn); border-color: rgba(229,163,61,0.35); }
  .status-failed { background: var(--bad-bg); color: var(--bad); border-color: rgba(255,95,95,0.35); }
  .status-stopped { background: var(--idle-bg); color: var(--idle); border-color: var(--line); }

  .controls { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; }
  .controls input, .controls select {
    font: inherit; font-size: 0.88rem; padding: 7px 12px; border: 1px solid var(--line);
    border-radius: 5px; background: var(--panel); color: var(--ink); min-width: 0;
  }
  .controls input { flex: 1; min-width: 170px; }
  .controls input::placeholder { color: var(--ink-dim); }
  .controls input:focus, .controls select:focus { outline: 1px solid var(--accent); outline-offset: 1px; }

  .runs { display: flex; flex-direction: column; gap: 6px; }
  .run { background: var(--panel); border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
  .run-head {
    display: flex; align-items: center; gap: 10px; padding: 9px 14px; width: 100%;
    border: 0; background: none; font: inherit; color: inherit; text-align:start; cursor: pointer;
  }
  .run-head:hover { background: var(--panel-raised); }
  .run-head:focus-visible { outline: 1px solid var(--accent); outline-offset: -2px; }
  .run-agent { color: var(--cyan); font-size: 0.84rem; direction: ltr; flex: none; }
  .run-task { flex: 1; min-width: 0; font-weight: 500; }
  .run-meta { color: var(--ink-dim); font-size: 0.76rem; white-space: nowrap; direction: ltr; }
  .caret { color: var(--ink-dim); transition: transform 0.15s; }
  .run.open .caret { transform: rotate(-90deg); }
  .run-body { padding: 12px 14px 14px; border-top: 1px solid var(--line); }
  .run-body p { margin: 0 0 10px; color: var(--ink-soft); white-space: pre-wrap; }
  .kv { display: flex; gap: 12px; flex-wrap: wrap; font-size: 0.79rem; color: var(--ink-dim); margin-bottom: 10px; }
  .kv b { color: var(--ink-soft); font-weight: 600; }
  ul.findings { margin: 0 0 10px; padding-inline-start: 0; list-style: none; }
  ul.findings li { margin-bottom: 5px; color: var(--ink-soft); }
  ul.findings .mark { color: var(--warn); opacity: 0.8; margin-left: 7px; direction: ltr; display: inline-block; }
  .files { display: flex; flex-wrap: wrap; gap: 5px; }
  .file {
    font-size: 0.75rem; padding: 2px 8px; border-radius: 4px; direction: ltr;
    background: var(--panel-raised); border: 1px solid var(--line); color: var(--cyan);
    font-family: var(--mono);
  }

  /* the agents themselves — a small roster, man-page style */
  .agents { display: grid; grid-template-columns: repeat(auto-fit, minmax(270px, 1fr)); gap: 10px; }
  .agent { background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: 13px 15px; }
  .agent-top { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
  .agent-name { font-weight: 650; direction: ltr; font-family: var(--mono); font-size: 0.88rem; color: var(--accent); }
  .agent-flags {
    font-size: 0.74rem; color: var(--ink-dim); direction: ltr; text-align: left;
    font-family: var(--mono); margin-bottom: 8px;
  }
  .agent-title { font-weight: 600; font-size: 0.88rem; margin-bottom: 4px; color: var(--ink); }
  .agent-desc { color: var(--ink-soft); font-size: 0.82rem; direction: ltr; text-align: left; }
  .agent-desc.fa { direction:rtl; text-align:right; }

  .empty { background: var(--panel); border: 1px dashed var(--line); border-radius: 8px; padding: 30px; text-align: center; color: var(--ink-dim); }
  .empty code { background: var(--panel-raised); padding: 2px 6px; border-radius: 4px; direction: ltr; display: inline-block; color: var(--cyan); }
  .note { color: var(--ink-dim); font-size: 0.79rem; margin: 8px 2px 0; }

  /* live-mode badge next to the title */
  .mode { display: inline-flex; align-items: center; gap: 6px; font-size: 0.76rem; color: var(--accent); direction: ltr; animation: pulse 1.6s ease-in-out infinite; }
  .mode.stale { color: var(--bad); animation: none; }
  @media (prefers-reduced-motion: reduce) { .mode { animation: none; } }
  @media (max-width: 560px) { .run-meta { display: none; } }
`

const SCRIPT = `
const STATUS = {
  ok: T('No issues'), findings: T('Has findings'), failed: T('Failed'), stopped: T('Stopped'),
};
// the bracketed terminal-style code shown on each status chip; STATUS above still
// feeds the status filter dropdown.
const STATUS_CODE = { ok: T('OK'), findings: T('FINDINGS'), failed: T('FAILED'), stopped: T('STOPPED') };
const el = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const when = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString(LANG === 'fa' ? 'fa-IR' : 'en-GB'); };
// digits with a thousands separator (155,703 / ۱۵۵٬۷۰۳).
const fmt = (n) => (n || 0).toLocaleString(LANG === 'fa' ? 'fa-IR' : 'en-US');

function took(ms) {
  if (!ms) return '';
  const s = Math.round(ms / 1000);
  if (LANG === 'fa') {
    // Persian digits, like every other number on the Persian page
    if (s < 60) return fmt(s) + ' ثانیه';
    const m = Math.floor(s / 60);
    if (m < 60) return fmt(m) + ' دقیقه' + (s % 60 ? ' و ' + fmt(s % 60) + ' ثانیه' : '');
    return fmt(Math.floor(m / 60)) + ' ساعت و ' + fmt(m % 60) + ' دقیقه';
  }
  if (s < 60) return s + 's';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm' + (s % 60 ? ' ' + (s % 60) + 's' : '');
  return Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
}

function tiles() {
  const flagged = DATA.runs.filter((r) => r.status === 'findings' || r.status === 'failed');
  const time = DATA.runs.reduce((a, r) => a + (r.durMs || 0), 0);
  const items = [
    [T('RUNNING'), T('Running'), DATA.active.length, DATA.active.length ? 'live' : ''],
    [T('DONE'), T('Runs done'), DATA.runs.length, ''],
    [T('AGENTS'), T('Agents defined'), DATA.agents.length, ''],
    [T('FINDINGS'), T('Runs with findings'), flagged.length, flagged.length ? 'alert' : ''],
    [T('TIME'), T('Time spent'), took(time) || (LANG === 'fa' ? '۰' : '0'), ''],
  ];
  el('tiles').innerHTML = items.map(([key, label, value, kind]) =>
    '<div class="tile ' + kind + '"><span class="tile-key">[ ' + key + ' ]</span><b>' + esc(typeof value === 'number' ? fmt(value) : value) + '</b><span class="tile-label">' + esc(label) + '</span></div>').join('');
}

/** Everything the usage section shows, recomputed from the given runs each
 *  render — the caller narrows this to one project when that filter is set,
 *  so the whole stats section scopes with it. */
function computeStats(runs) {
  const now = new Date();
  const isToday = (iso) => {
    const d = new Date(iso);
    return !isNaN(d) && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  };
  const totalTokens = runs.reduce((a, r) => a + (r.tokens || 0), 0);
  const todayTokens = runs.filter((r) => isToday(r.finishedAt)).reduce((a, r) => a + (r.tokens || 0), 0);

  const byAgent = new Map();
  for (const r of runs) {
    const k = r.agent || T('unknown');
    const e = byAgent.get(k) || { name: k, tokens: 0, runs: 0, time: 0 };
    e.tokens += r.tokens || 0; e.runs += 1; e.time += r.durMs || 0;
    byAgent.set(k, e);
  }
  const agents = [...byAgent.values()]
    .map((a) => ({ ...a, avgTokens: a.runs ? Math.round(a.tokens / a.runs) : 0, avgTime: a.runs ? Math.round(a.time / a.runs) : 0 }))
    .sort((a, b) => b.tokens - a.tokens);

  const byModel = new Map();
  for (const r of runs) {
    const label = (r.modelKey || T('unknown')) + (r.effort ? ' · ' + r.effort : '');
    const e = byModel.get(label) || { name: label, tokens: 0, runs: 0 };
    e.tokens += r.tokens || 0; e.runs += 1;
    byModel.set(label, e);
  }
  const models = [...byModel.values()].sort((a, b) => b.tokens - a.tokens);

  const byProject = new Map();
  for (const r of runs) {
    const k = r.projectKey || T('unknown');
    const e = byProject.get(k) || { name: k, runs: 0 };
    e.runs += 1;
    byProject.set(k, e);
  }
  const projects = [...byProject.values()].sort((a, b) => b.runs - a.runs);

  // Last 7 calendar days including today, oldest first, by local day boundary.
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
    const tokens = runs
      .filter((r) => { const t = new Date(r.finishedAt).getTime(); return t >= start.getTime() && t < end.getTime(); })
      .reduce((a, r) => a + (r.tokens || 0), 0);
    days.push({ label: start.toLocaleDateString(LANG === 'fa' ? 'fa-IR' : 'en-CA', { month: '2-digit', day: '2-digit' }), tokens });
  }

  return { totalTokens, todayTokens, agents, models, projects, days };
}

/** A horizontal bar list: items already sorted, key is the value each bar's width is based on. */
function barList(items, key, extra) {
  if (!items.length) return '<div class="empty">' + T('No data.') + '</div>';
  const max = Math.max(...items.map((i) => i[key]), 1);
  return '<div class="bar-list">' + items.map((i) => {
    const pct = i[key] ? Math.max(2, Math.round((i[key] / max) * 100)) : 0;
    return '<div class="bar-row">'
      + '<span class="bar-label">' + esc(i.name) + '</span>'
      + '<span class="bar-track"><span class="bar-fill" style="width:' + pct + '%"></span></span>'
      + '<span class="bar-value">' + fmt(i[key]) + (extra ? extra(i) : '') + '</span>'
      + '</div>';
  }).join('') + '</div>';
}

function stats() {
  const project = el('project').value;
  const runs = project ? DATA.runs.filter((r) => (r.projectKey || '') === project) : DATA.runs;
  const s = computeStats(runs);
  const agentExtra = (a) => ' <span class="bar-sub">(' + fmt(a.runs) + T(' runs · avg ') + fmt(a.avgTokens)
    + T(' tokens · total time ') + (took(a.time) || T('unknown')) + T(' · avg time ') + (took(a.avgTime) || T('unknown')) + ')</span>';
  const modelExtra = (m) => ' <span class="bar-sub">(' + fmt(m.runs) + T(' runs)') + '</span>';

  const maxDay = Math.max(...s.days.map((d) => d.tokens), 1);
  const spark = '<div class="spark">' + s.days.map((d) => {
    const h = d.tokens ? Math.max(3, Math.round((d.tokens / maxDay) * 100)) : 2;
    return '<div class="spark-col">'
      + '<span class="spark-val">' + fmt(d.tokens) + '</span>'
      + '<span class="spark-bar" style="height:' + h + '%"></span>'
      + '<span class="spark-day">' + esc(d.label) + '</span>'
      + '</div>';
  }).join('') + '</div>';

  el('stats').innerHTML =
    '<div class="tiles">'
    + '<div class="tile"><span class="tile-key">[ ' + T('TOKENS') + ' ]</span><b>' + fmt(s.totalTokens) + '</b><span class="tile-label">' + T('Total tokens used (all time)') + '</span></div>'
    + '<div class="tile"><span class="tile-key">[ ' + T('TOKENS') + ' ]</span><b>' + fmt(s.todayTokens) + '</b><span class="tile-label">' + T('Tokens used today') + '</span></div>'
    + '</div>'
    + '<div class="stat-block"><h3>' + T('Tokens and time by agent') + '</h3>' + barList(s.agents, 'tokens', agentExtra) + '</div>'
    + '<div class="stat-block"><h3>' + T('Tokens and runs by model') + '</h3>' + barList(s.models, 'tokens', modelExtra) + '</div>'
    + '<div class="stat-block"><h3>' + T('Runs by project') + '</h3>' + barList(s.projects, 'runs') + '</div>'
    + '<div class="stat-block"><h3>' + T('Tokens used in the last 7 days') + '</h3>' + spark + '</div>';
}

function liveCards() {
  const box = el('live');
  if (!DATA.active.length) {
    box.innerHTML = '<div class="empty">' + T('No agent is working right now.') + '</div>';
    return;
  }
  const clock = (iso) => {
    const d = new Date(iso);
    return isNaN(d) ? '' : String(d.getHours()).padStart(2, '0') + ':'
      + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0');
  };
  box.innerHTML = '<div class="live-grid">' + DATA.active.map((a) => {
    const steps = a.steps && a.steps.length ? a.steps : (a.doing ? [{ at: a.startedAt, text: a.doing }] : []);
    const log = steps.length
      ? steps.map((s, i) => '<div class="term-line' + (i === steps.length - 1 ? ' now' : '') + '">'
        + '<span class="term-prompt">' + (i === steps.length - 1 ? '❯' : '$') + '</span>'
        + '<span class="term-at">' + esc(clock(s.at)) + '</span>'
        + '<span class="term-text">' + esc(s.text) + '</span></div>').join('')
      : '<div class="term-empty">' + T('Waiting for the first report from this agent…') + '</div>';
    return '<div class="live-card">'
      + '<div class="win-bar">'
      + '<span class="win-dots" aria-hidden="true"><i></i><i></i><i></i></span>'
      + '<span class="dot" aria-hidden="true"></span>'
      + '<span class="chip live-chip">' + esc(a.agent) + '</span>'
      + '<span class="live-task">' + esc(a.task) + '</span>'
      + '<span class="elapsed" data-since="' + esc(a.startedAt) + '"></span>'
      + '</div>'
      + '<div class="term" data-log="1">' + log + '</div>'
      + '<div class="kv" style="margin:0">'
      + '<span><b>' + T('Model:') + '</b> ' + esc(a.model || '—') + (a.effort ? ' (' + esc(a.effort) + ')' : '') + '</span>'
      + (a.project ? '<span><b>' + T('Project:') + '</b> ' + esc(a.project) + '</span>' : '')
      + '<span><b>' + T('Started:') + '</b> ' + esc(when(a.startedAt)) + '</span>'
      + '<span><b>' + T('Steps:') + '</b> ' + fmt(steps.length) + '</span>'
      + '</div></div>';
  }).join('') + '</div>';
  // Follow the newest line, the way a terminal does.
  document.querySelectorAll('.term[data-log]').forEach((t) => { t.scrollTop = t.scrollHeight; });
  tick();
}

function tick() {
  const now = Date.now();
  document.querySelectorAll('.elapsed').forEach((s) => {
    const started = new Date(s.dataset.since).getTime();
    s.textContent = isNaN(started) ? '' : took(Math.max(1000, now - started)) + (LANG === 'fa' ? ' تا اینجا' : ' so far');
  });
}

// Runs have no stored id, so this is what identifies the same run across a
// live-refresh rebuild: stable enough to keep the reader's page and open rows
// where they left them, since these three fields never change once written.
const runKey = (r) => (r.finishedAt || '') + '|' + (r.agent || '') + '|' + (r.task || '');

function card(r, open) {
  const status = Object.prototype.hasOwnProperty.call(STATUS, r.status) ? r.status : 'ok';
  const meta = [r.modelKey && r.modelKey + (r.effort ? ' · ' + r.effort : ''), r.projectKey, took(r.durMs), when(r.finishedAt)]
    .filter(Boolean).join(' · ');
  const findings = (r.findings || []).map((f) => '<li><span class="mark">!</span>' + esc(f) + '</li>').join('');
  const files = (r.files || []).map((f) => '<span class="file">' + esc(f) + '</span>').join('');
  return '<div class="run' + (open ? ' open' : '') + '">'
    + '<button class="run-head" type="button" aria-expanded="' + (open ? 'true' : 'false') + '" data-key="' + esc(runKey(r)) + '">'
    + '<span class="caret" aria-hidden="true">&lsaquo;</span>'
    + '<span class="chip status-' + status + '">[ ' + STATUS_CODE[status] + ' ]</span>'
    + '<span class="run-agent">' + esc(r.agent) + '</span>'
    + '<span class="run-task">' + esc(r.task) + '</span>'
    + '<span class="run-meta">' + esc(meta) + '</span>'
    + '</button>'
    + '<div class="run-body"' + (open ? '' : ' hidden') + '>'
    + '<div class="kv"><span><b>' + T('Model:') + '</b> ' + esc(r.model || '—') + (r.effort ? ' (' + esc(r.effort) + ')' : '') + '</span>'
    + '<span><b>' + T('Finished:') + '</b> ' + esc(when(r.finishedAt)) + '</span>'
    + (r.durMs ? '<span><b>' + T('Duration:') + '</b> ' + esc(took(r.durMs)) + '</span>' : '')
    + (r.command ? '<span><b>' + T('Command:') + '</b> <span class="file">' + esc(r.command) + '</span></span>' : '') + '</div>'
    + (r.summary ? '<p>' + esc(r.summary) + '</p>' : '')
    + (findings ? '<ul class="findings">' + findings + '</ul>' : '')
    + (files ? '<div class="files">' + files + '</div>' : '')
    + '</div></div>';
}

const PAGE_SIZE = 10;
let page = 1;
const expandedKeys = new Set();

/** Filters only — paging and the open/closed rows are handled by render(). */
function filteredRuns() {
  const q = el('q').value.trim().toLowerCase();
  const agent = el('agent').value;
  const status = el('status').value;
  const project = el('project').value;
  return DATA.runs.filter((r) => {
    if (agent && r.agent !== agent) return false;
    if (status && r.status !== status) return false;
    if (project && (r.projectKey || '') !== project) return false;
    if (!q) return true;
    return JSON.stringify(r).toLowerCase().includes(q);
  });
}

function renderPager(totalPages, total) {
  const box = el('pager');
  if (totalPages <= 1) { box.innerHTML = ''; return; }
  let html = '<div class="pager">'
    + '<button type="button" data-page="' + (page - 1) + '"' + (page === 1 ? ' disabled' : '') + '>&laquo; ' + T('Previous') + '</button>';
  for (let p = 1; p <= totalPages; p++) {
    html += '<button type="button" class="' + (p === page ? 'current' : '') + '" data-page="' + p + '">' + fmt(p) + '</button>';
  }
  html += '<button type="button" data-page="' + (page + 1) + '"' + (page === totalPages ? ' disabled' : '') + '>' + T('Next') + ' &raquo;</button>'
    + '<span class="pager-total">' + fmt(total) + T(' items') + '</span></div>';
  box.innerHTML = html;
}

function render() {
  if (!DATA.runs.length) {
    el('runs').innerHTML = '<div class="empty">' + T('No agent has done any work yet.') + '</div>';
    el('pager').innerHTML = '';
    return;
  }
  const shown = filteredRuns();
  if (!shown.length) {
    el('runs').innerHTML = '<div class="empty">' + T('Nothing matches this search.') + '</div>';
    el('pager').innerHTML = '';
    return;
  }
  const totalPages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  if (page > totalPages) page = totalPages;
  if (page < 1) page = 1;
  const start = (page - 1) * PAGE_SIZE;
  const pageItems = shown.slice(start, start + PAGE_SIZE);
  el('runs').innerHTML = pageItems.map((r) => card(r, expandedKeys.has(runKey(r)))).join('');
  renderPager(totalPages, shown.length);
}

/** A filter change starts the reader back at the newest page of the new list.
 *  The project filter also scopes the stats section, so redraw that too. */
function onFilterChange() {
  page = 1;
  stats();
  render();
}

function agentCards() {
  el('agents').innerHTML = DATA.agents.length
    ? DATA.agents.map((a) =>
      '<div class="agent"><div class="agent-top">'
      + '<span class="agent-name">' + esc(a.name) + '</span>'
      + '</div>'
      + '<div class="agent-flags">--model ' + esc(a.model || '—') + (a.effort ? ' --effort ' + esc(a.effort) : '') + '</div>'
      + (a.title ? '<div class="agent-title">' + esc(a.title) + '</div>' : '')
      + (LANG === 'fa' && a.titleFa ? '<div class="agent-title">' + esc(a.titleFa) + '</div>' : '')
      + '<div class="agent-desc' + (LANG === 'fa' && a.hasFa ? ' fa' : '') + '">' + esc(LANG === 'fa' ? a.descriptionFa : a.descriptionEn) + '</div></div>').join('')
    : '<div class="empty">' + T('No agent is defined yet.') + '</div>';
}

/** The agent filter keeps whatever the reader picked, even as new agents appear. */
function agentOptions() {
  const chosen = el('agent').value;
  const names = [...new Set(DATA.runs.map((r) => r.agent))].sort();
  el('agent').innerHTML = '<option value="">' + T('All agents') + '</option>'
    + names.map((n) => '<option value="' + esc(n) + '">' + esc(n) + '</option>').join('');
  if (names.includes(chosen)) el('agent').value = chosen;
}

/** Same idea, for the project filter — this is what lets one machine's
 *  dashboard cover every project, not just the one it was built for. */
function projectOptions() {
  const chosen = el('project').value;
  const names = [...new Set(DATA.runs.map((r) => r.projectKey).filter(Boolean))].sort();
  el('project').innerHTML = '<option value="">' + T('All projects') + '</option>'
    + names.map((n) => '<option value="' + esc(n) + '">' + esc(n) + '</option>').join('');
  if (names.includes(chosen)) el('project').value = chosen;
}

function renderAll() {
  // Options first: stats() and render() below both read the project filter's
  // current value, which this rebuilds without losing what the reader picked.
  agentOptions();
  projectOptions();
  tiles();
  stats();
  liveCards();
  agentCards();
  render();
  el('built').textContent = T('Updated at ') + when(DATA.builtAt);
}

renderAll();
setInterval(tick, 1000);

el('q').addEventListener('input', onFilterChange);
el('agent').addEventListener('change', onFilterChange);
el('project').addEventListener('change', onFilterChange);
el('status').addEventListener('change', onFilterChange);
el('runs').addEventListener('click', (e) => {
  const head = e.target.closest('.run-head');
  if (!head) return;
  const run = head.parentElement;
  const body = run.querySelector('.run-body');
  const open = body.hidden;
  body.hidden = !open;
  run.classList.toggle('open', open);
  head.setAttribute('aria-expanded', String(open));
  const key = head.dataset.key;
  if (open) expandedKeys.add(key); else expandedKeys.delete(key);
});
el('pager').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-page]');
  if (!btn || btn.disabled) return;
  const p = Number(btn.dataset.page);
  if (!p || p === page) return;
  page = p;
  render();
});

if (LIVE) {
  // Served by the local server: ask it for the state and redraw only when
  // something actually changed, so an opened row is not closed under the
  // reader's hands every second.
  let last = JSON.stringify([DATA.runs, DATA.active, DATA.agents]);
  let stateTag = '';
  const badge = el('mode');
  async function poll() {
    try {
      // 304 with no body while nothing changed on disk
      const res = await fetch('api/state', { cache: 'no-store', headers: stateTag ? { 'If-None-Match': stateTag } : {} });
      if (res.status !== 304 && !res.ok) throw new Error('HTTP ' + res.status);
      badge.className = 'mode';
      badge.textContent = T('● Live');
      if (res.status === 304) { el('built').textContent = T('Updated at ') + when(new Date().toISOString()); return; }
      stateTag = res.headers.get('ETag') || '';
      const fresh = await res.json();
      const now = JSON.stringify([fresh.runs, fresh.active, fresh.agents]);
      if (now === last) { el('built').textContent = T('Updated at ') + when(fresh.builtAt); return; }
      last = now;
      DATA = fresh;
      renderAll();
    } catch {
      badge.className = 'mode stale';
      badge.textContent = T('● Disconnected from server');
    }
  }
  poll();
  setInterval(poll, 1500);
} else {
  // The built file: it reloads itself, so keep the reader where they were.
  try {
    const saved = JSON.parse(sessionStorage.getItem('agent-dashboard') || '{}');
    if (saved.q) el('q').value = saved.q;
    if (saved.agent) el('agent').value = saved.agent;
    if (saved.project) el('project').value = saved.project;
    if (saved.status) el('status').value = saved.status;
    if (saved.q || saved.agent || saved.project || saved.status) { stats(); render(); }
    if (saved.y) window.scrollTo(0, saved.y);
    window.addEventListener('beforeunload', () => {
      try {
        sessionStorage.setItem('agent-dashboard', JSON.stringify({
          q: el('q').value, agent: el('agent').value, project: el('project').value, status: el('status').value, y: window.scrollY,
        }));
      } catch { /* a private window simply forgets */ }
    });
  } catch { /* the page works without this */ }
}
`

/** The archive: every run ever recorded, with filters and usage.
 *  `live` swaps the self-reloading file for server polling. */
function renderArchive(state, opts = {}) {
  const live = !!opts.live
  const lang = opts.lang === 'fa' ? 'fa' : 'en'
  const T = (key) => t(lang, key)
  const dir = lang === 'fa' ? 'rtl' : 'ltr'
  // "<" escaped, so a task description containing markup can never break out
  // of the script tag.
  const data = JSON.stringify(state).replace(/</g, '\\u003c')
  const refresh = live ? '' : `<meta http-equiv="refresh" content="${state.active.length ? 4 : 15}" />`
  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
${refresh}
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 16 16%27%3E%3Crect width=%2716%27 height=%2716%27 rx=%273%27 fill=%27%230A0F14%27/%3E%3Crect x=%273%27 y=%273%27 width=%2710%27 height=%2710%27 fill=%27%233BE8B0%27/%3E%3C/svg%3E" />
<title>Arsenale · ${T('Archive')}</title>
<style>${STYLE}</style>
</head>
<body>
<div class="wrap">
  <div class="shell-prompt"><span class="u">user@host</span><span class="d">:</span><span class="p">~/agents</span><span class="d">$</span> <span class="cmd">watch --agents</span></div>
  <header>
    <h1>Arsenale · ${T('Archive')}<span class="cursor" aria-hidden="true">▌</span></h1>
    ${live ? '<span class="mode" id="mode">' + T('● Live') + '</span>' : ''}
    <span class="built" id="built"></span>
    <a class="chip agent-chip" style="text-decoration:none" href="${live ? './' : 'agent-dashboard.html'}">${T('Today’s office ←')}</a>
    ${live ? langSwitch(lang) : ''}
  </header>
  <p class="lede">${T('Every task ever given to an agent: what was asked, which model did it, and what came back.')}</p>

  <div class="tiles" id="tiles"></div>

  <h2>${T('Usage stats')}</h2>
  <div id="stats"></div>

  <h2>${T('Running right now')}</h2>
  <div id="live"></div>
  <p class="note">${live
    ? T('This page asks the local server for fresh state every 1.5 seconds; it does not move until something actually changes.')
    : T('This page refreshes itself every few seconds and is rebuilt on every logged event.')}</p>

  <h2>${T('Runs done')}</h2>
  <div class="controls">
    <input id="q" type="search" placeholder="${T('Search tasks, files and findings…')}" aria-label="${T('Search')}" />
    <select id="agent" aria-label="${T('Filter by agent')}"><option value="">${T('All agents')}</option></select>
    <select id="project" aria-label="${T('Filter by project')}"><option value="">${T('All projects')}</option></select>
    <select id="status" aria-label="${T('Filter by result')}">
      <option value="">${T('Any result')}</option>
      <option value="ok">${T('No issues')}</option>
      <option value="findings">${T('Has findings')}</option>
      <option value="failed">${T('Failed')}</option>
      <option value="stopped">${T('Stopped')}</option>
    </select>
  </div>
  <div class="runs" id="runs"></div>
  <div id="pager"></div>

  <h2>${T('Agents defined')}</h2>
  <div class="agents" id="agents"></div>
  <p class="note">${T('Each agent is defined in a Markdown file in the agent folders, and their shared rules are in <code>AGENT-RULES.md</code>. Agents can build a new agent themselves, under the same rules.')}</p>
</div>

<script>
let DATA = ${data};
const LIVE = ${live};
${langScript(lang, live)}
${SCRIPT}
</script>
</body>
</html>
`
}

/** The page the dashboard opens on: the campus when a company is set up,
 *  else today's office. */
const renderPage = (state, opts) => renderOffice(state, Object.assign({}, opts || {}, { company: (opts && opts.company) || companyOf(state) }))

function build() {
  const state = collect()
  fs.mkdirSync(P.HOME, { recursive: true })
  fs.writeFileSync(OUT, renderPage(state))
  fs.writeFileSync(OUT_ARCHIVE, renderArchive(state))
  return { runs: state.runs.length, active: state.active.length, agents: state.agents.length }
}

module.exports = {
  build, collect, snapshot, invalidate, companyOf, renderPage, renderArchive, projectKey, modelKey, OUT, OUT_ARCHIVE,
  langFromRequest, saveGate, answerGate, dismissGate, unreadAnswers, readAnswers, saveDecision, transcriptFor, readTranscript, writeAtomic, ANSWERS,
}

if (require.main === module) {
  const n = build()
  console.log(path.relative(process.cwd(), OUT)
    + ' — ' + n.runs + ' runs done, ' + n.active + ' running, ' + n.agents + ' agents')
}
