/* The 1.0 screens, driven like a person would in a headless Chrome or Edge
 * (test/browser.cjs; skipped when there is none): the four-step wizard from
 * an empty data folder, a task written on its own page and seen on the board,
 * a hire through the side panel of the office room, a hire proposal approved,
 * and the desktop notification for a new question.
 * Each test has its own server and data folder. All data is invented. */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const { makeSandbox, SEED, startServer } = require('./helpers.cjs')
const browser = require('./browser.cjs')

const SKIP = browser.unavailable()

async function open(t, opts) {
  const sb = makeSandbox(Object.assign({ packs: true }, opts))
  if (opts && opts.company) assert.equal(sb.cli('--company-init', '--seed', sb.seed(Object.assign({}, SEED, { company: { name: 'Bluefin Bakery', issuePrefix: 'BLU' } }))).code, 0)
  const { port, child, url: keyUrl } = await startServer(sb)
  const page = await browser.launch()
  t.after(async () => { await page.close(); child.kill(); sb.cleanup() })
  // the owner's way in: the key address once, then the cookie. The blank page
  // after it makes every goto() below a real load: from the dashboard itself,
  // an address that differs only by its #hash never fires a load event.
  await page.goto(keyUrl)
  await page.goto('about:blank')
  const url = 'http://127.0.0.1:' + port + '/'
  const click = (sel) => page.eval('(() => { const e = document.querySelector(' + JSON.stringify(sel) + '); if (!e) throw new Error("no ' + sel.replace(/"/g, "'") + '"); e.click(); return 1 })()')
  const waitFor = (expr, ms) => page.waitFor(expr, ms || 10000)
  const set = (sel, value) => page.eval('(() => { const e = document.querySelector(' + JSON.stringify(sel) + '); e.value = ' + JSON.stringify(value) + '; return 1 })()')
  const submit = (sel) => page.eval('(() => { document.querySelector(' + JSON.stringify(sel) + ').requestSubmit(); return 1 })()')
  return { sb, port, page, url, click, waitFor, set, submit }
}
const exists = (expr) => '!!document.querySelector(' + JSON.stringify(expr) + ')'

test('T-3.1 through the page: the wizard opens on an empty data folder, and Create sets up the company', { skip: SKIP || false }, async (t) => {
  const w = await open(t)
  await w.page.goto(w.url)
  await w.waitFor(exists('.wz form[data-evform=wiz] input[name=name]'))
  assert.equal(fs.existsSync(w.sb.company), false)
  // step 1, welcome: the name, what it does, how the assistant is paid for
  await w.set('.wz input[name=name]', 'Bluefin Bakery')
  await w.set('.wz textarea[name=mission]', 'Three bakeries and a delivery service')
  await w.click('.wz input[name=payModel][value=plan]')
  await w.submit('.wz form')
  await w.waitFor(exists('.wz input[name=pack]'))
  // step 2, offices: the description pre-ticks marketing, support and operations,
  // and each ticked office stands as a building on the campus
  const ticked = await w.page.eval("[...document.querySelectorAll('.wz input[name=pack]:checked')].map((e) => e.value).sort().join(',')")
  assert.equal(ticked, 'content-marketing,customer-support,operations')
  assert.equal(await w.page.eval("document.querySelectorAll('.wz .wscene>svg .tagg').length"), 3, 'three buildings, one per ticked office')
  assert.equal(fs.existsSync(w.sb.company), false, 'nothing is written before Create')
  await w.submit('.wz form')
  // step 3, connect: the three steps for the assistant, and the wait for its hello
  await w.waitFor("/Say hello to Arsenale/.test(document.querySelector('.wz').textContent)")
  assert.match(await w.page.eval("document.querySelector('.wz').textContent"), /Waiting to hear from Claude Desktop/)
  await w.submit('.wz form')
  // step 4, review: the files Arsenale will create, and nothing is written yet
  await w.waitFor("document.querySelector('.wz pre') && /policy\\.json/.test(document.querySelector('.wz pre').textContent)")
  assert.match(await w.page.eval("document.querySelector('.wz').textContent"), /Ready to open the doors\?[\s\S]*Bluefin Bakery[\s\S]*Claude Desktop/)
  assert.equal(fs.existsSync(w.sb.company), false, 'the review step writes nothing')
  await w.submit('.wz form') // Create my team
  await w.waitFor("/Your company is set up/.test(document.querySelector('.wz').textContent)")
  assert.deepEqual(w.sb.read('company/offices.json').map((o) => o.id), ['marketing', 'support', 'operations'])
  assert.equal(w.sb.read('company/company.json').payModel, 'plan')
  assert.deepEqual(w.sb.read('company/company.json').assistants, ['claude-desktop'])
  assert.ok(w.sb.read('policy.json').defaults.payment === 'ask')
  assert.ok(fs.existsSync(path.join(w.sb.agents, 'reply-drafter.md')))
})

test('the wizard does not open with runs but no company; closing it before Create writes nothing', { skip: SKIP || false }, async (t) => {
  const w = await open(t)
  w.sb.run({ agent: 'tester' })
  await w.page.goto(w.url + '#/campus')
  await w.page.sleep(1500)
  assert.equal(await w.page.eval(exists('.wz')), false, 'no wizard with runs on record (R-3.1)')
  await w.click('[data-ev=wiz-open]')
  await w.waitFor(exists('.wz input[name=name]'))
  await w.set('.wz input[name=name]', 'Lumen Atelier')
  await w.submit('.wz form')
  await w.waitFor(exists('.wz input[name=pack]'))
  await w.click('[data-ev=wiz-close]')
  await w.waitFor('!document.querySelector(".wz")')
  assert.equal(fs.existsSync(w.sb.company), false)
  assert.deepEqual(fs.readdirSync(w.sb.agents).filter((f) => !['implementer.md', 'tester.md', 'ui-designer.md', 'code-reviewer.md', 'engineering-lead.md', 'product-lead.md', 'AGENT-RULES.md'].includes(f)), [])
})

test('a language switch in the wizard keeps what was typed', { skip: SKIP || false }, async (t) => {
  const w = await open(t)
  await w.page.goto(w.url + '?lang=en')
  await w.waitFor(exists('.wz input[name=name]'))
  await w.set('.wz input[name=name]', 'Lumen Atelier')
  await w.set('.wz textarea[name=mission]', 'A small print studio')
  await w.click('.wz [data-lang=fa]')
  await w.waitFor("document.documentElement.dir === 'rtl' && !!document.querySelector('.wz input[name=name]')", 15000)
  assert.equal(await w.page.eval("document.querySelector('.wz input[name=name]').value"), 'Lumen Atelier')
  assert.equal(await w.page.eval("document.querySelector('.wz textarea[name=mission]').value"), 'A small print studio')
  assert.equal(fs.existsSync(w.sb.company), false)
})

test('a task written on the page: saved as BLU-1, commented and moved; a bad link is refused with its reason', { skip: SKIP || false }, async (t) => {
  const w = await open(t, { company: true })
  await w.page.goto(w.url + '#/tasks')
  await w.waitFor(exists('[data-ev=task-new]'))
  await w.click('[data-ev=task-new]')
  await w.waitFor(exists('form[data-evform=task-new]'))
  await w.set('form[data-evform=task-new] input[name=title]', 'Write the Christmas opening hours post')
  await w.set('form[data-evform=task-new] input[name=dueDate]', '2026-12-01')
  await w.set('form[data-evform=task-new] textarea[name=urls]', 'https://example.org/hours')
  // who does it: a person, picked by name
  assert.match(await w.page.eval("document.querySelector('form[data-evform=task-new] input[name=who][value=tester]').closest('label').textContent"), /Tester/)
  await w.click('form[data-evform=task-new] input[name=who][value=tester]')
  await w.page.eval("document.querySelector('form[data-evform=task-new] input[name=needsSignOff]').checked = true; 1")
  await w.submit('form[data-evform=task-new]')
  // the task's own page opens
  await w.waitFor(exists('form[data-evform=task-comment]'))
  const task = w.sb.read('company/issues/BLU-1.json')
  assert.deepEqual([task.title, task.status, task.dueDate, task.assigneeAgentId, task.needsSignOff, task.links[0].url], ['Write the Christmas opening hours post', 'todo', '2026-12-01', 'tester', true, 'https://example.org/hours'])
  await w.set('form[data-evform=task-comment] textarea[name=text]', 'Use the winter photo')
  await w.submit('form[data-evform=task-comment]')
  await w.waitFor("/Use the winter photo/.test(document.querySelector('.ev-main').textContent)")
  await w.click('[data-ev=task-edit]')
  await w.waitFor(exists('form[data-evform=task-edit]'))
  await w.set('form[data-evform=task-edit] select[name=status]', 'blocked')
  await w.submit('form[data-evform=task-edit]')
  for (let i = 0; i < 30 && w.sb.read('company/issues/BLU-1.json').status !== 'blocked'; i++) await w.page.sleep(150)
  assert.equal(w.sb.read('company/issues/BLU-1.json').status, 'blocked')
  // the board: the task in "Working on it", by its title, with no task number
  await w.click('[data-ev=page-close]')
  // the list is fetched again after the change: wait for the moved card
  await w.waitFor("/Working on it[\\s\\S]*Write the Christmas/.test((document.querySelector('.board4') || {}).textContent || '')", 12000)
  const board = await w.page.eval("document.querySelector('.board4').textContent")
  assert.match(board, /Working on it[\s\S]*Write the Christmas opening hours post/)
  assert.doesNotMatch(board, /BLU-1/)
  // a link that is not http(s) is refused with the reason, on the page
  await w.click('[data-ev=task-new]')
  await w.waitFor(exists('form[data-evform=task-new]'))
  await w.set('form[data-evform=task-new] input[name=title]', 'bad link')
  await w.set('form[data-evform=task-new] textarea[name=urls]', 'javascript:alert(1)')
  await w.submit('form[data-evform=task-new]')
  await w.waitFor("/Links must start with https/.test(document.querySelector('.ev-main').textContent)")
  assert.equal(fs.existsSync(path.join(w.sb.company, 'issues', 'BLU-2.json')), false)
})

test('T-5.1 through the page: the hire form writes the member after the review; the profile shows the rules', { skip: SKIP || false }, async (t) => {
  const w = await open(t, { company: true })
  await w.page.goto(w.url + '#/team')
  await w.waitFor(exists('[data-ev=hire-new]'))
  await w.click('[data-ev=team-office][data-arg=studio]')
  await w.waitFor(exists('[data-ev=hire-new]'))
  await w.click('[data-ev=hire-new]')
  await w.waitFor(exists('form[data-evform=hire] input[name=name]'))
  // a desk being added shows in the room
  assert.match(await w.page.eval("document.querySelector('.ev-main svg').textContent"), /New desk/)
  // no job title: the form says why and writes nothing
  await w.set('form[data-evform=hire] input[name=name]', 'Nora')
  await w.set('form[data-evform=hire] textarea[name=instructions]', 'Draft the weekly newsletter. Never send it.')
  await w.submit('form[data-evform=hire]')
  await w.waitFor("/Please give a job title/.test(document.querySelector('.ev-drawer').textContent)")
  await w.set('form[data-evform=hire] input[name=title]', 'Newsletter editor')
  await w.set('form[data-evform=hire] input[name=id]', 'newsletter-nora')
  await w.set('form[data-evform=hire] input[name=description]', 'Writes the weekly newsletter from the notes')
  await w.set('form[data-evform=hire] input[name=skill]', 'Newsletters')
  await w.click('form[data-evform=hire] input[name=look][value="2"]')
  await w.page.eval("document.querySelector('form[data-evform=hire] input[name=\"ask:message.send\"]').checked = false; 1")
  await w.submit('form[data-evform=hire]')
  await w.waitFor("document.querySelector('.ev-drawer pre') && /name: newsletter-nora/.test(document.querySelector('.ev-drawer pre').textContent)")
  assert.equal(fs.existsSync(path.join(w.sb.agents, 'newsletter-nora.md')), false, 'the review step writes nothing')
  await w.submit('form[data-evform=hire]')
  await w.waitFor("/Your assistant sees the change/.test(document.querySelector('.ev-drawer').textContent)")
  const text = fs.readFileSync(path.join(w.sb.agents, 'newsletter-nora.md'), 'utf8')
  assert.match(text, /^---\nname: newsletter-nora\ndescription: "Writes the weekly newsletter from the notes"\nmodel: sonnet\n/)
  assert.equal(w.sb.read('policy.json').members['newsletter-nora']['message.send'], 'allow')
  const e = w.sb.read('company/employees.json')['newsletter-nora']
  assert.deepEqual([e.name, e.title, e.homeOfficeId, e.skills, e.look], ['Nora', 'Newsletter editor', 'studio', ['Newsletters'], 2])
  // the profile: the name first, the file id only under Details
  await w.waitFor("/Nora/.test((document.querySelector('.ev-drawer .ph') || {}).textContent || '')")
  assert.doesNotMatch(await w.page.eval("document.querySelector('.ev-drawer .ph').textContent"), /newsletter-nora/)
  assert.match(await w.page.eval("document.querySelector('.ev-drawer').textContent"), /Role file: newsletter-nora/)
})

test('T-5.4 through the page: a hire proposal is approved with two clicks, and the file is written from it', { skip: SKIP || false }, async (t) => {
  const w = await open(t, { company: true })
  const L = w.sb.mod('runlog.cjs')
  const g = w.sb.mod('team.cjs').propose({ name: 'Invoice Ivo', title: 'Invoice drafter', office_id: 'hq', description: 'Drafts monthly invoices from the order list', instructions: 'Draft one invoice per customer. Never send.', why: 'Invoices take long' }, L.actorFor('mcp', 'supervisor', { clientId: 'cli-a' }))
  await w.page.goto(w.url + '#/approvals')
  await w.waitFor(exists('[data-ev=hire-yes]'))
  await w.click('[data-ev=hire-yes]')
  await w.waitFor("/Click again to confirm/.test(document.querySelector('[data-ev=hire-yes]').textContent)")
  assert.equal(fs.existsSync(path.join(w.sb.agents, 'invoice-ivo.md')), false, 'one click does nothing')
  await w.click('[data-ev=hire-yes]')
  // the member file is written first, then the question is answered: wait for both
  const gateFile = 'agent-runs/gates/' + g.question_id + '.json'
  for (let i = 0; i < 60 && w.sb.read(gateFile).status !== 'answered'; i++) await w.page.sleep(150)
  assert.ok(fs.existsSync(path.join(w.sb.agents, 'invoice-ivo.md')))
  const saved = w.sb.read(gateFile)
  assert.equal(saved.answer, 'hired invoice-ivo')
  assert.ok(saved.hiredAt)
})

test('R-7.1 to R-7.3: a finished job shows its summary and what was done first, then the time; never "$0"', { skip: SKIP || false }, async (t) => {
  const w = await open(t, { company: true })
  const now = Date.now()
  w.sb.run({ agent: 'tester', project: 'democalc', task: 'check the menu page', summary: 'Menu page checked: two typos fixed', whatWasDone: ['Read the page', 'Fixed two typos'], startedAt: new Date(now - 12 * 60000).toISOString(), finishedAt: new Date(now).toISOString() })
  const co = w.sb.read('company/company.json'); co.payModel = 'plan'; fs.writeFileSync(path.join(w.sb.company, 'company.json'), JSON.stringify(co))
  await w.page.goto(w.url + '#/office/engineering')
  await w.waitFor(exists('.slip[data-key]'))
  await w.click('.slip[data-key]')
  await w.waitFor(exists('.insp .plain .sum'))
  const plain = await w.page.eval("document.querySelector('.insp .plain').textContent")
  assert.match(plain, /^Menu page checked: two typos fixed/)
  assert.match(plain, /Read the page/)
  assert.match(plain, /12 min · Included in your plan/)
  assert.doesNotMatch(plain, /\$0/)
})

test('T-8.1 (browser part): a new question raises a desktop notification that opens Approvals', { skip: SKIP || false }, async (t) => {
  const w = await open(t, { company: true })
  await w.page.goto(w.url + '#/campus')
  // the browser's Notification, replaced by a recorder that says "granted"
  await w.page.eval("window.__n = []; window.Notification = function (title, o) { window.__n.push([title, o.body, o.tag]); this.close = () => {} }; window.Notification.permission = 'granted'; 1")
  await w.page.sleep(2000)
  assert.equal(w.sb.cli('--gate', JSON.stringify({ project: 'tide', kind: 'approval', question: 'Post the autumn menu on Instagram?' })).code, 0)
  await w.waitFor('window.__n.length > 0', 8000)
  const [title, body, tag] = await w.page.eval('window.__n[0]')
  assert.equal(title, 'Your assistant asks you something')
  assert.equal(body, 'Post the autumn menu on Instagram?')
  assert.match(tag, /^#\/approvals/)
  // switched off in Settings: no more notifications
  await w.page.eval("localStorage.setItem('arsenale-notify', 'off'); 1")
  w.sb.cli('--gate', JSON.stringify({ project: 'tide', kind: 'A', question: 'Second question?' }))
  await w.page.sleep(3500)
  assert.equal(await w.page.eval('window.__n.length'), 1)
})
