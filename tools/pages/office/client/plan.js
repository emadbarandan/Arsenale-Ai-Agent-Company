  // ---------- the Dock: screen "Plan" (spec 1.4 section 4)
  // Every string a person reads goes through T(); tools/strings/extract.cjs collects the keys into
  // tools/strings/catalogue.json and tools/test/strings-catalogue.test.cjs keeps the two in step.
  // Every select is a glass listbox (stage/listbox.cjs); layout uses logical CSS properties.
  const LB = listboxView({ esc })
  function planView(h) {
    const { esc, T } = h
    const TABS = [['roadmap', T('Roadmap')], ['version', T('Version')], ['today', T('Today')], ['queue', T('Queue')], ['proposals', T('Proposals')]]
    const HORIZONS = [['now', T('Now')], ['next', T('Next')], ['later', T('Later')]]
    const st = { today: null, queue: null, tab: 'roadmap', project: '', plan: null, tasks: [], byTask: {}, byVersion: {}, runs: [], error: false, busy: false, at: 0, key: '', ver: '', vmode: '', sheet: null, msg: '', decide: '', relOpen: false, dropOpen: false, notes: '', last: '', openImport: false, shadowView: false, hasShadow: false, into: null, intoVer: 'next-patch', intoPhase: '', edit: '' }
    const num = (n) => h.digits(n)
    // a server refusal is shown as a sentence of the catalogue (the raw text stays in the tooltip)
    function msgOf(e) {
      const m = String((e && e.message) || e || '')
      const known = [[/lost its key/i, T('This page lost its key. Open the dashboard again with arsenale open.')], [/only the owner/i, T('Only the owner can do this.')], [/shadow copy/i, T('Shadow copy of HQ. HQ is the master; editing is off.')],
        [/already/i, T('That name is taken, or another version is already active.')], [/no such|not found/i, T('That item no longer exists. Reload and try again.')], [/too many|waiting/i, T('Too many proposals are waiting. Answer some first.')], [/restart the dashboard/i, T('Restart the dashboard server once to turn this on.')]]
      const hit = known.find(([re]) => re.test(m))
      return { text: hit ? hit[1] : T('The change was refused.'), raw: m }
    }
    const msgP = () => '<p class="pl-banner bad" role="alert" title="' + esc(st.msgRaw || '') + '">' + esc(st.msg) + '</p>'
    const fail = (e) => { const r = msgOf(e); st.msg = r.text; st.msgRaw = r.raw; h.redraw() }
    const wide = () => window.innerWidth >= 900
    const tok = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(n))
    const clipTxt = (s, n) => { const a = Array.from(String(s || '')); return a.length > n ? a.slice(0, n - 1).join('') + '…' : a.join('') }

    // ---- data: one project at a time; the owner's key cookie rides along
    const projects = () => h.projects()
    function current() {
      const list = projects()
      if (!st.project) { const m = /^#\/plan\/([\w.-]+)/.exec(location.hash || ''); if (m) st.project = m[1] } // #/plan/<project> opens that project
      if (!list.some((p) => p.id === st.project)) st.project = list.length ? list[0].id : ''
      return st.project
    }
    const getJson = (url) => fetch(url, { cache: 'no-store', credentials: 'same-origin' }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json() })
    function fetchIt() {
      const pid = current()
      if (!h.live() || st.busy || !pid) return
      st.busy = true
      const q = encodeURIComponent(pid)
      Promise.all([getJson('api/plan?project=' + q + (st.shadowView ? '&shadow=1' : '')), getJson('api/tasks'), getJson('api/ledger?by=version'), getJson('api/ledger?by=task'), getJson('api/version-runs').catch(() => null), getJson('api/today').catch(() => null), getJson('api/queue').catch(() => null)])
        .then(([plan, tasks, lv, lt, vr, td, qu]) => {
          st.plan = plan; st.error = false; st.today = td; st.queue = qu
          if (!st.shadowView) st.hasShadow = !!plan.hasShadow
          st.tasks = ((st.shadowView ? plan.tasks : tasks.tasks) || []).filter((t) => t.projectId === pid)
          st.byVersion = {}; for (const g of lv.rows || []) st.byVersion[g.key] = g
          st.byTask = {}; for (const g of lt.rows || []) st.byTask[g.key] = g
          const runs = vr && (Array.isArray(vr) ? vr : vr.runs || Object.values(vr))
          st.runs = Array.isArray(runs) ? runs : []
        }, () => { st.error = true })
        .then(() => { st.busy = false; if (h.shown()) h.redraw() })
    }
    const watch = () => { if (Date.now() - st.at > 3000) { st.at = Date.now(); fetchIt() } }
    const reload = () => { st.at = Date.now(); st.busy = false; fetchIt() }

    // ---- rules
    const readOnly = () => h.readOnly()
    const shadow = () => !!(st.plan && st.plan.master === 'shadow')
    const owner = () => h.live()
    const locked = () => shadow() || readOnly()
    const lockWhy = () => (shadow() ? T('Shadow copy of HQ. HQ is the master; editing is off.') : T('Read-only: this company folder was written by a newer dashboard.'))
    const btn = (label, attrs, cls, ownerOnly) => {
      if (ownerOnly && !owner()) return ''
      const dis = ownerOnly && locked()
      return '<button ' + (/type=/.test(attrs) ? '' : 'type="button" ') + 'class="pl-b' + (cls ? ' ' + cls : '') + '" ' + attrs + (dis ? ' disabled aria-disabled="true" title="' + esc(lockWhy()) + '"' : '') + '>' + label + '</button>'
    }
    const sel = (name, options, value, label, extra) => '<select data-pl-sel="' + name + '" aria-label="' + esc(label) + '"' + (extra || '') + '>' + options.map(([v, text]) => '<option value="' + esc(v) + '"' + (v === value ? ' selected' : '') + '>' + esc(text) + '</option>').join('') + '</select>'
    const statusWord = (s, unlisted) => (unlisted ? T('Unlisted') : { planned: T('Planned'), active: T('Active'), released: T('Released'), dropped: T('Dropped') }[s] || s)
    const taskWord = (s) => ({ backlog: T('Backlog'), todo: T('To do'), in_progress: T('In progress'), in_review: T('In review'), blocked: T('Blocked'), done: T('Done'), cancelled: T('Cancelled') }[s] || s)
    const allVersions = () => (st.plan ? st.plan.versions.concat(st.plan.unlisted) : [])
    const versionNamed = (n) => allVersions().find((v) => v.name === n) || null
    const tasksOf = (name) => st.tasks.filter((t) => t.targetVersion === name && t.status !== 'cancelled')
    const decisionsOf = (name) => h.decisions().filter((d) => d.project === st.project && d.targetVersion === name)
    const blockedOf = (name) => tasksOf(name).filter((t) => t.status === 'blocked').length
    const costOf = (name) => { const g = st.byVersion[name]; return !g || g.usdStatus === 'none' ? T('not recorded') : g.cost }
    const costNeedsPrices = (name) => { const g = st.byVersion[name]; return !!g && g.usdStatus === 'na' }
    const queuedIds = () => new Set(((st.queue && st.queue.entries) || []).map((e) => e.taskId))
    const queueable = (t) => (t.status === 'todo' || t.status === 'backlog') && !queuedIds().has(t.id)
    const pct = (p) => (p.percent === null ? T('No plan') : num(p.percent) + ' %')

    // ---- pieces
    function ring(p, size) {
      const r = 15.9155, c = 2 * Math.PI * r, v = p.percent === null ? 0 : p.percent
      return '<span class="pl-ring" style="inline-size:' + size + 'px;block-size:' + size + 'px" role="img" aria-label="' + esc(pct(p)) + '"><svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="' + r + '" class="t"/>' +
        (v ? '<circle cx="18" cy="18" r="' + r + '" class="f" stroke-dasharray="' + (c * v / 100).toFixed(2) + ' ' + c.toFixed(2) + '" transform="rotate(-90 18 18)"/>' : '') + '</svg><b>' + esc(p.percent === null ? T('No plan') : num(p.percent) + '%') + '</b></span>'
    }
    const weights = (p) => (p.tasks ? num(p.doneWeight) + '/' + num(p.totalWeight) + ' ' + T('weight') : T('No tasks planned into this version yet'))
    function facts(v) {
      const open = decisionsOf(v.name).filter((d) => d.state === 'open').length
      const b = blockedOf(v.name)
      return '<dl class="pl-facts"><div><dt>' + T('Done') + '</dt><dd>' + esc(v.progress.tasks ? num(v.progress.doneWeight) + '/' + num(v.progress.totalWeight) : '—') + '</dd></div>' +
        '<div><dt>' + T('Open decisions') + '</dt><dd>' + num(open) + '</dd></div><div><dt>' + T('Blocked') + '</dt><dd>' + num(b) + '</dd></div>' +
        '<div><dt>' + T('Cost') + '</dt><dd class="pl-cost" title="' + esc(costOf(v.name)) + '">' + esc(costOf(v.name)) + '</dd></div></dl>'
    }
    function notes(v) {
      let s = ''
      const u = v.progress.unsized
      if (u) s += '<p class="pl-note">' + num(u) + ' ' + (u === 1 ? T('task has no size (counted as 1)') : T('tasks have no size (counted as 1)')) + '</p>'
      return s
    }
    // the 1.3 rule: never "$0.00" for an unpriced or unmeasured version (the ledger gives the words)
    function costLine(v) {
      let s = '<span class="pl-cost">' + esc(costOf(v.name)) + '</span>'
      if (costNeedsPrices(v.name) && owner()) s += ' <button type="button" class="pl-link" data-pl-go="set">' + T('Fill in prices') + '</button>'
      return s
    }

    // ---- banners
    function banners() {
      let s = ''
      if (!st.plan) return s
      if (shadow()) s += '<p class="pl-banner" role="status">' + T('Shadow copy of HQ. HQ is the master; editing is off.') + ' <button type="button" class="pl-link" data-pl-shadow="live">' + T('Back to the live plan') + '</button></p>'
      else if (st.plan.master === 'import') s += '<p class="pl-banner" role="status">' + T('Planned in another tool. Changes made here may be overwritten by the next import.') + '</p>'
      if (readOnly()) s += '<p class="pl-banner" role="status">' + T('Read-only: this company folder was written by a newer dashboard.') + '</p>'
      if (!shadow() && st.hasShadow && owner()) s += '<p class="pl-banner" role="status"><button type="button" class="pl-link" data-pl-shadow="shadow">' + T('Show the shadow of HQ (read-only)') + '</button></p>'
      const li = st.plan.lastImport
      if (li && typeof li === 'object') {
        const c = (li.conflicts || []).length || +li.conflicts || 0, g = st.plan.gone ? st.plan.gone.length : (li.missing || []).length || +li.missing || 0
        if (c || g) s += '<p class="pl-banner warn" role="status">' + T('Last import') + ': ' + num(c) + ' ' + (c === 1 ? T('conflict') : T('conflicts')) + ', ' + num(g) + ' ' + (g === 1 ? T('item gone from the file') : T('items gone from the file')) + '</p>'
      }
      s += gonePanel()
      if (st.msg) s += msgP()
      return s
    }
    // spec 5.4: items gone from the import file wait for the owner: Keep clears the flag, Cancel task cancels it
    function gonePanel() {
      const g = (st.plan && st.plan.gone) || []
      if (!g.length) return ''
      const kindWord = { task: T('Task'), decision: T('Decision'), version: T('Version') }
      return '<section class="pl-card glass pl-tg pl-gone" data-pl-gone="1" aria-label="' + esc(T('Gone from the import file?')) + '"><h3>' + T('Gone from the import file?') + ' <span>' + num(g.length) + '</span></h3><ul class="pl-tl">' + g.map((i) =>
        '<li><span class="id">' + esc(kindWord[i.kind] || i.kind) + (i.kind === 'task' ? ' ' + esc(i.id) : '') + '</span><span class="ti" title="' + esc(i.title) + '" dir="auto">' + esc(i.title) + '</span>' +
        '<span class="pl-acts">' + btn(T('Keep'), 'data-pl-keep="' + esc(i.id) + '" data-k="' + esc(i.kind) + '"', '', true) + (i.kind === 'task' ? btn(T('Cancel task'), 'data-pl-cgone="' + esc(i.id) + '" data-k="task"', 'bad', true) : '') + '</span></li>').join('') + '</ul></section>'
    }

    // ---- the form sheet: a new or edited version (inline, never a native dialog)
    function sheet() {
      const f = st.sheet
      if (!f) return ''
      const edit = f.mode === 'edit'
      return '<form class="pl-sheet glass" data-pl-form="1" aria-label="' + esc(edit ? T('Edit version') : T('New version')) + '"><h3>' + (edit ? T('Edit version') : T('New version')) + '</h3>' +
        '<label><span>' + T('Name') + '</span><input name="name" value="' + esc(f.name) + '" maxlength="20" ' + (edit ? 'readonly' : 'required') + ' autocomplete="off" placeholder="2.1"></label>' +
        '<label><span>' + T('Title') + '</span><input name="title" value="' + esc(f.title) + '" maxlength="120" autocomplete="off"></label>' +
        '<label><span>' + T('Goal') + '</span><textarea name="goal" rows="3" maxlength="500">' + esc(f.goal) + '</textarea></label>' +
        '<label><span>' + T('Lane') + '</span>' + sel('sheet-horizon', HORIZONS, f.horizon, T('Lane'), ' data-block="1"') + '</label>' +
        '<div class="pl-row">' + btn(T('Save'), 'type="submit" data-pl-save="1"', 'pri', true) + '<button type="button" class="pl-b" data-pl-cancel="1">' + T('Cancel') + '</button></div></form>'
    }

    // ---- Roadmap
    function card(v) {
      const own = owner()
      const dragIt = own && !locked() && wide() && !v.unlisted
      const moves = v.unlisted ? '' : HORIZONS.filter(([k]) => k !== v.horizon).map(([k, l]) => btn(T('Move to') + ' ' + l, 'data-pl-move="' + esc(v.name) + '" data-h="' + k + '"', '', true)).join('')
      return '<article class="pl-card glass" data-pl-card="' + esc(v.name) + '"' + (dragIt ? ' draggable="true"' : '') + '>' +
        '<header><button type="button" class="pl-vn" data-pl-open="' + esc(v.name) + '" title="' + esc(v.name + (v.title ? ' ' + v.title : '')) + '"><b>' + esc(v.name) + '</b><span>' + esc(v.title) + '</span></button><span class="pl-chip s-' + esc(v.unlisted ? 'unlisted' : v.status) + '">' + esc(statusWord(v.status, v.unlisted)) + '</span></header>' +
        '<div class="pl-mid">' + ring(v.progress, 56) + '<div class="pl-nums"><b>' + esc(v.progress.tasks ? pct(v.progress) : T('No plan')) + '</b><span>' + esc(weights(v.progress)) + '</span></div></div>' +
        facts(v) + notes(v) +
        (v.progress.ready ? '<p class="pl-ready">' + T('100 %, ready to release') + '</p>' : '') +
        '<div class="pl-acts">' + btn(T('Open'), 'data-pl-open="' + esc(v.name) + '"', '', false) + moves + (v.unlisted ? btn(T('Add to roadmap'), 'data-pl-addroad="' + esc(v.name) + '"', '', true) : btn(T('Edit'), 'data-pl-edit="' + esc(v.name) + '"', '', true) + (v.status === 'dropped' ? btn(T('Reopen'), 'data-pl-reopen="' + esc(v.name) + '"', '', true) : btn(T('Drop'), 'data-pl-drop="' + esc(v.name) + '"', 'bad', true))) + '</div></article>'
    }
    function roadmap() {
      const p = st.plan
      const live = p.versions.filter((v) => v.status !== 'released' && v.status !== 'dropped')
      const rel = p.versions.filter((v) => v.status === 'released'), dropped = p.versions.filter((v) => v.status === 'dropped')
      const lane = (k, l) => {
        const vs = live.filter((v) => v.horizon === k).concat(k === 'later' ? p.unlisted : [])
        let extra = ''
        if (k === 'now' && rel.length) extra += '<div class="pl-fold"><button type="button" class="pl-link" data-pl-fold="rel" aria-expanded="' + st.relOpen + '">' + T('Released') + ' (' + num(rel.length) + ')</button>' + (st.relOpen ? rel.map(card).join('') : '') + '</div>'
        if (k === 'later' && dropped.length) extra += '<div class="pl-fold"><button type="button" class="pl-link" data-pl-fold="drop" aria-expanded="' + st.dropOpen + '">' + T('Dropped') + ' (' + num(dropped.length) + ')</button>' + (st.dropOpen ? dropped.map(card).join('') : '') + '</div>'
        return '<section class="pl-lane" data-pl-lane="' + k + '" aria-label="' + esc(l) + '"><h3>' + l + ' <span>' + num(vs.length) + '</span></h3>' + (vs.length ? vs.map(card).join('') : '<p class="pl-empty">' + T('Nothing here yet') + '</p>') + extra + '</section>'
      }
      return '<div class="pl-bar">' + btn(T('New version'), 'data-pl-new="1"', 'pri', true) + '</div>' + sheet() + '<div class="pl-lanes">' + HORIZONS.map(([k, l]) => lane(k, l)).join('') + '</div>'
    }
    function emptyPlan() {
      const cmd = ['arsenale', 'import-plan', '<file>', '--project', st.project, '--phases-as', 'versions'].join(' ')
      return '<section class="pl-empty-card glass"><h3>' + T('No plan yet.') + '</h3><p>' + T('Add the first version, or import a plan made in another tool.') + '</p>' +
        '<div class="pl-row">' + btn(T('New version'), 'data-pl-new="1"', 'pri', true) + (owner() ? '<button type="button" class="pl-b" data-pl-import="1" aria-expanded="' + st.openImport + '">' + T('Import a plan') + '</button>' : '') + '</div>' +
        (st.openImport ? '<div class="pl-cmd"><p>' + T('Run this in a terminal. The dashboard does not read files you name.') + '</p><code dir="ltr">' + esc(cmd) + '</code><button type="button" class="pl-b" data-pl-copy="' + esc(cmd) + '">' + T('Copy') + '</button></div>' : '') + '</section>' + sheet()
    }

    // ---- Version
    function shipSvg(v) {
      const ph = v.phases.map((p) => ({ title: p.title, p: p.progress })).concat(v.noPhase ? [{ title: T('No phase'), p: v.noPhase }] : [])
      const n = Math.max(1, ph.length), W = 640, x0 = 60, x1 = 580, seg = (x1 - x0) / n
      const label = T('Ship view') + ': ' + (ph.length ? ph.map((s) => s.title + ' ' + pct(s.p) + ' (' + (s.p.tasks ? num(s.p.doneWeight) + '/' + num(s.p.totalWeight) : '0/0') + ')').join(', ') : T('No phase'))
      const hull = 'M ' + (x0 - 30) + ' 120 L ' + (x1 + 40) + ' 120 L ' + (x1 + 4) + ' 176 L ' + x0 + ' 176 Z'
      let body = ''
      ph.forEach((s, i) => {
        const x = x0 - 30 + i * ((x1 - x0 + 70) / n), w = (x1 - x0 + 70) / n, v2 = s.p.percent === null ? 0 : s.p.percent, hh = 56 * v2 / 100
        body += '<rect x="' + x.toFixed(1) + '" y="120" width="' + w.toFixed(1) + '" height="56" class="seg"/><rect x="' + x.toFixed(1) + '" y="' + (176 - hh).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + hh.toFixed(1) + '" class="fill"/>' +
          (i ? '<line x1="' + x.toFixed(1) + '" y1="120" x2="' + x.toFixed(1) + '" y2="176" class="sep"/>' : '')
      })
      const deck = x0 + 40
      return '<svg class="pl-ship" viewBox="0 0 ' + W + ' 200" role="img" aria-label="' + esc(label) + '"><defs><clipPath id="pl-hull"><path d="' + hull + '"/></clipPath></defs>' +
        '<g clip-path="url(#pl-hull)">' + body + '</g><path d="' + hull + '" class="out"/><rect x="' + deck + '" y="92" width="' + (x1 - x0 - 120) + '" height="28" rx="4" class="cab"/><line x1="' + (W / 2) + '" y1="30" x2="' + (W / 2) + '" y2="92" class="mast"/><path d="M ' + (W / 2) + ' 34 L ' + (W / 2 + 56) + ' 82 L ' + (W / 2) + ' 82 Z" class="sail"/></svg>' +
        '<ol class="pl-hulls" style="grid-template-columns:repeat(' + n + ',minmax(0,1fr))">' + ph.map((s) => '<li><b title="' + esc(s.title) + '">' + esc(s.title) + '</b><span>' + esc(pct(s.p)) + '</span><small>' + (s.p.tasks ? num(s.p.doneWeight) + '/' + num(s.p.totalWeight) : '0/0') + '</small></li>').join('') + '</ol>'
    }
    function taskRow(t) {
      const g = st.byTask[t.id]
      const meas = g && g.measured ? tok(g.tokens) : T('n/r')
      const est = typeof t.tokenEstimate === 'number' ? tok(t.tokenEstimate) : '—'
      return '<tr><td data-l="' + T('Task') + '" class="id" title="' + esc(t.id) + '">' + esc(t.id) + '</td><td data-l="' + T('Title') + '" class="ti" title="' + esc(t.title) + '">' + esc(t.title) + '</td><td data-l="' + T('Status') + '"><span class="pl-chip t-' + esc(t.status) + '">' + esc(taskWord(t.status)) + '</span></td>' +
        '<td data-l="' + T('Type') + '">' + esc(t.type || '—') + '</td><td data-l="' + T('Size') + '">' + esc(t.size || '—') + '</td><td data-l="' + T('Tier') + '">' + esc(t.tier || '—') + '</td>' +
        '<td data-l="' + T('Owner') + '">' + (t.ownerTask ? '<span class="pl-chip own">' + T('Owner') + '</span>' : '—') + '</td><td data-l="' + T('Tokens') + '" class="tk" title="' + esc(T('estimated') + ' ' + est + ' / ' + T('measured') + ' ' + meas) + '">' + esc(est) + ' / ' + esc(meas) + '</td>' + (owner() ? '<td data-l="' + T('Queue') + '">' + (queuedIds().has(t.id) ? '<span class="pl-chip own">' + T('Queued') + '</span>' : queueable(t) ? btn(T('Queue'), 'data-pl-q1="' + esc(t.id) + '"', '', true) : '—') + '</td>' : '') + '</tr>'
    }
    function tableView(v) {
      const ts = tasksOf(v.name)
      const groups = v.phases.map((p) => ({ title: p.title, p: p.progress, rows: ts.filter((t) => t.phaseId === p.id) }))
      const loose = ts.filter((t) => !v.phases.some((p) => p.id === t.phaseId))
      if (v.noPhase) groups.push({ title: T('No phase'), p: v.noPhase, rows: loose })
      if (!ts.length) return '<p class="pl-empty">' + T('No tasks planned into') + ' ' + esc(v.name) + ' ' + T('yet') + '</p>'
      return '<div class="pl-table">' + groups.map((g) => '<section class="pl-group"><h4><span title="' + esc(g.title) + '">' + esc(g.title) + '</span><em>' + esc(pct(g.p)) + ' · ' + (g.p.tasks ? num(g.p.doneWeight) + '/' + num(g.p.totalWeight) : '0/0') + '</em></h4>' +
        (g.rows.length ? '<table><thead><tr><th>' + T('Task') + '</th><th>' + T('Title') + '</th><th>' + T('Status') + '</th><th>' + T('Type') + '</th><th>' + T('Size') + '</th><th>' + T('Tier') + '</th><th>' + T('Owner') + '</th><th>' + T('Tokens') + '</th>' + (owner() ? '<th>' + T('Queue') + '</th>' : '') + '</tr></thead><tbody>' + g.rows.map(taskRow).join('') + '</tbody></table>' : '<p class="pl-empty">' + T('No tasks in this phase') + '</p>') + '</section>').join('') + '</div>'
    }
    function decisionsPanel(v) {
      const ds = decisionsOf(v.name)
      if (!ds.length) return ''
      const open = ds.filter((d) => d.state === 'open'), done = ds.filter((d) => d.state !== 'open')
      const one = (d) => {
        const isOpen = d.state === 'open'
        const opts = Array.isArray(d.options) ? d.options : []
        return '<li class="pl-dec' + (isOpen ? '' : ' done') + '"><p class="q" title="' + esc(d.text) + '">' + esc(d.text) + '</p>' +
          (opts.length ? '<p class="o">' + opts.map((o) => '<span class="pl-chip">' + esc(o) + '</span>').join('') + '</p>' : '') +
          (d.recommendation ? '<p class="r"><b>' + T('Recommended') + ':</b> ' + esc(d.recommendation) + '</p>' : '') +
          (!isOpen && d.answer ? '<p class="r"><b>' + T('Decided') + ':</b> ' + esc(d.answer) + '</p>' : '') +
          (isOpen ? '<div class="pl-acts">' + btn(T('Ask in Decisions'), 'data-pl-go="appr"', '', false) + btn(T('Decide here'), 'data-pl-decide="' + esc(d.id) + '" aria-expanded="' + (st.decide === d.id) + '"', '', true) + '</div>' +
            (st.decide === d.id ? '<div class="pl-acts pick">' + (opts.length ? opts.map((o, i) => btn(esc(o), 'data-pl-answer="' + esc(d.id) + '" data-i="' + i + '"', '', true)).join('') : '') + '<form data-pl-answerform="' + esc(d.id) + '" class="pl-inline"><input name="answer" maxlength="300" autocomplete="off" aria-label="' + esc(T('Your answer')) + '" placeholder="' + esc(T('Your answer')) + '">' + btn(T('Save'), 'type="submit"', 'pri', true) + '</form></div>' : '') : '') + '</li>'
      }
      return '<section class="pl-card glass pl-decs"><h3>' + T('Decisions') + ' <span>' + num(open.length) + ' ' + T('open') + '</span></h3><ul>' + open.map(one).join('') + '</ul>' +
        (done.length ? '<details><summary>' + T('Decided') + ' (' + num(done.length) + ')</summary><ul>' + done.map(one).join('') + '</ul></details>' : '') + '</section>'
    }
    // spec 5.2: the imported worklog (runs of the other tool), folded; it never enters the ledger
    function worklogPanel() {
      const w = (st.plan && st.plan.worklog) || []
      if (!w.length) return ''
      return '<section class="pl-card glass pl-wl"><details><summary>' + T('Imported worklog') + ' (' + num(w.length) + ')</summary><ul class="pl-tl">' + w.map((r) =>
        '<li><span class="id" title="' + esc(r.date) + '">' + esc(r.date) + '</span><span class="ti" title="' + esc(r.taskId + ' ' + r.agent) + '">' + esc(r.taskId) + ' ' + esc(r.agent) + '</span><span class="meta"><span class="pl-chip">' + esc(r.model) + '</span><span class="pl-chip">' + esc(tok(r.tokens)) + ' ' + T('tokens') + '</span></span></li>').join('') + '</ul></details></section>'
    }
    function versionTab() {
      const list = allVersions()
      if (!list.length) return '<p class="pl-empty">' + T('No versions yet. Add one in the Roadmap.') + '</p>'
      let v = versionNamed(st.ver)
      if (!v) { v = list.find((x) => x.status === 'active') || list.find((x) => x.horizon === 'now' && x.status !== 'released') || list[0]; st.ver = v.name }
      const mode = st.vmode || (wide() ? 'ship' : 'table')
      const run = st.runs.find((r) => r && r.version === v.name)
      const own = owner()
      return '<div class="pl-bar">' + sel('version', list.map((x) => [x.name, x.name + (x.title ? ' · ' + x.title : '')]), v.name, T('Version')) +
        '<span class="pl-seg" role="group" aria-label="' + esc(T('View')) + '"><button type="button" data-pl-vmode="ship" aria-pressed="' + (mode === 'ship') + '">' + T('Ship') + '</button><button type="button" data-pl-vmode="table" aria-pressed="' + (mode === 'table') + '">' + T('Table') + '</button></span></div>' +
        '<section class="pl-card glass pl-head"><header><b class="pl-hn" title="' + esc(v.name + ' ' + v.title) + '">' + esc(v.name) + (v.title ? ' · ' + esc(v.title) : '') + '</b><span class="pl-chip s-' + esc(v.unlisted ? 'unlisted' : v.status) + '">' + esc(statusWord(v.status, v.unlisted)) + '</span></header>' +
        (v.goal ? '<p class="pl-goal">' + esc(v.goal) + '</p>' : '') +
        '<div class="pl-mid">' + ring(v.progress, 64) + '<div class="pl-nums"><b>' + esc(v.progress.tasks ? pct(v.progress) : T('No plan')) + '</b><span>' + esc(weights(v.progress)) + '</span></div></div>' + notes(v) +
        '<p class="pl-line">' + T('Cost') + ': ' + costLine(v) + '</p>' +
        (v.progress.ready ? '<p class="pl-ready">' + T('100 %, ready to release') + '</p>' : '') +
        (run ? '<p class="pl-line"><button type="button" class="pl-link" data-pl-go="live">' + T('Version run') + ' ' + esc(v.name) + '</button></p>' : '') +
        (own ? '<div class="pl-acts">' + btn(T('Draft release notes'), 'data-pl-notes="' + esc(v.name) + '"', '', true) + btn(T('Queue next phase'), 'data-pl-queue="1"', '', true) + (v.unlisted ? btn(T('Add to roadmap'), 'data-pl-addroad="' + esc(v.name) + '"', 'pri', true) : btn(T('Edit'), 'data-pl-edit="' + esc(v.name) + '"', '', true)) + '</div>' : '') + '</section>' +
        (st.notes ? '<section class="pl-card glass"><h3>' + T('Release notes draft') + '</h3><pre class="pl-pre">' + esc(st.notes) + '</pre></section>' : '') + sheet() +
        (mode === 'ship' ? '<section class="pl-card glass pl-shipbox">' + (v.phases.length || v.noPhase ? shipSvg(v) : '<p class="pl-empty">' + T('No tasks planned into') + ' ' + esc(v.name) + ' ' + T('yet') + '</p>') + '</section>' : '<section class="pl-card glass">' + tableView(v) + '</section>') +
        decisionsPanel(v) + worklogPanel()
    }
    // ---- Queue and Today (spec 1.4 sections 6 and 7); both span all projects
    const where = (i) => '<span class="pl-chip" title="' + esc(i.project || i.projectId || '') + '">' + esc(i.project || i.projectId || '') + '</span>'
    function queueTab() {
      const es = (st.queue && st.queue.entries) || []
      if (!es.length) return soon(T('The queue is empty. Approve tasks into it from a version.'))
      const own = owner()
      const rows = es.map((e, i) => '<li class="pl-q' + (e.claimed ? ' claimed' : '') + '" draggable="' + (own && wide() && !locked()) + '" data-pl-qrow="' + esc(e.taskId) + '"><b class="n">' + num(i + 1) + '</b>' +
        '<span class="id">' + esc(e.taskId) + '</span><span class="ti" title="' + esc(e.task.title) + '">' + esc(e.task.title) + '</span>' +
        '<span class="meta">' + (e.task.targetVersion ? '<span class="pl-chip">' + esc(e.task.targetVersion) + '</span>' : '') + '<span class="pl-chip t-' + esc(e.task.status) + '">' + esc(taskWord(e.task.status)) + '</span>' + (e.claimed ? '<span class="pl-chip own">' + T('Claimed') + '</span>' : '') + '</span>' +
        (own ? '<span class="pl-acts">' + btn('↑', 'data-pl-qup="' + esc(e.taskId) + '" data-to="up" title="' + esc(T('Move up')) + '" aria-label="' + esc(T('Move up') + ' ' + e.taskId) + '"', '', true) + btn('↓', 'data-pl-qup="' + esc(e.taskId) + '" data-to="down" title="' + esc(T('Move down')) + '" aria-label="' + esc(T('Move down') + ' ' + e.taskId) + '"', '', true) + btn(T('Remove'), 'data-pl-qrm="' + esc(e.taskId) + '"', '', true) + '</span>' : '') + '</li>').join('')
      return '<section class="pl-card glass"><h3>' + T('Queue') + ' <span>' + num(es.length) + '</span></h3><ol class="pl-ql">' + rows + '</ol>' +
        '<p class="pl-note">' + T('The supervisor takes the first unclaimed task with arsenale next. Nothing starts by itself.') + '</p>' +
        (own ? '<div class="pl-acts">' + btn(T('Clear'), 'data-pl-qclear="1"', 'bad', true) + '</div>' : '') + '</section>'
    }
    function todayRows(items, kind) {
      return '<ul class="pl-tl">' + items.map((i) => {
        const q = i.suggested && owner() ? btn(T('Queue'), 'data-pl-q1="' + esc(i.id) + '"', '', true) : ''
        const go = kind === 'wait' && i.kind !== 'task' ? '<button type="button" class="pl-link" data-pl-go="appr">' + T('Open Decisions') + '</button>' : ''
        return '<li><span class="id">' + esc(i.kind === 'task' ? i.id : i.kind === 'gate' ? T('Question') : T('Decision')) + '</span><span class="ti" title="' + esc(i.title) + '">' + esc(i.title) + '</span>' +
          '<span class="meta">' + (i.project ? where(i) : '') + (i.queued ? '<span class="pl-chip own">#' + num(i.position) + '</span>' : '') + (i.suggested ? '<span class="pl-chip">' + T('not queued') + '</span>' : '') + (i.stale ? '<span class="pl-chip t-blocked">' + T('claimed, no run since') + ' ' + esc(i.since || '') + '</span>' : '') + '</span>' + q + go + '</li>'
      }).join('') + '</ul>'
    }
    function todayTab() {
      const d = st.today
      if (!d) return '<p class="pl-empty" role="status">' + T('Loading…') + '</p>'
      if (d.empty) return soon(T('Nothing is queued for today. Approve tasks into the queue from a version.'))
      const grp = (name, items, kind) => '<section class="pl-card glass pl-tg"><h3>' + name + ' <span>' + num(items.length) + '</span></h3>' + (items.length ? todayRows(items, kind) : '<p class="pl-empty">' + T('Nothing here') + '</p>') + '</section>'
      return '<div class="pl-today">' + grp(T('Doing'), d.doing, 'doing') + grp(T('Next up'), d.next, 'next') + grp(T('Waiting for you'), d.waiting, 'wait') + grp(T('Blocked'), d.blocked, 'blocked') + '</div>'
    }
    const soon = (text) => '<section class="pl-empty-card glass"><p>' + text + '</p></section>'

    // ---- the whole screen

    // ---- bugs and "Plan into" (spec 1.4 section 8): owner only, two clicks: "Plan into…" then "Plan"
    const unplanned = () => st.tasks.filter((t) => t.type === 'bug' && !t.targetVersion && t.status !== 'done' && t.status !== 'cancelled')
    const planOptions = () => {
      const o = []
      if (st.plan && st.plan.nextPatch) o.push(['next-patch', T('Next patch') + ' (' + st.plan.nextPatch + ')'])
      for (const v of st.plan ? st.plan.versions : []) if (v.status === 'planned' || v.status === 'active') o.push([v.name, v.name + (v.title ? ' ' + clipTxt(v.title, 30) : '')])
      return o
    }
    const phaseOptions = (ver) => {
      const v = st.plan && st.plan.versions.find((x) => x.name === ver)
      return [['', T('No phase')]].concat(v ? v.phases.map((p) => [p.id, clipTxt(p.title, 40)]) : [])
    }
    function intoRow(t) {
      const open = st.into === t.id
      const form = open ? '<div class="pl-into" data-pl-intoform="' + esc(t.id) + '"><label><span>' + T('Plan into') + '</span>' + sel('into-version', planOptions(), st.intoVer, T('Plan into'), ' data-block="1"') + '</label>' +
        (st.intoVer !== 'next-patch' ? '<label><span>' + T('Phase') + '</span>' + sel('into-phase', phaseOptions(st.intoVer), st.intoPhase, T('Phase'), ' data-block="1"') + '</label>' : '') +
        '<div class="pl-acts">' + btn(T('Plan'), 'data-pl-intogo="' + esc(t.id) + '"', 'pri', true) + '<button type="button" class="pl-b" data-pl-into="">' + T('Cancel') + '</button></div></div>' : ''
      return '<li class="pl-bug"><div class="pl-bugrow"><span class="id" title="' + esc(t.id) + '">' + esc(t.id) + '</span><span class="ti" title="' + esc(t.title) + '" dir="auto">' + esc(t.title) + '</span>' +
        (open ? '' : btn(T('Plan into…'), 'data-pl-into="' + esc(t.id) + '"', '', true)) + '</div>' + form + '</li>'
    }
    function notPlanned() {
      const list = unplanned()
      if (!list.length) return ''
      return '<section class="pl-unplanned glass" data-pl-unplanned="1" aria-label="' + esc(T('Not planned')) + '"><h3>' + T('Not planned') + ' <span>' + num(list.length) + '</span></h3><ul>' + list.map(intoRow).join('') + '</ul></section>'
    }

    // ---- the Proposals tray: what agents suggest; only the owner accepts, edits or declines
    const proposalsHere = () => h.proposals().filter((g) => g && (g.project === st.project || !g.project) && g.proposal)
    const applyNow = (g) => g.status === 'answered' && !g.appliedAt && /^(approve|approved|yes)\b/i.test(String(g.answer || ''))
    const tray = () => proposalsHere().filter((g) => g.status === 'waiting' || applyNow(g)).sort((a, b) => String(b.askedAt).localeCompare(String(a.askedAt)))
    const KIND_WORD = () => ({ plan_into: T('Plan into a version'), bug: T('New bug'), queue: T('Add to the queue') })
    function proposalCard(g) {
      const p = g.proposal, pl = p.payload || {}
      const now = applyNow(g)
      const edit = st.edit === g.id
      const editForm = edit ? '<form class="pl-sheet glass" data-pl-propform="' + esc(g.id) + '" aria-label="' + esc(T('Edit and accept')) + '">' +
        (p.kind === 'plan_into' ? '<label><span>' + T('Version') + '</span><input name="target_version" value="' + esc(pl.target_version || '') + '" maxlength="20" required autocomplete="off"></label><label><span>' + T('Phase') + '</span><input name="phase" value="' + esc(pl.phase || '') + '" maxlength="20" autocomplete="off"></label>' : '') +
        (p.kind === 'bug' ? '<label><span>' + T('Title') + '</span><input name="title" value="' + esc(pl.title || '') + '" maxlength="200" required autocomplete="off"></label><label><span>' + T('Version') + '</span><input name="target_version" value="' + esc(pl.target_version || '') + '" maxlength="20" autocomplete="off"></label>' : '') +
        '<div class="pl-row">' + btn(T('Accept'), 'type="submit"', 'pri', true) + '<button type="button" class="pl-b" data-pl-propedit="">' + T('Cancel') + '</button></div></form>' : ''
      const acts = now ? btn(T('Apply now'), 'data-pl-prop="accept" data-g="' + esc(g.id) + '"', 'pri', true)
        : btn(T('Accept'), 'data-pl-prop="accept" data-g="' + esc(g.id) + '"', 'pri', true) + (p.kind === 'queue' ? '' : btn(T('Edit and accept'), 'data-pl-propedit="' + esc(g.id) + '"', '', true)) + btn(T('Decline'), 'data-pl-prop="decline" data-g="' + esc(g.id) + '"', 'bad', true)
      return '<article class="pl-card pl-prop glass" data-pl-proposal="' + esc(g.id) + '"><header><span class="pl-chip">' + esc(KIND_WORD()[p.kind] || p.kind) + '</span>' + (now ? '<span class="pl-chip own">' + T('Answered, not applied yet') + '</span>' : '') + '</header>' +
        '<p class="pl-pq" dir="auto">' + esc(g.question) + '</p>' + (p.why ? '<p class="pl-note" dir="auto">' + T('Why') + ': ' + esc(p.why) + '</p>' : '') + (p.evidence ? '<p class="pl-note" dir="auto">' + T('Evidence') + ': ' + esc(p.evidence) + '</p>' : '') +
        (now ? '<p class="pl-note">' + T('Applied now?') + '</p>' : '') + '<div class="pl-acts">' + acts + '</div>' + editForm + '</article>'
    }
    function proposalsTab() {
      const list = tray()
      if (!list.length) return soon(T('No proposals'))
      return '<div class="pl-props">' + list.map(proposalCard).join('') + '</div>'
    }
    function render() {
      watch()
      const list = projects()
      if (!h.configured()) return '<div class="plan" id="pl"><section class="pl-empty-card glass"><h3>' + T('Plan') + '</h3><p>' + T('Set up your company first: plans belong to a project') + '</p><div class="pl-row"><button type="button" class="pl-b pri" data-ev="wiz-open">' + T('Set up your company') + '</button></div></section></div>'
      if (!list.length) return '<div class="plan" id="pl"><section class="pl-empty-card glass"><h3>' + T('Plan') + '</h3><p>' + T('Set up your company first: plans belong to a project') + '</p><div class="pl-row"><button type="button" class="pl-b pri" data-ev="wiz-open">' + T('Set up your company') + '</button></div></section></div>'
      current()
      const pick = list.length > 1 ? sel('project', list.map((p) => [p.id, p.name || p.id]), st.project, T('Project')) : '<span class="pl-proj" title="' + esc(list[0].name || list[0].id) + '">' + esc(list[0].name || list[0].id) + '</span>'
      const tabs = '<div class="pl-tabs" role="tablist" aria-label="' + esc(T('Plan')) + '">' + TABS.map(([k, l]) => '<button type="button" role="tab" data-pl-tab="' + k + '" aria-selected="' + (st.tab === k) + '">' + l + (k === 'proposals' ? ' <i class="pl-count">' + num(tray().length) + '</i>' : k === 'roadmap' && st.plan && unplanned().length ? ' <i class="pl-count" title="' + esc(T('Not planned')) + '">' + num(unplanned().length) + '</i>' : '') + '</button>').join('') + '</div>'
      let body
      if (!h.live()) body = '<p class="pl-empty">' + T('The plan is shown on the live dashboard.') + '</p>'
      else if (st.error) body = '<p class="pl-banner bad" role="alert">' + T('Could not load the plan.') + ' <button type="button" class="pl-link" data-pl-retry="1">' + T('Try again') + '</button></p>'
      else if (!st.plan) body = '<p class="pl-empty" role="status">' + T('Loading…') + '</p>'
      else if (st.tab === 'queue') body = (st.msg ? msgP() : '') + queueTab()
      else if (st.tab === 'today') body = (st.msg ? msgP() : '') + todayTab()
      else if (st.tab === 'proposals') body = banners() + proposalsTab()
      else if (!allVersions().length) body = banners() + (st.tab === 'version' ? '' : notPlanned()) + emptyPlan()
      else body = banners() + (st.tab === 'version' ? versionTab() : notPlanned() + roadmap())
      return '<div class="plan" id="pl"><div class="pl-top">' + pick + tabs + '</div><div class="pl-body">' + body + '</div></div>'
    }
    function mount(el) {
      st.wasWide = wide()
      const html = render()
      const act = document.activeElement
      if (html === st.last && el.firstChild) return
      if (LB.isOpen() && el.firstChild) return // an open list is not redrawn under the person's hand
      if (el.firstChild && act && el.contains(act) && /^(INPUT|TEXTAREA)$/.test(act.tagName)) return // never redraw under a half-typed answer
      const old = el.querySelector('.plan'), top = old ? old.scrollTop : 0, bt = el.querySelector('.pl-body'), btop = bt ? bt.scrollTop : 0
      st.last = html
      el.innerHTML = html
      LB.enhance(el)
      const nb = el.querySelector('.plan'); if (nb) nb.scrollTop = top
      const nbb = el.querySelector('.pl-body'); if (nbb) nbb.scrollTop = btop
      const selTab = el.querySelector('.pl-tabs [aria-selected="true"]'); if (selTab && selTab.scrollIntoView) selTab.scrollIntoView({ inline: 'nearest', block: 'nearest' })
    }

    // ---- actions
    function send(body, after) {
      st.msg = ''
      return h.post('api/plan', Object.assign({ project: st.project }, body)).then((r) => { if (after) after(r); reload() }, fail)
    }
    function sendQ(body) {
      st.msg = ''
      return h.post('api/queue', Object.assign({ project: st.project }, body)).then(() => reload(), fail)
    }
    function fire(t) {
      const d = t.dataset
      if (d.plTab) { st.tab = d.plTab; st.msg = ''; st.sheet = null }
      else if (d.plOpen !== undefined) { st.ver = d.plOpen; st.tab = 'version'; st.sheet = null; st.notes = '' }
      else if (d.plNew !== undefined) { st.sheet = { mode: 'new', name: '', title: '', goal: '', horizon: 'later' }; st.msg = '' }
      else if (d.plEdit !== undefined) { const v = versionNamed(d.plEdit); if (v) st.sheet = { mode: 'edit', name: v.name, title: v.title, goal: v.goal, horizon: v.horizon }; st.msg = '' }
      else if (d.plCancel !== undefined) st.sheet = null
      else if (d.plMove !== undefined) return send({ op: 'version-move', name: d.plMove, horizon: d.h })
      else if (d.plDrop !== undefined) { if (st.armed !== 'drop:' + d.plDrop) { st.armed = 'drop:' + d.plDrop; t.textContent = T('Drop? Press again'); return } st.armed = ''; return send({ op: 'version-drop', name: d.plDrop }) }
      else if (d.plReopen !== undefined) return send({ op: 'version-edit', name: d.plReopen, status: 'planned' })
      else if (d.plFold !== undefined) { if (d.plFold === 'rel') st.relOpen = !st.relOpen; else st.dropOpen = !st.dropOpen }
      else if (d.plVmode !== undefined) st.vmode = d.plVmode
      else if (d.plGo !== undefined) { h.go(d.plGo); return }
      else if (d.plInto !== undefined) { st.into = d.plInto || null; st.intoVer = 'next-patch'; st.intoPhase = ''; st.msg = '' }
      else if (d.plIntogo !== undefined) { const b = { op: 'into', task: d.plIntogo }; if (st.intoVer === 'next-patch') b.nextPatch = true; else { b.version = st.intoVer; if (st.intoPhase) b.phase = st.intoPhase } return send(b, () => { st.into = null }) }
      else if (d.plProp !== undefined) { st.msg = ''; return h.post('api/proposal-decision', { gate: d.g, decision: d.plProp }).then(() => { st.edit = ''; reload(); h.redraw() }, fail) }
      else if (d.plPropedit !== undefined) st.edit = d.plPropedit
      else if (d.plKeep !== undefined) return send({ op: 'keep', kind: d.k, id: d.plKeep })
      else if (d.plCgone !== undefined) { if (st.armed !== 'cg:' + d.plCgone) { st.armed = 'cg:' + d.plCgone; t.textContent = T('Cancel task? Press again'); return } st.armed = ''; return send({ op: 'cancel-gone', kind: 'task', id: d.plCgone }) }
      else if (d.plAddroad !== undefined) return send({ op: 'version-add', name: d.plAddroad, horizon: 'later' })
      else if (d.plShadow !== undefined) { st.shadowView = d.plShadow === 'shadow'; st.plan = null; st.ver = ''; st.sheet = null; st.msg = ''; reload() }
      else if (d.plRetry !== undefined) { st.error = false; reload() }
      else if (d.plImport !== undefined) st.openImport = !st.openImport
      else if (d.plCopy !== undefined) { try { navigator.clipboard.writeText(d.plCopy); t.textContent = T('Copied') } catch (e) { t.textContent = T('Select the text and copy it') } return }
      else if (d.plDecide !== undefined) st.decide = st.decide === d.plDecide ? '' : d.plDecide
      else if (d.plAnswer !== undefined) { const dd = h.decisions().find((x) => x.id === d.plAnswer); const a = dd && dd.options && dd.options[+d.i]; if (a) return send({ op: 'decision-decide', id: d.plAnswer, answer: a }, () => { st.decide = '' }) }
      else if (d.plNotes !== undefined) {
        getJson('api/release-notes?project=' + encodeURIComponent(st.project) + '&version=' + encodeURIComponent(d.plNotes)).then((r) => { st.notes = typeof r === 'string' ? r : r.markdown || r.text || JSON.stringify(r, null, 2); h.redraw() }, () => { st.msg = T('Release notes are not available yet.'); h.redraw() })
        return
      } else if (d.plQueue !== undefined) {
        const v = versionNamed(st.ver), ph = v && v.phases.find((p) => p.status !== 'done' && tasksOf(v.name).some((t) => t.phaseId === p.id && queueable(t) && t.status === 'todo'))
        if (!ph) { st.msg = T('No open tasks to queue in this version.') } else return sendQ({ op: 'add-phase', version: v.name, phase: ph.id })
      } else if (d.plQ1 !== undefined) return sendQ({ op: 'add', task: d.plQ1 })
      else if (d.plQup !== undefined) return sendQ({ op: 'move', task: d.plQup, to: d.to })
      else if (d.plQrm !== undefined) return sendQ({ op: 'remove', task: d.plQrm })
      else if (d.plQclear !== undefined) { if (st.armed !== 'qclear') { st.armed = 'qclear'; t.textContent = T('Clear? Press again'); return } st.armed = ''; return sendQ({ op: 'clear' }) }
      else return
      h.redraw()
    }
    document.addEventListener('click', (e) => {
      if (!h.shown()) return
      const t = e.target.closest && e.target.closest('[data-pl-tab],[data-pl-open],[data-pl-new],[data-pl-edit],[data-pl-cancel],[data-pl-move],[data-pl-drop],[data-pl-reopen],[data-pl-fold],[data-pl-vmode],[data-pl-go],[data-pl-retry],[data-pl-shadow],[data-pl-addroad],[data-pl-keep],[data-pl-cgone],[data-pl-import],[data-pl-copy],[data-pl-decide],[data-pl-answer],[data-pl-notes],[data-pl-queue],[data-pl-q1],[data-pl-qup],[data-pl-qrm],[data-pl-qclear],[data-pl-into],[data-pl-intogo],[data-pl-prop],[data-pl-propedit]')
      if (!t || t.disabled) return
      fire(t)
    })
    // the campus chip "Proposals N" opens this tab (it sits on another screen, so no shown() check)
    document.addEventListener('click', (e) => {
      const c = e.target.closest && e.target.closest('[data-pl-proptab]')
      if (!c) return
      st.tab = 'proposals'; st.msg = ''; st.sheet = null
      h.go('plan')
    })
    document.addEventListener('change', (e) => {
      const s = e.target.closest && e.target.closest('[data-pl-sel]')
      if (!s || !h.shown()) return
      const k = s.dataset.plSel
      if (k === 'project') { st.project = s.value; st.shadowView = false; st.hasShadow = false; st.plan = null; st.ver = ''; st.sheet = null; st.msg = ''; reload() }
      else if (k === 'version') st.ver = s.value
      else if (k === 'into-version') { st.intoVer = s.value; st.intoPhase = '' }
      else if (k === 'into-phase') st.intoPhase = s.value
      else if (k === 'sheet-horizon' && st.sheet) st.sheet.horizon = s.value
      h.redraw()
    })
    document.addEventListener('submit', (e) => {
      const f = e.target
      if (!h.shown() || !f.dataset) return
      if (f.dataset.plForm !== undefined) {
        e.preventDefault()
        const v = st.sheet, fd = new FormData(f)
        const body = { name: String(fd.get('name') || '').trim(), title: String(fd.get('title') || ''), goal: String(fd.get('goal') || ''), horizon: v ? v.horizon : 'later' }
        send({ op: v && v.mode === 'edit' ? 'version-edit' : 'version-add', name: body.name, title: body.title, goal: body.goal, horizon: body.horizon }, () => { st.sheet = null })
      } else if (f.dataset.plPropform !== undefined) {
        e.preventDefault()
        const fd = new FormData(f), edits = {}
        for (const k of ['target_version', 'phase', 'title']) if (fd.has(k)) edits[k] = String(fd.get(k) || '').trim()
        st.msg = ''
        h.post('api/proposal-decision', { gate: f.dataset.plPropform, decision: 'accept', edits }).then(() => { st.edit = ''; reload(); h.redraw() }, fail)
      } else if (f.dataset.plAnswerform !== undefined) {
        e.preventDefault()
        const a = String(new FormData(f).get('answer') || '').trim()
        if (a) send({ op: 'decision-decide', id: f.dataset.plAnswerform, answer: a }, () => { st.decide = '' })
      }
    })
    // the layout follows the width: ship view and draggable cards from 900 px
    window.addEventListener('resize', () => {
      if (!h.shown()) return
      if (st.wasWide !== wide()) h.redraw()
      const sel = document.querySelector('#v-plan .pl-tabs [aria-selected="true"]'); if (sel && sel.scrollIntoView) sel.scrollIntoView({ inline: 'nearest', block: 'nearest' })
    })
    // drag a queue row onto another row (1366 px; the arrow buttons do the same everywhere)
    document.addEventListener('dragstart', (e) => { const r = e.target.closest && e.target.closest('[data-pl-qrow]'); if (r && e.dataTransfer) { e.dataTransfer.setData('text/plain', 'q:' + r.dataset.plQrow); e.dataTransfer.effectAllowed = 'move' } })
    document.addEventListener('dragover', (e) => { const r = e.target.closest && e.target.closest('[data-pl-qrow]'); if (r) { e.preventDefault(); r.classList.add('over') } })
    document.addEventListener('dragleave', (e) => { const r = e.target.closest && e.target.closest('[data-pl-qrow]'); if (r) r.classList.remove('over') })
    document.addEventListener('drop', (e) => {
      const r = e.target.closest && e.target.closest('[data-pl-qrow]')
      if (!r || !h.shown() || !owner() || locked() || !e.dataTransfer) return
      e.preventDefault(); r.classList.remove('over')
      const m = /^q:(.+)$/.exec(e.dataTransfer.getData('text/plain') || '')
      const to = ((st.queue && st.queue.entries) || []).findIndex((x) => x.taskId === r.dataset.plQrow) + 1
      if (m && m[1] !== r.dataset.plQrow && to) sendQ({ op: 'move', task: m[1], to })
    })
    // drag a card to another lane (1366 px; at 390 px the Move buttons do the same)
    document.addEventListener('dragstart', (e) => { const c = e.target.closest && e.target.closest('[data-pl-card]'); if (c && e.dataTransfer) { e.dataTransfer.setData('text/plain', c.dataset.plCard); e.dataTransfer.effectAllowed = 'move' } })
    document.addEventListener('dragover', (e) => { const l = e.target.closest && e.target.closest('[data-pl-lane]'); if (l) { e.preventDefault(); l.classList.add('over') } })
    document.addEventListener('dragleave', (e) => { const l = e.target.closest && e.target.closest('[data-pl-lane]'); if (l) l.classList.remove('over') })
    document.addEventListener('drop', (e) => {
      const l = e.target.closest && e.target.closest('[data-pl-lane]')
      if (!l) return
      e.preventDefault(); l.classList.remove('over')
      const name = e.dataTransfer && e.dataTransfer.getData('text/plain'), v = versionNamed(name)
      if (v && v.horizon !== l.dataset.plLane && owner() && !locked()) send({ op: 'version-move', name, horizon: l.dataset.plLane })
    })
    return { render, mount, st, fetchIt }
  }
  const PV = planView({
    esc, T, digits, live: () => LIVE, shown: () => mode === 'plan', post: (u, b) => CR.post(u, b), redraw: () => renderAll(), go: (m) => { mode = m; railOpen = false; omenuOpen = ''; renderAll() },
    configured: () => !!(COMPANY && COMPANY.configured), readOnly: () => !!(COMPANY && COMPANY.readOnly),
    projects: () => (COMPANY && COMPANY.configured ? COMPANY.projects || [] : []).filter((p) => p && p.id && p.status !== 'archived'),
    decisions: () => DATA.decisions || [], proposals: () => DATA.proposals || [],
  })
