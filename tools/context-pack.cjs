/* Context packs (spec 1.3 section 6): a short, per-project brief an assistant
 * reads before it reads the repository. At most LIMIT tokens (chars / 4).
 *
 * Never carries a run's brief, file contents, transcript text, a secret-looking
 * path, an env value, or another project's tasks. Read-only: build() and read()
 * write nothing; write() (arsenale context --write) saves the pack. */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const P = require('./paths.cjs')

const LIMIT = 1500
const SECRET_PATH = /(^|[\\/])secrets[\\/]|\.(lic|pem|key|pfx|p12)$|(^|[\\/])\.env[^\\/]*$|(^|[\\/])id_[^\\/]*$/i
const SECRET_VALUE = /^([A-Za-z_][A-Za-z0-9_]*=\S+|sk-\S{8,}|ghp_\S+|xox[bap]-\S+|AKIA\S{8,}|Bearer)$/
const tokens = (s) => Math.ceil(String(s).length / 4)
const DIR = () => path.join(P.HOME, 'context')

/** Free text made safe: secret-looking paths and env/key values become [hidden]. */
function scrub(s) {
  let next = false // the word after Bearer / token / password is the secret itself
  return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().split(' ').map((w) => {
    const bare = w.replace(/[:=]$/, '')
    const hide = next || SECRET_PATH.test(w) || SECRET_VALUE.test(w) || /[=:]\s*\S*(secret|token|password)/i.test(w)
    next = /^(bearer|token|password)$/i.test(bare)
    return hide ? '[hidden]' : w
  }).join(' ')
}
const clip = (s, n) => { s = scrub(s); return s.length > n ? s.slice(0, Math.max(0, n - 1)) + '…' : s }

function projectOf(co, id) {
  const list = (co && co.projects) || []
  if (id) return list.find((p) => p.id === id || p.key === id) || null
  return list.find((p) => p.status !== 'archived') || list[0] || null
}
const names = (p) => [p.id, p.name, p.key].concat(p.aliases || []).filter(Boolean).map((x) => String(x).toLowerCase())

function listTasksOf(p) {
  let all = []
  try { all = require('./tasks.cjs').listTasks() } catch { /* none */ }
  return all.filter((t) => t.projectId === p.id)
}

/** mtimes of the project's task files, decisions and gates, hashed. */
function signature(p, state) {
  const h = crypto.createHash('sha1')
  const add = (dir, keep) => {
    let fl = []
    try { fl = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && keep(f)).sort() } catch { return }
    for (const f of fl) { try { const st = fs.statSync(path.join(dir, f)); h.update(f + ':' + st.mtimeMs + ':' + st.size + ';') } catch { /* gone */ } }
  }
  const ids = new Set(listTasksOf(p).map((t) => t.id + '.json'))
  add(path.join(P.COMPANY, 'issues'), (f) => ids.has(f))
  add(P.DECISIONS, () => true)
  add(P.GATES, () => true)
  // the plan file and the queue shape the "Now" line
  add(path.join(P.COMPANY, 'plan'), (f) => f === p.id + '.json')
  add(P.COMPANY, (f) => f === 'queue.json')
  // the newest finished run of the project, so "Last runs" never goes stale
  try {
    const nm = names(p)
    const rs = (state || require('./build-agent-dashboard.cjs').collect()).runs || []
    const tid = new Set(listTasksOf(p).map((t) => t.id))
    const mine = rs.filter((r) => tid.has(r.issue) || tid.has(r.taskId) || nm.includes(String(r.projectKey || r.project || '').toLowerCase()))
    h.update('runs:' + mine.length + ':' + mine.map((r) => String(r.finishedAt || '')).sort().pop() + ';')
  } catch { /* no runs */ }
  return h.digest('hex').slice(0, 16)
}

function digestRules() {
  let rules = ''
  try { rules = require('./mcp-server.cjs').INSTRUCTIONS } catch { /* no server module */ }
  return rules.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 6)
}

const LEVELS = [
  { clip: 160, tasks: 5, dec: 3, runs: 3, rules: 6, now: 2 },
  { clip: 100, tasks: 5, dec: 3, runs: 3, rules: 6, now: 1 },
  { clip: 60, tasks: 5, dec: 2, runs: 3, rules: 4, now: 0 },
  { clip: 40, tasks: 3, dec: 2, runs: 2, rules: 3, now: 0 },
  { clip: 30, tasks: 2, dec: 1, runs: 1, rules: 2, now: 0 },
  { clip: 20, tasks: 1, dec: 1, runs: 1, rules: 1, now: 0 },
]

function build(projectId, opts) {
  opts = opts || {}
  const co = opts.company || require('./agent-company.cjs').readCompany()
  const p = projectOf(co, projectId)
  if (!p) { const e = new Error('no such project' + (projectId ? ': ' + clip(projectId, 40) : '')); e.code = 404; throw e }
  const state = opts.state || require('./build-agent-dashboard.cjs').collect()
  const office = ((co.offices || []).find((o) => o.id === p.officeId) || {}).name || p.officeId || ''
  const mine = listTasksOf(p)
  const ids = new Set(mine.map((t) => t.id))
  const nm = names(p)
  const open = mine.filter((t) => t.status !== 'done' && t.status !== 'cancelled')
    .sort((a, b) => (Number(a.priority) || 99) - (Number(b.priority) || 99) || String(a.createdAt).localeCompare(String(b.createdAt)))
  const PRI = { urgent: 0, high: 1, medium: 2, normal: 2, low: 3 }
  const rank = (t) => (typeof t.priority === 'number' ? t.priority : PRI[t.priority] !== undefined ? PRI[t.priority] : 2)
  open.sort((a, b) => rank(a) - rank(b) || String(a.createdAt).localeCompare(String(b.createdAt)))
  const inProject = (x) => ids.has(x.issue) || ids.has(x.taskId) || nm.includes(String(x.projectKey || x.project || '').toLowerCase())
  const decisions = (state.decisions || []).filter((d) => d.state === 'open' && inProject(d)).map((d) => ({ q: d.text, rec: d.reason }))
    .concat((state.gates || []).filter((g) => g.status === 'waiting' && inProject(g)).map((g) => ({ q: g.question || g.label, rec: (g.choices && g.choices[0] && (g.choices[0].label || g.choices[0])) || g.recommendation || '' })))
  const runs = (state.runs || []).filter(inProject).slice(0, 3)
  const rules = digestRules()
  const L = require('./ledger.cjs')
  const cost = (r) => (r.costUsd == null ? 'n/a' : L.fmtUsd({ usdStatus: 'ok', usd: Number(r.costUsd), estimatedRuns: r.costSrc === 'estimated' ? 1 : 0 }))
  const toks = (r) => (r.tokSrc ? (Number(r.tokTotal) || 0) + ' tok ' + cost(r) : 'tokens not recorded')

  // the "Now" line (spec 1.4): the active version with its progress and the queue head; absent when the project has neither
  // Full: "Now: version 2.1 Ordering, 46 %, phase Storefront (2 of 4 tasks done), queue head T-7";
  // it shrinks first (no phase, then no title) before the task list does.
  let nowBits = null
  try {
    const Pl = require('./plan.cjs')
    const pv = Pl.view(p.id, mine)
    const v = pv.versions.find((x) => x.status === 'active') || pv.versions.find((x) => x.horizon === 'now' && x.status === 'planned')
    const head = require('./queue.cjs').read(mine).entries.find((e) => !e.claimed && e.task.projectId === p.id)
    nowBits = { v, head, phase: null }
    if (v) {
      const ph = v.phases.find((x) => x.status !== 'done') || null
      if (ph) {
        const pt = mine.filter((t) => t.targetVersion === v.name && t.phaseId === ph.id && t.status !== 'cancelled')
        nowBits.phase = { title: ph.title, done: pt.filter((t) => t.status === 'done').length, total: pt.length }
      }
    }
  } catch { /* no plan data */ }
  const nowLine = (detail) => {
    if (!nowBits) return ''
    const { v, head, phase } = nowBits, bits = []
    if (v) {
      bits.push('version ' + clip(v.name, 12) + (detail >= 1 && v.title ? ' ' + clip(v.title, 30) : ''), v.progress.label)
      if (detail >= 2 && phase) bits.push('phase ' + clip(phase.title, 30) + ' (' + phase.done + ' of ' + phase.total + ' tasks done)')
    }
    if (head) bits.push('queue head ' + head.taskId)
    return bits.length ? 'Now: ' + bits.join(', ') : ''
  }

  const render = (lv) => {
    const out = ['# ' + clip(p.name, 60) + ' (' + clip(p.key, 12) + ')', 'Office: ' + clip(office || '-', 40) + ' | Status: ' + clip(p.status || 'active', 20)].concat(nowLine(lv.now) ? [nowLine(lv.now)] : [], ['', '## Open tasks (' + open.length + ')'])
    for (const t of open.slice(0, lv.tasks)) {
      out.push('- ' + t.id + ' ' + clip(t.title, lv.clip) + ' [' + t.status + ']' + [t.type, t.size, t.tier, t.targetVersion].filter(Boolean).map((x) => ' ' + clip(x, 12)).join('') + (t.acceptance ? ' | AC: ' + clip(t.acceptance, lv.clip) : ''))
    }
    if (!open.length) out.push('- none')
    if (decisions.length) { out.push('', '## Open decisions and gates'); for (const d of decisions.slice(0, lv.dec)) out.push('- ' + clip(d.q, lv.clip) + (d.rec ? ' -> ' + clip(d.rec, lv.clip) : '')) }
    out.push('', '## Last runs')
    for (const r of runs.slice(0, lv.runs)) out.push('- ' + clip(r.agent, 24) + ' ' + clip(r.modelKey || r.model, 20) + ' ' + toks(r) + ' ' + clip(r.summary || r.task, lv.clip))
    if (!runs.length) out.push('- none')
    out.push('', '## House rules')
    for (const l of rules.slice(0, lv.rules)) out.push(clip(l, Math.max(lv.clip, 60)))
    return out.join('\n')
  }
  let md = ''
  for (const lv of LEVELS) { md = render(lv); if (tokens(md) <= LIMIT) break }
  if (tokens(md) > LIMIT) md = md.slice(0, LIMIT * 4 - 1) + '…'
  return { markdown: md, tokens: tokens(md), projectId: p.id, signature: signature(p, state) }
}

const fileOf = (id) => {
  const s = String(id).replace(/[^\w.-]/g, '')
  if (!s || /^\.+$/.test(s)) throw new Error('bad project id')
  return path.join(DIR(), s + '.md')
}

/** Saves the pack and its signature (arsenale context --write). */
function write(projectId, opts) {
  const b = build(projectId, opts)
  fs.mkdirSync(DIR(), { recursive: true, mode: 0o700 })
  try { require('./owner-only.cjs').ensure(DIR()) } catch { /* not Windows */ }
  fs.writeFileSync(fileOf(b.projectId), b.markdown + '\n')
  fs.writeFileSync(fileOf(b.projectId) + '.sig', b.signature)
  return Object.assign({ file: fileOf(b.projectId) }, b)
}

/** The saved pack while its signature still matches, else a fresh build. Writes nothing. */
function read(projectId, opts) {
  const b = build(projectId, opts)
  try {
    if (fs.readFileSync(fileOf(b.projectId) + '.sig', 'utf8') === b.signature) {
      const md = fs.readFileSync(fileOf(b.projectId), 'utf8').replace(/\n$/, '')
      if (tokens(md) <= LIMIT) return Object.assign({}, b, { markdown: md, tokens: tokens(md) })
    }
  } catch { /* no saved pack */ }
  return b
}

function run(args, say) {
  const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined }
  try {
    const r = args.includes('--write') ? write(val('--project')) : read(val('--project'))
    say(args.includes('--json') ? JSON.stringify(r, null, 2) : r.markdown + (r.file ? '\n\nSaved to ' + r.file : ''))
    return 0
  } catch (e) { console.error(e.message); return 1 }
}

module.exports = { build, read, write, run, signature, LIMIT }
