/* "Connect your assistant": the exact way to plug Arsenale into each MCP
 * client, and, only with the owner's consent, the edit of that client's own
 * settings file.
 *
 * For every client the dashboard shows the snippet, command or link FIRST.
 * Writing a client's settings file is a separate, Board-only step (the
 * dashboard door) that:
 *   - writes only to the one fixed file of that client (never a path from
 *     the request);
 *   - refuses a file that is not plain JSON (comments, trailing commas): the
 *     owner adds the snippet by hand then, nothing is guessed;
 *   - refuses when the file changed since the preview (its hash);
 *   - copies the file to <file>.arsenale-backup-<time> first, and records the
 *     write in <home>/connect/writes.jsonl so it can be undone;
 *   - keeps the file's permissions (it may hold other servers' API keys and
 *     be 0600), and writes through a link to the real file, unless that is
 *     outside the home folder (then the owner adds the snippet by hand).
 * The preview the page shows holds only the arsenale entry, with env values
 * and secret-named keys masked: the other servers' settings, often API keys,
 * never reach the screen. Its hash is still of the whole file.
 * Nothing here starts a process: a command such as "claude mcp add" is shown
 * for the owner to copy and run.
 *
 * Which clients take which form was checked from their public documentation
 * before the knowledge cutoff of whoever wrote this, not on every client's
 * current release: the cards say "experimental" where that matters, and
 * CONTRIBUTING.md lists the help wanted.
 */
const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const P = require('./paths.cjs')
const { fail, requireBoard } = require('./runlog.cjs')

const BIN = path.resolve(__dirname, '..', 'bin', 'arsenale.cjs')
const LOG = path.join(P.HOME, 'connect', 'writes.jsonl')

/** The command an MCP client runs: this Node and this install's launcher. */
function server() {
  return { command: process.execPath, args: [BIN, 'mcp'] }
}

/** The fixed settings file of each client that has one, per OS. */
function configFile(client, env) {
  env = env || process.env
  const home = os.homedir()
  const appData = env.APPDATA || path.join(home, 'AppData', 'Roaming')
  const mac = process.platform === 'darwin'
  const win = process.platform === 'win32'
  const support = mac ? path.join(home, 'Library', 'Application Support') : win ? appData : (env.XDG_CONFIG_HOME || path.join(home, '.config'))
  switch (client) {
    case 'claude-desktop': return { file: path.join(support, 'Claude', 'claude_desktop_config.json'), key: 'mcpServers', format: 'json' }
    case 'cursor': return { file: path.join(home, '.cursor', 'mcp.json'), key: 'mcpServers', format: 'json' }
    case 'vscode': return { file: path.join(support, 'Code', 'User', 'mcp.json'), key: 'servers', format: 'json' }
    case 'gemini': return { file: path.join(home, '.gemini', 'settings.json'), key: 'mcpServers', format: 'json' }
    case 'codex': return { file: path.join(env.CODEX_HOME || path.join(home, '.codex'), 'config.toml'), key: 'mcp_servers', format: 'toml' }
    default: return null
  }
}

const tomlStr = (s) => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
const shellQuote = (s) => (/^[\w./:\\-]+$/.test(s) ? s : '"' + String(s).replace(/"/g, '\\"') + '"')

/** Everything the Connect card shows for one client. */
function card(client) {
  const sv = server()
  const entry = { command: sv.command, args: sv.args }
  const cmdLine = [sv.command, ...sv.args].map(shellQuote).join(' ')
  const cf = configFile(client)
  const base = { id: client, file: cf ? cf.file : '', canWrite: !!cf }
  switch (client) {
    case 'claude-desktop':
      return Object.assign(base, { name: 'Claude Desktop', primary: 'file', snippet: JSON.stringify({ mcpServers: { arsenale: entry } }, null, 2), note: 'Restart Claude Desktop after the change.' })
    case 'claude-code':
      return Object.assign(base, { name: 'Claude Code', primary: 'command', command: 'claude mcp add --scope user arsenale -- ' + cmdLine, snippet: JSON.stringify({ mcpServers: { arsenale: entry } }, null, 2), note: 'Use MCP or the CLAUDE.md block with the hooks, not both: both log every job twice.' })
    case 'cursor': {
      const link = 'cursor://anysphere.cursor-deeplink/mcp/install?name=arsenale&config=' + encodeURIComponent(Buffer.from(JSON.stringify(entry)).toString('base64'))
      return Object.assign(base, { name: 'Cursor', primary: 'link', link, snippet: JSON.stringify({ mcpServers: { arsenale: entry } }, null, 2), experimental: true })
    }
    case 'vscode': {
      const link = 'vscode:mcp/install?' + encodeURIComponent(JSON.stringify(Object.assign({ name: 'arsenale', type: 'stdio' }, entry)))
      return Object.assign(base, { name: 'VS Code', primary: 'link', link, snippet: JSON.stringify({ servers: { arsenale: Object.assign({ type: 'stdio' }, entry) } }, null, 2), experimental: true })
    }
    case 'codex':
      return Object.assign(base, { name: 'Codex CLI', primary: 'command', command: 'codex mcp add arsenale -- ' + cmdLine, snippet: '[mcp_servers.arsenale]\ncommand = ' + tomlStr(sv.command) + '\nargs = [' + sv.args.map(tomlStr).join(', ') + ']\n', experimental: true })
    case 'gemini':
      return Object.assign(base, { name: 'Gemini CLI', primary: 'file', snippet: JSON.stringify({ mcpServers: { arsenale: entry } }, null, 2), experimental: true })
    case 'other':
      return Object.assign(base, { name: 'Other MCP clients', primary: 'copy', command: cmdLine, snippet: JSON.stringify({ command: sv.command, args: sv.args }, null, 2), note: 'Any client that starts a local MCP server: give it this command. Clients that take only a URL can use MCP over HTTP (Advanced).' })
    case 'chatgpt':
      return Object.assign(base, { name: 'ChatGPT', primary: 'none', snippet: '', note: 'ChatGPT connects only to MCP servers on the public internet, and Arsenale stays on this computer. Use "Copy a message for your assistant" on a task instead. Help is wanted on a safe way (see CONTRIBUTING.md).' })
    default: throw fail(404, 'unknown client')
  }
}
const CLIENTS = ['claude-desktop', 'claude-code', 'cursor', 'vscode', 'codex', 'gemini', 'other', 'chatgpt']

const hashOf = (s) => crypto.createHash('sha256').update(s == null ? '' : s).digest('hex')

// values that may be secrets, in an entry shown on the page
const SECRET_KEY = /token|key|secret|password|auth|credential/i
const maskAll = (v) => (v && typeof v === 'object' ? (Array.isArray(v) ? v.map(maskAll) : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, maskAll(x)]))) : '••••')
const masked = (v) => (Array.isArray(v) ? v.map(masked) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === 'env' || SECRET_KEY.test(k) ? maskAll(x) : masked(x)])) : v)
const tomlMasked = (block) => block.replace(/^(\s*([\w.-]+)\s*=\s*).*$/gm, (line, head, k) => (SECRET_KEY.test(k) ? head + '"••••"' : line))
/** The [mcp_servers.arsenale] table of a TOML text, up to the next table. */
const tomlBlock = (text) => { const m = /^\s*\[mcp_servers\.arsenale\]\s*$[\s\S]*?(?=^\s*\[|(?![\s\S]))/m.exec(text); return m ? m[0].replace(/^\s+/, '').replace(/\s*$/, '\n') : '' }

/** The file to write: the client's path, or the real file when that path is
 *  a link. A link out of the home folder is refused, not followed. */
function realTarget(file) {
  let link = false
  try { link = fs.lstatSync(file).isSymbolicLink() } catch { return file }
  if (!link) return file
  let real, home
  try { real = fs.realpathSync.native(file); home = fs.realpathSync.native(os.homedir()) } catch { throw fail(409, 'This settings file is a link that leads nowhere. Add the snippet by hand: ' + file) }
  const rel = path.relative(home, real)
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw fail(409, 'This settings file is a link to ' + real + ', outside your home folder. Add the snippet by hand: ' + file)
  return real
}

/** The whole change (what apply writes) and the part the page may show. */
function plan(client) {
  const cf = configFile(client)
  if (!cf) throw fail(400, 'This client has no settings file Arsenale can write: copy the snippet instead')
  const target = realTarget(cf.file)
  let before = null
  try { before = fs.readFileSync(target, 'utf8') } catch { /* no file yet */ }
  const sv = server()
  const out = (after, shownBefore, shownAfter) => ({ client, file: cf.file, target, before, after, hash: hashOf(before), unchanged: after === before, shown: { before: before === null ? null : shownBefore, after: shownAfter } })
  if (cf.format === 'json') {
    let obj = {}
    if (before !== null && before.trim()) {
      try { obj = JSON.parse(P.stripBom(before)) } catch { throw fail(409, 'This file has comments or is not plain JSON. Add the snippet by hand: ' + cf.file) }
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw fail(409, 'This file is not a JSON object. Add the snippet by hand: ' + cf.file)
    }
    const servers = obj[cf.key] && typeof obj[cf.key] === 'object' && !Array.isArray(obj[cf.key]) ? obj[cf.key] : {}
    const entry = client === 'vscode' ? { type: 'stdio', command: sv.command, args: sv.args } : { command: sv.command, args: sv.args }
    const show = (e) => JSON.stringify({ [cf.key]: { arsenale: masked(e) } }, null, 2) + '\n'
    const was = Object.hasOwn(servers, 'arsenale') ? show(servers.arsenale) : ''
    if (servers.arsenale && JSON.stringify(servers.arsenale) === JSON.stringify(entry)) return out(before, was, was)
    obj[cf.key] = Object.assign({}, servers, { arsenale: entry })
    return out(JSON.stringify(obj, null, 2) + '\n', was, show(entry))
  }
  const text = before || ''
  if (/^\s*\[mcp_servers\.arsenale\]\s*$/m.test(text)) { const was = tomlMasked(tomlBlock(text)); return out(before, was, was) }
  // an append after an unclosed multi-line string would land inside it
  if ((text.split("'''").length - 1) % 2 || (text.split('"""').length - 1) % 2) throw fail(409, 'This file ends inside a multi-line string. Add the snippet by hand: ' + cf.file)
  const block = '[mcp_servers.arsenale]\ncommand = ' + tomlStr(sv.command) + '\nargs = [' + sv.args.map(tomlStr).join(', ') + ']\n'
  return out(text + (text && !text.endsWith('\n') ? '\n' : '') + (text ? '\n' : '') + block, '', block)
}

/** What writing the client's file would change, as the page shows it: only
 *  the arsenale entry before and after, and the hash of the whole file. */
function preview(client) {
  const p = plan(client)
  return { client, file: p.file, before: p.shown.before, after: p.shown.after, hash: p.hash, unchanged: p.unchanged }
}

/** Writes the client's file after the owner saw the preview. Board only. */
function apply(client, hash, actor) {
  requireBoard(actor)
  const pv = plan(client)
  if (pv.hash !== String(hash || '')) throw fail(409, 'The file changed since you looked at it. Look at the change again.')
  if (pv.unchanged) return { client, file: pv.file, written: false, backup: '' }
  let backup = '', mode = null
  if (pv.before !== null) {
    backup = pv.target + '.arsenale-backup-' + new Date().toISOString().replace(/[:.]/g, '-')
    fs.copyFileSync(pv.target, backup)
    mode = fs.statSync(pv.target).mode & 0o777
  }
  fs.mkdirSync(path.dirname(pv.target), { recursive: true })
  const tmp = pv.target + '.' + process.pid + '.tmp'
  fs.writeFileSync(tmp, pv.after)
  // a new file gets the umask's 0644: the original's mode goes over first.
  // Not on Windows, where a mode is only the read-only flag and a read-only
  // file there would make the rename fail.
  if (mode !== null && process.platform !== 'win32') fs.chmodSync(tmp, mode)
  fs.renameSync(tmp, pv.target)
  fs.mkdirSync(path.dirname(LOG), { recursive: true })
  fs.appendFileSync(LOG, JSON.stringify(Object.assign({ at: new Date().toISOString(), client, file: pv.file, backup, created: pv.before === null }, pv.target !== pv.file ? { target: pv.target } : {})) + '\n')
  try { require('./agent-company.cjs').activity({ actor: 'board', action: 'connect.written', entityType: 'client', entityId: client, summary: 'added Arsenale to ' + pv.file + (backup ? ' (backup kept)' : ''), via: actor.door }) } catch { /* no company */ }
  return { client, file: pv.file, written: true, backup }
}

/** The short text a user pastes into a client that ignores server
 *  instructions (spec R-1.6). */
const CUSTOM_INSTRUCTIONS = 'Use the Arsenale tools: at the start of a conversation call hello and get_inbox; call start_job before distinct work, log_step for each step, finish_job with a plain summary; ask_you when I may be away; check_action before sending, posting, paying, deleting or sharing anything.'

module.exports = { CLIENTS, card, preview, apply, configFile, server, CUSTOM_INSTRUCTIONS, LOG }
