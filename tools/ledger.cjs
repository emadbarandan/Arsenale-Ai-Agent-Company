/* The ledger (spec 1.3 section 4): finished runs grouped by run, task,
 * version, office, model or week, with token meters and USD. Read-only: it
 * takes collect()'s state (plus the task and version-run files, read, never
 * written) and returns numbers. Cost shows as ok, "≥ $X", "n/a" or "not
 * recorded", never as $0 for an unknown. */
const fs = require('fs')
const path = require('path')

const BY = ['run', 'task', 'version', 'office', 'model', 'week']
const WEIGHT = { S: 1, M: 3, L: 8 }
const NO_VERSION = '(no version)'

/** ISO week of a date, in UTC: 2026-W47. */
function weekOf(when) {
  const d = new Date(when)
  if (isNaN(d)) return ''
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const y = t.getUTCFullYear()
  const wk = Math.ceil(((t - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7)
  return y + '-W' + String(wk).padStart(2, '0')
}

function readVersionRuns() {
  const out = {}
  let dir
  try { dir = require('./paths.cjs').VERSION_RUNS } catch { return out }
  let names = []
  try { names = fs.readdirSync(dir) } catch { return out }
  for (const n of names) {
    if (!/^[\w.-]+\.json$/.test(n)) continue
    try { const v = JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8')); if (v) out[n.replace(/\.json$/, '')] = v } catch { /* skip */ }
  }
  return out
}

function newGroup(key) {
  return { key, runs: 0, measured: 0, unmeasured: 0, tokens: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, metered: 0, usd: 0, usdRuns: 0, usdMissing: 0, usdEst: 0, usdStatus: 'none' }
}
function add(g, r) {
  g.runs++
  if (!r.tokSrc) { g.unmeasured++; return }
  g.measured++
  g.tokens += Number(r.tokTotal) || 0
  const m = r.meters
  if (m) {
    g.metered++
    g.input += m.input || 0; g.output += m.output || 0; g.cacheRead += m.cacheRead || 0
    g.cacheWrite += (m.cacheWrite5m || 0) + (m.cacheWrite1h || 0)
  }
  if (typeof r.costUsd === 'number') { g.usd += r.costUsd; g.usdRuns++; if (r.costSrc === 'estimated') g.usdEst++ } else g.usdMissing++
}
function close(g) {
  g.usd = Math.round(g.usd * 1e6) / 1e6
  g.usdStatus = !g.measured ? 'none' : !g.usdRuns ? 'na' : g.usdMissing ? 'partial' : 'ok'
  g.estimatedRuns = g.usdEst
  delete g.usdEst
  g.cost = fmtUsd(g)
  // an unknown is null, never a numeric 0 next to "n/a" / "not recorded"
  if (g.usdStatus === 'na' || g.usdStatus === 'none') g.usd = null
  if (!g.metered) { g.input = null; g.output = null; g.cacheRead = null; g.cacheWrite = null }
  return g
}

/** The display rule of section 4. */
function fmtUsd(g) {
  const n = (x) => '$' + x.toFixed(x < 1 ? 4 : 2)
  const est = g.estimatedRuns > 0 && g.usd > 0 ? ' (est.)' : ''
  if (g.usdStatus === 'ok') return n(g.usd) + est
  if (g.usdStatus === 'partial') return '≥ ' + n(g.usd) + est + ' (' + g.usdMissing + ' of ' + g.measured + ' runs unpriced)'
  if (g.usdStatus === 'na') return 'n/a'
  return 'not recorded'
}

/** @param state collect()'s output
 *  @param opts {by, since, until, tasks, versionRuns, office} tasks: listTasks()
 *  rows; versionRuns: {id: record}; office(run) -> id (defaults to run.officeId) */
function ledger(state, opts) {
  opts = opts || {}
  const by = opts.by || 'run'
  if (!BY.includes(by)) { const e = new Error('by must be one of: ' + BY.join(', ')); e.code = 400; throw e }
  const dateOk = (s) => s === undefined || s === null || s === '' || !isNaN(Date.parse(s))
  if (!dateOk(opts.since) || !dateOk(opts.until)) { const e = new Error('since and until must be ISO dates'); e.code = 400; throw e }
  const since = opts.since ? Date.parse(opts.since) : -Infinity
  // an until date with no time covers that whole day
  const until = opts.until ? Date.parse(opts.until) + (/^\d{4}-\d{2}-\d{2}$/.test(opts.until) ? 86400000 : 0) : Infinity
  const tasks = new Map((opts.tasks || []).map((t) => [t.id, t]))
  const vruns = opts.versionRuns || readVersionRuns()
  let offices = opts.office
  if (!offices) {
    try {
      const C = require('./agent-company.cjs')
      const co = C.readCompany()
      if (co.configured) {
        const m = new Map(C.costEvents(state, co).filter((e) => !e.live).map((e) => [e.id, e.officeId]))
        offices = (r) => m.get(r.id || r.finishedAt + '|' + r.agent) || ''
      }
    } catch { /* no company */ }
  }
  const officeOf = (r) => r.officeId || (offices ? offices(r) : '') || '(no office)'
  const versionOf = (r) => {
    const t = r.issue && tasks.get(r.issue)
    if (t && t.targetVersion) return t.targetVersion
    const vr = r.versionRun && vruns[r.versionRun]
    if (vr && vr.version) return String(vr.version)
    return NO_VERSION
  }
  const keyOf = {
    run: (r) => r.id || (r.finishedAt + '|' + r.agent),
    task: (r) => r.issue || '(no task)',
    version: versionOf,
    office: officeOf,
    model: (r) => r.modelKey || '(unknown model)',
    week: (r) => weekOf(r.finishedAt) || '(no date)',
  }[by]
  const finished = (state.runs || []).filter((r) => { const t = Date.parse(r.finishedAt); return !(t < since) && !(t >= until) })
  const groups = new Map()
  for (const r of finished) {
    const k = keyOf(r)
    if (!groups.has(k)) groups.set(k, newGroup(k))
    add(groups.get(k), r)
  }
  const rows = [...groups.values()].map(close)
  const ratio = (a, b) => (b > 0 ? Math.round((a / b) * 100) / 100 : null)
  if (by === 'task') {
    for (const g of rows) {
      const t = tasks.get(g.key)
      g.title = t ? t.title : ''
      g.status = t ? t.status : ''
      g.tokenEstimate = t && typeof t.tokenEstimate === 'number' ? t.tokenEstimate : null
      g.estimateRatio = g.tokenEstimate && g.measured ? ratio(g.tokens, g.tokenEstimate) : null
    }
  }
  if (by === 'version') {
    for (const g of rows) {
      const pr = require('./plan.cjs').progress([...tasks.values()].filter((t) => (t.targetVersion || NO_VERSION) === g.key))
      const total = pr.totalWeight, done = pr.doneWeight
      g.weightTotal = total; g.weightDone = done
      g.usdPerWeight = g.usdStatus === 'ok' && done > 0 ? Math.round((g.usd / done) * 1e6) / 1e6 : null
    }
  }
  rows.sort((a, b) => (by === 'week' || by === 'run' ? String(b.key).localeCompare(String(a.key)) : b.tokens - a.tokens || String(a.key).localeCompare(String(b.key))))
  const total = newGroup('total')
  for (const r of finished) add(total, r)
  close(total)
  const running = (state.active || []).map((a) => ({ id: a.id, agent: a.agent, task: a.issue || '', model: a.modelKey || '' }))
  return { by, since: opts.since || null, until: opts.until || null, rows, total, running }
}

/** Text for `arsenale ledger`. */
function text(L) {
  const lines = ['Ledger by ' + L.by + (L.since ? ' since ' + L.since : '') + (L.until ? ' until ' + L.until : '')]
  for (const g of L.rows) lines.push(g.key + '  runs ' + g.runs + (g.unmeasured ? ' (' + g.unmeasured + ' unmeasured)' : '') + '  tokens ' + g.tokens + '  cost ' + g.cost + (g.estimateRatio != null ? '  vs estimate x' + g.estimateRatio : ''))
  lines.push('Total  runs ' + L.total.runs + '  tokens ' + L.total.tokens + '  cost ' + L.total.cost)
  if (L.running.length) lines.push('Running now (not counted): ' + L.running.length)
  return lines.join('\n')
}

function run(args, say) {
  const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined }
  try {
    const B = require('./build-agent-dashboard.cjs')
    const L = ledger(B.collect(), { by: val('--by'), since: val('--since'), until: val('--until'), tasks: require('./tasks.cjs').listTasks() })
    say(args.includes('--json') ? JSON.stringify(L, null, 2) : text(L))
    return 0
  } catch (e) { console.error(e.message); return 1 }
}

module.exports = { ledger, run, text, weekOf, fmtUsd, BY }
