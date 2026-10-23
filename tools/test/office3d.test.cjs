/* The office floor in 3D (office3d in office-world.cjs): one podium per
 * person with a card and a character, the lounge, the supervisor station and
 * the walks between them, no shadows, a camera that survives the page's
 * redraw, the flat office when there is no WebGL, and a built file that stays
 * flat and carries no three.js.
 *
 * The floor is drawn by script with WebGL, so these tests open it in a
 * headless Chrome or Edge (test/browser.cjs). With none installed they skip. */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const { makeSandbox, startServer } = require('./helpers.cjs')
const browser = require('./browser.cjs')
const { fixture } = require('./language-fixture.cjs')

const SKIP = browser.unavailable()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let shared = null
async function world() {
  if (shared) return shared
  const sb = fixture()
  // a file of tester's own in the data folder replaces the default character for tester only
  fs.mkdirSync(path.join(sb.root, 'characters'), { recursive: true })
  fs.copyFileSync(path.join(sb.tools, 'characters', 'default.glb'), path.join(sb.root, 'characters', 'tester.glb'))
  const s = await startServer(sb, { portBase: 43000 })
  const page = await browser.launch()
  const log = await page.logEvents()
  await page.goto(s.url.replace('localhost', '127.0.0.1')) // trades the key for the cookie
  shared = { sb, s, page, log, base: 'http://127.0.0.1:' + s.port }
  return shared
}
test.after(async () => {
  if (!shared) return
  await shared.page.close()
  shared.s.child.kill()
  shared.sb.cleanup()
})

const READY = "window.__office3d && window.__office3d.info().podiums.some((p) => p.character)"
const pageErrors = (log) => log.filter((m) => m.method === 'Runtime.exceptionThrown' || (m.method === 'Log.entryAdded' && m.params.entry.level === 'error')).map((m) => JSON.stringify(m.params).slice(0, 300))

test('office 3D: every person of the office has a podium, a card and a character; the tray is there', { skip: SKIP || false }, async (t) => {
  if (await browser.skipWithout3d(t)) return
  const { page, base, log } = await world()
  await page.goto(base + '/?v=' + Date.now() + '#/office/engineering')
  if (!(await browser.ready3d(t, page, READY, 15000))) return
  await sleep(300)
  const got = await page.eval(`(() => {
    const info = window.__office3d.info()
    const office = 'engineering'
    const working = [...new Set(DATA.active.filter((a) => a.officeId === office).map((a) => a.agent))]
    const home = COMPANY.employees.filter((e) => e.kind === 'employee' && e.homeOfficeId === office && e.id !== 'supervisor').map((e) => e.id)
    const lead = (COMPANY.offices.find((o) => o.id === office) || {}).leadEmployeeId
    return {
      on: document.getElementById('stage').classList.contains('w3on'),
      flat: document.querySelectorAll('#stage-in svg').length,
      ids: info.podiums.map((p) => p.id), working, home, lead,
      withChar: info.podiums.filter((p) => p.character).map((p) => p.id),
      cards: [...document.querySelectorAll('.w3card')].map((c) => c.dataset.anchor),
      states: Object.fromEntries(info.podiums.map((p) => [p.id, p.state])),
      kinds: Object.fromEntries(info.podiums.map((p) => [p.id, p.kind])),
      cells: info.podiums.map((p) => p.cell.join(',')),
      glb: !!document.querySelector('.w3card.glb[data-anchor="tester"]'),
    }
  })()`)
  assert.ok(got.on, 'the 3D floor is on')
  assert.equal(got.flat, 0, 'and the flat office is not drawn under it')
  assert.ok(got.working.length > 0, 'the fixture has someone working here')
  for (const a of got.working) {
    assert.ok(got.ids.includes(a), a + ' works here and has a podium')
    assert.ok(got.withChar.includes(a), a + ' sits at it')
    assert.ok(['working', 'quiet'].includes(got.states[a]), a + ' is shown working: ' + got.states[a])
  }
  for (const a of got.home) assert.ok(got.ids.includes(a), a + ' (home staff) has a podium')
  if (got.lead) assert.equal(got.kinds[got.lead], 'lead', 'the lead has the big podium')
  assert.ok(got.ids.includes('~tray'), 'the handed-in tray')
  assert.deepEqual([...got.cards].sort(), [...got.ids].sort(), 'one card per podium')
  assert.equal(new Set(got.cells).size, got.cells.length, 'no two podiums share a cell')
  assert.ok(got.glb, 'characters/tester.glb in the data folder replaces the default character for tester')
  assert.deepEqual(pageErrors(log), [], 'no page or CSP errors')
})

test('office 3D: the 1.5 s redraw keeps the camera, the canvas and the cards', { skip: SKIP || false }, async (t) => {
  if (await browser.skipWithout3d(t)) return
  const { page, base, sb } = await world()
  await page.goto(base + '/?v=' + Date.now() + '#/office/engineering')
  if (!(await browser.ready3d(t, page, READY, 15000))) return
  await page.eval("window.__office3d.zoomBy(1.7); window.__office3d.panBy(90, -40); document.querySelector('#stage canvas').dataset.mark = 'same'; document.querySelector('.w3card').dataset.mark = 'same'; 1")
  await sleep(600)
  const before = await page.eval('window.__office3d.view()')
  assert.equal(before.auto, false, 'a moved camera is no longer the automatic fit')
  const id = await page.eval("DATA.active.find((a) => a.officeId === 'engineering').id")
  const r = sb.cli('--progress', JSON.stringify({ id, doing: 'camera check step' }))
  assert.equal(r.code, 0, r.err)
  await page.waitFor("JSON.stringify(DATA.active).includes('camera check step')", 10000)
  await sleep(1700)
  const after = await page.eval("({ view: window.__office3d.view(), canvas: document.querySelector('#stage canvas').dataset.mark, card: document.querySelector('.w3card').dataset.mark })")
  for (const k of ['tx', 'ty', 'tz', 'azim', 'elev', 'zoom']) assert.ok(Math.abs(after.view[k] - before[k]) < 1e-6, k + ' kept: ' + before[k] + ' -> ' + after.view[k])
  assert.equal(after.canvas, 'same', 'the canvas is the same element')
  assert.equal(after.card, 'same', 'the cards are kept, not drawn anew')
  await page.goto(base + '/?v=' + Date.now() + '#/office/engineering')
  if (!(await browser.ready3d(t, page, READY, 15000))) return
  const back = await page.eval('window.__office3d.view()')
  for (const k of ['tx', 'tz', 'zoom']) assert.ok(Math.abs(back[k] - before[k]) < 1e-3, k + ' restored after a reload')
})

test('office 3D: with no WebGL the flat office is drawn, and works', { skip: SKIP || false }, async (t) => {
  const { s, base } = await world()
  const page = await browser.launch()
  t.after(() => page.close())
  await page.onNewDocument(`(() => {
    const get = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (kind, o) { return /webgl/i.test(kind) ? null : get.call(this, kind, o) }
  })()`)
  await page.goto(s.url.replace('localhost', '127.0.0.1'))
  await page.goto(base + '/?v=' + Date.now() + '#/office/engineering')
  await sleep(800)
  const got = await page.eval(`({
    w3: !!window.__office3d,
    on: document.getElementById('stage').classList.contains('w3on'),
    svg: document.querySelectorAll('#stage-in svg.iso').length,
    canvas: document.querySelectorAll('#stage canvas').length,
  })`)
  assert.equal(got.w3, false, 'no 3D office without WebGL')
  assert.equal(got.on, false)
  assert.equal(got.svg, 1, 'the flat office is drawn')
  assert.equal(got.canvas, 0, 'and no canvas left behind')
})

// ---------- office v3 (2026-10-12): no shadows, a room on the ground, the lounge, the supervisor, the walks

const info = (page) => page.eval('window.__office3d.info()')
const pod = (i, id) => i.podiums.find((p) => p.id === id)
/** `want` appears in `trail` in this order (other steps may sit between). */
const inOrder = (trail, want) => { let k = 0; for (const t of trail) if (t === want[k]) k++; return k === want.length }
// a copy of the default character without its walking and standing clips: a file of someone's own made before office v3
function withoutWalk(buf) {
  const len = buf.readUInt32LE(12), json = JSON.parse(buf.subarray(20, 20 + len).toString('utf8'))
  json.animations = json.animations.filter((a) => !/walk|stand/i.test(a.name))
  let js = Buffer.from(JSON.stringify(json), 'utf8')
  if (js.length % 4) js = Buffer.concat([js, Buffer.alloc(4 - (js.length % 4), 0x20)])
  const rest = buf.subarray(20 + len)
  const head = Buffer.alloc(20)
  head.writeUInt32LE(0x46546C67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(20 + js.length + rest.length, 8)
  head.writeUInt32LE(js.length, 12); head.writeUInt32LE(0x4E4F534A, 16)
  return Buffer.concat([head, js, rest])
}

/** walker-agent: a finished run today in Engineering, so it rests in the lounge there (once per world) */
let warmed = false
function warmUp(sb) {
  if (warmed) return
  warmed = true
  assert.equal(sb.cli(JSON.stringify({ agent: 'walker-agent', task: 'warm-up', project: 'democalc', model: 'sonnet', status: 'ok', summary: 'warm-up done' })).code, 0)
}

test('office 3D: no shadows, and everything stands on the floor; the campus has no shadows either', { skip: SKIP || false }, async (t) => {
  if (await browser.skipWithout3d(t)) return
  const { page, base } = await world()
  await page.goto(base + '/?v=s1#/office/engineering')
  if (!(await browser.ready3d(t, page, READY, 15000))) return
  const i = await info(page)
  assert.equal(i.shadows.map, false, 'the renderer draws no shadows')
  assert.equal(i.shadows.casters, 0, 'and nothing casts or takes one')
  assert.ok(i.floorMinY > -0.01, 'nothing hangs below the floor: ' + i.floorMinY)
  assert.ok(i.floorMinY < 0.01, 'and the room starts on it: ' + i.floorMinY)
  for (const p of i.podiums.filter((x) => x.pos)) assert.ok(p.pos[1] >= 0 && p.pos[1] < 0.1, p.id + ' stands on the floor (or the low platform): ' + p.pos[1])
  await page.goto(base + '/?v=s2#/campus')
  await page.waitFor("document.querySelector('#cmap svg')", 10000)
  // 1.2 rule 42: the office cards take depth, but only from the Stage shadow tokens
  const c = await page.eval(`(() => {
    const probe = (v) => { const d = document.createElement('div'); d.style.boxShadow = v; document.body.appendChild(d); const s = getComputedStyle(d).boxShadow; d.remove(); return s }
    const ok = ['none', probe('var(--sh1)'), probe('var(--sh2)'), probe('var(--sh-glass)'), probe('var(--sh-card)')]
    return {
      blur: document.querySelectorAll('#cmap feGaussianBlur, #cmap filter, #cmap [filter]').length,
      other: [...document.querySelectorAll('#cmap .sign')].map((e) => getComputedStyle(e).boxShadow).filter((s) => !ok.includes(s)),
      plots: document.querySelectorAll('#cmap .bld .pl').length,
    }
  })()`)
  assert.equal(c.blur, 0, 'no blurred shadow on the campus')
  assert.deepEqual(c.other, [], 'an office card shadow that is not a Stage token')
  assert.ok(c.plots > 0, 'the plots are drawn')
})

test('office 3D: the lounge and the supervisor station; idle people rest in the lounge, workers sit at their desks', { skip: SKIP || false }, async (t) => {
  if (await browser.skipWithout3d(t)) return
  const { page, base, sb } = await world()
  warmUp(sb)
  await page.goto(base + '/?v=s3#/office/engineering')
  if (!(await browser.ready3d(t, page, READY, 15000))) return
  await sleep(800)
  const i = await info(page)
  assert.ok(i.spots && i.spots.supervisor && i.spots.supervisor.visits >= 1, 'the supervisor station has places to stand')
  const desks = i.podiums.filter((p) => p.kind === 'desk')
  assert.ok(i.spots.lounge.seats + i.spots.lounge.standing >= desks.length, 'everyone fits in the lounge')
  const lead = i.podiums.find((p) => p.kind === 'lead')
  if (lead) assert.equal(lead.loc, 'sup', 'the lead sits at the supervisor station')
  assert.ok(i.podiums.some((p) => p.kind === 'tray'), 'the tray is on the supervisor desk')
  let resting = 0
  for (const p of desks.filter((x) => x.character)) {
    if (p.loc === 'walk') continue
    const want = ['working', 'quiet', 'waiting'].includes(p.state) ? 'desk' : 'lounge'
    assert.equal(p.loc, want, p.id + ' (' + p.state + ') is at the ' + want)
    if (want === 'lounge') resting++
  }
  assert.ok(resting > 0, 'the fixture has someone resting in the lounge')
  const signs = await page.eval("[...document.querySelectorAll('.w3card')].length")
  assert.equal(signs, i.podiums.length, 'every desk keeps its card')
})

test('office 3D: starting work walks from the lounge to the supervisor and the desk; finishing walks back by the supervisor to the lounge', { skip: SKIP || false }, async (t) => {
  if (await browser.skipWithout3d(t)) return
  const { page, base, sb, log } = await world()
  warmUp(sb)
  await page.goto(base + '/?v=s4#/office/engineering')
  if (!(await browser.ready3d(t, page, READY, 15000))) return
  await page.eval('window.__office3d.pace(8); 1')
  await page.waitFor("(() => { const p = window.__office3d.info().podiums.find((x) => x.id === 'walker-agent'); return p && p.loc === 'lounge' })()", 10000)
  const id = sb.cli('--start', JSON.stringify({ agent: 'walker-agent', task: 'walk check', project: 'democalc', model: 'sonnet' })).out.trim()
  assert.ok(id, 'the run started')
  await page.waitFor("(() => { const p = window.__office3d.info().podiums.find((x) => x.id === 'walker-agent'); return p.loc === 'desk' && p.state === 'working' })()", 30000)
  let p = pod(await info(page), 'walker-agent')
  assert.ok(inOrder(p.trail, ['lounge', 'walk', 'sup', 'receive', 'walk', 'desk']), 'lounge, the supervisor (the task handed over), the desk: ' + p.trail.join(' > '))
  assert.equal(p.clip, 'typing', 'and works at the desk')
  const before = p.trail.length
  assert.equal(sb.cli(JSON.stringify({ id, agent: 'walker-agent', task: 'walk check', status: 'ok', summary: 'walk check done' })).code, 0)
  await page.waitFor("(() => { const p = window.__office3d.info().podiums.find((x) => x.id === 'walker-agent'); return p.loc === 'lounge' })()", 30000)
  p = pod(await info(page), 'walker-agent')
  assert.ok(inOrder(p.trail.slice(before - 1), ['desk', 'walk', 'sup', 'handin', 'walk', 'lounge']), 'the desk, the supervisor (the report handed in), the lounge: ' + p.trail.join(' > '))
  assert.deepEqual(pageErrors(log), [], 'no page errors')
})

test('office 3D: a state that changes halfway through a walk is taken from where the person is', { skip: SKIP || false }, async (t) => {
  if (await browser.skipWithout3d(t)) return
  const { page, base, sb, log } = await world()
  warmUp(sb)
  await page.goto(base + '/?v=s5#/office/engineering')
  if (!(await browser.ready3d(t, page, READY, 15000))) return
  await page.eval('window.__office3d.pace(1); 1')
  await page.waitFor("(() => { const p = window.__office3d.info().podiums.find((x) => x.id === 'walker-agent'); return p && p.loc === 'lounge' })()", 10000)
  const id = sb.cli('--start', JSON.stringify({ agent: 'walker-agent', task: 'walk check two', project: 'democalc', model: 'sonnet' })).out.trim()
  await page.waitFor("window.__office3d.info().podiums.find((x) => x.id === 'walker-agent').loc === 'walk'", 15000)
  await sleep(700)
  const mid = pod(await info(page), 'walker-agent')
  assert.equal(mid.loc, 'walk', 'still on the way')
  // done before reaching the desk: the person turns round where they are
  assert.equal(sb.cli(JSON.stringify({ id, agent: 'walker-agent', task: 'walk check two', status: 'ok', summary: 'done early' })).code, 0)
  await page.eval('window.__office3d.pace(8); 1')
  await page.waitFor("(() => { const p = window.__office3d.info().podiums.find((x) => x.id === 'walker-agent'); return p.loc === 'lounge' && p.state !== 'working' })()", 30000)
  const end = pod(await info(page), 'walker-agent')
  const tail = end.trail.slice(end.trail.lastIndexOf('lounge', end.trail.length - 2))
  assert.ok(tail.includes('handin'), 'the report still goes to the supervisor: ' + end.trail.join(' > '))
  assert.equal(end.trail[end.trail.length - 1], 'lounge', 'and the walk ends in the lounge')
  assert.ok(end.pos[1] >= 0, 'on the floor')
  assert.deepEqual(pageErrors(log), [], 'no page errors')
})

test('office 3D: a character file without a walk clip still walks, in its idle pose', { skip: SKIP || false }, async (t) => {
  if (await browser.skipWithout3d(t)) return
  const { page, base, sb, log } = await world()
  fs.writeFileSync(path.join(sb.root, 'characters', 'walker-agent.glb'), withoutWalk(fs.readFileSync(path.join(sb.tools, 'characters', 'default.glb'))))
  // gone again however this test ends: the next test reads the shipped character
  t.after(() => fs.rmSync(path.join(sb.root, 'characters', 'walker-agent.glb'), { force: true }))
  warmUp(sb)
  await page.goto(base + '/?v=s6#/office/engineering')
  if (!(await browser.ready3d(t, page, "window.__office3d && window.__office3d.info().podiums.some((p) => p.id === 'walker-agent' && p.character)", 15000))) return
  await page.waitFor("!!document.querySelector('.w3card.glb[data-anchor=\"walker-agent\"]')", 10000)
  await page.eval('window.__office3d.pace(1); 1')
  const id = sb.cli('--start', JSON.stringify({ agent: 'walker-agent', task: 'walk check three', project: 'democalc', model: 'sonnet' })).out.trim()
  await page.waitFor("(() => { const p = window.__office3d.info().podiums.find((x) => x.id === 'walker-agent'); return p.loc === 'walk' && p.clip === 'walk' })()", 15000)
  const p = pod(await info(page), 'walker-agent')
  assert.equal(p.clip, 'walk', 'it is walking')
  assert.equal(p.clipName, 'Idle', 'with its idle clip, as it has no walk')
  await page.eval('window.__office3d.pace(8); 1')
  await page.waitFor("window.__office3d.info().podiums.find((x) => x.id === 'walker-agent').loc === 'desk'", 30000)
  sb.cli(JSON.stringify({ id, agent: 'walker-agent', task: 'walk check three', status: 'ok', summary: 'done' }))
  fs.rmSync(path.join(sb.root, 'characters', 'walker-agent.glb'), { force: true })
  assert.deepEqual(pageErrors(log), [], 'no page errors')
})

test('office 3D: the built file keeps the flat office and carries no three.js; the live page carries r184 and the character', () => {
  const sb = makeSandbox()
  try {
    const { renderOffice } = sb.mod('agent-office-page.cjs')
    const state = { runs: [], active: [], agents: [], gates: [], decisions: [], prices: {}, answers: [] }
    const built = renderOffice(state, { live: false, lang: 'en' })
    assert.ok(!built.includes("const REVISION = '184'"), 'no three.js in the built file')
    const live = renderOffice(state, { live: true, token: 'x', lang: 'en' })
    assert.ok(live.includes("const REVISION = '184'"), 'the live page carries the pinned three.js r184')
    assert.ok(/const OFFICE_CHARACTERS = \{"default":"Z2xURg/.test(live), 'and the default character (a glTF binary)')
    assert.equal((live.match(/<\/script>/g) || []).length, (live.match(/<script>/g) || []).length, 'every script block closes where it should')
  } finally { sb.cleanup() }
})

test('the default character: CC0, made by our own script, with its six clip names (walking and standing too)', () => {
  const dir = path.join(__dirname, '..', 'characters')
  const b = fs.readFileSync(path.join(dir, 'default.glb'))
  assert.equal(b.readUInt32LE(0), 0x46546C67, 'a glTF binary')
  const json = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString('utf8'))
  assert.deepEqual(json.animations.map((a) => a.name), ['Idle', 'Typing', 'Thinking', 'Celebrate', 'Walk', 'Stand'])
  assert.equal(json.scenes[0].extras.arsenale.seated, true)
  assert.ok(!json.images && !json.textures, 'no textures in it')
  assert.match(fs.readFileSync(path.join(dir, 'LICENSE.txt'), 'utf8'), /CC0 1\.0/)
  // the script makes the same file again, byte for byte
  const out = path.join(require('os').tmpdir(), 'arsenale-default-' + process.pid + '.glb')
  const r = require('child_process').spawnSync(process.execPath, [path.join(dir, 'make-default-character.cjs'), out], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  try { assert.ok(fs.readFileSync(out).equals(b), 'make-default-character.cjs rebuilds default.glb exactly') } finally { fs.rmSync(out, { force: true }) }
})

test('three.js is pinned to r184', () => {
  const three = fs.readFileSync(path.join(__dirname, '..', 'vendor', 'three', 'three.cjs'))
  assert.equal(require('crypto').createHash('sha256').update(three).digest('hex'), '0fe243aabd03faa48e4156b51bf5b4c943fea15748aa623047aab539ab3b9624', 'three.cjs is three@0.184.0 build/three.cjs')
})

test('office 3D, the shipped set: each state plays its own clip (Walk, Stand, Typing, Celebrate, then Sit or Stand in the lounge), read from the mixer state', { skip: SKIP || false }, async (t) => {
  if (await browser.skipWithout3d(t)) return
  const { page, base, sb, log } = await world()
  warmUp(sb)
  await page.goto(base + '/?v=s7#/office/engineering')
  if (!(await browser.ready3d(t, page, READY, 15000))) return
  await page.eval('window.__office3d.pace(1); 1')
  const P = "window.__office3d.info().podiums.find((x) => x.id === 'walker-agent')"
  await page.waitFor("(() => { const p = " + P + "; return p && p.loc === 'lounge' })()", 10000)
  // the one look function picks the model: the same pick the campus and the lists make
  const pick = await page.eval("(() => { const i = window.__office3d.info(); return i.podiums.filter((p) => p.model && p.agent && p.agent !== 'tester').map((p) => [p.model, 'person-' + OFFICE_LOOK.variant(p.agent) + '.glb']) })()")
  assert.ok(pick.length > 2, 'people with a shipped character')
  for (const [got, want] of pick) assert.ok(got === want || (/^person-plain/.test(got) && /plain/.test(want)), got + ' is ' + want)
  const id = sb.cli('--start', JSON.stringify({ agent: 'walker-agent', task: 'clip check', project: 'democalc', model: 'sonnet' })).out.trim()
  assert.ok(id)
  const seen = (cond) => page.waitFor("(() => { const p = " + P + "; return " + cond + " })()", 30000)
  await seen("p.loc === 'walk' && p.clipName === 'Walk'")
  await seen("p.loc === 'sup' && p.act === 'receive' && p.clipName === 'Stand'")
  await seen("p.loc === 'desk' && p.state === 'working' && p.clipName === 'Typing'")
  assert.equal(sb.cli(JSON.stringify({ id, agent: 'walker-agent', task: 'clip check', status: 'ok', summary: 'clip check done' })).code, 0)
  await seen("p.loc === 'sup' && p.act === 'handin' && p.clipName === 'Celebrate'")
  await seen("p.loc === 'lounge' && (p.clipName === 'Sit' || p.clipName === 'Stand')")
  assert.deepEqual(pageErrors(log), [], 'no page errors')
})
