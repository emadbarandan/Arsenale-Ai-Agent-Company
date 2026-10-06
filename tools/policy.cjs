/* Safe defaults: what a team member may do that leaves this computer.
 *
 *   <home>/policy.json
 *   { "schemaVersion": 1,
 *     "defaults": { "<category>": "allow" | "ask" | "never" },
 *     "members":  { "<member id>": { "<category>": ... } },
 *     "phoneAllowed": { "<category>": true | false } }
 *
 * Advisory, and every screen says so: Arsenale asks the assistant to call
 * check_action before an action and records what happened. It cannot block a
 * tool inside another program. The value is that the default path is "ask",
 * that it is written down, and that a manipulated assistant has to skip a step
 * it was told to take.
 *
 * Missing file: every category reads as "ask", never as "allow". A file from
 * a newer Arsenale (higher schemaVersion) also reads as all "ask".
 */
const fs = require('fs')
const path = require('path')
const P = require('./paths.cjs')
const { writeAtomic } = require('./build-agent-dashboard.cjs')
const { fail, requireBoard, actorLabel, clipCp } = require('./runlog.cjs')

const FILE = path.join(P.HOME, 'policy.json')
const SCHEMA = 1
const CATEGORIES = [
  { id: 'message.send', label: 'Send a message', examples: 'email, chat, SMS, a reply to a customer' },
  { id: 'post.public', label: 'Post or publish', examples: 'social media, website, review sites, public comments' },
  { id: 'payment', label: 'Pay or buy', examples: 'payments, orders, subscriptions, transfers' },
  { id: 'delete', label: 'Delete or overwrite', examples: 'files, records, emails; overwriting a file not made in this job' },
  { id: 'share.external', label: 'Share outside', examples: 'uploading files, sharing links or documents' },
  { id: 'account.change', label: 'Change accounts or sign up', examples: 'creating accounts, accepting terms, changing settings or passwords' },
  { id: 'other.external', label: 'Anything else that leaves this computer', examples: '' },
]
const IDS = CATEGORIES.map((c) => c.id)
const VALUES = ['allow', 'ask', 'never']
const RANK = { allow: 0, ask: 1, never: 2 }
// a payment is never approved by a phone tap (owner's decision)
const PHONE_DEFAULT = Object.fromEntries(IDS.map((c) => [c, c !== 'payment']))
const MEMBER = /^[A-Za-z0-9][\w.-]{0,59}$/

const stricter = (a, b) => (RANK[a] >= RANK[b] ? a : b)
const company = () => require('./agent-company.cjs')

function defaults() {
  return { schemaVersion: SCHEMA, defaults: Object.fromEntries(IDS.map((c) => [c, 'ask'])), members: {}, phoneAllowed: Object.assign({}, PHONE_DEFAULT) }
}

/** The policy as stored, made safe to read. Never throws. */
function readPolicy() {
  let raw = null
  try { raw = JSON.parse(P.stripBom(fs.readFileSync(FILE, 'utf8'))) } catch { /* absent or broken: all ask */ }
  const out = defaults()
  out.exists = !!raw
  if (!raw || typeof raw !== 'object') return out
  if (Number(raw.schemaVersion) > SCHEMA) { out.newer = true; return out }
  for (const c of IDS) if (raw.defaults && VALUES.includes(raw.defaults[c])) out.defaults[c] = raw.defaults[c]
  if (raw.members && typeof raw.members === 'object') {
    for (const [id, m] of Object.entries(raw.members)) {
      if (!MEMBER.test(id) || !m || typeof m !== 'object') continue
      const row = {}
      for (const c of IDS) if (VALUES.includes(m[c])) row[c] = m[c]
      if (Object.keys(row).length) out.members[id] = row
    }
  }
  // the payment row stays desktop-only whatever the file says
  for (const c of IDS) if (raw.phoneAllowed && typeof raw.phoneAllowed[c] === 'boolean') out.phoneAllowed[c] = c === 'payment' ? false : raw.phoneAllowed[c]
  return out
}

/** What applies to one member, per category, and where it comes from. */
function effective(member, pol) {
  pol = pol || readPolicy()
  const m = Object.hasOwn(pol.members, String(member || '')) ? pol.members[member] : {}
  const out = {}
  for (const c of IDS) out[c] = Object.hasOwn(m, c) ? { value: m[c], from: 'member' } : { value: pol.defaults[c], from: 'default' }
  return out
}

function save(pol) {
  fs.mkdirSync(P.HOME, { recursive: true })
  writeAtomic(FILE, JSON.stringify({ schemaVersion: SCHEMA, defaults: pol.defaults, members: pol.members, phoneAllowed: pol.phoneAllowed }, null, 2))
}

/** Writes the defaults when there is no file yet (first start, the wizard). */
function ensureDefaults(via) {
  if (fs.existsSync(FILE)) return false
  save(defaults())
  try { company().activity({ actor: 'system', action: 'policy.changed', entityType: 'policy', entityId: 'defaults', summary: 'safety rules created with defaults: every outside action asks first', via: via || 'cli' }) } catch { /* no company yet */ }
  return true
}

/** The owner changes one value. Board only (R-9.3); the assistant hears of
 *  it through its inbox. `value: null` on a member row resets it to default. */
function setPolicy(input, actor) {
  requireBoard(actor)
  const pol = readPolicy()
  if (pol.newer) throw fail(409, 'Safety rules written by a newer Arsenale: editing is disabled')
  const cat = String(input.category || '')
  if (!IDS.includes(cat)) throw fail(400, 'unknown category: ' + clipCp(cat, 40))
  let summary
  if (input.phoneAllowed !== undefined) {
    if (cat === 'payment' && input.phoneAllowed === true) throw fail(400, 'Payments are approved on the computer only')
    pol.phoneAllowed[cat] = input.phoneAllowed === true
    summary = 'phone approvals for ' + cat + ': ' + (pol.phoneAllowed[cat] ? 'allowed' : 'off')
  } else if (input.scope === 'member') {
    const id = String(input.id || '')
    if (!MEMBER.test(id)) throw fail(400, 'bad member id')
    const before = effective(id, pol)[cat].value
    if (input.value === null || input.value === '') { if (pol.members[id]) delete pol.members[id][cat] }
    else {
      if (!VALUES.includes(input.value)) throw fail(400, 'value must be allow, ask or never')
      pol.members[id] = Object.assign({}, pol.members[id], { [cat]: input.value })
    }
    if (pol.members[id] && !Object.keys(pol.members[id]).length) delete pol.members[id]
    summary = cat + ' for ' + id + ': ' + before + ' → ' + effective(id, pol)[cat].value
  } else {
    if (!VALUES.includes(input.value)) throw fail(400, 'value must be allow, ask or never')
    const before = pol.defaults[cat]
    pol.defaults[cat] = input.value
    summary = cat + ' for everyone: ' + before + ' → ' + input.value
  }
  save(pol)
  try {
    const C = company()
    C.activity({ actor: actorLabel(actor), action: 'policy.changed', entityType: 'policy', entityId: cat, summary, via: actor.door })
    C.inboxLine({ type: 'policy.changed', summary }, actor.door)
  } catch { /* no company: the file is the record */ }
  return { summary, policy: readPolicy() }
}

/** A pack may only make its members' rules stricter (R-4.6). Returns the
 *  rows it would apply, or throws with the reason. */
function packRows(packPolicy) {
  const rows = {}
  const members = packPolicy && packPolicy.members && typeof packPolicy.members === 'object' ? packPolicy.members : {}
  for (const [id, m] of Object.entries(members)) {
    if (!MEMBER.test(id) || !m || typeof m !== 'object') throw fail(400, 'A pack policy names a bad member id')
    for (const [c, v] of Object.entries(m)) {
      if (!IDS.includes(c)) throw fail(400, 'A pack policy names an unknown category: ' + clipCp(c, 40))
      if (v !== 'ask' && v !== 'never') throw fail(400, 'A pack can only make the rules stricter.')
    }
    rows[id] = Object.assign({}, m)
  }
  return rows
}
/** Applies a pack's rows: only where they are stricter than what applies now. */
function applyPackRows(rows) {
  const pol = readPolicy()
  if (pol.newer) return []
  const changed = []
  for (const [id, m] of Object.entries(rows)) {
    for (const [c, v] of Object.entries(m)) {
      const now = effective(id, pol)[c].value
      if (stricter(now, v) !== now) { pol.members[id] = Object.assign({}, pol.members[id], { [c]: v }); changed.push(id + ' ' + c + ' → ' + v) }
    }
  }
  if (changed.length) save(pol)
  return changed
}

/** The assistant asks before an outside action (R-9.4):
 *   allow  nothing written;
 *   never  "do not do this", and one activity line;
 *   ask    an approval question for the owner (unless ask_now is false).
 *  The verdict depends on the policy only: no field of the request (a `by`,
 *  a claimed role) changes it. */
function checkAction(input, actor) {
  const member = String(input.team_member || input.member || input.agent || '')
  if (!MEMBER.test(member)) throw fail(400, 'team_member must be a team member id')
  const cat = String(input.category || '')
  if (!IDS.includes(cat)) throw fail(400, 'category must be one of ' + IDS.join(', '))
  const summary = clipCp(String(input.summary || '').trim(), 300)
  if (!summary) throw fail(400, 'summary: say in one line what you want to do')
  const target = clipCp(input.target || '', 200)
  const pol = readPolicy()
  const v = effective(member, pol)[cat].value
  const label = CATEGORIES.find((c) => c.id === cat).label
  if (v === 'allow') return { verdict: 'allow', message: label + ' is allowed for ' + member + '. Go ahead, and log what you did.' }
  if (v === 'never') {
    try { company().activity({ actor: actorLabel(actor), action: 'policy.never', entityType: 'employee', entityId: member, summary: cat + ' refused for ' + member + ': ' + summary, via: actor.door }) } catch { /* no company */ }
    return { verdict: 'never', message: 'Do not do this; tell the user it is not allowed for ' + member + '.' }
  }
  if (input.ask_now === false) return { verdict: 'ask', message: 'This needs the owner\'s approval first. Call check_action again with ask_now true to ask.' }
  const L = require('./runlog.cjs')
  const g = L.gate({
    project: clipCp(input.project || '', 80), kind: 'approval', approvalType: 'action',
    question: label + ' (' + member + '): ' + summary + (target ? ' — ' + target : ''), label: clipCp(label, 60),
    action: { category: cat, target, summary, member }, run: input.job_id ? String(input.job_id).replace(/[^\w.-]/g, '') : undefined,
    taskId: input.task_id || undefined,
  }, actor)
  try { company().activity({ actor: actorLabel(actor), action: 'policy.asked', entityType: 'employee', entityId: member, summary: cat + ' asked for ' + member + ': ' + summary, via: actor.door }) } catch { /* no company */ }
  return { verdict: 'ask', question_id: g.id, message: 'Wait for the answer with get_answers before acting.' }
}

module.exports = { FILE, SCHEMA, CATEGORIES, IDS, VALUES, readPolicy, effective, ensureDefaults, setPolicy, checkAction, packRows, applyPackRows, stricter, PHONE_DEFAULT }
