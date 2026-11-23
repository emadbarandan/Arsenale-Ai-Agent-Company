const path = require('path')
const { clientFunction } = require('../source.cjs')

// The browser half of the office page; the body is in client/part*.js, joined by
// clientFunction (pages/source.cjs). It is never run in Node.
const officeClient = clientFunction(path.join(__dirname, 'client'), 'officeClient()', ['part1.js', 'plan.js', 'part2.js', 'part3.js', 'part4.js'])

module.exports = { officeClient }
