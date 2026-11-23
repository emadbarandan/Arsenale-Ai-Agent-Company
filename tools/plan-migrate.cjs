/* Migration tooling (spec 1.4 section 10): parity check, shadow store,
 * promote, backup and restore.
 *
 *   arsenale plan-parity <hq-export.json> --project <id> (--phases-as versions | --version <name>) [--shadow] [--only-imported] [--json] [--write]
 *   arsenale import-plan <file> --project <id> ... --shadow        (M2: writes only <home>/shadow/<id>/)
 *   arsenale import-plan <file> --project <id> ... --promote       (M3: backup, import, parity, undo on a difference)
 *   arsenale plan restore <plan-m3-stamp>                          (owner key)
 *   arsenale shadow drop --project <id>                            (owner key)
 *
 * Arsenale never reads HQ: the only input is a copy of an export file. No
 * command here opens a network connection. A shadow is a complete small data
 * folder of its own (the plan-io code runs in a child process whose
 * ARSENALE_HOME is the shadow folder), so the live company is never touched. */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { spawnSync } = require('child_process')
const P = require('./paths.cjs')
const S = require('./plan-schema.cjs')
const Pl = require('./plan.cjs')
const { writeAtomic } = require('./build-agent-dashboard.cjs')
const { fail, clipCp, cliActor } = require('./runlog.cjs')

const IO = () => require('./plan-io.cjs')
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex')
const norm = (v) => (v === undefined || v === '' || v === false ? null : v)
const same = (a, b) => JSON.stringify(norm(a)) === JSON.stringify(norm(b))
const BACKUP_NAME = /^plan-m3-[0-9A-Za-z-]{1,60}$/
const ROOT_NAMES = ['company', 'decisions', 'shadow']
const COMPANY_FILES = ['company.json', 'offices.json', 'projects.json', 'employees.json']
const needBoard = (actor) => { if (!actor || actor.role !== 'board') throw fail(403, 'Only the owner can do this. Set ARSENALE_BOARD_TOKEN.') }

const shadowDir = (projectId) => Pl.under(path.join(P.HOME, 'shadow'), Pl.checkId(projectId))
const backupsDir = () => path.join(P.HOME, 'backups')

// ---------------------------------------------------------------- shadow

const CHILD = [
  "const job = JSON.parse(process.env.ARSENALE_MIGRATE_JOB)",
  "const IO = require(job.io)",
  "try {",
  "  const out = job.op === 'view' ? (() => { const Pl = require(job.plan), Tk = require(job.tasks); return Object.assign(Pl.view(job.project, Tk.listTasks()), { tasks: Tk.listTasks() }) })() : job.op === 'import' ? IO.importPlan(job.file, job.opts, { door: 'cli', role: 'board', name: '' }) : IO.exportPlan(job.project, job.opts)",
  "  process.stdout.write(JSON.stringify(out))",
  "} catch (e) { process.stderr.write(String(e && e.message || e)); process.exit(3) }",
].join('\n')

/** Runs a plan-io call with the shadow folder as the data folder. */
function inShadow(projectId, job) {
  const dir = shadowDir(projectId)
  const env = Object.assign({}, process.env, { ARSENALE_HOME: dir, ARSENALE_MIGRATE_JOB: JSON.stringify(Object.assign({ io: path.join(__dirname, 'plan-io.cjs'), plan: path.join(__dirname, 'plan.cjs'), tasks: path.join(__dirname, 'tasks.cjs') }, job)) })
  delete env.ARSENALE_AGENT_DIRS; delete env.ARSENALE_TRANSCRIPT_ROOTS
  const r = spawnSync(process.execPath, ['-e', CHILD], { env, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
  if (r.status !== 0) throw fail(400, (r.stderr || 'the shadow step failed').trim())
  return JSON.parse(r.stdout)
}

function ensureShadowCompany(projectId) {
  const dir = shadowDir(projectId)
  const dst = path.join(dir, 'company')
  fs.mkdirSync(dst, { recursive: true })
  let copied = 0
  for (const n of COMPANY_FILES) {
    const from = path.join(P.COMPANY, n)
    if (!fs.existsSync(from)) continue
    fs.copyFileSync(from, path.join(dst, n))
    copied++
  }
  if (!copied) throw fail(400, 'There is no company to take the project list from: run arsenale company init first')
  return dir
}

/** M2: imports into <home>/shadow/<project>/ only. */
function shadowImport(file, opts, actor) {
  needBoard(actor)
  if (opts.dryRun) throw fail(400, '--shadow and --dry-run cannot be combined: a shadow import is itself a copy that touches nothing live')
  if (opts.promote) throw fail(400, 'Use --shadow or --promote, not both')
  const projectId = String(opts.project || '')
  const co = require('./agent-company.cjs').readCompany()
  if (!co.projects.some((p) => p.id === projectId)) throw fail(400, 'no such project: ' + clipCp(projectId, 40))
  const dir = ensureShadowCompany(projectId)
  const out = inShadow(projectId, { op: 'import', file: path.resolve(file), opts: { project: projectId, phasesAs: opts.phasesAs, version: opts.version } })
  // the shadow plan file says master "shadow": every writer but the next shadow import refuses it
  const pf = path.join(dir, 'company', 'plan', projectId + '.json')
  let planFile = null
  try { planFile = JSON.parse(fs.readFileSync(pf, 'utf8')) } catch { /* the import wrote none: nothing to mark */ }
  if (planFile && typeof planFile === 'object') { planFile.master = 'shadow'; writeAtomic(pf, JSON.stringify(planFile, null, 2)) }
  writeAtomic(path.join(dir, 'shadow.json'), JSON.stringify({ project: projectId, note: 'Shadow copy of HQ. HQ is the master; editing is off.', importedAt: new Date().toISOString(), sha256: sha(fs.readFileSync(file)) }, null, 2))
  out.shadow = path.relative(P.HOME, dir)
  return out
}

/** The shadow of a project as the Dock lists it, read-only: the plan view plus the shadow's tasks.
 *  null when there is no shadow. Runs in the shadow's own data folder; the live company is not read. */
function shadowView(projectId) {
  const dir = shadowDir(projectId)
  if (!fs.existsSync(path.join(dir, 'shadow.json'))) return null
  const v = inShadow(projectId, { op: 'view', project: projectId })
  v.master = 'shadow'
  return v
}
const hasShadow = (projectId) => { try { return fs.existsSync(path.join(shadowDir(projectId), 'shadow.json')) } catch { return false } }

function shadowDrop(projectId, actor) {
  needBoard(actor)
  const dir = shadowDir(projectId)
  if (!fs.existsSync(dir)) throw fail(404, 'There is no shadow for ' + clipCp(projectId, 40))
  if (!fs.existsSync(path.join(dir, 'shadow.json'))) throw fail(400, 'That folder is not a shadow copy (no shadow.json): nothing was deleted')
  fs.rmSync(dir, { recursive: true, force: true })
  return { dropped: path.relative(P.HOME, dir) }
}

// ---------------------------------------------------------------- parity

const task4 = ['title', 'status', 'size', 'type', 'phase', 'target_version']
const meters = ['input', 'output', 'cache_read', 'cache_write']

/** Compares the HQ file with the Arsenale-side export. Pure. */
function compare(hq, ars) {
  const diffs = []
  const add = (where, field, a, b) => diffs.push({ where, field, hq: a === undefined ? null : a, arsenale: b === undefined ? null : b })
  const ht = new Map((hq.tasks || []).map((t) => [t.id, t])), at = new Map((ars.tasks || []).map((t) => [t.id, t]))
  for (const [id, t] of ht) {
    const o = at.get(id)
    if (!o) { add('task ' + id, 'missing', 'present', 'absent'); continue }
    for (const k of task4) if (!same(t[k], o[k])) add('task ' + id, k, t[k], o[k])
  }
  for (const id of at.keys()) if (!ht.has(id)) add('task ' + id, 'missing', 'absent', 'present')
  const hd = new Map((hq.decisions || []).map((d) => [d.id, d])), ad = new Map((ars.decisions || []).map((d) => [d.id, d]))
  for (const [id, d] of hd) {
    const o = ad.get(id)
    if (!o) { add('decision ' + id, 'missing', 'present', 'absent'); continue }
    if (!same(d.status, o.status)) add('decision ' + id, 'status', d.status, o.status)
  }
  for (const id of ad.keys()) if (!hd.has(id)) add('decision ' + id, 'missing', 'absent', 'present')
  const hr = new Map((hq.runs || []).map((r) => [r.id, r])), ar = new Map((ars.runs || []).map((r) => [r.id, r]))
  for (const id of hr.keys()) if (!ar.has(id)) add('run ' + id, 'missing', 'present', 'absent')
  for (const id of ar.keys()) if (!hr.has(id)) add('run ' + id, 'missing', 'absent', 'present')
  // the totals follow from the items: they are reported only when every item matches, so one wrong size is one difference
  if (!diffs.length) {
    const a = S.summarise(hq), b = S.summarise(ars)
    const pa = new Map(a.progress.phases.map((p) => [p.id, p])), pb = new Map(b.progress.phases.map((p) => [p.id, p]))
    for (const [id, p] of pa) {
      const q = pb.get(id)
      if (!q) { add('phase ' + id, 'missing', 'present', 'absent'); continue }
      for (const k of ['tasks', 'doneWeight', 'totalWeight', 'percent']) if (p[k] !== q[k]) add('phase ' + id, k, p[k], q[k])
    }
    const oa = a.progress.overall || {}, ob = b.progress.overall || {}
    for (const k of ['tasks', 'doneWeight', 'totalWeight', 'percent']) if ((oa[k] || 0) !== (ob[k] || 0)) add('overall', k, oa[k] || 0, ob[k] || 0)
    for (const m of meters) if (a.runs.usage[m] !== b.runs.usage[m]) add('runs', m, a.runs.usage[m], b.runs.usage[m])
    for (const k of ['count', 'pricedRuns', 'costUsd', 'usdStatus']) if (a.runs[k] !== b.runs[k]) add('runs', k, a.runs[k], b.runs[k])
    const cnt = (p, f) => (p.tasks || []).filter(f).length
    for (const s of ['todo', 'doing', 'review', 'blocked', 'done']) if (cnt(hq, (t) => (t.status || 'todo') === s) !== cnt(ars, (t) => (t.status || 'todo') === s)) add('status ' + s, 'tasks', cnt(hq, (t) => (t.status || 'todo') === s), cnt(ars, (t) => (t.status || 'todo') === s))
  }
  return diffs
}

function parity(file, opts) {
  let bytes
  try { bytes = fs.readFileSync(file) } catch (e) { throw fail(400, 'cannot read ' + clipCp(file, 80) + ': ' + (e.code || 'error')) }
  const r = S.check(bytes)
  if (!r.ok) throw fail(400, 'The file does not pass plan-check:\n  - ' + r.errors.join('\n  - '))
  const hq = JSON.parse(String(bytes))
  const projectId = String(opts.project || '')
  Pl.fileOf(projectId)
  const eo = { phasesAs: opts.phasesAs, version: opts.version, onlyImported: !!opts.onlyImported }
  let ars
  if (opts.shadow) {
    if (!fs.existsSync(path.join(shadowDir(projectId), 'company'))) throw fail(404, 'There is no shadow for ' + clipCp(projectId, 40) + ': import with --shadow first')
    ars = inShadow(projectId, { op: 'export', project: projectId, opts: eo }).plan
  } else ars = IO().exportPlan(projectId, eo).plan
  const differences = compare(hq, ars)
  return { project: projectId, target: opts.shadow ? 'shadow' : 'live', clean: !differences.length, differences, date: new Date().toISOString(), fileSha256: sha(bytes) }
}

function parityText(r) {
  const L = [r.clean ? 'Parity: clean' : 'Parity: ' + r.differences.length + ' difference' + (r.differences.length === 1 ? '' : 's')]
  for (const d of r.differences) L.push('  ' + d.where + ' ' + d.field + ': HQ ' + JSON.stringify(d.hq) + ', Arsenale ' + JSON.stringify(d.arsenale))
  return L.join('\n')
}

// ---------------------------------------------------------------- backup, promote, restore

function rootDirs(projectId) {
  return { company: P.COMPANY, decisions: P.DECISIONS, shadow: shadowDir(projectId) }
}

/** Every regular file and directory under a root, relative to it. */
function walk(rootDir) {
  const files = [], dirs = []
  const rec = (d, rel) => {
    let es = []
    try { es = fs.readdirSync(d, { withFileTypes: true }) } catch { return }
    for (const e of es) {
      const r = rel ? rel + '/' + e.name : e.name
      if (e.isDirectory()) { dirs.push(r); rec(path.join(d, e.name), r) } else if (e.isFile()) files.push(r)
    }
  }
  rec(rootDir, '')
  return { files, dirs }
}

function inside(dir, rel) {
  if (typeof rel !== 'string' || !rel || path.isAbsolute(rel) || rel.split(/[\\/]/).includes('..') || rel.includes('\0')) return null
  const full = path.resolve(dir, rel)
  const back = path.relative(dir, full)
  return back && !back.startsWith('..') && !path.isAbsolute(back) ? full : null
}

function snapshot(projectId) {
  const roots = rootDirs(projectId)
  const out = {}
  for (const [name, dir] of Object.entries(roots)) out[name] = walk(dir)
  return out
}

const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').replace(/\.(\d+)Z$/, '$1')

/** Copies every file the promote may change (the company folder, the decisions folder, the shadow) and writes the manifest. */
function makeBackup(projectId, sourceSha) {
  fs.mkdirSync(backupsDir(), { recursive: true })
  let name = 'plan-m3-' + stamp(), n = 1
  while (fs.existsSync(path.join(backupsDir(), name))) name = 'plan-m3-' + stamp() + '-' + (++n)
  const dir = path.join(backupsDir(), name)
  fs.mkdirSync(path.join(dir, 'files'), { recursive: true })
  const roots = rootDirs(projectId), snap = snapshot(projectId)
  const manifest = { version: 1, kind: 'plan-m3', project: projectId, createdAt: new Date().toISOString(), sourceSha256: sourceSha, files: [], dirs: [], created: null, createdDirs: null, status: 'before-import' }
  for (const [rootName, s] of Object.entries(snap)) {
    for (const rel of s.files) {
      const buf = fs.readFileSync(path.join(roots[rootName], rel))
      const to = path.join(dir, 'files', rootName, rel)
      fs.mkdirSync(path.dirname(to), { recursive: true })
      fs.writeFileSync(to, buf)
      manifest.files.push({ root: rootName, rel, sha256: sha(buf), size: buf.length })
    }
    for (const rel of s.dirs) manifest.dirs.push({ root: rootName, rel })
  }
  writeAtomic(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2))
  return { name, dir, manifest }
}

function finishManifest(b, projectId, status) {
  const roots = rootDirs(projectId), snap = snapshot(projectId)
  const had = new Set(b.manifest.files.map((f) => f.root + '/' + f.rel)), hadDirs = new Set(b.manifest.dirs.map((f) => f.root + '/' + f.rel))
  b.manifest.created = []; b.manifest.createdDirs = []
  for (const [rootName, s] of Object.entries(snap)) {
    for (const rel of s.files) if (!had.has(rootName + '/' + rel)) b.manifest.created.push({ root: rootName, rel })
    for (const rel of s.dirs) if (!hadDirs.has(rootName + '/' + rel)) b.manifest.createdDirs.push({ root: rootName, rel })
  }
  b.manifest.status = status
  // after a good promote: the hash of every covered file, so a later restore can tell work done since
  if (status === 'promoted') {
    b.manifest.after = {}
    for (const [rootName, s] of Object.entries(snap)) for (const rel of s.files) { try { b.manifest.after[rootName + '/' + rel] = sha(fs.readFileSync(path.join(roots[rootName], rel))) } catch { /* gone */ } }
  }
  writeAtomic(path.join(b.dir, 'manifest.json'), JSON.stringify(b.manifest, null, 2))
}

/** Puts every copied file back, removes every created file, checks the hashes. Nothing is changed when a path is refused. */
function restore(name, actor, opts) {
  needBoard(actor)
  opts = opts || {}
  if (!BACKUP_NAME.test(String(name || ''))) throw fail(400, 'usage: arsenale plan restore plan-m3-<stamp> [--force]')
  const dir = path.join(backupsDir(), name)
  let manifest
  try { manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')) } catch { throw fail(404, 'no such backup: ' + name) }
  if (!manifest || manifest.kind !== 'plan-m3' || !Array.isArray(manifest.files)) throw fail(400, 'The manifest is not a plan backup')
  const roots = rootDirs(manifest.project)
  const checkEntry = (e, what) => {
    if (!e || !ROOT_NAMES.includes(e.root)) throw fail(400, 'Refused, nothing changed: ' + what + ' names an unknown folder')
    const full = inside(roots[e.root], e.rel)
    if (!full) throw fail(400, 'Refused, nothing changed: the path ' + clipCp(e.rel, 80) + ' is outside the data folder')
    return full
  }
  // validate everything before touching anything
  const put = manifest.files.map((e) => {
    const full = checkEntry(e, 'a file entry')
    const from = inside(path.join(dir, 'files', e.root), e.rel)
    if (!from) throw fail(400, 'Refused, nothing changed: the path ' + clipCp(e.rel, 80) + ' is outside the backup')
    let buf
    try { buf = fs.readFileSync(from) } catch { throw fail(400, 'Refused, nothing changed: the backup lacks ' + clipCp(e.rel, 80)) }
    if (sha(buf) !== e.sha256) throw fail(400, 'Refused, nothing changed: the backup copy of ' + clipCp(e.rel, 80) + ' does not match its hash')
    return { e, full, buf }
  })
  // later work: files that differ from the state right after the promote would be silently undone
  if (manifest.after && typeof manifest.after === 'object' && !opts.force) {
    const since = []
    const seen = new Set()
    for (const [rootName, dirp] of Object.entries(roots)) {
      for (const rel of walk(dirp).files) {
        const key = rootName + '/' + rel
        seen.add(key)
        let h = ''
        try { h = sha(fs.readFileSync(path.join(dirp, rel))) } catch { /* gone */ }
        if (manifest.after[key] !== h) since.push(key)
      }
    }
    for (const key of Object.keys(manifest.after)) if (!seen.has(key)) since.push(key)
    if (since.length) {
      const e = fail(409, 'Refused, nothing changed: ' + since.length + ' file(s) changed since this promote, first: ' + clipCp(since[0], 80) + '. Restoring would undo that work. Run it again with --force to restore anyway.')
      e.changedSince = since.slice(0, 20)
      throw e
    }
  }
  let created = manifest.created
  if (!Array.isArray(created)) {
    // the promote did not finish: everything under the covered folders that the manifest does not list was made by it
    const had = new Set(manifest.files.map((f) => f.root + '/' + f.rel)); created = []
    for (const [r, s] of Object.entries(snapshot(manifest.project))) for (const rel of s.files) if (!had.has(r + '/' + rel)) created.push({ root: r, rel })
  }
  const rm = created.map((e) => checkEntry(e, 'a created entry'))
  const rmDirs = (manifest.createdDirs || []).map((e) => checkEntry(e, 'a created folder'))
  for (const f of rm) { try { fs.rmSync(f, { force: true }) } catch { /* gone */ } }
  for (const x of put) { fs.mkdirSync(path.dirname(x.full), { recursive: true }); fs.writeFileSync(x.full, x.buf) }
  for (const d of rmDirs.sort((a, b) => b.length - a.length)) { try { fs.rmdirSync(d) } catch { /* not empty or gone */ } }
  const bad = put.filter((x) => sha(fs.readFileSync(x.full)) !== x.e.sha256)
  if (bad.length) throw fail(500, 'Restore finished but ' + bad.length + ' file(s) do not match their hash, first: ' + clipCp(bad[0].e.rel, 80))
  return { backup: name, restored: put.length, removed: rm.length, project: manifest.project }
}

/** M3: backup, import into the live company, parity, undo on a difference. */
function promote(file, opts, actor) {
  needBoard(actor)
  if (opts.shadow) throw fail(400, 'Use --shadow or --promote, not both')
  const projectId = String(opts.project || '')
  Pl.fileOf(projectId)
  const io = IO()
  // refuse a bad file or a missing project before anything is copied
  io.importPlan(file, Object.assign({}, opts, { promote: false, shadow: false, dryRun: true }), null)
  const bytes = fs.readFileSync(file)
  const b = makeBackup(projectId, sha(bytes))
  const undo = (why) => {
    finishManifest(b, projectId, 'undone')
    restore(b.name, actor, { force: true })
    const e = fail(409, 'Promote undone, the company folder is as it was (backup ' + b.name + '): ' + why)
    e.backup = b.name
    throw e
  }
  let res
  try {
    res = io.importPlan(file, Object.assign({}, opts, { promote: false, shadow: false, dryRun: false }), actor)
    Pl.mutate(projectId, Object.assign({}, actor, { importer: true }), (p) => { p.master = 'arsenale' })
    if (fs.existsSync(shadowDir(projectId))) fs.rmSync(shadowDir(projectId), { recursive: true, force: true })
    if (typeof opts.afterImport === 'function') opts.afterImport()
  } catch (e) { if (e.backup) throw e; undo(e.message) }
  const par = parity(file, { project: projectId, phasesAs: opts.phasesAs, version: opts.version, onlyImported: true })
  if (!par.clean) undo(parityText(par))
  finishManifest(b, projectId, 'promoted')
  return Object.assign({}, res, { promoted: true, backup: b.name, parity: par })
}

// ---------------------------------------------------------------- CLI

/** `plan-parity`, `shadow drop`, `plan restore`. */
function run(args, say, cmd) {
  const flags = ['--project', '--phases-as', '--version']
  const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined }
  const rest = args.filter((a, i) => !a.startsWith('--') && !flags.includes(args[i - 1]))
  const json = args.includes('--json')
  try {
    if (cmd === 'plan-parity') {
      if (!rest[0] || !val('--project')) throw fail(400, 'usage: arsenale plan-parity <hq-export.json> --project <id> (--phases-as versions | --version <name>) [--shadow] [--only-imported] [--json] [--write]')
      if (!val('--phases-as') && !val('--version')) throw fail(400, 'Say how to read the phases: --phases-as versions, or --version <name>')
      const r = parity(rest[0], { project: val('--project'), phasesAs: val('--phases-as'), version: val('--version'), shadow: args.includes('--shadow'), onlyImported: args.includes('--only-imported') })
      if (args.includes('--write')) {
        const f = path.join(P.HOME, 'plan-parity', r.project + '-' + r.date.slice(0, 10) + '.json')
        fs.mkdirSync(path.dirname(f), { recursive: true })
        writeAtomic(f, JSON.stringify(r, null, 2))
        if (!json) say('Report: ' + path.relative(P.HOME, f))
      }
      say(json ? JSON.stringify(r, null, 2) : parityText(r))
      return r.clean ? 0 : 1
    }
    if (cmd === 'shadow') {
      if (rest[0] !== 'drop' || !val('--project')) throw fail(400, 'usage: arsenale shadow drop --project <id>')
      const r = shadowDrop(val('--project'), cliActor({ by: 'board' }))
      say(json ? JSON.stringify(r) : 'Dropped ' + r.dropped)
      return 0
    }
    if (cmd === 'restore') {
      const r = restore(rest[0], cliActor({ by: 'board' }), { force: args.includes('--force') })
      say(json ? JSON.stringify(r) : 'Restored ' + r.restored + ' file(s), removed ' + r.removed + ' created file(s), hashes match (' + r.backup + ')')
      return 0
    }
    throw fail(400, 'unknown command')
  } catch (e) { say(e.message); return 1 }
}

module.exports = { shadowView, hasShadow, shadowImport, shadowDrop, parity, compare, parityText, promote, restore, makeBackup, shadowDir, run }
