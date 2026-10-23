  const { esc, digits, T, errTxt } = h
  const A = everyoneArt()
  const ic = A.ic
  const MODES = ['live', 'tasks', 'appr', 'team', 'dlv', 'set', 'market']
  const st = {
    data: {}, at: {}, busy: {}, err: {},
    drawer: null, dv: 0, dmsg: null,
    taskView: 'board', taskFilter: '', taskOffice: '', page: null, editTask: false,
    apprSel: '', note: '', dlvKind: '', dlvQ: '', setTab: 'assistants', openCard: '', openPack: '', channel: 'desktop',
    teamOffice: '', teamQ: '', teamStatus: '', teamModel: '', armed: '', armT: 0, hire: null, wiz: null, wv: 0,
    test: null, notifSeen: null, lastMode: '',
  }
  try { const v = localStorage.getItem('arsenale-task-view'); if (v === 'list' || v === 'board') st.taskView = v } catch { /* a private window */ }
  // Live and Team: cards or tiles first (1.2), the table one click away and remembered
  try { st.liveView = localStorage.getItem('arsenale-live-view') === 'table' ? 'table' : 'cards'; st.teamView = localStorage.getItem('arsenale-team-view') === 'table' ? 'table' : 'tiles' } catch { st.liveView = 'cards'; st.teamView = 'tiles' }
  const co = () => (typeof COMPANY !== 'undefined' && COMPANY && COMPANY.configured ? COMPANY : null)
  const canWrite = () => LIVE && !!ANSWER_TOKEN
  const offices = () => (co() ? co().offices.filter((o) => !o.builtIn && !o.archived) : [])
  const officeById = (id) => co() && co().offices.find((x) => x.id === id)
  const officeName = (id) => { const o = officeById(id); return !o ? id : o.builtIn ? T('Unassigned work') : o.name }
  // the colours come with the page; a company poll before set-up carries none
  const themes0 = (typeof COMPANY !== 'undefined' && COMPANY && COMPANY.themes) || {}
  const themes = () => (typeof COMPANY !== 'undefined' && COMPANY && COMPANY.themes) || themes0
  const colorOf = (officeId) => { const o = officeById(officeId); return (o && o.color) || '#56B6C2' }
  const emp = (id) => (co() ? co().employees.find((e) => e.id === id) : null)

  // ---------- people, by name
  const titleOf = (e) => (!e ? '' : e.title || '')
  /** What a person is called: the name they were given, else their job
   *  title, else the id, which is data. */
  function nameOf(id) {
    if (!id) return ''
    if (id === 'supervisor') return T('Your assistant')
    if (id === 'board') return T('You')
    const e = emp(id)
    return (e && (e.name || titleOf(e))) || id
  }
  /** "Mira, Campaign planner"; just the title when there is no name. */
  function nameLine(id) {
    const e = emp(id)
    if (!e || !e.name || !titleOf(e) || e.name === titleOf(e)) return nameOf(id)
    return e.name + T(', ') + titleOf(e)
  }
  const seedOf = (id) => { const e = emp(id); return id + (e && e.look ? ':' + e.look : '') }
  const colorOfMember = (id) => { const e = emp(id); return colorOf(e && e.homeOfficeId) }
  function face(id, size, back) {
    if (!id || id === 'supervisor') return A.robot(size)
    if (id === 'board') return A.owner(size)
    return A.person(seedOf(id), colorOfMember(id), size, back)
  }
  /** Who asked a question: the member who acts, the job's member, the task's
   *  member, else the assistant itself. */
  function askerOf(g) {
    if (g.action && g.action.member) return g.action.member
    const run = g.run && (DATA.runs || []).concat(DATA.active || []).find((r) => r.id === g.run)
    if (run && run.agent) return run.agent
    const t = g.taskId && taskById(g.taskId)
    if (t && t.assigneeAgentId) return t.assigneeAgentId
    return 'supervisor'
  }

  // ---------- time
  const when = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }
  const hm = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : digits(String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')) }
  const dayOf = (ymd) => { const d = new Date(ymd + 'T12:00:00'); return isNaN(d) ? ymd : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) }
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }
  const isToday = (iso) => { const d = new Date(iso); return !isNaN(d) && d.toDateString() === new Date().toDateString() }
  const dueLabel = (ymd) => (ymd === today() ? T('Today') : dayOf(ymd))
  /** "Today 10:22", "Yesterday", "2 Oct". */
  function day(iso) {
    const d = new Date(iso)
    if (isNaN(d)) return ''
    if (isToday(iso)) return T('Today') + ' ' + hm(iso)
    const y = new Date(); y.setDate(y.getDate() - 1)
    if (d.toDateString() === y.toDateString()) return T('Yesterday')
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }
  const dur = (ms) => {
    const m = Math.round((ms || 0) / 60000)
    if (m < 1) return T('under a minute')
    const hh = Math.floor(m / 60), mm = m % 60
    return (hh ? digits(hh) + T(' h') + (mm ? ' ' : '') : '') + (mm || !hh ? digits(mm) + T(' min') : '')
  }
  /** "just now", "26 minutes ago", "yesterday". */
  function ago(iso) {
    const t = Date.parse(iso)
    if (isNaN(t)) return ''
    const m = Math.round((Date.now() - t) / 60000)
    if (m < 2) return T('just now')
    if (m < 60) return digits(m) + T(' minutes ago')
    if (m < 120) return T('an hour ago')
    if (isToday(iso)) return digits(Math.floor(m / 60)) + T(' hours ago')
    return day(iso)
  }
  const ltr = (s) => '<bdi dir="ltr">' + esc(s) + '</bdi>'
  const tokens = (n) => (h.k ? h.k(n || 0) : digits(n || 0))

  // ---------- data
  async function getJson(url) {
    const res = await fetch(url, { cache: 'no-store' })
    const body = await res.json().catch(() => ({}))
    // the browser no longer holds the owner's key: only opening the dashboard again helps
    if (res.status === 401) throw new Error('This page lost its key. Open the dashboard again with arsenale open.')
    if (!res.ok) throw new Error(body.error || ('HTTP ' + res.status))
    return body
  }
  /** Loads one data set, at most every `age` ms unless forced. */
  function load(key, url, force, age) {
    if (!LIVE) return
    // a forced load during one already under way comes after it: that one may
    // have left before the write it must show
    if (st.busy[key]) { if (force) st.redo = Object.assign(st.redo || {}, { [key]: url }); return }
    if (!force && st.at[key] && Date.now() - st.at[key] < (age || 5000)) return
    st.busy[key] = true
    getJson(url).then((d) => { st.data[key] = d; st.err[key] = '' }, (e) => { st.err[key] = e.message }).then(() => {
      st.busy[key] = false; st.at[key] = Date.now()
      const again = st.redo && st.redo[key]
      if (again) { delete st.redo[key]; load(key, again, true) }
      h.redraw()
    })
  }
  async function send(url, body) { return h.post(url, body) }
  function copy(text) {
    const done = () => { st.dmsg = { ok: true, text: T('Copied.') }; bump() }
    try { navigator.clipboard.writeText(text).then(done, () => fallback()) } catch { fallback() }
    function fallback() {
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select()
      try { document.execCommand('copy'); done() } catch { /* the text is on screen to copy by hand */ }
      ta.remove()
    }
  }
  const bump = () => { st.dv++; h.redraw() }
  const arm = (key) => {
    if (st.armed === key) { st.armed = ''; clearTimeout(st.armT); return true }
    st.armed = key; clearTimeout(st.armT); st.armT = setTimeout(() => { st.armed = ''; bump() }, 6000); bump()
    return false
  }
  const armedLabel = (key, label) => (st.armed === key ? T('Click again to confirm: ') + label : label)
  const armedCls = (key) => (st.armed === key ? ' armed' : '')
  const msgHtml = () => (st.dmsg ? '<p class="msg ' + (st.dmsg.ok ? 'ok' : 'err') + '" role="status">' + esc(st.dmsg.text) + '</p>' : '')
  const liveOnly = () => '<p class="empty">' + T('Open the live dashboard (arsenale serve) to use this screen.') + '</p>'
  const head = (title, sub, act, crumb) => (crumb ? '<div class="crumb">' + crumb + '</div>' : '') + '<div class="eh"><div><h1>' + title + '</h1>' + (sub ? '<p class="sub">' + sub + '</p>' : '') + '</div><div class="ea">' + (act || '') + '</div></div>'
  const gates = () => (Array.isArray(DATA.gates) ? DATA.gates : [])
  const waiting = () => gates().filter((g) => g.status === 'waiting').sort((a, b) => String(b.askedAt).localeCompare(String(a.askedAt)))
  /** An answer, with the hash of the question this page showed: the server
   *  refuses it when the question changed since (answerGate). */
  const answerBody = (id, answer) => { const g = gates().find((x) => x.id === id); return Object.assign({ gate: id, answer }, g && g.qhash ? { hash: g.qhash } : {}) }
  const runsOf = (pred) => (DATA.runs || []).filter(pred)
  const taskList = () => (st.data.tasks && st.data.tasks.tasks) || []
  const taskById = (id) => taskList().find((t) => t.id === id) || (st.data.task && st.data.task.id === id ? st.data.task : null)

  // ---------- what an action means, in plain words (the words follow the page language)
  const CAT = {
    'message.send': ['Sending email or messages', 'Leaves your computer', 'Message', 'This is what would be sent', 'Approve and send', 'The message goes out at once and cannot be taken back.', 'Nothing is sent. {name} is told and can change it, or wait.', 'Send this message?'],
    'post.public': ['Posting online or on social media', 'Leaves your computer', 'Public', 'This is what would be posted', 'Approve and post', 'People see the post straight away. You can delete it later, but people may already have read it.', 'Nothing is posted. {name} is told and can change the text, or wait for a new date.', 'Post this online?'],
    payment: ['Paying or spending money', 'Leaves your computer', 'Money', 'This is what would be paid', 'Approve payment', 'Money leaves your account. A payment is hard to undo.', 'Nothing is paid. {name} is told.', 'Make this payment?'],
    delete: ['Deleting or overwriting files', 'Deletes files', 'Cannot be undone', 'This is what would be deleted', 'Approve and delete', 'Deleted files may not come back.', 'Nothing is deleted. {name} is told and keeps the files.', 'Delete these files?'],
    'share.external': ['Sharing files outside', 'Leaves your computer', 'Shared', 'This is what would be shared', 'Approve and share', 'Whoever gets the files can keep them.', 'Nothing is shared. {name} is told.', 'Share this outside?'],
    'account.change': ['Signing up or changing accounts', 'Leaves your computer', 'Accounts', 'This is what would change', 'Approve the change', 'It changes an account in your name.', 'Nothing changes. {name} is told.', 'Make this account change?'],
    'other.external': ['Anything else that leaves this computer', 'Leaves your computer', '', 'This is what would happen', 'Approve', 'It reaches something outside this computer.', 'Nothing happens. {name} is told.', 'Go ahead with this?'],
  }
  const catOf = (g) => CAT[g.action && g.action.category] || CAT['other.external']
  const longSum = (g) => Array.from(String(g.action.summary || '')).length > 100
  const qmark = (s) => { s = String(s || '').trim(); return /[?]$/.test(s) ? s : s + '?' }
  /** The question in one plain sentence, drawn from the fields when it can be,
   *  so its words follow the page language; the stored English sentence is
   *  what an older dashboard shows. */
  function plainQ(g) {
    const p = g.payload || {}
    // a short summary is the question itself; a long one (a whole post) goes in the preview
    if (g.approvalType === 'action' && g.action) return longSum(g) ? T(catOf(g)[7]) : qmark(g.action.summary || T(catOf(g)[7]))
    if (g.approvalType === 'hire') return T('Add a team member: ') + (p.title || p.name || p.id || '') + T(', to ') + officeName(p.officeId) + '?'
    return g.question
  }
  function riskOf(g) {
    if (g.approvalType === 'action' && g.action) { const c = catOf(g); return { cls: g.action.category === 'delete' ? 'mid' : '', label: T(c[1]), sub: c[2] ? T(c[2]) : '' } }
    return { cls: 'safe', label: T('Stays on your computer'), sub: '' }
  }
  const riskHtml = (g, big) => { const r = riskOf(g); return '<span class="risk ' + r.cls + (big ? ' big' : '') + '">' + ic(r.cls === 'safe' ? 'lock' : 'out', big ? 14 : 11) + ' ' + esc(r.label) + (big && r.sub ? ' · ' + esc(r.sub) : '') + '</span>' }

  // ========== tasks
  const STATE = { backlog: 'Later', todo: 'To do', in_progress: 'Working on it', in_review: 'Waiting for you', blocked: 'Stuck', done: 'Done', cancelled: 'Cancelled' }
  const ORDER = ['in_review', 'todo', 'in_progress', 'blocked', 'backlog', 'done', 'cancelled']
  function forWhom(t) {
    if (t.assigneeUserId === 'board') return T('You')
    if (t.assigneeAgentId) return nameOf(t.assigneeAgentId)
    if (t.assigneeOfficeId) return officeName(t.assigneeOfficeId)
    return T('Your assistant decides')
  }
  const whoId = (t) => t.assigneeUserId === 'board' ? 'board' : t.assigneeAgentId || 'supervisor'
  const taskGate = (t) => waiting().find((g) => g.taskId === t.id)
  const activeFor = (t) => (DATA.active || []).filter((r) => r.issue === t.id)
  const doneMs = (t) => runsOf((r) => r.issue === t.id).reduce((n, r) => n + (r.durMs || 0), 0)
  function column(t) {
    if (t.status === 'in_review' || taskGate(t)) return 'wait'
    if (t.status === 'in_progress' || t.status === 'blocked') return 'work'
    if (t.status === 'todo' || t.status === 'backlog') return 'todo'
    if (t.status === 'done' && Date.now() - Date.parse(t.completedAt || t.updatedAt) < 7 * 86400000) return 'done'
    return ''
  }
  function tasksMain() {
    if (!LIVE) return liveOnly()
    if (st.page && st.page.type === 'new') return taskNew()
    if (st.page && st.page.type === 'task') return taskPage()
    if (!co()) return head(T('Tasks')) + '<p class="empty">' + T('Tasks belong to a company. Set up your company first.') + '</p><p><button type="button" class="b pri" data-ev="wiz-open">' + T('Set up your company') + '</button></p>'
    load('tasks', 'api/tasks')
    load('packs', 'api/packs', false, 60000)
    load('connect', 'api/connect', false, 15000)
    const list = taskList()
    const tog = '<span class="seg" role="group" aria-label="' + T('Show as') + '"><button type="button" data-ev="tview" data-arg="board" aria-pressed="' + (st.taskView === 'board') + '">' + T('Board') + '</button><button type="button" data-ev="tview" data-arg="list" aria-pressed="' + (st.taskView === 'list') + '">' + T('List') + '</button></span>'
    let html = head(T('Tasks'), '', tog + notConnected() + (canWrite() ? '<button type="button" class="b pri" data-ev="task-new">' + ic('plus', 15, 2.4) + T('New task') + '</button>' : ''))
    if (st.err.tasks) html += '<p class="msg err">' + esc(errTxt(st.err.tasks)) + '</p>'
    const need = list.filter((t) => column(t) === 'wait')
    if (need.length) {
      const names = [...new Set(need.map((t) => { const g = taskGate(t); return nameOf(g ? askerOf(g) : whoId(t)) }))]
      html += '<div class="banner" role="status"><span style="color:var(--warn)">' + ic('bell', 22) + '</span><div><b class="hi">' + digits(need.length) + ' ' + T(need.length === 1 ? 'task needs you' : 'tasks need you') + '</b> <span class="soft">' + esc(names.length > 1 ? names.slice(0, -1).join(T(', ')) + T(' and ') + names[names.length - 1] : names[0]) + ' ' + T(names.length === 1 ? 'is waiting for a yes or no.' : 'are waiting for a yes or no.') + '</span></div><button type="button" class="b sm" data-ev="goto" data-arg="appr" style="margin-inline-start:auto">' + T('Go to Approvals') + '</button></div>'
    }
    // before the first answer an empty list means "not loaded", not "no tasks"
    if (!list.length && !st.data.tasks && !st.err.tasks) return html + '<p class="empty" role="status">' + T('Loading…') + '</p>'
    if (!list.length) {
      html += '<p class="empty">' + T('No tasks yet. Write one, and your assistant will see it next time.') + '</p>'
      const samples = samplesOf()
      if (samples.length && canWrite()) html += '<div class="sec" style="margin-top:14px">' + T('Start from an example') + '</div><div class="gal">' + samples.slice(0, 6).map((s, i) => '<button type="button" class="card tk" data-ev="task-sample" data-arg="' + i + '"><div class="tt" dir="auto">' + esc(s.title) + '</div><p class="soft" dir="auto" style="font-size:13px;margin-top:6px">' + esc(s.description) + '</p></button>').join('') + '</div>'
      return html + '<p class="note" style="margin-top:16px">' + ic('info', 14) + T('Writing a task starts nothing. Your assistant picks it up the next time you talk to it.') + '</p>'
    }
    html += st.taskView === 'list' ? taskListHtml(list) : taskBoard(list)
    return html + '<p class="note" style="margin-top:22px">' + ic('info', 14) + T('Writing a task starts nothing. Your assistant picks it up the next time you talk to it.') + '</p>'
  }
  function taskCard(t) {
    const col = column(t), wait = col === 'wait', g = taskGate(t)
    const id = whoId(t)
    const late = t.dueDate && t.dueDate < today() && !['done', 'cancelled'].includes(t.status)
    let html = '<button type="button" class="card tk' + (wait ? ' wtk' : '') + (col === 'done' ? ' dn' : '') + '" data-ev="task-open" data-arg="' + esc(t.id) + '">'
    if (wait) html += '<div class="wb">' + ic('bell', 13, 2.2) + ' ' + T('Waiting for you') + '</div>'
    html += '<div class="tt" dir="auto">' + esc(t.title) + '</div>'
    if (g) html += '<div class="q" dir="auto">' + esc(plainQ(g)) + (g.approvalType === 'action' ? ' ' + riskHtml(g) : '') + '</div>'
    else if (t.status === 'in_review') html += '<div class="q">' + T('Ready for you to check.') + '</div>'
    html += '<div class="rw" style="margin-top:12px;gap:8px">' + face(g ? askerOf(g) : id, 24, true) + '<span class="soft ell" style="font-size:13px">' + esc(g ? nameOf(askerOf(g)) : forWhom(t)) + '</span><span class="sp"></span>'
    if (t.status === 'done') html += '<span class="chip">' + ic('check', 11, 3) + ' ' + T('Done') + ' ' + esc(day(t.completedAt || t.updatedAt)) + '</span>'
    else if (t.dueDate) html += '<span class="chip' + (late || t.dueDate === today() ? ' bad' : '') + '">' + ic('cal', 12) + ' ' + esc(dueLabel(t.dueDate)) + '</span>'
    html += '</div>'
    const act = activeFor(t)[0]
    if (t.status === 'blocked') html += '<p class="mut" style="font-size:12.5px;margin-top:6px">' + T('Stuck: your assistant needs something') + '</p>'
    else if (act) html += '<p class="mut" style="font-size:12.5px;margin-top:6px">' + T('Started ') + esc(ago(act.startedAt)) + '</p>'
    else if (t.status === 'done' && doneMs(t)) html += '<p class="mut" style="font-size:12.5px;margin-top:6px">' + T('Took ') + esc(dur(doneMs(t))) + '</p>'
    else if (t.status === 'backlog') html += '<p class="mut" style="font-size:12.5px;margin-top:6px">' + T('Later') + '</p>'
    return html + '</button>'
  }
  function taskBoard(list) {
    const col = (k, title, cls) => { const g = list.filter((t) => column(t) === k); return '<div class="col' + (cls || '') + '"><div class="colh">' + title + ' <span class="n">' + digits(g.length) + '</span></div>' + (g.length ? g.map(taskCard).join('') : '<p class="mut" style="font-size:13px;padding:6px 2px">' + T('Nothing here.') + '</p>') + '</div>' }
    return '<div class="board4">' + col('todo', T('To do')) + col('work', T('Working on it')) + '<div class="colw">' + col('wait', T('Waiting for you')) + '</div>' + col('done', T('Done this week')) + '</div>'
  }
  function taskListHtml(list) {
    const chip = (v, label) => '<button type="button" class="chip" data-ev="tfilter" data-arg="' + v + '" aria-pressed="' + (st.taskFilter === v) + '">' + label + (v ? ' ' + digits(list.filter((t) => t.status === v).length) : '') + '</button>'
    let html = '<div class="rw" style="gap:8px;flex-wrap:wrap;margin:-6px 0 6px">' + chip('', T('All')) + ORDER.slice(0, 4).map((s) => chip(s, T(STATE[s]))).join('') + chip('done', T('Done')) +
      '<select data-ev-change="toffice" aria-label="' + T('Office') + '" style="width:auto;display:inline-block;padding:4px 10px"><option value="">' + T('Every office') + '</option>' + offices().map((o) => '<option value="' + esc(o.id) + '"' + (st.taskOffice === o.id ? ' selected' : '') + '>' + esc(officeName(o.id)) + '</option>').join('') + '</select></div>'
    const memberOffice = (id) => { const e = emp(id); return e ? e.homeOfficeId : '' }
    const shown = list.filter((t) => (!st.taskFilter || t.status === st.taskFilter) && (!st.taskOffice || t.assigneeOfficeId === st.taskOffice || (t.assigneeAgentId && memberOffice(t.assigneeAgentId) === st.taskOffice)))
    html += '<div class="list">'
    for (const s of ORDER) {
      const g = shown.filter((t) => t.status === s)
      if (!g.length) continue
      html += '<h4>' + T(STATE[s]) + ' · ' + digits(g.length) + '</h4>' + g.map((t) => {
        const late = t.dueDate && t.dueDate < today() && !['done', 'cancelled'].includes(t.status)
        return '<button type="button" class="lr" data-ev="task-open" data-arg="' + esc(t.id) + '"><span class="rw" style="gap:10px;min-width:0">' + face(whoId(t), 22, true) + '<span class="hi ell" dir="auto">' + esc(t.title) + '</span></span><span class="chip">' + esc(forWhom(t)) + '</span>' + (t.dueDate ? '<span class="chip' + (late ? ' bad' : '') + '">' + esc(dueLabel(t.dueDate)) + '</span>' : '<span></span>') +
          '<span class="mut" style="font-size:12.5px">' + (t.seenAt ? T('seen by your assistant ') + hm(t.seenAt) : T('not seen yet')) + (t.comments ? ' · ' + digits(t.comments) + ' ' + T('comments') : '') + '</span></button>'
      }).join('')
    }
    return html + '</div>'
  }
  function samplesOf() {
    const packs = (st.data.packs && st.data.packs.packs) || []
    return packs.filter((p) => p.installed).flatMap((p) => p.sampleTasks || [])
  }
  function notConnected() {
    const c = st.data.connect
    if (!c || (c.clients && c.clients.length)) return ''
    return '<button type="button" class="chip warn" data-ev="goto-connect">' + T('Your assistant is not connected yet') + '</button>'
  }
  const members = () => (co() ? co().employees : []).filter((x) => x.kind === 'employee' && x.status !== 'retired')
  function taskNew() {
    const pre = st.page.pre || {}
    const sel = st.page.who !== undefined ? st.page.who : pre.assignee || ''
    const who = (v, label, avatar) => '<label class="pick"><input type="radio" name="who" value="' + esc(v) + '"' + (sel === v ? ' checked' : '') + '>' + avatar + '<span dir="auto">' + label + '</span></label>'
    // the most likely people first: the pre-chosen one, then by office
    const people = members().slice().sort((a, b) => (b.id === sel) - (a.id === sel) || String(a.homeOfficeId).localeCompare(String(b.homeOfficeId)) || nameOf(a.id).localeCompare(nameOf(b.id)))
    let html = head(T('New task'), T('Say what you need, as you would to a colleague.'), '<button type="button" class="b ghost" data-ev="page-close">' + T('Cancel') + '</button><button type="submit" form="tnew" class="b pri">' + ic('send', 15) + T('Give this task') + '</button>', '<button type="button" data-ev="page-close">' + T('Tasks') + '</button> ' + ic('chev', 12) + ' ' + T('New task'))
    html += '<form id="tnew" data-evform="task-new"><div class="two"><div class="card pad" style="padding:22px">'
    html += '<label class="fl">' + T('What do you need?') + '<input type="text" name="title" maxlength="200" required dir="auto" style="font-size:17px;padding:12px" value="' + esc(pre.title || '') + '"></label>'
    html += '<label class="fl">' + T('Anything they should know?') + ' <span class="op">' + T('Optional') + '</span><textarea name="description" maxlength="8000" dir="auto" style="min-height:120px">' + esc(pre.description || '') + '</textarea></label>'
    html += '<details' + (pre.links ? ' open' : '') + '><summary>' + ic('link', 13) + ' ' + T('Add web links or file paths') + '</summary><div style="margin-top:10px"><label class="fl">' + T('Web links, one per line') + '<textarea name="urls" style="min-height:44px" dir="ltr" placeholder="https://"></textarea></label><label class="fl">' + T('File paths, one per line') + '<textarea name="paths" style="min-height:44px" dir="ltr"></textarea><span class="hint" style="font-weight:400">' + T('Shown as text with "Copy path". Arsenale never opens a file.') + '</span></label></div></details>'
    const samples = samplesOf()
    if (samples.length) html += '<p class="mut" style="font-size:12.5px;margin-top:14px">' + T('Quick ideas:') + '</p><div class="rw" style="gap:8px;margin-top:6px;flex-wrap:wrap">' + samples.slice(0, 4).map((s, i) => '<button type="button" class="chip" data-ev="task-sample" data-arg="' + i + '" dir="auto">' + esc(s.title.length > 42 ? s.title.slice(0, 40) + '…' : s.title) + '</button>').join('') + '</div>'
    html += msgHtml() + '</div><div style="display:flex;flex-direction:column;gap:18px">'
    html += '<div class="card pad"><div class="hi" style="font-weight:700;font-size:13px;margin-bottom:10px">' + T('Who should do it?') + '</div><div style="max-height:300px;overflow:auto;padding:0 10px;margin:0 -10px">' + who('', T('Let my assistant choose'), A.robot(26)) +
      people.map((e) => who(e.id, esc(nameLine(e.id)), face(e.id, 26))).join('') + offices().map((o) => who('office:' + o.id, T('Anyone in ') + esc(officeName(o.id)), '<span class="sw" style="width:22px;height:22px;border-radius:5px;background:' + esc(o.color || '#56B6C2') + '"></span>')).join('') + who('board', T('Me'), A.owner(26)) + '</div></div>'
    html += '<div class="card pad"><label class="fl">' + T('When is it due?') + ' <span class="op">' + T('Optional') + '</span><input type="date" name="dueDate"><span class="hint" style="font-weight:400">' + T('A date in the past is allowed and shown in red.') + '</span></label><label class="rw" style="margin:0;cursor:pointer"><span class="sp"><b class="hi" style="font-size:14px;display:block">' + T('Ask me before it is finished') + '</b><span class="mut" style="font-size:12.5px">' + T('You see the result first') + '</span></span><input type="checkbox" class="tgl" name="needsSignOff"' + (pre.needsSignOff ? ' checked' : '') + '></label></div>'
    html += '<p class="note">' + ic('info', 14) + T('The task goes into your assistant\'s inbox. It is picked up the next time your assistant checks, usually when you open a chat.') + '</p></div></div></form>'
    return html
  }
  function linksOf(f) {
    const urls = String(f.urls.value || '').split('\n').map((s) => s.trim()).filter(Boolean).map((url) => ({ url }))
    const paths = String(f.paths.value || '').split('\n').map((s) => s.trim()).filter(Boolean).map((p) => ({ path: p }))
    return urls.concat(paths)
  }
  function answerButtons(g, size) {
    const k = (v) => 'ap|' + g.id + '|' + v
    const lg = size === 'lg' ? ' big' : ''
    let b = ''
    if (g.approvalType === 'hire') {
      b += '<button type="button" class="b pri' + lg + armedCls(k('hire')) + '" data-ev="hire-yes" data-arg="' + esc(g.id) + '">' + ic('check', 16, 2.6) + esc(armedLabel(k('hire'), T('Hire as proposed'))) + '</button>'
      b += '<button type="button" class="b' + lg + '" data-ev="hire-edit" data-arg="' + esc(g.id) + '">' + ic('pencil', 15) + T('Edit and hire') + '</button>'
      b += '<button type="button" class="b bad' + lg + armedCls(k('decline')) + '" data-ev="hire-no" data-arg="' + esc(g.id) + '">' + ic('x', 15, 2.4) + esc(armedLabel(k('decline'), T('Reject'))) + '</button>'
    } else if (g.kind === 'approval') {
      const yes = g.approvalType === 'action' ? T(catOf(g)[4]) : T('Approve')
      b += '<button type="button" class="b pri' + lg + armedCls(k('approve')) + '" data-ev="ans" data-arg="' + esc(g.id) + '" data-val="approve">' + ic('check', 16, 2.6) + esc(armedLabel(k('approve'), yes)) + '</button>'
      b += '<button type="button" class="b bad' + lg + armedCls(k('decline')) + '" data-ev="ans" data-arg="' + esc(g.id) + '" data-val="decline">' + ic('x', 15, 2.4) + esc(armedLabel(k('decline'), T('Reject'))) + '</button>'
    } else if (Array.isArray(g.choices) && g.choices.length) {
      b += g.choices.map((c, i) => '<button type="button" class="b' + (i ? '' : ' pri') + lg + armedCls(k(c)) + '" data-ev="ans" data-arg="' + esc(g.id) + '" data-val="' + esc(c) + '" dir="auto">' + esc(armedLabel(k(c), c)) + '</button>').join('')
    }
    return b
  }
  /** The reply box: a free answer, or "ask them to change something". */
  function replyForm(g, label) {
    return '<form data-evform="ans" data-id="' + esc(g.id) + '" data-note="' + (g.kind === 'approval' ? '1' : '') + '" class="rw" style="gap:8px;flex:1;min-width:260px"><input type="text" name="a" maxlength="300" dir="auto" aria-label="' + esc(label) + '" placeholder="' + esc(label) + '"><button type="submit" class="b">' + ic('send', 15) + T('Send') + '</button></form>'
  }
  function taskPage() {
    const t = st.data.task
    if (!t || t.id !== st.page.id) { load('task', 'api/task?id=' + encodeURIComponent(st.page.id), true); return '<p class="empty" role="status">' + T('Loading…') + '</p>' }
    load('dlv', 'api/deliverables', false, 10000)
    const crumb = '<button type="button" data-ev="page-close">' + T('Tasks') + '</button> ' + ic('chev', 12) + ' <span dir="auto">' + esc(t.title.length > 70 ? t.title.slice(0, 68) + '…' : t.title) + '</span>'
    const act = canWrite() ? '<button type="button" class="b" data-ev="task-edit">' + ic('pencil', 15) + T('Edit') + '</button>' + (t.status !== 'done' ? '<button type="button" class="b" data-ev="task-done" data-arg="' + esc(t.id) + '">' + ic('check', 15) + T('Mark as done') + '</button>' : '<button type="button" class="b" data-ev="task-reopen" data-arg="' + esc(t.id) + '">' + T('Open again') + '</button>') : ''
    let html = '<div class="crumb">' + crumb + '</div><div class="eh"><div><h1 dir="auto">' + esc(t.title) + '</h1><p class="sub"><span class="chip">' + T(STATE[t.status] || t.status) + '</span>' + (t.needsSignOff ? ' <span class="chip warn">' + T('needs your check') + '</span>' : '') + '</p></div><div class="ea">' + act + '</div></div>'
    html += '<div class="two" style="grid-template-columns:1fr 340px"><div style="display:flex;flex-direction:column;gap:18px;min-width:0">'
    if (st.editTask && canWrite()) html += taskEditForm(t)
    const g = waiting().find((x) => x.taskId === t.id)
    if (g) {
      const who = askerOf(g)
      html += '<div class="card pad wbox"><div class="rw" style="align-items:flex-start;gap:14px">' + face(who, 44) + '<div style="flex:1;min-width:0"><div class="lbl" style="color:#F2C06B">' + esc(nameOf(who)) + ' ' + T('is waiting for you') + '</div><div class="hi" dir="auto" style="font-size:17px;font-weight:700;margin-top:4px">' + esc(plainQ(g)) + '</div>' + (g.approvalType === 'action' && g.action.target ? '<p class="soft" dir="auto" style="font-size:13.5px;margin-top:4px">' + T('Where: ') + esc(g.action.target) + '</p>' : '') +
        (canWrite() ? '<div class="rw" style="margin-top:14px;gap:10px;flex-wrap:wrap">' + answerButtons(g) + (g.approvalType !== 'hire' ? replyForm(g, g.kind === 'approval' ? T('Reply with a note') : T('Your answer')) : '') + '<span class="sp"></span>' + riskHtml(g) + '</div>' : '') + (st.err['ap|' + g.id] ? '<p class="msg err">' + esc(errTxt(st.err['ap|' + g.id])) + '</p>' : '') + '</div></div></div>'
    }
    if (t.description) html += '<div class="card pad"><div class="sec">' + T('What you asked for') + '</div><pre class="txt" dir="auto">' + esc(t.description) + '</pre></div>'
    // what happened: the jobs' steps, the questions and the comments, newest first
    const jobs = (t.runIds || []).map((id) => (DATA.runs || []).concat(DATA.active || []).find((r) => r.id === id)).filter(Boolean)
    const ev = []
    for (const r of jobs) {
      ev.push({ at: r.startedAt, k: 'ok', text: nameOf(r.agent) + ' ' + T('started: ') + r.task })
      for (const s of (r.steps || []).slice(-6)) ev.push({ at: s.at, k: 'ok', text: s.text })
      if (r.finishedAt) ev.push({ at: r.finishedAt, k: 'ok', text: r.summary || T('Finished') })
    }
    for (const x of gates().filter((x) => x.taskId === t.id)) {
      ev.push({ at: x.askedAt, k: 'q', text: nameOf(askerOf(x)) + ' ' + T('asked you: ') + plainQ(x) })
      if (x.status === 'answered') ev.push({ at: x.answeredAt, k: 'ok', text: T('You answered: ') + x.answer })
    }
    ev.push({ at: t.createdAt, k: 'ok', text: t.createdBy === 'board' ? T('You wrote this task') : T('Your assistant wrote this task') })
    ev.sort((a, b) => String(b.at).localeCompare(String(a.at)))
    html += '<div class="card pad"><div class="sec">' + T('What happened') + ' <small>' + T('newest first') + '</small></div>' + ev.slice(0, 14).map((x) => '<div class="tl"><time>' + esc(isToday(x.at) ? hm(x.at) : day(x.at)) + '</time><span style="color:' + (x.k === 'q' ? 'var(--warn)' : 'var(--accent)') + '">' + ic(x.k === 'q' ? 'bell' : 'check', 16, 2.2) + '</span><span class="' + (x.k === 'q' ? 'hi' : 'soft') + '" dir="auto">' + esc(x.text) + '</span></div>').join('') + '</div>'
    html += '<div class="card pad"><div class="sec">' + T('Comments') + ' <small>' + digits(t.comments.length) + '</small></div>'
    if (!t.comments.length) html += '<p class="mut" style="font-size:13px;margin-bottom:12px">' + T('No comments yet.') + '</p>'
    for (const c of t.comments) {
      const by = c.by === 'board' ? 'board' : c.by === 'supervisor' ? 'supervisor' : String(c.by).replace(/^agent:/, '')
      html += '<div class="cm">' + face(by, 32) + '<div class="cb"><div class="rw" style="justify-content:space-between"><b class="hi" style="font-size:13.5px">' + esc(nameOf(by)) + '</b><span class="mut" style="font-size:12px">' + esc(day(c.at)) + '</span></div><div class="soft" dir="auto" style="font-size:14px;margin-top:2px;white-space:pre-wrap">' + esc(c.text) + '</div></div></div>'
    }
    if (canWrite()) html += '<form data-evform="task-comment" data-id="' + esc(t.id) + '" class="rw" style="gap:10px">' + A.owner(32) + '<textarea name="text" maxlength="4000" dir="auto" aria-label="' + T('Your comment') + '" placeholder="' + esc(T('Write a comment for ') + forWhom(t) + '…') + '" style="min-height:44px;flex:1"></textarea><button type="submit" class="b" aria-label="' + T('Add comment') + '">' + ic('send', 15) + '</button></form>'
    html += msgHtml() + '</div></div><div style="display:flex;flex-direction:column;gap:18px">'
    const spent = jobs.reduce((n, r) => n + (r.durMs || 0), 0)
    html += '<div class="card pad facts"><div><span class="mut">' + T('Assigned to') + '</span><span class="rw" style="gap:8px">' + face(whoId(t), 24) + '<b class="hi">' + esc(t.assigneeAgentId ? nameLine(t.assigneeAgentId) : forWhom(t)) + '</b></span></div>' +
      (t.assigneeAgentId || t.assigneeOfficeId ? '<div><span class="mut">' + T('Office') + '</span><span class="rw" style="gap:8px"><span class="sw" style="background:' + esc(colorOf(t.assigneeOfficeId || (emp(t.assigneeAgentId) || {}).homeOfficeId)) + '"></span><span class="hi">' + esc(officeName(t.assigneeOfficeId || (emp(t.assigneeAgentId) || {}).homeOfficeId)) + '</span></span></div>' : '') +
      '<div><span class="mut">' + T('Due') + '</span><b class="hi">' + (t.dueDate ? esc(dueLabel(t.dueDate)) + (t.dueDate < today() && t.status !== 'done' ? ' <span class="chip bad">' + T('This date has passed') + '</span>' : '') : '—') + '</b></div>' +
      '<div><span class="mut">' + T('Time spent') + '</span><b class="hi">' + (spent ? esc(dur(spent)) : '—') + '</b></div>' +
      '<div><span class="mut">' + T('Created') + '</span><span class="hi">' + (t.createdBy === 'board' ? T('by you, ') : T('by your assistant, ')) + esc(day(t.createdAt)) + '</span></div></div>'
    if (canWrite()) html += '<button type="button" class="b" data-ev="task-copy" data-arg="' + esc(t.id) + '">' + ic('copy', 15) + T('Copy a message for your assistant') + '</button>'
    const dls = ((st.data.dlv && st.data.dlv.deliverables) || []).filter((d) => d.taskId === t.id)
    html += '<div class="card pad"><div class="sec">' + T('Finished work') + ' <small>' + digits(dls.length) + '</small></div>' + (dls.length ? dls.map((d) => '<button type="button" class="rw" data-ev="dlv-open" data-arg="' + esc(d.id) + '" style="padding:8px 0;gap:12px;background:none;border:0;width:100%;cursor:pointer;text-align:start;font:inherit"><span style="width:56px;height:36px;border-radius:5px;overflow:hidden;border:1px solid var(--line);flex:none">' + A.thumb(kindArt(d), colorOfMember(d.agent)) + '</span><span style="flex:1;min-width:0"><span class="hi ell" dir="auto" style="font-size:13.5px;font-weight:700;display:block">' + esc(d.title) + '</span><span class="mut" style="font-size:12px">' + esc(extOf(d)) + (d.bytes ? ', ' + sizeOf(d.bytes) : '') + '</span></span></button>').join('') : '<p class="mut" style="font-size:13px">' + T('Nothing handed in yet.') + '</p>') + '</div>'
    if ((t.links || []).length) {
      html += '<div class="card pad"><div class="sec">' + T('Links') + '</div>'
      for (const l of t.links) html += l.url ? '<p style="margin:4px 0"><a href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer" dir="ltr" style="color:var(--cyan)">' + esc(l.title || l.url) + '</a></p>' : '<p class="rw" style="gap:8px;margin:4px 0">' + ltr(l.path) + '<button type="button" class="b sm" data-ev="copy" data-arg="' + esc(l.path) + '">' + T('Copy path') + '</button></p>'
      html += '</div>'
    }
    const tok = jobs.reduce((n, r) => n + (r.tokTotal || 0), 0)
    html += '<div class="card pad"><div class="sec" style="margin-bottom:6px">' + T('Details') + ' <small>' + T('for the curious') + '</small></div><p class="mut" style="font-size:12.5px;line-height:1.7">' + T('Task number: ') + ltr(t.id) + '<br>' + T('Jobs: ') + digits(jobs.length) + (tok ? ' · ' + T('Usage: ') + tokens(tok) + ' ' + T('tokens') : '') + (t.seenAt ? '<br>' + T('Seen by your assistant ') + esc(day(t.seenAt)) : '') + '</p></div>'
    return html + '</div></div>'
  }
  function taskEditForm(t) {
    const sel = t.assigneeUserId === 'board' ? 'board' : t.assigneeAgentId || (t.assigneeOfficeId ? 'office:' + t.assigneeOfficeId : '')
    const opts = ['<option value="">' + T('Let my assistant choose') + '</option>'].concat(members().map((e) => '<option value="' + esc(e.id) + '"' + (sel === e.id ? ' selected' : '') + '>' + esc(nameLine(e.id)) + '</option>'), offices().map((o) => '<option value="office:' + esc(o.id) + '"' + (sel === 'office:' + o.id ? ' selected' : '') + '>' + T('Anyone in ') + esc(officeName(o.id)) + '</option>'), ['<option value="board"' + (sel === 'board' ? ' selected' : '') + '>' + T('Me') + '</option>'])
    return '<form class="card pad" data-evform="task-edit" data-id="' + esc(t.id) + '"><label class="fl">' + T('What do you need?') + '<input type="text" name="title" maxlength="200" required dir="auto" value="' + esc(t.title) + '"></label><label class="fl">' + T('Anything they should know?') + '<textarea name="description" maxlength="8000" dir="auto">' + esc(t.description || '') + '</textarea></label>' +
      '<div class="rw" style="gap:12px;align-items:flex-start"><label class="fl" style="flex:1">' + T('Who should do it?') + '<select name="who">' + opts.join('') + '</select></label><label class="fl" style="flex:1">' + T('When is it due?') + '<input type="date" name="dueDate" value="' + esc(t.dueDate || '') + '"></label></div>' +
      '<div class="rw" style="gap:12px;flex-wrap:wrap"><label class="fl" style="margin:0">' + T('State') + '<select name="status" style="width:auto">' + ORDER.map((s) => '<option value="' + s + '"' + (t.status === s ? ' selected' : '') + '>' + T(STATE[s]) + '</option>').join('') + '</select></label><label class="rw" style="gap:8px;margin:18px 0 0;cursor:pointer"><input type="checkbox" class="tgl" name="needsSignOff"' + (t.needsSignOff ? ' checked' : '') + '><span class="soft">' + T('Ask me before it is finished') + '</span></label></div>' +
      '<div class="rw" style="gap:10px;margin-top:14px"><button type="submit" class="b pri">' + T('Save') + '</button><button type="button" class="b ghost" data-ev="task-edit">' + T('Cancel') + '</button></div></form>'
  }

  // ========== approvals: the page is decisions.js; the letter below is read in the side panel
  function letter(g) {
    if (!g) return ''
    const p = g.payload || {}
    const who = askerOf(g)
    const task = g.taskId && taskById(g.taskId)
    if (g.taskId && !task) load('tasks', 'api/tasks', false, 15000)
    let html = '<div class="card letter" id="ap-' + esc(g.id) + '"><div class="rw" style="gap:14px;align-items:flex-start">' + face(who, 52) + '<div style="min-width:0"><b class="hi" style="font-size:15px">' + esc(nameLine(who)) + '</b><div class="mut" style="font-size:13px">' + T('asked at ') + esc(isToday(g.askedAt) ? hm(g.askedAt) : when(g.askedAt)) + (task ? ' · ' + T('task: ') + '<span dir="auto">' + esc(task.title) + '</span>' : '') + (g.officeId && officeById(g.officeId) && !officeById(g.officeId).builtIn ? ' · ' + esc(officeName(g.officeId)) : '') + '</div></div><span class="sp"></span>' + riskHtml(g, true) + '</div>'
    html += '<h2 dir="auto" style="font-size:25px;margin-top:20px">' + esc(plainQ(g)) + '</h2>'
    if (g.approvalType === 'action' && g.action) {
      // the preview never repeats the question: a long summary is shown here, a short one is the question above
      html += '<div class="prev"><div class="lbl" style="margin-bottom:8px">' + T(catOf(g)[3]) + '</div>' + (longSum(g) ? '<div class="body" dir="auto">' + esc(g.action.summary) + '</div>' + (g.action.target ? '<p class="mut" dir="auto" style="font-size:12.5px;margin-top:8px">' + T('Where: ') + esc(g.action.target) + '</p>' : '') : '<div class="body" dir="auto">' + (g.action.target ? T('Where: ') + esc(g.action.target) : esc(g.action.summary)) + '</div>') + '<p class="mut" style="font-size:12.5px;margin-top:8px">' + T('Who does it: ') + esc(nameLine(who)) + '</p></div>'
      html += whyNo(T(catOf(g)[5]), T(catOf(g)[6]).replace('{name}', nameOf(who)))
    } else if (g.approvalType === 'hire') {
      html += '<div class="prev"><div class="lbl" style="margin-bottom:8px">' + T('Who would join') + '</div><div class="rw" style="gap:12px;margin-bottom:10px">' + A.person(p.id || 'new', colorOf(p.officeId), 36, true) + '<div><b class="hi" dir="auto">' + esc(p.name || p.id) + '</b><div class="mut" style="font-size:13px" dir="auto">' + esc(p.title || '') + ' · ' + esc(officeName(p.officeId)) + '</div></div></div><p class="soft" dir="auto" style="font-size:14px">' + esc(p.description || '') + '</p><details style="margin-top:10px"><summary>' + T('Their instructions, in full') + '</summary><pre class="txt" style="margin-top:8px">' + esc(p.instructions || '') + '</pre></details></div>'
      html += whyNo(p.why ? esc(p.why) : T('Your assistant thinks a role is missing.'), T('No one is added. Your assistant is told.'), true)
    } else if (Array.isArray(g.choices) && g.choices.length && g.kind !== 'approval') {
      html += whyNo(T('Your team waits for your pick before it goes on.'), T('You can close it without an answer. Your assistant is told and decides itself, or asks again.'))
    } else {
      html += whyNo(T('Your assistant waits for your answer before it goes on.'), T('Nothing happens. Your assistant is told.'))
    }
    if (canWrite()) {
      const name = nameOf(who)
      html += '<div class="rw" style="margin-top:22px;gap:12px;flex-wrap:wrap">' + answerButtons(g, 'lg')
      if (g.approvalType !== 'hire' && (g.kind === 'approval' || !(g.choices || []).length)) html += st.note === g.id || !(g.kind === 'approval') ? replyForm(g, g.kind === 'approval' ? T('What should change?') : T('Your answer')) : '<button type="button" class="b ghost big" data-ev="appr-note" data-arg="' + esc(g.id) + '">' + ic('comment', 16) + esc(T('Ask ') + name + T(' to change something')) + '</button>'
      html += '</div><div class="rw" style="margin-top:12px"><button type="button" class="b ghost sm' + armedCls('ap|' + g.id + '|dis') + '" data-ev="dis" data-arg="' + esc(g.id) + '">' + esc(armedLabel('ap|' + g.id + '|dis', T('Close without answering'))) + '</button><span class="mut" style="font-size:12.5px">' + T('An answer here reaches your assistant the next time it checks.') + '</span></div>'
      if (st.err['ap|' + g.id]) html += '<p class="msg err">' + esc(errTxt(st.err['ap|' + g.id])) + '</p>'
    }
    return html + '</div>'
  }
  const whyNo = (why, no, escaped) => '<div class="whyno"><div><div class="lbl">' + T('Why it matters') + '</div><p class="t" dir="auto">' + (escaped ? why : esc(why)) + '</p></div><div><div class="lbl">' + T('If you say no') + '</div><p class="t" dir="auto">' + esc(no) + '</p></div></div>'

