/* The campus board in a real page: the buildings on their lots, drawn as the
 * isometric light buildings with an office card each, build mode with its
 * hotbar of 12 types, the ghost, the "Lot taken" refusal, placing, moving,
 * turning and archiving through the one write path, and Done building. The
 * page draws itself by script, so these tests open it in a headless Chrome or
 * Edge (test/browser.cjs). With none installed they skip. */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const { startServer } = require('./helpers.cjs')
const browser = require('./browser.cjs')
const { scenario } = require('./office-scenario.cjs')

const SKIP = browser.unavailable()

let shared = null
async function world() {
  if (shared) return shared
  const sb = scenario()
  const s = await startServer(sb, { portBase: 44500 })
  const page = await browser.launch()
  await page.goto(s.url)
  await page.goto('http://127.0.0.1:' + s.port + '/?v=' + Date.now() + '#/campus')
  await page.screenshot(path.join(require('os').tmpdir(), 'campus-ui.png'), 1366, 768)
  await page.waitFor('window.__campus && window.__campus.info().buildings.length === 3 && document.querySelector("#cmap svg .bld")', 20000)
  shared = { sb, s, page }
  return shared
}
test.after(async () => {
  if (!shared) return
  await shared.page.close()
  shared.s.child.kill()
  shared.sb.cleanup()
})

const file = (sb) => { try { return JSON.parse(fs.readFileSync(path.join(sb.company, 'campus.json'), 'utf8')) } catch { return null } }
// a pointer event or a click on whatever is at the middle of a lot
const at = (type, x, y) => `(() => { const [px, py] = window.__campus.info().lotXY(${x}, ${y}); const el = document.elementFromPoint(px, py); el.dispatchEvent(new ${type === 'click' ? 'MouseEvent' : 'PointerEvent'}('${type}', { clientX: px, clientY: py, pointerId: 7, button: 0, bubbles: true })); return 1 })()`
const click = async (page, x, y) => { await page.eval(at('click', x, y)); await page.sleep(500) }
const msg = (page) => page.eval(`(document.getElementById('c3msg') || {}).textContent || ''`)
// the 3D office of a building, loaded; when a CI runner cannot load it in time
// (browser.ready3d) the page goes back to the campus the next tests start from
async function office3d(t, page, expr) {
  if (await browser.ready3d(t, page, expr, 15000)) return true
  await page.eval("location.hash = '#/campus'; 1")
  await page.waitFor("document.querySelector('#cmap g.bld[data-office=docs]')", 5000)
  return false
}
const ghost = (page) => page.eval(`(document.getElementById('cghost-lab') || {}).textContent || ''`)

test('the campus shows one building per office on a lot, with an office card each; only the lots in use are on show', { skip: SKIP || false }, async () => {
  const { page } = await world()
  const got = await page.eval(`(() => { const i = window.__campus.info(); return {
    b: i.buildings.map((b) => [b.officeId, b.type, b.x, b.y]), lots: i.lots, outlines: i.outlines,
    drawn: [...document.querySelectorAll('#cmap svg g.bld')].map((g) => g.dataset.office),
    cards: [...document.querySelectorAll('#cmap .sign h3')].map((h) => h.textContent),
    enter: document.querySelectorAll('#cmap .sign .cbtn.go').length, canvas: document.querySelectorAll('#cmap canvas').length,
    build: document.querySelector('[data-c3=build]').textContent,
  } })()`)
  assert.deepEqual(got.b.map((b) => b[0]).sort(), ['docs', 'engineering', 'hq'])
  assert.equal(got.b.find((b) => b[0] === 'engineering')[1], 'engineering')
  assert.equal(got.b.find((b) => b[0] === 'docs')[1], 'docs', 'the profile picks the type')
  assert.deepEqual(got.lots, { x0: 0, y0: 0, x1: 2, y1: 0 }, 'a campus of three starts as a block three lots wide, and only that block is shown')
  assert.deepEqual([...new Set(got.drawn)].sort(), ['docs', 'engineering', 'hq'])
  assert.deepEqual(got.cards.sort(), ['Docs', 'Engineering', 'Headquarters'])
  assert.equal(got.enter, 3, 'a card has its Enter office button')
  assert.equal(got.canvas, 0, 'the campus is drawn flat, not in 3D')
  assert.equal(got.outlines, 0, 'no lot outlines in normal mode')
  assert.equal(got.build, 'Build')
})

// 1.2 rule 42: the cards take depth, but only from the Stage shadows (--sh1, --sh2, and the glass finish's --sh-glass, --sh-card), and the
// drawing itself carries no blur filter (the 1.1 rule was "no shadows at all")
test('campus shadows are only the Stage tokens, and every type has a drawing of its own', { skip: SKIP || false }, async () => {
  const { page } = await world()
  const c = await page.eval(`(() => {
    const probe = (v) => { const d = document.createElement('div'); d.style.boxShadow = v; document.body.appendChild(d); const s = getComputedStyle(d).boxShadow; d.remove(); return s }
    const ok = ['none', probe('var(--sh1)'), probe('var(--sh2)'), probe('var(--sh-glass)'), probe('var(--sh-card)')]
    const signs = [...document.querySelectorAll('#cmap .sign')]
    return {
      blur: document.querySelectorAll('#cmap feGaussianBlur, #cmap filter, #cmap [filter]').length,
      tokens: ok.slice(1).filter((s) => s !== 'none').length,
      signs: signs.length,
      shadowed: signs.filter((e) => getComputedStyle(e).boxShadow !== 'none').length,
      other: signs.map((e) => getComputedStyle(e).boxShadow).filter((s) => !ok.includes(s)),
      plots: document.querySelectorAll('#cmap .bld .pl').length,
    }
  })()`)
  assert.equal(c.blur, 0, 'no SVG blur filter on the campus drawing')
  assert.equal(c.tokens, 4, 'the page defines --sh1, --sh2, --sh-glass and --sh-card')
  assert.ok(c.signs >= 3 && c.shadowed === c.signs, 'every office card has depth: ' + c.shadowed + ' of ' + c.signs)
  assert.deepEqual(c.other, [], 'a card shadow that is not a Stage token')
  assert.ok(c.plots >= 3)
  await page.eval(`document.querySelector('[data-c3=build]').click(); 1`)
  await page.waitFor("document.querySelectorAll('.c3h').length === 12", 5000)
  const icons = await page.eval(`[...document.querySelectorAll('.c3h svg')].map((s) => s.innerHTML)`)
  assert.equal(new Set(icons).size, 12, 'the 12 hotbar pictures are all different')
  assert.ok(icons.every((s) => s.length > 2000), 'each one is a whole building')
  await page.eval(`document.querySelector('[data-c3=build]').click(); 1`)
  await page.sleep(300)
})

test('lot outlines show in build mode only, and then the whole grid is on show', { skip: SKIP || false }, async () => {
  const { page } = await world()
  assert.equal(await page.eval('window.__campus.info().outlines'), 0, 'none in normal mode')
  await page.eval("document.querySelector('[data-c3=build]').click(); 1")
  await page.waitFor("window.__campus.info().build", 5000)
  await page.sleep(400)
  const i = await page.eval('window.__campus.info()')
  assert.equal(i.outlines, 21, '24 lots, 3 in use')
  assert.deepEqual(i.lots, { x0: 0, y0: 0, x1: 5, y1: 3 })
  await page.eval("document.querySelector('[data-c3=build]').click(); 1")
  await page.sleep(400)
})

test('a building enters its office, with the keyboard too', { skip: SKIP || false }, async (t) => {
  if (await browser.skipWithout3d(t)) return
  const { page } = await world()
  await page.eval("document.querySelector('#cmap g.bld[data-office=docs]').dispatchEvent(new MouseEvent('click', { bubbles: true })); 1")
  await page.waitFor("location.hash === '#/office/docs'", 5000)
  if (!(await office3d(t, page, 'window.__office3d && window.__office3d.info()'))) return // let the 3D office finish loading before leaving it
  await page.eval("location.hash = '#/campus'; 1")
  await page.waitFor("document.querySelector('#cmap g.bld[data-office=docs]')", 5000)
  await page.eval("document.querySelector('#cmap g.bld[data-office=hq]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); 1")
  await page.waitFor("location.hash === '#/office/hq'", 5000)
  if (!(await office3d(t, page, 'window.__office3d && window.__office3d.info()'))) return
  await page.eval("location.hash = '#/campus'; 1")
  await page.waitFor("document.querySelector('#cmap g.bld[data-office=docs]')", 5000)
})

test('leaving an office keeps you on the campus: a camera report that is still on its way never pulls the address back', { skip: SKIP || false }, async (t) => {
  if (await browser.skipWithout3d(t)) return
  const { page } = await world()
  await page.eval("location.hash = '#/campus'; 1")
  await page.waitFor("document.querySelector('#cmap g.bld[data-office=hq]')", 5000)
  await page.eval("document.querySelector('#cmap g.bld[data-office=hq]').dispatchEvent(new MouseEvent('click', { bubbles: true })); 1")
  if (!(await office3d(t, page, 'window.__office3d && window.__office3d.info() && window.__office3d.info().key'))) return
  // move the camera (its report is sent about 400 ms later), and change the address to the campus without the page being told yet
  await page.eval("window.__office3d.aim(0, 0, 2); history.pushState(null, '', '#/campus'); 1")
  for (let i = 0; i < 4; i++) {
    await page.sleep(300)
    assert.equal(await page.eval('location.hash'), '#/campus', 'the late camera report leaves the address alone')
  }
  await page.eval("history.replaceState(null, '', '#/office/hq'); location.hash = '#/campus'; 1")
  await page.waitFor("document.querySelector('[data-c3=build]')", 5000)
  assert.ok(await page.eval("!!document.querySelector('[data-c3=build]')"), 'and the campus is what is on screen')
})

test('build mode: 12 types in a hotbar, keys 1 to 9, a ghost, and "Lot taken" on a used lot', { skip: SKIP || false }, async () => {
  const { page, sb } = await world()
  await page.eval(`document.querySelector('[data-c3=build]').click(); 1`)
  await page.waitFor("document.querySelectorAll('.c3h').length === 12", 5000)
  assert.equal(await page.eval(`document.querySelectorAll('.c3t').length`), 4, 'select, move, rotate, archive')
  assert.equal(await page.eval(`document.querySelector('[data-c3=build]').textContent`), 'Done building')
  await page.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: '3', bubbles: true })); 1`)
  await page.waitFor("window.__campus.info().type === 'security'", 3000)
  assert.equal(await page.eval(`document.querySelectorAll('.c3h.on').length`), 1)
  const taken = await page.eval(`window.__campus.info().buildings.find((b) => b.officeId === 'hq')`)
  await page.eval(at('pointermove', taken.x, taken.y))
  assert.match(await ghost(page), /^Lot taken: Headquarters$/)
  const before = JSON.stringify(await page.eval(`fetch('api/company').then((r) => r.json()).then((c) => c.offices.map((o) => o.id))`))
  await click(page, taken.x, taken.y)
  assert.match(await msg(page), /Lot taken: Headquarters/)
  assert.equal(JSON.stringify(await page.eval(`fetch('api/company').then((r) => r.json()).then((c) => c.offices.map((o) => o.id))`)), before, 'no office was made')
  assert.equal(file(sb), null, 'nothing was written')
  await page.eval(at('pointermove', 4, 2))
  assert.match(await ghost(page), /^Security · click to place$/)
  // the keys 1 to 9 switch types, and pressing the same key again puts the type down
  await page.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: '3', bubbles: true })); 1`)
  await page.waitFor("window.__campus.info().type === ''", 3000)
})

test('placing a building creates the office and the file; the new building is on its lot', { skip: SKIP || false }, async () => {
  const { page, sb } = await world()
  await page.eval(`document.querySelector('[data-c3type=legal]').click(); 1`)
  await page.waitFor("window.__campus.info().type === 'legal'", 3000)
  await page.eval(at('pointermove', 4, 2))
  await click(page, 4, 2)
  await page.waitFor("window.__campus.info().buildings.length === 4", 8000)
  const f = file(sb)
  const b = f.buildings.find((x) => x.type === 'legal')
  assert.deepEqual([b.x, b.y, b.createdBy], [4, 2, 'board'])
  assert.equal(f.buildings.length, 4, 'the three buildings of before are saved with it')
  const off = JSON.parse(fs.readFileSync(path.join(sb.company, 'offices.json'), 'utf8')).find((o) => o.id === b.officeId)
  assert.equal(off.profile, 'legal')
  assert.match(await msg(page), /Placed Legal/)
  assert.ok(await page.eval(`!!document.querySelector('#cmap g.bld[data-office="' + ${JSON.stringify(b.officeId)} + '"]')`), 'and it is drawn')
})

test('move, rotate and archive tools work on a building; archive asks twice; Done building closes the palette', { skip: SKIP || false }, async () => {
  const { page, sb } = await world()
  const legal = () => file(sb).buildings.find((x) => x.type === 'legal')
  const here = legal()
  // rotate: click the building
  await page.eval(`document.querySelector('[data-c3tool=rotate]').click(); 1`)
  await click(page, here.x, here.y)
  await page.waitFor(`window.__campus.info().buildings.find((b) => b.type === 'legal').rot === 1`, 5000)
  assert.equal(legal().rot, 1)
  assert.ok(await page.eval(`document.querySelector('#cmap g.bld[data-b="b-' + ${JSON.stringify(legal().officeId)} + '"] g[transform]') !== null`), 'a turned building is drawn from the other side')
  // move: pick it up, put it down on a free lot (a click, then a click)
  await page.eval(`document.querySelector('[data-c3tool=move]').click(); 1`)
  await click(page, here.x, here.y)
  await click(page, 5, 1)
  await page.waitFor(`window.__campus.info().buildings.find((b) => b.type === 'legal').x === 5`, 5000)
  assert.deepEqual([legal().x, legal().y], [5, 1])
  // archive: the first click arms it, the second does it
  await page.eval(`document.querySelector('[data-c3tool=archive]').click(); 1`)
  await click(page, 5, 1)
  assert.match(await msg(page), /Click again to archive/)
  assert.ok(legal(), 'still there after one click')
  await click(page, 5, 1)
  await page.waitFor(`window.__campus.info().buildings.length === 3`, 8000)
  assert.equal(file(sb).buildings.some((x) => x.type === 'legal'), false)
  const offices = JSON.parse(fs.readFileSync(path.join(sb.company, 'offices.json'), 'utf8'))
  assert.equal(offices.find((o) => /legal/.test(o.id)).archived, true, 'the office is archived, not deleted')
  await page.eval(`document.querySelector('[data-c3=build]').click(); 1`)
  await page.waitFor("document.querySelectorAll('.c3h').length === 0", 5000)
})

test('the write path is the board\'s: a post with no key is refused', { skip: SKIP || false }, async () => {
  const { s } = await world()
  const body = JSON.stringify({ op: 'place', type: 'docs', x: 0, y: 3 })
  const bad = await fetch(s.base + 'api/campus', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:' + s.port, cookie: s.cookie }, body })
  assert.equal(bad.status, 403)
  const ok = await fetch(s.base + 'api/campus', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:' + s.port, cookie: s.cookie, 'X-Dashboard-Token': s.token }, body })
  assert.equal(ok.status, 200)
  const again = await fetch(s.base + 'api/campus', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:' + s.port, cookie: s.cookie, 'X-Dashboard-Token': s.token }, body })
  assert.equal(again.status, 409, 'the same lot twice is refused')
  assert.match((await again.json()).error, /Lot taken/)
})
