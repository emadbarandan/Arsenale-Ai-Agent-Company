/* A headless Chrome or Edge driven over the DevTools protocol, with no
 * packages: Node's own WebSocket and the browser already on the machine.
 *
 * The dashboard pages draw themselves with script, so the only honest way to
 * see what a person sees is to run that script. Tests that use this skip
 * (they do not fail) on a machine with no Chromium-based browser, or a Node
 * without a global WebSocket (before v22).
 */
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')

const CANDIDATES = [
  process.env.CHROME_BIN,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
]

const findBrowser = () => CANDIDATES.find((p) => p && fs.existsSync(p)) || null

/** Why browser tests cannot run here, or '' when they can. */
function unavailable() {
  if (typeof WebSocket !== 'function') return 'this Node has no global WebSocket'
  if (!findBrowser()) return 'no Chrome or Edge found (set CHROME_BIN)'
  return ''
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function launch() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-company-browser-'))
  const child = spawn(findBrowser(), [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', '--user-data-dir=' + profile, '--window-size=1600,950', 'about:blank',
  ], { stdio: 'ignore' })
  const portFile = path.join(profile, 'DevToolsActivePort')
  let port = 0
  for (let i = 0; i < 100 && !port; i++) {
    try { port = Number(fs.readFileSync(portFile, 'utf8').split('\n')[0]) || 0 } catch { /* not written yet */ }
    if (!port) await sleep(100)
  }
  if (!port) { child.kill(); throw new Error('the browser did not open a DevTools port') }
  const list = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json()
  const target = list.find((t) => t.type === 'page')
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('DevTools socket failed')) })
  let id = 0
  const waiting = new Map()
  const listeners = []
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data)
    if (msg.id && waiting.has(msg.id)) { const w = waiting.get(msg.id); waiting.delete(msg.id); msg.error ? w.rej(new Error(msg.error.message)) : w.res(msg.result) } else for (const l of listeners) l(msg)
  }
  const send = (method, params) => new Promise((res, rej) => { const n = ++id; waiting.set(n, { res, rej }); ws.send(JSON.stringify({ id: n, method, params: params || {} })) })
  await send('Page.enable')
  await send('Runtime.enable')

  const api = {
    /** Open an address and wait for the load event and one second of drawing. */
    async goto(url) {
      const loaded = new Promise((res) => { const l = (msg) => { if (msg.method === 'Page.loadEventFired') { listeners.splice(listeners.indexOf(l), 1); res() } }; listeners.push(l) })
      await send('Page.navigate', { url })
      await loaded
      await sleep(1000)
    },
    /** Run an expression in the page; the value comes back as plain data. */
    async eval(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
      if (r.exceptionDetails) throw new Error('page error: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text))
      return r.result.value
    },
    /** The readable text once it stops changing: a slow machine finishes drawing later. */
    async readable() {
      let last = null
      for (let i = 0; i < 40; i++) {
        const now = await api.eval(READABLE)
        if (now === last) return now
        last = now
        await sleep(250)
      }
      return last
    },
    /** Wait until an expression is true in the page. */
    async waitFor(expr, ms) {
      const end = Date.now() + (ms || 8000)
      while (Date.now() < end) { if (await api.eval('!!(' + expr + ')')) return; await sleep(100) }
      throw new Error('the page never became: ' + expr)
    },
    sleep,
    /** The page at this size, as a PNG file. */
    async screenshot(file, width, height) {
      await send('Emulation.setDeviceMetricsOverride', { width: width || 1440, height: height || 900, deviceScaleFactor: 1, mobile: false })
      await sleep(900)
      const r = await send('Page.captureScreenshot', { format: 'png' })
      fs.writeFileSync(file, Buffer.from(r.data, 'base64'))
    },
    /** Messages the page wrote to its console, and CSP or script errors. */
    async logEvents() {
      await send('Log.enable')
      const seen = []
      listeners.push((msg) => { if (msg.method === 'Log.entryAdded' || msg.method === 'Runtime.exceptionThrown' || msg.method === 'Runtime.consoleAPICalled') seen.push(msg) })
      return seen
    },
    async close() {
      try { ws.close() } catch { /* already gone */ }
      child.kill()
      await sleep(300)
      try { fs.rmSync(profile, { recursive: true, force: true }) } catch { /* Windows may still hold the profile; the temp folder is cleaned later */ }
    },
  }
  return api
}

/** What a person can read on the page: every text, plus the words in tooltips,
 *  aria-labels, placeholders and the tab title. Script, style and the archive's
 *  decorative terminal prompt are not text for a person. */
const READABLE = `(() => {
  const out = []
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  while (w.nextNode()) {
    const n = w.currentNode, p = n.parentElement
    if (!p || /^(SCRIPT|STYLE)$/.test(p.tagName) || p.closest('.shell-prompt')) continue
    const t = n.nodeValue.trim()
    if (t) out.push(t)
  }
  document.querySelectorAll('[title],[aria-label],[placeholder],[alt]').forEach((e) => {
    for (const a of ['title', 'aria-label', 'placeholder', 'alt']) { const v = e.getAttribute(a); if (v) out.push(v) }
  })
  out.push(document.title)
  return out.join('\\n')
})()`

module.exports = { launch, unavailable, READABLE }
