/* Notifications and phone approvals. EXPERIMENTAL: the phone channels depend
 * on outside services Arsenale does not run.
 *
 * Desktop notifications are not here: the dashboard page raises them with the
 * browser's Notification API while a tab is open (there is no desktop app).
 *
 * Phone channels, each off until the owner turns it on in Settings, each
 * outbound only (no port is opened, nothing listens):
 *   ntfy      notify; in details mode, Approve/Reject buttons that publish a
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
 * Secrets (spec 1.1, rule 37 and decision 13.1): an environment variable of
 * the name below wins; else the value the owner saved in Settings, kept in
 *   <data>/notify/secrets.json   { schemaVersion: 1, values: {NAME: value} }
 * written atomically, mode 0600 on macOS and Linux (the temp file too), like
 * every file in notify/, whose folder is 0700 there (set again at each write).
 * On Windows the launcher limits the notify folder to the owner at each
 * `arsenale serve` (bin/arsenale.cjs, owner-only.cjs), and every file inherits
 * that. Write-only: no API answer,
 * log line or activity entry ever holds a value, only "set" and where from.
 *   ARSENALE_PHONE_KEY        32+ characters; signs the buttons (HMAC-SHA256);
 *                             made (32 random bytes) at the first settings save
 *                             when neither the variable nor the file has one
 *   ARSENALE_NTFY_TOKEN       optional, for a protected ntfy server
 *   ARSENALE_TELEGRAM_TOKEN   the bot token from BotFather
 *   ARSENALE_PUSHOVER_TOKEN, ARSENALE_PUSHOVER_USER
 * The signing key actually used is HMAC(ARSENALE_PHONE_KEY, epoch), where the
 * epoch is a random value in notify/config.json: "Sign out all phones" and
 * turning a channel off draw a new epoch, so every button already sent dies.
 *
 * Events (rule 39): config.json `events` = {channel: {event: on}} for the
 * channels desktop, ntfy, telegram, pushover and the events in EVENTS; all on
 * by default except queueWait. The server sends the phone side: questions
 * (onQuestion) and the run alerts of watch.cjs (onEvents: stalled, queue
 * waits). The desktop side is the page's, which reads the same switches.
 * A stall message says only "A run has been quiet for N min"; the agent name
 * is added when the channel's details mode is on, never the task or steps.
 *
 * ntfy topics can be read by anyone who knows the name. On a server that is
 * not on this computer and has no access token, a typed topic must have 20+
 * characters, and buttons go only to the generated (random) topic: a guessable
 * topic would hand out the signed Approve tokens.
 *
 * A button is accepted only if: the signature is good; it was signed for the
 * channel it came back on (a Telegram token posted to the ntfy reply topic is
 * refused); it has not expired
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
const { writeAtomic, withLock } = require('./store.cjs')
const { fail, requireBoard, clipCp, actorFor } = require('./runlog.cjs')

const DIR = path.join(P.HOME, 'notify')
const CONFIG = path.join(DIR, 'config.json')
const SECRETS = path.join(DIR, 'secrets.json')
// Windows: the folder's ACL, read back by the launcher and by Settings
const OWNER_ONLY = require('./owner-only.cjs')
const NONCES = path.join(DIR, 'used-nonces.jsonl')
const PENDING = path.join(DIR, 'pending')
const CHANNELS = ['ntfy', 'telegram', 'pushover']
const EVENT_CHANNELS = ['desktop', ...CHANNELS]
const EVENTS = { question: true, task: true, budget: true, stalled: true, findings: true, queueWait: false }
// the field id the page uses -> the environment variable of the same secret
const SECRET_FIELDS = { phoneKey: 'ARSENALE_PHONE_KEY', ntfyToken: 'ARSENALE_NTFY_TOKEN', telegramToken: 'ARSENALE_TELEGRAM_TOKEN', pushoverToken: 'ARSENALE_PUSHOVER_TOKEN', pushoverUser: 'ARSENALE_PUSHOVER_USER' }
const FIELD_LABEL = { phoneKey: 'Signing key', ntfyToken: 'ntfy access token', telegramToken: 'Telegram bot token', pushoverToken: 'Pushover application token', pushoverUser: 'Pushover user key', server: 'ntfy server', topic: 'ntfy topic', minutes: 'Request expiry', events: 'Events' }
/** A 400 naming the field the owner must fix; `field` goes back to the page. */
const fieldFail = (field, rule) => Object.assign(fail(400, FIELD_LABEL[field] + ': ' + rule), { field })

const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64u = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64')
const rand = (n) => crypto.randomBytes(n)
const base32 = (buf) => { const A = 'abcdefghijklmnopqrstuvwxyz234567'; let bits = 0, v = 0, out = ''; for (const b of buf) { v = (v << 8) | b; bits += 8; while (bits >= 5) { out += A[(v >>> (bits - 5)) & 31]; bits -= 5 } } if (bits) out += A[(v << (5 - bits)) & 31]; return out }

function readConfig() {
  let c = null
  try { c = JSON.parse(fs.readFileSync(CONFIG, 'utf8')) } catch { /* defaults */ }
  const d = { schemaVersion: 1, epoch: '', expiryMin: 30, ntfy: { enabled: false, server: 'https://ntfy.sh', topic: '', replyTopic: '', details: false, testedAt: '', lastSentAt: '', lastDecisionAt: '', invalidToday: 0, invalidDay: '' }, telegram: { enabled: false, details: false, chatId: '', userId: '', userName: '', pair: null, testedAt: '', lastSentAt: '', lastDecisionAt: '', invalidToday: 0, invalidDay: '', offset: 0 }, pushover: { enabled: false, details: false, testedAt: '', lastSentAt: '' } }
  if (!c || typeof c !== 'object') return Object.assign(d, { events: eventsOf(null) })
  const out = Object.assign(d, { epoch: String(c.epoch || ''), expiryMin: Number.isInteger(c.expiryMin) && c.expiryMin >= 5 && c.expiryMin <= 1440 ? c.expiryMin : 30 })
  for (const ch of CHANNELS) if (c[ch] && typeof c[ch] === 'object') out[ch] = Object.assign(d[ch], c[ch])
  // the limits of spec 1.1 (watch.cjs reads and checks them): carried as they
  // are, so saving the channels never drops them
  for (const k of ['stallMinutes', 'deadMinutes', 'repeatMinutes']) if (c[k] !== undefined) out[k] = c[k]
  // an old file has no events: the defaults, written at the next save (AT30)
  out.events = eventsOf(c.events)
  return out
}
/** Writes config.json under its lock (re-entrant, so updateConfig can call
 *  it). A file a newer Arsenale wrote is never overwritten: readConfig knows
 *  only this version's keys, so saving would drop the newer ones. */
const NEWER_CONFIG = 'The notification settings were written by a newer Arsenale; they cannot be changed here.'
function configNewer() {
  let disk = null
  try { disk = JSON.parse(P.stripBom(fs.readFileSync(CONFIG, 'utf8'))) } catch { /* none yet, or unreadable: a write replaces it */ }
  return !!disk && Number(disk.schemaVersion) > 1
}
/** notify/ (and `sub` in it) before a write: 0700 on macOS and Linux, set
 *  again when it already exists, since mkdir's mode only applies to a new
 *  folder and an older Arsenale made it with the umask (often 0755). */
function ensureDir(sub) {
  for (const d of sub ? [DIR, sub] : [DIR]) {
    fs.mkdirSync(d, { recursive: true, mode: 0o700 })
    if (process.platform !== 'win32') { try { fs.chmodSync(d, 0o700) } catch { /* secretsOwnerOnly() tells the page */ } }
  }
}
function saveConfig(c) {
  ensureDir()
  return withLock(CONFIG, () => {
    if (configNewer()) throw fail(409, NEWER_CONFIG)
    writeAtomic(CONFIG, JSON.stringify(c, null, 2), { mode: 0o600 })
  })
}
/** Read, change and save under the file's lock: a send finishing in the
 *  background must not undo a setting saved a moment before. */
function updateConfig(fn) {
  ensureDir()
  return withLock(CONFIG, () => { const c = readConfig(); const out = fn(c); saveConfig(c); return out })
}

/** Every channel's switches: a stored true/false, else the default. Keys this
 *  version does not know (a newer one wrote them) are kept as they are. */
function eventsOf(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const out = {}
  for (const [ch, v] of Object.entries(src)) if (v && typeof v === 'object' && !Array.isArray(v)) out[ch] = Object.assign({}, v)
  for (const ch of EVENT_CHANNELS) {
    const have = out[ch] || {}
    out[ch] = Object.assign({}, have)
    for (const [ev, def] of Object.entries(EVENTS)) out[ch][ev] = typeof have[ev] === 'boolean' ? have[ev] : def
  }
  return out
}
const eventOn = (c, channel, event) => !!(c.events && c.events[channel] && c.events[channel][event] === true)

// ---------- secrets: the environment wins, else the owner-only file
function readSecretsFile() {
  try {
    const s = JSON.parse(P.stripBom(fs.readFileSync(SECRETS, 'utf8')))
    return s && typeof s === 'object' && s.values && typeof s.values === 'object' ? s : { schemaVersion: 1, values: {} }
  } catch { return { schemaVersion: 1, values: {} } }
}
/** The value of a secret by its variable name, or ''. */
function secret(name) {
  const env = process.env[name]
  if (typeof env === 'string' && env !== '') return env
  const v = readSecretsFile().values[name]
  return typeof v === 'string' ? v : ''
}
const secretFrom = (name) => (process.env[name] ? 'env' : readSecretsFile().values[name] ? 'file' : '')

/** Whether the secrets file is the owner's alone; null when there is no file
 *  yet. macOS and Linux: the file's mode and the folder's (a folder others can
 *  enter or write lets them read or swap files). Windows: the folder's ACL as
 *  icacls reads it now, not only the launcher's mark, which outlives an ACL
 *  changed later. */
function secretsOwnerOnly() {
  if (!fs.existsSync(SECRETS)) return null
  if (process.platform === 'win32') return OWNER_ONLY.check(DIR, { cached: true }).ok
  try { return (fs.statSync(SECRETS).mode & 0o077) === 0 && (fs.statSync(DIR).mode & 0o077) === 0 } catch { return null }
}

/** Saves secrets by field id ({pushoverToken: '…'}), removes the ids in
 *  `clear`; the signing key is made when there is none. Never returns or
 *  logs a value. Callers check the owner. */
function writeSecrets(values, clear) {
  ensureDir()
  return withLock(SECRETS, () => {
    const s = readSecretsFile()
    if (Number(s.schemaVersion) > 1) throw fail(409, 'The secrets file was written by a newer Arsenale; it cannot be changed here.')
    const vals = Object.assign({}, s.values)
    for (const [id, v] of Object.entries(values || {})) vals[SECRET_FIELDS[id]] = v
    for (const id of clear || []) delete vals[SECRET_FIELDS[id]]
    if (!process.env.ARSENALE_PHONE_KEY && !(typeof vals.ARSENALE_PHONE_KEY === 'string' && vals.ARSENALE_PHONE_KEY.length >= 32)) vals.ARSENALE_PHONE_KEY = rand(32).toString('hex')
    writeAtomic(SECRETS, JSON.stringify(Object.assign({}, s, { schemaVersion: 1, values: vals, updatedAt: new Date().toISOString() }), null, 2) + '\n', { mode: 0o600 })
    if (process.platform !== 'win32') { try { if (fs.statSync(SECRETS).mode & 0o077) fs.chmodSync(SECRETS, 0o600) } catch { /* secretsOwnerOnly() tells the page */ } }
  })
}
/** The signing key is made at the first save of any notification setting. */
function ensurePhoneKey() {
  if (process.env.ARSENALE_PHONE_KEY || String(readSecretsFile().values.ARSENALE_PHONE_KEY || '').length >= 32) return
  writeSecrets({}, [])
}

/** A secret as typed: non-empty, no whitespace, at most 200 characters
 *  (rule 38); the signing key also at least 32. */
function cleanSecret(id, v) {
  if (typeof v !== 'string' || v === '') throw fieldFail(id, 'fill it in')
  if (/\s/.test(v)) throw fieldFail(id, 'no spaces or line breaks')
  if (v.length > 200) throw fieldFail(id, 'at most 200 characters')
  if (id === 'phoneKey' && v.length < 32) throw fieldFail(id, 'at least 32 characters')
  return v
}

/** An error text with every secret in force replaced: a reason shown on the
 *  page or printed must never carry a token (a URL in a message can). */
function scrub(text) {
  let s = String(text || '')
  for (const name of Object.values(SECRET_FIELDS)) { const v = secret(name); if (v && v.length >= 4) s = s.split(v).join('***') }
  return clipCp(s, 200)
}

/** The signing key, or '' when there is none in the environment or the file. */
function signingKey(cfg) {
  const base = String(secret('ARSENALE_PHONE_KEY'))
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
 *  choices, when it was asked, what an approval lets happen (action type, ref,
 *  version run, gates passed) and when the gate was last written. A gate
 *  edited after sending fails this, so an approval cannot be pointed at
 *  another merge after the owner saw it. */
const questionHash = (g) => {
  const a = g.action && typeof g.action === 'object' ? g.action : {}
  return crypto.createHash('sha256').update(JSON.stringify([String(g.question || ''), Array.isArray(g.choices) ? g.choices : [], String(g.askedAt || ''),
    [String(a.type || ''), String(a.ref || ''), String(a.versionRun || ''), a.gatesPassed === true], String(g.updatedAt || '')])).digest('hex').slice(0, 32)
}

function readGate(id) {
  try { return JSON.parse(fs.readFileSync(path.join(P.GATES, String(id).replace(/[^\w.-]/g, '') + '.json'), 'utf8')) } catch { return null }
}

/** A signed decision: gate, decision (approve, decline or a choice index),
 *  the channel it is sent on (opts.channel, required), expiry, a 128-bit
 *  nonce and the question hash. */
function sign(gate, decision, opts) {
  const channel = String((opts && opts.channel) || '')
  if (!CHANNELS.includes(channel)) throw new Error('sign: opts.channel must be one of ' + CHANNELS.join(', '))
  const c = (opts && opts.cfg) || readConfig()
  const key = signingKey(c)
  if (!key) throw fail(409, 'Phone buttons need a signing key: save the notification settings once, or set ARSENALE_PHONE_KEY (32+ characters)')
  const now = (opts && opts.now) || Date.now()
  const body = { g: gate.id, d: String(decision), c: channel, e: now + c.expiryMin * 60000, n: b64u(rand(16)), q: questionHash(gate) }
  const payload = b64u(JSON.stringify(body))
  return payload + '.' + b64u(crypto.createHmac('sha256', key).update(payload).digest())
}

function nonceUsed(n) {
  let text = ''
  try { text = fs.readFileSync(NONCES, 'utf8') } catch { return false }
  return text.split('\n').some((l) => { try { return JSON.parse(l).n === n } catch { return false } })
}
function useNonce(n, exp) {
  ensureDir()
  // entries are kept until a day after they expire, then dropped
  let keep = []
  try { keep = fs.readFileSync(NONCES, 'utf8').split('\n').filter((l) => { try { return JSON.parse(l).x > Date.now() - 86400000 } catch { return false } }) } catch { /* new file */ }
  keep.push(JSON.stringify({ n, x: exp }))
  writeAtomic(NONCES, keep.join('\n') + '\n', { mode: 0o600 })
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
  // signed for another channel, or by a build that did not sign the channel:
  // a Telegram button's token never answers through the ntfy reply topic
  if (!body || body.c !== channel) return bad('channel', '')
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
  // the hash the token was signed with is checked again under the gate's lock
  const saved = L.answer(g.id, answer, actor, { via: 'phone:' + channel, hash: body.q })
  try { require('./agent-company.cjs').activity({ actor: 'board', action: 'phone.decision', entityType: 'gate', entityId: g.id, summary: answer + ' from the phone (' + channel + '): ' + clipCp(g.label || g.question, 120), via: 'phone:' + channel }) } catch { /* no company */ }
  // only a time stamp: a settings file that cannot be written does not undo the answer
  try { updateConfig((x) => { if (x[channel]) x[channel].lastDecisionAt = new Date().toISOString() }) } catch { /* newer or locked settings */ }
  return { ok: true, gate: saved, message: (answer === 'approve' ? 'Approved' : answer === 'decline' ? 'Rejected' : 'Answered "' + answer + '"') + ': ' + clipCp(g.label || g.question, 120) }
}

function noteInvalid(channel, reason) {
  try {
    const day = new Date().toISOString().slice(0, 10)
    const known = updateConfig((c) => {
      const ch = c[channel]
      if (!ch) return false
      if (ch.invalidDay !== day) { ch.invalidDay = day; ch.invalidToday = 0 }
      ch.invalidToday++
      return true
    })
    if (!known) return
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
  // building or publishing a release is answered on the computer only (spec
  // 1.1 rule 33), whatever the safety rules let a phone approve
  const type = g.action && typeof g.action === 'object' ? String(g.action.type || '') : ''
  if (type === 'build' || type === 'publish') return { buttons: false, why: 'desktop-only' }
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
  const waiting = (() => { try { return fs.readdirSync(P.GATES).map((n) => { try { return JSON.parse(fs.readFileSync(path.join(P.GATES, n), 'utf8')) } catch { return null } }).filter((x) => x && x.status === 'waiting' && x.approvalType !== 'proposal').length } catch { return 1 } })()
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
      ? [{ label: 'Approve', decision: 'approve' }, { label: 'Reject', decision: 'decline' }]
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
/** A server on this computer: nobody else can read its topics. */
const localServer = (server) => { try { return ['127.0.0.1', 'localhost'].includes(new URL(server).hostname) } catch { return false } }
// a topic cleanNtfy made carries topicMade: true; a file from before the flag
// has its made topic in exactly this shape (26 base32 letters, 128 bits)
const topicMade = (n) => n.topicMade === true || (n.topicMade === undefined && /^arsenale-[a-z2-7]{26}$/.test(String(n.topic || '')))
/** Whether ntfy may carry Approve buttons: a server on this computer, an
 *  access token, or the generated topic. Whoever guesses a typed topic on a
 *  public server reads every message on it, the signed tokens included. */
const ntfyButtonsOk = (n) => localServer(n.server) || !!secret('ARSENALE_NTFY_TOKEN') || topicMade(n)
const ntfyAuth = () => { const t = secret('ARSENALE_NTFY_TOKEN'); return t ? { Authorization: 'Bearer ' + t } : {} }
// every send goes through the export, so a test can answer instead of the service
const send = (...a) => module.exports.request(...a)

async function sendNtfy(c, msg, gate) {
  const n = c.ntfy
  if (!n.topic) throw fieldFail('topic', 'set up ntfy first')
  // decided here, where a token would leave; the page only shows it
  const withButtons = msg.buttons.length > 0 && ntfyButtonsOk(n)
  const actions = withButtons ? msg.buttons.map((b) => ({ action: 'http', label: b.label, url: n.server.replace(/\/+$/, '') + '/' + n.replyTopic, method: 'POST', body: sign(gate, b.decision, { cfg: c, channel: 'ntfy' }), clear: true })) : []
  const text = msg.buttons.length && !withButtons ? msg.text + '\nOpen Arsenale to answer' : msg.text
  const r = await send('POST', n.server.replace(/\/+$/, '') + '/', { topic: n.topic, title: msg.title, message: text, actions: actions.length ? actions : undefined }, Object.assign({ 'Content-Type': 'application/json' }, ntfyAuth()))
  if (r.status >= 300) throw new Error('ntfy answered ' + r.status)
}
async function sendTelegram(c, msg, gate) {
  const tok = secret('ARSENALE_TELEGRAM_TOKEN')
  if (!tok) throw fieldFail('telegramToken', 'fill it in')
  // a chat paired by the old six-digit code has no person: it pairs again
  if (!c.telegram.chatId || !c.telegram.userId) throw fail(409, 'Telegram: pair a phone first')
  let markup
  if (msg.buttons.length) {
    // callback_data is short: an id of a pending record that holds the token
    ensureDir(PENDING)
    markup = { inline_keyboard: [msg.buttons.map((b) => { const id = b64u(rand(9)); writeAtomic(path.join(PENDING, id + '.json'), JSON.stringify({ token: sign(gate, b.decision, { cfg: c, channel: 'telegram' }), at: Date.now() }), { mode: 0o600 }); return { text: b.label, callback_data: 'a:' + id } })] }
  }
  const r = await send('POST', 'https://api.telegram.org/bot' + tok + '/sendMessage', { chat_id: c.telegram.chatId, text: msg.text, reply_markup: markup }, { 'Content-Type': 'application/json' })
  if (r.status >= 300) throw new Error('Telegram answered ' + r.status)
}
async function sendPushover(c, msg) {
  const token = secret('ARSENALE_PUSHOVER_TOKEN'), user = secret('ARSENALE_PUSHOVER_USER')
  if (!token) throw fieldFail('pushoverToken', 'fill it in')
  if (!user) throw fieldFail('pushoverUser', 'fill it in')
  const r = await send('POST', 'https://api.pushover.net/1/messages.json', { token, user, title: msg.title, message: msg.text }, { 'Content-Type': 'application/json' })
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
    if (!c[ch].enabled || !eventOn(c, ch, 'question')) continue
    let msg
    try { msg = message(gate, ch, c) } catch { continue }
    if (msg.buttons.length && !signingKey(c)) msg.buttons = []
    deliver(ch, c, msg, gate)
  }
}

/** One send in the background; the result is kept on the channel for
 *  Settings (lastSentAt, or lastError {at, reason}). Never throws. */
function deliver(ch, c, msg, gate) {
  let p
  try { p = SENDERS[ch](c, msg, gate) } catch (e) { p = Promise.reject(e) }
  return p.then(() => {
    try { updateConfig((x) => { x[ch].lastSentAt = new Date().toISOString(); x[ch].lastError = null }) } catch { /* the next send records again */ }
    return { channel: ch, ok: true }
  }, (e) => {
    const reason = scrub(e && e.message)
    try { updateConfig((x) => { x[ch].lastError = { at: new Date().toISOString(), reason } }) } catch { /* the line below is the trace */ }
    process.stderr.write('arsenale notify ' + ch + ': ' + reason + '\n')
    return { channel: ch, ok: false, reason }
  })
}

// the switch of each kind of run alert (watch.cjs); a kind not here is
// dashboard-only (a dead run that was closed)
const ALERT_EVENT = { stalled: 'stalled', 'queue-wait': 'queueWait', 'queue-hung': 'queueWait' }
// an agent name as the phone shows it: one short line, no control characters
const agentName = (s) => clipCp(String(s || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim(), 40)

/** The phone text for the run alerts of one kind raised in one tick: one
 *  message, however many runs. Never the task, the steps or a path (rule 13);
 *  the agent names only in details mode. */
function alertMessage(kind, evs, channel, cfg) {
  const details = !!(cfg[channel] && cfg[channel].details)
  const names = details ? [...new Set(evs.map((e) => agentName(e.agent)).filter(Boolean))] : []
  const who = names.length ? ': ' + clipCp(names.join(', '), 120) : ''
  const least = (k) => Math.min(...evs.map((e) => Number(e[k]) || 0))
  let text
  if (kind === 'stalled') text = (evs.length === 1 ? 'A run has been quiet for ' : evs.length + ' runs have been quiet for at least ') + least('quietMin') + ' min'
  else if (kind === 'queue-wait') text = (evs.length === 1 ? 'A run has waited ' : evs.length + ' runs have waited at least ') + least('waitMin') + ' min for the test suite'
  else text = 'The test suite has been held for ' + least('heldMin') + ' min'
  return { title: 'Arsenale', text: text + who, buttons: [] }
}

/** The new events of a watch tick (watch.startLoop's onEvents): each kind
 *  goes to every phone channel that is on and has that event on. Returns a
 *  promise of the send results (for the tests); never throws. */
function onEvents(events) {
  const sends = []
  try {
    const c = readConfig()
    const byKind = {}
    for (const e of Array.isArray(events) ? events : []) if (e && ALERT_EVENT[e.kind]) (byKind[e.kind] = byKind[e.kind] || []).push(e)
    for (const [kind, evs] of Object.entries(byKind)) {
      for (const ch of CHANNELS) {
        if (!c[ch].enabled || !eventOn(c, ch, ALERT_EVENT[kind])) continue
        sends.push(deliver(ch, c, alertMessage(kind, evs, ch, c), null))
      }
    }
  } catch (e) { process.stderr.write('arsenale notify: ' + scrub(e.message) + '\n') }
  return Promise.all(sends)
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
  const tok = secret('ARSENALE_TELEGRAM_TOKEN')
  if (!c.telegram.enabled && !c.telegram.pair) return
  if (!tok) return
  const r = await request('GET', 'https://api.telegram.org/bot' + tok + '/getUpdates?timeout=25&offset=' + (Number(c.telegram.offset) || 0))
  let j
  try { j = JSON.parse(r.text) } catch { return }
  for (const u of j.result || []) {
    updateConfig((x) => { x.telegram.offset = u.update_id + 1 })
    const out = telegramUpdate(u, readConfig())
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

/** Settings → Notifications: what the page may show. No secret value, ever:
 *  each secret is { set, from: 'env' | 'file' | '' }. */
function publicState() {
  const c = readConfig()
  const today = new Date().toISOString().slice(0, 10)
  const secrets = {}
  for (const [id, name] of Object.entries(SECRET_FIELDS)) { const from = secretFrom(name); secrets[id] = { set: !!from && (id !== 'phoneKey' || secret(name).length >= 32), from } }
  // what the 1.0 page reads: configured at all, from the environment or the file
  const env = { key: secrets.phoneKey.set, ntfyToken: secrets.ntfyToken.set, telegram: secrets.telegramToken.set, pushover: secrets.pushoverToken.set && secrets.pushoverUser.set }
  const result = (x) => ({ testedAt: x.testedAt, lastTest: x.lastTest || null, lastSentAt: x.lastSentAt, lastError: x.lastError || null })
  const events = {}
  for (const ch of EVENT_CHANNELS) events[ch] = Object.fromEntries(Object.keys(EVENTS).map((ev) => [ev, eventOn(c, ch, ev)]))
  let limits = null
  try { limits = require('./watch.cjs').limits() } catch { /* no watch module: the page shows the defaults */ }
  return {
    env, secrets, secretsFile: { ownerOnly: secretsOwnerOnly() }, expiryMin: c.expiryMin, limits, readOnly: configNewer(),
    events, eventDefaults: Object.assign({}, EVENTS),
    ntfy: Object.assign({ enabled: c.ntfy.enabled, server: c.ntfy.server, topic: c.ntfy.topic, buttons: ntfyButtonsOk(c.ntfy), details: c.ntfy.details, lastDecisionAt: c.ntfy.lastDecisionAt, invalidToday: c.ntfy.invalidDay === today ? c.ntfy.invalidToday : 0 }, result(c.ntfy)),
    telegram: Object.assign({ enabled: c.telegram.enabled, paired: !!(c.telegram.chatId && c.telegram.userId), pairedName: c.telegram.chatId && c.telegram.userId ? String(c.telegram.userName || '') : '' }, pairView(c.telegram.pair), { details: c.telegram.details, lastDecisionAt: c.telegram.lastDecisionAt, invalidToday: c.telegram.invalidDay === today ? c.telegram.invalidToday : 0 }, result(c.telegram)),
    pushover: Object.assign({ enabled: c.pushover.enabled, details: c.pushover.details }, result(c.pushover)),
  }
}

// the secrets each channel's setup takes: input key -> field id
const SETUP_SECRETS = { ntfy: { token: 'ntfyToken' }, telegram: { token: 'telegramToken' }, pushover: { token: 'pushoverToken', user: 'pushoverUser' } }

/** The ntfy server and topic as typed (rule 38), or a 400 naming the field.
 *  `hasToken`: whether an access token is in force once this save is done. */
function cleanNtfy(input, cur, hasToken) {
  const server = input.server === undefined ? cur.server : String(input.server).trim().replace(/\/+$/, '')
  if (!/^https:\/\/[\w.-]+(:\d+)?(\/[\w./-]*)?$/.test(server) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(server)) throw fieldFail('server', 'an https:// address, or http:// on this computer (127.0.0.1 or localhost)')
  // topic null: a new generated topic in place of the one saved
  let topic = input.topic === null ? '' : cur.topic, made = !!topic && topicMade(cur)
  if (input.topic !== undefined && input.topic !== null && String(input.topic).trim() !== '') {
    topic = String(input.topic).trim()
    if (!/^[A-Za-z0-9_-]{3,64}$/.test(topic)) throw fieldFail('topic', '3 to 64 letters, digits, - or _')
    // the made topic typed back in (the page shows it in the field) stays made
    made = made && topic === cur.topic
  }
  if (!topic) { topic = 'arsenale-' + base32(rand(16)); made = true }
  // anyone can subscribe to a topic they guess on a public server; a kept
  // short topic is refused too, when the server or the token changes under it
  if (!made && !hasToken && !localServer(server) && topic.length < 20) throw fieldFail('topic', 'use at least 20 characters or the generated topic, or set an access token')
  return { server, topic, made }
}

/** Board-only settings change (rule 40), checked in full before anything is
 *  written. A channel is enabled only after a test was sent (R-8.2). Turning
 *  a channel off draws a new epoch (R-8.11). Ops:
 *    setup    {channel, ...}: ntfy {server, topic, token}, telegram {token},
 *             pushover {token, user}; a secret given as a string is saved, as
 *             null is removed, left out is kept; ntfy topic null makes a
 *             new random topic
 *    test     {channel}: one test message; the result is kept as lastTest,
 *             and a failure is also an error with the reason
 *    enable | disable | details {channel, on} | pair {channel: 'telegram'}
 *    events   {channel: 'desktop' | a phone channel, events: {name: bool}}
 *    expiry   {minutes} | signout
 *  The first save of any of them makes the signing key when there is none. */
async function configure(input, actor) {
  requireBoard(actor)
  // refused before anything is written, the secrets file included
  if (configNewer()) throw fail(409, NEWER_CONFIG)
  const ch = String(input.channel || '')
  const op = String(input.op || '')
  const done = (summary) => {
    try { require('./agent-company.cjs').activity({ actor: 'board', action: 'notify.changed', entityType: 'channel', entityId: ch || 'all', summary, via: actor.door }) } catch { /* no company */ }
    return publicState()
  }
  if (op === 'signout') { ensurePhoneKey(); updateConfig((c) => { c.epoch = b64u(rand(16)) }); return done('signed out all phones') }
  if (op === 'expiry') {
    const n = typeof input.minutes === 'string' && /^\d+$/.test(input.minutes.trim()) ? Number(input.minutes) : input.minutes
    if (!Number.isInteger(n) || n < 5 || n > 1440) throw fieldFail('minutes', 'a whole number of minutes from 5 to 1440')
    ensurePhoneKey()
    updateConfig((c) => { c.expiryMin = n })
    return done('request expiry ' + n + ' min')
  }
  if (op === 'events') {
    if (!EVENT_CHANNELS.includes(ch)) throw fail(400, 'unknown channel')
    const ev = input.events
    if (!ev || typeof ev !== 'object' || Array.isArray(ev) || !Object.keys(ev).length) throw fieldFail('events', 'give at least one event')
    for (const [k, v] of Object.entries(ev)) {
      if (!Object.hasOwn(EVENTS, k)) throw fieldFail('events', 'unknown event "' + clipCp(k, 40) + '"; known: ' + Object.keys(EVENTS).join(', '))
      if (typeof v !== 'boolean') throw fieldFail('events', k + ' must be true or false')
    }
    ensurePhoneKey()
    updateConfig((c) => { c.events[ch] = Object.assign({}, c.events[ch], ev) })
    return done(ch + ' events: ' + Object.entries(ev).map(([k, v]) => k + ' ' + (v ? 'on' : 'off')).join(', '))
  }
  if (!CHANNELS.includes(ch)) throw fail(400, 'unknown channel')
  const cur = readConfig()
  let change, summary = ch + ': ' + op
  if (op === 'setup') {
    const set = {}, clear = []
    for (const [key, id] of Object.entries(SETUP_SECRETS[ch])) {
      if (input[key] === undefined) continue
      if (input[key] === null) clear.push(id)
      else set[id] = cleanSecret(id, input[key])
    }
    // with the access token in force after this save: typed now, removed now
    // (an environment variable still wins), or the one already there
    const nt = ch === 'ntfy' ? cleanNtfy(input, cur.ntfy, input.token === null ? !!process.env.ARSENALE_NTFY_TOKEN : !!(set.ntfyToken || secret('ARSENALE_NTFY_TOKEN'))) : null
    // what the channel sends to: server, topic and the secrets in force (an
    // environment variable wins over the file, so saving under it changes nothing)
    const target = () => JSON.stringify(Object.values(SETUP_SECRETS[ch]).map((id) => crypto.createHash('sha256').update(secret(SECRET_FIELDS[id])).digest('hex')))
    const before = target()
    if (Object.keys(set).length || clear.length) writeSecrets(set, clear)
    // a changed target is an untested target: the channel is off until a new test arrived
    const moved = before !== target() || (nt && (nt.server !== cur.ntfy.server || nt.topic !== cur.ntfy.topic))
    change = (c) => {
      if (nt) { c.ntfy.server = nt.server; c.ntfy.topic = nt.topic; c.ntfy.topicMade = nt.made; if (!c.ntfy.replyTopic) c.ntfy.replyTopic = 'arsenale-' + base32(rand(16)) }
      if (moved) {
        c[ch].testedAt = ''
        c[ch].lastTest = null
        // as "disable": buttons already sent to the old target stop working
        if (c[ch].enabled) { c[ch].enabled = false; c.epoch = b64u(rand(16)) }
      }
    }
    // names the fields saved, never their values
    const names = [...Object.keys(set).map((id) => FIELD_LABEL[id] + ' saved'), ...clear.map((id) => FIELD_LABEL[id] + ' removed')]
    summary = ch + ': settings saved' + (names.length ? ' (' + names.join(', ') + ')' : '') + (moved ? '; test it again' : '')
  } else if (op === 'pair' && ch === 'telegram') {
    const tok = secret('ARSENALE_TELEGRAM_TOKEN')
    if (!tok) throw fieldFail('telegramToken', 'fill it in first')
    const pair = { token: rand(16).toString('hex'), until: Date.now() + 10 * 60000, misses: 0, bot: await botName(tok) }
    change = (c) => { c.telegram.pair = pair }
  } else if (op === 'test') {
    ensurePhoneKey()
    const msg = { title: 'Arsenale', text: 'Arsenale test: this channel works.', buttons: [] }
    const at = new Date().toISOString()
    let error = null
    try { await SENDERS[ch](readConfig(), msg, null) } catch (e) { error = e }
    if (error) {
      const reason = scrub(error.message)
      updateConfig((c) => { c[ch].lastTest = { at, ok: false, reason } })
      done(ch + ': test failed')
      // the reason as the page shows it; a missing field keeps its 400 and name
      throw error.field ? Object.assign(fail(400, reason), { field: error.field }) : fail(502, reason)
    }
    change = (c) => { c[ch].testedAt = at; c[ch].lastTest = { at, ok: true, reason: '' } }
  } else if (op === 'enable') {
    if (!cur[ch].testedAt) throw fail(409, 'Send a test first, and check it arrived on your phone')
    change = (c) => { c[ch].enabled = true }
  } else if (op === 'disable') {
    change = (c) => { c[ch].enabled = false; c.epoch = b64u(rand(16)) }
  } else if (op === 'details') {
    change = (c) => { c[ch].details = input.on === true }
  } else throw fail(400, 'unknown setting')
  ensurePhoneKey()
  updateConfig((c) => { if (!c.epoch) c.epoch = b64u(rand(16)); change(c) })
  return done(summary)
}

module.exports = { CHANNELS, EVENTS, EVENT_CHANNELS, SECRETS, SECRET_FIELDS, readConfig, saveConfig, rotate, sign, accept, eligible, message, questionHash, onQuestion, onEvents, alertMessage, telegramUpdate, startLoop, publicState, configure, signingKey, secret, request }
