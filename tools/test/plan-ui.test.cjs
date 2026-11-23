/* The Dock in a real browser (spec 1.4 P3): every state of section 4.5 at 390x844 and 1366x768 with no
 * sideways scroll, the glass listbox (no native select visible, glass class, keyboard), ship view
 * wide and table view narrow with the same numbers, "No plan" / "n/a" / "≥ $X" and never "$0.00",
 * owner controls absent for a non-board view and disabled under the shadow banner, and the six-button top
 * bar at 1366. With no Chromium-based browser the tests skip. Screenshots go to PLAN_SHOTS (default: the OS temp folder). */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { makeSandbox, startServer, SEED } = require('./helpers.cjs')
const browser = require('./browser.cjs')

const SKIP = browser.unavailable()
const SHOTS = process.env.PLAN_SHOTS || os.tmpdir()
const board = { door: 'dashboard', role: 'board', name: '' }
const SIZES = [[390, 844, 'phone'], [1366, 768, 'desktop']]
const LONG = 'A very long version title that must ellipsize instead of widening the layout of the whole screen'

function company(sb) { sb.mod('agent-company.cjs').companyInit(SEED, ['implementer', 'tester']) }
/** A populated demo plan: three lanes, phases, sized tasks, a blocked one, an open decision, runs. */
function demo(sb, opts) {
  opts = opts || {}
  company(sb)
  const Pl = sb.mod('plan.cjs'), Tk = sb.mod('tasks.cjs'), B = sb.mod('build-agent-dashboard.cjs')
  Pl.addVersion('tide-app', { name: '2.1', title: LONG, goal: 'Ordering', horizon: 'now', status: 'active' }, board)
  Pl.addVersion('tide-app', { name: '2.2', title: 'Reports', horizon: 'next' }, board)
  Pl.addVersion('tide-app', { name: '2.3', title: 'Empty one', horizon: 'later' }, board)
  Pl.addVersion('tide-app', { name: '2.0', title: 'Released', horizon: 'now' }, board)
  Pl.editVersion('tide-app', '2.0', { status: 'released' }, board)
  const p1 = Pl.addPhase('tide-app', '2.1', { title: 'Phase one: the schema and a rather long phase title for ellipsis', goal: '' }, board)
  const p2 = Pl.addPhase('tide-app', '2.1', { title: 'Phase two', goal: '' }, board)
  const mk = (title, size, phase, status, ver) => {
    const t = Tk.createTask({ title, projectId: 'tide-app', targetVersion: ver || '2.1', size }, board)
    const id = t.task ? t.task.id : t.id
    if (phase) Tk.updateTask({ id, phaseId: phase }, board)
    if (status && status !== 'todo') Tk.updateTask({ id, status }, board)
    return id
  }
  mk('Create the tables', 'M', p1.id || (p1.phase && p1.phase.id) || 'ph-1', 'done')
  mk('Write the migration with an extremely long task title that has to be cut by an ellipsis somewhere', 'L', 'ph-1', 'todo')
  mk('Order screen', 'S', 'ph-2', 'blocked')
  mk('Loose task', undefined, null, 'todo')
  mk('Report one', 'M', null, 'todo', '2.2')
  B.saveDecision({ project: 'tide-app', text: 'Which database should the order list use?', state: 'open', options: ['SQLite', 'Postgres'], recommendation: 'SQLite', targetVersion: '2.1', by: 'supervisor' })
  B.saveDecision({ project: 'tide-app', text: 'Name the release', state: 'taken', answer: 'Harbour', targetVersion: '2.1', by: 'user' })
  if (opts.runs) sb.run({ agent: 'implementer', project: 'tide-app', model: 'Opus 5.5', versionRun: '2.1' })
}

async function open(t, sb, project) {
  const s = await startServer(sb, { portBase: 47200 }); t.after(() => s.child.kill())
  const page = await browser.launch(); t.after(() => page.close())
  await page.goto(s.url)
  await page.goto('http://127.0.0.1:' + s.port + '/?v=' + Date.now() + '#/plan' + (project === false ? '' : '/tide-app'))
  await page.waitFor("document.querySelector('#v-plan .plan')", 15000)
  return { page, s }
}
const noScroll = (page) => page.eval('document.documentElement.scrollWidth <= window.innerWidth && document.body.scrollWidth <= window.innerWidth && (() => { const v = document.getElementById("v-plan"); return v.scrollWidth <= v.clientWidth + 1 })() && (() => { const p = document.querySelector("#v-plan .plan"); return !p || p.scrollWidth <= p.clientWidth + 1 })()')
const text = (page) => page.eval("document.getElementById('v-plan').innerText")
const click = (page, sel) => page.eval("(() => { const e = document.querySelector(" + JSON.stringify(sel) + "); if (!e) throw new Error('no ' + " + JSON.stringify(sel) + "); e.click(); return 1 })()")
const waitText = (page, re) => page.waitFor("/" + re + "/.test(document.getElementById('v-plan').innerText)", 8000)
/** Every size: no sideways scroll, no native select visible, a screenshot saved. */
async function check(page, name) {
  const out = []
  for (const [w, h, label] of SIZES) {
    await page.screenshot(path.join(SHOTS, 'plan-' + name + '-' + w + '.png'), w, h)
    assert.equal(await page.eval('window.innerWidth'), w)
    assert.equal(await noScroll(page), true, name + ': no sideways scroll at ' + w)
    assert.equal(await page.eval("[...document.querySelectorAll('#v-plan select')].filter((s) => { const r = s.getBoundingClientRect(); return getComputedStyle(s).display !== 'none' && r.width > 0 }).length"), 0, name + ': no native select visible at ' + w)
    // owner rule 4.4.1: the element that scrolls wears the glass scrollbar, never the native one with arrows
    assert.equal(await page.eval("getComputedStyle(document.querySelector('#v-plan .plan')).scrollbarWidth"), 'thin', name + ': glass scrollbar on .plan at ' + w)
    out.push(label)
  }
  return out
}

test('P3-UI-1: company not set up, and a project with no plan yet', { skip: SKIP || false }, async (t) => {
  const sb = makeSandbox(); t.after(() => sb.cleanup())
  const { page } = await open(t, sb)
  assert.match(await text(page), /Set up your company first: plans belong to a project/)
  await check(page, 'nocompany')
  const sb2 = makeSandbox(); t.after(() => sb2.cleanup()); company(sb2)
  const o = await open(t, sb2)
  await waitText(o.page, 'No plan yet\\.')
  const s = await text(o.page)
  assert.match(s, /New version/); assert.match(s, /Import a plan/)
  await click(o.page, '[data-pl-import]')
  await waitText(o.page, 'arsenale import-plan')
  await check(o.page, 'noplan')
})

test('P3-UI-2: roadmap lanes, "No plan", cost words, ship view wide, table view narrow with the same numbers', { skip: SKIP || false }, async (t) => {
  const sb = makeSandbox(); t.after(() => sb.cleanup()); demo(sb)
  const { page } = await open(t, sb)
  await waitText(page, 'Now')
  const s = await text(page)
  assert.match(s, /Roadmap/); assert.match(s, /Proposals/); assert.match(s, /No plan/) // 2.3 has no tasks
  assert.match(s, /not recorded/); assert.doesNotMatch(s, /\$0\.00/)
  assert.match(s, /Released \(1\)/)
  assert.equal(await page.eval("document.querySelectorAll('#v-plan .pl-lane').length"), 3)
  await check(page, 'roadmap')
  // the version tab: same numbers in ship (1366) and table (390)
  await click(page, '[data-pl-open="2.1"]')
  await waitText(page, 'Phase two')
  await page.screenshot(path.join(SHOTS, 'plan-version-1366.png'), 1366, 768)
  await page.eval('window.dispatchEvent(new Event("resize"))')
  const wide = await page.eval("({ ship: !!document.querySelector('#v-plan svg.pl-ship[role=img]'), label: document.querySelector('#v-plan svg.pl-ship').getAttribute('aria-label'), hulls: [...document.querySelectorAll('#v-plan .pl-hulls li')].map((l) => l.innerText.replace(/\\s+/g, ' ')) })")
  assert.equal(wide.ship, true); assert.match(wide.label, /Ship view: Phase one/)
  await check(page, 'version')
  await page.screenshot(path.join(SHOTS, 'plan-version-390.png'), 390, 844)
  await click(page, '[data-pl-vmode="table"]')
  await waitText(page, 'Create the tables')
  const groups = await page.eval("[...document.querySelectorAll('#v-plan .pl-group h4 em')].map((e) => e.innerText.replace(/\\s+/g, ' '))")
  const hulls = wide.hulls.map((h) => h.split(' ').slice(-2).join(' '))
  assert.match(groups.join('|'), /50 %|\d+ %/)
  for (const g of groups.filter((x) => /\d\/\d/.test(x))) assert.ok(wide.hulls.join('|').includes(g.split(' · ')[1]), 'table number ' + g + ' is in the ship labels')
  await check(page, 'version-table')
  await page.screenshot(path.join(SHOTS, 'plan-table-390.png'), 390, 844)
  assert.match(await text(page), /Which database should the order list use\?/)
  assert.match(await text(page), /Decide here/)
})

test('P3-UI-3: the glass listbox: glass class, keyboard, no native popup; the project picker', { skip: SKIP || false }, async (t) => {
  const sb = makeSandbox(); t.after(() => sb.cleanup()); demo(sb)
  const { page } = await open(t, sb)
  await waitText(page, 'Now')
  assert.equal(await page.eval("document.querySelectorAll('#v-plan .lb .lb-btn').length"), 1, 'two projects: the picker is a listbox')
  const opened = () => page.eval("(() => { const p = document.getElementById('lb-pop'); return !!p && !p.hidden })()")
  // a listbox open at each size: glass class, blur, no sideways scroll; the screenshot is taken with it open
  for (const [w, h] of [[1366, 768], [390, 844]]) {
    await page.screenshot(path.join(SHOTS, 'plan-listbox-' + w + '.tmp.png'), w, h) // sets the size (a resize closes a list)
    await click(page, '#v-plan .lb-btn')
    assert.equal(await page.eval("(() => { const p = document.getElementById('lb-pop'); return p.classList.contains('glass') && p.getAttribute('role') === 'listbox' ? p.children.length : -1 })()"), 2)
    assert.equal(await page.eval("getComputedStyle(document.getElementById('lb-pop')).backdropFilter.includes('blur')"), true)
    await page.screenshot(path.join(SHOTS, 'plan-listbox-' + w + '.png'), w, h)
    assert.equal(await opened(), true)
    assert.equal(await noScroll(page), true, 'no sideways scroll with the list open at ' + w)
    await click(page, '#v-plan .lb-btn')
    assert.equal(await opened(), false, 'the button closes it')
  }
  await click(page, '#v-plan .lb-btn')
  const key = (k) => page.eval("(document.querySelector('.lb-btn[aria-expanded=true]') || document.querySelector('.lb-btn')).dispatchEvent(new KeyboardEvent('keydown', { key: " + JSON.stringify(k) + ", bubbles: true, cancelable: true })); 1")
  const at = () => page.eval("document.querySelector('#lb-pop .on').dataset.i")
  await key('Home'); assert.equal(await at(), '0')
  await key('End'); assert.equal(await at(), '1')
  await key('ArrowUp'); assert.equal(await at(), '0')
  await key('ArrowDown'); assert.equal(await at(), '1')
  await key('d'); assert.equal(await at(), '0', 'type-ahead finds "Demo Calc"')
  await key('Escape'); assert.equal(await opened(), false)
  await key('Enter'); assert.equal(await opened(), true, 'Enter opens')
  await key('Home'); await key('Enter')
  assert.equal(await page.eval("document.querySelector('#v-plan select').value"), 'demo-calc')
  await waitText(page, 'No plan yet\\.')
})

test('P3-UI-4: owner actions at 390 px: move by button, edit sheet, drop needs a second press', { skip: SKIP || false }, async (t) => {
  const sb = makeSandbox(); t.after(() => sb.cleanup()); demo(sb)
  const { page } = await open(t, sb)
  await waitText(page, 'Now')
  await page.screenshot(path.join(SHOTS, 'plan-actions-390.png'), 390, 844)
  await click(page, '[data-pl-move="2.2"][data-h="now"]')
  await page.waitFor("document.querySelector('[data-pl-lane=now] [data-pl-card=\"2.2\"]')", 8000)
  await click(page, '[data-pl-new]')
  await page.waitFor("document.querySelector('.pl-sheet')", 5000)
  assert.equal(await noScroll(page), true)
  await page.eval("(() => { const f = document.querySelector('.pl-sheet'); f.querySelector('[name=name]').value = '3.0'; f.querySelector('[name=title]').value = 'Brand new'; f.requestSubmit(); return 1 })()")
  await page.waitFor("document.querySelector('[data-pl-card=\"3.0\"]')", 8000)
  await click(page, '[data-pl-drop="3.0"]'); assert.ok(await page.eval("!!document.querySelector('[data-pl-card=\"3.0\"]')"), 'the first press only arms it')
  await click(page, '[data-pl-drop="3.0"]')
  await page.waitFor("!document.querySelector('[data-pl-lane] [data-pl-card=\"3.0\"]')", 8000)
  // decide here
  await click(page, '[data-pl-open="2.1"]'); await waitText(page, 'Decide here')
  await click(page, '[data-pl-decide]'); await page.waitFor("document.querySelector('[data-pl-answer]')", 5000)
  await click(page, '[data-pl-answer][data-i="1"]')
  await waitText(page, 'Decided \\(2\\)')
  await click(page, '[data-pl-notes="2.1"]'); await waitText(page, 'Release notes draft')
  assert.match(await text(page), /# 2\.1/)
  assert.match(fs.readdirSync(path.join(sb.runs, 'decisions')).map((f) => fs.readFileSync(path.join(sb.runs, 'decisions', f), 'utf8')).join(''), /"answer": "Postgres"/)
})

test('P3-UI-5: cost words and the "All done" state; unsized note', { skip: SKIP || false }, async (t) => {
  const sb = makeSandbox(); t.after(() => sb.cleanup()); demo(sb, { runs: true })
  const Pl = sb.mod('plan.cjs'), Tk = sb.mod('tasks.cjs')
  Pl.addVersion('tide-app', { name: '2.4', title: 'Done', horizon: 'next' }, board)
  const t1 = Tk.createTask({ title: 'Only task', projectId: 'tide-app', targetVersion: '2.4', size: 'S' }, board)
  Tk.updateTask({ id: (t1.task || t1).id, status: 'done' }, board)
  const { page } = await open(t, sb)
  await waitText(page, '100 %, ready to release')
  const s = await text(page)
  assert.match(s, /1 task has no size \(counted as 1\)/)
  assert.doesNotMatch(s, /\$0\.00/)
  await check(page, 'states')
})

test('P3-UI-6: a non-board view has no owner controls; the shadow banner disables them with the reason', { skip: SKIP || false }, async (t) => {
  const sb = makeSandbox(); t.after(() => sb.cleanup()); demo(sb)
  // the built file (not the live server) is the non-board view
  const B = sb.mod('build-agent-dashboard.cjs')
  const file = path.join(sb.base, 'built.html')
  const snap = B.collect()
  fs.writeFileSync(file, B.renderPage(snap, { company: sb.mod('agent-company.cjs').companyState ? sb.mod('agent-company.cjs').companyState(snap) : { configured: false } }))
  const page = await browser.launch(); t.after(() => page.close())
  await page.goto('file://' + file + '#/plan')
  await page.waitFor("document.querySelector('#v-plan .plan')", 15000)
  assert.equal(await page.eval("document.querySelectorAll('#v-plan [data-pl-new],#v-plan [data-pl-edit],#v-plan [data-pl-drop],#v-plan [data-pl-move]').length"), 0)
  // shadow: the plan says it is a shadow copy
  const Pl = sb.mod('plan.cjs')
  const f = Pl.fileOf('tide-app'); const j = JSON.parse(fs.readFileSync(f, 'utf8')); j.master = 'shadow'; fs.writeFileSync(f, JSON.stringify(j))
  const o = await open(t, sb)
  await waitText(o.page, 'Shadow copy of HQ')
  assert.equal(await o.page.eval("[...document.querySelectorAll('#v-plan [data-pl-new],#v-plan [data-pl-edit],#v-plan [data-pl-drop],#v-plan [data-pl-move]')].every((b) => b.disabled && /HQ is the master/.test(b.title))"), true)
})

test('P3-UI-7: the top bar has six buttons that fit at 1366 and the bottom tabs list Plan', { skip: SKIP || false }, async (t) => {
  const sb = makeSandbox(); t.after(() => sb.cleanup()); demo(sb)
  const { page } = await open(t, sb)
  await page.screenshot(path.join(SHOTS, 'plan-bar-1366.png'), 1366, 768)
  const bar = await page.eval("(() => { const v = document.querySelector('.top .views'); const bs = [...v.querySelectorAll('button[data-view],button[data-omenu=legacy]')]; const r = v.getBoundingClientRect(); const t = document.querySelector('.top').getBoundingClientRect(); return { names: bs.map((b) => b.textContent.trim().replace(/\\s+/g, ' ')), fit: v.scrollWidth <= v.clientWidth + 1 && r.right <= t.right && bs.every((b) => b.getBoundingClientRect().right <= r.right + 1) } })()")
  assert.deepEqual(bar.names.filter((n) => !/^▾$/.test(n)), ['Campus', 'Plan', 'Live', 'Decisions', 'Team', 'More ▾'])
  assert.equal(bar.fit, true)
  await page.screenshot(path.join(SHOTS, 'plan-bar-390.png'), 390, 844)
  assert.match(await page.eval("document.querySelector('.btabs').innerText"), /Plan/)
  assert.equal(await noScroll(page), true)
})

test('P5-UI: a bug in "Not planned" is planned into Next patch in two clicks; the Proposals tray accepts and declines, at both widths', { skip: SKIP || false }, async (t) => {
  const sb = makeSandbox(); t.after(() => sb.cleanup()); demo(sb)
  const Tk = sb.mod('tasks.cjs'), Pr = sb.mod('proposals.cjs')
  const bug = Tk.createTask({ title: 'The order list crashes when it is empty and the title is long enough to ellipsize in a narrow phone column', projectId: 'tide-app', type: 'bug' }, board)
  const t1 = Tk.createTask({ title: 'Loose task for a proposal', projectId: 'tide-app' }, board)
  const agent = { door: 'mcp', role: 'agent', name: 'tester' }
  const p1 = Pr.create({ kind: 'plan_into', task_id: t1.id, target_version: '2.2', why: 'It is a report task' }, agent)
  Pr.create({ kind: 'bug', title: 'Footer overlaps on phones', project: 'tide-app', why: 'Pre-existing, found in a review', evidence: 'run r-1' }, agent)
  const { page, s } = await open(t, sb)
  await waitText(page, 'Not planned')
  for (const [w, h] of SIZES) {
    await page.screenshot(path.join(SHOTS, 'p5-notplanned-' + w + '.png'), w, h)
    assert.equal(await noScroll(page), true, 'not planned: no sideways scroll at ' + w)
  }
  assert.match(await text(page), /The order list crashes/)
  // click 1: Plan into…  (a glass listbox with Next patch first and preselected); click 2: Plan
  await click(page, '[data-pl-into="' + bug.id + '"]')
  await page.waitFor("document.querySelector('[data-pl-intoform] .lb-btn')", 5000)
  assert.match(await page.eval("document.querySelector('[data-pl-intoform] .lb-btn').innerText"), /Next patch \(2\.1\.1\)/)
  for (const [w, h] of SIZES) {
    await page.screenshot(path.join(SHOTS, 'p5-planinto-' + w + '.png'), w, h)
    assert.equal(await noScroll(page), true, 'plan into: no sideways scroll at ' + w)
    assert.equal(await page.eval("[...document.querySelectorAll('#v-plan select')].filter((x) => x.getBoundingClientRect().width > 0 && getComputedStyle(x).display !== 'none').length"), 0)
  }
  await click(page, '[data-pl-intogo="' + bug.id + '"]')
  await page.waitFor("!document.querySelector('[data-pl-unplanned]')", 8000)
  assert.equal(Tk.readTask(bug.id).targetVersion, '2.1.1')
  assert.ok(sb.mod('plan.cjs').readPlan('tide-app').versions.some((v) => v.name === '2.1.1'), 'the version was created')
  // the tray
  await click(page, '[data-pl-tab=proposals]')
  await page.waitFor("document.querySelectorAll('[data-pl-proposal]').length === 2", 10000)
  for (const [w, h] of SIZES) {
    await page.screenshot(path.join(SHOTS, 'p5-proposals-' + w + '.png'), w, h)
    assert.equal(await noScroll(page), true, 'proposals: no sideways scroll at ' + w)
  }
  await click(page, '[data-pl-proposal="' + p1.question_id + '"] [data-pl-prop=accept]')
  await page.waitFor("document.querySelectorAll('[data-pl-proposal]').length === 1", 10000)
  assert.equal(Tk.readTask(t1.id).targetVersion, '2.2')
  await click(page, '[data-pl-prop=decline]')
  await page.waitFor("document.querySelectorAll('[data-pl-proposal]').length === 0", 10000)
  assert.match(await text(page), /No proposals/)
  await page.screenshot(path.join(SHOTS, 'p5-proposals-empty-390.png'), 390, 844)
})

test('P4-UI-1: Today and Queue tabs: empty words, queue from a version, reorder, remove, claimed chip; no sideways scroll', { skip: SKIP || false }, async (t) => {
  const sb = makeSandbox(); t.after(() => sb.cleanup()); demo(sb)
  sb.mod('tasks.cjs').createTask({ title: 'Second screen', projectId: 'tide-app', targetVersion: '2.1', size: 'S', phaseId: 'ph-2' }, board)
  const { page } = await open(t, sb)
  await waitText(page, 'Roadmap')
  await click(page, '[data-pl-tab="queue"]')
  await waitText(page, 'The queue is empty\\. Approve tasks into it from a version\\.')
  await click(page, '[data-pl-tab="today"]')
  await waitText(page, 'Next up')
  assert.match(await text(page), /not queued/) // suggestions of the active version
  await check(page, 'today-empty')
  // "Queue" on a suggestion puts it in the queue
  await click(page, '[data-pl-tab="today"]')
  await click(page, '#v-plan .pl-tl [data-pl-q1]')
  await waitText(page, '#1')
  // "Queue next phase" from the version tab
  await click(page, '[data-pl-tab="version"]')
  await waitText(page, 'Queue next phase')
  await click(page, '[data-pl-queue]')
  await click(page, '[data-pl-tab="queue"]')
  await page.waitFor("document.querySelectorAll('#v-plan .pl-q').length >= 2", 8000)
  const first = await page.eval("document.querySelector('#v-plan .pl-q .id').innerText")
  await click(page, '#v-plan .pl-q [data-pl-qup][data-to="down"]')
  await page.waitFor("document.querySelector('#v-plan .pl-q .id').innerText !== " + JSON.stringify(first), 8000)
  await check(page, 'queue')
  await click(page, '[data-pl-qrm]')
  await page.waitFor("document.querySelectorAll('#v-plan .pl-q').length === 1", 8000)
  await click(page, '[data-pl-qclear]'); await click(page, '[data-pl-qclear]')
  await waitText(page, 'The queue is empty')
  await check(page, 'queue-empty')
})

test('Review 1.4: every tab has the glass scrollbar and the selected tab is in view at 390; Tokens not clipped', { skip: SKIP || false }, async (t) => {
  const sb = makeSandbox(); t.after(() => sb.cleanup()); demo(sb, { runs: true })
  const { page } = await open(t, sb)
  for (const tab of ['roadmap', 'version', 'today', 'queue', 'proposals']) {
    await click(page, '[data-pl-tab=' + tab + ']')
    await page.waitFor("document.querySelector('[data-pl-tab=" + tab + "][aria-selected=true]')", 5000)
    await check(page, 'fix14-tab-' + tab)
  }
  // the selected tab is inside its strip at 390
  await page.screenshot(path.join(SHOTS, 'plan-fix14-tab-proposals-390.png'), 390, 844)
  await new Promise((r) => setTimeout(r, 300))
  assert.equal(await page.eval("(() => { const b = document.querySelector('.pl-tabs [aria-selected=true]').getBoundingClientRect(), s = document.querySelector('.pl-tabs').getBoundingClientRect(); return b.left >= s.left - 1 && b.right <= s.right + 1 })()"), true)
  await click(page, '[data-pl-tab=version]')
  await page.waitFor("document.querySelector('.pl-table td.tk')", 5000)
  assert.equal(await page.eval("[...document.querySelectorAll('.pl-table td.tk')].every((c) => c.scrollWidth <= c.clientWidth + 1)"), true, 'the Tokens cell is not clipped')
})

test('Review 1.4: items gone from the import file are listed with Keep and Cancel task', { skip: SKIP || false }, async (t) => {
  const sb = makeSandbox(); t.after(() => sb.cleanup()); demo(sb)
  const Pl = sb.mod('plan.cjs'), Tk = sb.mod('tasks.cjs')
  const ids = Tk.listTasks().filter((x) => x.targetVersion === '2.1').slice(0, 2).map((x) => x.id)
  const imp = Object.assign({}, board, { importer: true })
  for (const id of ids) Tk.updateTask({ id, missingInImport: true }, imp)
  Pl.mutate('tide-app', imp, (p) => { p.lastImport = { at: new Date().toISOString(), file: 'hq.json', sha256: 'x', counts: { flagged: 2 }, conflicts: [], missing: 2 } })
  const { page } = await open(t, sb)
  await waitText(page, 'Gone from the import file\\?')
  assert.match(await text(page), /2 items gone from the file/)
  await check(page, 'gone')
  await click(page, '[data-pl-keep="' + ids[0] + '"]')
  await page.waitFor("document.querySelectorAll('[data-pl-gone] li').length === 1", 8000)
  assert.equal(Tk.readTask(ids[0]).missingInImport, undefined)
  await click(page, '[data-pl-cgone="' + ids[1] + '"]')
  await click(page, '[data-pl-cgone="' + ids[1] + '"]')
  await page.waitFor("!document.querySelector('[data-pl-gone]')", 8000)
  assert.equal(Tk.readTask(ids[1]).status, 'cancelled')
})

test('Review 1.4: pictures of Loading, the server error with Try again, the import conflict notice and the shadow banner', { skip: SKIP || false }, async (t) => {
  const sb = makeSandbox(); t.after(() => sb.cleanup()); demo(sb)
  const Pl = sb.mod('plan.cjs')
  const imp = Object.assign({}, board, { importer: true })
  Pl.mutate('tide-app', imp, (p) => { p.lastImport = { at: new Date().toISOString(), file: 'hq.json', sha256: 'y', counts: { flagged: 0 }, conflicts: [{ where: 'task T-1', field: 'title' }, { where: 'task T-2', field: 'size' }], missing: 0 } })
  const s = await startServer(sb, { portBase: 47400 }); t.after(() => s.child.kill())
  // Loading: the plan request never answers
  const page = await browser.launch(); t.after(() => page.close())
  await page.onNewDocument("window.__f = window.fetch; window.fetch = (u, ...a) => (/api\\/plan\\?/.test(String(u)) && window.__bad ? Promise.reject(new Error('down')) : /api\\/plan\\?/.test(String(u)) && !window.__go ? new Promise((r) => setTimeout(() => r(window.__f(u, ...a)), 4000)) : window.__f(u, ...a))")
  await page.goto(s.url)
  await page.goto('http://127.0.0.1:' + s.port + '/?v=' + Date.now() + '#/plan/tide-app')
  await page.waitFor("document.querySelector('#v-plan .plan')", 15000)
  await waitText(page, 'Loading')
  await check(page, 'loading')
  // the conflict notice
  await page.eval('window.__go = true')
  await page.waitFor("/conflicts/.test(document.getElementById('v-plan').innerText)", 15000)
  assert.match(await text(page), /Last import: 2 conflicts/)
  await check(page, 'import-conflict')
  // the plan request fails: the error with Try again
  await page.eval('window.__bad = true')
  await new Promise((r) => setTimeout(r, 3500))
  await click(page, '[data-pl-tab=version]')
  await page.waitFor("/Could not load the plan/.test(document.getElementById('v-plan').innerText)", 20000)
  assert.match(await text(page), /Try again/)
  await check(page, 'error')
})

test('Review 1.4: the shadow banner has a picture, and the shadow can be shown read-only', { skip: SKIP || false }, async (t) => {
  const sb = makeSandbox(); t.after(() => sb.cleanup()); company(sb)
  process.env.ARSENALE_BOARD_TOKEN = sb.boardKey
  const IO = sb.mod('plan-io.cjs')
  const FX = path.join(__dirname, 'fixtures', 'plan-v1', 'hq-like-export.json')
  IO.importPlan(FX, { project: 'tide-app', phasesAs: 'versions', shadow: true }, board)
  sb.mod('plan.cjs').addVersion('tide-app', { name: '1.0', horizon: 'now' }, board)
  const { page } = await open(t, sb)
  await waitText(page, 'Show the shadow of HQ')
  await click(page, '[data-pl-shadow=shadow]')
  await waitText(page, 'Shadow copy of HQ')
  await check(page, 'shadow-banner')
  assert.equal(await page.eval("[...document.querySelectorAll('#v-plan [data-pl-new],#v-plan [data-pl-edit],#v-plan [data-pl-drop],#v-plan [data-pl-move]')].every((b) => b.disabled)"), true)
  await click(page, '[data-pl-shadow=live]')
  await waitText(page, 'Show the shadow of HQ')
})
