/* Import and export of plans (spec 1.4 section 5): schema v1 <-> Arsenale.
 *
 *   arsenale import-plan <file> --project <id> (--phases-as versions | --version <name>) [--dry-run] [--json]
 *   arsenale export-plan --project <id> (--phases-as versions | --version <name>) [--out <file>] [--force] [--json]
 *
 * Import is the owner's, idempotent, and never deletes: an item that is gone
 * from the file is flagged `missingInImport`. A three-way merge (file, base
 * stored after the last import, Arsenale now) decides each field; a field
 * changed on both sides keeps Arsenale unless the file is provably newer, and
 * is listed as a conflict. Imported `runs` are kept read-only in
 * company/plan/<projectId>.worklog.json and never enter the ledger. */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const P = require('./paths.cjs')
const { withLock } = require('./store.cjs')
const S = require('./plan-schema.cjs')
const Pl = require('./plan.cjs')
const { writeAtomic } = require('./build-agent-dashboard.cjs')
const { fail, clipCp, cliActor } = require('./runlog.cjs')

const MAX_ITEMS = 10000
const NAME = /^[0-9A-Za-z.+-]{1,20}$/
const IN = { todo: 'todo', doing: 'in_progress', review: 'in_review', blocked: 'blocked', done: 'done' }
const OUT = { todo: 'todo', in_progress: 'doing', in_review: 'review', blocked: 'blocked', done: 'done', backlog: 'todo' }
const T_FIELDS = ['title', 'status', 'type', 'size', 'tier', 'ownerTask', 'targetVersion', 'phaseId', 'acceptance', 'description', 'tokenEstimate']
const D_FIELDS = ['question', 'options', 'recommendation', 'status', 'answer']
const baseFile = (pid) => Pl.under(path.join(Pl.DIR, '.import-base'), Pl.checkId(pid) + '.json')
const worklogFile = (pid) => Pl.under(Pl.DIR, Pl.checkId(pid) + '.worklog.json')
const T = () => require('./tasks.cjs')
const norm = (v) => (v === undefined || v === '' || v === false ? null : v)
const same = (a, b) => JSON.stringify(norm(a)) === JSON.stringify(norm(b))
const readJson = (f, dflt) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return dflt } }
const natural = (a, b) => String(a).localeCompare(String(b), 'en', { numeric: true })

/** Mode from the flags: { versions: true } or { version: '2.1' }. */
function modeOf(opts) {
  if (opts.phasesAs && opts.version) throw fail(400, 'Use --phases-as versions or --version <name>, not both')
  if (opts.phasesAs) { if (opts.phasesAs !== 'versions') throw fail(400, '--phases-as takes "versions"'); return { versions: true } }
  if (opts.version) { if (!NAME.test(opts.version)) throw fail(400, 'Version name is 1 to 20 characters: letters, digits, dot, plus or dash'); return { version: opts.version } }
  return null
}
const NO_MODE = 'Say how to read the phases: --phases-as versions, or --version <name>'

/** One merged field. fv/bv/cv: file, base, current (Arsenale). */
function mergeField(fv, bv, cv, hasBase, fileAt, curAt) {
  if (fv === undefined) return { skip: true }
  if (!hasBase) return { value: fv, take: !same(fv, cv) }
  const fc = !same(fv, bv), cc = !same(cv, bv)
  if (!fc) return { value: bv, take: false }              // keep Arsenale (changed or not)
  if (!cc) return { value: fv, take: !same(fv, cv) }      // take the file
  if (same(fv, cv)) return { value: fv, take: false }
  const fileNewer = fileAt && curAt && Date.parse(fileAt) > Date.parse(curAt)
  return { value: fileNewer ? fv : cv, take: !!fileNewer, conflict: { file: fv, arsenale: cv, kept: fileNewer ? 'file' : 'arsenale' } }
}

/** Parse and map the file. Returns { errors } or the mapped model. */
function mapFile(plan, mode) {
  const errors = []
  const phases = plan.phases || []
  const tasks = plan.tasks || []
  const decisions = plan.decisions || []
  const ars = plan.arsenale && typeof plan.arsenale === 'object' ? plan.arsenale : {}
  const m = { versions: [], phaseVersion: new Map(), tasks: [], decisions: [], runs: plan.runs, overrides: [], versionNames: new Set() }
  if (mode.versions) {
    for (const ph of phases) {
      let name = ph.version, title = String(ph.title || '')
      if (!name) {
        const hit = /\d+(\.\d+){1,3}/.exec(title)
        if (hit) { name = hit[0]; title = title.replace(/^\s*[vV]?\s*/, '').replace(hit[0], '').replace(/^\s*[v:.\-–—]*\s*/, '').trim() }
      }
      if (!name || !NAME.test(String(name))) { errors.push('phase ' + ph.id + ': gives no version name: add "version", or put one like 2.1 in the title'); continue }
      if (m.versionNames.has(name)) { errors.push('phase ' + ph.id + ': version ' + name + ' appears twice'); continue }
      m.versionNames.add(name)
      m.phaseVersion.set(ph.id, name)
      const av = (ars.versions && ars.versions[name]) || {}
      const fields = { title, goal: ph.goal }
      for (const k of ['horizon', 'status']) if (typeof av[k] === 'string') fields[k] = av[k]
      m.versions.push({ planId: ph.id, name, fields, at: ph.updated_at, order: Number.isInteger(av.order) ? av.order : undefined, phases: ((ars.phases && ars.phases[name]) || []).filter((p) => p && typeof p.id === 'string').map((p) => ({ id: p.id, fields: { title: p.title, goal: p.goal, status: p.status }, order: p.order })) })
    }
  } else if (mode.version) {
    m.versionNames.add(mode.version)
    m.versions.push({ planId: '', name: mode.version, fields: {}, phases: phases.map((p) => ({ id: p.id, fields: { title: p.title, goal: p.goal, status: p.status }, at: p.updated_at })) })
  }
  const phaseIdsOf = (name) => new Set((m.versions.find((v) => v.name === name) || { phases: [] }).phases.map((p) => p.id))
  for (const ft of tasks) {
    if (ft.target_version !== undefined && !NAME.test(String(ft.target_version))) { errors.push('task ' + ft.id + ': target_version is not a version name'); continue }
    let targetVersion, phaseId
    if (mode.versions) {
      const own = ft.phase !== undefined ? m.phaseVersion.get(ft.phase) : undefined
      targetVersion = ft.target_version || own
      if (ft.target_version && own && ft.target_version !== own) m.overrides.push(ft.id + ' -> ' + ft.target_version)
      phaseId = targetVersion && ft.arsenale_phase && phaseIdsOf(targetVersion).has(ft.arsenale_phase) ? ft.arsenale_phase : undefined
      if (!targetVersion) targetVersion = null
    } else { targetVersion = mode.version || undefined; phaseId = ft.phase }
    const status = ft.status === undefined ? undefined : ft.status === 'todo' && ft.arsenale_status === 'backlog' ? 'backlog' : IN[ft.status]
    m.tasks.push({
      planId: ft.id, at: ft.updated_at, source: ft.source,
      fields: {
        title: ft.title === undefined ? undefined : clipCp(String(ft.title).trim(), 200), status, type: ft.type, size: ft.size, tier: ft.tier,
        ownerTask: ft.owner === undefined ? undefined : ft.owner === 'owner' ? true : null,
        targetVersion: mode.versions && ft.target_version === undefined && ft.phase === undefined ? undefined : mode.version || mode.versions ? targetVersion : undefined,
        phaseId: mode.versions ? (ft.arsenale_phase === undefined ? undefined : phaseId || null) : mode.version ? (ft.phase === undefined ? null : ft.phase) : undefined,
        acceptance: ft.acceptance === undefined ? undefined : clipCp(String(ft.acceptance), 2000),
        description: ft.notes === undefined ? undefined : clipCp(String(ft.notes), 8000),
        tokenEstimate: ft.token_estimate,
      },
    })
  }
  for (const fd of decisions) {
    m.decisions.push({
      planId: fd.id, at: fd.updated_at, source: fd.source,
      fields: {
        question: fd.question === undefined ? undefined : clipCp(String(fd.question), 1000),
        options: Array.isArray(fd.options) ? fd.options.slice(0, 8).map((o) => clipCp(String(o), 60)).filter(Boolean) : undefined,
        recommendation: fd.recommendation === undefined ? undefined : clipCp(String(fd.recommendation), 300),
        status: fd.status === undefined ? undefined : fd.status === 'decided' ? 'taken' : 'open',
        answer: fd.answer === undefined ? undefined : clipCp(String(fd.answer), 300),
      },
    })
  }
  return errors.length ? { errors } : m
}

const taskValue = (t, k) => (k === 'ownerTask' ? (t.ownerTask === true ? true : null) : norm(t[k]))
const decisionValue = (d, k) => norm(k === 'question' ? d.text : k === 'status' ? d.state : d[k])

function listDecisions(projectId) {
  const out = []
  let names = []
  try { names = fs.readdirSync(P.DECISIONS) } catch { return out }
  for (const n of names) {
    if (!n.endsWith('.json')) continue
    const d = readJson(path.join(P.DECISIONS, n), null)
    if (d && d.id && d.project === projectId) out.push(d)
  }
  return out
}

/** Works out what an import would do, without writing anything. */
function plan_(projectId, filePlan, mode, bytes, fileName) {
  const map = mapFile(filePlan, mode)
  if (map.errors) throw fail(400, 'Import refused, nothing written:\n  - ' + map.errors.join('\n  - '))
  const base = readJson(baseFile(projectId), {}) 
  const nb = { versions: Object.assign({}, base.versions), phases: Object.assign({}, base.phases), tasks: Object.assign({}, base.tasks), decisions: Object.assign({}, base.decisions) }
  const counts = { created: 0, updated: 0, unchanged: 0, flagged: 0, cleared: 0, conflicts: 0 }
  const conflicts = []
  const notes = []
  const ops = { versions: null, tasks: [], decisions: [] }
  const record = (item, field, c) => { counts.conflicts++; if (conflicts.length < 200) conflicts.push(Object.assign({ item, field }, c)) }

  // ---- versions and phases (a clone of the plan file's versions)
  const cur = Pl.readPlan(projectId)
  const versions = JSON.parse(JSON.stringify(cur.versions))
  const now = new Date().toISOString()
  for (const fv of map.versions) {
    let v = versions.find((x) => (fv.planId && x.planId === fv.planId)) || versions.find((x) => x.name === fv.name)
    const bkey = fv.name
    const fresh = !v
    if (fresh) {
      const horizon = fv.fields.horizon || 'later'
      v = { id: 'v-' + fv.name.replace(/[^\w]/g, '-'), name: fv.name, title: '', goal: '', horizon: 'later', status: 'planned', order: versions.filter((o) => o.horizon === horizon).reduce((a, o) => Math.max(a, o.order), 0) + 1, phases: [], releasedAt: '', planId: '', source: '', updatedAt: now }
      versions.push(v)
      counts.created++
    }
    if (fv.planId) v.planId = fv.planId
    if (v.missingInImport) { delete v.missingInImport; counts.cleared++ }
    const vb = base.versions && base.versions[bkey]
    const merged = Object.assign({}, vb || {})
    for (const k of Object.keys(fv.fields)) {
      const r = mergeField(fv.fields[k] === undefined ? undefined : fv.fields[k] === null ? '' : fv.fields[k], vb ? vb[k] : undefined, v[k], !!vb && !fresh, fv.at, v.updatedAt)
      if (r.skip) continue
      if (r.conflict) record('version ' + v.name, k, r.conflict)
      merged[k] = r.value
      if (!r.take) continue
      if (k === 'status') {
        if (r.value === 'active' && versions.some((o) => o !== v && o.status === 'active')) { notes.push('version ' + v.name + ': stays ' + v.status + ' (another version is active)'); continue }
        if (r.value === 'released' && v.status !== 'released') v.releasedAt = now
        if (r.value !== 'released') v.releasedAt = ''
      }
      if (k === 'horizon' && !['now', 'next', 'later'].includes(r.value)) continue
      if (k === 'status' && !Pl.VSTATUS.includes(r.value)) continue
      v[k] = String(r.value == null ? '' : r.value)
      if (!fresh) counts.updated++
    }
    nb.versions[bkey] = merged
    if (fv.order !== undefined && fresh) v.order = fv.order
    for (const fp of fv.phases) {
      let ph = v.phases.find((p) => p.id === fp.id)
      const pfresh = !ph
      if (pfresh) { ph = { id: fp.id, title: '', goal: '', order: v.phases.reduce((a, p) => Math.max(a, p.order), 0) + 1, status: 'todo' }; v.phases.push(ph); if (!fresh) counts.created++ }
      const pk = fv.name + '/' + fp.id
      const pb = base.phases && base.phases[pk]
      const pm = Object.assign({}, pb || {})
      for (const k of ['title', 'goal', 'status']) {
        const r = mergeField(fp.fields[k], pb ? pb[k] : undefined, ph[k], !!pb && !pfresh, fp.at || fv.at, v.updatedAt)
        if (r.skip) continue
        if (r.conflict) record('phase ' + pk, k, r.conflict)
        pm[k] = r.value
        if (!r.take) continue
        if (k === 'status' && !Pl.PSTATUS.includes(r.value)) continue
        ph[k] = String(r.value == null ? '' : r.value)
        if (!pfresh) counts.updated++
      }
      nb.phases[pk] = pm
    }
  }
  // versions with a planId that the (versions-mode) file no longer lists
  if (mode.versions) {
    const inFile = new Set(map.versions.map((x) => x.planId))
    for (const v of versions) if (v.planId && !inFile.has(v.planId) && !v.missingInImport) { v.missingInImport = true; counts.flagged++ }
  }
  const stamp = (v) => { v.updatedAt = now }
  const before = JSON.stringify(cur.versions)
  if (JSON.stringify(versions) !== before) for (const v of versions) { const o = cur.versions.find((x) => x.name === v.name); if (!o || JSON.stringify(o) !== JSON.stringify(v)) stamp(v) }
  ops.versions = JSON.stringify(versions) === before ? null : versions

  // ---- tasks
  const tasks = T().listTasks().filter((t) => t.projectId === projectId).map((s) => T().readTask(s.id)).filter(Boolean)
  const seenIds = new Set()
  for (const ft of map.tasks) {
    seenIds.add(ft.planId)
    const t = tasks.find((x) => x.planId === ft.planId) || tasks.find((x) => x.id === ft.planId && !x.planId)
    if (!t) {
      const input = { projectId, planId: ft.planId, source: ft.source }
      for (const k of T_FIELDS) if (ft.fields[k] !== undefined && ft.fields[k] !== null) input[k] = ft.fields[k]
      ops.tasks.push({ create: input })
      nb.tasks[ft.planId] = Object.fromEntries(T_FIELDS.filter((k) => ft.fields[k] !== undefined).map((k) => [k, norm(ft.fields[k])]))
      counts.created++
      continue
    }
    const hasBase = !!(base.tasks && base.tasks[ft.planId])
    const bb = (base.tasks && base.tasks[ft.planId]) || {}
    const merged = Object.assign({}, bb)
    const patch = {}
    for (const k of T_FIELDS) {
      const r = mergeField(ft.fields[k], bb[k], taskValue(t, k), hasBase, ft.at, t.updatedAt)
      if (r.skip) continue
      if (r.conflict) record('task ' + ft.planId, k, r.conflict)
      merged[k] = norm(r.value)
      if (r.take) patch[k] = r.value == null ? (k === 'description' ? '' : null) : r.value
    }
    if ('targetVersion' in patch && !('phaseId' in patch) && t.phaseId) patch.phaseId = null
    if (!t.planId) patch.planId = ft.planId
    if (ft.source !== undefined && ft.source !== t.source) patch.source = ft.source
    if (t.missingInImport) { patch.missingInImport = null; counts.cleared++ }
    nb.tasks[ft.planId] = merged
    if (Object.keys(patch).length) { ops.tasks.push({ update: t.id, patch }); counts.updated++ } else counts.unchanged++
  }
  for (const t of tasks) {
    if (!t.planId || seenIds.has(t.planId) || t.missingInImport) continue
    // a --version import only speaks for the tasks of that version
    if (mode.version && t.targetVersion !== mode.version) continue
    if (t.status === 'cancelled') continue
    ops.tasks.push({ update: t.id, patch: { missingInImport: true } })
    counts.flagged++
  }

  // ---- decisions
  const decs = listDecisions(projectId)
  const decSeen = new Set()
  for (const fd of map.decisions) {
    decSeen.add(fd.planId)
    const d = decs.find((x) => x.planId === fd.planId)
    if (!d) {
      ops.decisions.push({ create: Object.assign({ planId: fd.planId, source: fd.source, project: projectId, targetVersion: mode.version }, decisionInput(fd.fields)) })
      nb.decisions[fd.planId] = Object.fromEntries(D_FIELDS.filter((k) => fd.fields[k] !== undefined).map((k) => [k, norm(fd.fields[k])]))
      counts.created++
      continue
    }
    const hasBase = !!(base.decisions && base.decisions[fd.planId])
    const bb = (base.decisions && base.decisions[fd.planId]) || {}
    const merged = Object.assign({}, bb)
    const patch = {}
    for (const k of D_FIELDS) {
      const r = mergeField(fd.fields[k], bb[k], decisionValue(d, k), hasBase, fd.at, d.updatedAt)
      if (r.skip) continue
      if (r.conflict) record('decision ' + fd.planId, k, r.conflict)
      merged[k] = norm(r.value)
      if (r.take) patch[k] = r.value
    }
    if (d.missingInImport) { patch.missingInImport = false; counts.cleared++ }
    nb.decisions[fd.planId] = merged
    if (Object.keys(patch).length) { ops.decisions.push({ update: d.id, patch: decisionInput(patch, true) }); counts.updated++ } else counts.unchanged++
  }
  for (const d of decs) {
    if (!d.planId || decSeen.has(d.planId) || d.missingInImport) continue
    if (mode.version && d.targetVersion !== mode.version) continue
    ops.decisions.push({ update: d.id, patch: { missingInImport: true } })
    counts.flagged++
  }

  const lastImport = { at: now, file: path.basename(fileName), sha256: crypto.createHash('sha256').update(bytes).digest('hex'), counts, conflicts, missing: counts.flagged }
  const changed = !!(ops.versions || ops.tasks.length || ops.decisions.length) || (map.runs !== undefined && !same(JSON.stringify(map.runs), JSON.stringify((readJson(worklogFile(projectId), {}).runs))))
  return { map, ops, nb, counts, conflicts, notes, lastImport, changed, overrides: map.overrides, sameFile: !!(cur.lastImport && cur.lastImport.sha256 === lastImport.sha256) }
}

function decisionInput(f, partial) {
  const o = {}
  if (f.question !== undefined) o.text = f.question
  if (f.options !== undefined) o.options = f.options || []
  for (const k of ['recommendation', 'answer']) if (f[k] !== undefined) o[k] = f[k] || ''
  if (f.status !== undefined) o.state = f.status || 'open'
  if (f.missingInImport !== undefined) o.missingInImport = f.missingInImport
  if (!partial && !o.text) o.text = '(no question)'
  return o
}

/** Imports a schema-v1 plan into a project. `actor` must be the owner (board);
 *  a dry run needs none. Returns { counts, conflicts, notes, dryRun, ... }. */
function importPlan(file, opts, actor) {
  opts = opts || {}
  let stat
  try { stat = fs.statSync(file) } catch (e) { throw fail(400, 'cannot read ' + clipCp(file, 80) + ': ' + (e.code || 'error')) }
  if (stat.size > S.MAX_BYTES) throw fail(400, 'The file is larger than 5 MB, refused')
  const bytes = fs.readFileSync(file)
  const r = S.check(bytes)
  if (!r.ok) throw fail(400, 'Import refused, nothing written. ' + r.errors.length + ' problem(s):\n  - ' + r.errors.join('\n  - '))
  const filePlan = JSON.parse(String(bytes))
  if ((filePlan.tasks || []).length + (filePlan.decisions || []).length + (filePlan.phases || []).length > MAX_ITEMS) throw fail(400, 'More than ' + MAX_ITEMS + ' items, refused')
  const projectId = String(opts.project || '')
  Pl.fileOf(projectId)
  if (opts.shadow && opts.promote) throw fail(400, 'Use --shadow or --promote, not both')
  const mode = modeOf(opts) || { none: true }
  if (mode.none && (filePlan.phases || []).length) throw fail(400, NO_MODE)
  if (!opts.dryRun && (!actor || actor.role !== 'board')) throw fail(403, 'Only the owner can import a plan. Set ARSENALE_BOARD_TOKEN, or use --dry-run.')
  if (opts.shadow) return require('./plan-migrate.cjs').shadowImport(file, opts, actor)
  if (opts.promote && !opts.dryRun) return require('./plan-migrate.cjs').promote(file, opts, actor)
  const co = require('./agent-company.cjs').readCompany()
  if (!co.projects.some((p) => p.id === projectId)) throw fail(400, 'no such project: ' + clipCp(projectId, 40))
  const res = plan_(projectId, filePlan, mode, bytes, file)
  const out = { project: projectId, dryRun: !!opts.dryRun, counts: res.counts, conflicts: res.conflicts, notes: res.notes, targetVersionOverrides: res.overrides }
  if (opts.dryRun) return out
  const imp = Object.assign({}, actor, { importer: true })
  // All or nothing: the whole write runs under the plan file's lock and a refused step puts every
  // file it touched back as it was (the folder is never left half imported).
  const issuesDir = path.join(P.COMPANY, 'issues')
  const names = (d) => { try { return fs.readdirSync(d) } catch { return [] } }
  const bf = baseFile(projectId)
  const saved = new Map(), readOnce = (f) => { if (!saved.has(f)) { let b = null; try { b = fs.readFileSync(f) } catch { /* none yet */ } saved.set(f, b) } }
  readOnce(Pl.fileOf(projectId)); readOnce(bf); readOnce(worklogFile(projectId))
  for (const op of res.ops.tasks) if (op.update) readOnce(path.join(issuesDir, op.update + '.json'))
  for (const op of res.ops.decisions) if (op.update) readOnce(path.join(P.DECISIONS, op.update + '.json'))
  const had = { issues: new Set(names(issuesDir)), decisions: new Set(names(P.DECISIONS)) }
  const rollback = () => {
    for (const [d, set] of [[issuesDir, had.issues], [P.DECISIONS, had.decisions]]) for (const n of names(d)) if (!set.has(n)) { try { fs.rmSync(path.join(d, n), { force: true }) } catch { /* gone */ } }
    for (const [f, b] of saved) { try { if (b === null) fs.rmSync(f, { force: true }); else writeAtomic(f, b) } catch { /* best effort */ } }
  }
  const B = require('./build-agent-dashboard.cjs')
  const writeAll = () => {
    if (res.changed || !res.sameFile) {
      // plan file first: tasks check their phase against it
      Pl.mutate(projectId, imp, (p) => {
        if (res.ops.versions) p.versions = res.ops.versions
        if (res.changed || !res.sameFile) p.lastImport = res.lastImport
        if (p.master !== 'shadow') p.master = 'import'
      })
    }
    for (const op of res.ops.tasks) {
      if (op.create) {
        const { status, ...rest } = op.create
        const t = T().createTask(Object.assign({}, rest, { status: status === 'backlog' ? 'backlog' : 'todo' }), imp)
        if (status && !['todo', 'backlog'].includes(status)) T().updateTask({ id: t.id, status }, imp)
      } else T().updateTask(Object.assign({ id: op.update }, op.patch), imp)
    }
    for (const op of res.ops.decisions) B.saveDecision(op.create ? op.create : Object.assign({ id: op.update }, op.patch))
    if (filePlan.runs !== undefined) {
      const wl = readJson(worklogFile(projectId), {})
      if (JSON.stringify(wl.runs) !== JSON.stringify(filePlan.runs)) { fs.mkdirSync(Pl.DIR, { recursive: true }); writeAtomic(worklogFile(projectId), JSON.stringify({ projectId, runs: filePlan.runs }, null, 2)) }
    }
    if (JSON.stringify(readJson(bf, {})) !== JSON.stringify(res.nb)) { fs.mkdirSync(path.dirname(bf), { recursive: true }); writeAtomic(bf, JSON.stringify(res.nb, null, 2)) }
  }
  fs.mkdirSync(Pl.DIR, { recursive: true })
  withLock(Pl.fileOf(projectId), () => { try { writeAll() } catch (e) { rollback(); throw e } })
  // one line for the supervisor, not one per imported task
  if (res.counts.created || res.counts.updated || res.counts.flagged) {
    try { require('./agent-company.cjs').inboxLine({ type: 'plan.imported', id: projectId, summary: 'Plan imported into ' + projectId + ': ' + res.counts.created + ' created, ' + res.counts.updated + ' updated, ' + res.counts.flagged + ' gone from the file' }, actor.door) } catch { /* the inbox is optional */ }
  }
  return out
}

/** The project as a schema-v1 object, plus what was left out. Never writes. */
function exportPlan(projectId, opts) {
  opts = opts || {}
  const mode = modeOf(opts)
  if (!mode) throw fail(400, NO_MODE)
  const plan = Pl.readPlan(projectId)
  let rows = T().listTasks().filter((t) => t.projectId === projectId).map((s) => T().readTask(s.id)).filter(Boolean)
  const summary = { cancelled: 0, goneFromImport: 0 }
  if (opts.onlyImported) rows = rows.filter((t) => t.planId)
  rows = rows.filter((t) => { if (t.status === 'cancelled') { summary.cancelled++; return false } if (t.missingInImport) { summary.goneFromImport++; return false } return true })
  if (mode.version) rows = rows.filter((t) => t.targetVersion === mode.version)
  const idOf = (t) => t.planId || t.id
  const phaseIdOf = new Map()
  const out = { schema_version: 1, project: projectId, phases: [], tasks: [] }
  const phaseStatus = (ph, ts) => Pl.phaseStatus(ph, ts)
  if (mode.versions) {
    const ars = { phases: {}, versions: {} }
    for (const v of plan.versions.filter((x) => !x.missingInImport).slice().sort((a, b) => Pl.cmpName(a.name, b.name))) {
      const id = v.planId || v.id
      phaseIdOf.set(v.name, id)
      const ts = rows.filter((t) => t.targetVersion === v.name)
      const ph = { id, title: v.title, version: v.name, goal: v.goal, status: phaseStatus({ status: v.status === 'released' ? 'done' : 'todo' }, ts) }
      out.phases.push(ph)
      ars.versions[v.name] = { horizon: v.horizon, status: v.status, order: v.order }
      if (v.phases.length) ars.phases[v.name] = v.phases.slice().sort((a, b) => a.order - b.order).map((p) => ({ id: p.id, title: p.title, goal: p.goal, order: p.order, status: phaseStatus(p, ts.filter((t) => t.phaseId === p.id)) }))
    }
    out.arsenale = ars
  } else {
    const v = plan.versions.find((x) => x.name === mode.version)
    for (const p of (v ? v.phases : []).slice().sort((a, b) => a.order - b.order)) out.phases.push({ id: p.id, title: p.title, goal: p.goal, status: phaseStatus(p, rows.filter((t) => t.phaseId === p.id)) })
  }
  for (const t of rows) {
    const o = { id: idOf(t), title: t.title, status: OUT[t.status] || 'todo' }
    if (t.status === 'backlog') o.arsenale_status = 'backlog'
    if (mode.versions) {
      if (t.targetVersion && phaseIdOf.has(t.targetVersion)) o.phase = phaseIdOf.get(t.targetVersion)
      else if (t.targetVersion) o.target_version = t.targetVersion
      if (t.phaseId) o.arsenale_phase = t.phaseId
    } else if (t.phaseId) o.phase = t.phaseId
    for (const k of ['type', 'size', 'tier']) if (t[k]) o[k] = t[k]
    o.owner = t.ownerTask === true ? 'owner' : 'agent'
    if (t.acceptance) o.acceptance = t.acceptance
    if (t.description) o.notes = t.description
    if (t.updatedAt) o.updated_at = t.updatedAt
    if (t.tokenEstimate !== undefined) o.token_estimate = t.tokenEstimate
    if (t.source) o.source = t.source
    out.tasks.push(o)
  }
  out.tasks.sort((a, b) => natural(a.id, b.id))
  const decisions = listDecisions(projectId).filter((d) => !d.missingInImport && (!opts.onlyImported || d.planId) && (d.planId || Array.isArray(d.options)) && (!mode.version || d.targetVersion === mode.version))
  out.decisions = decisions.map((d) => {
    const o = { id: d.planId || d.id, question: d.text, status: d.state === 'open' ? 'open' : 'decided' }
    if (Array.isArray(d.options) && d.options.length) o.options = d.options
    if (d.recommendation) o.recommendation = d.recommendation
    if (d.answer) o.answer = d.answer
    if (d.updatedAt) o.updated_at = d.updatedAt
    if (d.source) o.source = d.source
    return o
  }).sort((a, b) => natural(a.id, b.id))
  // imported runs unchanged, plus the ledger rows of this project's tasks
  const own = new Map(rows.map((t) => [t.id, idOf(t)]))
  // a run of a task that is not in this export (gone from the import, other version) would point nowhere
  const exported = new Set(rows.map(idOf))
  const all = readJson(worklogFile(projectId), {}).runs || []
  const runs = all.filter((r) => !r.task_id || exported.has(r.task_id))
  summary.runsLeftOut = all.length - runs.length
  const ids = new Set(runs.map((r) => r.id))
  let names = []
  try { names = fs.readdirSync(P.RUNS).filter((n) => n.endsWith('.json')) } catch { /* no runs */ }
  for (const n of opts.onlyImported ? [] : names) {
    const r = readJson(path.join(P.RUNS, n), null)
    if (!r || !r.issue || !own.has(r.issue)) continue
    const id = String(r.id || n.replace(/\.json$/, ''))
    if (ids.has(id)) continue
    const run = { id, task_id: own.get(r.issue), date: String(r.startedAt || r.finishedAt || '').slice(0, 10) || undefined, agent: r.agent, model: r.model || undefined, cost: 'n/a' }
    if (r.durationMs) run.wall_seconds = Math.round(r.durationMs / 1000)
    for (const k of Object.keys(run)) if (run[k] === undefined) delete run[k]
    runs.push(run)
  }
  if (runs.length) out.runs = runs
  const chk = S.check(out)
  if (!chk.ok) throw fail(500, 'The export did not pass plan-check:\n  - ' + chk.errors.join('\n  - '))
  return { plan: out, summary }
}

function run(args, say, cmd) {
  const flags = ['--project', '--phases-as', '--version', '--out']
  const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined }
  const rest = args.filter((a, i) => !a.startsWith('--') && !flags.includes(args[i - 1]))
  const json = args.includes('--json')
  const opts = { project: val('--project'), phasesAs: val('--phases-as'), version: val('--version'), dryRun: args.includes('--dry-run'), shadow: args.includes('--shadow'), promote: args.includes('--promote') }
  try {
    if (!opts.project) throw fail(400, 'usage: arsenale ' + cmd + ' ' + (cmd === 'import-plan' ? '<file> ' : '') + '--project <id> (--phases-as versions | --version <name>)')
    if (cmd === 'import-plan') {
      if (!rest[0]) throw fail(400, 'usage: arsenale import-plan <file> --project <id> (--phases-as versions | --version <name>) [--dry-run]')
      const actor = opts.dryRun ? null : cliActor({ by: 'board' })
      const r = importPlan(rest[0], opts, actor)
      if (json) say(JSON.stringify(r, null, 2))
      else {
        const c = r.counts
        if (r.shadow) say('Shadow of HQ written to ' + r.shadow + ' (the live company was not touched)')
        if (r.promoted) say('Promoted. Backup ' + r.backup + '. Parity: clean. Undo with: arsenale plan restore ' + r.backup)
        say((r.dryRun ? 'Dry run, nothing written. ' : '') + 'Created ' + c.created + ', updated ' + c.updated + ', unchanged ' + c.unchanged + ', gone from the file ' + c.flagged + ', cleared ' + c.cleared + ', conflicts ' + c.conflicts)
        for (const x of r.conflicts) say('  conflict: ' + x.item + ' ' + x.field + ': file ' + JSON.stringify(x.file) + ', Arsenale ' + JSON.stringify(x.arsenale) + ' (kept ' + x.kept + ')')
        for (const x of r.notes) say('  note: ' + x)
        if (r.targetVersionOverrides.length) say('  target_version overrides: ' + r.targetVersionOverrides.join(', '))
      }
      return r.counts.conflicts ? 2 : 0
    }
    const { plan, summary } = exportPlan(opts.project, opts)
    const text = JSON.stringify(plan, null, 2) + '\n'
    const out = val('--out')
    if (!out) { say(text.trimEnd()); return 0 }
    if (fs.existsSync(out) && !args.includes('--force')) throw fail(400, out + ' exists: use --force to overwrite it')
    fs.writeFileSync(out, text)
    say(json ? JSON.stringify(Object.assign({ file: out }, summary)) : 'Wrote ' + out + ': ' + plan.tasks.length + ' tasks' + (summary.cancelled ? ', ' + summary.cancelled + ' cancelled left out' : '') + (summary.goneFromImport ? ', ' + summary.goneFromImport + ' gone from the last import left out' : ''))
    return 0
  } catch (e) { say(e.message); return 1 }
}

module.exports = { importPlan, exportPlan, run, mergeField, baseFile, worklogFile }
