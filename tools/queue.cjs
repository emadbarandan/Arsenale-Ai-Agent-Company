/* The work queue and `arsenale next` (spec 1.4 section 7).
 *
 *   company/queue.json    { entries: [{taskId, approvedAt, approvedBy, claimedBy, claimedAt}], updatedAt }
 *
 * The owner approves tasks into an ordered queue; the supervisor asks `next`
 * for the first unclaimed entry and gets the task plus the project's context
 * pack. The server starts nothing: `next` only prints. Reading never writes:
 * an entry whose task is done, cancelled or gone is hidden on read and dropped
 * on the next write. A claim (supervisor only) moves the task to in_progress
 * through updateTask and lasts until the task leaves in_progress or is released. */
const fs = require('fs')
const path = require('path')
const P = require('./paths.cjs')
const { writeAtomic } = require('./build-agent-dashboard.cjs')
const { withLock } = require('./store.cjs')
const { fail, OWNER_ONLY, clipCp, actorLabel } = require('./runlog.cjs')

const FILE = () => path.join(P.COMPANY, 'queue.json')
const MAX = 200
const EMPTY = 'The queue is empty: the owner approves tasks into it on the Plan screen.'
const QUEUEABLE = ['todo', 'backlog']
const TASK_TOKENS = 500, PACK_TOKENS = 1500
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v)
const T = () => require('./tasks.cjs')

function rawEntries() {
  let raw = null
  try { raw = JSON.parse(fs.readFileSync(FILE(), 'utf8')) } catch { /* none */ }
  const seen = new Set()
  const list = isObj(raw) && Array.isArray(raw.entries) ? raw.entries : []
  return list.filter((e) => isObj(e) && T().TASK_ID.test(String(e.taskId)) && !seen.has(e.taskId) && seen.add(e.taskId)).slice(0, MAX).map((e) => ({
    taskId: String(e.taskId), approvedAt: String(e.approvedAt || ''), approvedBy: String(e.approvedBy || ''), claimedBy: String(e.claimedBy || ''), claimedAt: String(e.claimedAt || ''),
  }))
}

/** The queue as the screens see it: entries of finished or missing tasks left
 *  out, a claim that no longer matches an in_progress task read as unclaimed.
 *  Each row carries the task summary. Never writes. */
function read(tasks) {
  const byId = new Map((tasks || T().listTasks()).map((t) => [t.id, t]))
  const entries = []
  for (const e of rawEntries()) {
    const t = byId.get(e.taskId)
    if (!t || t.status === 'done' || t.status === 'cancelled') continue
    const claimed = !!e.claimedBy && t.status === 'in_progress'
    entries.push(Object.assign({}, e, { claimedBy: claimed ? e.claimedBy : '', claimedAt: claimed ? e.claimedAt : '', claimed, task: t }))
  }
  return { entries, length: entries.length, updatedAt: '' }
}

function needBoard(actor) { if (!actor || actor.role !== 'board') throw fail(403, 'Only the owner can change the queue. ' + OWNER_ONLY) }
function needSupervisor(actor) {
  if (!actor || actor.role === 'agent') throw fail(403, 'Only the supervisor or the owner can claim or release a task. ' + OWNER_ONLY)
}

function mutate(fn, actor) {
  require('./runlog.cjs').refuseInShadow(actor)
  fs.mkdirSync(P.COMPANY, { recursive: true })
  return withLock(FILE(), () => {
    const live = new Set(read().entries.map((e) => e.taskId))
    const entries = rawEntries().filter((e) => live.has(e.taskId)) // drop finished entries on write
    const out = fn(entries)
    writeAtomic(FILE(), JSON.stringify({ entries, updatedAt: new Date().toISOString() }, null, 2))
    return out
  })
}

function add(ids, actor) {
  needBoard(actor)
  const list = (Array.isArray(ids) ? ids : [ids]).map(String)
  const Tk = T()
  const added = []
  mutate((entries) => {
    for (const id of list) {
      const t = Tk.readTask(id)
      if (!t) throw fail(404, 'no such task: ' + clipCp(id, 20))
      if (!QUEUEABLE.includes(t.status)) throw fail(409, id + ' is ' + t.status + ': only a task still to do (or in the backlog) can be queued')
      if (entries.some((e) => e.taskId === id)) continue
      if (entries.length >= MAX) throw fail(400, 'The queue holds at most ' + MAX + ' tasks')
      entries.push({ taskId: id, approvedAt: new Date().toISOString(), approvedBy: actorLabel(actor), claimedBy: '', claimedAt: '' })
      added.push(id)
    }
  })
  return { added }
}
function remove(id, actor) {
  needBoard(actor)
  return mutate((entries) => {
    const i = entries.findIndex((e) => e.taskId === String(id))
    if (i < 0) throw fail(404, id + ' is not in the queue')
    entries.splice(i, 1)
    return { removed: String(id) }
  })
}
/** Moves an entry to a 1-based position, or one step with `to` "up" / "down". */
function move(id, to, actor) {
  needBoard(actor)
  return mutate((entries) => {
    const i = entries.findIndex((e) => e.taskId === String(id))
    if (i < 0) throw fail(404, id + ' is not in the queue')
    let j = to === 'up' ? i - 1 : to === 'down' ? i + 1 : Number(to) - 1
    if (!Number.isInteger(j)) throw fail(400, 'move to a position (1, 2, ...) or up or down')
    j = Math.max(0, Math.min(entries.length - 1, j))
    const [e] = entries.splice(i, 1)
    entries.splice(j, 0, e)
    return { moved: String(id), position: j + 1 }
  })
}
function clear(actor) {
  needBoard(actor)
  return mutate((entries) => { const n = entries.length; entries.length = 0; return { cleared: n } })
}
/** "Queue next phase": the open todo tasks of a version's phase, in table order. */
function addPhase(projectId, versionName, phaseId, actor) {
  needBoard(actor)
  const tasks = T().listTasks().filter((t) => t.projectId === projectId && t.targetVersion === versionName && t.phaseId === String(phaseId) && t.status === 'todo').reverse()
  return add(tasks.map((t) => t.id), actor)
}

function apply(b, actor) {
  switch (b.op) {
    case 'add': return add(b.tasks || b.task, actor)
    case 'add-phase': return addPhase(String(b.project || ''), String(b.version || ''), String(b.phase || ''), actor)
    case 'remove': return remove(b.task, actor)
    case 'move': return move(b.task, b.to, actor)
    case 'clear': return clear(actor)
    default: throw fail(400, 'unknown queue operation')
  }
}

const tok = (s) => Math.ceil(String(s).length / 4)

/** The task part of an answer, at most TASK_TOKENS tokens: the description is
 *  clipped (to 2,000 characters, less when the rest needs the room). */
function taskPart(id) {
  const t = T().readTask(id)
  let phase = ''
  try { const v = require('./plan.cjs').readPlan(t.projectId).versions.find((x) => x.name === t.targetVersion); const ph = v && v.phases.find((p) => p.id === t.phaseId); phase = ph ? ph.title : '' } catch { /* no plan */ }
  const base = {
    id: t.id, title: clipCp(t.title, 200), type: t.type || '', size: t.size || '', tier: t.tier || '', targetVersion: t.targetVersion || '', phase: clipCp(phase, 80), kind: t.kind || '',
    assignee: t.assigneeAgentId || '', office: t.assigneeOfficeId || '', projectId: t.projectId || '',
  }
  const acc = clipCp(t.acceptance || '', 400)
  const room = TASK_TOKENS * 4 - JSON.stringify(Object.assign({}, base, { description: '', acceptance: acc })).length - 8
  const description = clipCp(t.description || '', Math.max(0, Math.min(2000, room)))
  const out = Object.assign({}, base, { description, acceptance: acc })
  while (tok(JSON.stringify(out)) > TASK_TOKENS && out.acceptance.length > 20) out.acceptance = clipCp(out.acceptance, out.acceptance.length - 40)
  return out
}

/** `next`: the first unclaimed approved task (optionally of one project) with
 *  its context pack. With `claim` (supervisor only) the entry is claimed and the
 *  task moves to in_progress. Starts nothing. */
function next(opts, actor) {
  opts = opts || {}
  if (opts.claim) needSupervisor(actor)
  const doRead = () => {
    const choose = () => {
      const q = read()
      const open = q.entries.filter((e) => !opts.project || e.task.projectId === opts.project)
      const pick = open.find((e) => !e.claimed && (e.task.status === 'todo' || e.task.status === 'backlog'))
      return { q, pick }
    }
    let { q, pick } = choose()
    if (opts.claim && pick) {
      // pick and claim under one lock, from a fresh read: two supervisors never get the same task
      pick = null
      withLock(FILE(), () => {
        const c = choose()
        q = c.q; pick = c.pick
        if (!pick) return
        T().updateTask({ id: pick.taskId, status: 'in_progress' }, actor)
        mutate((entries) => { const e = entries.find((x) => x.taskId === pick.taskId); if (e) { e.claimedBy = actorLabel(actor); e.claimedAt = new Date().toISOString() } })
      })
    }
    if (!pick) return { empty: true, message: EMPTY, queueLength: q.length }
    const position = q.entries.indexOf(pick) + 1
    const task = taskPart(pick.taskId)
    let context = '', contextTokens = 0
    try { const c = require('./context-pack.cjs').read(task.projectId); context = c.markdown; contextTokens = Math.min(c.tokens, PACK_TOKENS) } catch { /* no pack for this project */ }
    return { empty: false, task, position, queueLength: q.length, claimed: !!opts.claim, context, contextTokens, howTo: 'start_job with task_id ' + task.id + '; finish_job when done' }
  }
  return doRead()
}

function release(taskId, actor) {
  needSupervisor(actor)
  mutate((entries) => {
    const e = entries.find((x) => x.taskId === String(taskId))
    if (!e) throw fail(404, taskId + ' is not in the queue')
    e.claimedBy = ''; e.claimedAt = ''
  })
  return { released: String(taskId) }
}

function nextText(r) {
  if (r.empty) return r.message
  const t = r.task
  return ['Next: ' + t.id + ' ' + t.title + '  (' + r.position + ' of ' + r.queueLength + (r.claimed ? ', claimed' : '') + ')',
    [t.type, t.size && 'size ' + t.size, t.tier && 'tier ' + t.tier, t.targetVersion && 'version ' + t.targetVersion, t.phase && 'phase ' + t.phase, t.kind && 'kind ' + t.kind, t.assignee && 'for ' + t.assignee, t.office && 'office ' + t.office].filter(Boolean).join(', '),
    t.description ? '\n' + t.description : '', t.acceptance ? '\nAcceptance: ' + t.acceptance : '', '\n' + r.howTo, '\n--- context ---\n' + r.context].filter((x) => x !== '').join('\n')
}

function run(args, say, mode) {
  const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined }
  const flagVals = ['--project', '--release', '--by']
  const rest = args.filter((a, i) => !a.startsWith('--') && !flagVals.includes(args[i - 1]))
  const R = require('./runlog.cjs')
  try {
    if (mode === 'next') {
      const actor = R.cliActor({ by: val('--by') || 'supervisor' })
      if (val('--release')) { const r = release(val('--release'), actor); say(args.includes('--json') ? JSON.stringify(r) : 'Released ' + r.released); return 0 }
      const r = next({ project: val('--project'), claim: args.includes('--claim') }, actor)
      say(args.includes('--json') ? JSON.stringify(r, null, 2) : nextText(r))
      return 0
    }
    const op = rest[0]
    if (!op || op === 'show' || op === 'list') {
      const q = read()
      say(args.includes('--json') ? JSON.stringify(q, null, 2) : q.length ? q.entries.map((e, i) => (i + 1) + '. ' + e.taskId + ' ' + e.task.title + (e.claimed ? '  [claimed by ' + e.claimedBy + ']' : '')).join('\n') : EMPTY)
      return 0
    }
    const actor = R.cliActor({ by: 'board' })
    const usage = 'usage: arsenale queue [list] | add <task>... | remove <task> | move <task> <position|up|down> | clear   (changes need the owner key)'
    let r
    if (op === 'add' && rest.length > 1) r = add(rest.slice(1), actor)
    else if (op === 'remove' && rest[1]) r = remove(rest[1], actor)
    else if (op === 'move' && rest[1] && rest[2]) r = move(rest[1], rest[2], actor)
    else if (op === 'clear') r = clear(actor)
    else throw fail(400, usage)
    say(JSON.stringify(r))
    return 0
  } catch (e) { say(e.message); return 1 }
}

module.exports = { FILE, EMPTY, read, add, remove, move, clear, addPhase, apply, next, release, nextText, run, taskPart }
