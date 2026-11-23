/* Release-notes draft (spec 1.4 section 9, P6).
 *
 * Markdown drafted from the done tasks of one version: "New" (feature),
 * "Fixed" (bug), "Other" (chore and untyped). Cancelled tasks are left out;
 * tasks not done are only counted. Reads only, unless --write: then the owner
 * saves <home>/release-notes/<projectId>/<version>.md in the data folder,
 * never in a repository. The owner edits the text; the release gate is
 * unchanged (no tagging, no publishing).
 */
const fs = require('fs')
const path = require('path')
const P = require('./paths.cjs')
const { writeAtomic } = require('./build-agent-dashboard.cjs')
const { fail, OWNER_ONLY, clipCp, cliActor } = require('./runlog.cjs')

const NAME = /^[0-9A-Za-z][0-9A-Za-z.+_-]{0,39}$/
const PROJ = /^(?!\.+$)[\w.-]{1,60}$/
const HEAD = 'Draft: edit before release.'
const GROUPS = [['New', (t) => t.type === 'feature'], ['Fixed', (t) => t.type === 'bug'], ['Other', () => true]]

const dirOf = () => path.join(P.HOME, 'release-notes')
const fileOf = (projectId, version) => {
  if (!PROJ.test(String(projectId || '')) || !NAME.test(String(version || ''))) throw fail(400, 'bad project or version name')
  const f = path.join(dirOf(), projectId, version + '.md')
  const rel = path.relative(dirOf(), f)
  if (rel.startsWith('..') || path.isAbsolute(rel) || rel.split(path.sep).length !== 2) throw fail(400, 'bad project or version name')
  return f
}

function draft(projectId, version) {
  if (!PROJ.test(String(projectId || ''))) throw fail(400, 'Give a project id')
  if (!NAME.test(String(version || ''))) throw fail(400, 'Give a version name')
  const T = require('./tasks.cjs')
  const rows = T.listTasks().filter((s) => s.projectId === projectId).map((s) => T.readTask(s.id)).filter((t) => t && t.targetVersion === version && t.status !== 'cancelled')
    .sort((a, b) => (parseInt(String(a.id).split('-').pop(), 10) || 0) - (parseInt(String(b.id).split('-').pop(), 10) || 0))
  const done = rows.filter((t) => t.status === 'done')
  const notDone = rows.length - done.length
  const groups = { New: [], Fixed: [], Other: [] }
  for (const t of done) groups[GROUPS.find(([, f]) => f(t))[0]].push(t)
  const lines = [HEAD, '', '# ' + version, '']
  for (const [name] of GROUPS) {
    if (!groups[name].length) continue
    lines.push('## ' + name, '')
    for (const t of groups[name]) lines.push('- ' + clipCp(String(t.title || '').replace(/\s+/g, ' ').trim(), 200) + ' (' + t.id + ')')
    lines.push('')
  }
  if (!done.length) lines.push('No tasks are done in this version yet.', '')
  if (notDone) lines.push(notDone + ' planned task' + (notDone === 1 ? ' is' : 's are') + ' not done and ' + (notDone === 1 ? 'is' : 'are') + ' not listed.', '')
  const counts = { New: groups.New.length, Fixed: groups.Fixed.length, Other: groups.Other.length, notDone }
  return { projectId, version, markdown: lines.join('\n').replace(/\n+$/, '\n'), counts }
}

/** Saves the draft. Owner only; writes only <home>/release-notes/<project>/<version>.md. */
function writeDraft(projectId, version, actor) {
  if (!actor || actor.role !== 'board') throw fail(403, 'Only the owner can save release notes. ' + OWNER_ONLY)
  const d = draft(projectId, version)
  const f = fileOf(projectId, version)
  fs.mkdirSync(path.dirname(f), { recursive: true })
  writeAtomic(f, d.markdown)
  return Object.assign(d, { file: f })
}

function run(args, say) {
  const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined }
  const rest = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--project')
  const json = args.includes('--json')
  try {
    if (!rest[0] || !val('--project')) throw fail(400, 'usage: arsenale release-notes <version> --project <id> [--write] [--json]')
    const d = args.includes('--write') ? writeDraft(val('--project'), rest[0], cliActor({ by: 'board' })) : draft(val('--project'), rest[0])
    if (json) say(JSON.stringify(d, null, 2))
    else { say(d.markdown.trimEnd()); if (d.file) say('Saved ' + d.file) }
    return 0
  } catch (e) { say(e.message); return 1 }
}

module.exports = { draft, writeDraft, run, fileOf, HEAD }
