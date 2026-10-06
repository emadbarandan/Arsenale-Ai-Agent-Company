/* The owner's launch key: what makes the dashboard the owner's alone.
 *
 *   <home>/launch-key   64 hex characters (32 random bytes), made on first start
 *
 * The browser opens /?k=<key> once; the server trades a good key for a
 * cookie and every request needs that cookie after it. Without this, any
 * other account on the same machine could read the dashboard on 127.0.0.1
 * and write with the owner's role. The file is the owner's only: mode 0600
 * on macOS and Linux; on Windows the launcher (bin/arsenale.cjs) limits it
 * to the owner's account when it makes the file.
 *
 * The cookie value and the page token are derived from the key, not drawn
 * per start, so a page left open across a restart keeps working. Deleting
 * the file makes a new key at the next start, and every old cookie dies.
 *
 * The cookie name carries the port: cookies are not port-scoped, and the
 * demo (4311) runs next to `arsenale serve` (4310) with another key.
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const P = require('./paths.cjs')

const FILE = path.join(P.HOME, 'launch-key')
const KEY = /^[a-f0-9]{64}$/

function readKey() {
  try { const k = fs.readFileSync(FILE, 'utf8').trim(); return KEY.test(k) ? k : '' } catch { return '' }
}

/** The key, made when there is none. `created` tells the launcher to limit
 *  the new file to the owner on Windows. */
function ensure() {
  let key = readKey()
  let created = false
  if (!key) {
    fs.mkdirSync(P.HOME, { recursive: true })
    // an empty or broken file (a crash while it was written) is replaced
    if (fs.existsSync(FILE)) fs.rmSync(FILE, { force: true })
    const fresh = crypto.randomBytes(32).toString('hex')
    try {
      fs.writeFileSync(FILE, fresh + '\n', { flag: 'wx', mode: 0o600 })
      key = fresh
      created = true
    } catch (e) {
      // another process made it a moment ago: use theirs
      if (e.code !== 'EEXIST' || !(key = readKey())) throw e
    }
  }
  if (process.platform !== 'win32') {
    try { if (fs.statSync(FILE).mode & 0o077) fs.chmodSync(FILE, 0o600) } catch { /* the server still works; SECURITY.md says what the mode protects */ }
  }
  return { key, file: FILE, created }
}

const derive = (key, label) => crypto.createHmac('sha256', key).update(label).digest('hex')
const sessionValue = (key) => derive(key, 'arsenale-session-v1')
const pageToken = (key) => derive(key, 'arsenale-csrf-v1')
const cookieName = (port) => 'arsenale-key-' + Number(port)

/** Both sides as text of the same length, compared in constant time. */
function same(given, want) {
  const a = Buffer.from(String(given || '')), b = Buffer.from(String(want))
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

module.exports = { FILE, readKey, ensure, sessionValue, pageToken, cookieName, same }
