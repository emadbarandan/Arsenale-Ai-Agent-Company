/* The plan model (spec 1.4 section 3): versions and phases per project, and
 * the one progress function every screen and command uses.
 *
 *   company/plan/<projectId>.json     one file per project (section 3.1)
 *
 * Reading never writes: no plan file reads as "no versions", and a
 * `targetVersion` that no file lists shows as an unlisted version. Only the
 * owner (board) changes a plan; a refused change writes nothing. Task fields
 * (phaseId, ownerTask, ...) live in tasks.cjs. */
const fs = require('fs')
const path = require('path')
const P = require('./paths.cjs')
const { writeAtomic } = require('./build-agent-dashboard.cjs')
const { withLock } = require('./store.cjs')
const { fail, OWNER_ONLY, clipCp } = require('./runlog.cjs')

const DIR = path.join(P.COMPANY, 'plan')
const HORIZONS = ['now', 'next', 'later']
const VSTATUS = ['planned', 'active', 'released', 'dropped']
const PSTATUS = ['todo', 'doing', 'done']
const { WEIGHT } = require('./plan-schema.cjs')
const NAME = /^[0-9A-Za-z.+-]{1,20}$/
const PID = /^(?!\.+$)[\w.-]{1,60}$/

/** A project id that is safe to use as a file or folder name: one plain
 *  segment, never empty, never made only of dots, no separators, not absolute. */
function checkId(projectId) {
  const id = String(projectId == null ? '' : projectId)
  if (!PID.test(id) || id === '.' || id === '..' || path.isAbsolute(id) || /[\\/\0]/.test(id)) throw fail(400, 'bad project id: ' + clipCp(id, 40))
  return id
}
/** The full path of `name` under `parent`, refused when it would leave it. */
function under(parent, name) {
  const full = path.resolve(parent, name)
  const rel = path.relative(path.resolve(parent), full)
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel) || rel.split(path.sep).length !== 1) throw fail(400, 'bad project id: ' + clipCp(String(name), 40))
  return full
}
const MAX_VERSIONS = 200, MAX_PHASES = 50

const fileOf = (projectId) => {
  return under(DIR, checkId(projectId) + '.json')
}
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v)

/** Version names compare part by part, numbers as numbers: 2.10 after 2.9. */
function cmpName(a, b) {
  const pa = String(a).split(/[.+-]/), pb = String(b).split(/[.+-]/)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i], y = pb[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const nx = /^\d+$/.test(x), ny = /^\d+$/.test(y)
    if (nx && ny) { if (+x !== +y) return +x - +y } else if (x !== y) return x < y ? -1 : 1
  }
  return 0
}
const byOrder = (a, b) => (a.order || 0) - (b.order || 0) || cmpName(a.name, b.name)

/** The next patch name: "2.1" -> "2.1.1", "2.1.1" -> "2.1.2". A name that
 *  is taken in `existing` is skipped. */
function nextPatch(name, existing) {
  const taken = new Set(existing || [])
  const m = /^(\d+(?:\.\d+)*)$/.exec(String(name))
  if (!m) throw fail(400, 'A patch name needs a numeric version, for example 2.1')
  const parts = m[1].split('.').map(Number)
  const bump = parts.length === 2 ? parts.concat(1) : parts.slice(0, -1).concat(parts[parts.length - 1] + 1)
  let out = bump.join('.')
  while (taken.has(out)) { const p = out.split('.').map(Number); p[p.length - 1]++; out = p.join('.') }
  return out
}

/** Weighted progress of a list of tasks (section 3.4). Cancelled tasks are
 *  left out; a task without a size counts 1; no tasks reads "No plan". */
function progress(tasks) {
  let total = 0, done = 0, n = 0, unsized = 0
  for (const t of tasks || []) {
    if (!t || t.status === 'cancelled') continue
    const w = WEIGHT[t.size] || 1
    if (!WEIGHT[t.size]) unsized++
    n++; total += w
    if (t.status === 'done') done += w
  }
  const percent = n ? Math.round((done / total) * 100) : null
  return {
    tasks: n, doneWeight: done, totalWeight: total, percent, unsized,
    note: unsized ? unsized + (unsized === 1 ? ' task has' : ' tasks have') + ' no size (counted as 1)' : '',
    ready: n > 0 && done === total,
    label: !n ? 'No plan' : done === total ? '100 %, ready to release' : percent + ' %',
  }
}

/** A phase's status: from its tasks when it has any (all done -> done, all
 *  todo -> todo, else doing), else the stored one. Cancelled tasks are left out. */
function phaseStatus(phase, tasks) {
  const ts = (tasks || []).filter((t) => t.status !== 'cancelled')
  if (!ts.length) return PSTATUS.includes(phase.status) ? phase.status : 'todo'
  if (ts.every((t) => t.status === 'done')) return 'done'
  if (ts.every((t) => t.status === 'todo' || t.status === 'backlog')) return 'todo'
  return 'doing'
}

function cleanVersion(v) {
  if (!isObj(v) || !NAME.test(String(v.name))) return null
  const phases = (Array.isArray(v.phases) ? v.phases : []).filter((p) => isObj(p) && typeof p.id === 'string' && p.id).map((p, i) => ({
    id: p.id, title: String(p.title || ''), goal: String(p.goal || ''), order: Number.isFinite(p.order) ? p.order : i + 1, status: PSTATUS.includes(p.status) ? p.status : 'todo',
  }))
  return Object.assign({}, v, {
    id: String(v.id || 'v-' + v.name.replace(/\./g, '-')), name: String(v.name), title: String(v.title || ''), goal: String(v.goal || ''),
    horizon: HORIZONS.includes(v.horizon) ? v.horizon : 'later', status: VSTATUS.includes(v.status) ? v.status : 'planned',
    order: Number.isFinite(v.order) ? v.order : 0, phases, releasedAt: String(v.releasedAt || ''), planId: String(v.planId || ''), source: String(v.source || ''),
  })
}

/** The plan file of a project, cleaned. A missing or unreadable file reads as
 *  no versions. Never writes. */
function readPlan(projectId) {
  let raw = null
  try { raw = JSON.parse(fs.readFileSync(fileOf(projectId), 'utf8')) } catch (e) { if (e.code === 400) throw e }
  const ok = isObj(raw)
  const seen = new Set()
  const versions = ok && Array.isArray(raw.versions) ? raw.versions.map(cleanVersion).filter((v) => v && !seen.has(v.name) && seen.add(v.name)) : []
  return Object.assign({}, ok ? raw : {}, {
    schemaVersion: 1, projectId: String(projectId), master: ok && (raw.master === 'import' || raw.master === 'shadow') ? raw.master : 'arsenale', versions,
    lastImport: ok && raw.lastImport !== undefined ? raw.lastImport : null, updatedAt: ok && raw.updatedAt ? raw.updatedAt : '', exists: !!ok,
  })
}

/** The roadmap of a project: its versions with progress and phases, the
 *  unlisted versions (a task's targetVersion no file lists), and the "No
 *  phase" group. `tasks` is listTasks() rows. Never writes. */
/** Items flagged "gone from the import file" (spec 5.4), still waiting for the owner:
 *  tasks (not cancelled), plan decisions and versions. */
function goneOf(projectId, plan, mine) {
  const out = []
  for (const t of mine) if (t.missingInImport && t.status !== 'cancelled') out.push({ kind: 'task', id: t.id, title: t.title, version: t.targetVersion || '' })
  for (const v of plan.versions) if (v.missingInImport) out.push({ kind: 'version', id: v.name, title: v.title || v.name, version: v.name })
  try {
    for (const n of fs.readdirSync(P.DECISIONS)) {
      if (!n.endsWith('.json')) continue
      let d; try { d = JSON.parse(fs.readFileSync(path.join(P.DECISIONS, n), 'utf8')) } catch { continue }
      if (d && d.id && d.project === projectId && d.missingInImport) out.push({ kind: 'decision', id: d.id, title: d.text || d.id, version: d.targetVersion || '' })
    }
  } catch { /* no decisions */ }
  return out
}

/** The imported worklog of a project (spec 5.2): date, task, agent, model and token total per run, at most 200. */
function worklogOf(projectId) {
  let runs = []
  try { runs = JSON.parse(fs.readFileSync(under(DIR, checkId(projectId) + '.worklog.json'), 'utf8')).runs } catch { return [] }
  if (!Array.isArray(runs)) return []
  const n = (x) => (Number.isFinite(+x) ? +x : 0)
  return runs.slice(0, 200).filter((r) => r && typeof r === 'object').map((r) => {
    const u = r.usage || {}
    return { id: String(r.id || ''), date: String(r.date || ''), taskId: String(r.task_id || ''), agent: clipCp(String(r.agent || ''), 60), model: clipCp(String(r.model || ''), 60), tokens: n(u.input) + n(u.output) + n(u.cache_read) + n(u.cache_write) }
  })
}

function view(projectId, tasks) {
  const plan = readPlan(projectId)
  const mine = (tasks || []).filter((t) => !projectId || t.projectId === projectId)
  const forVersion = (name) => mine.filter((t) => t.targetVersion === name)
  const shape = (v, unlisted) => {
    const ts = forVersion(v.name)
    const phaseIds = new Set(v.phases.map((p) => p.id))
    const phases = v.phases.slice().sort((a, b) => a.order - b.order).map((p) => {
      const pt = ts.filter((t) => t.phaseId === p.id)
      return Object.assign({}, p, { status: phaseStatus(p, pt), progress: progress(pt) })
    })
    const loose = ts.filter((t) => !t.phaseId || !phaseIds.has(t.phaseId))
    return Object.assign({}, v, { unlisted: !!unlisted, phases, noPhase: loose.length ? progress(loose) : null, progress: progress(ts) })
  }
  const listed = new Set(plan.versions.map((v) => v.name))
  const versions = plan.versions.slice().sort(byOrder).map((v) => shape(v, false))
  const extra = [...new Set(mine.map((t) => t.targetVersion).filter((n) => n && !listed.has(n)))].sort(cmpName)
  const unlisted = extra.map((name) => shape({ id: '', name, title: '', goal: '', horizon: 'later', status: 'planned', order: 0, phases: [], releasedAt: '', planId: '', source: '' }, true))
  return { projectId: plan.projectId, master: plan.master, exists: plan.exists, nextPatch: nextPatchOf(projectId), lastImport: plan.lastImport, gone: goneOf(projectId, plan, mine), hasShadow: (() => { try { return require('./plan-migrate.cjs').hasShadow(projectId) } catch { return false } })(), worklog: worklogOf(projectId), versions, unlisted, overall: progress(mine.filter((t) => t.targetVersion)) }
}

/** Today / Next (spec 1.4 section 6), across the projects that are not done,
 *  archived or paused. `opts`: {tasks, company, queue, state, now}. Never writes. */
function today(opts) {
  opts = opts || {}
  const now = opts.now || Date.now()
  const tasks = opts.tasks || require('./tasks.cjs').listTasks()
  const co = opts.company || require('./agent-company.cjs').readCompany()
  const projects = ((co && co.projects) || []).filter((p) => !['done', 'archived', 'paused'].includes(p.status))
  const ids = new Set(projects.map((p) => p.id))
  const nameOf = (id) => { const p = projects.find((x) => x.id === id); return p ? p.name || p.id : id }
  const mine = tasks.filter((t) => ids.has(t.projectId))
  const Q = opts.queue || require('./queue.cjs').read(tasks)
  const item = (t, extra) => Object.assign({ kind: 'task', id: t.id, title: t.title, projectId: t.projectId, project: nameOf(t.projectId), status: t.status, version: t.targetVersion || '', priority: t.priority }, extra || {})
  const doing = mine.filter((t) => t.status === 'in_progress').sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).map((t) => item(t))
  const queued = new Set(Q.entries.map((e) => e.taskId))
  const queue = Q.entries.filter((e) => ids.has(e.task.projectId) && !e.claimed).map((e, i) => item(e.task, { queued: true, position: i + 1 }))
  const PRI = { urgent: 0, high: 1, medium: 2, normal: 2, low: 3 }
  const rank = (t) => (PRI[t.priority] !== undefined ? PRI[t.priority] : 2)
  const suggestions = []
  for (const p of projects) {
    const plan = readPlan(p.id)
    const lanes = plan.versions.filter((v) => v.horizon === 'now' && v.status !== 'released' && v.status !== 'dropped').sort((a, b) => (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1) || byOrder(a, b))
    const pool = []
    lanes.forEach((v, vi) => {
      const po = new Map(v.phases.map((ph) => [ph.id, ph.order]))
      for (const t of mine.filter((x) => x.projectId === p.id && x.targetVersion === v.name && x.status === 'todo' && !queued.has(x.id))) pool.push({ t, vi, po: po.has(t.phaseId) ? po.get(t.phaseId) : 1e9 })
    })
    pool.sort((a, b) => a.vi - b.vi || a.po - b.po || rank(a.t) - rank(b.t) || String(a.t.createdAt).localeCompare(String(b.t.createdAt)))
    for (const x of pool.slice(0, 2)) suggestions.push(item(x.t, { suggested: true }))
  }
  const state = opts.state || (() => { try { return require('./build-agent-dashboard.cjs').collect() } catch { return {} } })()
  const inScope = (x) => !x.project || ids.has(x.project) || projects.some((p) => [p.key, p.name].includes(x.project))
  const gates = (state.gates || []).filter((g) => g.status === 'waiting' && inScope(g)).map((g) => ({ kind: 'gate', id: g.id, title: g.question || g.label || '', projectId: g.project || '' }))
  const decisions = (state.decisions || []).filter((d) => d.state === 'open' && d.targetVersion && inScope(d)).map((d) => ({ kind: 'decision', id: d.id, title: d.text, projectId: d.project || '', version: d.targetVersion }))
  const waiting = gates.concat(mine.filter((t) => t.status === 'in_review' || (t.ownerTask && t.status !== 'done' && t.status !== 'cancelled')).map((t) => item(t, { ownerTask: t.ownerTask }))).concat(decisions)
  const DAY = 24 * 3600e3
  const blocked = mine.filter((t) => t.status === 'blocked').map((t) => item(t))
  for (const e of Q.entries) {
    const at = Date.parse(e.claimedAt)
    if (e.claimed && ids.has(e.task.projectId) && Number.isFinite(at) && now - at > DAY && !e.task.runs) blocked.push(item(e.task, { stale: true, since: e.claimedAt.slice(0, 16).replace('T', ' '), note: 'claimed, no run since ' + e.claimedAt.slice(0, 16).replace('T', ' ') }))
  }
  return { doing, next: queue.slice(0, 5).concat(suggestions).slice(0, 25), nextQueued: queue.length, waiting, blocked, empty: !doing.length && !queue.length && !suggestions.length && !waiting.length && !blocked.length }
}

/** Text of Today, for `arsenale today`. */
function todayText(D) {
  const L = []
  const grp = (name, items, f) => { L.push(name + (items.length ? '' : ': nothing')); for (const i of items) L.push('  ' + f(i)) }
  grp('Doing', D.doing, (i) => i.id + ' ' + i.title + ' (' + i.project + ')')
  grp('Next up', D.next, (i) => (i.queued ? i.position + '. ' : '   ') + i.id + ' ' + i.title + ' (' + i.project + ')' + (i.suggested ? '  [not queued]' : ''))
  grp('Waiting for you', D.waiting, (i) => (i.kind === 'task' ? i.id + ' ' : i.kind + ': ') + i.title)
  grp('Blocked', D.blocked, (i) => i.id + ' ' + i.title + (i.note ? ' - ' + i.note : ''))
  return L.join('\n')
}

/* ---- writes: owner only, atomic, under the file's lock ---- */

function needBoard(actor) {
  if (!actor || actor.role !== 'board') throw fail(403, 'Only the owner can change the plan. ' + OWNER_ONLY)
}
function mutate(projectId, actor, fn) {
  needBoard(actor)
  const file = fileOf(projectId)
  fs.mkdirSync(DIR, { recursive: true })
  return withLock(file, () => {
    const plan = readPlan(projectId)
    if (plan.master === 'shadow' && actor.importer !== true) throw fail(409, 'Shadow copy of HQ. HQ is the master; editing is off.')
    require('./runlog.cjs').refuseInShadow(actor)
    const out = fn(plan)
    const body = { schemaVersion: 1, projectId: plan.projectId, master: plan.master, versions: plan.versions, lastImport: plan.lastImport, updatedAt: new Date().toISOString() }
    for (const v of body.versions) { v.updatedAt = v.updatedAt || body.updatedAt }
    writeAtomic(file, JSON.stringify(body, null, 2))
    return out
  })
}
const need = (plan, name) => {
  const v = plan.versions.find((x) => x.name === String(name))
  if (!v) throw fail(404, 'no such version: ' + clipCp(name, 20))
  return v
}
const text = (v, max, label) => { const s = String(v == null ? '' : v); if (Array.from(s).length > max) throw fail(400, label + ' is at most ' + max + ' characters'); return s }
function setStatus(plan, v, status, now) {
  if (!VSTATUS.includes(status)) throw fail(400, 'status must be one of ' + VSTATUS.join(', '))
  if (status === 'active') for (const o of plan.versions) if (o !== v && o.status === 'active') throw fail(409, 'Version ' + o.name + ' is already active: only one version is active at a time')
  if (status === 'released' && v.status !== 'released') v.releasedAt = now
  if (status !== 'released') v.releasedAt = ''
  v.status = status
}
function applyVersionFields(plan, v, input, now) {
  if (input.title !== undefined) v.title = text(input.title, 120, 'The title')
  if (input.goal !== undefined) v.goal = text(input.goal, 500, 'The goal')
  if (input.horizon !== undefined) { if (!HORIZONS.includes(input.horizon)) throw fail(400, 'horizon must be one of ' + HORIZONS.join(', ')); v.horizon = input.horizon }
  if (input.order !== undefined) { if (!Number.isInteger(input.order)) throw fail(400, 'order must be a whole number'); v.order = input.order }
  if (input.status !== undefined) setStatus(plan, v, input.status, now)
}

function addVersion(projectId, input, actor) {
  input = input || {}
  return mutate(projectId, actor, (plan) => {
    const name = String(input.name || '')
    if (!NAME.test(name)) throw fail(400, 'Version name is 1 to 20 characters: letters, digits, dot, plus or dash, for example 2.1')
    if (plan.versions.some((v) => v.name === name)) throw fail(409, 'Version ' + name + ' is already in the plan')
    if (plan.versions.length >= MAX_VERSIONS) throw fail(400, 'At most ' + MAX_VERSIONS + ' versions')
    const now = new Date().toISOString()
    const horizon = input.horizon || 'later'
    const v = { id: 'v-' + name.replace(/[^\w]/g, '-'), name, title: '', goal: '', horizon: 'later', status: 'planned', order: plan.versions.filter((o) => o.horizon === horizon).reduce((m, o) => Math.max(m, o.order), 0) + 1, phases: [], releasedAt: '', planId: '', source: '', updatedAt: now }
    applyVersionFields(plan, v, Object.assign({}, input, { order: input.order }), now)
    v.updatedAt = now
    plan.versions.push(v)
    return v
  })
}
function editVersion(projectId, name, input, actor) {
  return mutate(projectId, actor, (plan) => {
    const v = need(plan, name)
    const now = new Date().toISOString()
    applyVersionFields(plan, v, input || {}, now)
    v.updatedAt = now
    return v
  })
}
/** Moves a version to a lane (and optionally to a place in it). */
function moveVersion(projectId, name, horizon, order, actor) {
  return editVersion(projectId, name, order === undefined ? { horizon } : { horizon, order }, actor)
}
/** Dropping keeps the version and its tasks: only the status changes. */
function dropVersion(projectId, name, actor) {
  return editVersion(projectId, name, { status: 'dropped' }, actor)
}

function addPhase(projectId, versionName, input, actor) {
  input = input || {}
  return mutate(projectId, actor, (plan) => {
    const v = need(plan, versionName)
    if (v.phases.length >= MAX_PHASES) throw fail(400, 'At most ' + MAX_PHASES + ' phases in a version')
    const title = text(input.title, 120, 'The title').trim()
    if (!title) throw fail(400, 'A phase needs a title')
    let n = v.phases.length + 1
    while (v.phases.some((p) => p.id === 'ph-' + n)) n++
    const ph = { id: 'ph-' + n, title, goal: text(input.goal, 500, 'The goal'), order: v.phases.reduce((m, p) => Math.max(m, p.order), 0) + 1, status: 'todo' }
    v.phases.push(ph)
    v.updatedAt = new Date().toISOString()
    return ph
  })
}
function editPhase(projectId, versionName, phaseId, input, actor) {
  input = input || {}
  return mutate(projectId, actor, (plan) => {
    const v = need(plan, versionName)
    const ph = v.phases.find((p) => p.id === String(phaseId))
    if (!ph) throw fail(404, 'no such phase: ' + clipCp(phaseId, 20))
    if (input.title !== undefined) { const t = text(input.title, 120, 'The title').trim(); if (!t) throw fail(400, 'A phase needs a title'); ph.title = t }
    if (input.goal !== undefined) ph.goal = text(input.goal, 500, 'The goal')
    if (input.order !== undefined) { if (!Number.isInteger(input.order)) throw fail(400, 'order must be a whole number'); ph.order = input.order }
    if (input.status !== undefined) { if (!PSTATUS.includes(input.status)) throw fail(400, 'status must be one of ' + PSTATUS.join(', ')); ph.status = input.status }
    v.updatedAt = new Date().toISOString()
    return ph
  })
}
function removePhase(projectId, versionName, phaseId, actor) {
  return mutate(projectId, actor, (plan) => {
    const v = need(plan, versionName)
    const i = v.phases.findIndex((p) => p.id === String(phaseId))
    if (i < 0) throw fail(404, 'no such phase: ' + clipCp(phaseId, 20))
    v.phases.splice(i, 1)
    v.updatedAt = new Date().toISOString()
    return { removed: String(phaseId) }
  })
}

/** The name "Next patch" would create for a project: the active version's name with its last number
 *  plus one, skipping names taken. With no active version, the newest released one; '' when neither. */
function nextPatchOf(projectId) {
  const plan = readPlan(projectId)
  const closed = plan.versions.filter((v) => v.status === 'released' || v.status === 'dropped').map((v) => v.name)
  const base = plan.versions.find((v) => v.status === 'active') || plan.versions.filter((v) => v.status === 'released').sort((a, b) => cmpName(b.name, a.name))[0]
  if (!base) return ''
  try { return nextPatch(base.name, closed) } catch { return '' } // a planned one that exists is joined, not skipped
}

/** "Plan into" (spec 1.4 section 8), owner only: sets a task's target version (and phase). The version
 *  "next-patch" (or nextPatch: true) is the active version's next patch number and is created (horizon
 *  now, status planned) when the plan does not list it. */
function into(b, actor) {
  needBoard(actor)
  const T = require('./tasks.cjs')
  const task = T.readTask(String(b.task || ''))
  if (!task) throw fail(404, 'no such task: ' + clipCp(b.task, 20))
  const pid = task.projectId || String(b.project || '')
  let name = String(b.version || '')
  let created = null
  let phase = b.phase || null
  if (b.nextPatch === true || name === 'next-patch') {
    name = nextPatchOf(pid)
    if (!name) throw fail(409, 'This project has no active version to take a patch from: choose a version')
    if (!readPlan(pid).versions.some((v) => v.name === name)) { created = addVersion(pid, { name, horizon: 'now', status: 'planned' }, actor); phase = null }
  }
  const t = T.updateTask({ id: task.id, targetVersion: name, phaseId: phase }, actor).task
  return { task: t, version: name, created: !!created }
}

/** One entry for the CLI and POST /api/plan: {op, project, ...}. */
/** "Decide here" (spec 1.4 section 3.3): the owner records the answer of an open plan decision. */
function decideHere(b, actor) {
  needBoard(actor)
  const id = String(b.id || '').replace(/[^\w.-]/g, '')
  const answer = text(b.answer, 300, 'The answer').trim()
  if (!id || !fs.existsSync(path.join(P.DECISIONS, id + '.json'))) throw fail(404, 'no such decision')
  if (!answer) throw fail(400, 'An answer is needed')
  return require('./build-agent-dashboard.cjs').saveDecision({ id, state: 'taken', answer })
}

/** "Keep" and "Cancel task" for an item gone from the import file (spec 5.4). Owner only. */
function resolveGone(b, actor, cancel) {
  needBoard(actor)
  const pid = checkId(b.project)
  const kind = String(b.kind || 'task'), id = String(b.id || '')
  const imp = Object.assign({}, actor, { importer: true })
  if (kind === 'task') {
    const T = require('./tasks.cjs')
    const t = T.readTask(id)
    if (!t || t.projectId !== pid) throw fail(404, 'no such task in this project')
    if (!t.missingInImport) throw fail(409, 'That task is not flagged as gone from the import file')
    if (cancel) return T.updateTask({ id, status: 'cancelled', missingInImport: null }, imp)
    return T.updateTask({ id, missingInImport: null }, imp)
  }
  if (cancel) throw fail(400, 'Only a task can be cancelled here')
  if (kind === 'version') {
    return mutate(pid, imp, (plan) => {
      const v = need(plan, id)
      if (!v.missingInImport) throw fail(409, 'That version is not flagged as gone from the import file')
      delete v.missingInImport; v.updatedAt = new Date().toISOString(); return v
    })
  }
  if (kind === 'decision') {
    const cid = id.replace(/[^\w.-]/g, '')
    let d = null; try { d = JSON.parse(fs.readFileSync(path.join(P.DECISIONS, cid + '.json'), 'utf8')) } catch { /* none */ }
    if (!cid || !d || d.project !== pid) throw fail(404, 'no such decision in this project')
    if (!d.missingInImport) throw fail(409, 'That decision is not flagged as gone from the import file')
    return require('./build-agent-dashboard.cjs').saveDecision({ id: cid, missingInImport: false })
  }
  throw fail(400, 'unknown kind')
}

function apply(b, actor) {
  const pid = String(b.project || '')
  switch (b.op) {
    case 'version-add': return addVersion(pid, b, actor)
    case 'version-edit': return editVersion(pid, b.name, b, actor)
    case 'version-move': return moveVersion(pid, b.name, b.horizon, b.order, actor)
    case 'version-drop': return dropVersion(pid, b.name, actor)
    case 'phase-add': return addPhase(pid, b.version, b, actor)
    case 'phase-edit': return editPhase(pid, b.version, b.phase, b, actor)
    case 'phase-remove': return removePhase(pid, b.version, b.phase, actor)
    case 'decision-decide': return decideHere(b, actor)
    case 'keep': return resolveGone(b, actor, false)
    case 'cancel-gone': return resolveGone(b, actor, true)
    default: throw fail(400, 'unknown plan operation')
  }
}

/** Text of a view, for `arsenale plan`. */
function text_(V) {
  const L = ['Plan of ' + V.projectId + (V.master === 'import' ? ' (mastered in another planner)' : '')]
  const line = (v) => '  ' + v.name + (v.title ? ' ' + v.title : '') + '  [' + (v.unlisted ? 'unlisted' : v.status) + ']  ' + v.progress.label + (v.progress.note ? ' (' + v.progress.note + ')' : '')
  for (const h of HORIZONS) {
    const vs = V.versions.filter((v) => v.horizon === h).concat(h === 'later' ? V.unlisted : [])
    if (!vs.length) continue
    L.push(h.charAt(0).toUpperCase() + h.slice(1))
    for (const v of vs) { L.push(line(v)); for (const p of v.phases) L.push('      ' + p.title + '  ' + p.status + '  ' + p.progress.label) }
  }
  if (L.length === 1) L.push('  No versions yet')
  return L.join('\n')
}

function run(args, say) {
  const flagVals = ['--project', '--title', '--goal', '--horizon', '--order', '--phase', '--status']
  const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined }
  const rest = args.filter((a, i) => !a.startsWith('--') && !flagVals.includes(args[i - 1]))
  let project = val('--project')
  if (!project) {
    try { const co = require('./agent-company.cjs').readCompany(); project = (co.projects && co.projects[0] && co.projects[0].id) || '' } catch { project = '' }
  }
  project = project || '_'
  const T = require('./tasks.cjs')
  if (rest[0] && rest[0] !== 'show') {
    // every change is the owner's: "by board" needs the owner key (runlog.cliActor)
    const actor = require('./runlog.cjs').cliActor({ by: 'board' })
    try {
      if (rest[0] === 'into') {
        if (!rest[1] || !rest[2]) throw fail(400, 'usage: arsenale plan into <task> <version> [--phase <id>]')
        const r = into({ task: rest[1], version: rest[2], phase: val('--phase') || null }, actor), t = r.task
        say(t.id + ' is planned into ' + t.targetVersion + (t.phaseId ? ' / ' + t.phaseId : '') + (r.created ? ' (version ' + r.version + ' created)' : ''))
        return 0
      }
      if (rest[0] === 'version' && ['add', 'edit', 'move', 'drop'].includes(rest[1]) && rest[2]) {
        const b = { op: 'version-' + rest[1], project, name: rest[2], title: val('--title'), goal: val('--goal'), horizon: val('--horizon'), status: val('--status') }
        if (val('--order') !== undefined) b.order = Number(val('--order'))
        for (const k of Object.keys(b)) if (b[k] === undefined) delete b[k]
        const v = apply(b, actor)
        say('Version ' + v.name + ': ' + v.status + ', ' + v.horizon)
        return 0
      }
      throw fail(400, 'usage: arsenale plan [show] [--project ID] [--json] | plan version add|edit|move|drop <name> [--title T] [--goal G] [--horizon now|next|later] [--status S] | plan into <task> <version> [--phase ID]')
    } catch (e) { say(e.message); return 1 }
  }
  const V = view(project, T.listTasks())
  say(args.includes('--json') ? JSON.stringify(V, null, 2) : text_(V))
  return 0
}

module.exports = { mutate, DIR, HORIZONS, VSTATUS, PSTATUS, WEIGHT, readPlan, view, today, todayText, progress, phaseStatus, nextPatch, nextPatchOf, into, cmpName, addVersion, editVersion, moveVersion, dropVersion, addPhase, editPhase, removePhase, apply, run, fileOf, checkId, under }
