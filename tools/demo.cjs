/* `arsenale demo`: the dashboard on an invented company, in a temporary data
 * folder, so a newcomer sees a working floor in the first minute and the
 * README screenshots come from data nobody owns.
 *
 * Isolation: makeDemoHome() writes only inside a fresh folder under the OS
 * temp directory, and the caller sets ARSENALE_HOME to it before any other
 * module is loaded (paths.cjs reads it once). The agent definitions shown are
 * the ones bundled in this repo, read in place, never copied or changed. The
 * user's own ARSENALE_HOME, agents and transcripts are never opened. The
 * folder is removed when the demo stops.
 *
 * Everything here is invented: company, projects, tasks, numbers.
 */
const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')

const REPO_AGENTS = path.join(__dirname, '..', 'agents')

const SEED = {
  company: { name: 'Northwind Labs', issuePrefix: 'NW', budgetsEnabled: true, budget: { monthlyTokens: 40000000, softAlertPct: 80, hardStop: false } },
  offices: [
    { id: 'engineering', name: 'Engineering', leadEmployeeId: 'engineering-lead', profile: 'engineering', theme: 'blue', budget: { monthlyTokens: 12000000, softAlertPct: 80, hardStop: true } },
    { id: 'product', name: 'Product', leadEmployeeId: 'product-lead', profile: 'product', theme: 'teal', budget: { monthlyTokens: 9000000, softAlertPct: 75, hardStop: false } },
    { id: 'research', name: 'Research', leadEmployeeId: 'research-lead', profile: 'research', theme: 'violet' },
    { id: 'hq', name: 'HQ', leadEmployeeId: 'supervisor', profile: 'operations', theme: 'coral' },
  ],
  projects: [
    { id: 'ledger-api', name: 'Ledger API', key: 'LEDG', officeId: 'engineering', aliases: ['ledger', 'Ledger API'] },
    { id: 'atlas-app', name: 'Atlas app', key: 'ATLS', officeId: 'product', aliases: ['atlas', 'Atlas App'] },
    { id: 'orbit-site', name: 'Orbit website', key: 'ORBT', officeId: 'product', aliases: ['orbit'] },
    { id: 'search-spike', name: 'Search spike', key: 'SRCH', officeId: 'research', aliases: ['search'] },
    { id: 'tooling', name: 'Agent tooling', key: 'TOOL', officeId: 'hq', aliases: ['tooling', 'arsenale'] },
  ],
  employees: {
    'implementer': { homeOfficeId: 'engineering' }, 'tester': { homeOfficeId: 'engineering' },
    'code-reviewer': { homeOfficeId: 'engineering' }, 'security-reviewer': { homeOfficeId: 'engineering' },
    'data-migration': { homeOfficeId: 'engineering' }, 'performance': { homeOfficeId: 'engineering' },
    'release-builder': { homeOfficeId: 'engineering' }, 'release-manager': { homeOfficeId: 'engineering' },
    'domain-validator': { homeOfficeId: 'engineering' }, 'architecture-reviewer': { homeOfficeId: 'engineering' },
    'ui-designer': { homeOfficeId: 'product' }, 'ux-reviewer': { homeOfficeId: 'product' }, 'visual-qa': { homeOfficeId: 'product' },
    'spec-writer': { homeOfficeId: 'product' }, 'user-guide': { homeOfficeId: 'product' }, 'seo-specialist': { homeOfficeId: 'product' },
    'feature-scout': { homeOfficeId: 'research' },
    'dev-docs': { homeOfficeId: 'hq' }, 'docs-explainer': { homeOfficeId: 'hq' }, 'agent-builder': { homeOfficeId: 'hq' }, 'office-lead': { homeOfficeId: 'hq' },
  },
}

// [agent, model, project, task, status, tokens, minutes ago it finished, minutes it took]
const DONE = [
  ['spec-writer', 'Opus 5.5', 'atlas', 'Spec: offline mode for the Atlas app', 'ok', 182000, 410, 22],
  ['ui-designer', 'Opus 5.5', 'atlas', 'Three directions for the sync status bar', 'ok', 236000, 360, 31],
  ['implementer', 'Sonnet 5.5', 'ledger', 'Paginate the /entries endpoint', 'ok', 141000, 300, 26],
  ['tester', 'Sonnet 5.5', 'ledger', 'Tests for pagination edge cases', 'findings', 88000, 270, 18],
  ['code-reviewer', 'Sonnet 5.5', 'ledger', 'Review the pagination diff', 'findings', 64000, 240, 12],
  ['security-reviewer', 'Opus 5.5', 'ledger', 'Audit the new token refresh flow', 'ok', 151000, 200, 24],
  ['visual-qa', 'Sonnet 5.5', 'atlas', 'Compare the status bar with the chosen mockup', 'ok', 57000, 150, 14],
  ['seo-specialist', 'Sonnet 5.5', 'orbit', 'Audit titles and sitemap of the Orbit website', 'findings', 73000, 120, 19],
  ['feature-scout', 'Sonnet 5.5', 'search', 'What is missing in search for power users', 'ok', 119000, 95, 28],
  ['codex-cli', 'gpt-5-codex', 'tooling', 'Rename the config loader (logged by a shell script)', 'ok', 22000, 70, 6],
  ['dev-docs', 'Sonnet 5.5', 'tooling', 'README quick start for the new launcher', 'ok', 31000, 45, 9],
  ['release-manager', 'Sonnet 5.5', 'ledger', 'Plan release 2.4.0', 'failed', 15000, 20, 5],
]
// [agent, model, project, task, minutes since start, minutes since last step, steps]
const ACTIVE = [
  ['implementer', 'Sonnet 5.5', 'atlas', 'Build the offline queue for the Atlas app', 34, 1, ['reading src/sync/queue.ts', 'writing the retry loop', 'running the sync tests: 41 pass, 2 fail', 'fixing the timestamp order in replay()']],
  ['tester', 'Sonnet 5.5', 'ledger', 'Regression test for the empty-page bug', 18, 2, ['reproducing with page=0', 'the new test fails on the old code, as it should', 'running the whole suite']],
  ['ux-reviewer', 'Sonnet 5.5', 'orbit', 'Walk the signup flow on a 375 px screen', 26, 14, ['opening the signup page at 375 px', 'step 3 of 5: the code field hides behind the keyboard']],
  ['data-migration', 'Opus 5.5', 'ledger', 'Old exports into the 2.4 importer', 9, 1, ['building invented 2.2 and 2.3 export files', 'importing the 2.2 file into the new build']],
  ['explore', 'Haiku', 'search', 'Find every place the ranking weights are read', 4, 0, ['searching for weight lookups']],
]

const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString()
const rid = (msAgo) => iso(msAgo).replace(/[:.]/g, '-') + '-' + crypto.randomBytes(2).toString('hex')
const write = (file, obj) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(obj, null, 2)) }
const transcriptOf = (model, tokens, tools) => ({
  found: true, path: '', toolCounts: tools, toolUses: Object.values(tools).reduce((a, b) => a + b, 0), files: [], moreFiles: 0, hiddenFiles: 0,
  tokens: { input: Math.round(tokens * 0.2), output: Math.round(tokens * 0.15), cacheRead: tokens * 6, cacheWrite5m: Math.round(tokens * 0.65), cacheWrite1h: 0 },
  tokensTotal: tokens * 7, tokensNew: tokens,
  models: { [model]: { input: Math.round(tokens * 0.2), output: Math.round(tokens * 0.15), cacheRead: tokens * 6, cacheWrite5m: Math.round(tokens * 0.65), cacheWrite1h: 0 } },
  messages: 20, parsedAt: new Date().toISOString(),
})

/** A new temporary data folder with the demo company in it. Demo folders left
 *  behind by a window that was closed instead of stopped with Ctrl+C (Windows
 *  gives the process no chance to clean up then) are removed after a day. */
function makeDemoHome() {
  try {
    for (const n of fs.readdirSync(os.tmpdir())) {
      if (!/^arsenale-demo-[\w]{6}$/.test(n)) continue
      const f = path.join(os.tmpdir(), n)
      if (Date.now() - fs.statSync(f).mtimeMs > 86400000) fs.rmSync(f, { recursive: true, force: true })
    }
  } catch { /* the OS cleans its temp folder anyway */ }
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'arsenale-demo-'))
  const runs = path.join(home, 'agent-runs')
  fs.mkdirSync(path.join(runs, 'active'), { recursive: true })
  fs.writeFileSync(path.join(home, 'config.json'), JSON.stringify({ agentDirs: [REPO_AGENTS], transcriptRoots: [] }, null, 2))
  const M = 60000
  // earlier days of the month too, so the usage charts have a shape
  for (let d = 1; d <= 6; d++) {
    for (const [i, [agent, model, project]] of DONE.slice(0, 6 + (d % 4)).entries()) {
      const ago = d * 86400000 + i * 40 * M
      write(path.join(runs, rid(ago) + '-' + agent + '.json'), { id: rid(ago + 20 * M), agent, model, project, task: 'Earlier task ' + (i + 1) + ' on ' + project, status: 'ok', summary: '', findings: [], files: [], startedAt: iso(ago + 20 * M), finishedAt: iso(ago), steps: [], transcript: transcriptOf(model, 40000 + ((d * 7919 + i * 104729) % 90000), { Read: 6, Edit: 2 }) })
    }
  }
  for (const [agent, model, project, task, status, tokens, ago, took] of DONE) {
    const id = rid((ago + took) * M)
    write(path.join(runs, rid(ago * M) + '-' + agent + '.json'), {
      id, agent, model, project, task, status,
      summary: status === 'ok' ? 'Done as asked; details in the report file.' : status === 'findings' ? 'Two findings, the first one blocks the release.' : 'Stopped: the version files disagree.',
      findings: status === 'findings' ? ['The last page returns 500 when the list is empty', 'No test covers page sizes above 100'] : [],
      files: [], startedAt: iso((ago + took) * M), finishedAt: iso(ago * M),
      steps: [{ at: iso((ago + took) * M), text: 'reading the brief' }, { at: iso((ago + took / 2) * M), text: 'working through the change' }, { at: iso((ago + 1) * M), text: 'writing the report' }],
      ...(agent === 'codex-cli' ? { usage: { tokens, toolUses: 9, durationMs: took * M, model } } : { transcript: transcriptOf(model, tokens, { Read: 14, Grep: 6, Edit: 4, Bash: 3 }) }),
    })
  }
  for (const [agent, model, project, task, since, quiet, steps] of ACTIVE) {
    const id = rid(since * M)
    write(path.join(runs, 'active', id + '.json'), {
      id, agent, model, effort: 'medium', project, task, parent: '', doing: steps[steps.length - 1],
      steps: steps.map((text, i) => ({ at: iso(i === steps.length - 1 ? quiet * M : (since - (i + 1) * (since - quiet) / steps.length) * M), text })),
      startedAt: iso(since * M),
    })
  }
  const gates = [
    ['C', 'ledger', 'Push the pagination fix and tag 2.3.1?', 'push + tag', ['Approve', 'Decline'], 25],
    ['A', 'atlas', 'Offline queue: keep at most 500 changes, or no limit?', 'queue limit', ['500', 'no limit'], 50],
    ['B', 'atlas', 'Pick a direction for the sync status bar', 'mockup', ['A: quiet', 'B: banner', 'C: icon only'], 140],
  ]
  for (const [kind, project, question, label, choices, ago] of gates) {
    const id = 'g-' + rid(ago * M)
    write(path.join(runs, 'gates', id + '.json'), { id, project, kind, question, label, choices, round: '', status: 'waiting', answer: '', by: '', run: '', askedBy: 'supervisor', askedAt: iso(ago * M), answeredAt: '', history: [{ at: iso(ago * M), status: 'waiting', via: 'log' }] })
  }
  const answeredId = 'g-' + rid(380 * M)
  write(path.join(runs, 'gates', answeredId + '.json'), { id: answeredId, project: 'atlas', kind: 'A', question: 'Should offline mode cover attachments in v1?', label: 'scope', choices: ['yes', 'not yet'], round: '', status: 'answered', answer: 'not yet', by: 'user', run: '', askedBy: 'supervisor', askedAt: iso(400 * M), answeredAt: iso(380 * M), history: [] })
  const decisions = [
    ['user', '', 'atlas', 'Attachments wait for v2 of offline mode', 'Keeps the first release small', 380],
    ['supervisor', '', 'ledger', 'Raise the security review of the token flow to the heavy model', 'It touches authentication', 210],
    ['agent', 'implementer', 'atlas', 'Retry with exponential back-off, capped at 5 minutes', 'The spec left the retry timing open', 30],
  ]
  for (const [by, agent, project, text, reason, ago] of decisions) {
    const id = 'd-' + rid(ago * M)
    write(path.join(runs, 'decisions', id + '.json'), Object.assign({ id, project, by, text, reason, run: '', state: 'taken', closes: '', at: iso(ago * M) }, agent ? { agent } : {}))
  }
  return home
}

/** Company, budgets and a heartbeat, through the same code the CLI uses.
 *  Called after ARSENALE_HOME points at the demo folder. */
function seedCompany() {
  const C = require('./agent-company.cjs')
  const P = require('./paths.cjs')
  const names = [...P.agentFiles()].filter(([, f]) => /^---\r?\n[\s\S]*?\bname:/.test(fs.readFileSync(f, 'utf8').slice(0, 2000))).map(([n]) => n)
  C.companyInit(SEED, names)
  C.setBudget({ scope: 'employee', id: 'tester', budget: { monthlyTokens: 1500000, softAlertPct: 80, hardStop: true }, by: 'board' }, 'cli')
  C.stampHeartbeat('demo')
}

/** The 1.0 screens on the same invented company: an office pack, tasks, a
 *  hire proposal and an action approval from an assistant connected over MCP,
 *  and a few deliverables. Written through the library the doors use, as the
 *  board or as the assistant. Called after seedCompany(). */
function seedEveryone() {
  const L = require('./runlog.cjs')
  const board = L.actorFor('dashboard', 'board')
  const sup = L.actorFor('mcp', 'supervisor', { client: { name: 'claude-ai', version: '0.9' }, clientId: 'claude-ai' })
  require('./policy.cjs').ensureDefaults('cli')
  try { require('./packs.cjs').installPack('content-marketing', board, { onConflict: 'keep' }) } catch { /* no packs folder in this copy */ }
  const T = require('./tasks.cjs')
  T.createTask({ title: 'Write the launch post for the Atlas offline mode', description: 'Two versions: one short for social media, one for the blog. Plain words, no jargon.', assignee: 'copywriter', dueDate: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10), links: [{ title: 'Release notes', url: 'https://example.org/atlas/notes' }], needsSignOff: true }, board)
  const t2 = T.createTask({ title: 'Plan the newsletter for next month', assignee: 'newsletter-editor' }, board)
  T.createTask({ title: 'Check the pricing page claims against the sources', assigneeOfficeId: 'research', dueDate: new Date(Date.now() - 86400000).toISOString().slice(0, 10) }, board)
  T.addComment(t2.id, 'Keep it to three sections, like last time.', board)
  const job = L.startRun({ agent: 'newsletter-editor', task: 'Outline the newsletter of next month', issue: t2.id }, sup)
  L.progress({ id: job.id, doing: 'reading the issue of last month' }, sup)
  T.addComment(t2.id, 'Outline ready: three sections, a draft is in the deliverables.', sup)
  require('./team.cjs').propose({ name: 'Invoice Ivo', title: 'Invoice drafter', office_id: 'hq', description: 'Drafts the monthly invoices from the order list', instructions: 'Each month, draft one invoice per customer from the order list the owner exports. Never send them.', why: 'Monthly invoices take the owner half a day' }, sup)
  require('./policy.cjs').checkAction({ team_member: 'social-media-planner', category: 'post.public', summary: 'Post the Atlas launch announcement', target: 'the social media account of the company' }, sup)
  const D = require('./deliverables.cjs')
  D.addDeliverable({ title: 'Newsletter outline', kind: 'text', mime: 'text/markdown', content: ['# Next month', '', '1. What is new in Atlas', '2. A customer story', '3. Dates to remember', ''].join('\n'), job_id: job.id, task_id: t2.id, team_member: 'newsletter-editor' }, sup)
  D.addDeliverable({ title: 'Launch banner draft', kind: 'image', mime: 'image/png', content: demoPng().toString('base64'), team_member: 'copywriter' }, sup)
  D.addDeliverable({ title: 'Competitor price table', kind: 'text', mime: 'text/csv', content: ['Product,Plan,Price per month', 'Atlas,Team,12', 'Invented rival,Team,15', 'Another rival,Starter,9', ''].join('\n'), team_member: 'market-analyst' }, sup)
  D.addDeliverable({ title: 'Release notes page', kind: 'link', url: 'https://example.org/atlas/notes', team_member: 'dev-docs' }, sup)
  require('./mcp-server.cjs').createSession({ transport: 'stdio' }).handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', clientInfo: { name: 'claude-ai', version: '0.9' } } })
}

/** `arsenale demo --shop`: the same invented company as a small shop with
 *  no developers, set up the way the first-start wizard does it (four office
 *  packs), with named team members, tasks on the board, questions waiting
 *  for the owner and finished work. The 1.0 screenshots come from this one.
 *  The folder has no agent definitions of its own: only what the packs bring. */
function makeShopHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'arsenale-demo-'))
  fs.mkdirSync(path.join(home, 'agent-runs', 'active'), { recursive: true })
  fs.writeFileSync(path.join(home, 'config.json'), JSON.stringify({ agentDirs: [path.join(home, 'agents')], transcriptRoots: [] }, null, 2))
  return home
}

// [member id, name, what they are good at]
const SHOP_PEOPLE = [
  ['marketing-lead', 'Mira', ['Campaign plans', 'Content calendars']], ['copywriter', 'Theo', ['Product texts', 'Headlines']], ['social-media-planner', 'Ivy', ['LinkedIn posts', 'Instagram captions']],
  ['seo-specialist', 'Sana', ['Search words customers use', 'Page titles', 'Short descriptions', 'Blog topic ideas']], ['newsletter-editor', 'Leo', ['Newsletters', 'Subject lines']],
  ['support-lead', 'Rosa', []], ['reply-drafter', 'Noor', ['Friendly replies', 'Apologies that sound human']], ['faq-writer', 'Omar', ['Help pages']], ['ticket-triager', 'Elif', ['Sorting tickets']], ['feedback-summariser', 'Jonas', ['Patterns in feedback']],
  ['finance-lead', 'Lena', []], ['bookkeeping-assistant', 'Dara', []], ['invoice-drafter', 'Priya', ['Monthly invoices']], ['budget-analyst', 'Finn', ['Numbers in plain words']], ['expense-checker', 'Marcus', ['Expense rules']],
  ['people-lead', 'Ravi', []], ['job-ad-writer', 'Hana', ['Clear job ads']], ['interview-planner', 'Tomas', ['Interview questions']], ['onboarding-planner', 'Zoe', ['First-week plans']], ['policy-drafter', 'Alma', []],
]

function seedShop(home) {
  const L = require('./runlog.cjs')
  const C = require('./agent-company.cjs')
  const T = require('./tasks.cjs')
  const D = require('./deliverables.cjs')
  const P = require('./policy.cjs')
  const board = L.actorFor('dashboard', 'board')
  const sup = L.actorFor('mcp', 'supervisor', { client: { name: 'claude-ai', version: '0.9' }, clientId: 'claude-ai' })
  const M = 60000, now = Date.now()
  P.ensureDefaults('cli')
  require('./onboard.cjs').create({ name: 'Northwind Labs', mission: 'We sell outdoor weather sensors online to gardeners and small farms in 14 countries.', payModel: 'plan', packs: ['content-marketing', 'customer-support', 'finance', 'hr'], assistants: ['claude-desktop'], lang: 'en' }, board)
  for (const [id, name, skills] of SHOP_PEOPLE) { try { C.updateEmployee({ id, name, skills, by: 'board' }, 'cli') } catch { /* a pack without this member */ } }
  C.stampHeartbeat('demo')
  require('./mcp-server.cjs').createSession({ transport: 'stdio' }).handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', clientInfo: { name: 'claude-ai', version: '0.9' } } })
  const day = (n) => new Date(now + n * 86400000).toISOString().slice(0, 10)
  const iso = (msAgo) => new Date(now - msAgo).toISOString()
  const task = (title, assignee, due, extra) => T.createTask(Object.assign({ title, assignee, dueDate: due }, extra || {}), board)
  const patch = (id, fields) => { const f = path.join(home, 'company', 'issues', id + '.json'); const t = JSON.parse(fs.readFileSync(f, 'utf8')); fs.writeFileSync(f, JSON.stringify(Object.assign(t, fields), null, 2)) }
  // jobs carry the member's office, as an assistant passes office_id to start_job:
  // a job with no project and no office is counted under Unassigned work
  const homes = C.readCompany().employees
  const officeOf = (agent) => (homes[agent] && homes[agent].homeOfficeId) || undefined
  // a job that is still going, started `since` minutes ago
  const working = (agent, text, issue, since, steps) => {
    const r = L.startRun(Object.assign({ agent, task: text, officeId: officeOf(agent) }, issue ? { issue } : {}), sup)
    const f = path.join(home, 'agent-runs', 'active', r.id + '.json')
    const run = JSON.parse(fs.readFileSync(f, 'utf8'))
    run.startedAt = iso(since * M)
    run.steps = steps.map((s, i) => ({ at: iso((since - (i + 1) * since / (steps.length + 1)) * M), text: s }))
    run.doing = steps[steps.length - 1]
    fs.writeFileSync(f, JSON.stringify(run, null, 2))
    return r.id
  }
  const finished = (agent, text, issue, endedAgo, took, summary, tokens) => L.finishRun(Object.assign({ id: 'job-' + crypto.randomBytes(4).toString('hex'), agent, task: text, officeId: officeOf(agent), summary, startedAt: iso((endedAgo + took) * M), finishedAt: iso(endedAgo * M), durationMs: took * M, tokens }, issue ? { issue } : {}), sup).record

  const tNews = task('Draft the October newsletter', 'newsletter-editor', day(3))
  const tTickets = task('Reply to the 12 open tickets about shipping delays', 'reply-drafter', day(0), { description: 'Customers whose parcels are late. Keep the tone apologetic but not dramatic.', needsSignOff: true })
  const tAtlas = task('Post the Atlas launch announcement', 'social-media-planner', day(0), { needsSignOff: true })
  task('Write the job ad: Customer Success Lead', 'job-ad-writer', day(6))
  const tFirst = task('First-week plan for a new colleague (starts 19 Oct)', 'onboarding-planner', day(8))
  task('Draft October invoices from the order list', 'invoice-drafter', day(24))
  const tSort = task('Sort last week\'s 212 support tickets by topic', 'ticket-triager', day(0))
  task('Update the returns page for the new 45-day policy and check that every link in the checkout confirmation email still points to it', 'faq-writer', day(2))
  const tExp = task('Check September expenses against the travel rules', 'expense-checker', day(-1))
  const tPosts = task('Six LinkedIn post drafts for Atlas week', 'social-media-planner', day(0))
  const tQ3 = task('Explain why Q3 shipping costs rose 14%', 'budget-analyst', day(-1))
  T.addComment(tTickets.id, 'Please keep the tone apologetic but not dramatic. Parcels from Hamburg are the worst.', board)

  const jNews = working('newsletter-editor', 'Draft the October newsletter', tNews.id, 42, ['reading last month\'s issue', 'collecting the three news items', 'writing the section about the Atlas hub'])
  working('onboarding-planner', 'First-week plan for a new colleague', tFirst.id, 64, ['reading the handbook', 'drafting day one and day two'])
  working('ticket-triager', 'Sort last week\'s support tickets', tSort.id, 18, ['reading the exported tickets', 'grouping by topic: 9 groups so far'])
  working('seo-specialist', 'Check titles on 14 product pages', '', 26, ['reading the product pages', 'checking titles on 14 product pages'])
  const jTick = working('reply-drafter', 'Reply to the shipping-delay tickets', tTickets.id, 47, ['picked up the task from the inbox', 'read the 12 tickets and found the 3 parcels held at customs', 'wrote 12 reply drafts, one per customer'])
  const jPost = working('social-media-planner', 'Post the Atlas launch announcement', tAtlas.id, 30, ['wrote the post text', 'picked the launch image'])
  const rExp = finished('expense-checker', 'Check September expenses against the travel rules', tExp.id, 160, 38, 'Checked 214 lines: 3 hotel nights over the limit, marked in the file.', 41000)
  finished('social-media-planner', 'Six LinkedIn post drafts for Atlas week', tPosts.id, 130, 65, 'Six drafts ready, one for each day of Atlas week.', 63000)
  const rQ3 = finished('budget-analyst', 'Explain why Q3 shipping costs rose 14%', tQ3.id, 1500, 52, 'Most of the rise is the new carrier surcharge from July.', 52000)
  finished('seo-specialist', 'Suggest 5 blog topics', '', 300, 41, '5 blog topics, each with the search words customers use.', 48000)
  finished('seo-specialist', 'Keywords for the starter kit', '', 1700, 58, 'A short list of 12 search words for the starter kit page.', 51000)
  finished('newsletter-editor', 'Outline of the October newsletter', tNews.id, 240, 22, 'Three sections, and a subject line to choose.', 30000)
  patch(tExp.id, { status: 'done', completedAt: iso(160 * M) })
  patch(tPosts.id, { status: 'done', completedAt: iso(130 * M) })
  patch(tQ3.id, { status: 'done', completedAt: iso(1500 * M) })

  // what the team asks the owner, as the assistant would through MCP
  const gate = (r, ago) => { const f = path.join(home, 'agent-runs', 'gates', (r.question_id || r.id) + '.json'); const g = JSON.parse(fs.readFileSync(f, 'utf8')); g.askedAt = iso(ago * M); g.history = [{ at: g.askedAt, status: 'waiting', via: 'mcp' }]; fs.writeFileSync(f, JSON.stringify(g, null, 2)) }
  gate(require('./team.cjs').propose({ name: 'Contract reader', title: 'Contract reader', office_id: 'people', description: 'Reads supplier and staff contracts and lists what to check, in plain words', instructions: 'Read the contract the owner shares. List the dates, the money, what each side must do and anything unusual, in plain words. Never sign or send anything. Say clearly that this is not legal advice.', why: 'Two supplier contracts arrive next week and nobody on the team reads contracts yet.' }, sup), 300)
  gate(L.gate({ question: 'Which subject line should the October newsletter use?', kind: 'B', choices: ['Your garden, one season ahead', 'October at Northwind: meet Atlas', 'Three things to do before the first frost'], run: jNews, taskId: tNews.id }, sup), 150)
  gate(P.checkAction({ team_member: 'expense-checker', category: 'delete', summary: 'Delete 38 old draft files from the Finance folder', target: 'workspace/finance/drafts (38 files from 2025)' }, sup), 75)
  gate(P.checkAction({ team_member: 'reply-drafter', category: 'message.send', summary: 'Email a 10% coupon (NORTH10) to the 12 customers whose parcels are late', target: '12 customers, from support@northwind.example', job_id: jTick, task_id: tTickets.id }, sup), 25)
  gate(P.checkAction({ team_member: 'social-media-planner', category: 'post.public', summary: 'Meet Atlas, our new weather hub. One small box that reads all your Northwind sensors and sends a plain-language forecast to your phone each morning. Available from 6 October at northwind.example/atlas.', target: 'Northwind Labs on LinkedIn, @northwindlabs on Instagram', job_id: jPost, task_id: tAtlas.id }, sup), 4)

  // finished work, oldest first
  const dl = (input) => { try { return D.addDeliverable(input, sup) } catch { return null } }
  dl({ title: 'Q3 shipping cost explainer', kind: 'text', mime: 'text/markdown', content: '# Why shipping cost more in Q3\n\nMost of the 14% rise is the carrier surcharge that started in July.\n', job_id: rQ3.id, task_id: tQ3.id, team_member: 'budget-analyst' })
  dl({ title: 'Competitor price list (source)', kind: 'link', url: 'https://example.org/sensors/prices', team_member: 'feedback-summariser' })
  dl({ title: 'Support replies batch, 12 drafts', kind: 'text', mime: 'text/plain', content: 'Dear customer,\n\nWe are sorry your parcel is late. It is held at customs and should reach you within five days.\n', task_id: tTickets.id, team_member: 'reply-drafter' })
  dl({ title: 'Returns page, new 45-day wording', kind: 'text', mime: 'text/markdown', content: '# Returns\n\nYou can return any sensor within 45 days.\n', team_member: 'faq-writer' })
  dl({ title: 'September expenses, checked', kind: 'text', mime: 'text/csv', content: 'Date,Who,What,Amount EUR,Within the rules\n2026-09-03,Sales,Hotel Hamburg,182,no\n2026-09-04,Sales,Train,64,yes\n2026-09-11,Support,Taxi,23,yes\n', job_id: rExp.id, task_id: tExp.id, team_member: 'expense-checker' })
  dl({ title: 'Atlas launch post, final', kind: 'image', mime: 'image/png', content: demoPng().toString('base64'), task_id: tAtlas.id, team_member: 'social-media-planner' })
  dl({ title: 'October newsletter, first draft', kind: 'text', mime: 'text/markdown', content: '# October at Northwind\n\n1. Meet Atlas\n2. A customer story from a small farm\n3. Three things to do before the first frost\n', job_id: jNews, task_id: tNews.id, team_member: 'newsletter-editor' })
}

/** An invented 240x120 banner: teal with a darker band, as a real PNG. */
function demoPng() {
  const zlib = require('zlib')
  const W = 240, Hh = 120
  const raw = Buffer.alloc((W * 3 + 1) * Hh)
  for (let y = 0; y < Hh; y++) {
    raw[y * (W * 3 + 1)] = 0
    for (let x = 0; x < W; x++) {
      const band = y > 44 && y < 76
      const o = y * (W * 3 + 1) + 1 + x * 3
      raw[o] = band ? 16 : 47; raw[o + 1] = band ? 22 : 169; raw[o + 2] = band ? 29 : 138
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(Hh, 4); ihdr[8] = 8; ihdr[9] = 2
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

/** Moves the floor along: a new step now and then, a run that finishes and
 *  another that starts. Returns a stop function. */
function simulate(home) {
  const active = path.join(home, 'agent-runs', 'active')
  const lines = ['reading the next file', 'running the focused tests', 'one test fails: looking at the cause', 'the fix is in, re-running', 'writing the report']
  const extra = [['spec-writer', 'Opus 5.5', 'orbit', 'Spec: newsletter signup without a password'], ['performance', 'Sonnet 5.5', 'ledger', 'Measure /entries with 100k rows'], ['user-guide', 'Sonnet 5.5', 'atlas', 'Guide page for offline mode']]
  let n = 0
  const timer = setInterval(() => {
    n++
    let files = []
    try { files = fs.readdirSync(active).filter((f) => f.endsWith('.json')) } catch { return }
    if (!files.length) return
    try {
      if (n % 4 === 0 && files.length > 3) {
        // the longest-running agent hands in its report
        const runs = files.map((f) => JSON.parse(fs.readFileSync(path.join(active, f), 'utf8'))).sort((a, b) => a.startedAt.localeCompare(b.startedAt))
        const r = runs[0]
        fs.unlinkSync(path.join(active, r.id + '.json'))
        const now = new Date().toISOString()
        write(path.join(home, 'agent-runs', now.replace(/[:.]/g, '-') + '-' + r.agent.replace(/[^\w.-]/g, '') + '.json'), Object.assign({}, r, { status: 'ok', summary: 'Done; details in the report file.', findings: [], files: [], finishedAt: now, transcript: transcriptOf(r.model, 60000 + n * 977, { Read: 9, Edit: 3 }) }))
        const [agent, model, project, task] = extra[n % extra.length]
        const id = now.replace(/[:.]/g, '-') + '-' + crypto.randomBytes(2).toString('hex')
        write(path.join(active, id + '.json'), { id, agent, model, effort: 'medium', project, task, parent: '', doing: 'reading the brief', steps: [{ at: now, text: 'reading the brief' }], startedAt: now })
      } else {
        const f = files[n % files.length]
        const r = JSON.parse(fs.readFileSync(path.join(active, f), 'utf8'))
        const text = lines[(n + r.steps.length) % lines.length]
        r.steps.push({ at: new Date().toISOString(), text })
        r.doing = text
        write(path.join(active, f), r)
      }
    } catch { /* a demo hiccup is not worth stopping for */ }
  }, 12000)
  return () => clearInterval(timer)
}

module.exports = { makeDemoHome, seedCompany, seedEveryone, simulate, SEED, makeShopHome, seedShop }
