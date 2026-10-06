/* The redesigned 1.0 screens: the tasks board, the approvals letter, finished
 * work, the settings sub-pages, the office room of the Team screen and the
 * org chart, each read in a headless Chrome or Edge like a person reads it
 * (test/browser.cjs; skipped when there is none). And, without a browser, the
 * data behind people's names: a title made from an id, and the optional name,
 * skills and look a member keeps across every later write.
 * Every test has its own server and data folder. All data is invented. */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const { makeSandbox, SEED, startServer } = require('./helpers.cjs')
const browser = require('./browser.cjs')

const SKIP = browser.unavailable()
const exists = (sel) => '!!document.querySelector(' + JSON.stringify(sel) + ')'
const text = (sel) => "(document.querySelector(" + JSON.stringify(sel) + ") || {}).textContent || ''"

function company(sb) {
  assert.equal(sb.cli('--company-init', '--seed', sb.seed(Object.assign({}, SEED, { company: { name: 'Bluefin Bakery', issuePrefix: 'BLU' } }))).code, 0)
  const L = sb.mod('runlog.cjs')
  return { L, board: L.actorFor('dashboard', 'board'), sup: L.actorFor('mcp', 'supervisor', { clientId: 'cli-a', client: { name: 'cli-a', version: '1' } }) }
}
async function open(t, sb, hash) {
  const { port, child, url: keyUrl } = await startServer(sb)
  const page = await browser.launch()
  t.after(async () => { await page.close(); child.kill(); sb.cleanup() })
  await page.goto(keyUrl)
  await page.goto('http://127.0.0.1:' + port + '/?lang=en' + (hash || ''))
  return page
}

// ---------- names, without a browser

test('a title made from an id spells acronyms in capitals: "SEO specialist", never "Seo specialist"', () => {
  const sb = makeSandbox()
  const C = sb.mod('agent-company.cjs')
  assert.equal(C.titleFromId('seo-specialist'), 'SEO specialist')
  assert.equal(C.titleFromId('ui-designer'), 'UI designer')
  assert.equal(C.titleFromId('visual-qa'), 'Visual QA')
  assert.equal(C.titleFromId('hr-faq-writer'), 'HR FAQ writer')
  assert.equal(C.titleFromId('code-reviewer'), 'Code reviewer')
  sb.cleanup()
})

test('a member\'s name, skills and look are kept by every later write, and refused when malformed', () => {
  const sb = makeSandbox()
  company(sb)
  const C = sb.mod('agent-company.cjs')
  C.updateEmployee({ id: 'tester', name: 'Tess', skills: ['Edge cases', '  Flaky tests  ', ''], look: 3, by: 'board' }, 'cli')
  // a later write of another field, as an older page would make it
  C.updateEmployee({ id: 'tester', title: 'Test writer', by: 'board' }, 'cli')
  C.writeOverlay('tester', { tier: 'light' }, 'board')
  const e = sb.read('company/employees.json').tester
  assert.deepEqual([e.name, e.skills, e.look, e.title, e.tier], ['Tess', ['Edge cases', 'Flaky tests'], 3, 'Test writer', 'light'])
  const shown = C.companyState({ agents: [], runs: [], active: [] }).employees.find((x) => x.id === 'tester')
  assert.deepEqual([shown.name, shown.skills, shown.look], ['Tess', ['Edge cases', 'Flaky tests'], 3])
  assert.throws(() => C.updateEmployee({ id: 'tester', look: 9, by: 'board' }, 'cli'), /look must be/)
  assert.throws(() => C.updateEmployee({ id: 'tester', skills: 'not a list', by: 'board' }, 'cli'), /skills must be a list/)
  // a member that never had them reads as no name, no skills, the first look
  const other = C.companyState({ agents: [], runs: [], active: [] }).employees.find((x) => x.id === 'implementer')
  assert.deepEqual([other.name, other.skills, other.look], ['', [], 0])
  sb.cleanup()
})

test('the hire form stores the name, skills and look; an edit that sends no skills keeps them', () => {
  const sb = makeSandbox()
  const { board } = company(sb)
  const Tm = sb.mod('team.cjs')
  Tm.hire({ id: 'newsletter-nora', name: 'Nora', title: 'Newsletter editor', officeId: 'studio', description: 'Writes the weekly newsletter from the notes', instructions: 'Draft it. Never send it.', skills: ['Newsletters', 'Subject lines'], look: 4 }, board)
  let e = sb.read('company/employees.json')['newsletter-nora']
  assert.deepEqual([e.name, e.title, e.skills, e.look], ['Nora', 'Newsletter editor', ['Newsletters', 'Subject lines'], 4])
  // the skills and the look are for the Team screen only: never in the file the assistant reads
  assert.doesNotMatch(fs.readFileSync(path.join(sb.agents, 'newsletter-nora.md'), 'utf8'), /Subject lines|look/)
  Tm.edit({ op: 'edit', id: 'newsletter-nora', name: 'Nora', title: 'Newsletter editor', description: 'Writes the weekly newsletter from the notes', instructions: 'Draft it, in three sections.' }, board)
  e = sb.read('company/employees.json')['newsletter-nora']
  assert.deepEqual([e.skills, e.look], [['Newsletters', 'Subject lines'], 4], 'an edit from an older page keeps them')
  Tm.edit({ op: 'edit', id: 'newsletter-nora', name: 'Nora', title: 'Newsletter editor', description: 'Writes the weekly newsletter from the notes', instructions: 'Draft it.', skills: ['Newsletters'], look: 1 }, board)
  e = sb.read('company/employees.json')['newsletter-nora']
  assert.deepEqual([e.skills, e.look], [['Newsletters'], 1])
  sb.cleanup()
})

test('every office pack has a colour of its own, and every colour is one the dashboard knows', () => {
  const sb = makeSandbox({ packs: true })
  const C = sb.mod('agent-company.cjs')
  const packs = sb.mod('packs.cjs').listPacks()
  const themes = packs.map((p) => p.office.theme)
  for (const t of themes) assert.ok(Object.hasOwn(C.THEMES, t), t)
  // research and design shared violet before 1.0: two offices of one colour on one campus
  assert.equal(new Set(themes.filter((t) => t !== 'violet')).size, themes.filter((t) => t !== 'violet').length)
  sb.cleanup()
})

test('the shop demo: every member has a name, every job its office, and questions wait for the owner', () => {
  const sb = makeSandbox({ packs: true })
  fs.writeFileSync(path.join(sb.root, 'config.json'), JSON.stringify({ agentDirs: [path.join(sb.root, 'shop-agents')] }))
  sb.mod('demo.cjs').seedShop(sb.root)
  const emp = sb.read('company/employees.json')
  const names = Object.values(emp).map((e) => e.name)
  assert.equal(names.length, 20)
  assert.ok(names.every(Boolean), 'a name for everyone')
  const B = sb.mod('build-agent-dashboard.cjs')
  const s = B.collect()
  assert.ok(s.active.length >= 5 && s.runs.length >= 5)
  for (const r of s.active.concat(s.runs)) assert.ok(r.officeId && r.officeId !== 'unassigned', r.agent + ' has an office')
  const waiting = s.gates.filter((g) => g.status === 'waiting')
  assert.equal(waiting.length, 5)
  assert.ok(waiting.some((g) => g.approvalType === 'hire') && waiting.some((g) => g.action && g.action.member === 'social-media-planner'))
  sb.cleanup()
})

// ---------- the screens, in a browser

test('the tasks board: four columns, the question beside its task, names instead of task numbers', { skip: SKIP || false }, async (t) => {
  const sb = makeSandbox({ packs: true })
  const { L, board, sup } = company(sb)
  const T = sb.mod('tasks.cjs')
  const a = T.createTask({ title: 'Write the autumn menu', assignee: 'tester', dueDate: '2026-12-01' }, board)
  const b = T.createTask({ title: 'Post the opening hours', assignee: 'implementer' }, board)
  const c = T.createTask({ title: 'Count the flour sacks', assignee: 'ui-designer' }, board)
  T.updateTask({ id: b.id, status: 'in_progress' }, board)
  T.updateTask({ id: c.id, status: 'done' }, board)
  L.gate({ question: 'Which photo goes first?', kind: 'B', choices: ['the bread', 'the cakes'], taskId: a.id }, sup)
  const page = await open(t, sb, '#/tasks')
  await page.waitFor(exists('.board4 .tk'))
  const cols = await page.eval("[...document.querySelectorAll('.board4 .col')].map((c) => c.querySelector('.colh').textContent.trim() + ': ' + [...c.querySelectorAll('.tt')].map((x) => x.textContent).join(' | '))")
  assert.deepEqual(cols, ['To do 0: ', 'Working on it 1: Post the opening hours', 'Waiting for you 1: Write the autumn menu', 'Done this week 1: Count the flour sacks'])
  const wait = await page.eval(text('.tk.wtk'))
  assert.match(wait, /Waiting for you[\s\S]*Which photo goes first\?[\s\S]*Tester/)
  assert.match(await page.eval(text('.banner')), /1 task needs you/)
  assert.doesNotMatch(await page.eval(text('.ev-main')), /BLU-\d/, 'no task number in the board')
  // the list view keeps the filters
  await page.eval("document.querySelector('[data-ev=tview][data-arg=list]').click(); 1")
  await page.waitFor(exists('.list .lr'))
  assert.equal(await page.eval("document.querySelectorAll('.list .lr').length"), 3)
})

test('the approvals letter: the plain question, what would happen, why it matters, if you say no; a change asked for is not a yes', { skip: SKIP || false }, async (t) => {
  const sb = makeSandbox({ packs: true })
  const { sup } = company(sb)
  const r = sb.mod('policy.cjs').checkAction({ team_member: 'tester', category: 'post.public', summary: 'Post the new opening hours', target: 'the bakery page on Instagram' }, sup)
  assert.equal(sb.read('agent-runs/gates/' + r.question_id + '.json').action.member, 'tester', 'the member id is kept whole (L6)')
  const page = await open(t, sb, '#/approvals')
  await page.waitFor(exists('.letter'))
  const letter = await page.eval(text('.letter'))
  assert.match(letter, /^Tester/)
  assert.match(letter, /Leaves your computer · Public/)
  assert.match(letter, /Post the new opening hours\?/)
  assert.match(letter, /This is what would be posted[\s\S]*Where: the bakery page on Instagram/)
  assert.match(letter, /Why it matters[\s\S]*People see the post straight away/)
  assert.match(letter, /If you say no[\s\S]*Nothing is posted\. Tester is told/)
  assert.match(letter, /Approve and post[\s\S]*Decline[\s\S]*Ask Tester to change something/)
  assert.match(await page.eval(text('.ai')), /Tester[\s\S]*Post the new opening hours\?[\s\S]*Leaves your computer/)
  await page.eval("document.querySelector('[data-ev=appr-note]').click(); 1")
  await page.waitFor(exists('.letter form[data-evform=ans] input[name=a]'))
  await page.eval("const f = document.querySelector('.letter form[data-evform=ans]'); f.elements.a.value = 'use the morning photo'; f.requestSubmit(); 1")
  const file = 'agent-runs/gates/' + r.question_id + '.json'
  for (let i = 0; i < 40 && sb.read(file).status !== 'answered'; i++) await page.sleep(150)
  assert.equal(sb.read(file).answer, 'Not yet: use the morning photo')
})

test('finished work: a gallery with counts by kind, a search by name or person, and a preview beside it', { skip: SKIP || false }, async (t) => {
  const sb = makeSandbox({ packs: true })
  const { sup } = company(sb)
  sb.mod('agent-company.cjs').updateEmployee({ id: 'tester', name: 'Tess', by: 'board' }, 'cli')
  const D = sb.mod('deliverables.cjs')
  D.addDeliverable({ title: 'Autumn menu draft', kind: 'text', mime: 'text/markdown', content: '# Autumn\n\nPumpkin bread\n', team_member: 'tester' }, sup)
  D.addDeliverable({ title: 'Flour prices', kind: 'text', mime: 'text/csv', content: 'Flour,Price\nRye,2\n', team_member: 'implementer' }, sup)
  D.addDeliverable({ title: 'Supplier page', kind: 'link', url: 'https://example.org/flour', team_member: 'implementer' }, sup)
  const page = await open(t, sb, '#/deliverables')
  await page.waitFor(exists('.gal .fc'))
  assert.equal(await page.eval("document.querySelectorAll('.gal .fc').length"), 3)
  const chips = await page.eval("[...document.querySelectorAll('[data-ev=dkind]')].map((e) => e.textContent.trim())")
  assert.deepEqual(chips, ['All 3', 'Documents 1', 'Images 0', 'Spreadsheets 1', 'Links 1'])
  assert.match(await page.eval(text('.gal')), /Autumn menu draft[\s\S]*Tess/)
  assert.match(await page.eval("document.querySelector('.gal .fc .tb').textContent"), /MD|CSV|Link/)
  await page.eval("const i = document.querySelector('input[data-ev-input=dq]'); i.value = 'tess'; i.dispatchEvent(new Event('input', { bubbles: true })); 1")
  await page.waitFor("document.querySelectorAll('.gal .fc').length === 1")
  await page.eval("document.querySelector('.gal .fc button.th').click(); 1")
  await page.waitFor("/Pumpkin bread/.test(" + text('.ev-drawer') + ")")
})

test('settings: each sub-page draws its own part, and a safety rule is written in plain words', { skip: SKIP || false }, async (t) => {
  const sb = makeSandbox({ packs: true })
  company(sb)
  sb.mod('policy.cjs').ensureDefaults('cli')
  const page = await open(t, sb, '#/settings')
  const tab = async (id, want) => {
    await page.eval("document.querySelector('[data-ev=stab][data-arg=" + id + "]').click(); 1")
    await page.waitFor('(' + JSON.stringify(want) + ').every((w) => (' + text('.setw') + ').includes(w))')
  }
  await tab('assistants', ['Your assistants', 'Claude Desktop', 'Not connected'])
  await tab('phone', ['Phone alerts', 'What your phone shows', 'Send alerts to my phone'])
  await tab('safety', ['Safety rules', 'Paying or spending money', 'Always ask me', 'Computer only'])
  await tab('packs', ['Office packs', 'Customer support', 'members'])
  await tab('privacy', ['Everything stays on this computer', 'only with your own key'])
  await tab('safety', ['Safety rules'])
  await page.eval("document.querySelector('[data-ev=pol][data-arg=\"|payment|never\"]').click(); 1")
  for (let i = 0; i < 40 && sb.read('policy.json').defaults.payment !== 'never'; i++) await page.sleep(150)
  assert.equal(sb.read('policy.json').defaults.payment, 'never')
  // an assistant card opens its three steps
  await tab('assistants', ['Your assistants'])
  await page.eval("document.querySelector('[data-ev=copen][data-arg=claude-code]').click(); 1")
  await page.waitFor("/Let Arsenale add itself[\\s\\S]*Restart Claude Code[\\s\\S]*Say hello/.test(" + text('.setw') + ")")
})

test('the Team screen: an office room with a desk and a name for each member, and the profile at its side', { skip: SKIP || false }, async (t) => {
  const sb = makeSandbox({ packs: true })
  const { L, sup } = company(sb)
  sb.mod('agent-company.cjs').updateEmployee({ id: 'implementer', name: 'Ines', skills: ['Small fixes'], by: 'board' }, 'cli')
  L.startRun({ agent: 'implementer', task: 'Fix the menu page', officeId: 'studio' }, sup)
  const page = await open(t, sb, '#/team')
  await page.waitFor(exists('.ev-main svg.scene .seat'))
  await page.eval("document.querySelector('[data-ev=team-office][data-arg=studio]').click(); 1")
  await page.waitFor("[...document.querySelectorAll('.ev-main svg.scene .tagg')].some((g) => g.textContent === 'Ines')")
  const seats = await page.eval("document.querySelectorAll('.ev-main svg.scene .seat').length")
  assert.equal(seats, 3, 'implementer, ui-designer and the product lead sit in the studio')
  assert.match(await page.eval(text('.ticker')), /Ines is working on: Fix the menu page/)
  await page.eval("document.querySelector('.ev-main svg.scene .seat[data-arg=implementer]').dispatchEvent(new MouseEvent('click', { bubbles: true })); 1")
  await page.waitFor("/Ines/.test(" + text('.ev-drawer .ph') + ")")
  const prof = await page.eval(text('.ev-drawer'))
  assert.match(prof, /Working[\s\S]*Right now[\s\S]*Fix the menu page/)
  assert.match(prof, /Good at[\s\S]*Small fixes/)
  assert.match(prof, /Role file: implementer/)
  assert.doesNotMatch(await page.eval(text('.ev-drawer .ph')), /implementer/, 'the file id is only under Details')
})

test('the org chart: you, your assistant, and a coloured column per office with each member by name', { skip: SKIP || false }, async (t) => {
  const sb = makeSandbox({ packs: true })
  company(sb)
  sb.mod('agent-company.cjs').updateEmployee({ id: 'tester', name: 'Tess', by: 'board' }, 'cli')
  const page = await open(t, sb, '#/org')
  await page.waitFor(exists('.org .ocol'))
  const org = await page.eval(text('.org'))
  assert.match(org, /^Bluefin Bakery/)
  assert.match(org, /You[\s\S]*Owner\. Gives tasks and says yes or no\.[\s\S]*Your assistant[\s\S]*Takes on each role\./)
  const cols = await page.eval("[...document.querySelectorAll('.org .ocol')].map((c) => c.querySelector('.ocolh').textContent)")
  assert.deepEqual(cols, ['Engineering2', 'Studio3', 'HQ1'])
  assert.match(org, /Tess/)
  assert.doesNotMatch(await page.eval("[...document.querySelectorAll('.otx b')].map((b) => b.textContent).join(' ')"), /\btester\b|-/, 'names, not file ids')
  // a member opens their profile on the Team screen
  await page.eval("document.querySelector('.opb[data-arg=tester]').click(); 1")
  await page.waitFor("location.hash === '#/team' && /Tess/.test(" + text('.ev-drawer .ph') + ")")
})
