/* Notifications and phone approvals. EXPERIMENTAL: the phone channels depend
 * on outside services Arsenale does not run.
 *
 * Desktop notifications are not here: the dashboard page raises them with the
 * browser's Notification API while a tab is open (there is no desktop app).
 *
 * Phone channels, each off until the owner turns it on in Settings, each
 * outbound only (no port is opened, nothing listens):
 *   ntfy      notify; in details mode, Approve/Decline buttons that publish a
 *             signed token to a second, random reply topic, which the
 *             dashboard server polls
 *   Telegram  notify; in details mode, inline buttons whose callback is a
 *             short id of a pending record holding the signed token. Pairing
 *             is a deep link t.me/<bot>?start=<128-bit token>, single use,
 *             10 minutes, from a private chat only; 5 wrong tokens close the
 *             window. Afterwards only the paired person (from.id) in the
 *             paired chat is listened to: a group could tap for the owner
 *   Pushover  notify only
 *   Email     not built (it needs an SMTP client; help wanted, CONTRIBUTING.md)
 *
 * Secrets come ONLY from environment variables, never from a file:
 *   ARSENALE_PHONE_KEY        32+ characters; signs the buttons (HMAC-SHA256)
 *   ARSENALE_NTFY_TOKEN       optional, for a protected ntfy server
 *   ARSENALE_TELEGRAM_TOKEN   the bot token from BotFather
 *   ARSENALE_PUSHOVER_TOKEN, ARSENALE_PUSHOVER_USER
 * The signing key actually used is HMAC(ARSENALE_PHONE_KEY, epoch), where the
 * epoch is a random value in notify/config.json: "Sign out all phones" and
 * turning a channel off draw a new epoch, so every button already sent dies.
 *
 * A button is accepted only if: the signature is good; it has not expired
 * (default 30 minutes); its nonce was never used; the question is still
 * waiting; and the question's text, choices and time are unchanged. The first
 * valid tap wins. Only action approvals the safety rules let a phone approve
 * and choice questions get buttons (eligible below); a payment, a hire or a
 * plain yes/no question never does (owner's decision): the phone says to
 * open Arsenale on the computer. Deliverables, paths, run
 * steps and task text never leave the machine.
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const P = require('./paths.cjs')
const { writeAtomic } = require('./build-agent-dashboard.cjs')
const { fail, requireBoard, clipCp, actorFor } = require('./runlog.cjs')

const DIR = path.join(P.HOME, 'notify')
const CONFIG = path.join(DIR, 'config.json')
const NONCES = path.join(DIR, 'used-nonces.jsonl')
const PENDING = path.join(DIR, 'pending')
const CHANNELS = ['ntfy', 'telegram', 'pushover']

const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64u = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64')
const rand = (n) => crypto.randomBytes(n)
const base32 = (buf) => { const A = 'abcdefghijklmnopqrstuvwxyz234567'; let bits = 0, v = 0, out = ''; for (const b of buf) { v = (v << 8) | b; bits += 8; while (bits >= 5) { out += A[(v >>> (bits - 5)) & 31]; bits -= 5 } } if (bits) out += A[(v << (5 - bits)) & 31]; return out }

function readConfig() {
  let c = null
  try { c = JSON.parse(fs.readFileSync(CONFIG, 'utf8')) } catch { /* defaults */ }
  const d = { schemaVersion: 1, epoch: '', expiryMin: 30, ntfy: { enabled: false, server: 'https://ntfy.sh', topic: '', replyTopic: '', details: false, testedAt: '', lastSentAt: '', lastDecisionAt: '', invalidToday: 0, invalidDay: '' }, telegram: { enabled: false, details: false, chatId: '', userId: '', userName: '', pair: null, testedAt: '', lastSentAt: '', lastDecisionAt: '', invalidToday: 0, invalidDay: '', offset: 0 }, pushover: { enabled: false, details: false, testedAt: '', lastSentAt: '' } }
  if (!c || typeof c !== 'object') return d
  const out = Object.assign(d, { epoch: String(c.epoch || ''), expiryMin: Number.isInteger(c.expiryMin) && c.expiryMin >= 5 && c.expiryMin <= 1440 ? c.expiryMin : 30 })
  for (const ch of CHANNELS) if (c[ch] && typeof c[ch] === 'object') out[ch] = Object.assign(d[ch], c[ch])
  return out
}
function saveConfig(c) { fs.mkdirSync(DIR, { recursive: true }); writeAtomic(CONFIG, JSON.stringify(c, null, 2)) }

/** The signing key, or '' when the owner set no ARSENALE_PHONE_KEY. */
function signingKey(cfg) {
  const base = String(process.env.ARSENALE_PHONE_KEY || '')
  if (base.length < 32) return ''
  const c = cfg || readConfig()
  if (!c.epoch) return ''
  return crypto.createHmac('sha256', base).update('arsenale-phone|' + c.epoch).digest()
}
/** A new epoch: every button already sent stops working (R-8.11). */
function rotate(cfg) {
  const c = cfg || readConfig()
  c.epoch = b64u(rand(16))
  saveConfig(c)
  return c
}

/** What a button must still match when it comes back: the question, its
 *  choices and when it was asked. A gate edited after sending fails this. */
const questionHash = (g) => crypto.createHash('sha256').update(JSON.stringify([String(g.question || ''), Array.isArray(g.choices) ? g.choices : [], String(g.askedAt || '')])).digest('hex').slice(0, 32)

function readGate(id) {
  try { return JSON.parse(fs.readFileSync(path.join(P.GATES, String(id).replace(/[^\w.-]/g, '') + '.json'), 'utf8')) } catch { return null }
}

/** A signed decision: gate, decision (approve, decline or a choice index),
 *  expiry, a 128-bit nonce and the question hash. */
function sign(gate, decision, opts) {
  const c = (opts && opts.cfg) || readConfig()
  const key = signingKey(c)
  if (!key) throw fail(409, 'Phone approvals need ARSENALE_PHONE_KEY (32+ characters) in the environment of the dashboard')
  const now = (opts && opts.now) || Date.now()
  const body = { g: gate.id, d: String(decision), e: now + c.expiryMin * 60000, n: b64u(rand(16)), q: questionHash(gate) }
  const payload = b64u(JSON.stringify(body))
  return payload + '.' + b64u(crypto.createHmac('sha256', key).update(payload).digest())
}

function nonceUsed(n) {
  let text = ''
  try { text = fs.readFileSync(NONCES, 'utf8') } catch { return false }
  return text.split('\n').some((l) => { try { return JSON.parse(l).n === n } catch { return false } })
}
function useNonce(n, exp) {
  fs.mkdirSync(DIR, { recursive: true })
  // entries are kept until a day after they expire, then dropped
  let keep = []
  try { keep = fs.readFileSync(NONCES, 'utf8').split('\n').filter((l) => { try { return JSON.parse(l).x > Date.now() - 86400000 } catch { return false } }) } catch { /* new file */ }
  keep.push(JSON.stringify({ n, x: exp }))
  writeAtomic(NONCES, keep.join('\n') + '\n')
}

/** Checks a token and, when it is good, answers the question as the owner,
 *  through the same library call as the dashboard (R-8.6). Returns
 *  { ok, reason, message } where message is what the phone is told. */
function accept(token, channel, opts) {
  const c = readConfig()
  const key = signingKey(c)
  const bad = (reason, message) => { noteInvalid(channel, reason); return { ok: false, reason, message } }
  if (!key) return bad('off', 'Phone approvals are off; open Arsenale to answer')
  const parts = String(token || '').split('.')
  if (parts.length !== 2) return bad('format', '')
  const mac = b64u(crypto.createHmac('sha256', key).update(parts[0]).digest())
  const given = Buffer.from(parts[1]), want = Buffer.from(mac)
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return bad('signature', '')
  let body
  try { body = JSON.parse(unb64u(parts[0]).toString('utf8')) } catch { return bad('format', '') }
  const now = (opts && opts.now) || Date.now()
  if (!(Number(body.e) > now)) return { ok: false, reason: 'expired', message: 'This request expired; open Arsenale to answer' }
  if (nonceUsed(body.n)) {
    const g = readGate(body.g)
    return { ok: false, reason: 'used', message: g && g.status === 'answered' ? 'Already answered at ' + String(g.answeredAt || '').slice(11, 16) : 'Already used' }
  }
  const g = readGate(body.g)
  if (!g) return bad('gate', '')
  if (g.status !== 'waiting') { useNonce(body.n, body.e); return { ok: false, reason: 'answered', message: 'Already answered at ' + String(g.answeredAt || g.expiredAt || '').slice(11, 16) } }
  if (questionHash(g) !== body.q) return { ok: false, reason: 'changed', message: 'This question changed since it was sent; open Arsenale to answer' }
  if (!eligible(g, c).buttons) return { ok: false, reason: 'not-eligible', message: 'Open Arsenale on your computer to answer this' }
  let answer
  if (g.kind === 'approval') { if (body.d !== 'approve' && body.d !== 'decline') return bad('format', ''); answer = body.d }
  else { const i = Number(body.d); if (!Number.isInteger(i) || !g.choices[i]) return bad('format', ''); answer = g.choices[i] }
  useNonce(body.n, body.e)
  const L = require('./runlog.cjs')
  const actor = actorFor('phone', 'board', { via: 'phone:' + channel })
  const saved = L.answer(g.id, answer, actor, { via: 'phone:' + channel })
  try { require('./agent-company.cjs').activity({ actor: 'board', action: 'phone.decision', entityType: 'gate', entityId: g.id, summary: answer + ' from the phone (' + channel + '): ' + clipCp(g.label || g.question, 120), via: 'phone:' + channel }) } catch { /* no company */ }
  const ch = c[channel]
  if (ch) { ch.lastDecisionAt = new Date().toISOString(); saveConfig(c) }
  return { ok: true, gate: saved, message: (answer === 'approve' ? 'Approved' : answer === 'decline' ? 'Declined' : 'Answered "' + answer + '"') + ': ' + clipCp(g.label || g.question, 120) }
}

function noteInvalid(channel, reason) {
  try {
    const c = readConfig()
    const ch = c[channel]
    if (!ch) return
    const day = new Date().toISOString().slice(0, 10)
    if (ch.invalidDay !== day) { ch.invalidDay = day; ch.invalidToday = 0 }
    ch.invalidToday++
    saveConfig(c)
    require('./agent-company.cjs').activity({ actor: 'system', action: 'phone.invalid', entityType: 'channel', entityId: channel, summary: 'ignored an invalid message on ' + channel + ' (' + reason + ')', via: 'phone:' + channel })
  } catch { /* best effort */ }
}

/** Whether a question may get buttons on the phone (R-8.4): an action
 *  approval (check_action) whose category the safety rules let a phone
 *  approve, and a choice with 2 to 4 options. Never a payment, a hire (its
 *  Approve must hire, which only the dashboard does) or a plain yes/no
 *  question, whose text can say anything ("pay invoice 1042?") with no
 *  category behind it. */
function eligible(g, cfg) {
  const cat = g.action && g.action.category
  if (cat === 'payment') return { buttons: false, why: 'payment' }
  if (g.kind === 'approval') {
    if (g.approvalType !== 'action' || !cat) return { buttons: false, why: 'desktop-only' }
    const pol = require('./policy.cjs').readPolicy()
    return pol.phoneAllowed[cat] === true ? { buttons: true } : { buttons: false, why: 'desktop-only' }
  }
  if (g.kind === 'B' && !g.approvalType && Array.isArray(g.choices) && g.choices.length >= 2 && g.choices.length <= 4) return { buttons: true }
  return { buttons: false, why: 'kind' }
}

/** The phone message for one question, in the channel's mode (R-8.3). */
function message(g, channel, cfg) {
  const c = cfg || readConfig()
  const details = !!(c[channel] && c[channel].details)
  const co = require('./agent-company.cjs').readCompany()
  const office = co.configured && g.officeId ? (co.offices.find((o) => o.id === g.officeId) || {}).name : ''
  const waiting = (() => { try { return fs.readdirSync(P.GATES).map((n) => { try { return JSON.parse(fs.readFileSync(path.join(P.GATES, n), 'utf8')) } catch { return null } }).filter((x) => x && x.status === 'waiting').length } catch { return 1 } })()
  if (!details) return { title: 'Arsenale', text: 'Arsenale: ' + waiting + ' question' + (waiting === 1 ? '' : 's') + ' waiting' + (office ? ' (' + office + ')' : ''), buttons: [] }
  const el = eligible(g, c)
  const q = clipCp(String(g.question || ''), 300)
  const text = Array.from(q).length >= 300 ? q.replace(/.$/u, '…') : q
  const lines = [text]
  if (g.action && g.action.category) lines.push(g.action.category + (g.action.target ? ' · ' + clipCp(g.action.target, 80) : ''))
  if (office) lines.push(office)
  if (!el.buttons) lines.push(el.why === 'payment' ? 'Open Arsenale on your computer to approve payments' : 'Open Arsenale to answer')
  let buttons = []
  if (el.buttons) {
    buttons = g.kind === 'approval'
      ? [{ label: 'Approve', decision: 'approve' }, { label: 'Decline', decision: 'decline' }]
      : g.choices.map((ch, i) => ({ label: clipCp(ch, 30), decision: String(i) }))
  }
  return { title: 'Arsenale question', text: lines.join('\n'), buttons }
}

// ---------- the network, outbound only
function request(method, url, body, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && /^(127\.0\.0\.1|localhost)$/.test(u.hostname))) return reject(new Error('only https (or a server on this computer) is allowed'))
    const mod = require(u.protocol === 'https:' ? 'https' : 'http')
    const data = body === undefined ? null : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))
    const r = mod.request(u, { method, headers: Object.assign(data ? { 'Content-Length': data.length } : {}, headers || {}), timeout: 40000 }, (res) => {
      const chunks = []
      res.on('data', (c) => { if (chunks.reduce((n, x) => n + x.length, 0) < 1024 * 1024) chunks.push(c) })
      res.on('end', () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString('utf8') }))
    })
    r.on('timeout', () => r.destroy(new Error('timeout')))
    r.on('error', reject)
    if (data) r.write(data)
    r.end()
  })
}
const ntfyAuth = () => (process.env.ARSENALE_NTFY_TOKEN ? { Authorization: 'Bearer ' + process.env.ARSENALE_NTFY_TOKEN } : {})

async function sendNtfy(c, msg, gate) {
  const n = c.ntfy
  const actions = msg.buttons.map((b) => ({ action: 'http', label: b.label, url: n.server.replace(/\/+$/, '') + '/' + n.replyTopic, method: 'POST', body: sign(gate, b.decision, { cfg: c }), clear: true }))
  const r = await request('POST', n.server.replace(/\/+$/, '') + '/', { topic: n.topic, title: msg.title, message: msg.text, actions: actions.length ? actions : undefined }, Object.assign({ 'Content-Type': 'application/json' }, ntfyAuth()))
  if (r.status >= 300) throw new Error('ntfy answered ' + r.status)
}
async function sendTelegram(c, msg, gate) {
  const tok = String(process.env.ARSENALE_TELEGRAM_TOKEN || '')
  // a chat paired by the old six-digit code has no person: it pairs again
  if (!tok || !c.telegram.chatId || !c.telegram.userId) throw new Error('Telegram is not paired')
  let markup
  if (msg.buttons.length) {
    // callback_data is short: an id of a pending record that holds the token
    fs.mkdirSync(PENDING, { recursive: true })
    markup = { inline_keyboard: [msg.buttons.map((b) => { const id = b64u(rand(9)); writeAtomic(path.join(PENDING, id + '.json'), JSON.stringify({ token: sign(gate, b.decision, { cfg: c }), at: Date.now() })); return { text: b.label, callback_data: 'a:' + id } })] }
  }
  const r = await request('POST', 'https://api.telegram.org/bot' + tok + '/sendMessage', { chat_id: c.telegram.chatId, text: msg.text, reply_markup: markup }, { 'Content-Type': 'application/json' })
  if (r.status >= 300) throw new Error('Telegram answered ' + r.status)
}
async function sendPushover(c, msg) {
  const token = process.env.ARSENALE_PUSHOVER_TOKEN, user = process.env.ARSENALE_PUSHOVER_USER
  if (!token || !user) throw new Error('Pushover needs ARSENALE_PUSHOVER_TOKEN and ARSENALE_PUSHOVER_USER')
  const r = await request('POST', 'https://api.pushover.net/1/messages.json', { token, user, title: msg.title, message: msg.text }, { 'Content-Type': 'application/json' })
  if (r.status >= 300) throw new Error('Pushover answered ' + r.status)
}
const SENDERS = { ntfy: sendNtfy, telegram: sendTelegram, pushover: sendPushover }

/** A new question was asked: send it to every channel that is on. Never
 *  throws, never blocks the caller (the MCP tool or the CLI). */
function onQuestion(g) {
  const c = readConfig()
  if (!CHANNELS.some((ch) => c[ch].enabled)) return
  const gate = g && g.question ? g : readGate(g && g.id)
  if (!gate) return
  for (const ch of CHANNELS) {
    if (!c[ch].enabled) continue
    let msg
    try { msg = message(gate, ch, c) } catch { continue }
    if (msg.buttons.length && !signingKey(c)) msg.buttons = []
    SENDERS[ch](c, msg, gate).then(() => { const x = readConfig(); x[ch].lastSentAt = new Date().toISOString(); saveConfig(x) }, (e) => { process.stderr.write('arsenale notify ' + ch + ': ' + e.message + '\n') })
  }
}

/** One poll of the ntfy reply topic: every message must carry a valid token. */
async function pollNtfy(state) {
  const c = readConfig()
  if (!c.ntfy.enabled || !c.ntfy.replyTopic) return
  const since = state.ntfySince || Math.floor(Date.now() / 1000 - 60)
  const r = await request('GET', c.ntfy.server.replace(/\/+$/, '') + '/' + c.ntfy.replyTopic + '/json?poll=1&since=' + encodeURIComponent(String(since)), undefined, ntfyAuth())
  for (const line of r.text.split('\n')) {
    let m
    try { m = JSON.parse(line) } catch { continue }
    if (m.event !== 'message') continue
    state.ntfySince = m.id
    if (!rateOk(state)) continue
    const out = accept(String(m.message || '').trim(), 'ntfy')
    if (out.message) sendNtfy(readConfig(), { title: 'Arsenale', text: out.message, buttons: [] }).catch(() => {})
  }
}

/** One long poll of the bot: callbacks from the paired person, and the
 *  pairing link while its window is open (R-8.8). */
async function pollTelegram(state) {
  const c = readConfig()
  const tok = String(process.env.ARSENALE_TELEGRAM_TOKEN || '')
  if (!c.telegram.enabled && !c.telegram.pair) return
  if (!tok) return
  const r = await request('GET', 'https://api.telegram.org/bot' + tok + '/getUpdates?timeout=25&offset=' + (Number(c.telegram.offset) || 0))
  let j
  try { j = JSON.parse(r.text) } catch { return }
  for (const u of j.result || []) {
    const x = readConfig()
    x.telegram.offset = u.update_id + 1
    saveConfig(x)
    const out = telegramUpdate(u, x)
    if (out && out.reply && out.chatId) request('POST', 'https://api.telegram.org/bot' + tok + '/sendMessage', { chat_id: out.chatId, text: out.reply }, { 'Content-Type': 'application/json' }).catch(() => {})
    if (out && out.callbackId) request('POST', 'https://api.telegram.org/bot' + tok + '/answerCallbackQuery', { callback_query_id: out.callbackId, text: out.reply || '' }, { 'Content-Type': 'application/json' }).catch(() => {})
  }
}

/** One Telegram update, decided without the network (tested on its own). */
function telegramUpdate(u, c) {
  c = c || readConfig()
  const msg = u.message
  const p = c.telegram.pair
  if (msg && msg.chat && p && /^\/start\b/.test(String(msg.text || '').trim())) {
    if (!(Date.now() < p.until) || typeof p.token !== 'string') { c.telegram.pair = null; saveConfig(c); return null }
    // a group or channel never pairs: every member could tap for the owner
    if (msg.chat.type !== 'private' || !msg.from || msg.from.id === undefined) { noteInvalid('telegram', 'pairing outside a private chat'); return null }
    const m = /^\/start(?:@\w+)?\s+([a-f0-9]{32})$/.exec(String(msg.text).trim())
    const a = Buffer.from(m ? m[1] : ''), b = Buffer.from(p.token)
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      c.telegram.chatId = String(msg.chat.id)
      c.telegram.userId = String(msg.from.id)
      c.telegram.userName = clipCp(msg.from.username ? '@' + msg.from.username : [msg.from.first_name, msg.from.last_name].filter(Boolean).join(' '), 60)
      c.telegram.pair = null
      saveConfig(c)
      return { chatId: msg.chat.id, reply: 'Paired with Arsenale. Questions will arrive here.' }
    }
    p.misses = (Number(p.misses) || 0) + 1
    if (p.misses >= 5) c.telegram.pair = null
    saveConfig(c)
    noteInvalid('telegram', 'wrong pairing token')
    return null
  }
  const cb = u.callback_query
  if (!cb) return null
  const chat = cb.message && cb.message.chat ? String(cb.message.chat.id) : ''
  const from = cb.from && cb.from.id !== undefined ? String(cb.from.id) : ''
  if (!c.telegram.chatId || !c.telegram.userId || chat !== String(c.telegram.chatId) || from !== String(c.telegram.userId)) { noteInvalid('telegram', 'other chat or person'); return null }
  const m = /^a:([\w-]{6,20})$/.exec(String(cb.data || ''))
  if (!m) { noteInvalid('telegram', 'format'); return { callbackId: cb.id } }
  const file = path.join(PENDING, m[1] + '.json')
  let pend
  try { pend = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return { callbackId: cb.id, chatId: chat, reply: 'This request expired; open Arsenale to answer' } }
  const out = accept(pend.token, 'telegram')
  if (out.ok || out.reason === 'used' || out.reason === 'answered' || out.reason === 'expired') fs.rmSync(file, { force: true })
  return { callbackId: cb.id, chatId: chat, reply: out.message }
}

/** At most 10 decisions a minute per channel; above that the channel pauses. */
function rateOk(state) {
  const now = Date.now()
  state.taps = (state.taps || []).filter((t) => now - t < 60000)
  if (state.taps.length >= 10) return false
  state.taps.push(now)
  return true
}

/** Started by the dashboard server: polls the reply channels while any is on.
 *  Returns a stop function. */
function startLoop() {
  const state = {}
  let stopped = false, busy = false
  const tick = async () => {
    if (stopped || busy) return
    busy = true
    try { await pollNtfy(state) } catch (e) { state.ntfyError = e.message }
    try { await pollTelegram(state) } catch (e) { state.tgError = e.message }
    busy = false
  }
  const t = setInterval(tick, 5000)
  t.unref()
  return () => { stopped = true; clearInterval(t) }
}

/** The open pairing window for the page: the deep link (or, when getMe
 *  failed, only the command to send the bot) and when it closes. */
function pairView(p) {
  if (!p || typeof p.token !== 'string' || !(Date.now() < p.until)) return { pairLink: '', pairCommand: '', pairExpiresAt: '' }
  return { pairLink: p.bot ? 'https://t.me/' + p.bot + '?start=' + p.token : '', pairCommand: '/start ' + p.token, pairExpiresAt: new Date(p.until).toISOString() }
}

/** The bot's username, for the pairing link; '' when Telegram cannot say. */
async function botName(tok) {
  try {
    // through the export, so a test can answer instead of Telegram
    const r = await module.exports.request('GET', 'https://api.telegram.org/bot' + tok + '/getMe')
    const name = JSON.parse(r.text).result.username
    return /^\w{3,64}$/.test(String(name)) ? String(name) : ''
  } catch { return '' }
}

/** Settings → Notifications: what the page may show (no secret values). */
function publicState() {
  const c = readConfig()
  const env = { key: String(process.env.ARSENALE_PHONE_KEY || '').length >= 32, ntfyToken: !!process.env.ARSENALE_NTFY_TOKEN, telegram: !!process.env.ARSENALE_TELEGRAM_TOKEN, pushover: !!(process.env.ARSENALE_PUSHOVER_TOKEN && process.env.ARSENALE_PUSHOVER_USER) }
  return {
    env, expiryMin: c.expiryMin,
    ntfy: { enabled: c.ntfy.enabled, server: c.ntfy.server, topic: c.ntfy.topic, details: c.ntfy.details, testedAt: c.ntfy.testedAt, lastSentAt: c.ntfy.lastSentAt, lastDecisionAt: c.ntfy.lastDecisionAt, invalidToday: c.ntfy.invalidDay === new Date().toISOString().slice(0, 10) ? c.ntfy.invalidToday : 0 },
    telegram: Object.assign({ enabled: c.telegram.enabled, paired: !!(c.telegram.chatId && c.telegram.userId), pairedName: c.telegram.chatId && c.telegram.userId ? String(c.telegram.userName || '') : '' }, pairView(c.telegram.pair), { details: c.telegram.details, testedAt: c.telegram.testedAt, lastSentAt: c.telegram.lastSentAt, lastDecisionAt: c.telegram.lastDecisionAt, invalidToday: c.telegram.invalidDay === new Date().toISOString().slice(0, 10) ? c.telegram.invalidToday : 0 }),
    pushover: { enabled: c.pushover.enabled, details: c.pushover.details, testedAt: c.pushover.testedAt, lastSentAt: c.pushover.lastSentAt },
  }
}

/** Board-only settings change. A channel is enabled only after a test was
 *  sent (R-8.2). Turning a channel off draws a new epoch (R-8.11). */
async function configure(input, actor) {
  requireBoard(actor)
  const c = readConfig()
  const ch = String(input.channel || '')
  const op = String(input.op || '')
  if (op === 'signout') { rotate(c); return publicState() }
  if (op === 'expiry') {
    const n = Number(input.minutes)
    if (!Number.isInteger(n) || n < 5 || n > 1440) throw fail(400, 'Between 5 and 1440 minutes')
    c.expiryMin = n; saveConfig(c); return publicState()
  }
  if (!CHANNELS.includes(ch)) throw fail(400, 'unknown channel')
  if (!c.epoch) c.epoch = b64u(rand(16))
  if (op === 'setup' && ch === 'ntfy') {
    const server = String(input.server || 'https://ntfy.sh').replace(/\/+$/, '')
    if (!/^https:\/\/[\w.-]+(:\d+)?(\/[\w./-]*)?$/.test(server) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(server)) throw fail(400, 'The ntfy server must be an https:// address')
    c.ntfy.server = server
    if (!c.ntfy.topic) c.ntfy.topic = 'arsenale-' + base32(rand(16))
    if (!c.ntfy.replyTopic) c.ntfy.replyTopic = 'arsenale-' + base32(rand(16))
  } else if (op === 'pair' && ch === 'telegram') {
    if (!process.env.ARSENALE_TELEGRAM_TOKEN) throw fail(409, 'Set ARSENALE_TELEGRAM_TOKEN in the environment of the dashboard first')
    c.telegram.pair = { token: rand(16).toString('hex'), until: Date.now() + 10 * 60000, misses: 0, bot: await botName(process.env.ARSENALE_TELEGRAM_TOKEN) }
  } else if (op === 'test') {
    saveConfig(c)
    const msg = { title: 'Arsenale', text: 'Arsenale test: this channel works.', buttons: [] }
    await SENDERS[ch](c, msg, null)
    c[ch].testedAt = new Date().toISOString()
  } else if (op === 'enable') {
    if (!c[ch].testedAt) throw fail(409, 'Send a test first, and check it arrived on your phone')
    c[ch].enabled = true
  } else if (op === 'disable') {
    c[ch].enabled = false
    c.epoch = b64u(rand(16))
  } else if (op === 'details') {
    c[ch].details = input.on === true
  } else throw fail(400, 'unknown setting')
  saveConfig(c)
  try { require('./agent-company.cjs').activity({ actor: 'board', action: 'notify.changed', entityType: 'channel', entityId: ch, summary: ch + ': ' + op, via: actor.door }) } catch { /* no company */ }
  return publicState()
}

module.exports = { CHANNELS, readConfig, saveConfig, rotate, sign, accept, eligible, message, questionHash, onQuestion, telegramUpdate, startLoop, publicState, configure, signingKey, request }
