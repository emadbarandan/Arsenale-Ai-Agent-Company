/* The company around the agents: offices, projects, employees and budgets.
 *
 * Everything lives in <ARSENALE_HOME>/company/ (paths.cjs), next to
 * agent-runs/ and never inside a repo:
 *   company.json        name, mission, the company budget, budgetsEnabled
 *   offices.json        [{ id, name, nameFa, leadEmployeeId, profile, theme, order, budget, archived }]
 *   projects.json       [{ id, name, nameFa, key, aliases[], officeId, status, budget, … }]
 *   employees.json      { <agent name>: { title, homeOfficeId, zone, reportsTo, budget, status, aliases[],
 *                         and since 1.0, all optional: name, skills[], look } }
 *   activity.jsonl      one line per write made through the CLI or the dashboard
 *   inbox.jsonl         what the Board changed on the dashboard, for the supervisor
 *                       (log-agent-run.cjs --inbox; inbox.read.json is the pointer)
 *   budget-incidents.jsonl  each budget threshold crossed, once per scope and month
 *   heartbeat.json      when the supervisor was last seen
 *
 * No folder means "no company": the dashboard is the single office it always
 * was, so deleting the folder is the way back.
 *
 * Run records are never rewritten. Which project, office and employee a run
 * belongs to, and what it cost, is worked out on every read (resolver() and
 * costEvents() below); the files in agent-runs/ stay exactly as they were.
 *
 * Budgets are counted in tokens (input + cache writes + output, the dashboard's
 * tokTotal; cache reads excluded) and in USD from tools/model-prices.json. A
 * USD figure that needs a price nobody typed in is "n/a", never 0.
 *
 * The supervisor's own chat tokens are not visible to any of this: only runs
 * logged with log-agent-run.cjs are counted.
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { projectKey, modelKey, writeAtomic } = require('./build-agent-dashboard.cjs')
const { homeDesks } = require('./agent-office-page.cjs')
const P = require('./paths.cjs')

const COMPANY = P.COMPANY
// ids come from files and requests: only own keys count, so "constructor" or
// "__proto__" never finds something an object inherited
const own = (o, k) => (o && Object.hasOwn(o, k) ? o[k] : undefined)
const knownAgents = () => new Set(P.agentFiles().keys())
const SCHEMA = 1
const UNASSIGNED = 'unassigned'
const CEO = 'supervisor'
const FILES = {
  company: 'company.json', offices: 'offices.json', projects: 'projects.json', employees: 'employees.json',
  activity: 'activity.jsonl', inbox: 'inbox.jsonl', inboxRead: 'inbox.read.json', incidents: 'budget-incidents.jsonl', heartbeat: 'heartbeat.json',
}
const fileOf = (k) => path.join(COMPANY, FILES[k])
// Accent tokens for offices. The owner picks a name, never a raw colour, so
// every office stays inside the dashboard's palette.
const THEMES = { teal: '#2FA98A', blue: '#4E8BD4', violet: '#8C78C8', coral: '#D9785A', amber: '#C9A63A', slate: '#8A97A6', cyan: '#4FB0BC', pink: '#D9739F', green: '#5FB878' }
// a title made up from an id: these words are acronyms, so "seo-specialist"
// reads "SEO specialist", never "Seo specialist"
const ACRONYMS = new Set(['seo', 'ui', 'ux', 'qa', 'hr', 'faq', 'api', 'ceo', 'cli', 'cfo', 'cto', 'pr', 'crm', 'csv', 'pdf', 'it', 'kpi', 'mcp', 'sql', 'ai'])
const titleFromId = (id) => String(id).split(/[-_]+/).filter(Boolean).map((w, i) => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : i ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())).join(' ')
const ZONES = ['build', 'review', 'docs', 'design', 'lead', 'guest']
const OFFICE_ID = /^[a-z][a-z0-9-]{1,30}$/
const AGENT_ID = /^[A-Za-z0-9][\w.-]{0,59}$/
const KEY = /^[A-Z][A-Z0-9]{1,5}$/
const MAX_TOKENS = 1e9
const MAX_USD = 1e5

function fail(code, message) { const e = new Error(message); e.code = code; return e }

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fallback }
}
function readLines(file) {
  let text = ''
  try { text = fs.readFileSync(file, 'utf8') } catch { return [] }
  return text.split('\n').filter((l) => l.trim()).map((l) => { try { return JSON.parse(l) } catch { return null } })
}
const clip = (s, n) => String(s == null ? '' : s).slice(0, n)

/** Names typed in two scripts and two keyboards still match: Arabic kaf and
 *  yeh, the zero-width non-joiner, and Persian or Arabic-Indic digits. */
function normName(s) {
  return String(s == null ? '' : s)
    .replace(/[ك]/g, 'ک').replace(/[يى]/g, 'ی').replace(/‌/g, '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .trim().toLowerCase()
}

/** Budgets are monthly, by the calendar month in this machine's time zone. */
function periodKey(when) {
  const d = when instanceof Date ? when : new Date(when)
  if (isNaN(d)) return ''
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
}

// ---------- budgets
/** A budget as stored, made safe to read. The spec's first draft had
 *  {unit, monthlyLimit, perRunWarn}; such a file is read as the same limit. */
function cleanBudget(b) {
  if (!b || typeof b !== 'object') return null
  const num = (v) => (typeof v === 'number' && isFinite(v) && v >= 0 ? v : null)
  let tokens = num(b.monthlyTokens), usd = num(b.monthlyUsd)
  if (b.monthlyTokens === undefined && b.monthlyUsd === undefined && b.monthlyLimit !== undefined) {
    if (b.unit === 'usd') usd = num(b.monthlyLimit); else tokens = num(b.monthlyLimit)
  }
  const soft = Number(b.softAlertPct)
  return {
    enabled: b.enabled !== false,
    period: 'monthly',
    monthlyTokens: tokens,
    monthlyUsd: usd,
    softAlertPct: soft >= 1 && soft <= 99 ? Math.round(soft) : 80,
    hardStop: !!b.hardStop,
  }
}

/** What the Board typed, checked strictly. Empty means "no limit"; 0 means
 *  "nothing may be spent". Throws a 400 with a sentence the form can show. */
function validateBudget(input) {
  if (input === null) return null
  if (!input || typeof input !== 'object') throw fail(400, 'budget must be an object')
  const limit = (v, max, cents, what) => {
    if (v === null || v === undefined || v === '') return null
    const n = typeof v === 'number' ? v : (/^\s*\d+(\.\d+)?\s*$/.test(String(v)) ? Number(v) : NaN)
    if (!isFinite(n) || n < 0) throw fail(400, what === 'tokens' ? 'Enter a whole number of tokens, for example 2000000' : 'Enter an amount in USD, for example 25.50')
    if (what === 'tokens' && !Number.isInteger(n)) throw fail(400, 'Enter a whole number of tokens, for example 2000000')
    if (cents && Math.round(n * 100) !== n * 100 && Math.abs(Math.round(n * 100) - n * 100) > 1e-6) throw fail(400, 'USD takes at most 2 decimals')
    if (n > max) throw fail(400, what === 'tokens' ? 'At most 1,000,000,000 tokens a month' : 'At most 100,000 USD a month')
    return n
  }
  const soft = input.softAlertPct === undefined || input.softAlertPct === '' ? 80 : Number(input.softAlertPct)
  if (!Number.isInteger(soft) || soft < 1 || soft > 99) throw fail(400, 'The alert threshold is a whole percentage from 1 to 99')
  return {
    enabled: input.enabled !== false,
    period: 'monthly',
    monthlyTokens: limit(input.monthlyTokens, MAX_TOKENS, false, 'tokens'),
    monthlyUsd: limit(input.monthlyUsd, MAX_USD, true, 'usd'),
    softAlertPct: soft,
    hardStop: !!input.hardStop,
  }
}

// ---------- reading the company
/** Everything in company/, checked. Never throws: a broken file is reported
 *  in `problems` and read as empty. */
function readCompany() {
  if (!fs.existsSync(COMPANY)) return { configured: false, readOnly: false, problems: [], offices: [], projects: [], employees: {}, company: null, heartbeat: null }
  const problems = []
  const raw = readJson(fileOf('company'), null)
  if (!raw) problems.push(FILES.company + ' is missing or unreadable')
  const company = Object.assign({
    schemaVersion: SCHEMA, id: 'co-main', name: 'My company', nameFa: '', mission: '', missionFa: '',
    issuePrefix: 'CO', ceoEmployeeId: CEO, defaultOfficeId: UNASSIGNED, budgetsEnabled: true, budget: null,
  }, raw || {})
  company.budget = cleanBudget(company.budget)
  company.budgetsEnabled = company.budgetsEnabled !== false
  const readOnly = Number(company.schemaVersion) > SCHEMA
  let offices = readJson(fileOf('offices'), null)
  if (!Array.isArray(offices)) { if (offices !== null || fs.existsSync(fileOf('offices'))) problems.push(FILES.offices + ' is not a list'); offices = [] }
  offices = offices.filter((o) => o && OFFICE_ID.test(String(o.id)) && o.id !== UNASSIGNED).map((o, i) => ({
    id: String(o.id), name: clip(o.name || o.id, 40), nameFa: clip(o.nameFa, 40), leadEmployeeId: clip(o.leadEmployeeId, 60),
    profile: clip(o.profile, 30), layout: 'standard', theme: Object.hasOwn(THEMES, o.theme) ? o.theme : 'slate',
    order: typeof o.order === 'number' ? o.order : i, budget: cleanBudget(o.budget), archived: !!o.archived, builtIn: false,
  })).sort((a, b) => a.order - b.order)
  // "unassigned" is never stored: it always exists and holds every project
  // that has no office
  offices.push({ id: UNASSIGNED, name: 'Unassigned work', nameFa: '', leadEmployeeId: '', profile: '', layout: 'standard', theme: 'slate', order: 1e9, budget: null, archived: false, builtIn: true })
  const officeIds = new Set(offices.map((o) => o.id))
  let projects = readJson(fileOf('projects'), null)
  if (!Array.isArray(projects)) { if (projects !== null) problems.push(FILES.projects + ' is not a list'); projects = [] }
  projects = projects.filter((p) => p && p.id).map((p) => {
    const officeId = officeIds.has(p.officeId) ? p.officeId : UNASSIGNED
    if (p.officeId && officeId !== p.officeId) problems.push('project ' + p.id + ' names an unknown office "' + p.officeId + '"')
    return {
      id: clip(p.id, 40), name: clip(p.name || p.id, 60), nameFa: clip(p.nameFa, 60), key: KEY.test(p.key) ? p.key : '',
      aliases: Array.isArray(p.aliases) ? p.aliases.map((a) => clip(a, 60)).filter(Boolean) : [], officeId,
      goalId: clip(p.goalId, 60), leadEmployeeId: clip(p.leadEmployeeId, 60), repoPath: clip(p.repoPath, 300),
      status: ['active', 'paused', 'done', 'archived'].includes(p.status) ? p.status : 'active', budget: cleanBudget(p.budget),
    }
  })
  let employees = readJson(fileOf('employees'), null)
  if (!employees || typeof employees !== 'object' || Array.isArray(employees)) { if (employees !== null) problems.push(FILES.employees + ' is not an object'); employees = {} }
  const heartbeat = readJson(fileOf('heartbeat'), null)
  return { configured: true, readOnly, problems, company, offices, projects, employees, heartbeat }
}

/** Defined agents, by name: only the frontmatter fields the company needs. */
function definedAgents(state) {
  return new Map((state && Array.isArray(state.agents) ? state.agents : []).map((a) => [a.name, a]))
}

/** Which project, office and employee a record belongs to. Order (spec R5):
 *  an explicit projectId, then the project id, then an alias; else
 *  unassigned. An explicit officeId on a new run overrides the project's. */
function resolver(co, agents) {
  const byName = new Map()
  for (const p of co.projects) {
    byName.set(normName(p.id), p)
    for (const a of p.aliases) if (!byName.has(normName(a))) byName.set(normName(a), p)
  }
  const ids = new Map(co.projects.map((p) => [p.id, p]))
  const offices = new Map(co.offices.map((o) => [o.id, o]))
  const aliasOwner = new Map()
  for (const [id, e] of Object.entries(co.employees)) {
    for (const a of Array.isArray(e && e.aliases) ? e.aliases : []) aliasOwner.set(String(a), id)
  }
  const project = (rec) => {
    if (rec.projectId && ids.has(rec.projectId)) return ids.get(rec.projectId)
    const raw = String(rec.project || '')
    for (const cand of [projectKey(raw), raw.replace(/\s*\(.*\)\s*$/, ''), raw]) {
      const hit = cand && byName.get(normName(cand))
      if (hit) return hit
    }
    return null
  }
  const office = (rec, p) => {
    if (rec.officeId && offices.has(rec.officeId)) return rec.officeId
    const proj = p === undefined ? project(rec) : p
    if (proj) return proj.officeId
    // no project and no office: the member's home office, then Unassigned
    const emp = rec.agent ? own(co.employees, employee(rec.agent)) : null
    const home = emp && emp.homeOfficeId
    return home && offices.has(home) && home !== UNASSIGNED ? home : UNASSIGNED
  }
  const employee = (agent) => {
    const name = String(agent || '')
    if (aliasOwner.has(name) && !agents.has(name)) return aliasOwner.get(name)
    return name
  }
  const kind = (id) => (id === CEO ? 'ceo' : agents.has(id) ? 'employee' : own(co.employees, id) ? 'retired' : 'contractor')
  return { project, office, employee, kind, offices, ids }
}

/** Adds projectId/officeId/employeeId to what the office page draws today:
 *  the active runs, today's runs and the gates. In memory only. */
function annotate(state, co) {
  co = co || readCompany()
  if (!co.configured) return state
  const R = resolver(co, definedAgents(state))
  const d0 = new Date(); d0.setHours(0, 0, 0, 0)
  const tag = (r) => {
    const p = R.project(r)
    r.projectId = p ? p.id : ''
    r.officeId = R.office(r, p)
    r.employeeId = R.employee(r.agent)
  }
  for (const a of state.active || []) tag(a)
  for (const r of state.runs || []) if (Date.parse(r.finishedAt) >= d0.getTime()) tag(r)
  const runs = new Map()
  for (const r of (state.runs || []).concat(state.active || [])) if (r.id) runs.set(r.id, r)
  for (const g of state.gates || []) {
    const p = R.project(g)
    g.projectId = p ? p.id : ''
    // a gate about a run sits in that run's office when it names none itself
    const run = g.run && runs.get(g.run)
    g.officeId = g.officeId && R.offices.has(g.officeId) ? g.officeId : p ? p.officeId : run ? R.office(run) : UNASSIGNED
  }
  return state
}

// ---------- spending
/** One cost event per finished run and per active run, derived from the run
 *  records (Paperclip's cost_events). Old records without token data count
 *  as "unmeasured", never as free. */
function costEvents(state, co, R) {
  R = R || resolver(co, definedAgents(state))
  const now = new Date()
  const out = []
  const push = (r, live) => {
    const p = R.project(r)
    const tr = r.transcript && r.transcript.found ? r.transcript : null
    // tokens on the heavy tier (config.json "heavyModels", default Opus)
    const heavy = (m) => (state.heavy || ['Opus']).some((p) => p && String(m || '').toLowerCase().startsWith(String(p).toLowerCase()))
    let opus = 0
    if (tr && tr.models) {
      for (const [m, t] of Object.entries(tr.models)) {
        if (heavy(m)) opus += (t.input || 0) + (t.output || 0) + (t.cacheWrite5m || 0) + (t.cacheWrite1h || 0)
      }
    } else if (heavy(r.modelKey)) opus = Number(r.tokTotal) || 0
    out.push({
      id: r.id || r.finishedAt + '|' + r.agent, live,
      occurredAt: live ? now.toISOString() : r.finishedAt,
      periodKey: periodKey(live ? now : r.finishedAt),
      employeeId: R.employee(r.agent), agent: r.agent,
      projectId: p ? p.id : '', officeId: R.office(r, p),
      model: r.modelKey || '',
      tokens: Number(r.tokTotal) || 0, tokSrc: r.tokSrc || '', opusTokens: opus,
      usd: typeof r.costUsd === 'number' ? r.costUsd : null,
      cacheReadTokens: tr && tr.tokens ? tr.tokens.cacheRead || 0 : 0,
    })
  }
  for (const r of state.runs || []) push(r, false)
  for (const a of state.active || []) push(a, true)
  return out
}

/** Totals over some cost events. `usdStatus` says how far the USD sum can be
 *  trusted: ok (every measured run priced), partial, na (none priced), none
 *  (nothing measured, so 0 is a real 0). */
function spendOf(events) {
  const s = { runs: 0, measured: 0, unmeasured: 0, live: 0, tokens: 0, opusTokens: 0, usd: 0, usdRuns: 0, usdMissing: 0, usdStatus: 'none' }
  for (const e of events) {
    s.runs++
    if (e.live) s.live++
    if (!e.tokSrc) { s.unmeasured++; continue }
    s.measured++
    s.tokens += e.tokens
    s.opusTokens += e.opusTokens
    if (e.usd === null) s.usdMissing++
    else { s.usd += e.usd; s.usdRuns++ }
  }
  s.usd = Math.round(s.usd * 10000) / 10000
  s.usdStatus = !s.measured ? 'none' : !s.usdRuns ? 'na' : s.usdMissing ? 'partial' : 'ok'
  return s
}

/** Where one scope stands against its budget this month.
 *  level: none (no budget) | off (switched off) | ok | soft (alert) |
 *  over (100 % or more, no hard stop) | stop (100 % or more, hard stop). */
function evalBudget(budget, spend, masterOn) {
  const b = budget
  const out = { set: !!b, enabled: !!(b && b.enabled), on: false, level: 'none', pct: null, softAlertPct: b ? b.softAlertPct : 80, hardStop: !!(b && b.hardStop), tokens: null, usd: null }
  if (!b || (b.monthlyTokens === null && b.monthlyUsd === null)) return out
  if (!masterOn || !b.enabled) { out.level = 'off'; return out }
  out.on = true
  // a limit of 0 means nothing may be spent: it is reached before the first token
  const pctOf = (used, limit) => (limit === 0 ? (used > 0 ? 999 : 100) : used / limit * 100)
  const pcts = []
  if (b.monthlyTokens !== null) {
    const pct = pctOf(spend.tokens, b.monthlyTokens)
    out.tokens = { limit: b.monthlyTokens, used: spend.tokens, pct }
    pcts.push(pct)
  }
  if (b.monthlyUsd !== null) {
    if (spend.usdStatus === 'na') out.usd = { limit: b.monthlyUsd, used: null, pct: null, status: 'na' }
    else {
      // a partial sum is a lower bound: it can prove a limit was passed, never that it was not
      const pct = pctOf(spend.usd, b.monthlyUsd)
      out.usd = { limit: b.monthlyUsd, used: spend.usd, pct, status: spend.usdStatus }
      pcts.push(pct)
    }
  }
  out.pct = pcts.length ? Math.max(...pcts) : null
  out.level = out.pct === null ? 'ok' : out.pct >= 100 ? (b.hardStop ? 'stop' : 'over') : out.pct >= b.softAlertPct ? 'soft' : 'ok'
  return out
}

/** Spending and budget standing for the company, every office and every
 *  employee, for one month (default: this one). */
function standings(state, co, period) {
  const R = resolver(co, definedAgents(state))
  const key = period || periodKey(new Date())
  const events = costEvents(state, co, R).filter((e) => e.periodKey === key)
  const master = co.company ? co.company.budgetsEnabled !== false : true
  const group = (field) => { const m = new Map(); for (const e of events) { const k = e[field]; if (!m.has(k)) m.set(k, []); m.get(k).push(e) } return m }
  const byOffice = group('officeId'), byEmployee = group('employeeId'), byProject = group('projectId')
  const company = { spend: spendOf(events) }
  company.budget = evalBudget(co.company && co.company.budget, company.spend, master)
  const offices = {}
  for (const o of co.offices) {
    const sp = spendOf(byOffice.get(o.id) || [])
    offices[o.id] = { spend: sp, budget: evalBudget(o.budget, sp, master) }
  }
  const projects = {}
  for (const p of co.projects) projects[p.id] = { spend: spendOf(byProject.get(p.id) || []) }
  const employees = {}
  const ids = new Set([...Object.keys(co.employees), ...byEmployee.keys()])
  for (const id of ids) {
    const sp = spendOf(byEmployee.get(id) || [])
    const ov = own(co.employees, id) || {}
    employees[id] = { spend: sp, budget: evalBudget(cleanBudget(ov.budget), sp, master) }
  }
  // project names in this month's runs that no project claims: the Board maps them
  const unmapped = {}
  for (const r of (state.runs || []).concat(state.active || [])) {
    if (periodKey(r.finishedAt || new Date()) !== key) continue
    const k = projectKey(r.project)
    if (k && !R.project(r)) unmapped[k] = (unmapped[k] || 0) + 1
  }
  return { periodKey: key, masterOn: master, company, offices, projects, employees, unmapped, R, events }
}

/** The supervisor's one-line check before it starts an agent (spec R14).
 *  Read-only. stop: over a hard limit, the employee or project paused, or the
 *  office archived. With budgets off only the pauses still stop a run. */
function budgetCheck(state, input, co) {
  co = co || readCompany()
  if (!co.configured) return { level: 'ok', lines: ['ok (no company configured)'] }
  const st = standings(state, co)
  const R = st.R
  const rec = { agent: String(input.agent || ''), project: input.project || '', projectId: input.projectId || '', officeId: input.officeId || '' }
  const emp = R.employee(rec.agent)
  const proj = R.project(rec)
  const officeId = R.office(rec, proj)
  const office = R.offices.get(officeId)
  const lines = []
  let level = 'ok'
  const raise = (l) => { if (l === 'stop' || (l === 'warn' && level === 'ok')) level = l }
  const fmtUse = (b) => {
    const parts = []
    if (b.tokens) parts.push(Math.round(b.tokens.used) + '/' + b.tokens.limit)
    if (b.usd && b.usd.status !== 'na') parts.push('$' + b.usd.used.toFixed(2) + '/$' + b.usd.limit.toFixed(2) + (b.usd.status === 'partial' ? ' (partial)' : ''))
    return parts.join(' ')
  }
  const ov = own(co.employees, emp) || {}
  if (ov.status === 'paused') { raise('stop'); lines.push('stop employee:' + emp + ' paused' + (ov.pauseReason ? ' (' + clip(ov.pauseReason, 80) + ')' : '')) }
  if (proj && proj.status === 'paused') { raise('stop'); lines.push('stop project:' + proj.id + ' paused') }
  if (office && office.archived) { raise('stop'); lines.push('stop office:' + office.id + ' archived') }
  const scopes = [['company', co.company.id, st.company.budget], ['office', officeId, (st.offices[officeId] || {}).budget], ['employee', emp, (st.employees[emp] || {}).budget]]
  for (const [scope, id, b] of scopes) {
    if (!b || !b.on) continue
    if (b.usd && b.usd.status === 'na') lines.push('note ' + scope + ':' + id + ' USD n/a (model prices not set)')
    if (b.level === 'stop') { raise('stop'); lines.push('stop ' + scope + ':' + id + ' ' + fmtUse(b)) }
    else if (b.level === 'over' || b.level === 'soft') { raise('warn'); lines.push('warn ' + scope + ':' + id + ' ' + fmtUse(b)) }
  }
  if (!st.masterOn) lines.push('note budgets are switched off')
  if (!lines.some((l) => /^(stop|warn)/.test(l))) lines.unshift('ok')
  return { level, lines, employeeId: emp, officeId, projectId: proj ? proj.id : '' }
}

// ---------- the org chart
/** reportsTo, filled in where the overlay leaves it out: an office head
 *  reports to the CEO, everyone else to the head of their home office. */
function bossOf(id, co) {
  if (id === CEO) return 'board'
  const e = own(co.employees, id) || {}
  if (e.reportsTo) return String(e.reportsTo)
  const office = co.offices.find((o) => o.id === homeOf(id, co))
  const head = office && office.leadEmployeeId
  return head && head !== id ? head : CEO
}
function homeOf(id, co) {
  const e = own(co.employees, id) || {}
  if (e.homeOfficeId && co.offices.some((o) => o.id === e.homeOfficeId)) return e.homeOfficeId
  const led = co.offices.find((o) => o.leadEmployeeId === id)
  if (led) return led.id
  const first = co.offices.find((o) => !o.builtIn)
  return first ? first.id : UNASSIGNED
}
/** The chain that a new reportsTo would close into a loop, or null. */
function cycleIf(co, id, boss) {
  const chain = [id]
  let cur = boss
  for (let i = 0; i < 100 && cur && cur !== 'board'; i++) {
    chain.push(cur)
    if (cur === id) return chain
    cur = bossOf(cur, co)
  }
  return null
}

/** What the page and api/company show. Plain data, safe to serialise. */
function companyState(state) {
  let co
  try { co = readCompany() } catch (e) { return { configured: false, error: e.message } }
  if (!co.configured) return { configured: false }
  const st = standings(state, co)
  const agents = definedAgents(state)
  const zoneGuess = homeDesks(state && Array.isArray(state.agents) ? state.agents : []).zones
  const ids = new Set([CEO, ...agents.keys(), ...Object.keys(co.employees)])
  const runsBy = new Map()
  for (const e of st.events) if (e.periodKey === st.periodKey) runsBy.set(e.employeeId, (runsBy.get(e.employeeId) || 0) + 1)
  const employees = []
  for (const id of ids) {
    const kind = st.R.kind(id)
    const def = agents.get(id) || {}
    const ov = own(co.employees, id) || {}
    const guess = own(zoneGuess, id)
    const zone = ZONES.includes(ov.zone) ? ov.zone : co.offices.some((o) => o.leadEmployeeId === id) ? 'lead' : ZONES.includes(guess) ? guess : 'guest'
    employees.push({
      id, kind,
      // no title typed: "code-reviewer" reads as "Code reviewer", "seo-specialist" as "SEO specialist"
      title: clip(ov.title || (kind === 'ceo' ? 'Supervisor · CEO' : titleFromId(id)), 60), titleFa: clip(ov.titleFa || def.titleFa || '', 60),
      // 1.0: a person's name, what they are good at and the look they picked; all optional
      name: clip(ov.name, 60), skills: Array.isArray(ov.skills) ? ov.skills.slice(0, 8).map((x) => clip(x, 40)).filter(Boolean) : [], look: Number.isInteger(ov.look) && ov.look >= 0 && ov.look < 6 ? ov.look : 0,
      homeOfficeId: homeOf(id, co), zone, reportsTo: bossOf(id, co),
      status: ov.status === 'paused' ? 'paused' : ov.status === 'retired' ? 'retired' : 'active', pauseReason: clip(ov.pauseReason, 200),
      tier: ['light', 'standard', 'heavy'].includes(ov.tier) ? ov.tier : '', managed: !!ov.managed, createdBy: clip(ov.createdBy, 80),
      model: modelKey(def.model), effort: def.effort || '', color: def.color || '', aliases: Array.isArray(ov.aliases) ? ov.aliases.slice(0, 20) : [],
      budget: cleanBudget(ov.budget), standing: st.employees[id] || { spend: spendOf([]), budget: evalBudget(null) }, runsThisPeriod: runsBy.get(id) || 0,
    })
  }
  // agent names seen this month with no definition and no owner: contractors
  for (const [id, n] of runsBy) {
    if (ids.has(id)) continue
    employees.push({ id, kind: 'contractor', title: '', titleFa: '', homeOfficeId: '', zone: 'guest', reportsTo: '', status: 'active', pauseReason: '', model: '', effort: '', color: '', aliases: [], budget: null, standing: st.employees[id], runsThisPeriod: n })
  }
  employees.sort((a, b) => a.id.localeCompare(b.id))
  const hb = co.heartbeat && co.heartbeat.supervisor ? co.heartbeat.supervisor : null
  return {
    configured: true, readOnly: co.readOnly, schemaVersion: Number(co.company.schemaVersion) || SCHEMA, problems: co.problems,
    company: {
      id: co.company.id, name: clip(co.company.name, 80), nameFa: clip(co.company.nameFa, 80), mission: clip(co.company.mission, 1000), missionFa: clip(co.company.missionFa, 1000),
      issuePrefix: co.company.issuePrefix, ceoEmployeeId: co.company.ceoEmployeeId || CEO, budgetsEnabled: co.company.budgetsEnabled, budget: co.company.budget,
      // how the owner pays for the assistant decides how money is shown (spec Q10); unknown before 1.0
      payModel: ['plan', 'api', 'unknown'].includes(co.company.payModel) ? co.company.payModel : 'unknown',
      assistants: Array.isArray(co.company.assistants) ? co.company.assistants.slice(0, 12).map((a) => clip(a, 30)) : [],
    },
    themes: THEMES,
    offices: co.offices.map((o) => Object.assign({}, o, { color: THEMES[o.theme], standing: st.offices[o.id] })),
    projects: co.projects.map((p) => ({ id: p.id, name: p.name, nameFa: p.nameFa, key: p.key, officeId: p.officeId, status: p.status, aliases: p.aliases, standing: st.projects[p.id] })),
    employees,
    periodKey: st.periodKey,
    standing: st.company,
    unmapped: st.unmapped,
    heartbeat: hb ? { lastSeenAt: hb.lastSeenAt || '', session: clip(hb.session, 60) } : null,
    // the newest company log lines for the Activity screen (heartbeats are noise there)
    activity: readLines(fileOf('activity')).filter((l) => l && l.action !== 'heartbeat').slice(-300).map((l) => ({ at: String(l.at || ''), actor: clip(l.actor, 60), action: clip(l.action, 40), entityType: clip(l.entityType, 20), entityId: clip(l.entityId, 60), officeId: clip(l.officeId, 40), summary: clip(l.summary, 200), via: clip(l.via, 20) })),
    pricesSet: !!(state.prices && state.prices.set),
  }
}

// ---------- writes (only fixed files under company/)
function needCompany(forWrite) {
  const co = readCompany()
  if (!co.configured) throw fail(409, 'no company configured: run arsenale log --company-init first')
  if (forWrite && co.readOnly) throw fail(409, 'Company data was written by a newer dashboard (v' + co.company.schemaVersion + '). Editing is disabled.')
  return co
}
function append(kind, line) {
  fs.appendFileSync(fileOf(kind), JSON.stringify(line) + '\n')
}
function activity(line) {
  append('activity', Object.assign({ at: new Date().toISOString() }, line, { summary: clip(line.summary, 200) }))
}
/** A Board change made on the dashboard is also a request the supervisor
 *  reads at its next turn (--inbox), like an answer to a gate. */
function inbox(line) {
  append('inbox', Object.assign({ at: new Date().toISOString(), by: 'board', via: 'dashboard' }, line, { summary: clip(line.summary, 300) }))
}
/** An inbox line from any Board door (dashboard, phone). */
function inboxLine(line, via) {
  inbox(Object.assign({}, line, { via: via || 'dashboard' }))
}
const BOARD_ONLY = 'only the Board may change budgets, pauses and the org chart: pass "by":"board" when the owner asked for it'
function checkBy(by) {
  if (String(by || '') !== 'board') throw fail(403, BOARD_ONLY)
}
const fmtBudget = (b) => !b ? 'no budget' : (b.enabled ? '' : 'off · ') + [b.monthlyTokens !== null ? b.monthlyTokens + ' tokens' : '', b.monthlyUsd !== null ? '$' + b.monthlyUsd : ''].filter(Boolean).join(' + ') + '/month' + (b.hardStop ? ', hard stop' : '') + ', alert at ' + b.softAlertPct + '%'

/** Sets the budget of the company, an office or an employee. `budget: null`
 *  removes it (no limit). */
function setBudget(input, via) {
  checkBy(input.by)
  const co = needCompany(true)
  const scope = String(input.scope || '')
  const id = String(input.id == null ? '' : input.id)
  const budget = validateBudget(input.budget === undefined ? {} : input.budget)
  let summary
  if (scope === 'company') {
    const c = readJson(fileOf('company'), {})
    c.budget = budget; c.updatedAt = new Date().toISOString()
    writeAtomic(fileOf('company'), JSON.stringify(c, null, 2))
    summary = 'company budget: ' + fmtBudget(budget)
  } else if (scope === 'office') {
    if (!OFFICE_ID.test(id)) throw fail(400, 'bad office id')
    if (id === UNASSIGNED) throw fail(400, 'the unassigned office has no budget of its own')
    const list = readJson(fileOf('offices'), [])
    const o = Array.isArray(list) && list.find((x) => x && x.id === id)
    if (!o) throw fail(404, 'no such office: ' + id)
    o.budget = budget
    writeAtomic(fileOf('offices'), JSON.stringify(list, null, 2))
    summary = 'office ' + id + ' budget: ' + fmtBudget(budget)
  } else if (scope === 'employee') {
    if (!AGENT_ID.test(id) || id.replace(/[^\w.-]/g, '') !== id) throw fail(400, 'bad employee id')
    if (id === CEO) throw fail(400, 'the supervisor has no budget of its own: its chat tokens are not visible here')
    const all = readJson(fileOf('employees'), {})
    if (!own(all, id) && !knownAgents().has(id)) throw fail(404, 'no such employee: ' + id)
    all[id] = Object.assign({}, own(all, id), { budget })
    writeAtomic(fileOf('employees'), JSON.stringify(all, null, 2))
    summary = 'employee ' + id + ' budget: ' + fmtBudget(budget)
  } else throw fail(400, 'scope must be company, office or employee')
  void co
  activity({ actor: 'board', action: 'budget.set', entityType: scope, entityId: scope === 'company' ? 'company' : id, summary, via: via || 'cli' })
  if (via === 'dashboard') inbox({ type: 'budget.set', scope, id, budget, summary })
  return { scope, id, budget, summary }
}

/** The company-wide switch. Off: no alerts, no refusals, usage still shown. */
function setBudgetsEnabled(on, by, via) {
  checkBy(by)
  needCompany(true)
  const c = readJson(fileOf('company'), {})
  c.budgetsEnabled = !!on; c.updatedAt = new Date().toISOString()
  writeAtomic(fileOf('company'), JSON.stringify(c, null, 2))
  const summary = 'budgets switched ' + (on ? 'on' : 'off') + ' company-wide'
  activity({ actor: 'board', action: 'budget.set', entityType: 'company', entityId: 'company', summary, via: via || 'cli' })
  if (via === 'dashboard') inbox({ type: 'budgets.switch', scope: 'company', id: '', enabled: !!on, summary })
  return { budgetsEnabled: !!on, summary }
}

/** Overlay fields of one employee: title, home office, zone, reportsTo,
 *  pause. The definition file itself is never touched. */
function updateEmployee(input, via) {
  checkBy(input.by)
  const co = needCompany(true)
  const id = String(input.id || '')
  if (!AGENT_ID.test(id) || id.replace(/[^\w.-]/g, '') !== id) throw fail(400, 'bad employee id')
  const all = readJson(fileOf('employees'), {})
  const known = knownAgents()
  if (!own(all, id) && !known.has(id) && id !== CEO) throw fail(404, 'no such employee: ' + id)
  const e = Object.assign({}, own(all, id))
  const changed = []
  for (const k of ['title', 'titleFa', 'pauseReason', 'name']) if (input[k] !== undefined) { e[k] = clip(input[k], k === 'pauseReason' ? 200 : 60); changed.push(k) }
  if (input.skills !== undefined) {
    if (!Array.isArray(input.skills)) throw fail(400, 'skills must be a list')
    e.skills = input.skills.slice(0, 8).map((x) => clip(String(x).trim(), 40)).filter(Boolean); changed.push('skills')
  }
  if (input.look !== undefined) {
    if (!Number.isInteger(input.look) || input.look < 0 || input.look > 5) throw fail(400, 'look must be a whole number from 0 to 5')
    e.look = input.look; changed.push('look')
  }
  if (input.homeOfficeId !== undefined) {
    if (!co.offices.some((o) => o.id === input.homeOfficeId && !o.builtIn)) throw fail(400, 'no such office: ' + input.homeOfficeId)
    e.homeOfficeId = input.homeOfficeId; changed.push('homeOfficeId')
  }
  if (input.zone !== undefined) {
    if (!ZONES.includes(input.zone)) throw fail(400, 'zone must be one of ' + ZONES.join(', '))
    e.zone = input.zone; changed.push('zone')
  }
  if (input.status !== undefined) {
    if (!['active', 'paused'].includes(input.status)) throw fail(400, 'status must be active or paused')
    e.status = input.status; changed.push('status')
    if (input.status === 'active') e.pauseReason = ''
  }
  if (input.aliases !== undefined) {
    if (!Array.isArray(input.aliases)) throw fail(400, 'aliases must be a list')
    e.aliases = input.aliases.slice(0, 20).map((a) => clip(a, 60)).filter(Boolean); changed.push('aliases')
  }
  if (input.reportsTo !== undefined) {
    const boss = String(input.reportsTo)
    if (id === CEO && boss !== 'board') throw fail(400, 'the supervisor reports to the Board')
    if (boss !== 'board' && boss !== CEO && !own(all, boss) && !known.has(boss)) throw fail(404, 'no such employee: ' + boss)
    const loop = cycleIf(Object.assign({}, co, { employees: Object.assign({}, all, { [id]: Object.assign({}, e, { reportsTo: boss }) }) }), id, boss)
    if (loop) throw fail(409, 'would create a cycle: ' + loop.join(' → '))
    e.reportsTo = boss; changed.push('reportsTo')
  }
  if (!changed.length) throw fail(400, 'nothing to change')
  all[id] = e
  writeAtomic(fileOf('employees'), JSON.stringify(all, null, 2))
  const paused = changed.includes('status')
  const summary = id + ': ' + changed.map((k) => k + '=' + (Array.isArray(e[k]) ? e[k].join('|') : e[k])).join(', ')
  activity({ actor: 'board', action: paused ? 'employee.paused' : 'employee.updated', entityType: 'employee', entityId: id, summary, via: via || 'cli' })
  if (via === 'dashboard') inbox({ type: 'employee.updated', scope: 'employee', id, summary })
  return { id, employee: e, summary }
}

/** Adds an office to an existing company (an office pack installed after
 *  set-up, spec R-3.4). Board only. An archived office of the same id is
 *  brought back instead of duplicated. */
function addOffice(o, by, via) {
  checkBy(by)
  needCompany(true)
  if (!o || !OFFICE_ID.test(String(o.id)) || o.id === UNASSIGNED) throw fail(400, 'bad office id')
  const list = readJson(fileOf('offices'), [])
  const all = Array.isArray(list) ? list : []
  const old = all.find((x) => x && x.id === o.id)
  if (old) {
    if (!old.archived) return { id: o.id, created: false }
    old.archived = false
  } else {
    all.push({ id: o.id, name: clip(o.name || o.id, 40), nameFa: clip(o.nameFa, 40), leadEmployeeId: clip(o.leadEmployeeId, 60), profile: clip(o.profile, 30), layout: 'standard', theme: Object.hasOwn(THEMES, o.theme) ? o.theme : 'slate', order: all.length, budget: null, archived: false })
  }
  writeAtomic(fileOf('offices'), JSON.stringify(all, null, 2))
  activity({ actor: 'board', action: 'office.added', entityType: 'office', entityId: o.id, summary: 'office ' + o.id + (old ? ' brought back' : ' added'), via: via || 'cli' })
  return { id: o.id, created: !old }
}
/** Archives an office (never deletes it): its history stays. Board only. */
function archiveOffice(id, by, via) {
  checkBy(by)
  needCompany(true)
  const list = readJson(fileOf('offices'), [])
  const o = Array.isArray(list) && list.find((x) => x && x.id === id)
  if (!o) throw fail(404, 'no such office: ' + id)
  o.archived = true
  writeAtomic(fileOf('offices'), JSON.stringify(list, null, 2))
  activity({ actor: 'board', action: 'office.archived', entityType: 'office', entityId: id, summary: 'office ' + id + ' archived', via: via || 'cli' })
  return { id }
}
/** Sets overlay fields of one employee that only the hire form and packs
 *  write (tier, createdBy, managed, status retired). Board only. */
function writeOverlay(id, fields, by) {
  checkBy(by)
  needCompany(true)
  if (!AGENT_ID.test(id) || id.replace(/[^\w.-]/g, '') !== id) throw fail(400, 'bad employee id')
  const all = readJson(fileOf('employees'), {})
  all[id] = Object.assign({}, own(all, id), fields)
  writeAtomic(fileOf('employees'), JSON.stringify(all, null, 2))
  return all[id]
}

/** Budget thresholds crossed this month, logged once per scope, month and
 *  level (spec R12). Called after the CLI records a run; reads never write. */
function noteIncidents(state, co) {
  co = co || readCompany()
  if (!co.configured || co.readOnly) return []
  const st = standings(state, co)
  if (!st.masterOn) return []
  const seen = new Set(readLines(fileOf('incidents')).filter(Boolean).map((l) => [l.scope, l.scopeId, l.periodKey, l.kind].join('|')))
  const added = []
  const check = (scope, id, b) => {
    if (!b || !b.on || b.pct === null) return
    const kinds = []
    if (b.pct >= b.softAlertPct) kinds.push('alert')
    if (b.pct >= 100) kinds.push(b.hardStop ? 'hardstop' : 'over')
    for (const kind of kinds) {
      const key = [scope, id, st.periodKey, kind].join('|')
      if (seen.has(key)) continue
      seen.add(key)
      const line = { at: new Date().toISOString(), kind, scope, scopeId: id, periodKey: st.periodKey, pct: Math.round(b.pct), tokens: b.tokens, usd: b.usd }
      append('incidents', line)
      activity({ actor: 'system', action: kind === 'alert' ? 'budget.alert' : 'budget.hardstop', entityType: scope, entityId: id, summary: scope + ' ' + id + ' at ' + Math.round(b.pct) + '% of its ' + st.periodKey + ' budget', via: 'cli' })
      added.push(line)
    }
  }
  check('company', co.company.id, st.company.budget)
  for (const [id, o] of Object.entries(st.offices)) check('office', id, o.budget)
  for (const [id, e] of Object.entries(st.employees)) check('employee', id, e.budget)
  return added
}

function stampHeartbeat(session) {
  if (!fs.existsSync(COMPANY)) return false
  const hb = readJson(fileOf('heartbeat'), {}) || {}
  hb.supervisor = { lastSeenAt: new Date().toISOString() }
  if (session) hb.supervisor.session = clip(session, 60)
  writeAtomic(fileOf('heartbeat'), JSON.stringify(hb, null, 2))
  return true
}

/** The Board's dashboard changes not read yet, oldest first. */
function unreadInbox(mark) {
  const all = readLines(fileOf('inbox'))
  const seen = readJson(fileOf('inboxRead'), {}) || {}
  const lines = Number(seen.lines) || 0
  const fresh = all.slice(lines).filter(Boolean)
  if (mark && all.length > lines) writeAtomic(fileOf('inboxRead'), JSON.stringify({ lines: all.length, markedAt: new Date().toISOString() }, null, 2))
  return { fresh, all: all.filter(Boolean) }
}

/** Creates company/ from a seed (or one HQ office). Refuses when the folder
 *  exists: making the folder is the lock, so two inits cannot both win. */
function companyInit(seed, agentNames) {
  seed = seed || {}
  if (fs.existsSync(COMPANY)) {
    const missing = ['company', 'offices', 'projects', 'employees'].map((k) => FILES[k]).filter((f) => !fs.existsSync(path.join(COMPANY, f)))
    throw fail(409, COMPANY + ' already exists' + (missing.length ? ' but is missing ' + missing.join(', ') + ': remove the folder or finish it by hand' : ''))
  }
  const now = new Date().toISOString()
  const c = Object.assign({ id: 'co-main', name: 'My company', nameFa: '', mission: '', missionFa: '', issuePrefix: 'CO', ceoEmployeeId: CEO, defaultOfficeId: UNASSIGNED, budgetsEnabled: true, budget: null }, seed.company || {}, { schemaVersion: SCHEMA, createdAt: now, updatedAt: now })
  if (!KEY.test(c.issuePrefix)) throw fail(400, 'issuePrefix must match ' + KEY)
  c.budget = c.budget ? validateBudget(c.budget) : null
  const offices = (Array.isArray(seed.offices) && seed.offices.length ? seed.offices : [{ id: 'hq', name: 'Headquarters', nameFa: '', leadEmployeeId: CEO, profile: 'operations', theme: 'coral' }]).map((o, i) => {
    if (!OFFICE_ID.test(String(o.id)) || o.id === UNASSIGNED) throw fail(400, 'bad office id "' + o.id + '": lowercase letters, digits and hyphens, for example "' + String(o.id || 'office').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^[^a-z]+/, '') + '"')
    return { id: o.id, name: clip(o.name || o.id, 40), nameFa: clip(o.nameFa, 40), leadEmployeeId: clip(o.leadEmployeeId, 60), profile: clip(o.profile, 30), layout: 'standard', theme: Object.hasOwn(THEMES, o.theme) ? o.theme : 'slate', order: typeof o.order === 'number' ? o.order : i, budget: o.budget ? validateBudget(o.budget) : null, archived: false }
  })
  const officeIds = new Set(offices.map((o) => o.id))
  const projects = (Array.isArray(seed.projects) ? seed.projects : []).map((p) => {
    if (!p || !p.id) throw fail(400, 'a project needs an id')
    if (p.key && !KEY.test(p.key)) throw fail(400, 'project key "' + p.key + '" must match ' + KEY)
    return { id: clip(p.id, 40), name: clip(p.name || p.id, 60), nameFa: clip(p.nameFa, 60), key: p.key || '', aliases: Array.isArray(p.aliases) ? p.aliases.map((a) => clip(a, 60)) : [], officeId: officeIds.has(p.officeId) ? p.officeId : UNASSIGNED, goalId: '', leadEmployeeId: clip(p.leadEmployeeId, 60), repoPath: clip(p.repoPath, 300), status: 'active', budget: p.budget ? validateBudget(p.budget) : null }
  })
  const seedEmp = seed.employees && typeof seed.employees === 'object' ? seed.employees : {}
  const employees = {}
  const lead = (officeId) => (offices.find((o) => o.id === officeId) || {}).leadEmployeeId
  const names = [...new Set([...(agentNames || []), ...Object.keys(seedEmp)])].filter((n) => n !== CEO).sort()
  for (const name of names) {
    const s = own(seedEmp, name) || {}
    const led = offices.find((o) => o.leadEmployeeId === name)
    const home = officeIds.has(s.homeOfficeId) ? s.homeOfficeId : led ? led.id : offices[0].id
    const boss = s.reportsTo || (led ? CEO : lead(home) && lead(home) !== name ? lead(home) : CEO)
    employees[name] = {
      title: clip(s.title, 60), titleFa: clip(s.titleFa, 60), homeOfficeId: home,
      ...(s.name ? { name: clip(s.name, 60) } : {}), ...(Array.isArray(s.skills) ? { skills: s.skills.slice(0, 8).map((x) => clip(x, 40)) } : {}), ...(Number.isInteger(s.look) && s.look >= 0 && s.look < 6 ? { look: s.look } : {}),
      // no zone unless the seed gives one: the desk then follows the agent's own
      // zone: line or its name (homeDesks), also after the definition changes
      zone: ZONES.includes(s.zone) ? s.zone : led ? 'lead' : '',
      reportsTo: boss, budget: s.budget ? validateBudget(s.budget) : null, status: 'active', pauseReason: '', aliases: Array.isArray(s.aliases) ? s.aliases : [],
    }
  }
  const probe = { offices, employees }
  for (const name of Object.keys(employees)) {
    const loop = cycleIf(probe, name, employees[name].reportsTo)
    if (loop) throw fail(400, 'the seed would create a cycle: ' + loop.join(' → '))
  }
  fs.mkdirSync(COMPANY)
  fs.writeFileSync(fileOf('company'), JSON.stringify(c, null, 2), { flag: 'wx' })
  writeAtomic(fileOf('offices'), JSON.stringify(offices, null, 2))
  writeAtomic(fileOf('projects'), JSON.stringify(projects, null, 2))
  writeAtomic(fileOf('employees'), JSON.stringify(employees, null, 2))
  activity({ actor: 'board', action: 'company.init', entityType: 'company', entityId: c.id, summary: offices.length + ' offices, ' + projects.length + ' projects, ' + Object.keys(employees).length + ' employees', via: 'cli' })
  return { dir: COMPANY, offices: offices.length, projects: projects.length, employees: Object.keys(employees).length }
}

/** A short ETag for api/company: the same data gives the same tag. */
const etagOf = (text) => '"' + crypto.createHash('sha1').update(text).digest('hex').slice(0, 20) + '"'

module.exports = {
  COMPANY, SCHEMA, UNASSIGNED, CEO, THEMES, ZONES, FILES, titleFromId,
  normName, periodKey, cleanBudget, validateBudget, readCompany, resolver, annotate, costEvents, spendOf, evalBudget, standings,
  budgetCheck, bossOf, cycleIf, companyState, setBudget, setBudgetsEnabled, updateEmployee, noteIncidents, stampHeartbeat,
  unreadInbox, companyInit, etagOf, activity, inboxLine, addOffice, archiveOffice, writeOverlay, readLines, fileOf,
  OFFICE_ID, AGENT_ID, KEY, readJson,
}
