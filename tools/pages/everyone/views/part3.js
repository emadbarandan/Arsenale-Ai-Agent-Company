  // ========== the wizard: four steps, a campus that grows on the left
  const ASSIST = [['claude-desktop', 'Claude Desktop'], ['vscode', 'VS Code'], ['cursor', 'Cursor'], ['claude-code', 'Claude Code'], ['codex', 'Codex CLI'], ['gemini', 'Gemini CLI'], ['other', 'Other']]
  const KEYWORDS = { 'content-marketing': /shop|store|bakery|cafe|restaurant|brand|market|social|blog|newsletter|sell/i, 'customer-support': /shop|store|customer|client|delivery|service|order|sell/i, operations: /office|bakery|delivery|supplier|shop|admin/i, research: /research|study|consult|analysis/i, hr: /hire|staff|team|people|recruit/i, finance: /invoice|account|budget|finance|book/i, design: /design|studio|brand|print|flyer/i }
  const SHORT = { 'content-marketing': 'Campaigns, copy, social posts, newsletters', 'customer-support': 'Replies, tickets, help pages', finance: 'Invoices, expenses, budget in plain words', hr: 'Job ads, interviews, first-week plans', operations: 'Agendas, minutes, supplier requests', research: 'Sources, competitors, fact-checks', design: 'Moodboards, palettes, layout briefs' }
  function wizOpen() {
    st.wiz = { step: 1, name: '', mission: '', payModel: 'unknown', packs: [], assistant: 'claude-desktop', picked: false }
    st.wv++
    load('onboard', 'api/onboard', true)
    h.redraw()
  }
  const packColor = (p) => themes()[p.office && p.office.theme] || '#56B6C2'
  const packName = (p) => p.name
  const packShort = (p) => (p.office && p.office.name ? p.office.name.split(' & ')[0] : p.name)
  function wizScene(w, packs) {
    const chosen = packs.filter((p) => w.packs.includes(p.id))
    const plots = chosen.map((p) => ({ built: true, color: packColor(p), label: esc(packShort(p)), count: digits(p.members.length), h: 70 + p.members.length * 6 }))
    if (w.step === 1) for (let i = 0; i < 4; i++) plots.push({ built: false })
    let people = []
    if (w.step >= 4) people = chosen.flatMap((p, i) => p.members.slice(0, 2).map((m, n) => ({ seed: m.id, color: packColor(p), plot: i, n })))
    let svg = A.campus(plots.slice(0, 6), people)
    if (w.step === 3) {
      const c = (st.data.connect && st.data.connect.cards || []).find((x) => x.id === w.assistant)
      const linked = !!(c && st.data.connect && seenFor(c, st.data.connect.clients))
      svg = '<g transform="translate(-150,10) scale(.82)">' + svg + '</g>' + A.laptop(esc(c ? T(c.name) : ''), esc(linked ? T('connected') : T('waiting…')), linked)
    }
    return '<svg viewBox="0 0 900 600" preserveAspectRatio="xMidYMid meet" shape-rendering="crispEdges" aria-hidden="true">' + svg + '</svg>'
  }
  function wizHtml() {
    const w = st.wiz
    const d = st.data.onboard
    const packs = (d && d.packs) || []
    // the first look at the offices ticks the ones the description suggests
    if (w.step === 2 && !w.picked && packs.length) { w.picked = true; const text = w.name + ' ' + w.mission; w.packs = packs.filter((p) => KEYWORDS[p.id] && KEYWORDS[p.id].test(text)).map((p) => p.id).slice(0, 3) }
    const steps = [T('Welcome'), T('Offices'), T('Connect'), T('Review')]
    const top = '<div class="wtop"><div class="logo">' + ic('spark', 22) + ' Arsenale <small>' + T('SETUP') + '</small></div>' + steps.map((s, i) => '<span class="stp' + (i + 1 === w.step ? ' on' : i + 1 < w.step || w.step > 4 ? ' done' : '') + '">' + (i + 1 < w.step || w.step > 4 ? ic('check', 15, 2.8) : '<span style="font:12px var(--font-ui)">' + digits(i + 1) + '</span>') + ' ' + s + '</span>' + (i < 3 ? '<span class="mut" style="line-height:0">' + ic('chev', 14) + '</span>' : '')).join('') +
      '<span style="flex:1"></span>' + (w.step < 5 ? '<button type="button" class="b sm ghost" data-ev="wiz-close">' + T('Close (nothing is saved)') + '</button>' : '') + '</div>'
    const say = { 1: 'Hello! I am your assistant. Tell me about your company and we will build your team together.', 2: 'Tick an office and its building appears on your campus.', 3: 'Almost there. I will wait right here until I hear from you.', 4: 'This is your campus. Everyone is ready at their desk.', 5: 'Your company is set up. Give me a first task whenever you like.' }[Math.min(5, w.step)]
    const scene = '<div class="wscene">' + wizScene(w, packs) + '<div class="guide">' + A.robot(64) + '<div class="say">' + T(say) + '</div></div></div>'
    const lbl = (n) => '<div class="lbl">' + T('Step ') + digits(n) + T(' of 4') + '</div>'
    const back = '<button type="button" class="b ghost" data-ev="wiz-back">' + ic('back', 16) + T('Back') + '</button>'
    const next = (label) => '<button type="submit" class="b pri big" style="margin-inline-start:auto">' + label + ' ' + ic('chev', 16, 2.4) + '</button>'
    let form = '<form data-evform="wiz" data-step="' + w.step + '" class="wform"><div class="wpad">'
    let foot = ''
    if (w.step === 1) {
      form += lbl(1) + '<h1>' + T('Welcome. Let us build your office.') + '</h1><p class="lead">' + T('You give jobs in plain words. Your team gets them done and asks you before anything leaves this computer.') + '</p>'
      form += '<label class="fl">' + T('What is your company called?') + '<input type="text" name="name" maxlength="60" dir="auto" required value="' + esc(w.name) + '" style="font-size:16px;padding:12px"></label>'
      form += '<label class="fl">' + T('What does it do?') + '<textarea name="mission" maxlength="300" dir="auto" style="min-height:80px">' + esc(w.mission) + '</textarea><span class="hint" style="font-weight:400">' + T('Helps your team write in the right tone.') + '</span></label>'
      form += '<div class="fl" style="display:flex;flex-direction:column;gap:6px;font-weight:700;color:var(--ink-hi);font-size:13px;margin-top:6px">' + T('How do you pay for your AI assistant?') + '<span class="seg2" role="radiogroup">' + [['plan', T('A monthly plan')], ['api', T('Pay per use')], ['unknown', T('Not sure')]].map(([v, a]) => '<label><input type="radio" name="payModel" value="' + v + '"' + (w.payModel === v ? ' checked' : '') + '>' + a + '</label>').join('') + '</span><span class="hint" style="font-weight:400">' + T('On a plan Arsenale shows time, not money. Budgets can be set later.') + '</span></div>'
      form += '<p class="hint">' + T('Try it first: run “arsenale demo”.') + '</p>'
      foot = '<span class="hint">' + ic('lock', 14) + ' ' + T('Nothing is saved until the last step. About 3 minutes.') + '</span>' + next(T('Choose offices'))
    } else if (w.step === 2) {
      form += lbl(2) + '<h1>' + T('Which offices do you need?') + '</h1><p class="lead">' + T('You can add or remove offices later in Settings.') + '</p>'
      form += packs.length ? '<div style="display:flex;flex-direction:column;gap:8px">' + packs.map((p) => '<label class="oprow" style="border-color:' + (w.packs.includes(p.id) ? esc(packColor(p)) : 'var(--line)') + '"><input type="checkbox" name="pack" value="' + esc(p.id) + '"' + (w.packs.includes(p.id) ? ' checked' : '') + ' data-ev-change="wpack"><span class="bar" style="background:' + esc(packColor(p)) + '"></span><span style="flex:1;min-width:0"><b>' + esc(packName(p)) + '</b><span class="d">' + esc(SHORT[p.id] ? T(SHORT[p.id]) : p.description) + '</span></span><span style="display:flex">' + p.members.slice(0, 3).map((m, i) => '<span style="margin-inline-start:' + (i ? -8 : 0) + 'px">' + A.person(m.id, packColor(p), 22) + '</span>').join('') + '</span></label>').join('') + '</div>' : '<p class="hint">' + T('Loading…') + '</p>'
      if (w.err) form += '<p class="msg err">' + esc(errTxt(w.err)) + '</p>'
      const n = packs.filter((p) => w.packs.includes(p.id))
      foot = back + '<span class="hint"><b style="color:var(--ink-hi)">' + digits(n.length) + ' ' + T(n.length === 1 ? 'office' : 'offices') + '</b>' + T(', ') + digits(n.reduce((s, p) => s + p.members.length, 0)) + ' ' + T('team members') + '</span>' + next(T('Connect assistant'))
    } else if (w.step === 3) {
      form += lbl(3) + '<h1>' + T('Connect your assistant') + '</h1><p class="lead">' + T('Arsenale shows you each change before it makes it, and keeps a backup.') + '</p>'
      const c = st.data.connect
      form += '<div class="rw" style="gap:8px;flex-wrap:wrap">' + ASSIST.map(([v, n]) => '<button type="button" class="chip' + (w.assistant === v ? ' ok' : '') + '" data-ev="wiz-asst" data-arg="' + v + '" aria-pressed="' + (w.assistant === v) + '" style="height:34px;padding:0 14px;font-size:13.5px">' + (v === 'other' ? T('Other') : esc(n)) + '</button>').join('') + '<span class="chip" style="height:34px;opacity:.65">' + T('ChatGPT: not yet') + '</span></div>'
      if (!c) { load('connect', 'api/connect', true); form += '<p class="hint">' + T('Loading…') + '</p>' } else {
        const card = c.cards.find((x) => x.id === w.assistant)
        if (card) form += '<div class="ev" style="position:static;display:block;--rw:0">' + connectSteps(card, c.clients, true) + '</div>'
      }
      form += msgHtml()
      foot = back + '<button type="button" class="b ghost" data-ev="wiz-skip" style="color:var(--cyan)">' + T('Skip for now') + '</button>' + next(T('Review'))
    } else if (w.step === 4) {
      form += lbl(4) + '<h1>' + T('Ready to open the doors?') + '</h1><p class="lead">' + T('Nothing has been saved yet. Check the summary.') + '</p>'
      for (const p of packs.filter((x) => w.packs.includes(x.id))) form += '<div class="card rw"><span style="width:6px;height:38px;border-radius:2px;background:' + esc(packColor(p)) + ';flex:none"></span><div style="width:150px;flex:none"><b style="color:var(--ink-hi)">' + esc(packShort(p)) + '</b><div class="hint">' + digits(p.members.length) + ' ' + T('team members') + '</div></div><span style="display:flex;gap:5px;flex-wrap:wrap">' + p.members.map((m) => A.person(m.id, packColor(p), 22, true)).join('') + '</span></div>'
      const asst = ASSIST.find((x) => x[0] === w.assistant)
      form += '<div class="card rw"><div style="flex:1"><div class="lbl">' + T('Company') + '</div><b style="color:var(--ink-hi)" dir="auto">' + esc(w.name) + '</b></div><div style="flex:1"><div class="lbl">' + T('Assistant') + '</div><div class="rw" style="gap:8px">' + A.robot(22) + '<b style="color:var(--ink-hi)">' + (w.assistant === 'other' ? T('Other') : esc(asst ? asst[1] : '')) + '</b></div></div></div>'
      form += '<div class="card rw" style="border-color:var(--accent-line);background:var(--accent-soft);align-items:flex-start"><span style="color:var(--accent);line-height:0">' + ic('shield', 20) + '</span><div style="font-size:13.5px"><b style="color:var(--ink-hi)">' + T('Safe by default.') + '</b> ' + T('Your team asks you first before it sends, posts, pays or deletes anything.') + '</div></div>'
      form += '<details><summary class="hint" style="cursor:pointer">' + T('Arsenale will create these files and folders, and nothing else') + '</summary>' + (w.preview ? '<pre>' + esc(w.preview.files.join('\n')) + '</pre>' : '<p class="hint">' + T('Loading…') + '</p>') + '</details>'
      if (w.err) form += '<p class="msg err">' + esc(errTxt(w.err)) + '</p>'
      foot = back + next(w.err ? T('Try again') : T('Create my team'))
    } else {
      form += '<div class="lbl">' + T('Done') + '</div><h1>' + T('Your company is set up') + '</h1><p class="lead">' + T('Give your first task, and your assistant sees it the next time you talk to it.') + '</p>'
      foot = '<button type="button" class="b" data-ev="wiz-done">' + T('Open my campus') + '</button><button type="button" class="b pri big" data-ev="wiz-first" style="margin-inline-start:auto">' + T('Give your first task') + '</button>'
    }
    form += '</div><div class="wfoot">' + foot + '</div></form>'
    return top + '<div class="wbody">' + scene + form + '</div>'
  }
  function wizStep(form) {
    const w = st.wiz
    const el = form.elements
    if (w.step === 1) { w.name = String(el.name.value).trim(); w.mission = String(el.mission.value).trim(); const p = [...el].find((x) => x.name === 'payModel' && x.checked); w.payModel = p ? p.value : 'unknown'; if (!w.name) return }
    if (w.step === 2) { w.packs = [...el].filter((x) => x.name === 'pack' && x.checked).map((x) => x.value); if (!w.packs.length) { w.err = 'Choose at least one office'; st.wv++; h.redraw(); return } }
    if (w.step === 4) { create(); return }
    w.err = ''
    w.step++
    if (w.step === 3) { load('connect', 'api/connect', true); if (!st.test) testConnect(w.assistant, true) }
    if (w.step === 4) send('api/onboard', Object.assign({ op: 'preview' }, answers())).then((b) => { w.preview = b.result; st.wv++; h.redraw() }, (e) => { w.err = e.message; st.wv++; h.redraw() })
    st.wv++
    h.redraw()
  }
  const answers = () => { const w = st.wiz; return { name: w.name, mission: w.mission, payModel: w.payModel, packs: w.packs, assistants: w.assistant ? [w.assistant] : [], budget: null } }
  async function create() {
    const w = st.wiz
    w.err = ''
    try {
      const b = await send('api/onboard', answers())
      w.result = b.result
      w.step = 5
    } catch (e) { w.err = e.message }
    st.wv++
    h.redraw()
  }

  // ---------- notifications in this browser
  const notifOn = () => { try { return localStorage.getItem('arsenale-notify') !== 'off' } catch { return true } }
  function setNotif(on) {
    try { localStorage.setItem('arsenale-notify', on ? 'on' : 'off') } catch { /* private window */ }
    if (on && typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission().then(() => bump())
  }
  function notify(title, body, hash) {
    if (!notifOn() || typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    try {
      const n = new Notification(title, { body: String(body || '').slice(0, 160), tag: hash + '|' + title })
      n.onclick = () => { window.focus(); location.hash = hash; n.close() }
    } catch { /* some browsers allow notifications only from a service worker */ }
  }
  /** Called on every redraw: raises a notification for what is new since the
   *  page loaded (never for what was already there). */
  function watch() {
    if (!LIVE) return
    const wait = gates().filter((g) => g.status === 'waiting')
    const tasks = ((st.data.tasksN && st.data.tasksN.tasks) || []).filter((t) => t.status === 'in_review')
    const alerts = (co() && co().activity ? co().activity : []).filter((l) => /^budget\.(alert|hardstop)$/.test(l.action))
    // stalled runs, from the server's 30 s check (watch.cjs); the server sends the phone ones
    const stalls = ((st.data.liveN && st.data.liveN.events) || []).filter((e) => e.kind === 'stalled')
    const ids = { g: new Set(wait.map((g) => g.id)), t: new Set(tasks.map((t) => t.id)), b: new Set(alerts.map((a) => a.at + a.entityId)), s: new Set(stalls.map((e) => e.id)) }
    if (!st.notifSeen) { st.notifSeen = ids; return }
    // the per-event switches of Settings (api/notify events.desktop); on until they are read
    const ev = (st.data.notify && st.data.notify.events && st.data.notify.events.desktop) || {}
    const on = (k) => ev[k] !== false
    if (on('question')) for (const g of wait) if (!st.notifSeen.g.has(g.id)) notify(T('Your assistant asks you something'), g.question, '#/approvals')
    if (on('task') && st.data.tasksN && st.notifSeen.tReady) for (const t of tasks) if (!st.notifSeen.t.has(t.id)) notify(T('A task is waiting for you'), t.title, '#/tasks')
    if (on('budget')) for (const a of alerts) if (!st.notifSeen.b.has(a.at + a.entityId)) notify(T('Budget alert'), a.summary, '#/campus')
    if (on('stalled') && st.data.liveN && st.notifSeen.sReady) for (const e of stalls) if (!st.notifSeen.s.has(e.id)) notify(T('A run has gone quiet'), (e.agent ? e.agent + ': ' : '') + T('no activity for ') + e.quietMin + ' min', '#/live')
    st.notifSeen = Object.assign(ids, { tReady: !!st.data.tasksN, sReady: !!st.data.liveN })
    if (notifOn() && co()) load('tasksN', 'api/tasks', false, 15000)
    if (notifOn()) { load('liveN', 'api/live', false, 15000); load('notify', 'api/notify', false, 60000) }
  }

  // ---------- the Today strip (campus and office)
  function todayStrip(S) {
    const done = S.today || []
    const ms = done.reduce((n, r) => n + (r.durMs || 0), 0)
    const wait = gates().filter((g) => g.status === 'waiting').length
    const d0 = new Date(); d0.setHours(0, 0, 0, 0)
    const dls = ((st.data.dlv && st.data.dlv.deliverables) || []).filter((d) => Date.parse(d.createdAt) >= d0.getTime()).length
    if (LIVE) load('dlv', 'api/deliverables', false, 30000)
    // a count of zero is left out (owner rule); the strip says so in one phrase when nothing is there yet
    const parts = []
    if (done.length) parts.push('<span>' + T('your team finished ') + digits(done.length) + ' ' + T(done.length === 1 ? 'job' : 'jobs') + (ms ? ' ' + T('in') + ' ' + dur(ms) : '') + '</span>')
    if (dls) parts.push('<button type="button" data-ev="goto" data-arg="dlv">' + digits(dls) + ' ' + T('finished work') + '</button>')
    if (wait) parts.push('<button type="button" data-ev="goto" data-arg="appr">' + digits(wait) + ' ' + T(wait === 1 ? 'question waiting' : 'questions waiting') + '</button>')
    return '<div class="today" role="status"><b>' + T('Today') + '</b>' + (parts.length ? parts.join('·') : '<span>' + T('nothing finished yet') + '</span>') + '</div>'
  }

  // ---------- drawing
  function mainHtml(mode) {
    if (mode === 'tasks') return tasksMain()
    if (mode === 'appr') return decisionsMain()
    if (mode === 'live') return liveMain()
    if (mode === 'team') return teamMain()
    if (mode === 'dlv') return dlvMain()
    if (mode === 'market') return marketMain()
    return setMain()
  }
  function drawerHtml() {
    const d = st.drawer
    if (!d) return ''
    if (d.type === 'member') return profile()
    if (d.type === 'hire') return hireForm()
    if (d.type === 'dlv') return dlvPreview()
    if (d.type === 'decision') return decisionDetail()
    if (d.type === 'office') return officeForm()
    return ''
  }
  /** Redraws a container, keeping what was typed into its fields. */
  function paint(el, html) {
    if (el.__html === html) return
    const typed = {}
    el.querySelectorAll('input[name],textarea[name],select[name]').forEach((i) => { if (i.type !== 'checkbox' && i.type !== 'radio' && !i.readOnly) typed[(i.form && i.form.dataset.evform || '') + '|' + i.name] = i.value })
    const act = document.activeElement && el.contains(document.activeElement) && document.activeElement.name ? { n: (document.activeElement.form && document.activeElement.form.dataset.evform || '') + '|' + document.activeElement.name, a: document.activeElement.selectionStart, b: document.activeElement.selectionEnd } : null
    const scroll = [...el.querySelectorAll('.pb,.wpad')].map((x) => x.scrollTop)
    const top = el.scrollTop
    el.innerHTML = html
    el.__html = html
    el.querySelectorAll('input[name],textarea[name],select[name]').forEach((i) => { const k = (i.form && i.form.dataset.evform || '') + '|' + i.name; if (Object.prototype.hasOwnProperty.call(typed, k) && i.type !== 'checkbox' && i.type !== 'radio' && !i.readOnly && !i.dataset.fixed) i.value = typed[k] })
    el.scrollTop = top
    el.querySelectorAll('.pb,.wpad').forEach((x, i) => { if (scroll[i]) x.scrollTop = scroll[i] })
    if (act) { const i = [...el.querySelectorAll('[name]')].find((x) => (x.form && x.form.dataset.evform || '') + '|' + x.name === act.n); if (i) { i.focus(); try { i.setSelectionRange(act.a, act.b) } catch { /* not a text field */ } } }
  }
  function render(mode, root) {
    if (st.lastMode !== mode) { st.lastMode = mode; if (st.drawer && !(mode === 'team' && (st.drawer.type === 'hire' || st.drawer.type === 'member' || st.drawer.type === 'office'))) st.drawer = null; st.dmsg = null; if (mode !== 'tasks') { st.page = null; st.editTask = false } }
    if (!root.querySelector('.ev-main')) root.innerHTML = '<section class="ev-main"></section><aside class="ev-drawer" aria-live="polite"></aside>'
    const main = root.querySelector('.ev-main')
    paint(main, mainHtml(mode))
    const dr = root.querySelector('.ev-drawer')
    // the side panel is redrawn when it changed, never on a mere poll; fresh
    // data for the open panel redraws it too (st.at: when each set arrived)
    const sig = st.dv + '|' + [st.at.team, st.at.member, st.at.dlv, st.at.policy].join(',') + '|' + (st.drawer ? JSON.stringify(st.drawer) : '') + '|' + (st.drawer && st.drawer.type === 'member' ? (st.data.team ? 'y' : 'n') + (st.data.member ? st.data.member.id + st.data.member.backups.length : '') + statusOf(st.drawer.id) + (DATA.runs || []).length : '') + '|' + (st.drawer && st.drawer.type === 'dlv' ? (st.data.dlv ? 'y' : 'n') : '') + '|' + (st.drawer && st.drawer.type === 'decision' ? gates().map((g) => g.id + g.status).join(',') + (st.data.automation ? JSON.stringify(st.data.automation.kinds) + st.data.automation.autoRun : '') : '')
    if (dr.__sig !== sig) { dr.__sig = sig; paint(dr, drawerHtml()) }
  }
  function renderWizard(box) {
    if (!st.wiz) { if (!box.hidden || box.innerHTML) { box.hidden = true; box.innerHTML = ''; box.__sig = ''; box.__html = '' } return }
    box.hidden = false
    const sig = st.wv + '|' + st.dv + '|' + (st.data.onboard ? 'y' : 'n') + '|' + (st.data.connect ? JSON.stringify(st.data.connect.clients) + JSON.stringify(st.test) + JSON.stringify(st.cpv || '') : '') + '|' + JSON.stringify(st.dmsg)
    if (box.__sig === sig) return
    box.__sig = sig
    paint(box, '<div class="wz" role="dialog" aria-modal="true" aria-label="' + T('Set up your company') + '">' + wizHtml() + '</div>')
  }
  /** On first load: no company and no job ever logged opens the wizard; a
   *  wizard left for a language switch comes back where it was. */
  function boot() {
    if (!LIVE || co()) return
    try {
      const saved = JSON.parse(sessionStorage.getItem('arsenale-wiz') || 'null')
      if (saved && saved.step) { sessionStorage.removeItem('arsenale-wiz'); st.wiz = saved; st.wv++; load('onboard', 'api/onboard', true); if (saved.step === 3) load('connect', 'api/connect', true); h.redraw(); return }
    } catch { /* ignore */ }
    getJson('api/onboard').then((d) => { st.data.onboard = d; if (d.wizard && !st.wiz) wizOpen() }, () => { /* an older server: no wizard */ })
  }

  // ---------- actions
  async function act(fn, after) {
    st.dmsg = null
    try { const r = await fn(); if (after) after(r) } catch (e) { st.dmsg = { ok: false, text: T('Not saved: ') + errTxt(e.message) } }
    bump()
  }
  function testConnect(client, quiet) {
    st.test = { client, from: Date.now(), ok: false, failed: false, quiet: !!quiet }
    const t = setInterval(() => {
      if (!st.test || st.test.client !== client) { clearInterval(t); return }
      const c = st.data.connect
      const hit = c && c.clients.some((x) => Date.parse(x.lastHello || x.lastSeen) >= st.test.from - 2000)
      if (hit) { st.test.ok = true; clearInterval(t) } else if (Date.now() - st.test.from > 180000) { st.test.failed = true; clearInterval(t) }
      load('connect', 'api/connect', true)
      bump()
    }, 2000)
  }
  function answerSent(id, b) {
    const i = gates().findIndex((g) => g.id === id)
    if (i >= 0 && b && b.gate) DATA.gates[i] = Object.assign(DATA.gates[i], b.gate)
    st.err['ap|' + id] = ''; st.note = ''
    if (st.page && st.page.type === 'task') load('task', 'api/task?id=' + encodeURIComponent(st.page.id), true)
    bump()
  }
  const openTask = (id) => { st.page = { type: 'task', id }; st.editTask = false; st.dmsg = null; st.drawer = null; load('task', 'api/task?id=' + encodeURIComponent(id), true); load('dlv', 'api/deliverables', false, 10000) }
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-ev]')
    if (!t) return
    const a = t.dataset.ev, arg = t.dataset.arg || ''
    if (a === 'tview') { st.taskView = arg; try { localStorage.setItem('arsenale-task-view', arg) } catch { /* ignore */ } h.redraw(); return }
    if (a === 'tfilter') { st.taskFilter = arg; h.redraw(); return }
    if (a === 'dkind') { st.dlvKind = arg; h.redraw(); return }
    if (a === 'stab') { st.setTab = arg; st.dmsg = null; h.redraw(); return }
    if (a === 'goto') { location.hash = '#/' + ({ dlv: 'deliverables', appr: 'approvals', tasks: 'tasks' }[arg] || arg); return }
    if (a === 'goto-connect') { st.setTab = 'assistants'; location.hash = '#/settings'; return }
    if (a === 'goto-packs') { location.hash = '#/marketplace'; return }
    if (a === 'goto-appr') { st.apprSel = arg; location.hash = '#/approvals'; return }
    if (a === 'appr-sel') { st.apprSel = arg; st.note = ''; h.redraw(); return }
    if (a === 'appr-note') { st.note = arg; bump(); return }
    if (a === 'drawer-close') { st.drawer = null; st.dmsg = null; st.hire = null; bump(); return }
    if (a === 'page-close') { st.page = null; st.editTask = false; st.dmsg = null; bump(); return }
    if (a === 'task-new') { st.page = { type: 'new' }; st.drawer = null; st.dmsg = null; bump(); return }
    if (a === 'task-sample') { const s = samplesOf()[Number(arg)]; st.page = { type: 'new', pre: s }; st.dmsg = null; bump(); return }
    if (a === 'task-for') { st.page = { type: 'new', who: arg }; st.drawer = null; st.dmsg = null; location.hash = '#/tasks'; bump(); return }
    if (a === 'task-open') { openTask(arg); if (location.hash !== '#/tasks') location.hash = '#/tasks'; bump(); return }
    if (a === 'task-edit') { st.editTask = !st.editTask; bump(); return }
    if (a === 'task-done' || a === 'task-reopen') { act(() => send('api/task', { op: 'update', id: arg, status: a === 'task-done' ? 'done' : 'todo' }), () => { load('task', 'api/task?id=' + encodeURIComponent(arg), true); load('tasks', 'api/tasks', true) }); return }
    if (a === 'task-copy') { copy(T('Please check Arsenale for task ') + arg + T(' and start it.')); return }
    if (a === 'copy') { copy(arg); return }
    if (a === 'copy-hello') { copy(T('Say hello to Arsenale')); return }
    if (a === 'team-office') { st.teamOffice = arg; st.drawer = null; bump(); return }
    if (a === 'team-view') { st.teamView = arg === 'table' ? 'table' : 'tiles'; try { localStorage.setItem('arsenale-team-view', st.teamView) } catch { /* a private window */ } bump(); return }
    // from the org chart: the profile opens on the Team screen, in the member's office
    if (a === 'member-open' && t.dataset.toTeam) { const e = emp(arg); if (e && e.homeOfficeId) st.teamOffice = e.homeOfficeId; location.hash = '#/team' }
    if (a === 'member-open') { st.drawer = { type: 'member', id: arg }; st.profOpen = ''; st.dmsg = null; st.data.member = null; load('policy', 'api/policy', false, 30000); bump(); return }
    // the preview opens beside the screen it was asked from (Finished work, or a task)
    if (a === 'dlv-open') { st.drawer = { type: 'dlv', id: arg }; st.dmsg = null; load('dlv', 'api/deliverables', false, 10000); bump(); return }
    if (a === 'hire-new') { st.hire = { op: 'hire', officeId: st.teamOffice && st.teamOffice !== 'unassigned' ? st.teamOffice : (offices()[0] || {}).id, tier: 'standard', skills: [], look: 0 }; st.drawer = { type: 'hire' }; st.dmsg = null; bump(); return }
    if (a === 'hire-back') { st.hire.preview = ''; st.dmsg = null; bump(); return }
    if (a === 'hire-tpl') {
      const f = t.closest('.ev-drawer') && document.getElementById('hform')
      if (f) readHire(f)
      const i = Number(arg)
      st.hire.tpl = i
      if (i >= 0) { const x = TEMPLATES[i]; st.hire.title = T(x[1]); st.hire.instructions = T(x[2]); st.hire.skills = T(x[3]).split(',') }
      bump(); return
    }
    if (a === 'skill-del') { const f = document.getElementById('hform'); if (f) readHire(f); st.hire.skills.splice(Number(arg), 1); bump(); return }
    if (a === 'member-edit') {
      const m = st.data.team.members.find((x) => x.id === arg), mm = st.data.member
      const body = mm && mm.id === arg ? mm.body : ''
      const sec = /## How to do this job\s*\n([\s\S]*?)\n## Safety/.exec(body)
      const def = (DATA.agents || []).find((x) => x.name === arg) || {}
      st.hire = { op: 'edit', id: arg, name: m.name || m.title || arg, title: m.title, officeId: m.homeOfficeId, description: String(def.descriptionEn || '').replace(/^"|"$/g, ''), instructions: sec ? sec[1].trim() : body.trim(), tier: m.tier || 'standard', managed: mm && mm.managed, skills: (m.skills || []).slice(), look: m.look || 0 }
      if (!mm || mm.id !== arg) load('member', 'api/member?id=' + encodeURIComponent(arg), true)
      st.drawer = { type: 'hire' }; st.dmsg = null; bump(); return
    }
    if (a === 'hire-edit') {
      const g = gates().find((x) => x.id === arg)
      if (!g) return
      const p = g.payload || {}
      st.hire = { op: 'hire', fromGate: g.id, id: p.id, name: p.name, title: p.title, officeId: p.officeId, description: p.description, instructions: p.instructions, tier: p.tier || 'standard', skills: [], look: 0 }
      st.teamOffice = p.officeId || st.teamOffice
      location.hash = '#/team'
      st.drawer = { type: 'hire' }; bump(); return
    }
    if (a === 'hire-yes' || a === 'hire-no') {
      if (!arm('ap|' + arg + '|' + (a === 'hire-yes' ? 'hire' : 'decline'))) return
      send('api/hire-decision', { gate: arg, decision: a === 'hire-yes' ? 'hire' : 'decline' }).then(() => { st.err['ap|' + arg] = ''; h.refresh(); bump() }, (err) => { st.err['ap|' + arg] = err.message; bump() })
      return
    }
    if (a === 'ans' || a === 'dis') {
      const key = 'ap|' + arg + '|' + (a === 'dis' ? 'dis' : t.dataset.val)
      if (!arm(key)) return
      ;(a === 'ans' ? send('api/answer', answerBody(arg, t.dataset.val)) : send('api/dismiss', { gate: arg })).then((b) => answerSent(arg, b), (err) => { st.err['ap|' + arg] = err.message; bump() })
      return
    }
    if (a === 'retire') { if (!arm('retire|' + arg)) return; act(() => send('api/team-member', { op: 'retire', id: arg }), () => { st.dmsg = { ok: true, text: T('Retired. Their history stays.') }; load('team', 'api/team', true) }); return }
    if (a === 'unretire') { act(() => send('api/team-member', { op: 'unretire', id: arg }), () => load('team', 'api/team', true)); return }
    if (a === 'restore') { const [id, b] = arg.split('|'); if (!arm('restore|' + b)) return; act(() => send('api/team-member', { op: 'restore', id, backup: b }), () => { st.dmsg = { ok: true, text: T('Restored. The version before is kept too.') }; st.data.member = null }); return }
    if (a === 'pol') {
      const [member, category, value] = arg.split('|')
      act(() => send('api/policy', member ? { scope: 'member', id: member, category, value: value || null } : { category, value }), () => { load('team', 'api/team', true); load('policy', 'api/policy', true) })
      return
    }
    if (a === 'pack-open') { st.openPack = st.openPack === arg ? '' : arg; st.conflict = null; st.packMsg = null; bump(); return }
    if (a === 'pack') {
      const [op, id] = arg.split('|')
      if (op === 'remove' && !arm('pack|remove|' + id)) return
      const body = op === 'remove' ? { op: 'remove', id } : op === 'update' ? { op: 'update', id } : { op: 'install', id, onConflict: op === 'install-keep' ? 'keep' : op === 'install-rename' ? 'rename' : undefined }
      st.conflict = null; st.packMsg = null
      send('api/pack', body).then((b) => {
        const r = b.result
        st.packMsg = { id, ok: true, text: op === 'remove' ? T('Removed.') + (r.kept.length ? ' ' + T('Kept because you changed them: ') + r.kept.join(', ') : '') : op === 'update' ? T('Updated.') : T('Installed: ') + r.files.join(', ') + (r.kept.length ? ' · ' + T('kept yours: ') + r.kept.join(', ') : '') }
        load('packs', 'api/packs', true); load('team', 'api/team', true); h.refresh()
      }, (err) => { if (/already exist/.test(err.message)) st.conflict = { id, msg: err.message }; else st.packMsg = { id, ok: false, text: errTxt(err.message) }; bump() })
      return
    }
    if (a === 'pack-cancel') { st.conflict = null; bump(); return }
    if (a === 'copen') { st.openCard = st.openCard === arg ? '' : arg; st.cpv = null; bump(); return }
    if (a === 'cpreview') { st.cpv = null; act(() => send('api/connect-preview', { client: arg }), (b) => { st.cpv = b.result; if (b.result && b.result.unchanged) st.added = arg }); return }
    if (a === 'ccancel') { st.cpv = null; bump(); return }
    if (a === 'capply') { act(() => send('api/connect-apply', { client: arg, hash: st.cpv.hash }), (b) => { st.cpv = null; st.added = arg; st.dmsg = { ok: true, text: T('Written. Backup: ') + (b.result.backup || T('none (new file)')) + '. ' + T('Restart your assistant, then say hello.') }; if (!st.test || st.test.client !== arg) testConnect(arg) }); return }
    if (a === 'ctest') { testConnect(arg); bump(); return }
    if (a === 'forget') { if (!arm('forget|' + arg)) return; act(() => send('api/mcp-forget', { id: arg }), () => load('connect', 'api/connect', true)); return }
    if (a === 'mktoken') { const b = new Uint8Array(32); crypto.getRandomValues(b); st.token = [...b].map((x) => x.toString(16).padStart(2, '0')).join(''); bump(); return }
    if (a === 'notif-perm') { if (typeof Notification !== 'undefined') Notification.requestPermission().then(() => bump()); return }
    if (a === 'nchan') { st.channel = arg; st.dmsg = null; bump(); return }
    if (a === 'wiz-open') { wizOpen(); return }
    if (a === 'wiz-close') { st.wiz = null; st.test = null; h.redraw(); return }
    if (a === 'wiz-back') { st.wiz.step--; st.wiz.err = ''; st.wv++; h.redraw(); return }
    if (a === 'wiz-asst') { st.wiz.assistant = arg; st.cpv = null; testConnect(arg, true); st.wv++; h.redraw(); return }
    if (a === 'wiz-skip') { st.wiz.step = 4; st.wv++; send('api/onboard', Object.assign({ op: 'preview' }, answers())).then((b) => { st.wiz.preview = b.result; st.wv++; h.redraw() }, (e2) => { st.wiz.err = e2.message; st.wv++; h.redraw() }); h.redraw(); return }
    if (a === 'wiz-done') { st.wiz = null; location.hash = '#/campus'; location.reload(); return }
    if (a === 'wiz-first') {
      const s = st.wiz.result && st.wiz.result.sampleTask
      st.wiz = null
      try { sessionStorage.setItem('arsenale-first-task', JSON.stringify(s || {})) } catch { /* ignore */ }
      location.hash = '#/tasks'
      location.reload()
    }
  })
  document.addEventListener('toggle', (e) => {
    const d = e.target
    if (d && d.dataset && d.dataset.evToggle) st.profOpen = d.open ? d.dataset.evToggle : st.profOpen === d.dataset.evToggle ? '' : st.profOpen
  }, true)
  document.addEventListener('input', (e) => {
    const t = e.target.closest('[data-ev-input]')
    if (t && t.dataset.evInput === 'dq') { st.dlvQ = t.value; h.redraw() }
    if (t && t.dataset.evInput === 'tq') { st.teamQ = t.value; h.redraw() }
  })
  document.addEventListener('keydown', (e) => {
    const t = e.target.closest && e.target.closest('[data-ev-enter]')
    if (t && e.key === 'Enter') { e.preventDefault(); const f = document.getElementById('hform'); if (f) readHire(f); bump() }
  })
  document.addEventListener('change', (e) => {
    const t = e.target.closest('[data-ev-change]')
    if (!t) return
    const a = t.dataset.evChange
    if (a === 'toffice') { st.taskOffice = t.value; h.redraw() }
    if (a === 'teamStatus') { st.teamStatus = t.value; h.redraw() }
    if (a === 'teamModel') { st.teamModel = t.value; h.redraw() }
    if (a === 'notif') { setNotif(t.checked); bump() }
    if (a === 'wpack') { const f = t.closest('form'); st.wiz.packs = [...f.elements].filter((x) => x.name === 'pack' && x.checked).map((x) => x.value); st.wiz.err = ''; st.wv++; h.redraw() }
    if (a === 'phone') act(() => send('api/policy', { category: t.dataset.arg, phoneAllowed: t.checked }), () => load('policy', 'api/policy', true))
  })
  document.addEventListener('submit', (e) => {
    const f = e.target.closest('[data-evform]')
    if (!f) return
    e.preventDefault()
    const a = f.dataset.evform
    const el = f.elements
    if (a === 'task-new') {
      const pick = [...el].find((x) => x.name === 'who' && x.checked)
      const who = pick ? String(pick.value) : ''
      const body = { title: el.title.value, description: el.description.value, dueDate: el.dueDate.value, links: linksOf(el), needsSignOff: el.needsSignOff.checked }
      for (const k of ['type', 'size', 'tier', 'targetVersion', 'acceptance']) if (el[k].value) body[k] = el[k].value
      if (el.tokenEstimate.value !== '') body.tokenEstimate = Number(el.tokenEstimate.value)
      if (who.indexOf('office:') === 0) body.assigneeOfficeId = who.slice(7); else if (who) body.assignee = who
      act(() => send('api/task', body), (b) => { openTask(b.result.id); st.data.task = null; load('tasks', 'api/tasks', true) })
    } else if (a === 'task-edit') {
      const who = String(el.who.value || '')
      const body = { op: 'update', id: f.dataset.id, title: el.title.value, description: el.description.value, dueDate: el.dueDate.value, status: el.status.value, needsSignOff: el.needsSignOff.checked, type: el.type.value, size: el.size.value, tier: el.tier.value, targetVersion: el.targetVersion.value, acceptance: el.acceptance.value, tokenEstimate: el.tokenEstimate.value === '' ? null : Number(el.tokenEstimate.value) }
      if (who.indexOf('office:') === 0) body.assigneeOfficeId = who.slice(7); else body.assignee = who
      act(() => send('api/task', body), () => { st.editTask = false; load('task', 'api/task?id=' + encodeURIComponent(f.dataset.id), true); load('tasks', 'api/tasks', true) })
    } else if (a === 'task-comment') {
      const text = String(el.text.value || '').trim()
      if (!text) return
      act(() => send('api/task-comment', { id: f.dataset.id, text }), () => { el.text.value = ''; load('task', 'api/task?id=' + encodeURIComponent(f.dataset.id), true) })
    } else if (a === 'ans') {
      const v = String(el.a.value || '').trim()
      // on an approval the box asks for a change: the answer says plainly it is not a yes
      if (v) send('api/answer', answerBody(f.dataset.id, f.dataset.note ? T('Not yet: ') + v : v)).then((b) => answerSent(f.dataset.id, b), (err) => { st.err['ap|' + f.dataset.id] = err.message; bump() })
    } else if (a === 'hire') {
      readHire(f)
      const hf = st.hire
      if (hf.preview) {
        const go = hf.fromGate ? send('api/hire-decision', { gate: hf.fromGate, decision: 'hire', edits: hireBody() }) : send('api/team-member', hireBody())
        act(() => go, () => { st.drawer = { type: 'member', id: hf.id }; st.hire = null; st.dmsg = { ok: true, text: T('Saved. Your assistant sees the change in its next conversation. Claude Code: restart the session.') }; load('team', 'api/team', true); h.refresh() })
        return
      }
      hf.err = { title: !String(hf.title || '').trim(), instructions: Array.from(String(hf.instructions || '').trim()).length < 10 && Array.from(String(hf.description || '').trim()).length < 10 }
      if (hf.err.title || hf.err.instructions) { bump(); return }
      hf.err = null
      send('api/team-member', Object.assign(hireBody(), { op: 'preview', id: hf.id || 'member-1' })).then((b) => { hf.preview = b.result.text; st.dmsg = null; bump() }, (err) => { st.dmsg = { ok: false, text: errTxt(err.message) }; bump() })
    } else if (a === 'wiz') wizStep(f)
  })
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    if (st.wiz && st.wiz.step < 5) { st.wiz = null; st.test = null; h.redraw() } else if (st.drawer) { st.drawer = null; st.hire = null; bump() } else if (st.page) { st.page = null; st.editTask = false; bump() }
  })
  // the wizard's "Give your first task" lands here after the reload
  try {
    const first = sessionStorage.getItem('arsenale-first-task')
    if (first) { sessionStorage.removeItem('arsenale-first-task'); const s = JSON.parse(first); st.page = { type: 'new', pre: s && s.title ? s : undefined } }
  } catch { /* ignore */ }

  return { MODES, render, renderWizard, todayStrip, watch, boot, wizOpen, st }
