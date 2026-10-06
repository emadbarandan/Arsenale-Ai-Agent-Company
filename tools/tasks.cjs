/* Tasks: the work the owner writes for the assistant, and the assistant's
 * own split of it. The UI says "task"; the files keep the issue shape of the
 * company spec (AC-spec 6.7), so one shape serves the dashboard, the CLI and
 * the MCP server.
 *
 *   company/issues/<KEY>-<n>.json      one file per task
 *   company/comments/<KEY>-<n>.jsonl   its comments, append-only
 *
 * Writing a task never starts anything. Assigning it is a request that the
 * assistant reads the next time it is asked (get_inbox, --inbox).
 *
 * Who may do what (spec R-6.6, AC-spec R33), enforced here and not in the UI:
 *   board        everything: create, edit, cancel, reopen, sign-off, comment
 *   supervisor   create, comment, set in_progress | in_review | blocked | done
 *                (done only when the task needs no sign-off), assign
 *   agent:<x>    comment only, on a task one of x's jobs is linked to
 */
const fs = require('fs')
const path = require('path')
const P = require('./paths.cjs')
const { writeAtomic } = require('./build-agent-dashboard.cjs')
const { fail, OWNER_ONLY, clipCp, actorLabel } = require('./runlog.cjs')

const ISSUES = path.join(P.COMPANY, 'issues')
const COMMENTS = path.join(P.COMPANY, 'comments')
const STATUSES = ['backlog', 'todo', 'in_progress', 'in_review', 'blocked', 'done', 'cancelled']
const PRIORITIES = ['urgent', 'high', 'medium', 'low', 'none']
const TASK_ID = /^[A-Z][A-Z0-9]{1,5}-[1-9]\d{0,6}$/
const KEY = /^[A-Z][A-Z0-9]{1,5}$/
// The assistant may create tasks to split work; this many a day is the most
// it may create, so a confused one fills no disk (spec 5.6 Security).
const ASSISTANT_DAILY_CAP = 200
const LINK_BAD = "Links must start with https:// or http://; for a file, use 'add file path'"

const company = () => require('./agent-company.cjs')
const fileOf = (id) => path.join(ISSUES, id + '.json')

function checkId(id) {
  const s = String(id || '')
  if (!TASK_ID.test(s)) throw fail(400, 'bad task id: ' + clipCp(s, 20))
  return s
}

function readTask(id) {
  try { return JSON.parse(fs.readFileSync(fileOf(checkId(id)), 'utf8')) } catch (e) { if (e.code === 400) throw e; return null }
}
function needTask(id) {
  const t = readTask(id)
  if (!t) throw fail(404, 'no such task: ' + clipCp(id, 20))
  return t
}

/** A calendar date "YYYY-MM-DD", or "" for none. Past dates are allowed. */
function cleanDate(v) {
  if (v === undefined || v === null || v === '') return ''
  const s = String(v)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  const d = m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  if (!m || isNaN(d) || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) throw fail(400, 'Enter the due date as a calendar date, for example 2026-12-01')
  return s
}

/** Links are web addresses or file paths shown as text, never opened by the
 *  server and never read. */
function cleanLinks(list) {
  if (list === undefined) return undefined
  if (!Array.isArray(list)) throw fail(400, 'links must be a list')
  if (list.length > 20) throw fail(400, 'At most 20 links')
  return list.map((l) => {
    if (!l || typeof l !== 'object') throw fail(400, LINK_BAD)
    const title = clipCp(l.title || '', 120)
    if (l.path !== undefined && l.path !== '') {
      const p = String(l.path)
      if (Array.from(p).length > 400) throw fail(400, 'A file path is at most 400 characters')
      if (/[\u0000-\u001f]/.test(p)) throw fail(400, 'A file path cannot hold control characters')
      return { title, path: p }
    }
    const url = String(l.url || '')
    if (!/^https?:\/\/[^\s]+$/i.test(url) || url.length > 2000) throw fail(400, LINK_BAD)
    return { title, url }
  })
}

function cleanLabels(v) {
  if (v === undefined) return undefined
  if (!Array.isArray(v)) throw fail(400, 'labels must be a list')
  return v.slice(0, 10).map((s) => clipCp(s, 30)).filter(Boolean)
}

/** The prefix for a new task: the project's key, else the company's. */
function prefixFor(co, projectId) {
  const p = projectId && co.projects.find((x) => x.id === projectId)
  if (p && KEY.test(p.key)) return p.key
  return KEY.test(co.company.issuePrefix) ? co.company.issuePrefix : 'CO'
}

/** Next free number for a prefix. The file is made with an exclusive create
 *  and retried on a collision, so two creations never share a key (R22). */
function allocate(prefix, write) {
  fs.mkdirSync(ISSUES, { recursive: true })
  for (let attempt = 0; attempt < 20; attempt++) {
    let n = 0
    for (const f of fs.readdirSync(ISSUES)) {
      const m = new RegExp('^' + prefix + '-(\\d+)\\.json$').exec(f)
      if (m) n = Math.max(n, Number(m[1]))
    }
    // the scan above already sees a file that won the race, so n + 1 is the next free key
    const id = prefix + '-' + (n + 1)
    try { write(id); return id } catch (e) { if (e.code !== 'EEXIST') throw e }
  }
  throw fail(409, 'could not allocate a task id, try again')
}

const pushHistory = (t, by, field, from, to) => {
  t.history = Array.isArray(t.history) ? t.history : []
  t.history.push({ at: new Date().toISOString(), by, field, from: from === undefined ? '' : from, to: to === undefined ? '' : to })
  if (t.history.length > 100) t.history = t.history.slice(-100)
}

function assigneeOf(co, input, out) {
  if (input.assignee !== undefined || input.assigneeAgentId !== undefined) {
    const a = String(input.assignee !== undefined ? input.assignee : input.assigneeAgentId)
    if (a === '' || a === 'supervisor') { out.assigneeAgentId = a; out.assigneeUserId = '' }
    else if (a === 'board' || a === 'you') { out.assigneeAgentId = ''; out.assigneeUserId = 'board' }
    else {
      if (!/^[A-Za-z0-9][\w.-]{0,59}$/.test(a)) throw fail(400, 'bad assignee')
      out.assigneeAgentId = a; out.assigneeUserId = ''
    }
  }
  if (input.assigneeOfficeId !== undefined || input.officeId !== undefined) {
    const o = String(input.assigneeOfficeId !== undefined ? input.assigneeOfficeId : input.officeId)
    if (o && !co.offices.some((x) => x.id === o)) throw fail(400, 'no such office: ' + clipCp(o, 40))
    out.assigneeOfficeId = o
  }
}

/** Creates a task. The board through the dashboard; the assistant through
 *  MCP or the CLI (createdBy says which). */
function createTask(input, actor) {
  const C = company()
  const co = C.readCompany()
  if (!co.configured) throw fail(409, 'Set up your company first: tasks belong to a company')
  if (co.readOnly) throw fail(409, 'Company data was written by a newer dashboard (v' + co.company.schemaVersion + '). Editing is disabled.')
  if (actor.role === 'agent') throw fail(403, 'agents may only comment on their own task')
  const title = clipCp(String(input.title || '').trim(), 200)
  if (!title) throw fail(400, 'A task needs a title (1 to 200 characters)')
  if (Array.from(String(input.description || '')).length > 8000) throw fail(400, 'The details are at most 8000 characters')
  const isBoard = actor.role === 'board'
  if (!isBoard) {
    const today = new Date().toISOString().slice(0, 10)
    let made = 0
    try { for (const f of fs.readdirSync(ISSUES)) { const t = readTask(f.replace(/\.json$/, '')); if (t && t.createdBy !== 'board' && String(t.createdAt).slice(0, 10) === today) made++ } } catch { /* no tasks yet */ }
    if (made >= ASSISTANT_DAILY_CAP) throw fail(429, 'Your assistant created ' + ASSISTANT_DAILY_CAP + ' tasks today, the most allowed; ask the owner to clear some')
  }
  const projectId = input.projectId ? String(input.projectId) : ''
  if (projectId && !co.projects.some((p) => p.id === projectId)) throw fail(400, 'no such project: ' + clipCp(projectId, 40))
  const now = new Date().toISOString()
  const status = input.status && STATUSES.includes(String(input.status)) && ['backlog', 'todo'].includes(String(input.status)) ? String(input.status) : 'todo'
  const t = {
    id: '', title, description: clipCp(input.description || '', 8000), status,
    priority: PRIORITIES.includes(String(input.priority)) ? String(input.priority) : 'none',
    projectId, goalId: '', parentId: '', assigneeAgentId: '', assigneeUserId: '', assigneeOfficeId: '',
    labels: cleanLabels(input.labels) || [], runIds: [], gateIds: [], artifacts: [],
    links: cleanLinks(input.links) || [], dueDate: cleanDate(input.dueDate),
    // only the owner may ask for a sign-off (R-6.6)
    needsSignOff: isBoard && input.needsSignOff === true,
    seenBy: {}, createdBy: actorLabel(actor), createdAt: now, updatedAt: now, completedAt: '', history: [],
  }
  if (input.parentId) {
    const parent = readTask(input.parentId)
    if (!parent) throw fail(400, 'no such parent task: ' + clipCp(input.parentId, 20))
    t.parentId = parent.id
  }
  assigneeOf(co, input, t)
  const id = allocate(prefixFor(co, projectId), (cand) => {
    t.id = cand
    fs.writeFileSync(fileOf(cand), JSON.stringify(t, null, 2), { flag: 'wx' })
  })
  const summary = id + ' created: ' + title
  C.activity({ actor: actorLabel(actor), action: 'task.created', entityType: 'task', entityId: id, summary, via: actor.door })
  if (isBoard) C.inboxLine({ type: 'task.created', id, summary: 'New task ' + id + ': ' + title }, actor.door)
  return t
}

/** The status words the assistant uses through MCP. */
const MCP_STATUS = { in_progress: 'in_progress', waiting_for_you: 'in_review', blocked: 'blocked', done: 'done' }

/** Changes a task. Each actor has its own allowed moves (R-6.6). */
function updateTask(input, actor) {
  const C = company()
  const co = C.readCompany()
  if (!co.configured) throw fail(409, 'Set up your company first: tasks belong to a company')
  if (co.readOnly) throw fail(409, 'Company data was written by a newer dashboard (v' + co.company.schemaVersion + '). Editing is disabled.')
  const t = needTask(input.id)
  const by = actorLabel(actor)
  const isBoard = actor.role === 'board'
  if (actor.role === 'agent') throw fail(403, 'agents may only comment on their own task')
  const changed = []
  const set = (field, value) => {
    if (JSON.stringify(t[field]) === JSON.stringify(value)) return
    pushHistory(t, by, field, typeof t[field] === 'object' ? JSON.stringify(t[field]) : t[field], typeof value === 'object' ? JSON.stringify(value) : value)
    t[field] = value
    changed.push(field)
  }
  if (input.status !== undefined) {
    const want = String(input.status)
    if (!STATUSES.includes(want)) throw fail(400, 'status must be one of ' + STATUSES.join(', '))
    const closed = t.status === 'done' || t.status === 'cancelled'
    if (!isBoard) {
      if (closed && want !== t.status) throw fail(403, 'Only the owner can reopen a task that is done or cancelled. ' + OWNER_ONLY)
      if (!['in_progress', 'in_review', 'blocked', 'done'].includes(want)) throw fail(403, 'Your assistant may set in_progress, waiting_for_you, blocked or done. ' + OWNER_ONLY)
      if (want === 'done' && t.needsSignOff) throw fail(409, 'This task needs the owner\'s sign-off: set the status "waiting_for_you" instead, and the owner marks it done.')
    }
    if (want !== t.status) {
      // reopening clears the finish time; finishing sets it
      if (want === 'done') t.completedAt = new Date().toISOString()
      else if (closed) t.completedAt = ''
      set('status', want)
    }
  }
  if (isBoard) {
    if (input.title !== undefined) { const v = clipCp(String(input.title).trim(), 200); if (!v) throw fail(400, 'A task needs a title (1 to 200 characters)'); set('title', v) }
    if (input.description !== undefined) { if (Array.from(String(input.description)).length > 8000) throw fail(400, 'The details are at most 8000 characters'); set('description', String(input.description)) }
    if (input.dueDate !== undefined) set('dueDate', cleanDate(input.dueDate))
    if (input.links !== undefined) set('links', cleanLinks(input.links))
    if (input.labels !== undefined) set('labels', cleanLabels(input.labels))
    if (input.priority !== undefined) { if (!PRIORITIES.includes(String(input.priority))) throw fail(400, 'priority must be one of ' + PRIORITIES.join(', ')); set('priority', String(input.priority)) }
    if (input.needsSignOff !== undefined) set('needsSignOff', input.needsSignOff === true)
  } else {
    for (const k of ['title', 'description', 'dueDate', 'links', 'labels', 'priority', 'needsSignOff']) {
      if (input[k] !== undefined) throw fail(403, 'Only the owner can change ' + k + '. ' + OWNER_ONLY)
    }
  }
  const asg = {}
  assigneeOf(co, input, asg)
  for (const [k, v] of Object.entries(asg)) set(k, v)
  if (!changed.length) return { task: t, changed }
  t.updatedAt = new Date().toISOString()
  writeAtomic(fileOf(t.id), JSON.stringify(t, null, 2))
  const summary = t.id + ': ' + changed.map((k) => k + '=' + (typeof t[k] === 'object' ? JSON.stringify(t[k]).slice(0, 40) : String(t[k]).slice(0, 40))).join(', ')
  C.activity({ actor: by, action: 'task.updated', entityType: 'task', entityId: t.id, summary, via: actor.door })
  if (isBoard) C.inboxLine({ type: 'task.updated', id: t.id, summary }, actor.door)
  return { task: t, changed }
}

/** Appends a comment. Comments are never edited (AC-spec 6.7). */
function addComment(taskId, text, actor, opts) {
  const C = company()
  const t = needTask(taskId)
  const body = String(text == null ? '' : text).trim()
  if (!body) throw fail(400, 'A comment needs text')
  if (Array.from(body).length > 4000) throw fail(400, 'A comment is at most 4000 characters')
  if (actor.role === 'agent') {
    // an agent comments only on a task one of its own jobs is linked to (R33)
    const own = (t.runIds || []).some((id) => { const r = require('./runlog.cjs').readActive(id); return r && r.agent === actor.name }) || (opts && opts.jobAgent === actor.name && (t.runIds || []).includes(opts.jobId))
    if (!own) throw fail(403, 'agents may only comment on their own task')
  }
  fs.mkdirSync(COMMENTS, { recursive: true })
  const c = { id: 'c-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6), at: new Date().toISOString(), by: actorLabel(actor), text: body, via: actor.door }
  if (opts && opts.jobId) c.jobId = String(opts.jobId).replace(/[^\w.-]/g, '').slice(0, 80)
  fs.appendFileSync(path.join(COMMENTS, t.id + '.jsonl'), JSON.stringify(c) + '\n')
  C.activity({ actor: c.by, action: 'comment.added', entityType: 'task', entityId: t.id, summary: t.id + ': ' + body, via: actor.door })
  if (actor.role === 'board') C.inboxLine({ type: 'comment.added', id: t.id, summary: 'Comment on ' + t.id + ': ' + body }, actor.door)
  return c
}

function readComments(id) {
  let text = ''
  try { text = fs.readFileSync(path.join(COMMENTS, checkId(id) + '.jsonl'), 'utf8') } catch { return [] }
  const lines = text.split('\n').filter((l) => l.trim()).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  const retracted = new Set(lines.filter((l) => l.type === 'retract').map((l) => l.of))
  return lines.filter((l) => l.type !== 'retract' && !retracted.has(l.id))
}

/** Every task, as summaries (details load on demand, AC-spec R37). */
function listTasks(filter) {
  filter = filter || {}
  let names = []
  try { names = fs.readdirSync(ISSUES).filter((f) => /\.json$/.test(f)) } catch { return [] }
  const out = []
  for (const f of names) {
    let t
    try { t = JSON.parse(fs.readFileSync(path.join(ISSUES, f), 'utf8')) } catch { continue }
    if (!t || !TASK_ID.test(String(t.id))) continue
    if (filter.status && !(Array.isArray(filter.status) ? filter.status : [filter.status]).includes(t.status)) continue
    if (filter.officeId && t.assigneeOfficeId !== filter.officeId) continue
    if (filter.assignee && t.assigneeAgentId !== filter.assignee) continue
    out.push(summaryOf(t))
  }
  return out.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
}

function summaryOf(t) {
  let comments = 0
  try { comments = fs.readFileSync(path.join(COMMENTS, t.id + '.jsonl'), 'utf8').split('\n').filter((l) => l.trim()).length } catch { /* none */ }
  const seen = t.seenBy && typeof t.seenBy === 'object' ? Object.values(t.seenBy).sort().pop() || '' : ''
  return {
    id: t.id, title: t.title, status: t.status, priority: t.priority, projectId: t.projectId,
    assigneeAgentId: t.assigneeAgentId, assigneeUserId: t.assigneeUserId, assigneeOfficeId: t.assigneeOfficeId || '',
    dueDate: t.dueDate || '', needsSignOff: !!t.needsSignOff, createdBy: t.createdBy, updatedAt: t.updatedAt, createdAt: t.createdAt, completedAt: t.completedAt || '',
    comments, seenAt: seen, runs: (t.runIds || []).length,
  }
}

/** One task with its comments. `seenBy` is stamped when a client reads it. */
function getTask(id, opts) {
  const t = needTask(id)
  if (opts && opts.seenBy) markSeen([t.id], opts.seenBy)
  return Object.assign({}, t, { comments: readComments(t.id) })
}

function markSeen(ids, clientId) {
  const key = String(clientId || '').replace(/[^\w.-]/g, '').slice(0, 60)
  if (!key) return
  for (const id of ids) {
    const t = readTask(id)
    if (!t) continue
    t.seenBy = t.seenBy && typeof t.seenBy === 'object' ? t.seenBy : {}
    t.seenBy[key] = new Date().toISOString()
    writeAtomic(fileOf(t.id), JSON.stringify(t, null, 2))
  }
}

/** A job started or finished for this task (R-6.10): the job is linked, and
 *  a task still "to do" moves to "in progress", never backwards. */
function linkRun(taskId, runId, actor, opts) {
  if (!TASK_ID.test(String(taskId)) || !runId) return null
  const t = readTask(taskId)
  if (!t) return null
  t.runIds = Array.isArray(t.runIds) ? t.runIds : []
  let touched = false
  if (!t.runIds.includes(runId)) { t.runIds.push(String(runId)); touched = true }
  if (!(opts && opts.finish) && (t.status === 'todo' || t.status === 'backlog')) {
    pushHistory(t, actorLabel(actor), 'status', t.status, 'in_progress')
    t.status = 'in_progress'
    touched = true
  }
  if (touched) { t.updatedAt = new Date().toISOString(); writeAtomic(fileOf(t.id), JSON.stringify(t, null, 2)) }
  return t
}

module.exports = {
  ISSUES, COMMENTS, STATUSES, MCP_STATUS, TASK_ID, LINK_BAD,
  createTask, updateTask, addComment, readComments, listTasks, getTask, readTask, markSeen, linkRun, cleanDate, cleanLinks,
}
