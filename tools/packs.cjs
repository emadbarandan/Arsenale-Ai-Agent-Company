/* Office packs: ready-made teams for an office (marketing, research, HR …).
 *
 * A pack is a folder in the repo, packs/<id>/:
 *   pack.json        format "arsenale-pack", formatVersion 1, id, version
 *                    (semver), names, minArsenale, the office, the members,
 *                    sample tasks, and stricter-only policy rows
 *   agents/<id>.md   one definition per member (tool-agnostic instructions)
 *   labels.fa.json   Persian titles, the format readAgents() reads
 *   README.md        what the office does
 * Only the packs bundled with this copy of Arsenale install (no "install from
 * file"): a pack is instructions a model will follow, so a stranger's pack
 * is a prompt-injection channel until packs can be signed and reviewed.
 *
 * Installed state: <home>/packs/installed.json
 *   { packs: { <id>: { version, installedAt, officeId, files: [{ id, path, sha256 }] } } }
 * The hashes are what make removal exact: a file the owner changed since the
 * install no longer matches and is kept (R-4.8).
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const P = require('./paths.cjs')
const { writeAtomic } = require('./build-agent-dashboard.cjs')
const { fail, requireBoard, actorLabel, clipCp } = require('./runlog.cjs')

const BUNDLED = path.join(__dirname, '..', 'packs')
const STATE = path.join(P.HOME, 'packs', 'installed.json')
// outside packs/: an installed copy of Arsenale may keep its bundled packs there
const NEW_TEXT = path.join(P.HOME, 'pack-updates')
const PACK_ID = /^[a-z][a-z0-9-]{1,30}$/
const MEMBER_ID = /^[a-z][a-z0-9-]{1,59}$/
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/
const APP_VERSION = (() => { try { return require('../package.json').version } catch { return '1.0.0' } })()

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex')
const company = () => require('./agent-company.cjs')
function cmpSemver(a, b) {
  const x = SEMVER.exec(a), y = SEMVER.exec(b)
  if (!x || !y) return NaN
  for (let i = 1; i <= 3; i++) if (+x[i] !== +y[i]) return +x[i] - +y[i]
  return 0
}

/** One pack folder, checked against the format. Throws with the reason. */
function readPack(dir) {
  let j
  try { j = JSON.parse(P.stripBom(fs.readFileSync(path.join(dir, 'pack.json'), 'utf8'))) } catch (e) { throw fail(400, 'pack.json is missing or not JSON') }
  if (j.format !== 'arsenale-pack') throw fail(400, 'not an Arsenale pack')
  if (Number(j.formatVersion) !== 1) throw fail(400, 'This pack needs a newer Arsenale')
  if (!PACK_ID.test(String(j.id))) throw fail(400, 'bad pack id')
  if (!SEMVER.test(String(j.version))) throw fail(400, 'A pack version is semver, for example "1.2.0"')
  if (!SEMVER.test(String(j.minArsenale || '0.0.0'))) throw fail(400, 'minArsenale is semver, for example "1.0.0"')
  const o = j.office || {}
  if (!company().OFFICE_ID.test(String(o.id))) throw fail(400, 'bad office id in the pack')
  if (!Array.isArray(j.members) || j.members.length < 1 || j.members.length > 12) throw fail(400, 'a pack has 1 to 12 members')
  const members = j.members.map((m) => {
    if (!m || !MEMBER_ID.test(String(m.id))) throw fail(400, 'bad member id in the pack')
    const rel = String(m.file || '')
    if (rel !== 'agents/' + m.id + '.md') throw fail(400, 'a member file must be agents/<id>.md')
    const file = path.join(dir, 'agents', m.id + '.md')
    if (!fs.existsSync(file)) throw fail(400, 'missing member file ' + rel)
    return { id: m.id, file, zone: String(m.zone || ''), title: clipCp(m.title, 60), titleFa: clipCp(m.titleFa, 60), tier: ['light', 'standard', 'heavy'].includes(m.tier) ? m.tier : 'standard' }
  })
  if (!members.some((m) => m.id === o.lead)) throw fail(400, 'the office lead must be a member of the pack')
  const policyRows = require('./policy.cjs').packRows(j.policy)
  let labels = {}
  try { labels = JSON.parse(P.stripBom(fs.readFileSync(path.join(dir, 'labels.fa.json'), 'utf8'))) } catch { /* optional */ }
  return {
    id: j.id, version: j.version, minArsenale: j.minArsenale || '0.0.0', name: clipCp(j.name, 60), nameFa: clipCp(j.nameFa, 60),
    description: clipCp(j.description, 200), descriptionFa: clipCp(j.descriptionFa, 200),
    office: { id: o.id, name: clipCp(o.name || o.id, 40), nameFa: clipCp(o.nameFa, 40), theme: o.theme, profile: clipCp(o.profile, 30), lead: o.lead },
    members, policyRows, labels: labels && typeof labels === 'object' ? labels : {},
    sampleTasks: (Array.isArray(j.sampleTasks) ? j.sampleTasks : []).slice(0, 5).map((t) => ({ title: clipCp(t.title, 200), description: clipCp(t.description, 2000), assignee: MEMBER_ID.test(String(t.assignee)) ? t.assignee : '' })),
    dir,
  }
}

function bundled() {
  let names = []
  try { names = fs.readdirSync(BUNDLED) } catch { return [] }
  const out = []
  for (const n of names.sort()) {
    if (!PACK_ID.test(n)) continue
    try { out.push(readPack(path.join(BUNDLED, n))) } catch { /* a broken bundled pack is skipped, never half-installed */ }
  }
  return out
}
function bundledPack(id) {
  if (!PACK_ID.test(String(id))) throw fail(400, 'bad pack id')
  const p = bundled().find((x) => x.id === id)
  if (!p) throw fail(404, 'no such pack: ' + id)
  return p
}

function readState() {
  try { const j = JSON.parse(fs.readFileSync(STATE, 'utf8')); if (j && j.packs && typeof j.packs === 'object') return j } catch { /* none yet */ }
  return { packs: {} }
}
function saveState(s) { fs.mkdirSync(path.dirname(STATE), { recursive: true }); writeAtomic(STATE, JSON.stringify(s, null, 2)) }

/** Every bundled pack with what is installed, for Settings and the wizard. */
function listPacks() {
  const st = readState()
  return bundled().map((p) => {
    const inst = Object.hasOwn(st.packs, p.id) ? st.packs[p.id] : null
    return {
      id: p.id, version: p.version, name: p.name, nameFa: p.nameFa, description: p.description, descriptionFa: p.descriptionFa,
      office: p.office, members: p.members.map((m) => ({ id: m.id, title: m.title, titleFa: m.titleFa, tier: m.tier, zone: m.zone, lead: m.id === p.office.lead })),
      sampleTasks: p.sampleTasks, installed: inst ? inst.version : '', update: !!(inst && cmpSemver(p.version, inst.version) > 0),
      needs: cmpSemver(p.minArsenale, APP_VERSION) > 0 ? p.minArsenale : '',
    }
  })
}

/** Member ids of a pack that already exist in some agent folder. */
function conflicts(id) {
  const p = bundledPack(id)
  const have = P.agentFiles()
  return p.members.filter((m) => have.has(m.id)).map((m) => m.id)
}

function mergeLabels(labels, rename) {
  const file = path.join(P.MANAGED_AGENTS, 'labels.fa.json')
  let cur = {}
  try { cur = JSON.parse(P.stripBom(fs.readFileSync(file, 'utf8'))) } catch { /* new file */ }
  for (const [k, v] of Object.entries(labels || {})) {
    if (!MEMBER_ID.test(k) || !v || typeof v !== 'object') continue
    const to = rename[k] || k
    if (!Object.hasOwn(cur, to)) cur[to] = { title: clipCp(v.title, 60), what: clipCp(v.what, 300), dept: clipCp(v.dept, 20) }
  }
  writeAtomic(file, JSON.stringify(cur, null, 2))
}

/** Copies a pack's member files into the managed folder and records their
 *  hashes. Members whose id exists already follow `onConflict`: keep (the
 *  owner's file is untouched and the pack member is skipped), rename (the
 *  pack member is installed as <id>-2) or cancel (nothing is written).
 *  Writes no company data: installPack() and the wizard do that. */
function copyFiles(p, onConflict) {
  const clash = conflicts(p.id)
  if (clash.length && onConflict !== 'keep' && onConflict !== 'rename') throw fail(409, clash.join(', ') + ' already exist' + (clash.length === 1 ? 's' : '') + '. Keep yours, or install as a copy')
  require('./team.cjs')
  fs.mkdirSync(P.MANAGED_AGENTS, { recursive: true })
  const rules = path.join(P.MANAGED_AGENTS, 'AGENT-RULES.md')
  if (!fs.existsSync(rules)) fs.copyFileSync(path.join(__dirname, '..', 'agents', 'AGENT-RULES.md'), rules)
  const have = P.agentFiles()
  const files = [], rename = {}, kept = []
  // what the labels file was before, so a failed set-up can put it back
  let labelsBefore = null
  try { labelsBefore = fs.readFileSync(path.join(P.MANAGED_AGENTS, 'labels.fa.json'), 'utf8') } catch { /* none yet */ }
  for (const m of p.members) {
    let id = m.id
    if (have.has(id)) {
      if (onConflict === 'keep') { kept.push(id); continue }
      let n = 2
      while (have.has(m.id + '-' + n) || fs.existsSync(path.join(P.MANAGED_AGENTS, m.id + '-' + n + '.md'))) n++
      id = m.id + '-' + n
      rename[m.id] = id
    }
    let text = fs.readFileSync(m.file, 'utf8')
    if (id !== m.id) text = text.replace(/^name:\s*.+$/m, 'name: ' + id)
    const dest = path.join(P.MANAGED_AGENTS, id + '.md')
    fs.writeFileSync(dest, text, { flag: 'wx' })
    files.push({ id, member: m.id, path: id + '.md', sha256: sha256(Buffer.from(text, 'utf8')) })
  }
  mergeLabels(p.labels, rename)
  return { files, rename, kept, labelsBefore }
}

/** Undoes copyFiles: the unedited member files go, the labels file is put
 *  back as it was (or removed when the copy made it). */
function undoCopy(copied) {
  const kept = removeFiles(copied.files)
  const lf = path.join(P.MANAGED_AGENTS, 'labels.fa.json')
  if (copied.labelsBefore === null) fs.rmSync(lf, { force: true })
  else if (copied.labelsBefore !== undefined) writeAtomic(lf, copied.labelsBefore)
  return kept
}

/** Removes files copied by copyFiles that still match their hash: the
 *  wizard's undo when creating the company fails (R-3.2). */
function removeFiles(files) {
  const kept = []
  for (const f of files) {
    const full = path.join(P.MANAGED_AGENTS, f.path)
    let buf
    try { buf = fs.readFileSync(full) } catch { continue }
    if (sha256(buf) === f.sha256) fs.rmSync(full, { force: true })
    else kept.push(f.id)
  }
  return kept
}

function record(p, copied, officeId) {
  const st = readState()
  st.packs[p.id] = { version: p.version, installedAt: new Date().toISOString(), officeId, files: copied.files, kept: copied.kept, rename: copied.rename }
  saveState(st)
}

/** The employees a pack brings: home office, title, tier, and who reports to
 *  whom (members to the lead, the lead to the assistant). */
function employeesOf(p, copied) {
  const out = {}
  const idOf = (m) => copied.rename[m] || m
  const lead = idOf(p.office.lead)
  for (const m of p.members) {
    if (copied.kept.includes(m.id)) continue
    out[idOf(m.id)] = { title: m.title, titleFa: m.titleFa, homeOfficeId: p.office.id, zone: m.zone === 'lead' ? 'lead' : ['build', 'review', 'docs', 'design'].includes(m.zone) ? m.zone : '', reportsTo: idOf(m.id) === lead ? 'supervisor' : lead, tier: m.tier, managed: true, createdBy: 'pack:' + p.id }
  }
  return out
}

/** Installs a bundled pack into an existing company (Settings → Office
 *  packs). Board only. */
function installPack(id, actor, opts) {
  requireBoard(actor)
  const p = bundledPack(id)
  if (cmpSemver(p.minArsenale, APP_VERSION) > 0) throw fail(409, 'Needs Arsenale ' + p.minArsenale + ' or newer')
  const st = readState()
  if (Object.hasOwn(st.packs, p.id)) throw fail(409, 'This pack is installed already')
  const C = company()
  const co = C.readCompany()
  if (!co.configured) throw fail(409, 'Set up your company first: a pack adds an office to it')
  const copied = copyFiles(p, opts && opts.onConflict)
  try {
    C.addOffice({ id: p.office.id, name: p.office.name, nameFa: p.office.nameFa, theme: p.office.theme, profile: p.office.profile, leadEmployeeId: copied.rename[p.office.lead] || p.office.lead }, 'board', actor.door)
    for (const [eid, e] of Object.entries(employeesOf(p, copied))) {
      const { reportsTo, ...rest } = e
      C.writeOverlay(eid, Object.assign({ status: 'active', pauseReason: '', aliases: [], budget: null }, rest), 'board')
      if (reportsTo) C.writeOverlay(eid, { reportsTo }, 'board')
    }
  } catch (e) { undoCopy(copied); throw e }
  const rows = {}
  for (const [m, r] of Object.entries(p.policyRows)) rows[copied.rename[m] || m] = r
  const tightened = require('./policy.cjs').applyPackRows(rows)
  record(p, copied, p.office.id)
  C.activity({ actor: actorLabel(actor), action: 'pack.installed', entityType: 'pack', entityId: p.id, summary: p.name + ' ' + p.version + ': ' + copied.files.length + ' members' + (copied.kept.length ? ', kept yours: ' + copied.kept.join(', ') : ''), via: actor.door })
  C.inboxLine({ type: 'pack.installed', id: p.id, summary: 'Office pack ' + p.name + ' installed: ' + copied.files.map((f) => f.id).join(', ') }, actor.door)
  return { id: p.id, files: copied.files.map((f) => f.id), kept: copied.kept, renamed: copied.rename, tightened }
}

/** Removes a pack: deletes only unedited files, archives the office (never
 *  deletes it) and marks the removed members retired. History stays. */
function uninstallPack(id, actor) {
  requireBoard(actor)
  if (!PACK_ID.test(String(id))) throw fail(400, 'bad pack id')
  const st = readState()
  const inst = Object.hasOwn(st.packs, id) ? st.packs[id] : null
  if (!inst) throw fail(404, 'This pack is not installed')
  const keptEdited = removeFiles(inst.files || [])
  const C = company()
  const removed = (inst.files || []).map((f) => f.id).filter((x) => !keptEdited.includes(x))
  try {
    for (const m of removed) C.writeOverlay(m, { status: 'retired' }, 'board')
    if (inst.officeId) C.archiveOffice(inst.officeId, 'board', actor.door)
  } catch { /* no company any more: the files are what mattered */ }
  delete st.packs[id]
  saveState(st)
  try {
    C.activity({ actor: actorLabel(actor), action: 'pack.removed', entityType: 'pack', entityId: id, summary: id + ' removed' + (keptEdited.length ? '; kept because you changed them: ' + keptEdited.join(', ') : ''), via: actor.door })
    C.inboxLine({ type: 'pack.removed', id, summary: 'Office pack ' + id + ' removed' }, actor.door)
  } catch { /* no company */ }
  return { id, removed, kept: keptEdited }
}

/** A newer bundled version replaces unedited files; an edited file is kept
 *  and the new text is written to <home>/pack-updates/<id>.md (R-4.9). Not next
 *  to it: every .md in the agent folder is a team member, to the dashboard
 *  and to the coding tools that read that folder. */
function updatePack(id, actor) {
  requireBoard(actor)
  const p = bundledPack(id)
  const st = readState()
  const inst = Object.hasOwn(st.packs, id) ? st.packs[id] : null
  if (!inst) throw fail(404, 'This pack is not installed')
  if (!(cmpSemver(p.version, inst.version) > 0)) throw fail(409, 'No newer version of this pack')
  const replaced = [], side = []
  for (const f of inst.files || []) {
    const m = p.members.find((x) => x.id === (f.member || f.id))
    if (!m) continue
    const full = path.join(P.MANAGED_AGENTS, f.path)
    let text = fs.readFileSync(m.file, 'utf8')
    if (f.id !== m.id) text = text.replace(/^name:\s*.+$/m, 'name: ' + f.id)
    let cur = null
    try { cur = fs.readFileSync(full) } catch { /* removed by hand */ }
    if (cur && sha256(cur) !== f.sha256) { fs.mkdirSync(NEW_TEXT, { recursive: true }); fs.writeFileSync(path.join(NEW_TEXT, f.id + '.md'), text); side.push(f.id); continue }
    writeAtomic(full, text)
    f.sha256 = sha256(Buffer.from(text, 'utf8'))
    replaced.push(f.id)
  }
  inst.version = p.version
  inst.updatedAt = new Date().toISOString()
  saveState(st)
  try { company().activity({ actor: actorLabel(actor), action: 'pack.updated', entityType: 'pack', entityId: id, summary: id + ' → ' + p.version + (side.length ? '; your edited files kept, the new text is in ' + NEW_TEXT + ': ' + side.join(', ') : ''), via: actor.door }) } catch { /* no company */ }
  return { id, version: p.version, replaced, keptWithNewBeside: side, newTextDir: side.length ? NEW_TEXT : '' }
}

/** The hire form edited a member that came from a pack: its hash no longer
 *  matches, so removal keeps it. Nothing to write; kept for clarity. */
function markEdited() { return true }

module.exports = { BUNDLED, STATE, readPack, bundled, bundledPack, listPacks, conflicts, copyFiles, removeFiles, undoCopy, record, employeesOf, installPack, uninstallPack, updatePack, readState, cmpSemver, markEdited }
