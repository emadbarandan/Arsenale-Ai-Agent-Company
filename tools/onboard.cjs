/* The first-start wizard's one write: "Create" (spec R-3.2).
 *
 * Nothing is written while the owner walks through the steps; the page sends
 * every answer at once, and this does, in order:
 *   1. check everything;
 *   2. copy the chosen packs' members into the managed agent folder;
 *   3. create company/ (companyInit: making the folder is the lock, so two
 *      tabs cannot both create a company);
 *   4. write policy.json with the defaults, if there is none;
 *   5. note the set-up in config.json.
 * If step 3 fails, the files of step 2 are removed again by their hashes, and
 * a company/ folder step 3 made is removed with them; the owner sees the
 * reason with "Try again".
 */
const fs = require('fs')
const path = require('path')
const P = require('./paths.cjs')
const { writeAtomic } = require('./build-agent-dashboard.cjs')
const { fail, requireBoard, clipCp } = require('./runlog.cjs')

const ASSISTANTS = ['claude-desktop', 'claude-code', 'cursor', 'vscode', 'codex', 'gemini', 'chatgpt', 'other']
const PAY = ['plan', 'api', 'unknown']

/** Whether the wizard opens by itself: no company and no job ever logged
 *  (R-3.1). With runs but no company, the dashboard shows a banner instead. */
function status() {
  const hasCompany = fs.existsSync(P.COMPANY)
  let runs = 0
  try { runs = fs.readdirSync(P.RUNS).filter((n) => n.endsWith('.json')).length } catch { /* none */ }
  let active = 0
  try { active = fs.readdirSync(P.ACTIVE).filter((n) => n.endsWith('.json')).length } catch { /* none */ }
  return { hasCompany, runs: runs + active, wizard: !hasCompany && runs + active === 0, banner: !hasCompany && runs + active > 0 }
}

/** The issue prefix from the company name: its first three Latin letters,
 *  or CO when it has none (spec R-6.1). */
function prefixOf(name) {
  const letters = String(name || '').normalize('NFKD').replace(/[^A-Za-z]/g, '').toUpperCase()
  return letters.length >= 2 ? letters.slice(0, 3) : 'CO'
}

function readConfig() {
  try { const j = JSON.parse(P.stripBom(fs.readFileSync(path.join(P.HOME, 'config.json'), 'utf8'))); return j && typeof j === 'object' && !Array.isArray(j) ? j : {} } catch { return {} }
}

function create(answers, actor) {
  requireBoard(actor)
  const a = answers || {}
  const name = clipCp(String(a.name || '').trim(), 60)
  if (!name) throw fail(400, 'Enter the name of your company or project (1 to 60 characters)')
  const mission = clipCp(String(a.mission || '').trim(), 300)
  const payModel = PAY.includes(a.payModel) ? a.payModel : 'unknown'
  const assistants = (Array.isArray(a.assistants) ? a.assistants : []).filter((x) => ASSISTANTS.includes(x))
  const lang = a.lang === 'fa' ? 'fa' : 'en'
  const packIds = Array.isArray(a.packs) ? [...new Set(a.packs.map(String))] : []
  if (!packIds.length) throw fail(400, 'Choose at least one office')
  const C = require('./agent-company.cjs')
  let budget = null
  if (a.budget && (a.budget.monthlyUsd !== undefined && a.budget.monthlyUsd !== '' && a.budget.monthlyUsd !== null)) {
    budget = C.validateBudget({ monthlyUsd: a.budget.monthlyUsd, softAlertPct: a.budget.softAlertPct === undefined || a.budget.softAlertPct === '' ? 80 : Number(a.budget.softAlertPct), hardStop: !!a.budget.hardStop })
  }
  if (status().hasCompany) throw fail(409, 'A company exists already: add offices from Settings → Office packs')
  const Pk = require('./packs.cjs')
  const packs = packIds.map((id) => Pk.bundledPack(id))
  // packs must not bring the same office twice
  const offices = new Set()
  for (const p of packs) { if (offices.has(p.office.id)) throw fail(400, 'Two packs bring the same office: ' + p.office.id); offices.add(p.office.id) }

  // 2. the files
  const done = []
  try {
    for (const p of packs) done.push({ p, copied: Pk.copyFiles(p, 'keep') })
  } catch (e) { for (const d of done.reverse()) Pk.undoCopy(d.copied); throw e }

  // 3. the company
  const employees = {}
  for (const d of done) Object.assign(employees, Pk.employeesOf(d.p, d.copied))
  const seed = {
    company: { name, nameFa: lang === 'fa' ? name : '', mission, missionFa: lang === 'fa' ? mission : '', issuePrefix: prefixOf(name), budget, budgetsEnabled: payModel === 'api' ? true : !!budget, payModel, assistants },
    offices: done.map((d, i) => ({ id: d.p.office.id, name: d.p.office.name, nameFa: d.p.office.nameFa, leadEmployeeId: d.copied.rename[d.p.office.lead] || d.p.office.lead, profile: d.p.office.profile, theme: d.p.office.theme, order: i })),
    projects: [],
    employees,
  }
  let r
  try {
    r = C.companyInit(seed, [])
    // the overlay fields companyInit does not know (tier, managed, createdBy)
    for (const [id, e] of Object.entries(employees)) C.writeOverlay(id, { tier: e.tier, managed: true, createdBy: e.createdBy }, 'board')
  } catch (e) {
    // newest copy first, so the labels file ends as it was before the first
    for (const d of done.slice().reverse()) Pk.undoCopy(d.copied)
    // a company this call made goes too, or "Try again" finds it and stops;
    // one that companyInit refused (another tab's) is not ours to remove
    if (r) fs.rmSync(P.COMPANY, { recursive: true, force: true })
    throw e
  }
  for (const d of done) {
    Pk.record(d.p, d.copied, d.p.office.id)
    require('./policy.cjs').applyPackRows(Object.fromEntries(Object.entries(d.p.policyRows).map(([m, row]) => [d.copied.rename[m] || m, row])))
  }
  // 4. the safety rules
  require('./policy.cjs').ensureDefaults(actor.door)
  // 5. config.json: when the wizard ran; other keys stay as they were
  const cfg = readConfig()
  cfg.onboarding = { completedAt: new Date().toISOString(), version: 1 }
  fs.mkdirSync(P.HOME, { recursive: true })
  writeAtomic(path.join(P.HOME, 'config.json'), JSON.stringify(cfg, null, 2))
  fs.mkdirSync(path.join(P.HOME, 'workspace'), { recursive: true })
  C.activity({ actor: 'board', action: 'company.onboarded', entityType: 'company', entityId: 'co-main', summary: name + ': ' + done.map((d) => d.p.office.id).join(', '), via: actor.door })
  const first = done[0] && done[0].p.sampleTasks[0]
  return { company: name, offices: done.map((d) => d.p.office.id), members: Object.keys(employees), issuePrefix: seed.company.issuePrefix, sampleTask: first || null, dir: r.dir }
}

/** What Create would write, for the review step: shown, never written. */
function preview(answers) {
  const a = answers || {}
  const out = [path.join(P.HOME, 'company') + path.sep + '  (company.json, offices.json, projects.json, employees.json)', path.join(P.HOME, 'policy.json'), path.join(P.HOME, 'packs', 'installed.json'), path.join(P.HOME, 'config.json') + '  (onboarding)', path.join(P.HOME, 'workspace') + path.sep]
  const Pk = require('./packs.cjs')
  for (const id of Array.isArray(a.packs) ? a.packs : []) {
    try { for (const m of Pk.bundledPack(String(id)).members) out.push(path.join(P.MANAGED_AGENTS, m.id + '.md')) } catch { /* unknown pack: Create will say so */ }
  }
  return { home: P.HOME, files: out }
}

module.exports = { status, create, preview, prefixOf, ASSISTANTS }
