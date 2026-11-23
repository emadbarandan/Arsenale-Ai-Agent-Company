/* The string catalogue (spec 1.4 section 4.4 rule 3, D16): every Plan view key is in
 * tools/strings/catalogue.json, no Plan view holds a bare text literal outside T(), and no Persian
 * text ships. Fast: it reads the sources, no browser. */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const X = require('../strings/extract.cjs')

test('the catalogue holds every T() key of the Plan views and nothing else', () => {
  const r = X.check()
  assert.deepEqual(r.missing, [], 'keys missing from tools/strings/catalogue.json (run node tools/strings/extract.cjs)')
  assert.deepEqual(r.stale, [], 'catalogue keys no view uses any more')
  const cat = JSON.parse(fs.readFileSync(X.CATALOGUE, 'utf8'))
  assert.ok(Object.keys(cat.strings).length >= 50)
  for (const [k, v] of Object.entries(cat.strings)) assert.equal(v, k, 'English: the key is the text')
})

test('the Plan views have no bare text literal outside T()', () => {
  assert.deepEqual(X.build().bare, [])
})

test('a planted bare string is caught, and T() text is not', () => {
  assert.equal(X.bareLiterals("const a = '<p>Hello there</p>'").length, 1)
  assert.equal(X.bareLiterals("const a = '<b>' + T('Hello there') + '</b>'").length, 0)
  assert.equal(X.bareLiterals("const a = '<button>Save'").length, 1)
  assert.equal(X.bareLiterals("const a = 'Save the plan'").length, 1)
  assert.deepEqual(X.keysOf("T('A') + T('B \\'c\\'') + T('A')"), ['A', "B 'c'"])
})

test('no Arabic script ships in the catalogue or the Plan views (D16)', () => {
  const files = [X.CATALOGUE, ...X.SOURCES.map((f) => require('path').join(__dirname, '..', f))]
  for (const f of files) assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /\p{Script=Arabic}/u, f)
})
