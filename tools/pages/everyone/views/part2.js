  // ========== team: an office room per office, the profile and the hire form at its side
  const TIER = { light: 'Light', standard: 'Standard', heavy: 'Strong' }
  const VAL = { ask: 'Always ask me', never: 'Never', allow: 'Allowed' }
  function statusOf(id) {
    const e = emp(id)
    if (e && e.status === 'paused') return 'paused'
    if (waiting().some((g) => askerOf(g) === id)) return 'waiting'
    if ((DATA.active || []).some((r) => r.agent === id)) return 'working'
    if ((DATA.runs || []).some((r) => r.agent === id && isToday(r.finishedAt))) return 'done'
    return 'idle'
  }
  const STATUS_WORD = { working: 'Working', waiting: 'Waiting for you', idle: 'Free', done: 'Finished today', paused: 'Paused' }
  function teamMembers(officeId) {
    const d = st.data.team
    const list = d ? d.members.filter((m) => m.kind !== 'ceo' && m.status !== 'retired') : []
    return list.filter((m) => (m.homeOfficeId || 'unassigned') === officeId)
  }
  // ---------- the directory: every person in one table, grouped by office
  const DAY = 86400000
  /** Runs of one person over the last 30 days, and per day over the last 14 (oldest first). */
  function usage(id) {
    const d0 = new Date(); d0.setHours(0, 0, 0, 0)
    const from = Date.now() - 30 * DAY
    const runs = runsOf((r) => r.agent === id && Date.parse(r.finishedAt) >= from)
    const days = new Array(14).fill(0)
    for (const r of runs) {
      const t = Date.parse(r.finishedAt)
      const off = t >= d0.getTime() ? 0 : Math.ceil((d0.getTime() - t) / DAY)
      if (off < 14) days[13 - off]++
    }
    const ms = runs.reduce((n, r) => n + (r.durMs || 0), 0)
    return { runs: runs.length, good: runs.filter((r) => r.status === 'ok').length, tok: runs.reduce((n, r) => n + (r.tokTotal || 0), 0), avg: runs.length ? ms / runs.length : 0, days, dead: runs.filter((r) => r.closedBy === 'arsenale').length }
  }
  const lastStepAt = (r) => { const t = Date.parse(Array.isArray(r.steps) && r.steps.length ? r.steps[r.steps.length - 1].at : r.startedAt); return isNaN(t) ? Date.now() : t }
  /** What the directory shows for a person: the state, with the silence of a working one told in words. */
  function rowState(id) {
    const s = statusOf(id)
    if (s !== 'working') return { key: s, word: T(STATUS_WORD[s]) }
    const runs = (DATA.active || []).filter((r) => r.agent === id).sort((a, b) => lastStepAt(b) - lastStepAt(a))
    // waiting for the test suite (or running it) is not silence: the timer is paused
    const q = runs[0] && runs[0].monitor && runs[0].monitor.inQueue ? 0 : Date.now() - lastStepAt(runs[0])
    if (q < 600000) return { key: 'working', word: T(STATUS_WORD.working) }
    const key = h.health(runs[0], q)
    if (key === 'ok') return { key: 'working', word: T(STATUS_WORD.working) }
    return key === 'dead' ? { key, word: T('Dead') + ' · ' + h.span(q) } : key === 'stalled' ? { key, word: T('Stalled') + ' ' + h.span(q) } : { key: 'quiet', word: T('Quiet') + ' ' + h.span(q) }
  }
  function spark(days) {
    const mx = Math.max(1, ...days), w = 104, ht = 22
    const pts = days.map((n, i) => (i * w / 13).toFixed(1) + ',' + (ht - 2 - n / mx * (ht - 4)).toFixed(1)).join(' ')
    return '<svg class="spark" width="' + w + '" height="' + ht + '" viewBox="0 0 ' + w + ' ' + ht + '" aria-hidden="true"><polyline points="' + pts + '" fill="none" stroke="#1F7A8C" stroke-width="1.6" stroke-linejoin="round"/></svg>'
  }
  function lastTask(id) {
    const r = (DATA.active || []).find((x) => x.agent === id)
    if (r) return esc(r.doing || r.task)
    const d = runsOf((x) => x.agent === id).sort((a, b) => String(b.finishedAt).localeCompare(String(a.finishedAt)))[0]
    return d ? esc(String(d.task || '').replace(/\s*\(under\s+[^)]*\)\s*/gi, ' ').trim()) + ' <span class="mut">(' + (isToday(d.finishedAt) ? T('done') + ' ' + hm(d.finishedAt) : esc(day(d.finishedAt))) + ')</span>' : '<span class="mut">—</span>'
  }
  function teamMain() {
    if (!LIVE) return liveOnly()
    if (!co()) return head(T('Team')) + '<p class="empty">' + T('No team members yet. Install an office pack or hire someone.') + '</p><p><button type="button" class="b pri" data-ev="wiz-open">' + T('Set up your company') + '</button></p>'
    load('team', 'api/team')
    const d = st.data.team
    if (!d) return '<p class="empty" style="padding:24px" role="status">' + T('Loading…') + '</p>'
    const people = d.members.filter((m) => m.kind !== 'ceo' && m.status !== 'retired')
    const offs = offices().concat(people.some((m) => !officeById(m.homeOfficeId || '')) ? [{ id: 'unassigned' }] : [])
    if (st.teamOffice && !offs.some((o) => o.id === st.teamOffice)) st.teamOffice = ''
    const rows = people.map((m) => ({ m, off: officeById(m.homeOfficeId || '') ? m.homeOfficeId : 'unassigned', rs: rowState(m.id) }))
    const models = [...new Set(rows.map((r) => r.m.model).filter(Boolean))].sort()
    const q = st.teamQ.trim().toLowerCase()
    const shown = rows.filter((r) => (!st.teamOffice || r.off === st.teamOffice) && (!st.teamStatus || r.rs.key === st.teamStatus) && (!st.teamModel || r.m.model === st.teamModel) &&
      (!q || (nameOf(r.m.id) + ' ' + r.m.id + ' ' + titleOf(r.m) + ' ' + lastTask(r.m.id).replace(/<[^>]*>/g, '')).toLowerCase().includes(q)))
    const rank = { waiting: 0, working: 1, stalled: 2, quiet: 3, dead: 4, done: 5, idle: 6, paused: 7 }
    const order = offs.map((o) => o.id)
    shown.sort((a, b) => order.indexOf(a.off) - order.indexOf(b.off) || rank[a.rs.key] - rank[b.rs.key] || nameOf(a.m.id).localeCompare(nameOf(b.m.id)))
    const working = rows.filter((r) => ['working', 'quiet', 'stalled'].includes(r.rs.key)).length
    const hot = st.drawer && st.drawer.type === 'member' ? st.drawer.id : ''
    const oname = (id) => (id === 'unassigned' ? T('No office') : officeName(id))
    const ocol = (id) => (id === 'unassigned' ? '#8A97A6' : colorOf(id))
    const sel = (name, label, val, opts) => '<label class="tf">' + label + '<select name="' + name + '" data-ev-change="' + name + '"><option value="">' + T('Any') + '</option>' + opts.map(([v, t]) => '<option value="' + esc(v) + '"' + (val === v ? ' selected' : '') + '>' + esc(t) + '</option>').join('') + '</select></label>'
    let html = '<div class="eh"><div><h1>' + T('Team') + '</h1><div class="sub">' + digits(rows.length) + ' ' + T(rows.length === 1 ? 'person' : 'people') + ' · ' + digits(offs.length) + ' ' + T(offs.length === 1 ? 'office' : 'offices') + (working ? ' · ' + digits(working) + ' ' + T('working now') : '') + '</div></div><div class="ea"><button type="button" class="b sm" data-goto="org">' + T('Org chart') + '</button>' + (canWrite() ? (st.teamOffice && officeById(st.teamOffice) && !officeById(st.teamOffice).builtIn ? '<button type="button" class="b sm" data-ev="office-edit" data-arg="' + esc(st.teamOffice) + '">' + T('Edit office') + '</button>' : '') + '<button type="button" class="b sm" data-ev="office-new">' + T('Add an office') + '</button>' : '<button type="button" class="b sm" data-ev="goto-packs">' + T('Add an office') + '</button>') +
      (canWrite() ? '<button type="button" class="b pri sm" data-ev="hire-new">' + ic('plus', 14, 2.4) + T('Hire an employee') + '</button>' : '') + '</div></div>'
    html += '<div class="tfil"><span class="rw" style="gap:6px;flex-wrap:wrap"><button type="button" class="chip" data-ev="team-office" data-arg="" aria-pressed="' + !st.teamOffice + '">' + T('All offices') + ' ' + digits(rows.length) + '</button>' +
      offs.map((o) => '<button type="button" class="chip" data-ev="team-office" data-arg="' + esc(o.id) + '" aria-pressed="' + (st.teamOffice === o.id) + '"><span class="sw" style="background:' + esc(ocol(o.id)) + '"></span><span class="tnm">' + esc(oname(o.id)) + '</span> ' + digits(rows.filter((r) => r.off === o.id).length) + '</button>').join('') +
      // the packs not installed yet, as one link (their names in its tooltip); an office that exists is never counted here
      (notSetUp() ? '<button type="button" class="lnk tnsu" data-ev="goto-packs" title="' + esc(notSetUp()) + '">' + esc(digits(notSetUpN()) + ' ' + T(notSetUpN() === 1 ? 'more office in the Marketplace' : 'more offices in the Marketplace') + ' →') + '</button>' : '') + '</span>' +
      sel('teamStatus', T('Status'), st.teamStatus, [['working', T('Working')], ['waiting', T('Waiting for you')], ['quiet', T('Quiet')], ['stalled', T('Stalled')], ['dead', T('Dead')], ['done', T('Finished today')], ['idle', T('Free')], ['paused', T('Paused')]]) +
      sel('teamModel', T('Model'), st.teamModel, models.map((x) => [x, x])) +
      '<label class="rw" style="gap:0;position:relative;margin:0"><span style="position:absolute;inset-inline-start:12px;color:var(--ink-dim);line-height:0">' + ic('search', 15) + '</span><input type="search" name="tq" data-ev-input="tq" value="' + esc(st.teamQ) + '" placeholder="' + T('Search by name or task') + '" aria-label="' + T('Search by name or task') + '" style="width:260px;padding-inline-start:36px"></label>' +
      '<span class="seg" role="group" aria-label="' + T('Show the team as') + '"><button type="button" data-ev="team-view" data-arg="tiles" aria-pressed="' + (st.teamView !== 'table') + '">' + T('Tiles') + '</button><button type="button" data-ev="team-view" data-arg="table" aria-pressed="' + (st.teamView === 'table') + '">' + T('Table') + '</button></span></div>'
    if (st.teamView !== 'table') return html + teamTiles(shown, oname, ocol, hot)
    html += '<div class="card tdir"><table class="dir"><thead><tr><th>' + T('Employee') + '</th><th>' + T('Office') + '</th><th>' + T('Model') + '</th><th>' + T('Status') + '</th><th>' + T('Current or last task') + '</th><th class="n">' + T('Runs, 30 d') + '</th><th class="n">' + T('Tokens, 30 d') + '</th><th>' + T('Last 14 days') + '</th><th class="n">' + T('Good runs') + '</th><th></th></tr></thead><tbody>'
    let lastOff = null
    for (const r of shown) {
      const m = r.m, u = usage(m.id)
      if (!st.teamOffice && r.off !== lastOff) { lastOff = r.off; html += '<tr class="grp"><th colspan="10"><span class="sw" style="background:' + esc(ocol(r.off)) + '"></span> ' + esc(oname(r.off)) + ' <span class="mut">' + digits(shown.filter((x) => x.off === r.off).length) + '</span></th></tr>' }
      const pct = u.runs ? Math.round(u.good / u.runs * 100) : null
      html += '<tr class="trow" tabindex="0" data-ev="member-open" data-arg="' + esc(m.id) + '" aria-current="' + (m.id === hot) + '"><td><span class="rw" style="gap:10px">' + face(m.id, 32) + '<span style="min-width:0"><b class="hi ell" dir="auto" style="display:block">' + esc(nameOf(m.id)) + '</b>' + (m.name && titleOf(m) && m.name !== titleOf(m) ? '<span class="mut ell" dir="auto" style="display:block;font-size:12px">' + esc(titleOf(m)) + '</span>' : '') + '</span></span></td>' +
        '<td><span class="sw" style="background:' + esc(ocol(r.off)) + '"></span> ' + esc(oname(r.off)) + '</td><td class="soft">' + esc(m.model || '—') + '</td>' +
        '<td><span class="pill ' + r.rs.key + '">' + esc(r.rs.word) + '</span></td><td dir="auto" class="tkx">' + lastTask(m.id) + '</td>' +
        '<td class="n">' + digits(u.runs) + '</td><td class="n">' + tokens(u.tok) + '</td><td>' + spark(u.days) + '</td><td class="n' + (pct !== null && pct < 90 ? ' lo' : '') + '">' + (pct === null ? '—' : digits(pct) + ' %') + '</td>' +
        '<td><button type="button" class="b sm" data-ev="member-open" data-arg="' + esc(m.id) + '">' + T('Open') + '</button></td></tr>'
    }
    html += '</tbody></table>'
    if (!shown.length) html += '<p class="empty" style="padding:24px">' + T('No one matches these filters.') + '</p>'
    html += '</div><p class="note" style="margin-top:10px">' + T('Good runs: finished with no findings and no failure. Sorted by office, then working first. A row opens the person’s profile.') + '</p>'
    return html
  }
  /** The people as portrait tiles, grouped by office: status, the portrait, name, title, the task and the runs.
   *  The whole tile opens the profile. The portrait is the character pipeline's still (everyoneArt). */
  function teamTiles(shown, oname, ocol, hot) {
    if (!shown.length) return '<p class="empty" style="padding:24px">' + T('No one matches these filters.') + '</p>'
    const groups = []
    for (const r of shown) { const g = groups[groups.length - 1]; if (g && g.off === r.off) g.list.push(r); else groups.push({ off: r.off, list: [r] }) }
    return groups.map((g) => '<section class="tgrp"><h2 class="rw tgh"><span class="sw" style="background:' + esc(ocol(g.off)) + '"></span>' + esc(oname(g.off)) + ' <span class="mut">' + digits(g.list.length) + ' ' + T(g.list.length === 1 ? 'person' : 'people') + '</span></h2><div class="tgrid">' +
      g.list.map((r) => {
        const m = r.m, u = usage(m.id), live = (DATA.active || []).find((x) => x.agent === m.id)
        const last = runsOf((x) => x.agent === m.id).sort((a, b) => String(b.finishedAt).localeCompare(String(a.finishedAt)))[0]
        const chip = r.rs.key === 'idle' || r.rs.key === 'done' ? '' : '<span class="pill ' + r.rs.key + '">' + esc(r.rs.word) + '</span>'
        const task = live ? esc(live.task || live.doing || '') : last ? esc(String(last.task || '').replace(/\s*\(under\s+[^)]*\)\s*/gi, ' ').trim()) : ''
        const when = !live && last ? (isToday(last.finishedAt) ? T('finished ') + hm(last.finishedAt) : T('last active ') + esc(day(last.finishedAt))) : ''
        return '<button type="button" class="ttile" data-ev="member-open" data-arg="' + esc(m.id) + '" aria-current="' + (m.id === hot) + '" style="--oc:' + esc(ocol(r.off)) + '">' +
          '<span class="tpic">' + chip + '<span class="tface">' + face(m.id, 96) + '</span></span>' +
          '<span class="tbody"><b class="hi ell" dir="auto">' + esc(nameOf(m.id)) + '</b><span class="soft ell" dir="auto">' + esc(m.name && titleOf(m) && m.name !== titleOf(m) ? titleOf(m) : m.model || '') + '</span>' +
          '<span class="ell ttask" dir="auto">' + (task || '<span class="mut">' + T('No task yet') + '</span>') + '</span>' +
          '<span class="mut ell">' + [u.runs ? digits(u.runs) + ' ' + T(u.runs === 1 ? 'run in 30 days' : 'runs in 30 days') : '', when].filter(Boolean).join(' · ') + '</span></span></button>'
      }).join('') + '</div></section>').join('') +
      '<p class="note" style="margin-top:14px">' + T('A tile opens the person’s profile: tokens, the last 14 days and good runs are there, and in the table.') + '</p>'
  }
  /** "Operations, Research, Design: not set up": the packs not installed yet. */
  function notSetUp() {
    const left = packsLeft()
    return left.length ? left.map((p) => p.name).join(T(', ')) + T(': not set up') : ''
  }
  function packsLeft() {
    load('packs', 'api/packs', false, 60000)
    // an office that exists is set up, whether a pack or the seed made it
    return ((st.data.packs && st.data.packs.packs) || []).filter((p) => !p.installed && !offices().some((o) => p.office && o.id === p.office.id))
  }
  const notSetUpN = () => packsLeft().length
  function monthRuns(id) {
    const d0 = new Date(); d0.setDate(1); d0.setHours(0, 0, 0, 0)
    return runsOf((r) => r.agent === id && Date.parse(r.finishedAt) >= d0.getTime())
  }
  function profile() {
    const d = st.data.team
    const m = d && d.members.find((x) => x.id === st.drawer.id)
    if (!m) return '<div class="pb"><p class="empty" role="status">' + T('Loading…') + '</p>' + msgHtml() + '</div>'
    const s = statusOf(m.id)
    const runs = monthRuns(m.id)
    const ms = runs.reduce((n, r) => n + (r.durMs || 0), 0), tok = runs.reduce((n, r) => n + (r.tokTotal || 0), 0)
    const r = (DATA.active || []).find((x) => x.agent === m.id)
    const g = waiting().find((x) => askerOf(x) === m.id)
    let html = '<div class="ph">' + face(m.id, 54, true) + '<div style="min-width:0"><h2 dir="auto">' + esc(nameOf(m.id)) + '</h2><div class="mut" style="font-size:13px;margin-top:2px">' + esc(m.name && titleOf(m) && m.name !== titleOf(m) ? titleOf(m) + ' · ' : '') + esc(officeName(m.homeOfficeId)) + '</div></div><button type="button" class="x" data-ev="drawer-close" aria-label="' + T('Close') + '">' + ic('x', 18) + '</button></div><div class="pb">'
    html += '<div class="rw"><span class="pill ' + s + '">' + T(STATUS_WORD[s]) + '</span>' + (m.reportsTo ? '<span class="mut" style="font-size:13px">' + T('Reports to ') + esc(nameOf(m.reportsTo)) + '</span>' : '') + '</div>'
    if (g) html += '<div class="stat now w"><div class="lbl" style="color:#F2C06B">' + T('Waiting for you') + '</div><div class="hi" dir="auto" style="font-size:15px;font-weight:700;margin-top:2px">' + esc(plainQ(g)) + '</div><button type="button" class="b sm" data-ev="goto-appr" data-arg="' + esc(g.id) + '" style="margin-top:8px">' + T('Answer') + '</button></div>'
    else if (r) html += '<div class="stat now"><div class="lbl" style="color:var(--accent)">' + T('Right now') + '</div><div class="hi" dir="auto" style="font-size:16px;font-weight:700;margin-top:2px">' + esc(r.doing || r.task) + '</div><div class="soft" style="font-size:13px">' + T('Started ') + esc(ago(r.startedAt)) + '</div></div>'
    const cost = co().company.payModel === 'plan' ? T('Included in your plan') : runs.some((x) => typeof x.costUsd === 'number') ? '$' + digits(runs.reduce((n, x) => n + (x.costUsd || 0), 0).toFixed(2)) : T('not counted')
    const u = usage(m.id)
    const tile = (lbl, val, cls) => '<div class="stat"><div class="lbl">' + lbl + '</div><div class="hi' + (cls ? ' ' + cls : '') + '" style="font-size:22px;font-weight:700;margin-top:4px">' + val + '</div></div>'
    html += '<div class="rw tiles" style="gap:10px;align-items:stretch">' + tile(T('Runs, 30 days'), u.runs ? digits(u.runs) : '—') + tile(T('Good runs'), u.runs ? digits(Math.round(u.good / u.runs * 100)) + ' %' : '—', u.runs && u.good / u.runs >= 0.9 ? 'ok' : '') + tile(T('Average run'), u.avg ? esc(dur(u.avg)) : '—') + tile(T('Tokens, 30 days'), u.tok ? tokens(u.tok) : '—') + tile(T('Dead runs'), u.dead ? digits(u.dead) : '—', u.dead ? 'bad' : '') + '</div>'
    const mx = Math.max(1, ...u.days)
    html += '<div><div class="sec" style="margin-bottom:8px">' + T('Runs per day, last 14 days') + '</div><div class="bars" role="img" aria-label="' + T('Runs per day, last 14 days') + '">' + u.days.map((n) => '<i style="height:' + (n ? Math.max(8, Math.round(n / mx * 100)) : 3) + '%" class="' + (n ? '' : 'z') + '" title="' + digits(n) + '"></i>').join('') + '</div><div class="mut" style="font-size:12px;margin-top:6px">' + T('Cost this month: ') + esc(cost) + ' · ' + T('Role file: ') + ltr(m.id) + (m.tier ? ' · ' + T('Strength: ') + T(TIER[m.tier]) : '') + '</div></div>'
    const def = (DATA.agents || []).find((x) => x.name === m.id) || {}
    const what = String(def.descriptionEn || def.description || '').replace(/^"|"$/g, '')
    if ((m.skills || []).length) html += '<div><div class="sec" style="margin-bottom:8px">' + T('Good at') + '</div><div class="rw" style="flex-wrap:wrap;gap:6px">' + m.skills.map((x) => '<span class="chip" dir="auto" style="height:28px;font-size:13px">' + esc(x) + '</span>').join('') + '</div></div>'
    else if (what) html += '<div><div class="sec" style="margin-bottom:6px">' + T('What they do') + '</div><p class="soft" dir="auto" style="font-size:13.5px;line-height:1.55">' + esc(what) + '</p></div>'
    const asks = d.categories.filter((c) => m.policy[c.id] && m.policy[c.id].value === 'ask'), never = d.categories.filter((c) => m.policy[c.id] && m.policy[c.id].value === 'never')
    html += '<div><div class="sec" style="margin-bottom:8px">' + T('Asks you first before') + ' ' + ic('lock', 14) + '</div><div class="rw" style="flex-wrap:wrap;gap:6px">' + (asks.length ? asks.map((c) => '<span class="risk">' + ic('out', 11) + ' ' + esc(T(CAT[c.id] ? CAT[c.id][0] : c.label)) + '</span>').join('') : '<span class="mut" style="font-size:13px">' + T('Nothing: every action is allowed or never done.') + '</span>') + '</div>' + (never.length ? '<p class="mut" style="font-size:12.5px;margin-top:8px">' + T('Never does: ') + never.map((c) => esc(T(CAT[c.id] ? CAT[c.id][0] : c.label))).join(T(', ')) + '</p>' : '') + '</div>'
    const recent = runsOf((x) => x.agent === m.id).slice(0, 5)
    html += '<div><div class="sec" style="margin-bottom:8px">' + T('Recent jobs') + '</div>' + (r ? '<div class="jr"><span style="color:var(--warn)">' + ic('clock', 15, 2.2) + '</span><span class="hi sp" dir="auto">' + esc(r.task) + '</span><b class="hi" style="font:12.5px var(--font-ui)">' + esc(dur(Date.now() - Date.parse(r.startedAt))) + '</b></div>' : '') + (recent.length ? recent.map((x) => '<div class="jr"><span style="color:' + (x.status === 'failed' ? 'var(--bad)' : 'var(--accent)') + '">' + ic(x.status === 'failed' ? 'x' : 'check', 15, 2.2) + '</span><span class="hi sp" dir="auto">' + esc(x.summary && x.summary.length < 90 ? x.summary : x.task) + '</span><b class="hi" style="font:12.5px var(--font-ui)">' + esc(dur(x.durMs)) + '</b></div>').join('') : r ? '' : '<p class="mut" style="font-size:13px">' + T('No jobs yet.') + '</p>') + '</div>'
    // the rules of this one member, and the file behind them: the detail a curious owner opens
    html += '<details' + (st.profOpen === 'rules' ? ' open' : '') + ' data-ev-toggle="rules"><summary>' + T('Safety rules for this member') + '</summary><div style="margin-top:10px">' + policyTable(d.categories, m.policy, m.id) + '</div></details>'
    html += '<details' + (st.profOpen === 'instr' ? ' open' : '') + ' data-ev-toggle="instr"><summary>' + T('Instructions and earlier versions') + '</summary><div style="margin-top:10px">' + instrPart(m) + '</div></details>'
    html += msgHtml() + '</div>'
    if (canWrite()) {
      html += '<div class="pf"><button type="button" class="b pri" data-ev="task-for" data-arg="' + esc(m.id) + '">' + ic('plus', 15, 2.4) + esc(T('Give ') + nameOf(m.id) + T(' a task')) + '</button><button type="button" class="b" data-ev="member-edit" data-arg="' + esc(m.id) + '">' + ic('pencil', 14) + T('Edit') + '</button><span class="sp"></span>'
      if (m.managedFile && m.status !== 'retired') html += '<button type="button" class="b bad sm' + armedCls('retire|' + m.id) + '" data-ev="retire" data-arg="' + esc(m.id) + '">' + esc(armedLabel('retire|' + m.id, T('Retire'))) + '</button>'
      if (m.status === 'retired') html += '<button type="button" class="b sm" data-ev="unretire" data-arg="' + esc(m.id) + '">' + T('Bring back') + '</button>'
      html += '</div>'
    }
    return html
  }
  function instrPart(m) {
    const mm = st.data.member
    if (!mm || mm.id !== m.id) { load('member', 'api/member?id=' + encodeURIComponent(m.id), true); return '<p class="empty" role="status">' + T('Loading…') + '</p>' }
    let html = ''
    if (!mm.managed && mm.exists) html += '<p class="note">' + T('This file belongs to another tool (for example Claude Code). Editing it keeps a backup.') + '</p>'
    html += '<pre class="txt">' + esc(mm.body) + '</pre>'
    if (!mm.backups.length) html += '<p class="hint">' + T('No earlier versions yet. Every edit keeps the version before it.') + '</p>'
    for (const b of mm.backups) html += '<p class="rw" style="gap:8px;margin:6px 0">' + ltr(b) + (canWrite() && !/^retired-/.test(b) && mm.managed ? ' <button type="button" class="b sm' + armedCls('restore|' + b) + '" data-ev="restore" data-arg="' + esc(m.id) + '|' + esc(b) + '">' + esc(armedLabel('restore|' + b, T('Restore'))) + '</button>' : '') + '</p>'
    return html
  }
  function policyTable(cats, eff, member) {
    const pol = st.data.policy && st.data.policy.policy
    let html = '<div class="card rows" style="overflow:hidden">'
    for (const c of cats) {
      const v = eff[c.id] ? eff[c.id].value : 'ask'
      const words = CAT[c.id] || [c.label, 'Leaves your computer']
      const seg = ['ask', 'never', 'allow'].map((x) => '<button type="button" class="' + x + '" data-ev="pol" data-arg="' + esc((member || '') + '|' + c.id + '|' + x) + '" aria-pressed="' + (v === x) + '"' + (canWrite() ? '' : ' disabled') + '>' + T(VAL[x]) + '</button>').join('')
      const from = !member ? '' : eff[c.id] && eff[c.id].from === 'member' ? ' <span class="chip warn">' + T('changed for this member') + '</span>' + (canWrite() ? ' <button type="button" class="b sm ghost" data-ev="pol" data-arg="' + esc(member + '|' + c.id + '|') + '">' + T('Reset') + '</button>' : '') : ''
      html += '<div class="r" style="flex-wrap:wrap">' + (member ? '' : '<span class="risk' + (c.id === 'delete' ? ' mid' : '') + '" style="width:130px;justify-content:center">' + ic(c.id === 'delete' ? 'warn' : 'out', 12) + ' ' + T(c.id === 'delete' ? 'Careful' : 'Leaves') + '</span>') + '<span class="sp" style="min-width:150px"><span class="hi" style="font-size:' + (member ? 13.5 : 14.5) + 'px">' + T(words[0]) + '</span>' + (c.examples && !member ? '<span class="hint">' + T(c.examples) + '</span>' : '') + from + '</span><span class="seg">' + seg + '</span>'
      if (!member) html += c.id === 'payment' ? '<span class="chip" style="width:150px;justify-content:center">' + T('Computer only') + '</span>' : '<label class="rw" style="gap:8px;width:150px;margin:0;cursor:pointer"><input type="checkbox" class="tgl" data-ev-change="phone" data-arg="' + esc(c.id) + '"' + (pol && pol.phoneAllowed[c.id] ? ' checked' : '') + (canWrite() ? '' : ' disabled') + '><span class="soft" style="font-size:12.5px">' + T('From my phone too') + '</span></label>'
      html += '</div>'
    }
    return html + '</div><p class="note" style="margin-top:8px">' + ic('info', 13) + T('Advisory: Arsenale cannot stop other programs.') + '</p>'
  }
  const TEMPLATES = [
    ['Weekly newsletter', 'Newsletter writer', 'Writes our weekly newsletter from the notes I leave in the workspace folder. Short, friendly, three sections. Never sends it: it saves the draft and tells me.', 'Newsletters,Short summaries'],
    ['Customer replies', 'Reply drafter', 'Drafts replies to the customer messages I paste in, in our calm and friendly tone. Never sends them.', 'Friendly replies,Customer questions'],
    ['Meeting notes', 'Note taker', 'Turns my rough meeting notes into tidy minutes with a to-do list and who does what, by role.', 'Minutes,To-do lists'],
  ]
  function hireForm() {
    const f = st.hire
    const office = f.officeId && officeName(f.officeId)
    const v = (k) => esc(f[k] === undefined ? '' : f[k])
    const name = f.name || T('they')
    let html = '<div class="ph"><div style="min-width:0"><h2>' + (f.op === 'edit' ? esc(T('Edit ') + (f.name || f.id)) : esc(T('New desk in ') + (office || ''))) + '</h2><div class="mut" style="font-size:13px;margin-top:2px">' + T('Describe the job in plain words') + '</div></div><button type="button" class="x" data-ev="drawer-close" aria-label="' + T('Close') + '">' + ic('x', 18) + '</button></div>'
    html += '<form data-evform="hire" class="pb" id="hform">'
    if (f.preview) {
      html += '<p class="soft">' + T('This is the file Arsenale will write. Nothing is saved until you press the button.') + '</p><pre>' + esc(f.preview) + '</pre>'
    } else {
      if (f.op !== 'edit') html += '<div class="rw" style="flex-wrap:wrap;gap:6px"><button type="button" class="chip" data-ev="hire-tpl" data-arg="-1" aria-pressed="' + (f.tpl === undefined || f.tpl < 0) + '">' + T('Write my own') + '</button>' + TEMPLATES.map((x, i) => '<button type="button" class="chip" data-ev="hire-tpl" data-arg="' + i + '" aria-pressed="' + (f.tpl === i) + '">' + T(x[1]) + '</button>').join('') + '</div>'
      const err = f.err || {}
      html += '<div class="rw" style="gap:12px;align-items:flex-start"><label class="fl" style="flex:1;margin:0">' + T('Name') + '<input type="text" name="name" maxlength="60" dir="auto" value="' + v('name') + '" placeholder="' + T('e.g. Ada') + '"></label><label class="fl" style="flex:1.4;margin:0">' + T('Job title') + '<input type="text" name="title" maxlength="60" dir="auto" value="' + v('title') + '"' + (err.title ? ' class="bad" aria-invalid="true"' : '') + ' placeholder="' + T('e.g. Press release writer') + '"></label></div>'
      if (err.title) html += '<p class="msg err" style="margin-top:-8px">' + ic('warn', 14) + ' ' + T('Please give a job title so the team list is easy to read.') + '</p>'
      html += '<label class="fl" style="margin:0">' + esc(T('What should ') + name + T(' do?')) + '<textarea name="instructions" maxlength="8000" dir="auto" style="min-height:110px"' + (err.instructions ? ' class="bad" aria-invalid="true"' : '') + '>' + v('instructions') + '</textarea></label>'
      if (err.instructions) html += '<p class="msg err" style="margin-top:-8px">' + ic('warn', 14) + ' ' + T('Describe the job in a few more words (at least 10 characters).') + '</p>'
      html += '<div><div class="hi" style="font-weight:700;font-size:13px;margin-bottom:6px">' + T('Good at') + '</div><div class="rw" style="gap:6px;flex-wrap:wrap">' + (f.skills || []).map((x, i) => '<button type="button" class="chip" data-ev="skill-del" data-arg="' + i + '" title="' + T('Remove') + '" dir="auto">' + esc(x) + ' ×</button>').join('') + ((f.skills || []).length < 8 ? '<input type="text" name="skill" maxlength="40" dir="auto" placeholder="' + T('+ Add') + '" style="width:150px;padding:4px 10px;border-style:dashed" data-ev-enter="skill-add">' : '') + '</div></div>'
      html += '<div><div class="hi" style="font-weight:700;font-size:13px;margin-bottom:6px">' + T('Pick a look') + '</div><div class="looks" role="radiogroup" aria-label="' + T('Pick a look') + '">' + [0, 1, 2, 3, 4, 5].map((i) => '<label><input type="radio" name="look" value="' + i + '"' + ((f.look || 0) === i ? ' checked' : '') + ' aria-label="' + T('Look ') + digits(i + 1) + '">' + A.person((f.id || slug(f.name) || 'new-member') + (i ? ':' + i : ''), colorOf(f.officeId), 30, true) + '</label>').join('') + '</div></div>'
      if (f.op !== 'edit') {
        const cats = (st.data.team && st.data.team.categories) || []
        const def = (st.data.team && st.data.team.policy && st.data.team.policy.defaults) || {}
        html += '<div class="card pad" style="background:var(--panel-raised)"><div class="sec" style="margin-bottom:8px;font-size:14.5px">' + T('Asks you first before') + ' ' + ic('lock', 14) + '</div><div class="asks">' + cats.map((c) => { const cur = (f.policy || {})[c.id] || def[c.id] || 'ask'; return '<label><input type="checkbox" name="ask:' + esc(c.id) + '"' + (cur !== 'allow' ? ' checked' : '') + (c.id === 'payment' ? ' disabled' : '') + '><span>' + T(CAT[c.id] ? CAT[c.id][0] : c.label) + (cur === 'never' ? ' <span class="mut">(' + T('never') + ')</span>' : '') + '</span></label>' }).join('') + '</div><p class="hint">' + T('Unticked: allowed without asking. Paying always asks.') + '</p></div>'
      }
      html += '<details><summary>' + T('More options') + '</summary><div style="margin-top:12px">'
      html += '<label class="fl">' + T('Office') + '<select name="officeId">' + offices().map((o) => '<option value="' + esc(o.id) + '"' + (f.officeId === o.id ? ' selected' : '') + '>' + esc(officeName(o.id)) + '</option>').join('') + '</select></label>'
      if (f.op !== 'edit') html += '<label class="fl">' + T('Reports to') + '<select name="reportsTo"><option value="">' + T('The head of the office') + '</option><option value="supervisor"' + (f.reportsTo === 'supervisor' ? ' selected' : '') + '>' + T('Your assistant') + '</option>' + members().map((e) => '<option value="' + esc(e.id) + '"' + (f.reportsTo === e.id ? ' selected' : '') + '>' + esc(nameLine(e.id)) + '</option>').join('') + '</select></label>'
      html += '<label class="fl">' + T('In one line, for the team list') + ' <span class="op">' + T('Optional') + '</span><input type="text" name="description" maxlength="300" dir="auto" value="' + v('description') + '"><span class="hint" style="font-weight:400">' + T('Left empty, the first sentence of the job is used.') + '</span></label>'
      html += '<label class="fl">' + T('Short id (letters, digits, hyphens; used in files)') + '<input type="text" name="id" maxlength="60" dir="ltr" value="' + v('id') + '"' + (f.op === 'edit' ? ' readonly' : '') + '><span class="hint" style="font-weight:400">' + T('Left empty, it is made from a Latin name.') + '</span></label>'
      html += '<label class="fl">' + T('Strength') + '<select name="tier">' + ['light', 'standard', 'heavy'].map((x) => '<option value="' + x + '"' + ((f.tier || 'standard') === x ? ' selected' : '') + '>' + T(TIER[x]) + '</option>').join('') + '</select><span class="hint" style="font-weight:400">' + T('Light is quick and cheap, Strong is for hard work. Claude Code uses this; other assistants ignore it.') + '</span></label>'
      if (f.op !== 'edit') html += '<label class="fl">' + T('Monthly budget in USD (optional)') + '<input type="text" name="usd" dir="ltr" value="' + v('usd') + '" placeholder="25.50"></label>'
      html += '<p class="hi" style="font-weight:700;font-size:13px;margin:6px 0">' + T('In Claude Code') + '</p>'
      html += '<label class="rw" style="gap:8px;margin:4px 0"><input type="checkbox" name="edit"' + (f.caps && f.caps.edit === false ? '' : ' checked') + '><span class="soft">' + T('Create and edit files') + '</span></label>'
      html += '<label class="rw" style="gap:8px;margin:4px 0"><input type="checkbox" name="web"' + (f.caps && f.caps.web ? ' checked' : '') + '><span class="soft">' + T('Search the web') + '</span></label>'
      html += '<label class="rw" style="gap:8px;margin:4px 0"><input type="checkbox" name="commands"' + (f.caps && f.caps.commands ? ' checked' : '') + '><span class="soft">' + T('Run commands (advanced)') + '</span></label>'
      if (f.op === 'edit' && !f.managed) html += '<label class="rw" style="gap:8px;margin:8px 0"><input type="checkbox" name="confirmForeign"' + (f.confirmForeign ? ' checked' : '') + '><span class="soft">' + T('This file belongs to another tool. Edit it anyway; a backup will be kept.') + '</span></label>'
      html += '</div></details>'
    }
    html += msgHtml() + '</form><div class="pf">'
    const where = office || ''
    if (f.preview) html += '<button type="submit" form="hform" class="b pri">' + ic('check', 15, 2.6) + esc(f.op === 'edit' ? T('Save') : T('Add to ') + where) + '</button><button type="button" class="b ghost" data-ev="hire-back">' + T('Back') + '</button>'
    else html += '<button type="submit" form="hform" class="b pri">' + T('Next: check the file') + ' ' + ic('chev', 14, 2.4) + '</button><button type="button" class="b ghost" data-ev="drawer-close">' + T('Cancel') + '</button>'
    return html + '</div>'
  }
  const slug = (s) => (/^[\x20-\x7e]+$/.test(String(s || '')) ? String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^[^a-z]+|-+$/g, '').slice(0, 60) : '')
  function readHire(form) {
    const f = st.hire
    const el = form.elements
    const val = (n) => (el[n] && el[n].value !== undefined && !(el[n] instanceof RadioNodeList) ? String(el[n].value) : undefined)
    for (const k of ['name', 'id', 'title', 'officeId', 'reportsTo', 'description', 'instructions', 'tier', 'usd']) { const x = val(k); if (x !== undefined) f[k] = x.trim() }
    const look = [...el].find((x) => x.name === 'look' && x.checked)
    if (look) f.look = Number(look.value)
    if (el.edit) f.caps = { edit: el.edit.checked, web: el.web.checked, commands: el.commands.checked }
    if (el.confirmForeign) f.confirmForeign = el.confirmForeign.checked
    const skill = el.skill && String(el.skill.value).trim()
    if (skill) { f.skills = (f.skills || []).concat([skill]).slice(0, 8); el.skill.value = '' }
    const def = (st.data.team && st.data.team.policy && st.data.team.policy.defaults) || {}
    for (const e of [...el]) if (e.name && e.name.indexOf('ask:') === 0) {
      const c = e.name.slice(4)
      f.policy = f.policy || {}
      // ticked keeps "never" when that is the default; unticked is allowed
      f.policy[c] = e.checked ? (def[c] === 'never' ? 'never' : 'ask') : 'allow'
    }
    if (!f.id && f.op !== 'edit') f.id = slug(f.name) || slug(f.title)
  }
  function hireBody() {
    const f = st.hire
    const first = String(f.instructions || '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s/)[0].slice(0, 300)
    const b = { id: f.id, name: f.name || f.title, title: f.title, officeId: f.officeId, reportsTo: f.reportsTo, description: f.description || first, instructions: f.instructions, tier: f.tier, caps: f.caps, policy: f.policy, skills: f.skills || [], look: f.look || 0 }
    if (f.usd) b.budget = { monthlyUsd: f.usd }
    if (f.op === 'edit') { b.op = 'edit'; b.confirmForeign = !!f.confirmForeign; delete b.policy; delete b.reportsTo }
    return b
  }

  // ========== finished work
  const KIND = { document: 'Documents', image: 'Images', sheet: 'Spreadsheets', link: 'Links' }
  // what a person looks for: documents (text too), pictures, tables and links
  const groupOf = (d) => (d.kind === 'image' || d.image ? 'image' : d.kind === 'link' ? 'link' : /csv|spreadsheet|excel/.test(d.mime || '') ? 'sheet' : 'document')
  const kindArt = (d) => (/^text\/plain/.test(d.mime || '') ? 'text' : { image: 'image', link: 'link', sheet: 'sheet', document: 'doc' }[groupOf(d)])
  function extOf(d) {
    if (d.kind === 'link') return T('Link')
    const n = /\.([A-Za-z0-9]{1,5})$/.exec(d.name || d.originalPath || '')
    if (n) return n[1].toUpperCase()
    return ({ 'text/markdown': 'MD', 'text/plain': 'TXT', 'text/csv': 'CSV', 'image/png': 'PNG', 'image/jpeg': 'JPG', 'image/gif': 'GIF', 'image/webp': 'WEBP', 'application/pdf': 'PDF' })[String(d.mime || '').split(';')[0]] || T('File')
  }
  const sizeOf = (b) => (b >= 1048576 ? digits((b / 1048576).toFixed(1)) + T(' MB') : digits(Math.max(1, Math.round(b / 1024))) + T(' KB'))
  function dlvMain() {
    if (!LIVE) return liveOnly()
    load('dlv', 'api/deliverables')
    const list = (st.data.dlv && st.data.dlv.deliverables) || []
    const q = st.dlvQ.trim().toLowerCase()
    const shown = list.filter((d) => (!st.dlvKind || groupOf(d) === st.dlvKind) && (!q || (d.title + ' ' + nameOf(d.agent) + ' ' + (d.agent || '')).toLowerCase().includes(q)))
    let html = head(T('Finished work'), T('Everything your team has made for you, newest first.'), '<label class="rw" style="gap:0;position:relative;margin:0"><span style="position:absolute;inset-inline-start:12px;color:var(--ink-dim);line-height:0">' + ic('search', 15) + '</span><input type="search" name="dq" data-ev-input="dq" value="' + esc(st.dlvQ) + '" placeholder="' + T('Search by name or person') + '" aria-label="' + T('Search by name or person') + '" style="width:260px;padding-inline-start:36px"></label>')
    if (!list.length) return html + '<p class="empty">' + T('What your team hands in appears here: documents, pictures, tables and links.') + '</p>'
    const n = (k) => list.filter((d) => groupOf(d) === k).length
    const chip = (v, label, icon) => '<button type="button" class="chip" data-ev="dkind" data-arg="' + v + '" aria-pressed="' + (st.dlvKind === v) + '">' + (icon ? ic(icon, 12) : '') + label + ' ' + digits(v ? n(v) : list.length) + '</button>'
    const fresh = list.filter((d) => isToday(d.createdAt)).length
    html += '<div class="rw" style="gap:8px;margin:-6px 0 20px;flex-wrap:wrap">' + chip('', T('All')) + chip('document', T(KIND.document), 'doc') + chip('image', T(KIND.image), 'image') + chip('sheet', T(KIND.sheet), 'table') + chip('link', T(KIND.link), 'link') + '<span class="sp"></span>' + (fresh ? '<span class="mut" style="font-size:13px">' + T('Today') + ' <b class="hi">' + digits(fresh) + ' ' + T('new') + '</b></span>' : '') + '</div>'
    if (!shown.length) html += '<p class="empty">' + T('Nothing matches.') + '</p>'
    html += '<div class="gal">' + shown.slice(0, 80).map((d) => {
      const c = colorOfMember(d.agent)
      const open = d.state === 'stored' ? '<a class="b sm" style="flex:1" href="deliverables/' + esc(d.id) + '" target="_blank" rel="noopener">' + ic('eye', 14) + T('Open') + '</a>' : d.url ? '<a class="b sm" style="flex:1" href="' + esc(d.url) + '" target="_blank" rel="noopener noreferrer">' + ic('globe', 14) + T('Open page') + '</a>' : d.originalPath ? '<button type="button" class="b sm" style="flex:1" data-ev="copy" data-arg="' + esc(d.originalPath) + '">' + ic('copy', 14) + T('Copy path') + '</button>' : ''
      return '<div class="card fc"><button type="button" class="th" data-ev="dlv-open" data-arg="' + esc(d.id) + '" aria-label="' + esc(T('Preview: ') + d.title) + '" style="border:0;border-bottom:1px solid var(--line);cursor:pointer;padding:0;width:100%">' + (d.image && d.state === 'stored' ? '<img src="deliverables/' + esc(d.id) + '" alt="" loading="lazy">' : A.thumb(kindArt(d), c)) + '<span class="tb">' + ic({ image: 'image', link: 'link', sheet: 'table' }[groupOf(d)] || 'doc', 12) + ' ' + esc(extOf(d)) + '</span></button>' +
        '<div style="padding:12px 14px 14px;display:flex;flex-direction:column;flex:1"><div class="hi" dir="auto" style="font-weight:700;font-size:14.5px;line-height:1.3;min-height:38px">' + esc(d.title) + '</div><div class="rw" style="margin-top:8px;gap:8px">' + face(d.agent || 'supervisor', 22) + '<span class="soft ell" style="font-size:12.5px">' + esc(nameOf(d.agent || 'supervisor')) + '</span><span class="sp"></span><span class="mut" style="font-size:12.5px;flex:none">' + esc(day(d.createdAt)) + '</span></div>' +
        (d.state === 'missing' ? '<span class="chip warn" style="margin-top:8px;align-self:flex-start">' + T('File no longer there') + '</span>' : '') +
        '<div class="rw" style="margin-top:12px;gap:8px">' + open + '<button type="button" class="b sm ghost" data-ev="dlv-open" data-arg="' + esc(d.id) + '" aria-label="' + T('Preview') + '" title="' + T('Preview') + '">' + ic('eye', 15) + '</button></div></div></div>'
    }).join('') + '</div>'
    if (st.data.dlv.store) html += '<p class="mut" style="font-size:12.5px;margin-top:18px">' + T('Arsenale keeps its own copies: ') + digits(st.data.dlv.store.files) + ' · ' + sizeOf(st.data.dlv.store.bytes) + (st.data.dlv.store.warn ? ' · ' + T('over 2 GB: consider deleting old ones') : '') + '</p>'
    return html
  }
  function dlvPreview() {
    const list = (st.data.dlv && st.data.dlv.deliverables) || []
    const d = list.find((x) => x.id === st.drawer.id)
    if (!d) return ''
    let html = '<div class="ph"><div style="min-width:0"><h2 dir="auto">' + esc(d.title) + '</h2><div class="mut" style="font-size:13px;margin-top:2px">' + esc(nameOf(d.agent || 'supervisor')) + ' · ' + esc(day(d.createdAt)) + '</div></div><button type="button" class="x" data-ev="drawer-close" aria-label="' + T('Close') + '">' + ic('x', 18) + '</button></div><div class="pb">'
    if (d.note) html += '<p class="soft" dir="auto">' + esc(d.note) + '</p>'
    const job = d.jobId && (DATA.runs || []).find((r) => r.id === d.jobId)
    if (job) html += '<p class="soft">' + T('From the job: ') + '<span dir="auto">' + esc(job.summary || job.task) + '</span></p>'
    if (d.state === 'stored') {
      if (d.image) html += '<p><img src="deliverables/' + esc(d.id) + '" alt="' + esc(d.title) + '" style="max-width:100%;border:1px solid var(--line);border-radius:6px"></p>'
      else if (/^text\//.test(d.mime)) {
        const tx = st.data['txt|' + d.id]
        if (tx === undefined) {
          st.data['txt|' + d.id] = null
          fetch('deliverables/' + d.id, { cache: 'no-store' }).then((r) => r.text()).then((t) => { st.data['txt|' + d.id] = t; bump() }, () => { st.data['txt|' + d.id] = ''; bump() })
          html += '<p class="empty" role="status">' + T('Loading…') + '</p>'
        } else if (tx !== null) {
          if (/csv/.test(d.mime)) html += csvTable(tx)
          else html += '<pre class="txt">' + esc(tx.split('\n').slice(0, 200).join('\n')) + '</pre>'
        }
      } else html += '<p class="soft">' + T('No preview for this type.') + ' ' + sizeOf(d.bytes) + '</p>'
      html += '<div class="rw" style="gap:10px"><a class="b pri" href="deliverables/' + esc(d.id) + '" download>' + ic('download', 15) + T('Download') + '</a><a class="b" href="deliverables/' + esc(d.id) + '" target="_blank" rel="noopener">' + T('Open in a new tab') + '</a></div>'
    } else {
      if (d.url) html += '<p><a href="' + esc(d.url) + '" target="_blank" rel="noopener noreferrer" dir="ltr" style="color:var(--cyan)">' + esc(d.url) + '</a></p>'
      if (d.originalPath) html += '<p class="rw" style="gap:8px">' + ltr(d.originalPath) + ' <button type="button" class="b sm" data-ev="copy" data-arg="' + esc(d.originalPath) + '">' + T('Copy path') + '</button></p>'
      if (d.state === 'missing') html += '<p class="msg err">' + T('File no longer there') + '</p>'
      if (d.reason) html += '<p class="note">' + T('Not copied: ') + esc(errTxt(d.reason)) + '</p>'
    }
    if (d.taskId) html += '<p class="mut" style="font-size:12.5px">' + T('For the task: ') + '<button type="button" class="b sm ghost" data-ev="task-open" data-arg="' + esc(d.taskId) + '">' + esc((taskById(d.taskId) || {}).title || T('open it')) + '</button></p>'
    return html + msgHtml() + '</div>'
  }
  function csvTable(text) {
    const rows = text.split(/\r?\n/).filter((l) => l.length).slice(0, 51).map((line) => {
      const out = []; let cur = '', q = false
      for (let i = 0; i < line.length; i++) {
        const c = line[i]
        if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ } else if (c === '"') q = false; else cur += c }
        else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = '' } else cur += c
      }
      out.push(cur)
      return out
    })
    return '<div style="overflow:auto"><table class="pol">' + rows.map((r, i) => '<tr>' + r.map((c) => (i ? '<td dir="auto">' : '<th dir="auto">') + esc(c) + (i ? '</td>' : '</th>')).join('') + '</tr>').join('') + '</table></div>'
  }

  // ========== settings
  const SETTABS = [['assistants', 'Assistants', 'plug'], ['notifications', 'Notifications', 'bell'], ['decisions', 'Decisions', 'check'], ['safety', 'Safety rules', 'shield'], ['packs', 'Marketplace', 'box'], ['privacy', 'Privacy', 'lock']]
  function setMain() {
    if (!LIVE) return liveOnly()
    if (!SETTABS.some((x) => x[0] === st.setTab)) st.setTab = 'assistants'
    let html = head(T('Settings')) + '<div class="setw"><nav class="snav" aria-label="' + T('Settings') + '">' + SETTABS.map((x) => '<button type="button" data-ev="stab" data-arg="' + x[0] + '" aria-pressed="' + (st.setTab === x[0]) + '">' + ic(x[2], 18) + T(x[1]) + '</button>').join('') + '</nav><div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:22px">'
    if (st.setTab === 'assistants') html += assistantsTab()
    else if (st.setTab === 'notifications') html += notificationsTab()
    else if (st.setTab === 'decisions') html += decisionsTab()
    else if (st.setTab === 'safety') html += safetyTab()
    else if (st.setTab === 'packs') html += packsTab()
    else html += privacyTab()
    return html + '</div></div>'
  }
  // the names clients give at initialize (a label, not proof): which card each belongs to
  const CARD_RE = { 'claude-desktop': /^(claude-ai|claude-desktop)$/, 'claude-code': /^claude-code$/, cursor: /cursor/, vscode: /visual-studio-code|vscode|copilot/, codex: /codex/, gemini: /gemini/ }
  const seenFor = (c, clients) => { const re = CARD_RE[c.id]; return re ? clients.find((x) => re.test(x.id)) : c.id === 'other' ? clients.find((x) => !/^(claude-ai|claude-desktop|claude-code)$|cursor|visual-studio-code|vscode|copilot|codex|gemini/.test(x.id)) : null }
  function assistantsTab() {
    load('connect', 'api/connect', !!st.test, st.test ? 2000 : 5000)
    const d = st.data.connect
    if (!d) return '<p class="empty" role="status">' + T('Loading…') + '</p>'
    let html = '<div><div class="sec">' + T('Your assistants') + ' <small>' + T('The AI chats that do the work') + '</small></div><div class="card rows" style="overflow:hidden">'
    for (const c of d.cards) {
      const seen = seenFor(c, d.clients)
      const na = c.primary === 'none'
      const open = st.openCard === c.id
      const status = seen ? T('Connected, last heard ') + ago(seen.lastSeen) : na ? T(c.note || 'Cannot connect yet.') : T('Not connected')
      html += '<div class="r">' + A.robot(30) + '<div class="sp" style="min-width:0"><b class="hi">' + esc(T(c.name)) + '</b>' + (c.experimental ? '<span class="exp">' + T('experimental') + '</span>' : '') + '<div class="' + (seen ? 'soft' : 'mut') + '" style="font-size:13px">' + esc(status) + '</div></div>'
      if (seen) html += '<span class="chip ok">' + ic('check', 12, 3) + ' ' + T('Connected') + '</span><button type="button" class="b sm" data-ev="ctest" data-arg="' + esc(c.id) + '">' + T('Test') + '</button><button type="button" class="b sm ghost" data-ev="copen" data-arg="' + esc(c.id) + '" aria-expanded="' + open + '">' + T('More') + '</button>'
      else if (na) html += '<span class="chip">' + T('Not available') + '</span>'
      else html += '<button type="button" class="b sm' + (open ? '' : ' pri') + '" data-ev="copen" data-arg="' + esc(c.id) + '" aria-expanded="' + open + '">' + (open ? T('Close') : T('Connect')) + '</button>'
      html += '</div>'
      if (open) html += '<div class="more">' + connectSteps(c, d.clients, false) + '</div>'
    }
    html += '</div></div>'
    const known = new Set(d.cards.map((c) => (seenFor(c, d.clients) || {}).id).filter(Boolean))
    const rest = d.clients.filter((x) => !known.has(x.id))
    if (d.clients.length) html += '<div><div class="sec">' + T('What Arsenale remembers') + ' <small>' + T('The name an assistant gives is a label, not proof of who it is.') + '</small></div><div class="card rows">' + d.clients.map((c) => { const quiet = Date.now() - Date.parse(c.lastSeen) > 7 * 86400000; return '<div class="r"><b class="hi" dir="ltr">' + esc(c.name || c.id) + '</b><span class="mut sp" style="font-size:13px">' + esc(c.transport) + ' · ' + T('last call ') + esc(ago(c.lastSeen)) + ' · ' + digits(c.callsToday) + ' ' + T('calls today') + (quiet ? ' <span class="chip warn">' + T('quiet') + '</span>' : '') + (rest.includes(c) ? '' : '') + '</span><button type="button" class="b sm ghost' + armedCls('forget|' + c.id) + '" data-ev="forget" data-arg="' + esc(c.id) + '" title="' + T('A forgotten assistant can connect again; this only clears what Arsenale remembers about it.') + '">' + esc(armedLabel('forget|' + c.id, T('Forget'))) + '</button></div>' }).join('') + '</div></div>'
    html += '<details><summary>' + T('Advanced: custom instructions and MCP over HTTP') + '</summary><div style="margin-top:12px;display:flex;flex-direction:column;gap:10px"><p class="soft">' + T('Some assistants ignore the instructions Arsenale sends. Paste this into your assistant\'s custom instructions:') + '</p><pre>' + esc(T(d.customInstructions)) + '</pre><div><button type="button" class="b sm" data-ev="copy" data-arg="' + esc(T(d.customInstructions)) + '">' + T('Copy') + '</button></div>'
    html += '<p class="hi" style="font-weight:700">' + T('MCP over HTTP') + '</p><p class="soft">' + T('For assistants that need a web address. Needs a token.') + '</p>'
    html += d.http.on ? '<p class="soft">' + T('On, at ') + ltr(d.http.url) + '</p>' : '<p class="soft">' + T('Off. Set ARSENALE_MCP_TOKEN (32+ characters) and restart.') + '</p><div><button type="button" class="b sm" data-ev="mktoken">' + T('Make a random token to copy') + '</button></div>' + (st.token ? '<pre>' + esc(st.token) + '</pre>' : '')
    html += '<p class="note">' + T('The token is stored in your assistant\'s settings in plain text. Anyone who can read those files can log as your assistant, but cannot answer or approve anything.') + '</p></div></details>'
    return html + msgHtml()
  }
  /** The three steps for one assistant: add Arsenale, restart, say hello. */
  function connectSteps(c, clients, wizard) {
    const seen = seenFor(c, clients)
    const testing = st.test && st.test.client === c.id
    const num = (n, ok) => '<span class="num' + (ok ? ' ok' : '') + '">' + digits(n) + '</span>'
    const B = wizard ? 'b' : 'b'
    let html = '<div style="display:flex;flex-direction:column;gap:14px">'
    let one = ''
    if (c.canWrite) one = '<button type="button" class="' + B + ' pri sm" data-ev="cpreview" data-arg="' + esc(c.id) + '">' + esc(T('Add Arsenale to ') + T(c.name)) + '</button>' + (st.added === c.id ? ' <span class="chip ok">' + ic('check', 12, 3) + ' ' + T('Added') + '</span>' : '')
    if (c.primary === 'command' || c.primary === 'copy') one += '<button type="button" class="' + B + ' sm" data-ev="copy" data-arg="' + esc(c.command) + '">' + T('Copy command') + '</button>'
    if (c.primary === 'link') one += '<a class="' + B + ' sm" href="' + esc(c.link) + '">' + T(c.id === 'cursor' ? 'Open in Cursor' : 'Open in VS Code') + '</a>'
    const what = c.canWrite ? esc(T('One new entry in the settings file of ') + T(c.name) + T('. A backup is kept next to it.')) : c.primary === 'command' ? T('Run this command once in a terminal.') : c.primary === 'link' ? T('Open the link; your editor asks you to confirm.') : esc(T(c.note || ''))
    html += '<div class="step rw" style="align-items:flex-start">' + num(1, st.added === c.id || !!seen) + '<div style="flex:1;min-width:0"><b class="hi">' + T('Let Arsenale add itself') + '</b><div class="soft" style="font-size:13.5px">' + what + '</div><div class="rw" style="margin-top:8px;gap:8px;flex-wrap:wrap">' + one + '</div>'
    if (c.snippet) html += '<details style="margin-top:8px"><summary>' + T('Show what will be added') + '</summary><pre>' + esc((c.command ? c.command + '\n\n' : '') + c.snippet) + '</pre></details>'
    if (st.cpv && st.cpv.client === c.id) {
      const p = st.cpv
      html += p.unchanged ? '<p class="msg ok">' + T('Arsenale is already in this file.') + '</p>' : '<p class="soft" style="margin-top:8px">' + T('File: ') + ltr(p.file) + '</p><p class="hint">' + T('Before:') + '</p><pre>' + esc(p.before === null ? T('(no file yet)') : p.before) + '</pre><p class="hint">' + T('After:') + '</p><pre>' + esc(p.after) + '</pre><div class="rw" style="gap:8px;margin-top:8px"><button type="button" class="' + B + ' pri sm" data-ev="capply" data-arg="' + esc(c.id) + '">' + T('Write this change (a backup is kept)') + '</button><button type="button" class="' + B + ' ghost sm" data-ev="ccancel">' + T('Cancel') + '</button></div>'
    }
    html += '</div></div>'
    html += '<div class="step rw" style="align-items:flex-start">' + num(2, !!seen) + '<div><b class="hi">' + esc(T('Restart ') + T(c.name)) + '</b><div class="soft" style="font-size:13.5px">' + T('Close it fully and open it again.') + '</div></div></div>'
    html += '<div class="step rw" style="align-items:flex-start">' + num(3, !!seen) + '<div style="flex:1"><b class="hi">' + T('Say hello') + '</b><div class="soft" style="font-size:13.5px">' + T('Type this in a new chat:') + '</div><div class="rw" style="margin-top:8px;background:var(--ground);border:1px solid var(--line-strong);border-radius:8px;padding:8px 12px"><span class="hi sp" style="font-size:15px">' + T('Say hello to Arsenale') + '</span><button type="button" class="' + B + ' sm" data-ev="copy-hello">' + T('Copy') + '</button></div></div></div>'
    const ok = !!seen || (testing && st.test.ok)
    if (wizard || testing) html += '<div class="wt rw' + (ok ? ' ok' : '') + '" role="status"><span class="dot"></span><div><b style="color:' + (ok ? 'var(--accent)' : '#F2C06B') + '">' + esc(ok ? T('Connected. Arsenale heard from ') + T(c.name) + '.' : testing && st.test.failed ? T('Not yet. Check the steps, then press Test.') : T('Waiting to hear from ') + T(c.name) + '…') + '</b><div class="soft" style="font-size:13px">' + (ok ? T('Every job it does now shows up here.') : T('Turns green when it answers.')) + '</div></div>' + (!ok && !testing ? '<button type="button" class="' + B + ' sm" data-ev="ctest" data-arg="' + esc(c.id) + '" style="margin-inline-start:auto">' + T('Test') + '</button>' : '') + '</div>'
    else if (!wizard) html += '<div><button type="button" class="' + B + ' sm" data-ev="ctest" data-arg="' + esc(c.id) + '">' + T('Test') + '</button></div>'
    return html + '</div>'
  }
  /** Whether a phone gets Approve / Reject for this question: an action whose
   *  rule allows phone approval (never a payment), or a choice; never a hire
   *  or a bare approval (notify.cjs decides the same on the server). */
  function phoneButtons(g) {
    const pol = st.data.policy && st.data.policy.policy
    if (g.approvalType === 'hire') return false
    if (g.approvalType === 'action' && g.action) return g.action.category !== 'payment' && !!(pol && pol.phoneAllowed && pol.phoneAllowed[g.action.category])
    return g.kind !== 'approval' && Array.isArray(g.choices) && g.choices.length > 0
  }
  function safetyTab() {
    load('policy', 'api/policy')
    const d = st.data.policy
    if (!d) return '<p class="empty" role="status">' + T('Loading…') + '</p>'
    let html = '<div><div class="sec">' + T('Safety rules') + ' <small>' + T('What your team must ask you before doing') + '</small></div>'
    if (d.policy.newer) html += '<p class="msg err">' + T('Safety rules written by a newer Arsenale: everything asks first, and editing is off.') + '</p>'
    const eff = {}
    for (const c of d.categories) eff[c.id] = { value: d.policy.defaults[c.id], from: 'default' }
    return html + policyTable(d.categories, eff, '') + '</div>' + msgHtml()
  }
  // inMarket: drawn on the Marketplace page, which has the local packs below it
  function packsTab(inMarket) {
    load('packs', 'api/packs', false, 10000)
    const d = st.data.packs
    if (!d) return '<p class="empty" role="status">' + T('Loading…') + '</p>'
    let html = '<div><div class="sec">' + T(inMarket ? 'Ready-made offices' : 'Marketplace') + ' <small>' + (inMarket ? T('Bundled with Arsenale') : T('Ready-made teams')) + '</small></div>'
    html += '<p class="soft" style="margin-bottom:14px">' + T('Adds the office and its team; removing keeps your changes.') + '</p>'
    if (!co()) html += '<p class="note" style="margin-bottom:12px">' + T('Set up your company first: the wizard installs the packs you choose.') + ' <button type="button" class="b sm pri" data-ev="wiz-open">' + T('Set up your company') + '</button></p>'
    const th = themes()
    html += '<div class="packs">' + d.packs.map((p) => {
      const c = th[p.office && p.office.theme] || '#56B6C2'
      const lead = (p.members.find((m) => m.lead) || p.members[0] || { id: p.id }).id
      return '<button type="button" class="card pk' + (p.installed ? '' : ' off') + '" data-ev="pack-open" data-arg="' + esc(p.id) + '" aria-current="' + (st.openPack === p.id) + '"><span class="rw" style="gap:8px">' + A.person(lead, c, 24, true) + '<b class="hi" style="font-size:13.5px;line-height:1.2">' + esc(p.name) + '</b></span><span class="rw" style="margin-top:12px;justify-content:space-between"><span class="mut" style="font-size:12.5px">' + digits(p.members.length) + ' ' + T('members') + '</span>' + (p.installed ? '<span class="chip ok">' + T('Installed') + '</span>' : p.needs ? '<span class="chip warn">' + T('Needs a newer Arsenale') + '</span>' : '<span class="b sm">' + T('Add') + '</span>') + '</span></button>'
    }).join('') + '</div>'
    const p = d.packs.find((x) => x.id === st.openPack)
    if (p) {
      let b = '<div class="card pad" style="margin-top:14px"><div class="rw"><b class="hi" style="font-size:15px">' + esc(p.name) + '</b><span class="mut" style="font-size:12px">' + T('version ') + ltr(p.version) + '</span><span class="sp"></span><button type="button" class="x" data-ev="pack-open" data-arg="" aria-label="' + T('Close') + '" style="width:30px;height:30px">' + ic('x', 15) + '</button></div>'
      b += '<p class="soft" dir="auto" style="margin:8px 0 12px">' + esc(p.description) + '</p><div class="rw" style="flex-wrap:wrap;gap:8px">' + p.members.map((m) => '<span class="chip" dir="auto">' + esc(m.title || m.id) + (m.lead ? ' ★' : '') + '</span>').join('') + '</div><div class="rw" style="gap:8px;margin-top:14px">'
      if (p.installed) b += (canWrite() ? '<button type="button" class="b sm bad' + armedCls('pack|remove|' + p.id) + '" data-ev="pack" data-arg="remove|' + esc(p.id) + '">' + esc(armedLabel('pack|remove|' + p.id, T('Remove'))) + '</button>' : '') + (p.update && canWrite() ? '<button type="button" class="b sm pri" data-ev="pack" data-arg="update|' + esc(p.id) + '">' + T('Update') + '</button>' : '')
      else if (!p.needs && co() && canWrite()) b += '<button type="button" class="b sm pri" data-ev="pack" data-arg="install|' + esc(p.id) + '">' + T('Add this office') + '</button>'
      b += '</div>'
      if (st.conflict && st.conflict.id === p.id) b += '<p class="msg err">' + esc(errTxt(st.conflict.msg)) + '</p><div class="rw" style="gap:8px"><button type="button" class="b sm" data-ev="pack" data-arg="install-keep|' + esc(p.id) + '">' + T('Keep yours') + '</button><button type="button" class="b sm" data-ev="pack" data-arg="install-rename|' + esc(p.id) + '">' + T('Install as a copy') + '</button><button type="button" class="b sm ghost" data-ev="pack-cancel">' + T('Cancel') + '</button></div>'
      if (st.packMsg && st.packMsg.id === p.id) b += '<p class="msg ' + (st.packMsg.ok ? 'ok' : 'err') + '">' + esc(st.packMsg.text) + '</p>'
      html += b + '</div>'
    }
    return html + (inMarket ? '' : '<p class="note" style="margin-top:12px">' + ic('info', 13) + T('A pack from a folder or a .zip installs in the Marketplace.') + ' <button type="button" class="b sm" data-ev="goto-market">' + T('Open the Marketplace') + '</button></p>') + '</div>'
  }
  function privacyTab() {
    const li = (s) => '<li style="margin:4px 0">' + s + '</li>'
    return '<div><div class="sec">' + T('Privacy') + '</div><div class="card pad soft" style="font-size:13.5px;line-height:1.6"><p>' + T('Everything stays on this computer. There is no account, no tracking and no telemetry.') + '</p><p style="margin-top:8px">' + T('Arsenale itself makes no network call unless you turn one of these on:') + '</p><ul>' +
      li(T('ntfy: the server you set (ntfy.sh unless you choose your own)')) + li(T('Telegram: api.telegram.org')) + li(T('Pushover: api.pushover.net')) + '</ul><p>' + T('Links open only when you click them.') + '</p></div></div>' +
      '<div><div class="sec">' + T('Security') + '</div><div class="card pad soft" style="font-size:13.5px;line-height:1.6"><ul style="margin:0">' +
      li(T('Only this page can approve, hire or set rules.')) +
      li(T('Opens only with your own key.')) +
      li(T('The command line trusts the local user.')) +
      li(T('The safety rules are a request to your assistant, not a lock: Arsenale cannot stop another program\'s tools.')) +
      li(T('Files are copied only from allowed folders.')) +
      li(T('Arsenale never opens or runs a file. A file path is shown as text.')) + '</ul></div></div>'
  }

