/* A throwaway data folder (ARSENALE_HOME) for the dashboard tests.
 *
 * Each test copies tools/*.cjs into <tmp>/arsenale-home/tools and runs them
 * with ARSENALE_HOME pointing at <tmp>/arsenale-home, so agent-runs/, agents/
 * and company/ are all inside the temporary folder. Nothing under the real
 * home folder is read or written. All data is invented.
 */
const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const { spawnSync } = require('child_process')

const TOOLS = path.join(__dirname, '..')

const AGENTS = {
  'implementer': 'sonnet', 'tester': 'sonnet', 'ui-designer': 'opus', 'code-reviewer': 'sonnet',
  'engineering-lead': 'sonnet', 'product-lead': 'sonnet',
}

/** Same seed shape as company.example/seed.json, smaller. */
const SEED = {
  company: { name: 'Northwind Labs', issuePrefix: 'NW' },
  offices: [
    { id: 'engineering', name: 'Engineering', nameFa: 'مهندسی', leadEmployeeId: 'engineering-lead', theme: 'blue' },
    { id: 'studio', name: 'Studio', nameFa: 'استودیو', leadEmployeeId: 'product-lead', theme: 'teal' },
    { id: 'hq', name: 'HQ', leadEmployeeId: 'supervisor', theme: 'coral' },
  ],
  projects: [
    { id: 'demo-calc', name: 'Demo Calc', key: 'DCALC', officeId: 'engineering', aliases: ['democalc', 'Demo Calc'] },
    { id: 'tide-app', name: 'Tide app', key: 'TIDE', officeId: 'studio', aliases: ['tide', 'داشبورد'] },
  ],
  employees: {
    'implementer': { homeOfficeId: 'studio' },
    'tester': { homeOfficeId: 'engineering' },
    'ui-designer': { homeOfficeId: 'studio' },
    'code-reviewer': { homeOfficeId: 'hq' },
  },
}

/** A middle-of-the-month moment in the current month, so a run made with it
 *  lands in this month's budget whatever day the tests run on. */
function thisMonth(day, hour) {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), day || 2, hour || 12, 0, 0).toISOString()
}

function makeSandbox(opts = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-company-test-'))
  const root = path.join(base, 'arsenale-home')
  const tools = path.join(root, 'tools')
  fs.mkdirSync(tools, { recursive: true })
  for (const f of fs.readdirSync(TOOLS)) if (f.endsWith('.cjs')) fs.copyFileSync(path.join(TOOLS, f), path.join(tools, f))
  fs.writeFileSync(path.join(root, 'model-prices.json'), JSON.stringify({ models: opts.prices || {} }))
  // the user's own settings never leak in: no agent or transcript folders from the environment
  const env = Object.assign({}, process.env, { ARSENALE_HOME: root }, opts.env || {})
  delete env.ARSENALE_AGENT_DIRS
  delete env.ARSENALE_TRANSCRIPT_ROOTS
  if (opts.env) Object.assign(env, opts.env)
  const agents = path.join(root, 'agents')
  fs.mkdirSync(agents)
  for (const [name, model] of Object.entries(AGENTS)) {
    fs.writeFileSync(path.join(agents, name + '.md'), '---\nname: ' + name + '\ndescription: invented test agent\nmodel: ' + model + '\neffort: medium\ntools: Read\ncolor: blue\n---\n\nbody\n')
  }
  fs.writeFileSync(path.join(agents, 'AGENT-RULES.md'), '# rules\n')
  // the bundled office packs live next to tools/ in a checkout; in the
  // sandbox that is <root>/packs (the installed-state file sits there too,
  // which is harmless: it is not a pack folder)
  if (opts.packs) fs.cpSync(path.join(TOOLS, '..', 'packs'), path.join(root, 'packs'), { recursive: true })
  const runs = path.join(root, 'agent-runs')
  fs.mkdirSync(path.join(runs, 'active'), { recursive: true })
  fs.mkdirSync(path.join(runs, 'gates'))
  const sb = {
    base, root, tools, agents, runs, env, company: path.join(root, 'company'),
    /** A finished run record as old and new CLIs wrote them. */
    run(rec) {
      const r = Object.assign({ agent: 'implementer', task: 'invented task', status: 'ok', finishedAt: thisMonth(), startedAt: thisMonth(2, 11) }, rec)
      const file = path.join(runs, r.finishedAt.replace(/[:.]/g, '-') + '-' + r.agent + '-' + crypto.randomBytes(2).toString('hex') + '.json')
      fs.writeFileSync(file, JSON.stringify(r, null, 2))
      return file
    },
    /** A run with a transcript summary: tokens counted per model. */
    measured(agent, project, tokens, extra) {
      const model = (extra && extra.model) || 'Sonnet 5.5'
      return sb.run(Object.assign({
        agent, project, model,
        transcript: { found: true, tokensNew: tokens, tokens: { input: tokens, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 }, models: { [model]: { input: tokens, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 } }, toolCounts: {}, files: [] },
      }, extra || {}))
    },
    seed(seed) {
      const file = path.join(base, 'seed.json')
      fs.writeFileSync(file, JSON.stringify(seed || SEED))
      return file
    },
    cli(...args) {
      const r = spawnSync(process.execPath, [path.join(tools, 'log-agent-run.cjs'), ...args], { encoding: 'utf8', cwd: base, env, input: sb.stdin })
      return { code: r.status, out: r.stdout.trim(), err: r.stderr.trim() }
    },
    /** Fresh copies of the modules, bound to this sandbox. */
    mod(name) {
      for (const k of Object.keys(require.cache)) if (k.startsWith(tools)) delete require.cache[k]
      for (const k of ['ARSENALE_HOME', 'ARSENALE_AGENT_DIRS', 'ARSENALE_TRANSCRIPT_ROOTS']) { if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k] }
      return require(path.join(tools, name))
    },
    read(rel) { return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8')) },
    lines(rel) { try { return fs.readFileSync(path.join(root, rel), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) } catch { return [] } },
    cleanup() { fs.rmSync(base, { recursive: true, force: true }) },
  }
  return sb
}

/** Every file under a folder with its SHA-256, to prove nothing was rewritten. */
function hashTree(dir) {
  const out = {}
  const walk = (d) => {
    for (const n of fs.readdirSync(d)) {
      const f = path.join(d, n)
      if (fs.statSync(f).isDirectory()) walk(f)
      else out[path.relative(dir, f)] = crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')
    }
  }
  if (fs.existsSync(dir)) walk(dir)
  return out
}

/** An MCP client over stdio: starts tools/mcp-server.cjs in the sandbox and
 *  speaks newline-delimited JSON-RPC to it. */
function mcpClient(sb, name, extraEnv) {
  const { spawn } = require('child_process')
  const child = spawn(process.execPath, [path.join(sb.tools, 'mcp-server.cjs')], { env: Object.assign({}, sb.env, extraEnv || {}), stdio: ['pipe', 'pipe', 'pipe'] })
  let buf = '', next = 1, stderr = ''
  const waiting = new Map()
  const raw = []
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (d) => {
    buf += d
    let i
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1)
      if (!line.trim()) continue
      const msg = JSON.parse(line)
      raw.push(msg)
      const list = Array.isArray(msg) ? msg : [msg]
      for (const m of list) if (waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id) }
    }
  })
  child.stderr.on('data', (d) => { stderr += d })
  const rpc = (method, params) => new Promise((resolve, reject) => {
    const id = next++
    const t = setTimeout(() => reject(new Error('no reply to ' + method + ': ' + stderr)), 15000)
    waiting.set(id, (m) => { clearTimeout(t); resolve(m) })
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  })
  const api = {
    child, raw, rpc,
    send(line) { child.stdin.write(line + '\n') },
    async init() { const r = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: name || 'Test Client', version: '1.0' } }); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n'); return r },
    /** One tool call: { error, text, data } */
    async call(tool, args) {
      const r = await rpc('tools/call', { name: tool, arguments: args || {} })
      if (r.error) return { rpcError: r.error }
      return { error: !!r.result.isError, text: r.result.content[0].text, data: r.result.structuredContent }
    },
    alive() { return child.exitCode === null },
    close() { try { child.stdin.end() } catch { /* gone */ } child.kill() },
  }
  return api
}

/** The dashboard server for a sandbox, on a random port, holding the
 *  owner's key the way a browser does: the key URL it printed is opened once
 *  and the cookie it gives back is kept. Resolves { port, child, key, url (the
 *  key URL), cookie ("name=value" for a Cookie header), token (the page's
 *  write token), setCookie (the whole header), base }. The caller stops only
 *  this child. */
function startServer(sb, opts = {}) {
  const { spawn } = require('child_process')
  const http = require('http')
  const port = (opts.portBase || 46000) + Math.floor(Math.random() * 3000)
  const child = spawn(process.execPath, [path.join(sb.tools, 'agent-dashboard-server.cjs'), String(port)], { env: Object.assign({}, sb.env, opts.env || {}), stdio: ['ignore', 'pipe', 'pipe'] })
  return new Promise((resolve, fail) => {
    // a server that did not come up right is stopped, not left running
    const reject = (e) => { child.kill(); fail(e) }
    let out = '', seen = false
    const t = setTimeout(() => reject(new Error('server did not start: ' + out)), 10000)
    child.stdout.on('data', (d) => {
      out += d
      const m = /Arsenale dashboard: (\S+)/.exec(out)
      if (!m || seen) return
      seen = true
      clearTimeout(t)
      const url = m[1].replace('localhost', '127.0.0.1')
      const key = new URL(url).searchParams.get('k')
      http.get({ host: '127.0.0.1', port, path: '/?k=' + key, agent: false, headers: { Host: '127.0.0.1:' + port } }, (res) => {
        res.resume()
        const set = (res.headers['set-cookie'] || []).find((c) => c.startsWith('arsenale-key-'))
        if (res.statusCode !== 302 || !set) return reject(new Error('the key was not taken: ' + res.statusCode))
        // the page's X-Dashboard-Token, derived from the key as the server does
        const token = crypto.createHmac('sha256', key).update('arsenale-csrf-v1').digest('hex')
        resolve({ port, child, key, url, cookie: set.split(';')[0], token, setCookie: set, base: 'http://127.0.0.1:' + port + '/' })
      }).on('error', reject)
    })
    child.stderr.on('data', (d) => { out += d })
    child.on('exit', (c) => { clearTimeout(t); reject(new Error('server exited ' + c + ': ' + out)) })
  })
}

module.exports = { makeSandbox, hashTree, thisMonth, SEED, AGENTS, mcpClient, startServer }
