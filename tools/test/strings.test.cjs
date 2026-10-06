/* Every string the 1.0 screens pass to T() has a Persian text (spec R-0.4),
 * including the words picked by a condition (T(n === 1 ? 'job' : 'jobs'))
 * and the labels that come from the server (safety categories, connect
 * notes, deliverable reasons). A fast check without a browser; the browser
 * tests in language.test.cjs then read the drawn screens. */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const TOOLS = path.join(__dirname, '..')
const { FA } = require(path.join(TOOLS, 'dashboard-strings.cjs'))
const has = (k) => Object.prototype.hasOwnProperty.call(FA, k)

/** The quoted literals inside every T( … ) call of a source file. */
function keysIn(src) {
  const out = new Set()
  let i = 0
  while ((i = src.indexOf('T(', i)) >= 0) {
    if (/[\w.$]/.test(src[i - 1] || '')) { i += 2; continue }
    // the call's argument, up to its closing parenthesis
    let depth = 0, j = i + 1, q = ''
    for (; j < src.length; j++) {
      const c = src[j]
      if (q) { if (c === '\\') j++; else if (c === q) q = ''; continue }
      if (c === "'" || c === '"' || c === '`') q = c
      else if (c === '(') depth++
      else if (c === ')') { depth--; if (!depth) break }
    }
    const arg = src.slice(i + 2, j)
    for (const m of arg.matchAll(/'((?:\\.|[^'\\])*)'/g)) out.add(m[1].replace(/\\'/g, "'").replace(/\\"/g, '"'))
    i = j
  }
  return out
}

test('every T() string of the 1.0 screens has a Persian text', () => {
  const src = fs.readFileSync(path.join(TOOLS, 'everyone-page.cjs'), 'utf8')
  const keys = keysIn(src)
  // values of the lookup tables the screens pass through T()
  for (const name of ['STATE', 'TIER', 'VAL', 'KIND', 'STATUS_WORD', 'SHORT']) {
    const m = new RegExp('const ' + name + ' = \\{([^}]*)\\}').exec(src)
    assert.ok(m, name)
    for (const v of m[1].matchAll(/:\s*'([^']+)'/g)) keys.add(v[1])
  }
  // tables of arrays: every sentence in them is shown (the plain words of an
  // action, the settings tabs); ids and icon names are not
  for (const name of ['CAT', 'SETTABS']) {
    const at = src.indexOf('const ' + name + ' = ')
    assert.ok(at >= 0, name)
    // CAT spans lines up to its closing brace; SETTABS is one line
    const body = src.slice(at, name === 'CAT' ? src.indexOf('\n  }', at) : src.indexOf('\n', at))
    for (const v of body.matchAll(/'((?:\\.|[^'\\])*)'/g)) if (/^[A-Z]/.test(v[1]) || / /.test(v[1])) keys.add(v[1].replace(/\\'/g, "'"))
  }
  // what the wizard's guide says at each step
  for (const v of /const say = \{([^}]*)\}/.exec(src)[1].matchAll(/'([^']+)'/g)) keys.add(v[1])
  for (const v of /const TEMPLATES = \[([\s\S]*?)\n {2}\]/.exec(src)[1].matchAll(/'([^']+)'/g)) keys.add(v[1])
  const pol = require(path.join(TOOLS, 'policy.cjs'))
  for (const c of pol.CATEGORIES) { keys.add(c.label); if (c.examples) keys.add(c.examples) }
  const C = require(path.join(TOOLS, 'connect.cjs'))
  for (const id of C.CLIENTS) { const c = C.card(id); if (c.note) keys.add(c.note) }
  for (const r of ['protected file', 'outside your deliverable folders', 'file no longer there', 'a hard link to another file', 'The deliverable store is full (5 GB): nothing more is stored', 'type not previewed', 'not a file', 'not a valid image', 'not plain text', 'not a valid PDF']) keys.add(r)
  // literals inside T( … ) that are compared, never shown
  const NOT_SHOWN = new Set(['retired', 'paused', 'cursor', 'delete'])
  const missing = [...keys].filter((k) => /[A-Za-z]{2}/.test(k) && !has(k) && !NOT_SHOWN.has(k))
  assert.deepEqual(missing, [])
})

test('the org chart and the campus have a Persian text for every T() string', () => {
  const src = fs.readFileSync(path.join(TOOLS, 'agent-company-page.cjs'), 'utf8')
  const missing = [...keysIn(src)].filter((k) => /[A-Za-z]{2}/.test(k) && !has(k) && !['retired', 'user'].includes(k))
  assert.deepEqual(missing, [])
})

test('the new navigation words of the office page have a Persian text', () => {
  const src = fs.readFileSync(path.join(TOOLS, 'agent-office-page.cjs'), 'utf8')
  const missing = [...keysIn(src)].filter((k) => /[A-Za-z]{2}/.test(k) && !has(k))
  assert.deepEqual(missing, [])
})
