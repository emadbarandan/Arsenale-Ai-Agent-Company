/* `npm test`: every *.test.cjs in this folder, listed by name. Node 20 cannot
 * take a glob after --test, and given the folder it would also run the
 * helpers here as test files. */
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const files = fs.readdirSync(__dirname).filter((f) => f.endsWith('.test.cjs')).sort().map((f) => path.join(__dirname, f))
const r = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' })
process.exit(r.status === null ? 1 : r.status)
