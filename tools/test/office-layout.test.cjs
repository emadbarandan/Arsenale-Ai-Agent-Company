/* The office floor: one figure per run (N runs of one agent are N people at N
 * desks, each keeping its desk while the page redraws), and the top bar at
 * 1366 wide.
 *
 * The floor is drawn by script with WebGL, so these tests open it in a
 * headless Chrome or Edge (test/browser.cjs). With none installed they skip. */
const test = require('node:test')
const assert = require('node:assert/strict')
const { startServer } = require('./helpers.cjs')
const browser = require('./browser.cjs')
const { scenario } = require('./office-scenario.cjs')

const SKIP = browser.unavailable()

let shared = null
async function world() {
  if (shared) return shared
  const sb = scenario()
  const s = await startServer(sb, { portBase: 43500 })
  const page = await browser.launch()
  await page.goto(s.url)
  shared = { sb, s, page, base: 'http://127.0.0.1:' + s.port }
  return shared
}
test.after(async () => {
  if (!shared) return
  await shared.page.close()
  shared.s.child.kill()
  shared.sb.cleanup()
})

const READY = "window.__office3d && window.__office3d.info().podiums.filter((p) => p.character).length >= 9"
const cells = (page) => page.eval("window.__office3d.info().podiums.filter((p) => p.kind === 'desk').map((p) => p.id + ':' + p.cell.join(',')).sort()")

test('8 runs are 8 people at work (the implementer twice), each at a desk of its own with its own card; a pill never covers a head', { skip: SKIP || false }, async (t) => {
  if (await browser.skipWithout3d(t)) return
  const { page, base } = await world()
  await page.goto(base + '/?v=' + Date.now() + '#/office/engineering')
  if (!(await browser.ready3d(t, page, READY, 20000))) return
  await page.sleep(400) // a free person's pill fades out (0.2 s)
  const measure = () => page.eval(`(() => {
    const i = window.__office3d.info()
    // 1.2: only working and flagged people show a pill; a free or finished one waits out of sight until hovered or focused
    const quiet = (c) => c.classList.contains('tone-idle') && !c.classList.contains('sel') && !c.classList.contains('hov')
    // what a person sees: the pills not folded into a counter chip, and the chips (owner, 1.2)
    const seen = (c) => c.style.display !== 'none' && getComputedStyle(c).visibility !== 'hidden' && getComputedStyle(c).display !== 'none'
    const shown = [...document.querySelectorAll('.w3card')].filter((c) => seen(c) && !quiet(c)).concat([...document.querySelectorAll('.w3chip')].filter(seen))
    return {
      working: i.podiums.filter((p) => ['working', 'quiet'].includes(p.state)).map((p) => p.id).sort(),
      cells: i.podiums.filter((p) => p.cell).map((p) => p.cell.join(',')),
      cards: [...document.querySelectorAll('.w3card')].map((c) => c.dataset.anchor).sort(),
      ids: i.podiums.map((p) => p.id).sort(),
      portraits: document.querySelectorAll('.w3card .fr, .w3card svg:not(.ic svg)').length,
      pills: [...document.querySelectorAll('.w3card:not(.tray)')].map((c) => ({ id: c.dataset.anchor, dot: !!c.querySelector('.dot'), name: !!c.querySelector('b').textContent, word: !!c.title, lines: c.querySelectorAll('small').length })),
      // nothing hands in today here: the tray's count is not drawn, and no "0 …" label anywhere
      tray: (() => { const t = document.querySelector('.w3card.tray'); return t ? { off: t.classList.contains('off'), display: t.style.display } : null })(),
      zero: [...document.querySelectorAll('.w3card,.w3chip,.tray-label')].filter(seen).map((c) => c.textContent.trim()).filter((t) => /^0([^0-9]|$)/.test(t)),
      boxes: shown.map((c) => c.getBoundingClientRect()).map((r) => [r.left, r.top, r.right, r.bottom]),
      heads: i.heads.map((b) => [b.left, b.top, b.right, b.bottom]),
      quietSeen: [...document.querySelectorAll('.w3card')].filter((c) => c.style.display !== 'none' && quiet(c)).map((c) => getComputedStyle(c).opacity),
      idle: i.podiums.filter((p) => p.tone === 'idle').length,
    }
  })()`)
  // the boxes are read once two readings in a row agree to the pixel: on a
  // slow runner someone may still be walking to a desk, or a card settling
  const px = (g) => JSON.stringify([g.boxes, g.heads].map((l) => l.map((r) => r.map(Math.round))))
  let got = await measure()
  for (const end = Date.now() + (process.env.CI ? 60000 : 20000); Date.now() < end;) {
    await page.sleep(300)
    const again = await measure()
    const same = px(again) === px(got)
    got = again
    if (same) break
  }
  assert.deepEqual(got.working, ['architect', 'implementer', 'implementer#2', 'planner', 'refactorer', 'releaser', 'reviewer', 'tester'], 'the implementer works twice: two people')
  assert.equal(new Set(got.cells).size, got.cells.length, 'no two people share a desk')
  assert.deepEqual(got.cards, got.ids, 'one card per person, the second implementer included')
  assert.equal(got.portraits, 0, 'no portrait card is drawn over anyone')
  assert.ok(got.pills.length > 0 && got.pills.every((p) => p.dot && p.name && p.word && !p.lines), 'every person has one pill on one line: a dot and the name, the status word as its tooltip')
  assert.deepEqual(got.tray, { off: true, display: 'none' }, 'no report handed in: the tray shows no count')
  assert.deepEqual(got.zero, [], 'a zero count is never drawn')
  const hit = (a, b) => a[0] < b[2] - 1 && a[2] > b[0] + 1 && a[1] < b[3] - 1 && a[3] > b[1] + 1
  for (let i = 0; i < got.boxes.length; i++) for (let j = i + 1; j < got.boxes.length; j++) {
    const a = got.boxes[i], b = got.boxes[j]
    assert.ok(!hit(a, b), 'two pills overlap: ' + JSON.stringify([a, b]))
  }
  assert.ok(got.heads.length >= 9, 'every person has a head on the screen: ' + got.heads.length)
  let overHead = 0
  for (const a of got.boxes) for (const h of got.heads) if (hit(a, h)) overHead++
  assert.equal(overHead, 0, 'label boxes over a head (pills and counter chips): ' + JSON.stringify(got.boxes) + ' heads ' + JSON.stringify(got.heads))
  assert.ok(got.quietSeen.every((o) => o === '0'), 'a free or finished person shows no pill until hovered: ' + JSON.stringify(got.quietSeen))
})

test('a person keeps their desk while the page redraws; a third run of the same agent adds a person, nobody else moves', { skip: SKIP || false }, async (t) => {
  if (await browser.skipWithout3d(t)) return
  const { sb, page, base } = await world()
  await page.goto(base + '/?v=' + Date.now() + '#/office/engineering')
  if (!(await browser.ready3d(t, page, READY, 20000))) return
  const before = await cells(page)
  await page.sleep(3500) // two polls
  assert.deepEqual(await cells(page), before, 'nothing moved')
  const r = sb.cli('--start', JSON.stringify({ agent: 'implementer', task: 'a third run', project: 'ledger', model: 'sonnet', doing: 'reading A' }))
  assert.equal(r.code, 0, r.err)
  if (!(await browser.ready3d(t, page, "window.__office3d.info().podiums.some((p) => p.id === 'implementer#3')", process.env.CI ? 60000 : 15000))) return
  const after = await cells(page)
  assert.deepEqual(after.filter((c) => before.includes(c)), before, 'every desk kept its person')
  assert.equal(after.length, before.length + 1, 'and one person came')
})

test('the top bar fits at 1366 with every count showing, "Live" whole and nothing clipped', { skip: SKIP || false }, async () => {
  const { sb, page, base } = await world()
  // a run with no step for 40 minutes is "quiet": the fourth count chip
  const r = sb.cli('--start', JSON.stringify({ agent: 'helper', task: 'long wait', project: 'ledger', model: 'sonnet', startedAt: new Date(Date.now() - 40 * 60000).toISOString() }))
  assert.equal(r.code, 0, r.err)
  await page.goto(base + '/?v=' + Date.now() + '#/office/engineering')
  await page.screenshot(require('path').join(require('os').tmpdir(), 'office-layout-top.png'), 1366, 768)
  // 1.2: working, quiet and handed in are the status group; what waits for you is the count on the Decisions tab
  await page.waitFor("document.querySelectorAll('#counts li').length >= 3", 15000)
  const got = await page.eval(`(() => {
    const top = document.querySelector('header.top'), t = top.getBoundingClientRect()
    const live = document.getElementById('mode')
    return {
      overflow: top.scrollWidth - top.clientWidth,
      kids: [...top.children].map((c) => { const b = c.getBoundingClientRect(); return { id: c.id || c.className || c.tagName, r: b.right, l: b.left, own: c.scrollWidth - c.clientWidth } }),
      topRight: t.right, live: live.textContent.trim(), liveRight: live.getBoundingClientRect().right, vw: window.innerWidth,
      quiet: [...document.querySelectorAll('#counts li')].some((li) => /quiet/.test(li.textContent)),
      waiting: (DATA.gates || []).filter((g) => g.status === 'waiting').length, badge: document.getElementById('tc-appr').textContent,
      badgeRight: document.getElementById('tc-appr').getBoundingClientRect().right,
    }
  })()`)
  assert.ok(got.quiet, 'the quiet count shows')
  assert.equal(got.badge, got.waiting ? String(got.waiting) : '', 'the Decisions tab carries the waiting count')
  assert.ok(got.badgeRight <= got.vw, 'and it is whole inside the window')
  assert.ok(got.overflow <= 0, 'the header is not wider than the window: ' + JSON.stringify(got))
  for (const k of got.kids) assert.ok(k.r <= got.vw + 0.5 && k.own <= 1, 'header item ' + k.id + ' is whole inside the window: ' + JSON.stringify(k))
  assert.equal(got.live, 'Live')
  // 1.4: the bar is Campus, Plan, Live, Decisions, Team and More (Office is under More), all whole
  const bar = await page.eval(`(() => { const v = document.querySelector('.top .views'); const bs = [...v.querySelectorAll('button[data-view], button[data-omenu=legacy]')]; return { names: bs.map((b) => b.textContent.trim().replace(/\\s+/g, ' ')), whole: v.scrollWidth <= v.clientWidth + 1 && bs.every((b) => b.getBoundingClientRect().right <= window.innerWidth) } })()`)
  assert.deepEqual(bar.names.slice(0, 5), ['Campus', 'Plan', 'Live', 'Decisions', 'Team'])
  assert.equal(bar.names.length, 6)
  assert.match(bar.names[5], /\u25be$/, 'the sixth is the More menu (it names Office while the office is open)')
  assert.equal(bar.whole, true)
})
