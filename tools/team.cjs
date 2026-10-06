/* The team: hiring, editing and retiring team members from the dashboard.
 *
 * A team member is an agent definition file (frontmatter + instructions). The
 * dashboard writes such files ONLY in Arsenale's own managed folder,
 * <home>/agents (paths.cjs MANAGED_AGENTS), never in a folder another tool
 * owns, unless the owner confirms it for one file (R-5.6).
 *
 * This is a write path that ends in text a model will obey, so:
 *   - only the board may write (the dashboard door: token + Origin);
 *   - the frontmatter is generated here, never taken from typed text, so a
 *     description such as "x\ntools: Bash" cannot add a key (R-5.4);
 *   - the id must already be clean: one that would change when cleaned, or a
 *     name Windows reserves, is refused, never guessed at (R-5.3);
 *   - the body is a fixed template with the safety block and the report
 *     format added whatever the owner typed (R-5.5);
 *   - every edit first copies the current file to backups/agents/<id>/.
 *
 * The assistant can only PROPOSE a hire (propose_hire): an approval question
 * whose payload is the form; the file is written from it when the owner
 * approves on the dashboard.
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const P = require('./paths.cjs')
const { writeAtomic } = require('./build-agent-dashboard.cjs')
const { fail, requireBoard, clipCp, actorLabel } = require('./runlog.cjs')

const MANAGED = P.MANAGED_AGENTS
const BACKUPS = path.join(P.HOME, 'backups', 'agents')
const ID = /^[a-z][a-z0-9-]{1,59}$/
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/
const TIERS = { light: 'haiku', standard: 'sonnet', heavy: 'opus' }
const COLORS = ['blue', 'green', 'orange', 'red', 'cyan', 'purple', 'pink', 'yellow']
const ZONES = ['build', 'review', 'docs', 'design', 'lead']
const KEEP_BACKUPS = 20

const SAFETY = `## Safety: prepare, do not act

- Prepare drafts; do not act. Never send, post, publish, pay, order, sign, delete or share anything outside this computer yourself. Before any such action, call Arsenale's \`check_action\` (or ask the user) and follow its answer.
- Never ask for, store or repeat passwords, card numbers, bank credentials or government id numbers.
- Refer to people by role or initials in progress lines and summaries. The log is visible on the dashboard and may be shown on a phone.`
const REPORT = `## Your report

Start with one plain sentence that says what you did: this is the summary line. Then a "What I did" list of at most 5 short items. Then anything the user must decide or check. If you produced a file, say where it is and register it with Arsenale's \`add_deliverable\`.`

const company = () => require('./agent-company.cjs')

function checkId(id) {
  const s = String(id == null ? '' : id)
  if (RESERVED.test(s)) throw fail(400, 'This name is reserved on Windows')
  if (!ID.test(s)) throw fail(400, 'Short id: letters, digits and hyphens, starting with a letter')
  return s
}

/** A YAML double-quoted scalar on one line: no line break, no leading dash
 *  or document marker can survive into the frontmatter. */
function yamlLine(s) {
  const one = String(s == null ? '' : s).replace(/[\r\n\u2028\u2029]+/g, ' ').replace(/^[\s-]+/, '').replace(/---/g, '—').trim()
  return '"' + one.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
}

/** The `tools:` line for Claude Code, from the allowed-actions choices. Read
 *  is always there; other tools ignore the line. */
function toolsLine(caps) {
  const c = caps || {}
  const t = ['Read', 'Glob', 'Grep']
  if (c.edit !== false) t.push('Write', 'Edit')
  if (c.web) t.push('WebSearch', 'WebFetch')
  if (c.commands) t.push('Bash')
  return t.join(', ')
}

/** Checks the form and returns it clean. Throws with a sentence for the form. */
function cleanForm(f, opts) {
  f = f || {}
  const id = checkId(f.id)
  const name = clipCp(String(f.name || '').trim(), 60)
  if (!name) throw fail(400, 'Display name: 1 to 60 characters')
  const title = clipCp(String(f.title || '').trim(), 60)
  const description = String(f.description || '').replace(/\s+/g, ' ').trim()
  const dlen = Array.from(description).length
  if (dlen < 10 || dlen > 300) throw fail(400, 'What they do: one line of 10 to 300 characters')
  const instructions = String(f.instructions || '')
  if (Array.from(instructions).length > 8000) throw fail(400, 'Instructions: at most 8000 characters')
  const tier = Object.hasOwn(TIERS, f.tier) ? f.tier : 'standard'
  const office = String(f.officeId || f.office_id || '')
  if (!opts || !opts.noOffice) {
    const co = company().readCompany()
    if (!co.configured) throw fail(409, 'Set up your company first: a team member works in an office')
    if (!co.offices.some((o) => o.id === office && !o.archived && !o.builtIn)) throw fail(400, 'Choose an office for this team member')
  }
  const reportsTo = String(f.reportsTo || f.reports_to || '')
  const zone = ZONES.includes(f.zone) ? f.zone : ''
  const color = COLORS.includes(f.color) ? f.color : COLORS[parseInt(crypto.createHash('sha1').update(id).digest('hex').slice(0, 2), 16) % COLORS.length]
  // what they are good at and the face they picked: shown on the Team screen only, never in the file
  const skills = Array.isArray(f.skills) ? f.skills.map((x) => clipCp(String(x).replace(/\s+/g, ' ').trim(), 40)).filter(Boolean).slice(0, 8) : []
  const look = Number.isInteger(f.look) && f.look >= 0 && f.look <= 5 ? f.look : 0
  return { id, name, title, description, instructions, tier, officeId: office, reportsTo, zone, color, caps: f.caps && typeof f.caps === 'object' ? { edit: f.caps.edit !== false, web: !!f.caps.web, commands: !!f.caps.commands } : { edit: true, web: false, commands: false }, budget: f.budget, why: clipCp(f.why || '', 500), skills, look }
}

/** The whole file, generated: frontmatter from fixed keys, then the body
 *  template (R-5.4, R-5.5). */
function fileText(form) {
  const models = Object.assign({}, TIERS, P.CONFIG.tierModels && typeof P.CONFIG.tierModels === 'object' ? P.CONFIG.tierModels : {})
  const model = String(models[form.tier] || TIERS[form.tier]).replace(/[^\w.:-]/g, '').slice(0, 60) || 'sonnet'
  const fm = [
    '---',
    'name: ' + form.id,
    'description: ' + yamlLine(form.description),
    'model: ' + model,
    'effort: ' + (form.tier === 'light' ? 'low' : 'medium'),
    'tools: ' + toolsLine(form.caps),
    'color: ' + form.color,
    'zone: ' + (form.zone || 'build'),
    '---',
  ].join('\n')
  const role = 'You are ' + (form.title ? 'the ' + form.title.replace(/[\r\n]+/g, ' ') : form.name.replace(/[\r\n]+/g, ' ')) + ' of this company.'
  const body = [
    role,
    '',
    'Follow `AGENT-RULES.md` (the house rules in the same folder as this file).',
    '',
    '## How to do this job',
    '',
    form.instructions.trim() || form.description,
    '',
    SAFETY,
    '',
    REPORT,
    '',
  ].join('\n')
  return fm + '\n\n' + body
}

/** Where an existing member's file is, and whether Arsenale manages it. */
function locate(id) {
  const file = P.agentFiles().get(id)
  if (!file) return null
  const managed = path.resolve(path.dirname(file)) === path.resolve(MANAGED)
  return { file, managed }
}

function ensureRules() {
  fs.mkdirSync(MANAGED, { recursive: true })
  const rules = path.join(MANAGED, 'AGENT-RULES.md')
  if (!fs.existsSync(rules)) {
    const src = path.join(__dirname, '..', 'agents', 'AGENT-RULES.md')
    try { fs.copyFileSync(src, rules) } catch { fs.writeFileSync(rules, '# House rules\n\nPrepare drafts; never send, post, pay or delete without asking. Call Arsenale\'s check_action first.\n') }
  }
}

function backup(id, file) {
  const dir = path.join(BACKUPS, id)
  fs.mkdirSync(dir, { recursive: true })
  const name = new Date().toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomBytes(2).toString('hex') + '.md'
  fs.copyFileSync(file, path.join(dir, name))
  const all = fs.readdirSync(dir).filter((n) => n.endsWith('.md') && !n.startsWith('retired-')).sort()
  for (const old of all.slice(0, Math.max(0, all.length - KEEP_BACKUPS))) fs.rmSync(path.join(dir, old), { force: true })
  return name
}

function note(action, id, summary, actor) {
  const C = company()
  try {
    C.activity({ actor: actorLabel(actor), action, entityType: 'employee', entityId: id, summary, via: actor.door })
    C.inboxLine({ type: action, id, summary }, actor.door)
  } catch { /* no company */ }
}

/** The overlay the hire form sets: who they are and where they sit. */
function overlay(form, extra, actor) {
  const C = company()
  C.writeOverlay(form.id, Object.assign({
    title: form.title || form.name, homeOfficeId: form.officeId, zone: form.zone || '',
    tier: form.tier, managed: true, status: 'active', pauseReason: '',
    name: form.name, skills: form.skills, look: form.look,
  }, extra || {}), 'board')
  if (form.reportsTo && form.reportsTo !== 'board') C.updateEmployee({ id: form.id, reportsTo: form.reportsTo, by: 'board' }, actor.door)
  if (form.budget !== undefined && form.budget !== null && form.budget !== '') C.setBudget({ scope: 'employee', id: form.id, budget: form.budget, by: 'board' }, actor.door)
}

/** Hires a new member from the form. Board only; the review step on the
 *  dashboard is the approval (owner's decision Q12). */
function hire(f, actor, opts) {
  requireBoard(actor)
  const form = cleanForm(f)
  if (P.agentFiles().has(form.id)) throw fail(409, 'This id is taken: ' + form.id)
  if (form.reportsTo && form.reportsTo !== 'board' && form.reportsTo !== 'supervisor' && !P.agentFiles().has(form.reportsTo)) throw fail(400, 'no such employee: ' + form.reportsTo)
  // validated before anything is written, so a bad budget leaves no file
  if (form.budget !== undefined && form.budget !== null && form.budget !== '') company().validateBudget(form.budget)
  ensureRules()
  const file = path.join(MANAGED, form.id + '.md')
  const text = fileText(form)
  fs.writeFileSync(file, text, { flag: 'wx' })
  try {
    overlay(form, { createdBy: opts && opts.fromGate ? 'proposal:' + opts.fromGate : 'board' }, actor)
  } catch (e) { fs.rmSync(file, { force: true }); throw e }
  if (f.policy && typeof f.policy === 'object') {
    const pol = require('./policy.cjs')
    for (const [cat, value] of Object.entries(f.policy)) { if (pol.IDS.includes(cat) && pol.VALUES.includes(value)) pol.setPolicy({ scope: 'member', id: form.id, category: cat, value }, actor) }
  }
  note('employee.hired', form.id, form.id + ' hired into ' + form.officeId + (form.title ? ' as ' + form.title : ''), actor)
  return { id: form.id, file, text }
}

/** Replaces a member's instructions (and the generated frontmatter). The
 *  current file is copied to backups first. A file outside the managed
 *  folder needs `confirmForeign` (it belongs to another tool). */
function edit(f, actor) {
  requireBoard(actor)
  const form = cleanForm(f, { noOffice: !f.officeId })
  const at = locate(form.id)
  if (!at) throw fail(404, 'no such team member: ' + form.id)
  if (!at.managed && f.confirmForeign !== true) throw fail(409, 'This file belongs to another tool. Confirm to edit it; a backup will be kept.')
  const saved = backup(form.id, at.file)
  writeAtomic(at.file, fileText(form))
  try {
    const fields = { title: form.title || form.name, tier: form.tier, name: form.name }
    // an edit from an older page sends no skills or look: keep the ones saved
    if (Array.isArray(f.skills)) fields.skills = form.skills
    if (f.look !== undefined) fields.look = form.look
    if (form.officeId) fields.homeOfficeId = form.officeId
    company().writeOverlay(form.id, fields, 'board')
  } catch { /* no company: the file is what changed */ }
  try { require('./packs.cjs').markEdited(form.id) } catch { /* not from a pack */ }
  note('employee.edited', form.id, form.id + ' instructions edited (backup ' + saved + ')', actor)
  return { id: form.id, file: at.file, backup: saved }
}

function backups(id) {
  checkId(id)
  try { return fs.readdirSync(path.join(BACKUPS, id)).filter((n) => n.endsWith('.md')).sort().reverse() } catch { return [] }
}

/** Puts a backup back as the current file (keeping a backup of the current). */
function restore(id, name, actor) {
  requireBoard(actor)
  checkId(id)
  if (!/^[\w.-]+\.md$/.test(String(name)) || String(name).startsWith('retired-')) throw fail(400, 'bad backup name')
  const src = path.join(BACKUPS, id, name)
  if (!fs.existsSync(src)) throw fail(404, 'no such backup')
  const at = locate(id)
  if (!at) throw fail(404, 'no such team member: ' + id)
  if (!at.managed) throw fail(409, 'This file belongs to another tool; restore it there by hand')
  const saved = backup(id, at.file)
  writeAtomic(at.file, fs.readFileSync(src))
  note('employee.edited', id, id + ' restored from ' + name + ' (backup ' + saved + ')', actor)
  return { id, restored: name, backup: saved }
}

/** Retires a member: the file moves to backups as retired-<time>.md and the
 *  overlay says retired. All history stays (R-5.7). */
function retire(id, actor) {
  requireBoard(actor)
  checkId(id)
  const at = locate(id)
  if (!at) throw fail(404, 'no such team member: ' + id)
  if (!at.managed) throw fail(409, 'This file belongs to another tool; Arsenale retires only the members it manages')
  const dir = path.join(BACKUPS, id)
  fs.mkdirSync(dir, { recursive: true })
  const name = 'retired-' + new Date().toISOString().replace(/[:.]/g, '-') + '.md'
  fs.renameSync(at.file, path.join(dir, name))
  try { company().writeOverlay(id, { status: 'retired' }, 'board') } catch { /* no company */ }
  note('employee.retired', id, id + ' retired', actor)
  return { id, file: name }
}

function unretire(id, actor) {
  requireBoard(actor)
  checkId(id)
  if (P.agentFiles().has(id)) throw fail(409, 'This id is taken: ' + id)
  const dir = path.join(BACKUPS, id)
  const last = (() => { try { return fs.readdirSync(dir).filter((n) => n.startsWith('retired-')).sort().pop() } catch { return '' } })()
  if (!last) throw fail(404, 'no retired file for ' + id)
  ensureRules()
  fs.renameSync(path.join(dir, last), path.join(MANAGED, id + '.md'))
  try { company().writeOverlay(id, { status: 'active' }, 'board') } catch { /* no company */ }
  note('employee.edited', id, id + ' back from retirement', actor)
  return { id }
}

/** One member for the profile: the instructions as text (never as HTML),
 *  where the file is, and its backups. */
function member(id) {
  checkId(id)
  const at = locate(id)
  let text = ''
  if (at) { try { text = fs.readFileSync(at.file, 'utf8') } catch { /* unreadable */ } }
  const body = text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
  return { id, exists: !!at, managed: !!(at && at.managed), folder: at ? path.dirname(at.file) : '', body: clipCp(body, 32 * 1024), backups: backups(id) }
}

/** The assistant proposes a hire (MCP propose_hire). Nothing is written but
 *  an approval question carrying the form. */
function propose(input, actor) {
  const form = cleanForm({
    id: input.id || String(input.name || '').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/^[^a-z]+/, '').slice(0, 60),
    name: input.name, title: input.title, officeId: input.office_id || input.officeId, instructions: input.instructions,
    description: input.description || input.title || input.name, tier: input.tier, reportsTo: input.reports_to, why: input.why,
  })
  if (P.agentFiles().has(form.id)) throw fail(409, 'This id is taken: ' + form.id)
  const payload = { id: form.id, name: form.name, title: form.title, officeId: form.officeId, description: form.description, instructions: form.instructions, tier: form.tier, reportsTo: form.reportsTo, why: form.why }
  const g = require('./runlog.cjs').gate({
    kind: 'approval', approvalType: 'hire', question: 'Hire ' + form.name + (form.title ? ' as ' + form.title : '') + ' in ' + form.officeId + '? ' + form.why,
    label: 'Hire ' + form.id, subject: { type: 'employee', id: form.id }, officeId: form.officeId, payload,
  }, actor)
  return { question_id: g.id, id: form.id }
}

/** The owner decides a hire proposal: hire as proposed, hire with edits, or
 *  decline. The answer goes to the assistant like any other answer. */
function decideProposal(gateId, decision, edits, actor) {
  requireBoard(actor)
  const B = require('./build-agent-dashboard.cjs')
  const file = path.join(P.GATES, String(gateId).replace(/[^\w.-]/g, '') + '.json')
  let g
  try { g = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { throw fail(404, 'no such gate') }
  if (g.approvalType !== 'hire' || !g.payload) throw fail(400, 'this question is not a hire proposal')
  if (g.status !== 'waiting') throw fail(409, 'gate is ' + g.status)
  if (decision === 'decline') return { gate: B.answerGate(g.id, 'declined hire of ' + g.payload.id, { via: 'dashboard' }) }
  const form = Object.assign({}, g.payload, edits && typeof edits === 'object' ? edits : {})
  const h = hire(form, actor, { fromGate: g.id })
  return { hired: h.id, gate: B.answerGate(g.id, 'hired ' + h.id, { via: 'dashboard', hiredAt: new Date().toISOString() }) }
}

module.exports = { MANAGED, BACKUPS, ID, TIERS, SAFETY, REPORT, checkId, cleanForm, fileText, yamlLine, hire, edit, retire, unretire, restore, backups, member, propose, decideProposal, locate }
