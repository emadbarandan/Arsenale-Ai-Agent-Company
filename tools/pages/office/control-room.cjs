/** The client half of the control room. Like officeClient it is written
 *  into the page as source, so it must not use anything that only Node has.
 *  officeClient calls it once with its helpers and gets the renderers back. */
function controlRoom(h) {
  const { esc, digits, hhmm, ms, span, cleanTask, isHeavy, T, k, usd, errTxt } = h
  const ic = h.ic || (() => '')
  const LATE_MS = 2 * 3600000 // a gate waiting longer than this turns red
  const STALE_MS = 24 * 3600000 // older than this, "dismiss all" offers to close it
  const TOOLS = ['Read', 'Grep', 'Glob', 'Edit', 'Write', 'Bash', 'PowerShell', 'Agent']
  const TOOL_SHORT = { PowerShell: 'PS' }
  const KIND = { A: 'A', B: 'B', C: 'C', approval: T('OK') }
  // the project strip in the full rail names each gate in words, never the letter (spec 1.2 rule 41);
  // A, B and C are the workflow's three owner gates (agents/WORKFLOW.md)
  const STEP = { A: T('Questions'), B: T('Design pick'), C: T('Commit') }
  const WHO = { user: 'u', supervisor: 's', agent: 'a' }
  const WHO_LABEL = { u: T('You'), s: T('Supervisor'), a: T('Agents'), o: T('Waiting for you') }

  const st = { armed: '', msg: {}, busy: '', sent: [], dwho: '', dproj: '', dsel: '', hl: '' }
  const hm = (v) => { const m = Math.max(0, Math.round(v / 60000)); return Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0') }
  const clip = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s }
  const id4 = (id) => String(id || '').slice(-4)
  // the stored answer stays 'decline'; the button and the history say Reject, as on Decisions
  const APPROVAL_LABEL = { approve: T('Approve'), decline: T('Reject') }
  const said = (g, a) => (g && g.kind === 'approval' && APPROVAL_LABEL[a] ? APPROVAL_LABEL[a] : a)
  const gatesOf = () => (Array.isArray(DATA.gates) ? DATA.gates : [])
  const decsOf = () => (Array.isArray(DATA.decisions) ? DATA.decisions : [])
  const canAnswer = () => LIVE && !!ANSWER_TOKEN

  function waiting() {
    return gatesOf().filter((g) => g.status === 'waiting').sort((a, b) => ms(a.askedAt) - ms(b.askedAt))
  }
  const ageOf = (g, now) => now - ms(g.askedAt)
  const runLink = (S, id) => {
    if (!id) return ''
    const r = S.byId.get(id)
    if (!r) return '<span class="mono dim" dir="ltr">' + esc(id4(id)) + '</span>'
    return '<button type="button" class="lnk" data-key="' + esc(r.key) + '" data-go="office">' + esc(r.agent) + ' · ' + esc(id4(id)) + '</button>'
  }

  // ---------- the rail
  function answerBox(g) {
    const m = st.msg[g.id]
    const note = m ? '<span class="ansmsg ' + (m.ok ? 'ok' : 'err') + '" role="status">' + esc(m.text) + '</span>' : ''
    if (!canAnswer()) {
      return note ? '<div class="ansbox">' + note + '</div>' : ''
    }
    const busy = st.busy === g.id ? ' disabled' : ''
    const btn = (value, label, cls) => {
      const armed = st.armed === g.id + '|' + value
      return '<button type="button" class="' + (cls || '') + (armed ? ' armed' : '') + '" data-ans="' + esc(g.id) + '" data-val="' + esc(value) + '"' + busy +
        (armed ? ' aria-label="' + T('Click again to send: ') + esc(label) + '"' : '') + '>' + (armed ? T('Send “') + esc(label) + T('”?') : esc(label)) + '</button>'
    }
    let html = '<div class="ansbox">'
    // a hire proposal is read in full before it is decided: on the Approvals screen
    if (g.approvalType === 'hire') return html + '<a class="yes" href="#/approvals" style="text-decoration:none;padding:3px 8px">' + T('Review the hire proposal') + '</a>' + note + '</div>'
    if (g.kind === 'approval') html += btn('approve', T('Approve'), 'yes') + btn('decline', T('Reject'), 'no')
    else if (Array.isArray(g.choices) && g.choices.length) html += g.choices.map((c) => btn(c, c)).join('')
    else html += '<form data-ansform="' + esc(g.id) + '"><input name="a" maxlength="300" autocomplete="off" placeholder="' + T('Short answer…') + '" aria-label="' + T('Answer to: ') + esc(clip(g.question, 60)) + '" data-keep="' + esc(g.id) + '"' + busy + '><button type="submit"' + busy + '>' + T('Send') + '</button></form>'
    // closes the question without an answer: for one that was settled in the chat
    const dis = st.armed === 'dis|' + g.id
    html += '<button type="button" class="dis' + (dis ? ' armed' : '') + '" data-dis="' + esc(g.id) + '"' + busy + ' title="' + T('Close without answering, for example when it was settled in the chat') + '">' + (dis ? T('Click again to dismiss') : T('Dismiss')) + '</button>'
    return html + note + '</div>'
  }

  function waitCard(S, g) {
    const age = ageOf(g, S.now)
    const late = age > LATE_MS
    const r = g.run ? S.byId.get(g.run) : null
    return '<div class="wait' + (late ? ' late' : '') + (st.hl === g.id ? ' hl' : '') + '" id="gate-' + esc(g.id) + '">' +
      '<button type="button" class="wait-go" data-gate-go="' + esc(g.id) + '" title="' + T('Show in the Decisions view') + '">' +
      // plain words, as in the dock and on Decisions: the kind and the project, how long, the question
      '<span class="wh"><span class="wk">' + esc(T(plainKind(g)[0]) + (g.project ? ' · ' + g.project : '')) + '</span>' +
      '<span class="age">' + (late ? '⚠ ' : '') + waitWords(age) + '</span></span>' +
      '<span class="wq">' + esc(g.question) + '</span>' +
      '<span class="wf"><span>' + (g.askedBy === 'agent' ? T('agent') : T('supervisor')) + ' · <span dir="ltr">' + hhmm(ms(g.askedAt)) + '</span></span>' +
      (r ? '<span class="mono" dir="ltr">' + esc(r.agent + ' ' + id4(r.id)) + '</span>' : '') + '</span></button>' +
      answerBox(g) + '</div>'
  }

  /** One row of gate steps per project (and round), for projects with a gate
   *  today or one still waiting. Kinds not asked yet show as empty steps. */
  function pipes(S) {
    const groups = new Map()
    for (const g of gatesOf()) {
      const key = (g.projectKey || g.project || '—') + '|' + (g.round || '')
      const list = groups.get(key) || []
      list.push(g); groups.set(key, list)
    }
    const shown = []
    for (const [key, list] of groups) {
      const recent = list.some((g) => g.status === 'waiting' || ms(g.askedAt) >= S.dayStart || ms(g.answeredAt) >= S.dayStart)
      if (!recent) continue
      const last = Math.max(...list.map((g) => Math.max(ms(g.askedAt) || 0, ms(g.answeredAt) || 0)))
      shown.push({ key, list, last, waits: list.some((g) => g.status === 'waiting') })
    }
    shown.sort((a, b) => (b.waits - a.waits) || (b.last - a.last))
    if (!shown.length) return '<p class="none">' + T('No gate logged today.') + '</p>'
    return shown.slice(0, 8).map(({ key, list }) => {
      const [proj, round] = key.split('|')
      const seen = new Set(list.map((g) => g.kind))
      const steps = list.map((g) => {
        const late = g.status === 'waiting' && ageOf(g, S.now) > LATE_MS
        const cls = g.status === 'answered' ? 'done' : g.status === 'waiting' ? (late ? 'lt' : 'wt') : 'ex'
        const mark = g.status === 'answered' ? ' ✓' : g.status === 'waiting' ? (late ? ' ⚠' : ' ⏳') : ''
        const tip = g.question + (g.answer ? ' — «' + said(g, g.answer) + '»' : '')
        return '<li class="' + cls + '" title="' + esc(tip) + '"><b>' + esc(g.kind === 'approval' ? T(plainKind(g)[0]) : STEP[g.kind] || g.kind) + '</b>' + esc(clip(g.label || g.question, 12)) + mark + '</li>'
      })
      for (const kd of ['A', 'B', 'C']) if (!seen.has(kd)) steps.push('<li><b>' + STEP[kd] + '</b>—</li>')
      return '<div class="pipe"><div class="pipe-h">' + esc(proj) + (round ? ' <span>' + esc(round) + '</span>' : '') + '</div><ol class="gsteps">' + steps.join('') + '</ol></div>'
    }).join('')
  }

  /** What is no longer waiting, newest first: answers and dismissals, with
   *  whether the supervisor has read the ones given on this page. */
  function given(S) {
    const closed = (g) => (g.status === 'answered' ? ms(g.answeredAt) : g.status === 'expired' ? ms(g.expiredAt || g.updatedAt) : NaN)
    const list = gatesOf().filter((g) => !isNaN(closed(g))).sort((a, b) => closed(b) - closed(a))
    if (!list.length) return '<p class="none">' + T('Nothing answered or dismissed yet.') + '</p>'
    const day = (t) => (t >= S.dayStart ? '' : new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' ')
    return '<ul class="given">' + list.slice(0, 15).map((g) => {
      const t = closed(g)
      const own = (g.history || []).some((x) => x.via === 'dashboard')
      const what = g.status === 'expired' ? '<span class="dim">' + T('dismissed') + '</span>' : '<span class="ans">«' + esc(said(g, g.answer)) + '»</span>'
      const read = own ? ' <span class="rd ' + (g.seen ? 'yes' : 'no') + '">' + (g.seen ? T('read by the supervisor') : T('not read yet')) + '</span>' : ''
      return '<li><time dir="ltr">' + day(t) + hhmm(t) + '</time><span>' + esc(clip(g.label || g.question, 40)) + ' — ' + what + read + '</span></li>'
    }).join('') + '</ul>' + (list.length > 15 ? '<p class="none">' + digits(list.length - 15) + T(' older ones not shown') + '</p>' : '')
  }

  // inside an office the rail shows that office's questions (st.only)
  const shown = () => waiting().filter((g) => !st.only || st.only(g))

  function rail(S, mode) {
    const w = shown()
    const elsewhere = waiting().length - w.length
    let html = '<h2 id="rail-h">' + T('Waiting for you') + ' <b>' + digits(w.length) + '</b><button type="button" class="x" data-railclose="1">' + T('Close ✕') + '</button></h2>'
    html += '<p class="hint">' + (canAnswer() ? T('Answer here, or reply to the supervisor in the chat. Oldest first.')
      : LIVE ? T('Answer in the chat; this page must be open.')
        : T('Answer in the chat; this page must be open.')) + '</p>'
    // an answered gate leaves the list at once; say so where it was
    st.sent = st.sent.filter((x) => S.now - x.at < 20000)
    html += st.sent.map((x) => '<p class="ansmsg ok" role="status">' + (x.dismissed ? esc(clip(x.shown, 40)) + T(' dismissed.') : '«' + esc(clip(x.shown, 40)) + T('” recorded. The supervisor picks it up from answers.jsonl.')) + '</p>').join('')
    html += w.length ? w.map((g) => waitCard(S, g)).join('') : '<p class="none">' + T('Nothing is waiting for you.') + '</p>'
    if (elsewhere > 0) html += '<p class="none">' + digits(elsewhere) + T(' more in other offices') + '</p>'
    // questions that sat for a day are nearly always settled in the chat already
    const stale = w.filter((g) => ageOf(g, S.now) > STALE_MS)
    if (canAnswer() && stale.length > 1) {
      const armed = st.armed === 'dis|*'
      html += '<button type="button" class="bulk' + (armed ? ' armed' : '') + '" data-dis="*"' + (st.busy ? ' disabled' : '') + '>' + (armed ? T('Click again to dismiss ') : T('Dismiss all older than 24 h ')) + '(' + digits(stale.length) + ')</button>'
    }
    if (mode === 'use') html += '<div class="sect">' + T('Where did the tokens go? ') + '<span class="src">' + T('summary for today') + '</span></div>' + where(S)
    html += '<div class="sect">' + T('Gates per project') + '</div>' + pipes(S)
    html += '<div class="sect">' + T('Answered and dismissed') + '</div>' + given(S)
    return html
  }

  function mini(S) {
    const w = shown()
    let html = '<button type="button" class="ttl" data-railopen="1" aria-label="' + T('Open the waiting-for-you rail, ') + digits(w.length) + T(' items') + '">' + T('Waiting for you') + ' ' + digits(w.length) + '</button>'
    html += w.slice(0, 9).map((g) => {
      const age = ageOf(g, S.now), late = age > LATE_MS
      return '<button type="button" class="mr' + (late ? ' late' : '') + '" data-railopen="' + esc(g.id) + '" aria-label="' + esc(T('Gate ') + (KIND[g.kind] || g.kind) + T(', ') + (g.project || '') + T(', ') + g.question + T(', ') + hm(age)) + '"><b>' + esc(KIND[g.kind] || g.kind) + '</b><span>' + hm(age) + '</span></button>'
    }).join('')
    if (!w.length) html += '<span class="mr zero" aria-hidden="true"><b>—</b></span>'
    return html
  }

  // ---------- the dock: the oldest three, in plain words (kind, project, the question, how long it waits)
  const DOCK_KIND = { merge: ['Merge', 'merge'], 'next-phase': ['Next phase', 'skip'], build: ['Build', 'build'], publish: ['Release', 'lock'] }
  function plainKind(g) {
    const t = g.action && g.action.type
    if (DOCK_KIND[t]) return DOCK_KIND[t]
    if (g.approvalType === 'hire') return ['Hire', 'plus']
    if (g.kind === 'approval' || g.approvalType === 'action') return ['Approval', 'check']
    return ['Question', 'comment']
  }
  function waitWords(v) {
    const m = Math.max(0, Math.round(v / 60000))
    if (m < 1) return T('under a minute')
    return m < 60 ? digits(m) + T(' min') : digits(Math.floor(m / 60)) + T(' h') + (m % 60 ? ' ' + digits(m % 60) + T(' min') : '')
  }
  // proposals wait in their own tray (spec 1.4 section 8): a chip beside "Waiting for you", not counted in it
  const proposalChip = () => {
    const n = (DATA.proposals || []).filter((g) => g && g.status === 'waiting').length
    return n ? '<button type="button" class="dprop" data-pl-proptab="1" title="' + T('Open the Proposals tab') + '">' + T('Proposals') + ' ' + digits(n) + '</button>' : ''
  }
  function dock(S, many) {
    const w = shown()
    if (!w.length) return proposalChip() ? '<div class="dh"><span class="sp"></span>' + proposalChip() + '</div>' : ''
    const rows = w.slice(0, 3).map((g) => {
      const [kind, icon] = plainKind(g), late = ageOf(g, S.now) > LATE_MS
      return '<button type="button" class="drow' + (late ? ' late' : '') + '" data-railopen="' + esc(g.id) + '" title="' + T('Answer it here') + '">' + ic(icon, 20, 2) +
        '<span class="dk">' + esc(T(kind) + (g.project ? ' · ' + g.project : '')) + '</span><span class="dq" dir="auto">' + esc(g.question || g.label || '') + '</span><span class="da">' + waitWords(ageOf(g, S.now)) + '</span></button>'
    }).join('')
    return '<div class="dh"><button type="button" class="dtl" data-railopen="1">' + T('Waiting for you') + ' <b class="cnt">' + digits(w.length) + '</b></button>' + (many || '') + proposalChip() + '<span class="sp"></span><button type="button" class="dlink" data-view="appr">' + T('Open Decisions →') + '</button></div>' + rows +
      (w.length > 3 ? '<button type="button" class="dmore" data-railopen="1">' + digits(w.length - 3) + T(' more, oldest first') + '</button>' : '')
  }

  // ---------- decisions and gates
  function items(S) {
    const out = []
    for (const d of decsOf()) {
      const t = ms(d.at)
      if (!(t >= S.dayStart)) continue
      const who = WHO[d.by] || 'a'
      const open = d.state === 'open'
      out.push({
        id: 'd:' + d.id, t, who, lane: who, open, project: d.projectKey || d.project || '',
        name: who === 'a' ? (d.agent || (S.byId.get(d.run) || {}).agent || T('agent')) : WHO_LABEL[who],
        text: d.text, reason: d.reason, run: d.run,
        status: open ? '<span class="dst wt">' + T('Open') + '</span>' : '<span class="dst">' + (who === 'a' ? T('self-decided') : who === 'u' ? T('answered') : T('taken')) + '</span>',
      })
    }
    for (const g of gatesOf()) {
      const asked = ms(g.askedAt)
      const waitingNow = g.status === 'waiting'
      const answered = g.status === 'answered'
      const t = answered ? ms(g.answeredAt) : asked
      if (!waitingNow && !(t >= S.dayStart) && !(asked >= S.dayStart)) continue
      const age = S.now - asked, late = waitingNow && age > LATE_MS
      out.push({
        id: 'g:' + g.id, gate: g, t, asked, who: answered ? 'u' : 'o', lane: 'u', open: waitingNow, project: g.projectKey || g.project || '',
        name: answered ? T('You') : T('Waiting for you'),
        text: answered ? '«' + said(g, g.answer) + '»' : g.question,
        reason: answered ? (KIND[g.kind] || g.kind) + ' · ' + g.question : T('Asked by ') + (g.askedBy === 'agent' ? T('agent') : T('supervisor')) + (g.kind ? ' · ' + T('Gate ') + (KIND[g.kind] || g.kind) : ''),
        run: g.run,
        status: waitingNow ? '<span class="dst ' + (late ? 'lt' : 'wt') + '">' + (late ? '⚠ ' : '⏳ ') + hm(age) + '</span>'
          : answered ? '<span class="dst">' + T('answered') + (g.via === 'dashboard' || (g.history || []).some((x) => x.via === 'dashboard') ? T(' · dashboard') : '') + '</span>' : '<span class="dst">' + T('expired') + '</span>',
      })
    }
    return out.sort((a, b) => b.t - a.t)
  }

  function decisions(S) {
    const all = items(S)
    const inProj = all.filter((x) => !st.dproj || x.project === st.dproj)
    const pass = (x) => !st.dwho || (st.dwho === 'open' ? x.open : st.dwho === 'u' ? x.who === 'u' : x.who === st.dwho)
    const rows = inProj.filter(pass)
    const n = (f) => inProj.filter(f).length
    const chip = (key, label, count, color) => '<button type="button" class="fchip" data-dwho="' + key + '" aria-pressed="' + (st.dwho === key) + '"' + (color ? ' style="color:' + color + '"' : '') + '>' + label + ' <b>' + digits(count) + '</b></button>'
    const projects = [...new Set(all.map((x) => x.project).filter(Boolean))].sort()
    let html = '<div class="fbar"><h2>' + T('Decisions today') + '</h2>' +
      chip('', T('All'), inProj.length) + chip('open', T('Open'), n((x) => x.open), 'var(--gate)') +
      chip('u', T('You'), n((x) => x.who === 'u'), 'var(--who-user)') + chip('s', T('Supervisor'), n((x) => x.who === 's'), 'var(--who-sup)') +
      chip('a', T('Agents'), n((x) => x.who === 'a'), 'var(--who-agent)') +
      '<label for="dproj" class="dim" style="margin-inline-start:auto;font-size:12px">' + T('Project') + '</label><select id="dproj" class="fsel"><option value="">' + T('All projects') + '</option>' +
      projects.map((p) => '<option' + (p === st.dproj ? ' selected' : '') + '>' + esc(p) + '</option>').join('') + '</select></div>'
    html += swim(S, inProj)
    html += '<div class="tbl-wrap" id="dtbl">'
    if (!rows.length) {
      html += '<p class="empty">' + (all.length ? T('Nothing matches this filter.') : T('No decision or gate logged today.')) + '</p></div>'
      return html
    }
    html += '<table class="dt"><thead><tr><th scope="col">' + T('Time') + '</th><th scope="col">' + T('Who') + '</th><th scope="col">' + T('Decision and reason') + '</th><th scope="col">' + T('Run') + '</th><th scope="col">' + T('Status') + '</th></tr></thead><tbody>' +
      rows.map((x) => '<tr data-dsel="' + esc(x.id) + '" id="row-' + esc(x.id.replace(/[^\w-]/g, '_')) + '" class="' + (st.dsel === x.id ? 'selrow' : '') + '">' +
        '<td class="t" dir="ltr">' + hhmm(x.t) + '</td>' +
        '<td class="w"><span class="dw ' + x.who + '"><i></i>' + esc(x.name) + '</span></td>' +
        '<td><div class="d">' + esc(x.text) + '</div>' + (x.reason ? '<div class="r">' + esc(x.reason) + '</div>' : '') + '</td>' +
        '<td class="run">' + runLink(S, x.run) + '<span class="pj">' + esc(x.project || '—') + '</span></td>' +
        '<td>' + x.status + '</td></tr>').join('') + '</tbody></table></div>'
    return html
  }

  /** Three lanes, time right to left like the shift board: the user, the
   *  supervisor, the agents. Waiting gates are hatched bars up to now. */
  function swim(S, list) {
    const now = S.now
    const d8 = S.dayStart + 8 * 3600000
    const starts = list.map((x) => x.asked || x.t).concat(S.today.map((r) => r.start).filter((t) => t >= S.dayStart))
    let t0 = Math.min(d8, ...starts.filter((t) => t > 0))
    t0 = Math.floor(t0 / 1800000) * 1800000
    const span = Math.max(1800000, now - t0)
    const pos = (t) => Math.max(0, Math.min(100, (t - t0) / span * 96))
    const lanes = { u: [], s: [], a: [] }
    const labelled = { u: -99, s: -99, a: -99 }
    const placed = { u: [], s: [], a: [] }
    const mark = (lane, t, cls, label, id) => {
      const p = pos(t)
      // markers a few minutes apart sit on top of each other and the lower one
      // cannot be clicked: nudge each one that has close neighbours down (the label sits above the lane's middle line)
      const near = placed[lane].filter((q) => Math.abs(q - p) < 1.4).length
      placed[lane].push(p)
      const nudge = near ? ';margin-top:' + (-6 + [0, 9, 4, 12, 7][near % 5]) + 'px' : ''
      let html = '<button type="button" class="mk ' + cls + (st.dsel === id ? ' sel' : '') + '" style="right:' + p.toFixed(2) + '%' + nudge + '" data-dsel="' + esc(id) + '" title="' + esc(hhmm(t) + ' ' + label) + '" aria-label="' + esc(hhmm(t) + ' ' + label) + '"></button>'
      // a label is up to ~160 px wide: 14 % of the track keeps two of them apart
      if (label && Math.abs(p - labelled[lane]) > 14) { labelled[lane] = p; html += '<span class="mlab" style="right:' + p.toFixed(2) + '%">' + esc(clip(label, 22)) + '</span>' }
      lanes[lane].push(html)
    }
    const sorted = list.slice().sort((a, b) => a.t - b.t)
    for (const x of sorted) {
      if (x.gate) {
        const g = x.gate
        mark('s', x.asked, 's', T('Asked ') + (g.label || g.question), x.id)
        if (g.status === 'answered') mark('u', x.t, 'u', g.label || g.answer, x.id)
      } else mark(x.lane, x.t, x.open ? 'o' : x.lane, x.text, x.id)
    }
    const bars = sorted.filter((x) => x.gate && x.gate.status === 'waiting').map((x, i) => {
      const late = now - x.asked > LATE_MS
      return '<div class="waitbar' + (late ? ' lt' : '') + '" style="right:' + pos(x.asked).toFixed(2) + '%;left:' + (100 - pos(now)).toFixed(2) + '%;margin-top:' + (-4 + (i % 3) * 6) + 'px" title="' + esc(x.gate.question) + '"></div>'
    }).join('')
    const step = span <= 5 * 3600000 ? 1800000 : span <= 10 * 3600000 ? 3600000 : 7200000
    let ticks = ''
    for (let t = t0; t <= now; t += step) ticks += '<span style="right:' + pos(t).toFixed(2) + '%">' + hhmm(t) + '</span>'
    const runs = S.today.concat(S.active).filter((r) => r.start >= t0 || r.end >= t0).map((r) => {
      const a = pos(isNaN(r.start) ? r.end : r.start), b = pos(r.live ? now : r.end)
      return '<i class="' + (r.live ? 'lv' : isHeavy(r.modelKey) ? 'op' : '') + '" style="right:' + a.toFixed(2) + '%;width:' + Math.max(0.4, b - a).toFixed(2) + '%" title="' + esc(r.agent + ' · ' + cleanTask(r.task)) + '"></i>'
    }).join('')
    const lane = (key, top) => '<div class="lane" style="top:' + top + 'px"><div class="lh"><span class="dw ' + key + '"><i></i>' + esc(WHO_LABEL[key]) + '</span></div><div class="track">' +
      (key === 'u' ? bars : '') + lanes[key].join('') + '</div></div>'
    return '<div class="swim" role="img" aria-label="' + T('Timeline of decisions today in three lanes: you, supervisor, agents') + '">' +
      lane('u', 0) + lane('s', 44) + lane('a', 88) +
      '<div class="axis">' + ticks + '<div class="nowl" style="right:' + pos(now).toFixed(2) + '%"><b>' + hhmm(now) + '</b></div></div>' +
      '<div class="runs-ax" aria-hidden="true">' + runs + '</div></div>'
  }

  // ---------- tools and usage
  const tr = (r) => (r.transcript && r.transcript.found ? r.transcript : null)
  function allowed(agent) {
    const def = h.agents().get(agent)
    if (!def) return null // a built-in agent: its tools are not known here
    const t = String(def.tools || '').trim()
    if (!t || /\ball\b|\*/i.test(t)) return 'all'
    return new Set(t.split(/[,\s]+/).filter(Boolean))
  }
  const dayRuns = (S) => S.today.slice().reverse().concat(S.active)

  function where(S) {
    const runs = dayRuns(S)
    const tot = runs.reduce((a, r) => a + (r.tokTotal || 0), 0)
    if (!tot) return '<p class="say">' + T('No usage measured yet today.') + '</p>'
    const op = runs.filter((r) => isHeavy(r.modelKey) && r.tokTotal)
    const opT = op.reduce((a, r) => a + r.tokTotal, 0)
    const time = runs.reduce((a, r) => a + (r.durMs || (r.live ? S.now - r.start : 0) || 0), 0)
    const opTime = op.reduce((a, r) => a + (r.durMs || (r.live ? S.now - r.start : 0) || 0), 0)
    let html = ''
    if (opT) html += '<p class="say">' + digits(op.length) + T(' heavy-model runs took ') + '<b>' + digits(Math.round(opT / tot * 100)) + T('%</b> of tokens and <b>') + digits(time ? Math.round(opTime / time * 100) : 0) + T('%</b> of the time.') + '</p>'
    const big = runs.slice().sort((a, b) => (b.tokTotal || 0) - (a.tokTotal || 0))[0]
    if (big) html += '<p class="say">' + T('Largest single run: ') + '<span dir="ltr" class="mono">' + esc(big.agent) + '</span> · ' + esc(clip(cleanTask(big.task), 50)) + ' (<b>' + k(big.tokTotal) + '</b>).</p>'
    let rr = null
    for (const r of runs) {
      const t = tr(r)
      if (!t) continue
      for (const f of t.files) if (f.read >= 5 && (!rr || f.read > rr.n)) rr = { r, n: f.read, f: f.path }
    }
    if (rr) html += '<p class="say">' + '<span dir="ltr" class="mono">' + esc(rr.r.agent) + ' ' + esc(id4(rr.r.id)) + '</span> read <span dir="ltr" class="mono">' + esc(rr.f.split(/[\\/]/).pop()) + '</span> <b>' + digits(rr.n) + '</b> times — a sign of repeated reading (rule 9.2).' + '</p>'
    return html
  }

  function usage(S) {
    const runs = dayRuns(S)
    const tot = runs.reduce((a, r) => a + (r.tokTotal || 0), 0)
    const opRuns = runs.filter((r) => isHeavy(r.modelKey))
    const opT = opRuns.reduce((a, r) => a + (r.tokTotal || 0), 0)
    const tools = runs.reduce((a, r) => a + (r.toolTotal || 0), 0)
    const time = runs.reduce((a, r) => a + (r.durMs || (r.live ? S.now - r.start : 0) || 0), 0)
    const nodata = runs.filter((r) => !r.tokSrc).length
    const costKnown = runs.filter((r) => typeof r.costUsd === 'number')
    const cost = costKnown.reduce((a, r) => a + r.costUsd, 0)
    const pricesSet = !!(DATA.prices && DATA.prices.set)
    const costDd = !pricesSet ? '<dd class="unset" title="' + T('Enter each model price in ') + esc((DATA.prices && DATA.prices.file) || 'model-prices.json') + '">' + T('set prices') + '</dd>'
      : '<dd>' + (costKnown.length ? usd(cost) : '—') + (costKnown.length < runs.length ? '<small>' + digits(runs.length - costKnown.length) + T(' no data') + '</small>' : '') + '</dd>'
    let html = '<dl class="kpis">' +
      '<div class="kpi m"><dt>' + T('Tokens today') + '</dt><dd>' + k(tot) + '<small>' + T('excludes cache reads') + '</small></dd></div>' +
      '<div class="kpi"><dt>' + T('Heavy-model share') + '</dt><dd>' + (tot ? digits(Math.round(opT / tot * 100)) + T('%') : '—') + (opRuns.length ? '<small>' + digits(opRuns.length) + T(' of ') + digits(runs.length) + T(' runs') + '</small>' : '') + '</dd></div>' +
      '<div class="kpi m"><dt>' + T('Tool calls') + '</dt><dd>' + (tools ? digits(tools) : '—') + '</dd></div>' +
      '<div class="kpi"><dt>' + T('Agent work time') + '</dt><dd>' + hm(time) + '<small>' + T('hours') + '</small></dd></div>' +
      '<div class="kpi"><dt>' + T('Cost (USD)') + '</dt>' + costDd + '</div>' +
      '<div class="kpi"><dt>' + T('No data') + '</dt><dd style="color:var(--ink-dim)">' + (nodata ? digits(nodata) + '<small>' + T('runs without a transcript') + '</small>' : '—') + '</dd></div></dl>'
    html += '<div class="grid2">' + byAgent(runs) + matrix(runs) + '</div>'
    html += runsTable(S, runs)
    return html
  }

  function byAgent(runs) {
    const m = new Map()
    for (const r of runs) {
      const a = m.get(r.agent) || { name: r.agent, n: 0, op: 0, sn: 0, nr: 0, live: false }
      a.n++
      if (r.live) a.live = true
      if (!r.tokSrc) a.nr++
      else if (isHeavy(r.modelKey)) a.op += r.tokTotal
      else a.sn += r.tokTotal
      m.set(r.agent, a)
    }
    const list = [...m.values()].sort((a, b) => (b.op + b.sn) - (a.op + a.sn) || b.nr - a.nr)
    const max = Math.max(1, ...list.map((a) => a.op + a.sn))
    const rows = list.map((a) => {
      const t = a.op + a.sn
      return '<tr><th scope="row" title="' + esc(a.name) + '">' + esc(clip(a.name, 17)) + ' ×' + digits(a.n) + '</th><td><div class="hbar">' +
        (a.op ? '<i class="op" style="width:' + (a.op / max * 100).toFixed(1) + '%"></i>' : '') +
        (a.sn ? '<i class="sn" style="width:' + (a.sn / max * 100).toFixed(1) + '%"></i>' : '') +
        (!t ? '<i class="nr" style="width:12%"></i>' : '') + '</div></td>' +
        (t ? '<td class="v">' + k(t) + (a.live ? '…' : '') + '</td>' : '<td class="v nrec">' + T('not recorded') + '</td>') + '</tr>'
    }).join('')
    return '<section class="box" aria-labelledby="h-tok"><h3 id="h-tok">' + T('Tokens by agent') + ' <span>' + T('from the transcript; input + cache writes + output') + '</span></h3>' +
      (rows ? '<table class="hb">' + rows + '</table>' : '<p class="empty">' + T('No runs today.') + '</p>') +
      '<div class="lg"><span><i style="background:var(--heavy)"></i>' + T('Heavy models') + '</span><span><i style="background:var(--other)"></i>' + T('Other models') + '</span><span><i style="background:repeating-linear-gradient(135deg,#3A4757 0 3px,transparent 3px 6px);border:1px solid #C3CCD5"></i>' + T('not recorded') + '</span><span class="dim">' + T('… = still running') + '</span></div></section>'
  }

  function matrix(runs) {
    const m = new Map()
    for (const r of runs) {
      const a = m.get(r.agent) || { name: r.agent, counts: {}, rec: false }
      const t = tr(r)
      if (t) {
        a.rec = true
        for (const [n, c] of Object.entries(t.toolCounts || {})) a.counts[n] = (a.counts[n] || 0) + c
      }
      m.set(r.agent, a)
    }
    const rows = [...m.values()].sort((a, b) => b.rec - a.rec || a.name.localeCompare(b.name)).map((a) => {
      const al = allowed(a.name)
      if (!a.rec) return '<tr><th scope="row">' + esc(clip(a.name, 17)) + '</th><td colspan="' + (TOOLS.length + 1) + '" class="norec">' + T('no transcript') + (al && al !== 'all' ? T(' — only the allowed tools are known') : '') + '</td></tr>'
      const cells = TOOLS.map((tool) => {
        const c = a.counts[tool] || 0
        const ok = al === null || al === 'all' || al.has(tool)
        if (c) return '<td><span class="mc u' + (c >= 40 ? ' hi' : '') + (ok ? '' : ' bad') + '" title="' + esc(tool) + (ok ? '' : T(' — not allowed in the definition')) + '">' + digits(c) + '</span></td>'
        if (!ok) return '<td><span class="mc n" title="' + esc(tool) + T(' not allowed in the definition') + '">·</span></td>'
        return '<td><span class="mc z" title="' + esc(tool) + '">—</span></td>'
      })
      const other = Object.entries(a.counts).filter(([n]) => !TOOLS.includes(n))
      const oc = other.reduce((s, [, c]) => s + c, 0)
      cells.push('<td>' + (oc ? '<span class="mc u" title="' + esc(other.map(([n, c]) => n + ' ' + c).join(T(', '))) + '">' + digits(oc) + '</span>' : '<span class="mc z">—</span>') + '</td>')
      return '<tr><th scope="row" title="' + esc(a.name) + (al === null ? T(' — built-in agent, its allowed tools are not known here') : '') + '">' + esc(clip(a.name, 17)) + '</th>' + cells.join('') + '</tr>'
    }).join('')
    return '<section class="box" aria-labelledby="h-mx"><h3 id="h-mx">' + T('Tools: allowed vs used') + ' <span>' + T('number = calls today') + '</span></h3>' +
      (rows ? '<table class="mx"><thead><tr><th scope="col"></th>' + TOOLS.map((t) => '<th scope="col">' + (TOOL_SHORT[t] || t) + '</th>').join('') + '<th scope="col">' + T('Other') + '</th></tr></thead><tbody>' + rows + '</tbody></table>' : '<p class="empty">' + T('No runs today.') + '</p>') +
      '<div class="lg"><span><i style="background:rgba(86,182,194,.3);border:1px solid rgba(86,182,194,.5)"></i>' + T('used') + '</span><span><i style="border:1px dashed #3A4757"></i>' + T('allowed, not used') + '</span><span><i style="background:repeating-linear-gradient(135deg,#3A4757 0 3px,transparent 3px 6px)"></i>' + T('not allowed in the definition') + '</span></div></section>'
  }

  function runsTable(S, runs) {
    const decs = decsOf()
    const list = runs.slice().sort((a, b) => (b.live - a.live) || b.end - a.end)
    const body = list.map((r) => {
      const t = tr(r)
      const changed = t ? t.files.filter((f) => f.edit + f.write > 0).length : null
      const ds = r.id ? decs.filter((d) => d.run === r.id) : []
      const open = ds.filter((d) => d.state === 'open').length
      const dur = r.live ? S.now - r.start : r.durMs
      const nr = '<td class="n nrec">' + T('not recorded') + '</td>'
      return '<tr data-key="' + esc(r.key) + '" data-go="office" tabindex="0">' +
        '<td class="n">' + (r.live ? '<span class="acc">▶</span>' : hhmm(r.end)) + '</td>' +
        '<td class="n">' + esc(r.agent) + '</td>' +
        '<td class="tk" title="' + esc(cleanTask(r.task)) + '">' + esc(clip(cleanTask(r.task), 60)) + '</td>' +
        '<td class="n' + (isHeavy(r.modelKey) ? ' opt' : '') + '">' + esc(r.modelKey || '—') + '</td>' +
        '<td class="n">' + (dur ? span(dur) : '—') + '</td>' +
        (r.tokSrc ? '<td class="n m">' + k(r.tokTotal) + (r.tokSrc === 'reported' ? '≈' : '') + '</td>' : nr) +
        (typeof r.costUsd === 'number' ? '<td class="n">' + usd(r.costUsd) + '</td>' : '<td class="n nrec">' + (t && !(DATA.prices && DATA.prices.set) ? T('no price') : '—') + '</td>') +
        (r.toolTotal ? '<td class="n m">' + digits(r.toolTotal) + '</td>' : nr) +
        '<td class="n">' + (changed ? digits(changed) : '—') + '</td>' +
        '<td class="n">' + (ds.length ? digits(ds.length) : open ? '' : '—') + (open ? ' <span style="color:var(--gate)">+' + digits(open) + T(' open') + '</span>' : '') + '</td></tr>'
    }).join('')
    return '<section class="box runs-box" style="flex:1;min-height:0;padding-bottom:0" aria-labelledby="h-runs"><h3 id="h-runs">' + T('Runs today') + ' <span>' + T('newest first · files changed = Edit/Write in the transcript · ≈ = reported number, not counted') + '</span></h3>' +
      (body ? '<table class="rt"><thead><tr><th scope="col">' + T('End') + '</th><th scope="col">' + T('Agent') + '</th><th scope="col">' + T('Task') + '</th><th scope="col">' + T('Model') + '</th><th scope="col">' + T('Duration') + '</th><th scope="col">' + T('Tokens') + '</th><th scope="col">' + T('Cost') + '</th><th scope="col">' + T('Tools') + '</th><th scope="col">' + T('Files changed') + '</th><th scope="col">' + T('Decision') + '</th></tr></thead><tbody>' + body + '</tbody></table>'
        : '<p class="empty">' + T('No runs today.') + '</p>') + '</section>'
  }

  // ---------- inspector: tools used and files touched by one run
  function inspectorExtra(r) {
    const t = tr(r)
    const al = allowed(r.agent)
    let html = '<dl class="kv"><div><dt>' + T('Tokens') + (r.live ? T(' so far') : '') + '</dt><dd style="color:var(--measured)">' + (r.tokSrc ? k(r.tokTotal) + (r.tokSrc === 'reported' ? '≈' : '') : '<span class="nrec">' + T('not recorded') + '</span>') + '</dd></div>' +
      '<div><dt>' + T('Tools') + '</dt><dd style="color:var(--measured)">' + (r.toolTotal ? digits(r.toolTotal) : '<span class="nrec">' + T('not recorded') + '</span>') + '</dd></div>' +
      '<div><dt>' + T('Cost') + '</dt><dd>' + (typeof r.costUsd === 'number' ? usd(r.costUsd) : '<span class="nrec">' + (t && !(DATA.prices && DATA.prices.set) ? T('no price') : '—') + '</span>') + '</dd></div></dl>'
    const mt = r.meters
    if (mt) {
      const cs = r.cacheShare
      html += '<dl class="kv"><div><dt>' + T('Input') + '</dt><dd dir="ltr">' + k(mt.input) + '</dd></div><div><dt>' + T('Output') + '</dt><dd dir="ltr">' + k(mt.output) + '</dd></div>' +
        '<div><dt>' + T('Cache read') + '</dt><dd dir="ltr">' + k(mt.cacheRead) + '</dd></div><div><dt>' + T('Cache write') + '</dt><dd dir="ltr">' + k(mt.cacheWrite5m + mt.cacheWrite1h) + '</dd></div>' +
        '<div><dt>' + T('Cache-read share') + '</dt><dd dir="ltr">' + (cs == null ? '—' : Math.round(cs * 100) + '%') + '</dd></div>' +
        '<div><dt>' + T('Cost source') + '</dt><dd>' + (r.costSrc ? esc(r.costSrc) + (r.meterSrc === 'estimated' ? T(' (est.)') : '') : '<span class="nrec">' + T('not recorded') + '</span>') + '</dd></div></dl>'
    }
    if (!t) {
      const why = r.transcript && r.transcript.reason === 'missing' ? T('The transcript file is no longer there.') : r.live ? T('This run transcript has not been found yet.') : T('This run transcript was not recorded.')
      return html + '<p class="muted" style="margin:4px 0 0">' + T('Tools and files: ') + why + '</p>'
    }
    const used = Object.entries(t.toolCounts || {}).sort((a, b) => b[1] - a[1])
    const zero = al && al !== 'all' ? [...al].filter((n) => !t.toolCounts[n]) : []
    html += '<div class="toolline">' + used.map(([n, c]) => '<span' + (al && al !== 'all' && !al.has(n) ? ' class="bad" title="' + T('not allowed in the definition') + '"' : '') + '>' + esc(n) + ' <b>' + digits(c) + '</b></span>').join(' · ') +
      (zero.length ? ' · ' + zero.map((n) => '<s>' + esc(n) + '</s>').join(' · ') : '') + '</div>'
    if (t.tokens && t.tokens.cacheRead) html += '<p class="muted" style="margin:2px 0 0">' + T('Cache reads: ') + '<span dir="ltr" class="mono">' + k(t.tokens.cacheRead) + '</span></p>'
    const changed = t.files.filter((f) => f.edit + f.write > 0)
    const read = t.files.filter((f) => !(f.edit + f.write))
    html += '<h3 class="sect">' + T('Files') + (changed.length || read.length || t.hiddenFiles ? ' <span class="dim">· ' + [changed.length ? digits(changed.length) + T(' changed') : '', read.length ? digits(read.length) + T(' read') : '', t.hiddenFiles ? digits(t.hiddenFiles) + T(' hidden') : ''].filter(Boolean).join(T(', ')) + '</span>' : '') + '</h3>'
    const name = (f) => { const p = f.path.split(/[\\/]/); return p.slice(-2).join('/') }
    if (changed.length) html += '<div class="files">' + changed.map((f) => '<span class="file w" title="' + esc(f.path + ' — ' + (f.write ? 'Write ' + f.write : '') + (f.edit ? ' Edit ' + f.edit : '')) + '">' + esc(name(f)) + '</span>').join('') + '</div>'
    else html += '<p class="muted" style="margin:2px 0">' + T('No file changed.') + '</p>'
    if (read.length) html += '<details><summary>' + digits(read.length) + T(' files read') + '</summary><div class="files">' + read.map((f) => '<span class="file" title="' + esc(f.path + ' — Read ' + f.read) + '">' + esc(name(f)) + (f.read > 1 ? ' ×' + digits(f.read) : '') + '</span>').join('') + '</div></details>'
    if (t.hiddenFiles) html += '<p class="muted" style="margin:4px 0 0">' + digits(t.hiddenFiles) + T(' confidential files (keys, licences, documents) were only counted, their names are not shown.') + '</p>'
    return html
  }

  // ---------- answering a gate
  /** One POST to the local server. The token and the key cookie both come
   *  from the owner's launch key, so they outlive a server restart; a 401 or
   *  403 means this browser no longer holds the key (or the key file was
   *  replaced), and only opening the dashboard again with it helps. */
  async function post(url, payload) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Dashboard-Token': ANSWER_TOKEN },
      body: JSON.stringify(payload),
    })
    const body = await res.json().catch(() => ({}))
    if (res.status === 401 || (res.status === 403 && (body.error === 'token' || body.error === 'origin'))) throw new Error('This page lost its key. Open the dashboard again with arsenale open.')
    // a server started before this page code existed does not know the route
    if (res.status === 405 && body.error === 'GET only') throw new Error('restart the dashboard server once to turn this on')
    if (!res.ok) throw new Error(body.error || ('HTTP ' + res.status))
    return body
  }
  const keepGate = (body, id) => {
    const i = gatesOf().findIndex((g) => g.id === id)
    if (i >= 0 && body.gate) DATA.gates[i] = Object.assign(body.gate, { projectKey: DATA.gates[i].projectKey, seen: false })
  }

  async function answer(id, value, redraw) {
    st.armed = ''
    st.busy = id
    st.msg[id] = { ok: true, text: T('Sending…') }
    redraw()
    try {
      // with the hash of the question shown: one changed since is refused, not answered blind
      const g = (DATA.gates || []).find((x) => x.id === id)
      const body = await post('api/answer', Object.assign({ gate: id, answer: value }, g && g.qhash ? { hash: g.qhash } : {}))
      keepGate(body, id)
      delete st.msg[id]
      st.sent.push({ id, shown: said(body.gate, value), at: Date.now() })
    } catch (e) {
      st.msg[id] = { ok: false, text: T('Not recorded: ') + errTxt(e.message) }
    }
    st.busy = ''
    redraw()
  }

  /** Closes one waiting gate ("*": every one older than a day) without an answer. */
  async function dismiss(id, redraw, S) {
    st.armed = ''
    const ids = id === '*' ? waiting().filter((g) => ageOf(g, S.now) > STALE_MS).map((g) => g.id) : [id]
    st.busy = id
    for (const one of ids) st.msg[one] = { ok: true, text: T('Sending…') }
    redraw()
    for (const one of ids) {
      try {
        const body = await post('api/dismiss', { gate: one })
        keepGate(body, one)
        delete st.msg[one]
        st.sent.push({ id: one, shown: (body.gate.project ? body.gate.project + ': ' : '') + (body.gate.label || body.gate.question), at: Date.now(), dismissed: true })
      } catch (e) {
        st.msg[one] = { ok: false, text: T('Not recorded: ') + errTxt(e.message) }
      }
    }
    st.busy = ''
    redraw()
  }

  return { st, rail, mini, dock, decisions, usage, inspectorExtra, answer, dismiss, waiting, shown, canAnswer, post, answerBox }
}

module.exports = { controlRoom }
