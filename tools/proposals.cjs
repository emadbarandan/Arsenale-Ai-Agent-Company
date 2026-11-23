/* Agent proposals (spec 1.4 section 8). An agent or the supervisor only PROPOSES: a proposal is a gate with
 * approvalType "proposal" and a proposal {kind, payload, why, evidence, hash} object, and nothing else is
 * written. Only the owner accepts, edits and accepts, or declines, and accepting runs the same board code a
 * manual action runs (tasks.cjs, plan.cjs, queue.cjs).
 *
 * Kinds: plan_into {task_id, target_version, phase?}, bug {title, description?, project, target_version?},
 * queue {task_id}. Limits: at most MAX_WAITING waiting proposals per project (then 429); a proposal with the
 * same kind and payload answers with the existing one; at most MAX_AUTO automatic bug proposals per run.
 * Proposal text never reaches a context pack: collect() keeps these gates out of state.gates. */
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const P = require('./paths.cjs')
const { withLock } = require('./store.cjs')
const { fail, clipCp, requireBoard } = require('./runlog.cjs')

const KINDS = ['plan_into', 'bug', 'queue']
const MAX_WAITING = 50
const MAX_AUTO = 20
const VER = /^[0-9A-Za-z.+-]{1,20}$/
const PID = /^(?!\.+$)[\w.-]{1,60}$/
const B = () => require('./build-agent-dashboard.cjs')
const T = () => require('./tasks.cjs')
const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim()
const hashOf = (...parts) => crypto.createHash('sha1').update(parts.join('\n')).digest('hex').slice(0, 20)

function gates() {
  let names = []
  try { names = fs.readdirSync(P.GATES) } catch { return [] }
  const out = []
  for (const n of names) {
    if (!n.endsWith('.json')) continue
    try { const g = JSON.parse(fs.readFileSync(path.join(P.GATES, n), 'utf8')); if (g && g.approvalType === 'proposal' && g.proposal) out.push(g) } catch { /* unreadable */ }
  }
  return out
}
const waitingIn = (project) => gates().filter((g) => g.status === 'waiting' && g.project === project)

/** Checks and cleans an input into {kind, payload, project, hash, question}. Throws 400/404. */
function clean(input) {
  const kind = String(input.kind || '')
  if (!KINDS.includes(kind)) throw fail(400, 'kind must be one of ' + KINDS.join(', '))
  const co = require('./agent-company.cjs').readCompany()
  const ver = (v) => { if (v === undefined || v === null || v === '') return ''; if (!VER.test(String(v))) throw fail(400, 'target_version is 1 to 20 characters: letters, digits, dot, plus or dash'); return String(v) }
  const phase = (v) => { if (v === undefined || v === null || v === '') return ''; if (!/^[\w.-]{1,20}$/.test(String(v))) throw fail(400, 'bad phase id'); return String(v) }
  if (kind === 'bug') {
    const title = clipCp(norm(input.title), 200)
    if (!title) throw fail(400, 'A bug proposal needs a title')
    const project = String(input.project || '')
    if (!PID.test(project) || !co.configured || !co.projects.some((p) => p.id === project)) throw fail(400, 'no such project: ' + clipCp(project, 40))
    const payload = { title, description: clipCp(String(input.description || ''), 2000), project }
    const tv = ver(input.target_version !== undefined ? input.target_version : input.targetVersion)
    if (tv) payload.target_version = tv
    return { kind, payload, project, hash: hashOf('bug', project, title.toLowerCase()), question: 'Add a bug in ' + project + ': ' + title + (tv ? ' (into ' + tv + ')' : '') + '?' }
  }
  const id = String(input.task_id || input.taskId || '')
  const task = T().readTask(id)
  if (!task) throw fail(404, 'no such task: ' + clipCp(id, 20))
  const project = task.projectId || ''
  if (kind === 'queue') {
    return { kind, payload: { task_id: task.id }, project, hash: hashOf('queue', task.id), question: 'Add ' + task.id + ' (' + clipCp(task.title, 80) + ') to the work queue?' }
  }
  const tv = ver(input.target_version !== undefined ? input.target_version : input.targetVersion)
  if (!tv) throw fail(400, 'plan_into needs a target_version')
  const ph = phase(input.phase)
  const payload = { task_id: task.id, target_version: tv }
  if (ph) payload.phase = ph
  return { kind, payload, project, hash: hashOf('plan_into', task.id, tv, ph), question: 'Plan ' + task.id + ' (' + clipCp(task.title, 80) + ') into ' + tv + (ph ? ' / ' + ph : '') + '?' }
}

/** Opens a proposal. Writes only the gate. A duplicate answers with the existing proposal. */
function create(input, actor, opts) {
  opts = opts || {}
  input = input || {}
  const c = clean(input)
  const why = clipCp(norm(input.why), 300)
  if (!why) throw fail(400, 'A proposal needs a short reason (why)')
  fs.mkdirSync(P.GATES, { recursive: true })
  return withLock(path.join(P.GATES, '_proposals'), () => {
    const all = gates()
    const dup = all.find((g) => g.proposal.hash === c.hash && (g.status === 'waiting' || (opts.anyStatus && g.status !== 'expired')))
    if (dup) return { question_id: dup.id, existing: true, status: dup.status }
    if (all.filter((g) => g.status === 'waiting' && g.project === c.project).length >= MAX_WAITING) throw fail(429, 'There are already ' + MAX_WAITING + ' proposals waiting for the owner in this project. Wait for the owner to decide some before proposing more.')
    const g = require('./runlog.cjs').gate({
      kind: 'approval', approvalType: 'proposal', project: c.project, question: c.question, label: 'Proposal: ' + c.kind,
      proposal: { kind: c.kind, payload: c.payload, why, evidence: clipCp(input.evidence || '', 200), hash: c.hash },
      askedBy: opts.askedBy || undefined,
    }, actor)
    return { question_id: g.id, existing: false, status: 'waiting' }
  })
}

/** A finished run of a version run lists findings: each "Pre-existing ..." one becomes a bug proposal. */
function fromFinish(record) {
  if (!record || !record.versionRun || !record.project || !Array.isArray(record.findings)) return []
  const made = []
  const asked = new Set()
  for (const f of record.findings) {
    const m = /^\s*\[?\s*pre-?existing\b\]?\s*[:\-–]?\s*(.*)$/is.exec(String(f))
    if (!m) continue
    const text = norm(m[1] || f)
    if (!text || asked.has(text.toLowerCase())) continue
    asked.add(text.toLowerCase())
    if (made.length >= MAX_AUTO) break
    try {
      const r = create({ kind: 'bug', title: text, project: record.project, why: 'A pre-existing problem found during version run ' + record.versionRun, evidence: 'run ' + record.id }, require('./runlog.cjs').actorFor('cli', 'supervisor'), { anyStatus: true, askedBy: 'agent' })
      if (!r.existing) made.push(r.question_id)
    } catch { /* refused (limit) or unknown project: the finish goes on */ }
  }
  return made
}

const find = (id) => {
  let g
  try { g = JSON.parse(fs.readFileSync(path.join(P.GATES, String(id).replace(/[^\w.-]/g, '') + '.json'), 'utf8')) } catch { throw fail(404, 'no such proposal') }
  if (g.approvalType !== 'proposal' || !g.proposal) throw fail(400, 'this question is not a proposal')
  return g
}
/** Answered with an Approve by a dashboard that did not know proposals (1.3): shown as "apply now?". */
const applyNow = (g) => g.status === 'answered' && !g.appliedAt && /^(approve|approved|yes)\b/i.test(String(g.answer || ''))

/** Runs the same code as the manual action. `p` is {kind, payload}; edits override payload fields. */
function apply(p, edits, actor) {
  const e = edits && typeof edits === 'object' ? edits : {}
  const d = Object.assign({}, p.payload, e)
  if (p.kind === 'plan_into') {
    const task = T().readTask(String(d.task_id || ''))
    if (!task) throw fail(404, 'no such task: ' + clipCp(d.task_id, 20))
    const t = T().updateTask({ id: task.id, targetVersion: String(d.target_version || ''), phaseId: d.phase ? String(d.phase) : null }, actor).task
    return { text: 'accepted: ' + t.id + ' planned into ' + t.targetVersion }
  }
  if (p.kind === 'bug') {
    const t = T().createTask({ title: d.title, description: d.description || '', projectId: d.project, type: 'bug', targetVersion: d.target_version || undefined }, actor)
    return { text: 'accepted: bug ' + t.id + ' created' }
  }
  if (p.kind === 'queue') {
    let Q = null
    try { Q = require('./queue.cjs') } catch { /* the work queue ships in the same release */ }
    if (!Q || typeof Q.add !== 'function') throw fail(409, 'The work queue is not available in this build')
    Q.add([String(d.task_id || '')], actor)
    return { text: 'accepted: ' + d.task_id + ' added to the work queue' }
  }
  throw fail(400, 'unknown proposal kind')
}

/** The owner decides (board only): accept, (with edits) or decline. Accepting applies first and answers
 *  after, so a refused apply leaves the proposal waiting. */
function decide(gateId, decision, edits, actor) {
  requireBoard(actor)
  const g = find(gateId)
  const Bd = B()
  if (decision === 'decline') {
    if (g.status !== 'waiting') throw fail(409, 'gate is ' + g.status)
    return { gate: Bd.answerGate(g.id, 'declined: no change was made', { via: 'dashboard' }) }
  }
  if (g.status !== 'waiting' && !applyNow(g)) throw fail(409, 'gate is ' + g.status)
  const r = apply(g.proposal, edits, actor)
  const now = new Date().toISOString()
  if (g.status === 'waiting') return Object.assign({ applied: r.text }, { gate: Bd.answerGate(g.id, r.text, { via: 'dashboard' }) && Bd.saveGate({ id: g.id, appliedAt: now }, 'dashboard') })
  return { applied: r.text, gate: Bd.saveGate({ id: g.id, appliedAt: now }, 'dashboard') }
}

module.exports = { KINDS, MAX_WAITING, MAX_AUTO, create, fromFinish, decide, apply, gates, applyNow, clean }
