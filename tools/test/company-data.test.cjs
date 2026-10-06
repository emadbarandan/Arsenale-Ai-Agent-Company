/* The company data layer (agent-company.cjs): resolution of old run records,
 * spending in tokens and USD, budgets on and off, the org-chart cycle guard,
 * init and the newer-schema lock. Run: node --test "tools/test/*.test.cjs" */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const { makeSandbox, hashTree, thisMonth, SEED } = require('./helpers.cjs')

function withCompany(t, opts) {
  const sb = makeSandbox(opts)
  t.after(() => sb.cleanup())
  const C = sb.mod('agent-company.cjs')
  C.companyInit(opts && opts.seed !== undefined ? opts.seed : SEED, ['implementer', 'tester', 'ui-designer', 'code-reviewer', 'engineering-lead', 'product-lead'])
  return { sb, C, B: require(path.join(sb.tools, 'build-agent-dashboard.cjs')) }
}

test('Persian names match across keyboards: kaf, yeh, ZWNJ and digits', () => {
  const sb = makeSandbox()
  try {
    const C = sb.mod('agent-company.cjs')
    assert.equal(C.normName('رفع خطای كاربر'), C.normName('رفع خطای کاربر'))
    assert.equal(C.normName('علي'), 'علی')
    assert.equal(C.normName('می‌خواهم'), 'میخواهم')
    assert.equal(C.normName('نسخه ۱۲'), 'نسخه 12')
    assert.equal(C.normName('  Demo Calc '), 'demo calc')
  } finally { sb.cleanup() }
})

test('AT-3: an old run with a free-text project resolves by alias, and no run file changes', (t) => {
  const { sb, C, B } = withCompany(t)
  sb.measured('implementer', 'democalc', 1000)
  sb.measured('ui-designer', 'داشبورد', 500, { finishedAt: new Date().toISOString() })
  sb.run({ agent: 'tester', project: 'Demo Calc (feature branch)', finishedAt: new Date().toISOString() })
  sb.run({ agent: 'tester', project: 'workspace' })
  const before = hashTree(sb.runs)
  const state = B.collect()
  const cs = C.companyState(state)
  C.budgetCheck(state, { agent: 'tester', project: 'democalc' })
  C.noteIncidents(state)
  const R = C.resolver(C.readCompany(), new Map(state.agents.map((a) => [a.name, a])))
  const rec = state.runs.find((r) => r.project === 'democalc')
  assert.equal(R.project(rec).id, 'demo-calc')
  assert.equal(R.office(rec), 'engineering')
  // today's runs carry the resolution for the page, in memory only
  const fa = state.runs.find((r) => r.project === 'داشبورد')
  assert.equal(fa.projectId, 'tide-app')
  assert.equal(fa.officeId, 'studio')
  assert.equal(state.runs.find((r) => /feature branch/.test(r.project)).projectId, 'demo-calc')
  assert.equal(cs.unmapped.workspace, 1)
  assert.deepEqual(hashTree(sb.runs), before, 'run files must be byte-identical after reading')
})

test('an explicit officeId on a new run overrides the project office', (t) => {
  const { sb, C, B } = withCompany(t)
  sb.measured('tester', 'democalc', 100, { officeId: 'hq' })
  const st = C.standings(B.collect(), C.readCompany())
  assert.equal(st.offices.hq.spend.tokens, 100)
  assert.equal(st.offices.engineering.spend.tokens, 0)
})

test('AT-24: a run that ends after midnight on the 1st counts in the new month only', (t) => {
  const { C } = withCompany(t)
  const co = C.readCompany()
  const state = { agents: [], active: [], runs: [{ agent: 'tester', project: 'democalc', startedAt: new Date(2026, 9, 31, 23, 50).toISOString(), finishedAt: new Date(2026, 10, 1, 0, 20).toISOString(), tokTotal: 10, tokSrc: 'transcript', costUsd: null }] }
  const ev = C.costEvents(state, co)
  assert.equal(ev[0].periodKey, '2026-11')
  assert.equal(C.standings(state, co, '2026-10').company.spend.tokens, 0)
  assert.equal(C.standings(state, co, '2026-11').company.spend.tokens, 10)
})

test('AT-9: runs without token data count as unmeasured, never as free', (t) => {
  const { sb, C, B } = withCompany(t)
  for (let i = 0; i < 7; i++) sb.measured('tester', 'democalc', 100)
  for (let i = 0; i < 3; i++) sb.run({ agent: 'tester', project: 'democalc' })
  const sp = C.standings(B.collect(), C.readCompany()).company.spend
  assert.equal(sp.runs, 10)
  assert.equal(sp.unmeasured, 3)
  assert.equal(sp.tokens, 700)
})

test('USD: priced runs sum, a missing price is n/a (never 0), a mix is partial', (t) => {
  const prices = { Sonnet: { input: 2, output: 10, cacheRead: 0.2, cacheWrite5m: 2.5, cacheWrite1h: 4 } }
  const { sb, C, B } = withCompany(t, { prices })
  sb.measured('tester', 'democalc', 1000000)                 // Sonnet: $2.00
  sb.measured('tester', 'democalc', 500000)                  // Sonnet: $1.00
  let sp = C.standings(B.collect(), C.readCompany()).employees.tester.spend
  assert.equal(sp.usdStatus, 'ok')
  assert.equal(sp.usd, 3)
  sb.run({ agent: 'tester', project: 'democalc', tokens: 4000 }) // reported tokens, no transcript: no price possible
  sp = C.standings(B.collect(), C.readCompany()).employees.tester.spend
  assert.equal(sp.usdStatus, 'partial')
  assert.equal(sp.usd, 3)
  assert.equal(sp.usdMissing, 1)
  assert.equal(sp.tokens, 1504000)
  // a model with no price at all
  sb.measured('ui-designer', 'tide', 1000, { model: 'Opus 5.5' })
  const ui = C.standings(B.collect(), C.readCompany()).employees['ui-designer'].spend
  assert.equal(ui.usdStatus, 'na')
  assert.equal(ui.usd, 0)
  // nothing measured at all: 0 is a real 0
  assert.equal(C.spendOf([]).usdStatus, 'none')
})

test('budget levels: none, off, ok, soft, over, stop; a limit of 0 allows nothing', (t) => {
  const { C } = withCompany(t)
  const sp = (tokens, usd, status) => ({ tokens, usd: usd || 0, usdStatus: status || 'ok' })
  const b = (x) => C.cleanBudget(Object.assign({ monthlyTokens: 1000, softAlertPct: 80 }, x))
  assert.equal(C.evalBudget(null, sp(5), true).level, 'none')
  assert.equal(C.evalBudget(b({ enabled: false }), sp(5000), true).level, 'off')
  assert.equal(C.evalBudget(b(), sp(5000), false).level, 'off', 'master switch off')
  assert.equal(C.evalBudget(b(), sp(100), true).level, 'ok')
  assert.equal(C.evalBudget(b(), sp(810), true).level, 'soft')
  assert.equal(C.evalBudget(b(), sp(1000), true).level, 'over')
  assert.equal(C.evalBudget(b({ hardStop: true }), sp(1000), true).level, 'stop')
  assert.equal(C.evalBudget(b({ monthlyTokens: 0, hardStop: true }), sp(0), true).level, 'stop')
  // USD limit with no prices: the token side still counts, USD shows n/a
  const e = C.evalBudget(b({ monthlyUsd: 10 }), sp(100, 0, 'na'), true)
  assert.equal(e.usd.status, 'na')
  assert.equal(e.usd.pct, null)
  assert.equal(e.level, 'ok')
  // USD over while tokens are fine
  assert.equal(C.evalBudget(b({ monthlyUsd: 10, hardStop: true }), sp(100, 12), true).level, 'stop')
  // the first draft's {unit, monthlyLimit} still reads as a limit
  assert.equal(C.cleanBudget({ unit: 'usd', monthlyLimit: 5 }).monthlyUsd, 5)
  assert.equal(C.cleanBudget({ monthlyLimit: 7 }).monthlyTokens, 7)
})

test('budget input is validated strictly', (t) => {
  const { C } = withCompany(t)
  assert.throws(() => C.validateBudget({ monthlyTokens: '1M' }), /whole number of tokens/)
  assert.throws(() => C.validateBudget({ monthlyTokens: -5 }), /whole number of tokens/)
  assert.throws(() => C.validateBudget({ monthlyTokens: 10.5 }), /whole number of tokens/)
  assert.throws(() => C.validateBudget({ monthlyTokens: 2e9 }), /At most 1,000,000,000/)
  assert.throws(() => C.validateBudget({ monthlyUsd: '12.345' }), /2 decimals/)
  assert.throws(() => C.validateBudget({ monthlyUsd: 200000 }), /100,000/)
  assert.throws(() => C.validateBudget({ softAlertPct: 100 }), /1 to 99/)
  assert.equal(C.validateBudget(null), null)
  const v = C.validateBudget({ monthlyTokens: '2000000', monthlyUsd: '25.50', softAlertPct: '75', hardStop: true, enabled: false })
  assert.deepEqual(v, { enabled: false, period: 'monthly', monthlyTokens: 2000000, monthlyUsd: 25.5, softAlertPct: 75, hardStop: true })
  assert.equal(C.validateBudget({ monthlyTokens: '' }).monthlyTokens, null, 'empty means no limit')
  assert.equal(C.validateBudget({ monthlyTokens: 0 }).monthlyTokens, 0, '0 is kept: nothing may be spent')
})

test('AT-10 (data): over a hard limit the check says stop; budgets off lets it pass, a pause still stops', (t) => {
  const { sb, C, B } = withCompany(t)
  sb.measured('tester', 'democalc', 505000)
  C.setBudget({ scope: 'employee', id: 'tester', budget: { monthlyTokens: 500000, hardStop: true }, by: 'board' }, 'cli')
  let r = C.budgetCheck(B.collect(), { agent: 'tester' })
  assert.equal(r.level, 'stop')
  assert.ok(r.lines.includes('stop employee:tester 505000/500000'), r.lines.join('\n'))
  C.setBudgetsEnabled(false, 'board', 'cli')
  r = C.budgetCheck(B.collect(), { agent: 'tester' })
  assert.equal(r.level, 'ok')
  C.updateEmployee({ id: 'tester', status: 'paused', pauseReason: 'owner asked', by: 'board' }, 'cli')
  r = C.budgetCheck(B.collect(), { agent: 'tester' })
  assert.equal(r.level, 'stop')
  assert.match(r.lines[0], /^stop employee:tester paused/)
})

test('a per-office switch: that office stops counting, the others keep their alerts', (t) => {
  const { sb, C, B } = withCompany(t)
  sb.measured('tester', 'democalc', 900)
  sb.measured('ui-designer', 'tide', 900)
  C.setBudget({ scope: 'office', id: 'engineering', budget: { monthlyTokens: 1000, enabled: false }, by: 'board' }, 'cli')
  C.setBudget({ scope: 'office', id: 'studio', budget: { monthlyTokens: 1000 }, by: 'board' }, 'cli')
  const st = C.standings(B.collect(), C.readCompany())
  assert.equal(st.offices.engineering.budget.level, 'off')
  assert.equal(st.offices.engineering.spend.tokens, 900, 'usage is still counted when the budget is off')
  assert.equal(st.offices.studio.budget.level, 'soft')
  assert.equal(C.noteIncidents(B.collect()).filter((i) => i.scope === 'office').map((i) => i.scopeId).join(), 'studio')
})

test('AT-8: crossing the soft limit is logged once per scope and month', (t) => {
  const { sb, C, B } = withCompany(t)
  C.setBudget({ scope: 'employee', id: 'implementer', budget: { monthlyTokens: 1000000, softAlertPct: 80 }, by: 'board' }, 'cli')
  sb.measured('implementer', 'democalc', 790000)
  assert.equal(C.noteIncidents(B.collect()).length, 0)
  sb.measured('implementer', 'democalc', 20000)
  const first = C.noteIncidents(B.collect())
  assert.equal(first.length, 1)
  assert.equal(first[0].kind, 'alert')
  assert.equal(first[0].pct, 81)
  sb.measured('implementer', 'democalc', 5000)
  assert.equal(C.noteIncidents(B.collect()).length, 0)
  assert.equal(sb.lines('company/budget-incidents.jsonl').length, 1)
  assert.equal(sb.lines('company/activity.jsonl').filter((l) => l.action === 'budget.alert').length, 1)
})

test('AT-6: a reportsTo that closes a loop is refused, and employees.json stays as it was', (t) => {
  const { sb, C } = withCompany(t)
  C.updateEmployee({ id: 'code-reviewer', reportsTo: 'implementer', by: 'board' }, 'cli')
  const before = fs.readFileSync(path.join(sb.company, 'employees.json'), 'utf8')
  assert.throws(() => C.updateEmployee({ id: 'implementer', reportsTo: 'code-reviewer', by: 'board' }, 'cli'),
    (e) => e.code === 409 && /would create a cycle: implementer → code-reviewer → implementer/.test(e.message))
  assert.equal(fs.readFileSync(path.join(sb.company, 'employees.json'), 'utf8'), before)
})

test('the org chart: heads report to the CEO, staff to their head; contractors and retired are told apart', (t) => {
  const { sb, C, B } = withCompany(t)
  sb.run({ agent: 'general-purpose', project: 'tide' })
  sb.run({ agent: 'crew-tester', project: 'tide' })
  // an employee whose definition file was removed: retired, history kept
  const all = JSON.parse(fs.readFileSync(path.join(sb.company, 'employees.json'), 'utf8'))
  all['old-agent'] = { homeOfficeId: 'hq' }
  fs.writeFileSync(path.join(sb.company, 'employees.json'), JSON.stringify(all))
  const cs = C.companyState(B.collect())
  const by = (id) => cs.employees.find((e) => e.id === id)
  assert.equal(by('supervisor').reportsTo, 'board')
  assert.equal(by('engineering-lead').reportsTo, 'supervisor')
  assert.equal(by('engineering-lead').zone, 'lead')
  assert.equal(by('tester').reportsTo, 'engineering-lead')
  assert.equal(by('code-reviewer').reportsTo, 'supervisor', 'HQ is headed by the supervisor')
  assert.equal(by('general-purpose').kind, 'contractor')
  assert.equal(by('crew-tester').kind, 'contractor')
  assert.equal(by('old-agent').kind, 'retired')
  assert.equal(by('implementer').model, 'Sonnet')
})

test('--company-init rules: refuses an existing folder, a bad office id and a looping seed', (t) => {
  const sb = makeSandbox()
  t.after(() => sb.cleanup())
  const C = sb.mod('agent-company.cjs')
  assert.throws(() => C.companyInit({ offices: [{ id: 'Big Office' }] }, []), /bad office id "Big Office".*"big-office"/)
  assert.equal(fs.existsSync(sb.company), false, 'a refused seed leaves no folder')
  assert.throws(() => C.companyInit({ offices: [{ id: 'hq', leadEmployeeId: 'supervisor' }], employees: { a: { reportsTo: 'b' }, b: { reportsTo: 'a' } } }, ['a', 'b']), /cycle/)
  const r = C.companyInit(null, ['implementer'])
  assert.equal(r.offices, 1)
  assert.equal(sb.read('company/offices.json')[0].id, 'hq')
  assert.throws(() => C.companyInit(null, []), (e) => e.code === 409 && /already exists/.test(e.message))
})

test('AT-18: a company written by a newer dashboard is read-only', (t) => {
  const { sb, C, B } = withCompany(t)
  const c = sb.read('company/company.json')
  c.schemaVersion = 2
  fs.writeFileSync(path.join(sb.company, 'company.json'), JSON.stringify(c))
  assert.equal(C.companyState(B.collect()).readOnly, true)
  assert.throws(() => C.setBudget({ scope: 'company', budget: { monthlyTokens: 5 }, by: 'board' }, 'cli'), (e) => e.code === 409 && /newer dashboard/.test(e.message))
  assert.throws(() => C.setBudgetsEnabled(false, 'board', 'cli'), (e) => e.code === 409)
})

test('no company folder: nothing configured, and the check says ok', () => {
  const sb = makeSandbox()
  try {
    const C = sb.mod('agent-company.cjs')
    const B = require(path.join(sb.tools, 'build-agent-dashboard.cjs'))
    assert.deepEqual(C.companyState(B.collect()), { configured: false })
    assert.equal(C.budgetCheck(B.collect(), { agent: 'tester' }).level, 'ok')
    assert.equal(C.stampHeartbeat(), false)
    assert.equal(fs.existsSync(sb.company), false, 'reading never creates the folder')
  } finally { sb.cleanup() }
})

test('only the Board sets budgets and pauses', (t) => {
  const { C } = withCompany(t)
  assert.throws(() => C.setBudget({ scope: 'company', budget: { monthlyTokens: 5 }, by: 'supervisor' }, 'cli'), (e) => e.code === 403)
  assert.throws(() => C.updateEmployee({ id: 'tester', status: 'paused', by: 'agent:tester' }, 'cli'), (e) => e.code === 403)
})

test('the page shows today\'s runs in their office and the company in the page data', (t) => {
  const { sb, B } = withCompany(t)
  sb.measured('tester', 'democalc', 10, { finishedAt: new Date().toISOString() })
  const state = B.collect()
  const html = B.renderPage(state, { live: true, token: 't', lang: 'en' })
  assert.match(html, /<title>Arsenale<\/title>/)
  assert.match(html, /"configured":true/)
  assert.match(B.renderPage(state, { lang: 'fa' }), /<html lang="fa" dir="rtl">/)
  void thisMonth
})

test('a job with no project and no office falls back to the member\'s home office, then Unassigned', (t) => {
  const { C } = withCompany(t)
  const co = C.readCompany()
  const R = C.resolver(co, new Map())
  const homed = co.offices.find((o) => !o.builtIn)
  co.employees.homed = { homeOfficeId: homed.id }
  co.employees.nowhere = { homeOfficeId: 'no-such-office' }
  assert.equal(R.office({ agent: 'homed', task: 'x' }), homed.id)
  assert.equal(R.office({ agent: 'nowhere', task: 'x' }), C.UNASSIGNED)
  assert.equal(R.office({ agent: 'stranger', task: 'x' }), C.UNASSIGNED)
  // an explicit office still wins over the home office
  const other = co.offices.find((o) => !o.builtIn && o.id !== homed.id)
  if (other) assert.equal(R.office({ agent: 'homed', officeId: other.id }), other.id)
})
