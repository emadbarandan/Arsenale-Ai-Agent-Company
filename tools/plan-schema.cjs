/* Plan schema v1 (spec 1.3 section 7): pure validate + normalise, no deps.
 * check(text|object) -> { ok, errors[], unknown[], progress, runs }.
 * An invalid plan is rejected as a whole, with every problem listed. */
const MAX_BYTES = 5 * 1024 * 1024
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,59}$/
const ENUM = {
  phaseStatus: ['todo', 'doing', 'done'],
  taskStatus: ['todo', 'doing', 'review', 'blocked', 'done'],
  type: ['feature', 'bug', 'chore'],
  size: ['S', 'M', 'L'],
  tier: ['light', 'standard', 'heavy'],
  owner: ['agent', 'owner'],
  decisionStatus: ['open', 'decided'],
}
const WEIGHT = { S: 1, M: 3, L: 8 }
const KNOWN = {
  top: ['schema_version', 'project', 'phases', 'tasks', 'decisions', 'runs'],
  phase: ['id', 'title', 'goal', 'status', 'updated_at'],
  task: ['id', 'title', 'phase', 'status', 'type', 'size', 'tier', 'owner', 'target_version', 'acceptance', 'notes', 'updated_at', 'token_estimate', 'source'],
  decision: ['id', 'question', 'options', 'recommendation', 'status', 'answer', 'updated_at', 'source'],
  run: ['id', 'task_id', 'date', 'agent', 'model', 'tier', 'strategy', 'usage', 'cost', 'wall_seconds', 'source'],
}
const METERS = ['input', 'output', 'cache_read', 'cache_write']
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v)
const isNum = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0
const isInt = (v) => Number.isInteger(v) && v >= 0

function validate(plan) {
  const errors = []
  const unknown = []
  const err = (p, s) => errors.push(p + ': ' + s)
  if (!isObj(plan)) return { errors: ['(file): the plan must be a JSON object'], unknown }
  const noteUnknown = (o, kind, p) => { for (const k of Object.keys(o)) if (!KNOWN[kind].includes(k)) unknown.push(p + '.' + k) }
  noteUnknown(plan, 'top', '(file)')
  if (plan.schema_version !== 1) err('schema_version', 'must be 1')
  if (plan.project !== undefined && typeof plan.project !== 'string') err('project', 'must be text')
  const list = (key) => {
    if (plan[key] === undefined) return []
    if (!Array.isArray(plan[key])) { err(key, 'must be a list'); return [] }
    return plan[key]
  }
  const ids = (key, kind, fn) => {
    const seen = new Set()
    list(key).forEach((it, i) => {
      const p = key + '[' + i + ']'
      if (!isObj(it)) return err(p, 'must be an object')
      noteUnknown(it, kind, p)
      if (typeof it.id !== 'string' || !ID.test(it.id)) err(p + '.id', 'must match [A-Za-z0-9][A-Za-z0-9_.:-]{0,59}')
      else if (seen.has(it.id)) err(p + '.id', 'duplicate id "' + it.id + '"')
      else seen.add(it.id)
      fn(it, p)
    })
    return seen
  }
  const oneOf = (o, f, vals, p, req) => {
    if (o[f] === undefined) { if (req) err(p + '.' + f, 'is required'); return }
    if (!vals.includes(o[f])) err(p + '.' + f, 'unknown value ' + JSON.stringify(o[f]) + ' (use ' + vals.join('|') + ')')
  }
  const phaseIds = ids('phases', 'phase', (o, p) => oneOf(o, 'status', ENUM.phaseStatus, p))
  ids('tasks', 'task', (o, p) => {
    oneOf(o, 'status', ENUM.taskStatus, p); oneOf(o, 'type', ENUM.type, p); oneOf(o, 'size', ENUM.size, p)
    oneOf(o, 'tier', ENUM.tier, p); oneOf(o, 'owner', ENUM.owner, p)
    if (o.phase !== undefined && !phaseIds.has(o.phase)) err(p + '.phase', 'unknown phase ' + JSON.stringify(o.phase))
    if (o.token_estimate !== undefined && !isInt(o.token_estimate)) err(p + '.token_estimate', 'must be a whole number')
  })
  ids('decisions', 'decision', (o, p) => oneOf(o, 'status', ENUM.decisionStatus, p))
  const taskIds = new Set((Array.isArray(plan.tasks) ? plan.tasks : []).map((t) => t && t.id))
  ids('runs', 'run', (o, p) => {
    if (o.task_id !== undefined && !taskIds.has(o.task_id)) err(p + '.task_id', 'unknown task ' + JSON.stringify(o.task_id))
    oneOf(o, 'tier', ENUM.tier, p)
    if (o.wall_seconds !== undefined && !isNum(o.wall_seconds)) err(p + '.wall_seconds', 'must be a number of seconds')
    let meters = 0
    if (o.usage !== undefined) {
      if (!isObj(o.usage)) err(p + '.usage', 'must be an object')
      else for (const m of METERS) {
        if (o.usage[m] === undefined) continue
        if (!isInt(o.usage[m])) err(p + '.usage.' + m, 'must be a whole number')
        else meters += o.usage[m]
      }
    }
    if (o.cost !== undefined && o.cost !== 'n/a') {
      if (!isNum(o.cost)) err(p + '.cost', 'must be a number or "n/a"')
      else if (o.cost === 0 && meters === 0) err(p + '.cost', '0 with no token meters is unknown, not free: use "n/a"')
    }
  })
  return { errors, unknown }
}

function summarise(plan) {
  const tasks = Array.isArray(plan.tasks) ? plan.tasks : []
  const w = (t) => WEIGHT[t.size] || WEIGHT.M
  const pct = (d, t) => (t ? Math.round((d / t) * 100) : 0)
  const phases = (plan.phases || []).map((ph) => {
    const ts = tasks.filter((t) => t.phase === ph.id)
    const total = ts.reduce((a, t) => a + w(t), 0)
    const done = ts.filter((t) => t.status === 'done').reduce((a, t) => a + w(t), 0)
    return { id: ph.id, tasks: ts.length, doneWeight: done, totalWeight: total, percent: pct(done, total) }
  })
  const total = tasks.reduce((a, t) => a + w(t), 0)
  const done = tasks.filter((t) => t.status === 'done').reduce((a, t) => a + w(t), 0)
  const progress = tasks.length ? { phases, overall: { tasks: tasks.length, doneWeight: done, totalWeight: total, percent: pct(done, total) } } : { phases, overall: null, label: 'No plan' }
  const runs = plan.runs || []
  const usage = { input: 0, output: 0, cache_read: 0, cache_write: 0 }
  let priced = 0, cost = 0, wall = 0
  for (const r of runs) {
    for (const m of METERS) usage[m] += (r.usage && r.usage[m]) || 0
    wall += r.wall_seconds || 0
    if (typeof r.cost === 'number') { priced++; cost += r.cost }
  }
  const usdStatus = !runs.length ? 'none' : priced === runs.length ? 'complete' : priced ? 'partial' : 'unknown'
  return { progress, runs: { count: runs.length, usage, wallSeconds: wall, pricedRuns: priced, unpricedRuns: runs.length - priced, costUsd: Math.round(cost * 1e6) / 1e6, usdStatus } }
}

function check(input) {
  let plan = input
  if (typeof input === 'string' || Buffer.isBuffer(input)) {
    if (Buffer.byteLength(input) > MAX_BYTES) return { ok: false, errors: ['(file): larger than 5 MB, refused'], unknown: [] }
    try { plan = JSON.parse(String(input)) } catch { return { ok: false, errors: ['(file): not JSON: save the plan as JSON'], unknown: [] } }
  }
  const v = validate(plan)
  if (v.errors.length) return { ok: false, errors: v.errors, unknown: v.unknown }
  return { ok: true, errors: [], unknown: v.unknown, ...summarise(plan) }
}

// the numbers a fixture's expected.json holds; every key there must match
function compareExpected(result, expected) {
  const diffs = []
  const walk = (a, e, p) => {
    if (isObj(e)) { for (const k of Object.keys(e)) walk(a == null ? undefined : a[k], e[k], p ? p + '.' + k : k) }
    else if (Array.isArray(e)) { if (!Array.isArray(a) || a.length !== e.length) diffs.push(p + ': expected ' + e.length + ' items'); else e.forEach((x, i) => walk(a[i], x, p + '[' + i + ']')) }
    else if (a !== e) diffs.push(p + ': expected ' + JSON.stringify(e) + ', got ' + JSON.stringify(a))
  }
  walk(result, expected, '')
  return diffs
}

function format(r) {
  if (!r.ok) return 'REJECTED: ' + r.errors.length + ' problem(s)\n' + r.errors.map((e) => '  - ' + e).join('\n')
  const L = []
  if (r.progress.overall) {
    for (const p of r.progress.phases) L.push('Phase ' + p.id + ': ' + p.percent + '% (' + p.doneWeight + '/' + p.totalWeight + ')')
    const o = r.progress.overall
    L.push('Overall: ' + o.percent + '% (' + o.doneWeight + '/' + o.totalWeight + ' weight, ' + o.tasks + ' tasks)')
  } else L.push('No plan')
  const u = r.runs.usage
  L.push('Runs: ' + r.runs.count + ', tokens in ' + u.input + ' out ' + u.output + ' cache read ' + u.cache_read + ' write ' + u.cache_write + ', cost $' + r.runs.costUsd + ' (' + r.runs.usdStatus + ': ' + r.runs.unpricedRuns + ' run(s) without a price)')
  if (r.unknown.length) L.push('Unknown fields (kept, not an error): ' + r.unknown.join(', '))
  return L.join('\n')
}

module.exports = { check, validate, summarise, compareExpected, format, MAX_BYTES, ENUM, WEIGHT }
