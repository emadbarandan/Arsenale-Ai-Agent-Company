// README and reference counts, version and repo URLs must match the tree.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const root = path.join(__dirname, '..', '..')
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8')
const PUBLIC = 'github.com/emadbarandan/Arsenale-Ai-Agent-Company'

const agents = fs.readdirSync(path.join(root, 'agents')).filter((f) => f.endsWith('.md') && !/^(AGENT-RULES|WORKFLOW)\.md$|\.template\.md$/.test(f)).length
const packs = fs.readdirSync(path.join(root, 'packs'), { withFileTypes: true }).filter((d) => d.isDirectory()).length
const heads = fs.readdirSync(path.join(root, 'agents')).filter((f) => /-lead\.md$/.test(f)).length // the office lead and the heads
const pkg = JSON.parse(read('package.json'))

test('README states the real agent and pack counts', () => {
  const m = read('README.md').match(/ships with (\d+) agents and (\d+) office packs/)
  assert.ok(m, 'README needs "ships with N agents and N office packs"')
  assert.deepStrictEqual([+m[1], +m[2]], [agents, packs])
})
test('reference states the real counts', () => {
  const s = read('docs/reference.md').replace(/\s+/g, ' ')
  const m = s.match(/(\d+) agents\b.*?(\d+) specialists.*?(\d+) (?:more )?office packs.*?\((\d+) in all\)/)
  assert.ok(m, 'reference agent-team sentence not found')
  assert.deepStrictEqual(m.slice(1).map(Number), [agents, agents - heads, packs - 1, packs])
})
test('version agrees across package.json, README, reference and CHANGELOG', () => {
  const v = pkg.version
  assert.ok(read('README.md').includes('Version ' + v + '.'))
  assert.ok(read('docs/reference.md').includes('Version ' + v + '.'))
  assert.ok(new RegExp('^## ' + v.replace(/\./g, '\\.') + ' \\(', 'm').test(read('CHANGELOG.md')))
})
test('repository links point at the public repo', () => {
  assert.ok(pkg.repository.url.includes(PUBLIC))
  assert.ok(pkg.homepage.includes(PUBLIC))
  assert.ok(pkg.bugs.includes(PUBLIC))
  for (const f of ['README.md', 'docs/reference.md', 'CONTRIBUTING.md', 'SECURITY.md', '.github/ISSUE_TEMPLATE/config.yml']) {
    for (const [u] of read(f).matchAll(/github\.com\/emadbarandan\/[A-Za-z0-9._-]+/g)) assert.ok(u.startsWith(PUBLIC), f + ': ' + u)
  }
})
