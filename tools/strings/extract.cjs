/* The string catalogue (spec 1.4 section 4.4, rule 3, and decision D16).
 *
 * Every string a person reads on a Plan screen goes through T(key). In English the key is the
 * text (dashboard-strings.cjs). This collects the keys of the Plan views into
 * tools/strings/catalogue.json, one entry per key, so a translation is a second file with the same
 * keys, and checks that no Plan view holds a bare text literal outside T().
 *
 *   node tools/strings/extract.cjs           rewrite catalogue.json from the sources
 *   node tools/strings/extract.cjs --check   exit 1 when the catalogue is out of date or a view has a bare literal
 *
 * No Persian text ships in 1.4: the catalogue is English, and language.test.cjs is unchanged. */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const CATALOGUE = path.join(__dirname, 'catalogue.json')
/** The Plan views: the files whose every string is catalogued. */
const SOURCES = ['pages/office/client/plan.js']

// a single-quoted JS string literal, escapes included
const LITERAL = /'((?:[^'\\\n]|\\.)*)'/g
const unescape_ = (s) => s.replace(/\\(['\\])/g, '$1').replace(/\\n/g, '\n').replace(/\\u2026/g, '…')

/** The T('...') keys of a source text, in order of appearance, without duplicates. */
function keysOf(src) {
  const out = new Set()
  for (const m of src.matchAll(/\bT\(\s*'((?:[^'\\\n]|\\.)*)'\s*\)/g)) out.add(unescape_(m[1]))
  return [...out]
}

/** Text a person would read that is not inside T(): words between tags, before the first tag or
 *  after the last one in an HTML string, and a plain capitalised phrase. Comments are ignored. */
function bareLiterals(src) {
  const code = src.split('\n').map((l) => l.replace(/^\s*\/\/.*$/, '').replace(/\s\/\/ .*$/, '')).join('\n')
  const noT = code.replace(/\bT\(\s*'(?:[^'\\\n]|\\.)*'\s*\)/g, 'T()')
  const bad = []
  for (const m of noT.matchAll(LITERAL)) {
    const lit = m[1]
    if (!lit) continue
    let why = ''
    const between = [...lit.matchAll(/>([^<>]*)(?=<)/g)].map((x) => x[1])
    if (between.some((t) => /[A-Za-z]{2}/.test(t.replace(/&\w+;/g, '')))) why = 'text between tags'
    else if (/>([^<>]*[A-Za-z]{2}[^<>]*)$/.test(lit)) why = 'text after a tag'
    else if (/^[^<>]*[A-Za-z]{2}[^<>]*</.test(lit) && !/^\s*[a-z-]+=/.test(lit) && !/^[a-z]/.test(lit)) why = 'text before a tag'
    else if (/^[A-Z][a-z]+(?: [A-Za-z][a-z]*)*[.:…!?]?$/.test(lit) && lit.length > 2) why = 'plain phrase'
    if (why) bad.push({ text: lit, why })
  }
  return bad
}

function build() {
  const keys = new Set()
  const bare = []
  for (const f of SOURCES) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8')
    for (const k of keysOf(src)) keys.add(k)
    for (const b of bareLiterals(src)) bare.push(Object.assign({ file: f }, b))
  }
  const sorted = [...keys].sort((a, b) => a.localeCompare(b, 'en'))
  const strings = {}
  for (const k of sorted) strings[k] = k
  return { catalogue: { locale: 'en', note: 'Keys are the English text. A translation repeats the keys with its own values. No Persian ships in 1.4.', strings }, bare }
}

function read() { try { return JSON.parse(fs.readFileSync(CATALOGUE, 'utf8')) } catch { return null } }

/** Problems: keys used in a view and missing from catalogue.json, and bare literals. */
function check() {
  const { catalogue, bare } = build()
  const have = read()
  const missing = have ? Object.keys(catalogue.strings).filter((k) => !(k in have.strings)) : Object.keys(catalogue.strings)
  const stale = have ? Object.keys(have.strings).filter((k) => !(k in catalogue.strings)) : []
  return { missing, stale, bare }
}

if (require.main === module) {
  if (process.argv.includes('--check')) {
    const r = check()
    for (const k of r.missing) console.log('missing from catalogue: ' + k)
    for (const k of r.stale) console.log('not used any more: ' + k)
    for (const b of r.bare) console.log('bare text (' + b.why + ') in ' + b.file + ': ' + b.text)
    process.exit(r.missing.length || r.stale.length || r.bare.length ? 1 : 0)
  }
  const { catalogue, bare } = build()
  fs.writeFileSync(CATALOGUE, JSON.stringify(catalogue, null, 2) + '\n')
  console.log('catalogue.json: ' + Object.keys(catalogue.strings).length + ' strings')
  for (const b of bare) console.log('bare text (' + b.why + ') in ' + b.file + ': ' + b.text)
}

module.exports = { keysOf, bareLiterals, build, check, SOURCES, CATALOGUE }
