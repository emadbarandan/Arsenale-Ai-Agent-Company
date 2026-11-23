/* S5 Savings page in a real browser (spec 1.3 section 10): the empty state,
 * "n/a" with the owner's price button, partly priced, suggestions with
 * "est." and an inline "Why?", and 375 px with no horizontal scroll. With no
 * Chromium-based browser the tests skip. */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')
const os = require('os')
const { makeSandbox, startServer } = require('./helpers.cjs')
const browser = require('./browser.cjs')

const SKIP = browser.unavailable()
const PRICE = { input: 4, output: 20, cacheRead: 0.2, cacheWrite5m: 5, cacheWrite1h: 8 }
const rec = (sb, agent, model, extra) => sb.run(Object.assign({ agent, model, project: 'ledger', kind: 'build', finishedAt: new Date(Date.now() - 3600000).toISOString(), startedAt: new Date(Date.now() - 4000000).toISOString(), tokens: 530000, usage: { tokens: 530000, inputTokens: 100000, outputTokens: 20000, cacheReadTokens: 400000, cacheWriteTokens: 10000 } }, extra || {}))

async function open(t, sb, hash) {
  const s = await startServer(sb, { portBase: 46100 }); t.after(() => s.child.kill())
  const page = await browser.launch(); t.after(() => page.close())
  await page.goto(s.url)
  await page.goto('http://127.0.0.1:' + s.port + '/?v=' + Date.now() + '#/savings')
  await page.waitFor("document.querySelector('#v-sav .sv')", 15000)
  return page
}
const text = (page) => page.eval("document.getElementById('v-sav').innerText")
const noScroll = (page) => page.eval('document.documentElement.scrollWidth <= window.innerWidth && document.body.scrollWidth <= window.innerWidth && (() => { const v = document.getElementById("v-sav"); return v.scrollWidth <= v.clientWidth + 1 })()')

test('S5-UI-1: no finished runs shows the empty state with a link to Settings', { skip: SKIP || false }, async (t) => {
  const sb = makeSandbox(); t.after(() => sb.cleanup())
  const page = await open(t, sb)
  assert.match(await text(page), /No runs logged yet\. Savings start with your first logged runs\./)
  assert.match(await text(page), /Connect your assistant/)
})

test('S5-UI-2: runs without prices read n/a and offer the price button; suggestions say est. and Why? opens inline', { skip: SKIP || false }, async (t) => {
  const sb = makeSandbox(); t.after(() => sb.cleanup())
  rec(sb, 'builder', 'Opus 5.5'); rec(sb, 'fixer', 'Opus 5.5'); rec(sb, 'scanner', 'Opus 5.5', { tier: 'light', kind: 'ops' })
  const page = await open(t, sb)
  const s = await text(page)
  assert.match(s, /Prices are not set/)
  assert.match(s, /Use list prices \(Anthropic, fetched 2026-11-18\)/)
  assert.match(s, /n\/a/)
  assert.doesNotMatch(s, /\$0\.00/)
  assert.match(s, /builder: 1 run, R2/)
  assert.equal(await page.eval("document.querySelectorAll('#v-sav [data-sav-why]').length"), 3)
  await page.eval("document.querySelector('#v-sav [data-sav-why]').click(); 1")
  await page.waitFor("document.querySelector('#v-sav .why')", 5000)
  assert.match(await text(page), /ATB-1 was a lite run/)
  assert.equal(await page.eval("!!document.querySelector('.cdlg-back:not([hidden])')"), false, 'inline, not a pop-over')
})

test('S5-UI-3: partly priced shows a lower bound with the unpriced model; every suggestion amount says est.; 375 px has no horizontal scroll', { skip: SKIP || false }, async (t) => {
  const sb = makeSandbox({ prices: { 'Opus 5.5': PRICE } }); t.after(() => sb.cleanup())
  rec(sb, 'builder', 'Opus 5.5'); rec(sb, 'fixer', 'Opus 5.5'); rec(sb, 'scanner', 'Opus 5.5', { tier: 'light', kind: 'ops' })
  rec(sb, 'tester', 'Gizmo 9', { kind: 'verify' }); rec(sb, 'writer', 'Sonnet 5.5', { kind: 'docs' })
  const page = await open(t, sb)
  const s = await text(page)
  assert.match(s, /≥ \$[\d.]+\s+2 of 5 runs unpriced/)
  assert.match(s, /Unpriced models: Gizmo 9, Sonnet 5\.5/)
  const amounts = await page.eval("[...document.querySelectorAll('#v-sav td[data-l=Saving]')].map((e) => e.innerText)")
  assert.ok(amounts.length >= 3)
  for (const a of amounts) assert.match(a, /est\.|n\/a|no saving/)
  await page.screenshot(path.join(os.tmpdir(), 'savings-1440.png'), 1440, 900)
  assert.equal(await noScroll(page), true, 'no horizontal scroll at 1440')
  await page.screenshot(path.join(os.tmpdir(), 'savings-375.png'), 375, 812)
  assert.equal(await noScroll(page), true, 'no horizontal scroll at 375')
  await page.eval("document.querySelector('#v-sav [data-sav-why]').click(); 1")
  await page.waitFor("document.querySelector('#v-sav .why')", 5000)
  assert.equal(await noScroll(page), true, 'no horizontal scroll at 375 with Why? open')
})
