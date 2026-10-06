#!/usr/bin/env node
/* Optional Claude Code hook: logs every sub-agent (the Task / Agent tool) on
 * the Arsenale dashboard without the main session having to remember it.
 *
 * Wire it for PreToolUse and PostToolUse with the matcher "Task|Agent"
 * (settings.example.json next to this file). Claude Code passes a JSON object
 * on standard input; this reads only these fields, and copes with any of them
 * missing:
 *   hook_event_name   "PreToolUse" or "PostToolUse"
 *   session_id, tool_use_id, cwd
 *   tool_name         "Task" or "Agent"
 *   tool_input        { subagent_type, description, prompt, model }
 *   tool_response     (PostToolUse) usage numbers, when present
 * The field names were written against Claude Code's hook documentation and
 * are not guaranteed across versions: if a field is renamed, the run is still
 * logged, with less detail. EXPERIMENTAL.
 *
 * It must never get in the way: it prints nothing on standard output, never
 * exits non-zero, and gives up quietly on anything unexpected. Use either
 * these hooks or the logging instructions in CLAUDE.md, not both, or each
 * sub-agent shows twice.
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { spawnSync } = require('child_process')

const BIN = path.join(__dirname, '..', '..', '..', 'bin', 'arsenale.cjs')

function main() {
  let ev
  try { ev = JSON.parse(fs.readFileSync(0, 'utf8').replace(/^﻿/, '')) } catch { return }
  if (!ev || !/^(Task|Agent)$/.test(String(ev.tool_name || ''))) return
  const P = require(path.join(__dirname, '..', '..', '..', 'tools', 'paths.cjs'))
  const input = ev.tool_input && typeof ev.tool_input === 'object' ? ev.tool_input : {}
  // pairs the Pre and Post call of one sub-agent: the tool-use id when Claude
  // Code sends one, else the session and the exact prompt
  const key = crypto.createHash('sha1').update(String(ev.session_id || '') + '|' + (ev.tool_use_id || String(input.description || '') + '|' + String(input.prompt || ''))).digest('hex').slice(0, 24)
  const dir = path.join(P.RUNS, 'hooks')
  const pairFile = path.join(dir, key + '.json')
  const log = (args, json) => spawnSync(process.execPath, [BIN, 'log', ...args, '--stdin'], { input: JSON.stringify(json), encoding: 'utf8', env: process.env, timeout: 15000 })
  const event = String(ev.hook_event_name || '')
  const agent = String(input.subagent_type || 'general-purpose').slice(0, 60)
  const task = String(input.description || String(input.prompt || '').split('\n')[0] || 'sub-agent').slice(0, 200)
  const project = path.basename(String(ev.cwd || process.cwd()))
  if (event === 'PreToolUse') {
    const r = log(['--start'], { agent, task, project, model: String(input.model || ''), session: String(ev.session_id || '').slice(0, 80) })
    const id = String(r.stdout || '').trim().split('\n').pop()
    if (r.status === 0 && id) {
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(pairFile, JSON.stringify({ id, agent, task, project, at: new Date().toISOString() }))
    }
  } else if (event === 'PostToolUse') {
    let pair = null
    try { pair = JSON.parse(fs.readFileSync(pairFile, 'utf8')) } catch { /* started before the hook was installed */ }
    const resp = ev.tool_response && typeof ev.tool_response === 'object' ? ev.tool_response : {}
    const num = (...vals) => { for (const v of vals) if (typeof v === 'number' && isFinite(v)) return v; return 0 }
    const usage = { tokens: num(resp.totalTokens, resp.usage && resp.usage.total_tokens), toolUses: num(resp.totalToolUseCount), durationMs: num(resp.totalDurationMs) }
    const failed = resp.is_error === true || /^error/i.test(String(resp.error || ''))
    log([], Object.assign({ agent, task, project, status: failed ? 'failed' : 'ok', summary: '' }, pair ? { id: pair.id } : {}, usage.tokens || usage.toolUses || usage.durationMs ? { usage } : {}))
    try { fs.unlinkSync(pairFile) } catch { /* nothing to clean */ }
  }
}

try { main() } catch { /* a logging hook never breaks the session */ }
process.exit(0)
