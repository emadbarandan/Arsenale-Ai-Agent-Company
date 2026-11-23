'use strict'
/* The price file (spec 1.3 section 3.2): show, init, check. `init` is the only
 * writer; reading never writes. Prices are USD per million tokens. */
const fs = require('fs')
const path = require('path')
const P = require('./paths.cjs')
const B = require('./build-agent-dashboard.cjs')

const FIELDS = ['input', 'output', 'cacheRead', 'cacheWrite5m', 'cacheWrite1h']
const STALE_DAYS = 90

const complete = (p) => !!p && typeof p === 'object' && FIELDS.every((k) => B.validPrice(p[k]))
const srcLine = (s) => (s && s.label ? s.label + ' (' + (s.url || 'no url') + '), fetched ' + (s.fetched || 'unknown date') : 'no source recorded')

function defaults() {
  return JSON.parse(P.stripBom(fs.readFileSync(P.PRICE_DEFAULTS, 'utf8')))
}
function ownerFile() {
  try {
    const j = JSON.parse(P.stripBom(fs.readFileSync(P.PRICES, 'utf8')))
    return j && typeof j === 'object' && !Array.isArray(j) ? j : {}
  } catch { return {} }
}
const modelsOf = (j) => (j && j.models && typeof j.models === 'object' && !Array.isArray(j.models) ? j.models : {})

/** Copy the shipped defaults into the owner's file. Refuses when the owner
 *  already has models, unless force (replace) or merge (add the missing). */
function init(opts, actor) {
  require('./runlog.cjs').requireBoard(actor)
  const o = opts || {}
  const cur = ownerFile()
  const have = modelsOf(cur)
  const def = defaults()
  const hasAny = Object.keys(have).length > 0
  if (hasAny && !o.force && !o.merge) {
    const e = new Error('model-prices.json already has prices; use --merge to add the missing models or --force to replace them')
    e.code = 409
    throw e
  }
  let models, added
  if (hasAny && o.merge && !o.force) {
    models = Object.assign({}, have)
    added = []
    for (const [k, v] of Object.entries(def.models)) if (!Object.hasOwn(have, k)) { models[k] = v; added.push(k) }
  } else {
    models = def.models
    added = Object.keys(def.models)
  }
  const next = Object.assign({}, cur, { source: def.source, models })
  fs.mkdirSync(path.dirname(P.PRICES), { recursive: true })
  B.writeAtomic(P.PRICES, JSON.stringify(next, null, 2) + '\n')
  return { file: P.PRICES, added, source: def.source }
}

/** Model keys seen in runs that have no complete price. */
function unpriced(state) {
  const prices = B.readPrices()
  const seen = new Set()
  for (const r of [].concat(state.runs || [], state.active || [])) {
    if (r.modelKey) seen.add(r.modelKey)
    if (r.transcript && r.transcript.models) for (const k of Object.keys(r.transcript.models)) seen.add(k)
  }
  return [...seen].filter((k) => k && k !== '?' && !complete(B.priceOf(prices, k))).sort()
}

function check(now) {
  const src = (B.readPricesFile() || {}).source || null
  const out = { unpriced: unpriced(B.collect()), source: src, stale: false, days: null }
  const t = src && Date.parse(src.fetched)
  if (Number.isFinite(t)) {
    out.days = Math.floor(((now || Date.now()) - t) / 864e5)
    out.stale = out.days > STALE_DAYS
  }
  return out
}

function show() {
  const j = B.readPricesFile() || {}
  return { file: fs.existsSync(P.PRICES) ? P.PRICES : P.PRICES_TEMPLATE, source: j.source || null, models: modelsOf(j) }
}

/** The CLI: returns the exit code, prints through out. */
function run(args, out) {
  const say = out || console.log
  const sub = args[0] || 'show'
  const f = new Set(args.slice(1))
  if (sub === 'show') {
    const s = show()
    say(s.file)
    const names = Object.keys(s.models)
    if (!names.length) say('no prices set: every cost shows n/a (run "arsenale prices init" for list prices)')
    for (const k of names) {
      const p = s.models[k]
      say('  ' + k.padEnd(12) + (complete(p) ? FIELDS.map((x) => x + ' ' + p[x]).join('  ') + (p.over100k ? '  (+ over100k rate)' : '') : 'n/a (incomplete or invalid)'))
    }
    say('source: ' + srcLine(s.source) + (s.source ? '' : ' (USD per million tokens)'))
    return 0
  }
  if (sub === 'init') {
    try {
      const RL = require('./runlog.cjs')
      const r = init({ force: f.has('--force'), merge: f.has('--merge') }, RL.cliActor({ by: 'board' }))
      say('wrote ' + r.file + (r.added.length ? ': ' + r.added.join(', ') : ': nothing missing'))
      say('source: ' + srcLine(r.source))
      return 0
    } catch (e) { console.error(e.message); return 1 }
  }
  if (sub === 'check') {
    const c = check()
    if (c.unpriced.length) say('no price for: ' + c.unpriced.join(', '))
    else say('every model seen in runs has a price')
    say('prices fetched: ' + (c.source && c.source.fetched ? c.source.fetched + (c.days !== null ? ' (' + c.days + ' days ago)' : '') : 'not recorded'))
    if (c.stale) say('check your prices')
    return c.unpriced.length ? 1 : 0
  }
  console.error('usage: arsenale prices [show|init|check] [--force|--merge]')
  return 1
}

module.exports = { init, check, show, run, unpriced, defaults }
