#!/usr/bin/env node
/* Serves the dashboard live, on this machine only.
 *
 *   arsenale serve [--port 4310] [--no-open]      (the launcher, bin/arsenale.cjs)
 *   node tools/agent-dashboard-server.cjs [port]   (this file alone; opens nothing)
 *
 * The page asks for `api/state` every 1.5 seconds. The answer carries an ETag,
 * so while nothing changed on disk it is an empty 304; a changed state is sent
 * gzip-compressed when the browser accepts it. `/` is today's office; `/archive`
 * lists every run ever recorded.
 *
 * The page code is loaded again whenever one of its files changes on disk,
 * so an updated dashboard shows on the next reload without restarting this.
 *
 * Bound to 127.0.0.1 on purpose: run logs describe the user's work, and nothing
 * here should be reachable from the network.
 *
 * POST api/answer and POST api/dismiss: the user answers a waiting gate from
 * the rail, or closes it without an answer. The result is stored in the gate
 * file and appended to agent-runs/answers.jsonl; the supervising session reads
 * it from there (`arsenale log --answers`).
 *
 * GET api/company is the company (offices, budgets, spending), with an ETag.
 * POST api/budget sets a budget or switches budgets off; it writes only fixed
 * files under company/ and leaves a line in company/inbox.jsonl, which the
 * supervisor reads (`--inbox`).
 *
 * The 1.0 screens write through the same library as the CLI and the MCP
 * server (runlog.cjs and the modules next to it), always as the board: tasks
 * (api/task, api/task-comment), the team (api/team-member, api/hire-decision),
 * the safety rules (api/policy), office packs (api/pack, and api/pack-local
 * for a pack from a folder or a .zip), the first-start
 * wizard (api/onboard), "Connect your assistant" (api/connect-*), and phone
 * notifications (api/notify), the owner's offices (api/office, 1.2), and the
 * 1.1 data: api/live (read), api/automation, api/limits, api/resume,
 * api/alerts. GET /deliverables/<id> serves a stored copy of a
 * deliverable, only from Arsenale's own store, under a sandbox CSP.
 *
 * /mcp is the MCP server over HTTP, for clients that take only a URL. It is
 * off unless ARSENALE_MCP_TOKEN (32+ characters) is set when this starts, and
 * it needs that token as a bearer token on every request (mcp-server.cjs).
 *
 * This server never runs a command because of a request, and never starts a
 * process at all. Checks that keep other web pages and other accounts out:
 *   - the Host header must be this machine (no DNS rebinding);
 *   - every request but /favicon.ico and /mcp needs the owner's key cookie
 *     (launch-key.cjs): the browser opens /?k=<key> once, a good key is traded
 *     for the cookie and the address loses the key. Another account on this
 *     machine can reach 127.0.0.1 but cannot read the key file;
 *   - a POST also needs this server's Origin and the token put into the page
 *     it served (another site cannot read it);
 *   - every response forbids framing (X-Frame-Options, frame-ancestors), so a
 *     hostile page cannot overlay the gate buttons and borrow the user's clicks;
 *   - the HTML carries a Content-Security-Policy whose only allowed script is
 *     the page's own inline one, by a nonce made fresh for each response.
 */
const http = require('http')
const fs = require('fs')
const crypto = require('crypto')

const PARTS = ['./build-agent-dashboard.cjs', './agent-office-page.cjs', './dashboard-strings.cjs', './agent-company.cjs', './agent-company-page.cjs', './activity-page.cjs', './version-run-page.cjs', './everyone-page.cjs', './everyone-art.cjs', './office-world.cjs', './paths.cjs'].map((f) => require.resolve(f))
let stamp = ''
let page = null
function pages() {
  const now = PARTS.map((f) => { try { return fs.statSync(f).mtimeMs } catch { return 0 } }).join('|')
  if (!page || now !== stamp) {
    // paths.cjs is kept: the data folder of a running server does not move
    for (const f of PARTS.slice(0, -1)) delete require.cache[f]
    try {
      page = require(PARTS[0])
      stamp = now
    } catch (e) {
      // a file caught half-written: keep serving the last good version
      if (!page) throw e
    }
  }
  return page
}

const FRAME = { 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' }
const BARE_CSP = "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
const KEY_HELP = 'This dashboard opens only with its key. Run `arsenale open`, or open the address that `arsenale serve` printed.'
// Style attributes are drawn by the page's own script on every redraw, so
// style-src needs 'unsafe-inline'; scripts do not.
// Images may also come from this server's deliverable store, and from
// nowhere else on it (spec R-7.8). blob: is for the 3D office: the textures
// inside a character file someone drops on a desk are read through blob URLs
// the page makes itself (GLTFLoader), as images and by fetch.
const csp = (nonce, port) => "default-src 'none'; script-src 'nonce-" + nonce + "'; style-src 'unsafe-inline'; img-src data: blob: http://localhost:" + port + "/deliverables/ http://127.0.0.1:" + port + "/deliverables/ http://localhost:" + port + "/mascot/ http://127.0.0.1:" + port + "/mascot/; connect-src 'self' blob:; base-uri 'none'; form-action 'none'; object-src 'none'; frame-ancestors 'none'"

/** ?showcase=1 or 0 on a demo page; with neither, what the demo was started with. */
const showcaseAsked = (full, dflt) => { const q = new URLSearchParams(String(full).split('?')[1] || ''); return q.has('showcase') ? q.get('showcase') === '1' : dflt }

function start(opts = {}) {
  const port = Number(opts.port) || 4310
  // arsenale demo only: the showcase look for recordings (hides the dock, legends and notes); the real app never has it
  const DEMO = !!opts.demo, SHOWCASE = DEMO && !!opts.showcase
  const LK = require('./launch-key.cjs')
  const { key: KEY } = LK.ensure()
  const TOKEN = LK.pageToken(KEY)
  const SESSION = LK.sessionValue(KEY)
  const COOKIE = LK.cookieName(port)
  const HOSTS = ['127.0.0.1:' + port, 'localhost:' + port]
  const ORIGINS = HOSTS.map((h) => 'http://' + h)
  // One thread answers every page and agent: a request whose file is locked
  // waits with timers (withLockAsync) and briefly, and a lock taken deeper
  // down blocks for at most a second (store.cjs).
  const S = require('./store.cjs')
  S.configure({ syncWaitMs: 1000, asyncWaitMs: 5000 })
  const companyFiles = (...ks) => { try { const C = require('./agent-company.cjs'); return ks.map((k) => C.fileOf(k)).filter((f) => fs.existsSync(f)) } catch { return [] } }

  const sameToken = (given) => LK.same(given, TOKEN)
  const hasKey = (req) => {
    for (const part of String(req.headers.cookie || '').split(';')) {
      const i = part.indexOf('=')
      if (i > 0 && part.slice(0, i).trim() === COOKIE && LK.same(part.slice(i + 1).trim(), SESSION)) return true
    }
    return false
  }
  /** No key: JSON for the API, a short English page for the rest. */
  function noKey(res, url) {
    if (url.startsWith('/api/')) return sendJson(res, 401, { error: 'key' })
    const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    res.writeHead(401, Object.assign({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': BARE_CSP }, FRAME))
    res.end('<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Arsenale</title></head><body><p>' + esc(KEY_HELP) + '</p></body></html>')
  }

  function sendJson(res, code, body) {
    res.writeHead(code, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "frame-ancestors 'none'" }, FRAME))
    res.end(JSON.stringify(body))
  }

  /** A JSON body that may not have changed: 304 on a matching tag, else the
   *  body, gzipped when the client takes it and it is worth it. */
  function sendTagged(req, res, json, etag, gz) {
    const head = Object.assign({ 'Cache-Control': 'no-cache', ETag: etag, 'Content-Security-Policy': "frame-ancestors 'none'", Vary: 'Accept-Encoding' }, FRAME)
    if (String(req.headers['if-none-match'] || '') === etag) { res.writeHead(304, head); res.end(); return }
    head['Content-Type'] = 'application/json; charset=utf-8'
    if (json.length > 1024 && /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''))) {
      head['Content-Encoding'] = 'gzip'
      res.writeHead(200, head)
      res.end(gz())
      return
    }
    res.writeHead(200, head)
    res.end(json)
  }

  function postJson(req, res, handle, key, after, limit) {
    const max = limit || 8192
    if (!ORIGINS.includes(String(req.headers.origin || ''))) return sendJson(res, 403, { error: 'origin' })
    const site = req.headers['sec-fetch-site']
    if (site && site !== 'same-origin') return sendJson(res, 403, { error: 'origin' })
    if (!sameToken(req.headers['x-dashboard-token'])) return sendJson(res, 403, { error: 'token' })
    if (!/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) return sendJson(res, 415, { error: 'json only' })
    let size = 0
    const chunks = []
    let done = false
    req.on('data', (c) => {
      size += c.length
      if (size > max && !done) { done = true; sendJson(res, 413, { error: 'too large' }); req.destroy() }
      else chunks.push(c)
    })
    req.on('end', () => {
      if (done) return
      let body
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { return sendJson(res, 400, { error: 'bad json' }) }
      // `field`: the form field a refusal names (notify.cjs), for the page to mark
      const fault = (e) => sendJson(res, e.code >= 400 && e.code < 500 ? e.code : 500, e.field ? { error: e.message, field: String(e.field) } : { error: e.message })
      try {
        const out = handle(body)
        if (out && typeof out.then === 'function') return out.then((v) => { if (after) after(); sendJson(res, 200, { ok: true, [key || 'gate']: v }) }, fault)
        if (after) after()
        sendJson(res, 200, { ok: true, [key || 'gate']: out })
      } catch (e) { fault(e) }
    })
  }

  // the owner, through this page: the one actor this door ever writes as
  const L = require('./runlog.cjs')
  const BOARD = L.actorFor('dashboard', 'board')
  const mcpHttp = require('./mcp-server.cjs').httpTransport()
  // Board writes of the 1.0 screens: url -> [handler(body), body limit]
  const WRITES = {
    '/api/task': [(b) => { const T = require('./tasks.cjs'); return b.op === 'update' ? S.withLockAsync(T.lockFilesOf(b.id), () => T.updateTask(b, BOARD).task) : T.createTask(b, BOARD) }, 32768],
    '/api/task-comment': [(b) => require('./tasks.cjs').addComment(String(b.id || ''), b.text, BOARD)],
    '/api/team-member': [(b) => S.withLockAsync(companyFiles('employees'), () => {
      const Tm = require('./team.cjs')
      if (b.op === 'edit') return Tm.edit(b, BOARD)
      if (b.op === 'retire') return Tm.retire(String(b.id || ''), BOARD)
      if (b.op === 'unretire') return Tm.unretire(String(b.id || ''), BOARD)
      if (b.op === 'restore') return Tm.restore(String(b.id || ''), String(b.backup || ''), BOARD)
      if (b.op === 'preview') return { text: Tm.fileText(Tm.cleanForm(b)) }
      return Tm.hire(b, BOARD)
    }), 32768],
    '/api/hire-decision': [(b) => S.withLockAsync(companyFiles('employees'), () => require('./team.cjs').decideProposal(String(b.gate || ''), b.decision === 'decline' ? 'decline' : 'hire', b.edits, BOARD)), 32768],
    '/api/policy': [(b) => require('./policy.cjs').setPolicy(b, BOARD)],
    '/api/pack': [(b) => { const Pk = require('./packs.cjs'); return b.op === 'remove' ? Pk.uninstallPack(String(b.id || ''), BOARD, { keepEdited: b.keepEdited === true }) : b.op === 'update' ? Pk.updatePack(String(b.id || ''), BOARD) : Pk.installPack(String(b.id || ''), BOARD, { onConflict: b.onConflict }) }],
    // spec 1.2: a pack from a folder or a .zip, uploaded as its bytes (base64),
    // staged and checked, then installed on the owner's click (pack-local.cjs);
    // 1 MB of pack is about 1.4 MB of base64
    '/api/pack-local': [(b) => require('./pack-local.cjs').handle(b, BOARD), 2 * 1024 * 1024],
    '/api/onboard': [(b) => (b.op === 'preview' ? require('./onboard.cjs').preview(b) : require('./onboard.cjs').create(b, BOARD))],
    '/api/connect-preview': [(b) => require('./connect.cjs').preview(String(b.client || ''))],
    '/api/connect-apply': [(b) => require('./connect.cjs').apply(String(b.client || ''), String(b.hash || ''), BOARD)],
    '/api/mcp-forget': [(b) => require('./mcp-server.cjs').forgetClient(String(b.id || ''), BOARD)],
    '/api/notify': [(b) => require('./notify.cjs').configure(b, BOARD)],
    '/api/campus': [(b) => require('./campus.cjs').apply(b, BOARD, 'dashboard')],
    // spec 1.2: New office, Edit office, Archive (campus.cjs office, the owner only)
    '/api/office': [(b) => require('./campus.cjs').office(b, BOARD, 'dashboard')],
    // spec 1.1: the auto-run switch, the run limits, Resume / Dismiss of
    // unfinished work, and hiding a stalled run's alert
    '/api/automation': [(b) => require('./automation.cjs').set(b, BOARD)],
    '/api/limits': [(b) => require('./watch.cjs').setLimits(b, BOARD)],
    '/api/resume': [(b) => { const R = require('./resume.cjs'); return b.op === 'dismiss' ? R.dismiss(String(b.run || ''), BOARD) : R.resume(String(b.run || ''), BOARD) }],
    '/api/alerts': [(b) => require('./watch.cjs').dismiss(String(b.run || ''), BOARD)],
    // the Live buttons (Nudge, Stop, Clean) and Undo on the Decisions page
    '/api/run-action': [(b) => require('./liveactions.cjs').act(b, BOARD, pages().snapshot().state)],
    '/api/undo': [(b) => require('./autolog.cjs').undo(String(b.gate || ''), BOARD)],
  }
  const READS = {
    // the percent comes from the same place as the Live page (watch.live -> progress.overallPercent): the mirror file has no percent of its own
    '/api/version-runs': () => require('./version-run-page.cjs').withLive(require('./version-run-page.cjs').load(), require('./watch.cjs').live({ state: pages().snapshot().state }).versionRuns),
    '/api/tasks': () => ({ tasks: require('./tasks.cjs').listTasks() }),
    '/api/task': (q) => require('./tasks.cjs').getTask(q.get('id')),
    '/api/team': () => {
      const pol = require('./policy.cjs')
      const Pt = require('./paths.cjs')
      const policy = pol.readPolicy()
      const co = pages().snapshot().company()
      const files = Pt.agentFiles()
      const members = (co.configured ? co.employees : []).filter((e) => e.kind !== 'contractor').map((e) => Object.assign({}, e, { policy: pol.effective(e.id, policy), managedFile: !!(files.get(e.id) && require('path').dirname(files.get(e.id)) === Pt.MANAGED_AGENTS) }))
      return { members, categories: pol.CATEGORIES, policy, tierModels: Object.assign({ light: 'haiku', standard: 'sonnet', heavy: 'opus' }, Pt.CONFIG.tierModels || {}) }
    },
    '/api/member': (q) => require('./team.cjs').member(q.get('id')),
    '/api/policy': () => { const pol = require('./policy.cjs'); return { policy: pol.readPolicy(), categories: pol.CATEGORIES } },
    '/api/packs': () => ({ packs: require('./packs.cjs').listPacks(), local: require('./packs.cjs').listLocal() }),
    '/api/deliverables': () => ({ deliverables: require('./deliverables.cjs').listDeliverables(), store: require('./deliverables.cjs').storeSize() }),
    '/api/connect': () => {
      const C = require('./connect.cjs')
      const M = require('./mcp-server.cjs')
      return { cards: C.CLIENTS.map((c) => C.card(c)), clients: M.listClients(), customInstructions: C.CUSTOM_INSTRUCTIONS, http: { on: !!M.httpToken(), url: 'http://127.0.0.1:' + port + '/mcp' } }
    },
    '/api/onboard': () => Object.assign(require('./onboard.cjs').status(), { packs: require('./packs.cjs').listPacks(), home: require('./paths.cjs').HOME }),
    '/api/notify': () => require('./notify.cjs').publicState(),
    '/api/live': () => require('./watch.cjs').live({ state: pages().snapshot().state }),
    '/api/automation': () => require('./automation.cjs').read(),
    '/api/run-actions': () => require('./liveactions.cjs').view(pages().snapshot().state),
    '/api/auto-log': () => require('./autolog.cjs').log(),
  }

  const server = http.createServer((req, res) => {
    const full = req.url || '/'
    const url = full.split('?')[0]
    // a page on another site that points a DNS name at 127.0.0.1 arrives with
    // its own host name here, and gets nothing
    if (!HOSTS.includes(String(req.headers.host || ''))) {
      res.writeHead(421, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, FRAME))
      res.end('use http://localhost:' + port)
      return
    }
    // the key from the address: traded for the cookie, then the same address
    // without it, so it stays out of the history. A wrong key gets nothing.
    const query = new URLSearchParams(full.split('?')[1] || '')
    if (query.has('k') && (req.method === 'GET' || req.method === 'HEAD') && LK.same(query.get('k'), KEY)) {
      query.delete('k')
      const rest = query.toString()
      res.writeHead(302, Object.assign({
        Location: url + (rest ? '?' + rest : ''), 'Cache-Control': 'no-store',
        'Set-Cookie': COOKIE + '=' + SESSION + '; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000',
      }, FRAME))
      res.end()
      return
    }
    // /mcp has its own bearer token (mcp-server.cjs)
    if (url !== '/favicon.ico' && url !== '/mcp' && !hasKey(req)) return noKey(res, url)
    try {
      const B = pages()
      const { renderPage, renderArchive, answerGate, dismissGate } = B
      const fresh = () => B.invalidate()
      // English only: ?lang= and the old `dash-lang` cookie are not read (tools/dashboard-strings.cjs)
      const lang = 'en'
      if (url === '/api/answer' || url === '/api/dismiss') {
        if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST only' })
        const act = url === '/api/answer' ? answerGate : dismissGate
        return postJson(req, res, (body) => {
          const id = String(body.gate || '')
          // A hire proposal approved from the rail must hire, not just record
          // "approve": the same call as the Approvals screen's buttons.
          const hire = (() => { try { const g = JSON.parse(fs.readFileSync(require('path').join(require('./paths.cjs').GATES, id.replace(/[^\w.-]/g, '') + '.json'), 'utf8')); return g.approvalType === 'hire' && g.status === 'waiting' } catch { return false } })()
          if (hire && url === '/api/answer') return require('./team.cjs').decideProposal(id, String(body.answer) === 'approve' ? 'hire' : 'decline', null, BOARD).gate
          // the gate's lock, waited for with timers (answerGate takes it again inside)
          const gateFile = require('path').join(require('./paths.cjs').GATES, id.replace(/[^\w.-]/g, '') + '.json')
          return S.withLockAsync(fs.existsSync(gateFile) ? [gateFile] : [], () => (url === '/api/answer' ? act(id, String(body.answer || ''), body.hash !== undefined ? { hash: String(body.hash) } : undefined) : act(id)))
        }, 'gate', fresh)
      }
      if (url === '/api/budget') {
        if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST only' })
        const C = require('./agent-company.cjs')
        return postJson(req, res, (body) => S.withLockAsync(companyFiles('company', 'offices', 'employees'), () => {
          const scope = String(body.scope || '')
          if (scope === 'master') return C.setBudgetsEnabled(body.enabled === true, 'board', 'dashboard')
          // ids end up compared with file contents, never used as a path; one
          // that changes when cleaned is refused rather than guessed at
          const id = String(body.id == null ? '' : body.id)
          if (id !== id.replace(/[^\w.-]/g, '')) { const e = new Error('bad id'); e.code = 400; throw e }
          return C.setBudget({ scope, id, budget: body.budget === undefined ? {} : body.budget, by: 'board' }, 'dashboard')
        }), 'saved', fresh)
      }
      if (url === '/mcp') return mcpHttp.handle(req, res, ORIGINS)
      if (Object.hasOwn(WRITES, url) && req.method === 'POST') {
        const [handle, limit] = WRITES[url]
        return postJson(req, res, handle, 'result', fresh, limit)
      }
      if (url === '/favicon.ico') { res.writeHead(204, FRAME); res.end(); return }
      if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'GET only' })
      if (url === '/api/company') {
        const s = B.snapshot()
        if (!s.companyJson) {
          s.companyJson = JSON.stringify(s.company())
          s.companyTag = require('./agent-company.cjs').etagOf(s.companyJson)
        }
        return sendTagged(req, res, s.companyJson, s.companyTag, () => s.companyGz || (s.companyGz = require('zlib').gzipSync(s.companyJson)))
      }
      if (Object.hasOwn(READS, url)) {
        try { return sendJson(res, 200, READS[url](new URLSearchParams(full.split('?')[1] || ''))) } catch (e) { return sendJson(res, e.code >= 400 && e.code < 500 ? e.code : 500, { error: e.message }) }
      }
      // A stored deliverable: only Arsenale's own copy, never the original
      // path; sandboxed, never sniffed, and downloaded unless it is an image,
      // text or a PDF (spec R-7.8).
      const dl = /^\/deliverables\/(dl-[\w-]+)$/.exec(url)
      if (dl) {
        const b = require('./deliverables.cjs').blobFor(dl[1])
        if (!b) { res.writeHead(404, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, FRAME)); res.end('nothing here'); return }
        res.writeHead(200, Object.assign({}, FRAME, {
          'Content-Type': b.mime, 'Content-Security-Policy': "sandbox; default-src 'none'", 'Cache-Control': 'no-store',
          'Content-Disposition': (b.inline ? 'inline' : 'attachment') + '; filename="' + b.name.replace(/"/g, '') + '"',
        }))
        fs.createReadStream(b.file).pipe(res)
        return
      }
      if (url === '/api/state') {
        const s = B.snapshot()
        return sendTagged(req, res, s.json, s.etag, s.gzip)
      }
      if (url === '/' || url === '/index.html' || url === '/archive') {
        const s = B.snapshot()
        const nonce = crypto.randomBytes(16).toString('base64')
        const html = url === '/archive'
          ? renderArchive(s.state, { live: true, lang })
          : renderPage(s.state, { live: true, token: TOKEN, lang, company: s.company(), demo: DEMO, showcase: DEMO && showcaseAsked(full, SHOWCASE) })
        res.writeHead(200, Object.assign({
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'Content-Security-Policy': csp(nonce, port),
        }, FRAME))
        res.end(html.replace(/<script>/g, '<script nonce="' + nonce + '">'))
        return
      }
      // Help: the user guide, read from docs/guide/src only when someone opens it
      if (url === '/help' && (req.method === 'GET' || req.method === 'HEAD')) {
        const nonce = crypto.randomBytes(16).toString('base64')
        res.writeHead(200, Object.assign({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': csp(nonce, port).replace('img-src ', "img-src 'self' ") }, FRAME))
        res.end(require('./help-page.cjs').render('help'))
        return
      }
      if (url.startsWith('/help/img/') && (req.method === 'GET' || req.method === 'HEAD')) {
        const p = require('./help-page.cjs').imagePath(url.slice('/help/img/'.length))
        if (p) { res.writeHead(200, Object.assign({ 'Content-Type': 'image/png', 'Cache-Control': 'no-store' }, FRAME)); fs.createReadStream(p).pipe(res); return }
      }
      // the mascot of the empty, loading, success, help and idle states (pages/stage/identity.cjs): fixed names
      const mascot = /^\/mascot\/(empty|loading|cheer|wave|coffee)\.gif$/.exec(url)
      if (mascot) {
        res.writeHead(200, Object.assign({ 'Content-Type': 'image/gif', 'Cache-Control': 'max-age=86400', 'X-Content-Type-Options': 'nosniff' }, FRAME))
        fs.createReadStream(require('path').join(__dirname, 'pages', 'stage', 'identity', 'mascot', mascot[1] + '.gif')).pipe(res)
        return
      }
      res.writeHead(404, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, FRAME))
      res.end('nothing here')
    } catch (e) {
      // A single unreadable record must not take the page down.
      res.writeHead(500, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, FRAME))
      res.end('error: ' + e.message)
    }
  })

  return new Promise((resolve, reject) => {
    server.on('error', (e) => {
      if (e.code === 'EADDRINUSE') e.message = 'Port ' + port + ' is taken: either the dashboard is already open there, or give another port with --port.'
      reject(e)
    })
    server.listen(port, '127.0.0.1', () => {
      // phone replies come back over outbound polls, and only while a channel is on
      const stopNotify = require('./notify.cjs').startLoop()
      server.on('close', stopNotify)
      // stalled and dead runs: checked now and every 30 s (watch.cjs); it
      // reads and writes records only, and never starts or stops a process
      // its new alerts go to the phone channels that are on (notify.onEvents,
      // outbound only, in the background: a slow service never holds a tick)
      const stopWatch = require('./watch.cjs').startLoop({ after: () => { try { pages().invalidate() } catch { /* next read rebuilds */ } }, onEvents: (evs) => { require('./notify.cjs').onEvents(evs) } })
      server.on('close', stopWatch)
      // the first start of 1.0 writes the safety defaults (spec 7, Migration)
      try { require('./policy.cjs').ensureDefaults('dashboard') } catch { /* read-only folder: every category reads as ask anyway */ }
      // a writer killed between its temp file and the rename left the temp behind
      try { const Pt = require('./paths.cjs'); require('./store.cjs').cleanStray([Pt.RUNS, Pt.ACTIVE, Pt.GATES, Pt.DECISIONS, Pt.VERSION_RUNS, Pt.COMPANY, require('path').join(Pt.HOME, 'alerts'), require('path').join(Pt.HOME, 'test-queue'), require('path').join(Pt.HOME, 'test-queue', 'waiting'), require('path').join(Pt.HOME, 'resume'), require('path').join(Pt.HOME, 'settings'), require('path').join(Pt.COMPANY, 'issues')]) } catch { /* nothing to clean */ }
      // a pack review closed without Install, or cut off by a restart
      try { require('./pack-local.cjs').cleanStaging() } catch { /* nothing staged */ }
      const url = 'http://localhost:' + port + '/'
      resolve({ server, port, url, keyUrl: url + '?k=' + KEY })
    })
  })
}

module.exports = { start }

if (require.main === module) {
  start({ port: Number(process.argv[2]) || 4310 }).then(({ keyUrl }) => {
    console.log('Arsenale dashboard: ' + keyUrl + '   (Ctrl+C to stop)')
  }, (e) => { console.error(e.message); process.exit(1) })
}
