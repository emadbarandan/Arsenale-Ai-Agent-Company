/* Release-notes draft (spec 1.4 P6). Invented data. */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const { makeSandbox, SEED } = require('./helpers.cjs')

const board = { door: 'dashboard', role: 'board', name: '' }
const PRJ = 'tide-app'

function setup(t) {
  const sb = makeSandbox()
  t.after(() => sb.cleanup())
  sb.mod('agent-company.cjs').companyInit(SEED, ['implementer', 'tester'])
  process.env.ARSENALE_BOARD_TOKEN = sb.boardKey
  const T = sb.mod('tasks.cjs'), R = sb.mod('release-notes.cjs')
  const mk = (title, type, status, ver) => {
    const x = T.createTask({ title, projectId: PRJ, targetVersion: ver || '2.1', type }, board)
    if (status !== 'todo') T.updateTask({ id: x.id, status }, board)
    return x
  }
  mk('Tide chart', 'feature', 'done'); mk('Wind overlay', 'feature', 'done')
  mk('Fix crash', 'bug', 'done'); mk('Tidy logs', 'chore', 'done')
  mk('Later A', 'feature', 'todo'); mk('Later B', 'bug', 'in_progress')
  mk('Dropped', 'feature', 'cancelled'); mk('Other version', 'feature', 'done', '2.2')
  return { sb, R }
}

test('P6 AT1/AT4: groups, not-done count, header', (t) => {
  const { R } = setup(t)
  const { markdown: md, counts } = R.draft(PRJ, '2.1')
  assert.ok(md.startsWith('Draft: edit before release.'))
  assert.match(md, /## New\n\n- Tide chart \([A-Z]+-\d+\)\n- Wind overlay \([A-Z]+-\d+\)/)
  assert.match(md, /## Fixed\n\n- Fix crash/)
  assert.match(md, /## Other\n\n- Tidy logs/)
  assert.match(md, /2 planned tasks are not done and are not listed/)
  assert.equal(counts.notDone, 2)
  assert.doesNotMatch(md, /Other version|Later A/)
})

test('P6 AT2: cancelled tasks are left out and not counted', (t) => {
  const { R } = setup(t)
  const md = R.draft(PRJ, '2.1').markdown
  assert.doesNotMatch(md, /Dropped/)
})

test('P6 AT3: --write needs the owner key and writes only the one file', (t) => {
  const { sb, R } = setup(t)
  assert.throws(() => R.writeDraft(PRJ, '2.1', { role: 'agent', door: 'cli' }), (e) => e.code === 403)
  assert.ok(!fs.existsSync(path.join(sb.home || path.dirname(sb.company), 'release-notes')))
  const r = R.writeDraft(PRJ, '2.1', board)
  assert.equal(r.file, path.join(path.dirname(sb.company), 'release-notes', PRJ, '2.1.md'))
  assert.equal(fs.readFileSync(r.file, 'utf8'), r.markdown)
  assert.deepEqual(fs.readdirSync(path.dirname(r.file)), ['2.1.md'])
  assert.throws(() => R.draft(PRJ, '../x'), (e) => e.code === 400)
})

test('P6: CLI prints the draft, refuses --write without the key', (t) => {
  const { R } = setup(t)
  const out = []
  assert.equal(R.run(['2.1', '--project', PRJ], (l) => out.push(l)), 0)
  assert.ok(out.join('\n').startsWith('Draft: edit before release.'))
  const prev = process.env.ARSENALE_BOARD_TOKEN
  process.env.ARSENALE_BOARD_TOKEN = 'wrong'
  const o2 = []
  assert.equal(R.run(['2.1', '--project', PRJ, '--write'], (l) => o2.push(l)), 1)
  process.env.ARSENALE_BOARD_TOKEN = prev
})
