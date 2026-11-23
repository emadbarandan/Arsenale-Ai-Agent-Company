// npm run setup-hooks [-- --force]: points git at tools/hooks (the pre-push guard).
const { spawnSync } = require('child_process')
const path = require('path')
const root = path.join(__dirname, '..')
const git = (args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' })
const cur = (git(['config', '--get', 'core.hooksPath']).stdout || '').trim()
if (cur && cur !== 'tools/hooks' && !process.argv.includes('--force')) {
  console.error('core.hooksPath is already set to "' + cur + '"; not changing it. Run again with --force to replace it.')
  process.exit(1)
}
const r = git(['config', 'core.hooksPath', 'tools/hooks'])
if (r.status !== 0) { console.error('Could not set core.hooksPath (is this a git checkout?)'); process.exit(1) }
console.log('Git hooks installed: pre-push now guards the public release repo.')
