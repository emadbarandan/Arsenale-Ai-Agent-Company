/* The Savings view (spec 1.3 section 5): what was measured this week, cost per
 * done task against a baseline, tier suggestions (rule v1: R1, R2, R3), the
 * owner's "adopted" marks, and the weekly Markdown report.
 *
 * savings(state, opts) is read-only: it takes collect()'s state and the task
 * rows. The only writers are adopt() (board only) and writeReport(). Every
 * suggested amount is an estimate ("est."), taken from ATB-1, a lite
 * benchmark (one run per task per arm): docs/benchmarks/atb-1.md. */
const fs = require('fs')
const path = require('path')
const L = require('./ledger.cjs')

const WEIGHT = { S: 1, M: 3, L: 8 }
const MIN_DONE = 5 // done tasks needed on both sides before a change is shown
const MIN_RUNS_AFTER = 5 // runs after the adopted date before an effect is shown
const BASELINE_DAYS = 14
// kinds that are never routed down, whatever the model (section 5.2)
const NEVER_DOWN = ['docs', 'plan', 'research', 'content', 'legal', 'design', 'security', 'review']
const WRITING = ['docs', 'plan', 'research', 'content', 'legal', 'design']
const DOC = 'docs/benchmarks/atb-1.md'

const RULES = {
  R1: {
    id: 'R1', title: 'Light work on a heavy model', tierKey: 'light', pct: 95, label: 'est. -95 %',
    method: 'Rule R1 fires when a run is marked light work and ran on a heavy model. ATB-1 measured one status scan on the heavy model and on the light model: $0.26 against $0.01 (-95 %), 13 of 13 facts found in both.',
    rows: 'ATB-1 task T10 (status scan): -95 %',
  },
  R2: {
    id: 'R2', title: 'Code work on a heavy model', tierKey: 'standard', pct: 34, label: 'est. -34 % (range -24 % to -57 %)',
    method: 'Rule R2 fires when a build or verify run ran on a heavy model and is not a small bug fix (type bug, size S). ATB-1 measured five code tasks on the standard model against the heavy model: median -34 %, range -24 % to -57 %, every hidden test green. A tiny bug fix cost 28 % more on the standard model (13 turns against 10), so those are left out.',
    rows: 'ATB-1 tasks T2 -52 %, T5 -29 %, T6 -57 %, T7 -24 %, T8 -34 %; T1 (small bug) +28 %',
  },
  R3: {
    id: 'R3', title: 'Writing on a cheaper model', tierKey: 'heavy', pct: 0, label: '',
    method: 'Rule R3 is a quality warning, with no saving shown. ATB-1 ran writing and research on the standard model: a spec scored 12 of 20 with 3 factual errors (the heavy model: 18 of 20), a research brief 17 of 20 (heavy: 19 of 20). A cheaper run that has to be redone saves nothing.',
    rows: 'ATB-1 tasks T3 (spec): 12/20 against 18/20; T9 (research): 17/20 against 19/20',
  },
}
const LITE = 'ATB-1 was a lite run: one repeat per task per arm, so small differences are inside the noise. See ' + DOC + '.'

const usd = (x) => '$' + x.toFixed(x < 1 ? 4 : 2)
const r6 = (x) => Math.round(x * 1e6) / 1e6

function cfg() {
  const P = require('./paths.cjs')
  const c = P.CONFIG || {}
  const heavy = (Array.isArray(c.heavyModels) ? c.heavyModels.map(String) : ['Opus']).concat(['Fable'])
  return {
    heavy: heavy.map((x) => x.toLowerCase()),
    tierModels: Object.assign({ light: 'haiku', standard: 'sonnet', heavy: 'opus' }, c.tierModels && typeof c.tierModels === 'object' ? c.tierModels : {}),
    baseline: typeof c.savingsBaseline === 'string' && !isNaN(Date.parse(c.savingsBaseline)) ? c.savingsBaseline : '',
  }
}
const isHeavy = (mk, heavy) => { const f = String(mk || '').split(' ')[0].toLowerCase(); return !!f && heavy.includes(f) }

/** Monday 00:00 UTC of an ISO week id, as a ms timestamp. */
function weekStart(id) {
  const m = /^(\d{4})-W(\d{2})$/.exec(id)
  if (!m) return NaN
  const jan4 = Date.UTC(+m[1], 0, 4)
  const dow = new Date(jan4).getUTCDay() || 7
  return jan4 - (dow - 1) * 86400000 + (+m[2] - 1) * 7 * 86400000
}
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10)
/** The ISO week of the local calendar date of `now` (the weekly write runs in local time). */
function localWeek(now) {
  const d = new Date(now)
  return L.weekOf(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
}
const lastWeek = (now) => { const d = new Date(now); return L.weekOf(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate() - 7)) }

/** The tier suggestions for a set of finished runs (rule v1). */
function suggest(runs, tasks, c) {
  const byTask = new Map((tasks || []).map((t) => [t.id, t]))
  const groups = new Map()
  const fire = (rule, r) => {
    const key = rule + '|' + (r.agent || '(unknown)')
    let g = groups.get(key)
    if (!g) groups.set(key, g = { rule, agent: r.agent || '(unknown)', runs: 0, runIds: [], models: new Set(), usd: 0, priced: 0, unpriced: 0 })
    g.runs++; g.runIds.push(r.id || r.finishedAt + '|' + r.agent); g.models.add(r.modelKey || '?')
    if (typeof r.costUsd === 'number') { g.usd += r.costUsd * RULES[rule].pct / 100; g.priced++ } else g.unpriced++
  }
  for (const r of runs) {
    const t = (r.issue && byTask.get(r.issue)) || {}
    const kind = r.kind || t.kind || ''
    const tier = r.tier || t.tier || ''
    if (!kind) continue // no recorded kind: unknown, never down (D14, writing never down)
    const heavy = isHeavy(r.modelKey, c.heavy)
    if (WRITING.includes(kind) && !heavy && r.modelKey) { fire('R3', r); continue }
    if (NEVER_DOWN.includes(kind) || !heavy) continue
    if (tier === 'light') fire('R1', r)
    else if ((kind === 'build' || kind === 'verify') && !(t.type === 'bug' && t.size === 'S')) fire('R2', r)
  }
  const out = []
  for (const g of groups.values()) {
    const R = RULES[g.rule]
    const to = c.tierModels[R.tierKey]
    const total = g.priced ? r6(g.usd) : null
    out.push({
      rule: g.rule, kind: g.rule === 'R3' ? 'warning' : 'saving', title: R.title, agent: g.agent, runs: g.runs, runIds: g.runIds.slice(0, 20),
      from: [...g.models].join(', '), to: g.rule === 'R3' ? 'keep it on, or raise it to, the heavy model (' + to + ')' : to,
      savingUsd: R.pct ? total : null,
      saving: !R.pct ? 'no saving: quality warning' : total === null ? 'n/a' : 'est. ' + usd(total) + (g.unpriced ? ' (' + g.unpriced + ' of ' + g.runs + ' runs unpriced)' : ''),
      pct: R.label, method: R.method, atbRows: R.rows, lite: LITE, doc: DOC,
      label: g.agent + ': ' + g.runs + (g.runs === 1 ? ' run' : ' runs') + ', ' + g.rule,
    })
  }
  out.sort((a, b) => (b.savingUsd || 0) - (a.savingUsd || 0) || b.runs - a.runs || a.label.localeCompare(b.label))
  return out
}

// ---------- the owner's adopted marks
const adoptedFile = () => path.join(require('./paths.cjs').HOME, 'savings', 'adopted.json')
function readAdopted() {
  try { const j = JSON.parse(fs.readFileSync(adoptedFile(), 'utf8')); return Array.isArray(j.items) ? j.items.filter((x) => x && x.rule && x.agent && x.date) : [] } catch { return [] }
}
/** Board only. input: {rule, agent, adopted: true|false}. */
function adopt(input, actor) {
  const { fail, requireBoard } = require('./runlog.cjs')
  requireBoard(actor)
  const b = input && typeof input === 'object' ? input : {}
  if (!['R1', 'R2'].includes(b.rule)) throw fail(400, '"rule" must be R1 or R2')
  if (typeof b.agent !== 'string' || !b.agent || b.agent.length > 120) throw fail(400, '"agent" must be an agent name')
  if (typeof b.adopted !== 'boolean') throw fail(400, '"adopted" must be true or false')
  const rest = readAdopted().filter((x) => !(x.rule === b.rule && x.agent === b.agent))
  if (b.adopted) rest.push({ rule: b.rule, agent: b.agent, date: new Date().toISOString() })
  const file = adoptedFile()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  require('./store.cjs').writeAtomic(file, JSON.stringify({ items: rest }, null, 2) + '\n')
  return { items: rest }
}

/** Cost per done weight-point of an agent's work before and after the date. */
function effectOf(item, state, tasks) {
  const at = Date.parse(item.date)
  const mine = (state.runs || []).filter((r) => r.agent === item.agent)
  const after = mine.filter((r) => Date.parse(r.finishedAt) >= at)
  if (after.length < MIN_RUNS_AFTER) return { status: 'measuring', runsAfter: after.length, needed: MIN_RUNS_AFTER }
  const byTask = new Map(tasks.map((t) => [t.id, t]))
  const ids = new Set(mine.filter((r) => r.issue && byTask.has(r.issue)).map((r) => r.issue))
  const side = (pred) => {
    let cost = 0, weight = 0, ok = true
    for (const id of ids) {
      const t = byTask.get(id)
      const done = Date.parse(t.completedAt)
      if (t.status !== 'done' || isNaN(done) || !pred(done)) continue
      const rs = mine.filter((r) => r.issue === id && r.tokSrc)
      if (!rs.length || rs.some((r) => typeof r.costUsd !== 'number')) { ok = false; continue }
      cost += rs.reduce((a, r) => a + r.costUsd, 0); weight += WEIGHT[t.size] || 1
    }
    return ok && weight ? r6(cost / weight) : null
  }
  return { status: 'measured', runsAfter: after.length, before: side((d) => d < at), after: side((d) => d >= at) }
}

// ---------- the page's content
const doneIn = (tasks, from, to) => tasks.filter((t) => t.status === 'done' && Date.parse(t.completedAt) >= from && Date.parse(t.completedAt) < to)
/** Cost of done tasks: only tasks whose measured runs are all priced count. */
function perDone(state, done) {
  let cost = 0, weight = 0, n = 0
  for (const t of done) {
    const rs = (state.runs || []).filter((r) => r.issue === t.id && r.tokSrc)
    if (!rs.length || rs.some((r) => typeof r.costUsd !== 'number')) continue
    cost += rs.reduce((a, r) => a + r.costUsd, 0); weight += WEIGHT[t.size] || 1; n++
  }
  return { tasks: done.length, priced: n, usd: n ? r6(cost) : null, perTask: n ? r6(cost / n) : null, perWeight: weight ? r6(cost / weight) : null }
}

/** The fetch date of the shipped list prices, for the button text. */
function pricesFetched() {
  try { const d = JSON.parse(require('./paths.cjs').stripBom(fs.readFileSync(require('./paths.cjs').PRICE_DEFAULTS, 'utf8'))); return String((d.source && d.source.fetched) || '') } catch { return '' }
}

function savings(state, opts) {
  opts = opts || {}
  const c = opts.config || cfg()
  const tasks = opts.tasks || []
  const now = opts.now || Date.now()
  const week = opts.week || localWeek(now)
  if (!/^\d{4}-W\d{2}$/.test(week)) { const e = new Error('week must look like 2026-W47'); e.code = 400; throw e }
  const w0 = weekStart(week), w1 = w0 + 7 * 86400000
  const lo = { tasks, versionRuns: {}, office: () => '' }
  const wk = L.ledger(state, Object.assign({ by: 'run', since: isoDay(w0), until: isoDay(w1 - 86400000) }, lo))
  const all = L.ledger(state, Object.assign({ by: 'run' }, lo))
  const weekRuns = (state.runs || []).filter((r) => { const t = Date.parse(r.finishedAt); return t >= w0 && t < w1 })
  const t = wk.total
  const cacheDen = (t.input || 0) + (t.cacheRead || 0) + (t.cacheWrite || 0)
  const sources = new Set(weekRuns.filter((r) => r.tokSrc && r.costSrc).map((r) => r.costSrc))
  const plan = opts.payModel === 'plan'
  const measuredAt = (state.runs || []).filter((r) => r.tokSrc && !isNaN(Date.parse(r.finishedAt))).map((r) => Date.parse(r.finishedAt)).sort((a, b) => a - b)
  const bStart = c.baseline ? Date.parse(c.baseline) : measuredAt[0]
  const bEnd = Math.min(bStart + BASELINE_DAYS * 86400000, w0)
  const cur = perDone(state, doneIn(tasks, w0, w1))
  const base = bStart === undefined || isNaN(bStart) ? null : perDone(state, doneIn(tasks, bStart, bEnd))
  const enough = !!base && cur.priced >= MIN_DONE && base.priced >= MIN_DONE
  const pc = (a, b) => (a != null && b ? Math.round(((a - b) / b) * 100) : null)
  const change = enough ? { perTask: pc(cur.perTask, base.perTask), perWeight: pc(cur.perWeight, base.perWeight) } : null
  const sug = suggest(weekRuns, tasks, c)
  const adopted = readAdopted().map((x) => Object.assign({}, x, { effect: effectOf(x, state, tasks) }))
  return {
    week, from: isoDay(w0), to: isoDay(w1 - 86400000),
    empty: !all.total.runs,
    pricesSet: opts.pricesSet !== undefined ? !!opts.pricesSet : true,
    payModel: plan ? 'plan' : '',
    measured: {
      runs: t.runs, measured: t.measured, unmeasured: t.unmeasured, priced: t.usdRuns, tokens: t.tokens,
      usd: t.usd, usdStatus: t.usdStatus, cost: t.cost, costLabel: plan && (t.usdStatus === 'ok' || t.usdStatus === 'partial') ? 'API-equivalent ' + t.cost : t.cost,
      costSource: [...sources].sort(), cacheShare: cacheDen > 0 ? Math.round(((t.cacheRead || 0) / cacheDen) * 100) : null,
      unpricedModels: opts.unpricedModels || [],
    },
    perDone: {
      current: cur, baseline: base, baselineFrom: base ? isoDay(bStart) : null, baselineTo: base ? isoDay(bEnd - 86400000) : null,
      enough, change, note: enough ? '' : 'too few done tasks to compare',
    },
    suggestions: sug.filter((s) => s.kind === 'saving'),
    warnings: sug.filter((s) => s.kind === 'warning'),
    adoptedKeys: adopted.map((x) => x.rule + '|' + x.agent),
    adopted,
    rulesChecked: ['R1', 'R2', 'R3'],
    pricesFetched: pricesFetched(),
    running: wk.running.length,
  }
}

// ---------- Markdown report
function report(S) {
  const m = S.measured
  const lines = ['# Savings, ' + S.week + ' (' + S.from + ' to ' + S.to + ')', '']
  if (S.empty) return lines.concat(['No runs logged yet. Savings start with your first logged runs.', '']).join('\n')
  lines.push('## Measured this week', '',
    '- Spend: ' + m.costLabel + (m.costSource.length ? ' (' + m.costSource.map((x) => (x === 'estimated' ? 'est.' : x)).join(', ') + ')' : ''),
    '- Runs: ' + m.runs + '; measured ' + m.measured + ' of ' + m.runs + '; priced ' + m.priced + ' of ' + m.measured,
    '- Cache-read share: ' + (m.cacheShare === null ? 'not recorded' : m.cacheShare + ' %'), '')
  const p = S.perDone
  lines.push('## Cost per done task', '')
  lines.push('- This week: ' + p.current.tasks + ' done tasks' + (p.current.perTask != null ? ', ' + usd(p.current.perTask) + ' per task, ' + (p.current.perWeight != null ? usd(p.current.perWeight) : 'n/a') + ' per weight-point' : ', cost n/a'))
  if (p.baseline) lines.push('- Baseline (' + p.baselineFrom + ' to ' + p.baselineTo + '): ' + p.baseline.tasks + ' done tasks' + (p.baseline.perTask != null ? ', ' + usd(p.baseline.perTask) + ' per task' : ', cost n/a'))
  lines.push('- ' + (p.change && p.change.perTask != null ? 'Change per task: ' + (p.change.perTask > 0 ? '+' : '') + p.change.perTask + ' %' : p.note || 'too few done tasks to compare'), '')
  lines.push('## Suggestions', '')
  if (!S.suggestions.length && !S.warnings.length) lines.push('No suggestions this week. Rules checked: ' + S.rulesChecked.join(', ') + '.', '')
  for (const s of S.suggestions) lines.push('- **' + s.label + '**: ' + s.from + ' to ' + s.to + '; ' + s.saving + ' (' + s.pct + '). Why: ' + s.method + ' ' + s.lite)
  for (const s of S.warnings) lines.push('- **Warning, ' + s.label + '**: ' + s.method + ' ' + s.lite)
  lines.push('', '## Adopted', '')
  if (!S.adopted.length) lines.push('Nothing marked adopted.')
  for (const a of S.adopted) lines.push('- ' + a.agent + ', ' + a.rule + ' (' + a.date.slice(0, 10) + '): ' + (a.effect.status === 'measuring' ? 'measuring (' + a.effect.runsAfter + ' of ' + a.effect.needed + ' runs)' : 'cost per weight-point ' + (a.effect.before != null ? usd(a.effect.before) : 'n/a') + ' before, ' + (a.effect.after != null ? usd(a.effect.after) : 'n/a') + ' after'))
  return lines.join('\n').replace(/\n+$/, '') + '\n'
}

const reportFile = (week) => path.join(require('./paths.cjs').HOME, 'reports', 'savings-' + week + '.md')
/** Writes <home>/reports/savings-<week>.md and nothing else. */
function writeReport(S) {
  const file = reportFile(S.week)
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  try { require('./owner-only.cjs').ensure(path.dirname(file)) } catch { /* not Windows */ }
  require('./store.cjs').writeAtomic(file, report(S))
  return file
}

/** What the dashboard and the CLI feed savings(): tasks, prices, pay model, unpriced models. */
function forState(state, extra) {
  const B = require('./build-agent-dashboard.cjs')
  const o = Object.assign({ tasks: require('./tasks.cjs').listTasks() }, extra)
  try { o.pricesSet = state.prices && state.prices.set !== undefined ? state.prices.set : B.pricesSet(B.readPrices()) } catch { /* default: set */ }
  try { o.unpricedModels = require('./prices.cjs').unpriced(state) } catch { o.unpricedModels = [] }
  try { const C = require('./agent-company.cjs'); const co = C.readCompany(); if (co.configured && co.company && co.company.payModel === 'plan') o.payModel = 'plan' } catch { /* no company */ }
  return savings(state, o)
}

let checked = ''
/** The running server's once-per-ISO-week write of last week's report (only when that week had runs). */
function weeklyOnce(state, now) {
  now = now || Date.now()
  const week = lastWeek(now)
  if (checked === week) return null
  checked = week
  if (fs.existsSync(reportFile(week))) return null
  const S = forState(state, { week, now })
  return S.measured.runs ? writeReport(S) : null
}

function run(args, say) {
  const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined }
  try {
    const B = require('./build-agent-dashboard.cjs')
    const S = forState(B.collect(), { week: val('--week') })
    if (args.includes('--write')) { const f = writeReport(S); say(args.includes('--json') ? JSON.stringify({ file: f }) : 'wrote ' + f); return 0 }
    say(args.includes('--json') ? JSON.stringify(S, null, 2) : report(S))
    return 0
  } catch (e) { console.error(e.message); return 1 }
}

// ---------- the page (never run in Node: its source is written into the page, like versionRunView)
const SAV_STYLE = `
.sv{overflow:auto;flex:1;min-height:0;display:grid;gap:14px;align-content:start;padding-bottom:20px}@supports not selector(::-webkit-scrollbar){.sv{scrollbar-width:thin}}
.sv .v-card{min-width:0;padding-bottom:4px}
.sv .v-card>h3{margin:0;padding:7px 12px;font:700 11px var(--font-ui);display:flex;justify-content:space-between;gap:10px}
.sv .pad{padding:10px 14px;margin:0}
.sv .dim{color:var(--ink-dim)}
.sv .est{color:var(--ink-dim);font-size:.85em;margin-left:5px}
.sv table{width:100%;border-collapse:collapse}
.sv th{text-align:left;font-weight:400;color:var(--ink-dim);font-size:12px;padding:5px 12px}
.sv td{padding:7px 12px;vertical-align:top}
.sv td.n{text-align:right;font-variant-numeric:tabular-nums}
.sv .why{padding:0 14px 10px;color:var(--ink-soft);font-size:13px}
.sv .why p{margin:4px 0}
.sv .btn{font:600 13px var(--font-ui);color:var(--ink);background:var(--panel);border:1px solid var(--line);border-radius:999px;padding:5px 14px;cursor:pointer}
.sv .btn:hover{border-color:var(--accent)}
.sv .notice{padding:10px 14px;margin:0;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.sv .warn{color:var(--warn)}
.sv .kpis{margin:0;grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}
.sv .kpi dd{white-space:normal}
.sv th.n{text-align:right}
.sv .kpi dd small{display:block;margin:2px 0 0}
@media (max-width:640px){
  .sv table,.sv tbody,.sv tr,.sv td{display:block;width:100%}
  .sv thead{display:none}
  .sv tr{border-top:1px solid var(--line);padding:6px 0}
  .sv tr:first-child{border-top:0}
  .sv td{display:flex;justify-content:space-between;gap:12px;padding:3px 14px;text-align:right}
  .sv td::before{content:attr(data-l);color:var(--ink-dim);text-align:left;flex:none}
  .sv .kpis{grid-template-columns:1fr}
}
`

function savingsView(h) {
  const { esc, T } = h
  const st = { data: null, error: false, at: 0, busy: false, open: {}, folded: false, msg: '' }
  function fetchIt() {
    if (!h.live() || st.busy) return
    st.busy = true
    fetch('api/savings', { cache: 'no-store', credentials: 'same-origin' })
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json() })
      .then((d) => { st.data = d; st.error = false }, () => { st.error = true })
      .then(() => { st.busy = false; if (h.shown()) h.redraw() })
  }
  const watch = () => { if (Date.now() - st.at > 3000) { st.at = Date.now(); fetchIt() } }
  const key = (s) => s.rule + '|' + s.agent
  const money = (x) => (x == null ? 'n/a' : '$' + (x < 1 ? x.toFixed(4) : x.toFixed(2)))

  function measured(S) {
    const m = S.measured
    const src = m.costSource.length ? '<small>' + esc(m.costSource.map((x) => (x === 'estimated' ? 'est.' : x)).join(', ')) + '</small>' : ''
    const paren = /^(.*?)( \(.*\))$/.exec(m.costLabel)
    const cost = esc(paren ? paren[1] : m.costLabel) + (m.costSource.includes('estimated') && (m.usdStatus === 'ok' || m.usdStatus === 'partial') ? '<span class="est">(est.)</span>' : '')
    return '<dl class="kpis">' +
      '<div class="kpi m"><dt>' + T('Spend this week') + '</dt><dd>' + cost + (paren ? '<small>' + esc(paren[2].trim().slice(1, -1)) + '</small>' : '') + src + '</dd></div>' +
      '<div class="kpi"><dt>' + T('Runs') + '</dt><dd>' + m.runs + '</dd></div>' +
      '<div class="kpi"><dt>' + T('Measured') + '</dt><dd>' + m.measured + ' ' + T('of') + ' ' + m.runs + '<small>' + T('priced') + ' ' + m.priced + ' ' + T('of') + ' ' + m.measured + '</small></dd></div>' +
      '<div class="kpi"><dt>' + T('Cache-read share') + '</dt><dd>' + (m.cacheShare === null ? T('not recorded') : m.cacheShare + ' %') + '</dd></div></dl>'
  }
  function notices(S) {
    const m = S.measured
    let html = ''
    if (!S.pricesSet) html += '<div class="v-card"><p class="notice"><b>' + T('Prices are not set') + '</b>' + (h.live() ? '<button type="button" class="btn" data-sav-prices="1">' + T('Use list prices (Anthropic, fetched') + ' ' + esc(S.pricesFetched || '') + ')' + '</button>' : '') + '</p></div>'
    if (m.usdStatus === 'partial' && m.unpricedModels.length) html += '<div class="v-card"><p class="notice dim">' + T('Unpriced models') + ': ' + m.unpricedModels.map(esc).join(', ') + '</p></div>'
    if (!m.measured) html += '<div class="v-card"><p class="notice dim">' + T('Report usage with your assistant or allow a transcript folder (Settings) so runs can be measured.') + '</p></div>'
    if (st.msg) html += '<div class="v-card"><p class="notice warn" role="status">' + esc(st.msg) + '</p></div>'
    return html
  }
  function perDone(S) {
    const p = S.perDone
    const row = (label, a) => '<tr><td data-l="' + T('Period') + '">' + esc(label) + '</td><td class="n" data-l="' + T('Done tasks') + '">' + a.tasks + '</td><td class="n" data-l="' + T('Per task') + '">' + money(a.perTask) + '</td><td class="n" data-l="' + T('Per weight-point') + '">' + money(a.perWeight) + '</td></tr>'
    const chg = p.change && p.change.perTask != null ? '<p class="pad">' + T('Change per task') + ': <b>' + (p.change.perTask > 0 ? '+' : '') + p.change.perTask + ' %</b></p>' : '<p class="pad dim">' + T('too few done tasks to compare') + '</p>'
    return '<section class="v-card"><h3>' + T('Cost per done task') + '</h3><table><thead><tr><th>' + T('Period') + '</th><th class="n">' + T('Done tasks') + '</th><th class="n">' + T('Per task') + '</th><th class="n">' + T('Per weight-point') + '</th></tr></thead><tbody>' +
      row(T('This week'), p.current) + (p.baseline ? row(T('Baseline') + ' ' + p.baselineFrom, p.baseline) : '') + '</tbody></table>' + chg + '</section>'
  }
  function sugRow(s, S) {
    const k = key(s)
    const adopted = S.adoptedKeys.includes(k)
    return '<tr><td data-l="' + T('Suggestion') + '"><b>' + esc(s.label) + '</b><br><span class="dim">' + esc(s.from) + ' &rarr; ' + esc(s.to) + '</span></td>' +
      '<td class="n" data-l="' + T('Saving') + '">' + esc(s.saving) + (s.pct ? '<span class="est">' + esc(s.pct) + '</span>' : '') + '</td>' +
      '<td class="n" data-l=""><button type="button" class="btn" data-sav-why="' + esc(k) + '" aria-expanded="' + !!st.open[k] + '">' + T('Why?') + '</button> ' +
      (h.live() && s.kind === 'saving' ? '<button type="button" class="btn" data-sav-adopt="' + esc(k) + '" aria-pressed="' + adopted + '">' + (adopted ? T('Adopted') : T('Mark adopted')) + '</button>' : '') + '</td></tr>' +
      (st.open[k] ? '<tr><td colspan="3" class="why"><p>' + esc(s.method) + '</p><p>' + esc(s.atbRows) + '</p><p>' + esc(s.lite) + '</p></td></tr>' : '')
  }
  function suggestions(S) {
    const all = S.suggestions.concat(S.warnings)
    if (!all.length) return '<section class="v-card"><h3>' + T('Suggestions') + '</h3><p class="pad dim">' + T('No suggestions this week') + '. ' + T('Rules checked') + ': ' + S.rulesChecked.join(', ') + '.</p></section>'
    const top = all.slice(0, 3), rest = all.slice(3)
    return '<section class="v-card"><h3>' + T('Suggestions') + '<span class="dim">est. ' + T('from ATB-1, a lite benchmark') + '</span></h3><table><tbody>' + top.map((s) => sugRow(s, S)).join('') + '</tbody></table>' +
      (rest.length ? '<p class="pad"><button type="button" class="btn" data-sav-fold="1" aria-expanded="' + st.folded + '">' + (st.folded ? T('Hide the rest') : T('Show the rest') + ' (' + rest.length + ')') + '</button></p>' + (st.folded ? '<table><tbody>' + rest.map((s) => sugRow(s, S)).join('') + '</tbody></table>' : '') : '') + '</section>'
  }
  function adopted(S) {
    if (!S.adopted.length) return ''
    return '<section class="v-card"><h3>' + T('Adopted') + '</h3><table><tbody>' + S.adopted.map((a) => '<tr><td data-l="' + T('Suggestion') + '"><b>' + esc(a.agent) + '</b> ' + esc(a.rule) + '<br><span class="dim">' + esc(a.date.slice(0, 10)) + '</span></td><td class="n" data-l="' + T('Effect') + '">' +
      (a.effect.status === 'measuring' ? T('measuring') + ' (' + a.effect.runsAfter + '/' + a.effect.needed + ')' : money(a.effect.before) + ' &rarr; ' + money(a.effect.after) + ' ' + T('per weight-point')) + '</td></tr>').join('') + '</tbody></table></section>'
  }
  function render() {
    watch()
    const head = '<div class="fbar"><h2>' + T('Savings') + '</h2></div>'
    const S = st.data
    if (!S) return head + '<div class="sv"><div class="v-card"><p class="pad dim">' + (st.error || !h.live() ? T('Savings need the running dashboard.') : T('Loading…')) + '</p></div></div>'
    if (S.empty) return head + '<div class="sv"><div class="v-card"><p class="pad">' + T('No runs logged yet. Savings start with your first logged runs.') + ' <a href="#" data-view="set">' + T('Settings') + ' &gt; ' + T('Connect your assistant') + '</a></p></div></div>'
    return head + '<div class="sv" id="sv">' + notices(S) + measured(S) + perDone(S) + suggestions(S) + adopted(S) + '</div>'
  }
  async function act(url, body) {
    try { await h.post(url, body); st.msg = '' } catch (e) { st.msg = String(e.message || e) }
    st.at = 0
    fetchIt()
  }
  document.addEventListener('click', (e) => {
    const t = e.target.closest && e.target.closest('[data-sav-why],[data-sav-fold],[data-sav-adopt],[data-sav-prices]')
    if (!t) return
    const d = t.dataset
    if (d.savWhy) st.open[d.savWhy] = !st.open[d.savWhy]
    else if (d.savFold) st.folded = !st.folded
    else if (d.savAdopt) {
      const i = d.savAdopt.indexOf('|')
      act('api/savings-adopt', { rule: d.savAdopt.slice(0, i), agent: d.savAdopt.slice(i + 1), adopted: t.getAttribute('aria-pressed') !== 'true' })
      return
    } else if (d.savPrices) { act('api/prices-init', { merge: true }); return }
    h.redraw()
  })
  return { render, st, fetchIt }
}

module.exports = { savings, suggest, adopt, readAdopted, report, writeReport, weeklyOnce, forState, run, localWeek, lastWeek, weekStart, RULES, SAV_STYLE, savingsView, NEVER_DOWN }
