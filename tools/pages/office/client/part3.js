  // ---------- the inspector
  function inspector(S, r) {
    if (!r) {
      const l = S.lastRun
      const st = l ? stOf(l.status) : 'ok'
      return '<h2 class="ih" style="font-family:var(--font-ui)">' + T('No one has taken a task yet') + '</h2>' +
        '<p class="muted">' + T('When the supervisor gives an agent a task, it sits down at its desk and you see its live log here.') + '</p>' +
        (l ? '<h3 class="sect">' + T('Last report') + '</h3><div class="slip g-' + st + '"><span class="st"><span class="g g-' + st + '">' + STATUS[st].g + '</span> ' + STATUS[st].label + '</span>' +
          '<b dir="ltr">' + esc(l.agent) + '</b> · ' + esc(l.projectKey || '—') + ' · ' + esc(new Date(l.end).toLocaleDateString(SHORT_LOCALE)) + ' <span dir="ltr">' + hhmm(l.end) + '</span>' +
          '<p>' + esc(l.summary || cleanTask(l.task)) + '</p></div>' : '') +
        '<h3 class="sect">' + digits(DATA.agents.length) + T(' agents, 0 working') + '</h3>' +
        '<p class="muted">' + T('The desks and break room are empty; no one who has not worked today has come to the office.') + '</p>'
    }
    const st = r.live ? 'running' : stOf(r.status)
    const def = AGENT.get(r.agent)
    const parent = parentOf(S, r)
    const kids = childrenOf(S, r)
    const twins = r.live ? S.busy.get(r.agent) || [] : []
    const steps = r.steps
    const startTxt = isNaN(r.start) ? '—' : hhmm(r.start)
    const took = isNaN(r.start) ? (r.durMs ? span(r.durMs) : '—') : span((r.live ? Date.now() : r.end) - r.start)
    let news
    if (r.live) news = '<dd' + (r.stale ? ' class="warn"' : '') + '>' + (r.stale ? '◷ ' : '') + '<span data-quiet="' + r.lastAt + '">' + quietMins(Date.now() - r.lastAt) + '</span>' + T(' min ago') + '</dd>'
    else news = '<dd dir="ltr">' + hhmm(r.end) + '</dd>'
    const who = (x) => '<button type="button" data-key="' + esc(x.key) + '"><b dir="ltr">' + esc(x.agent) + '</b></button>'
    let html = '<div class="who">' + portrait(r.agent, 5, false) +
      '<div><h2 class="ih" dir="auto">' + esc(personName(r.agent)) + '</h2><div class="muted" style="margin:0">' + esc([(def && def.title) || (def ? '' : T('agent with no definition in the agent folders')), personName(r.agent) !== r.agent ? r.agent : ''].filter((x, i, a) => x && x !== personName(r.agent) && a.indexOf(x) === i).join(' · ')) + '</div></div></div>' +
      '<div class="chips"><span class="chip st-' + st + '"><span class="g">' + STATUS[st].g + '</span> ' + STATUS[st].label + '</span>' +
      '<span class="chip mdl ' + (isHeavy(r.modelKey) ? 'heavy' : 'std') + '">' + esc((r.modelKey || '—') + (r.effort ? ' · ' + r.effort : '')) + '</span>' +
      (r.projectKey ? '<span class="chip">' + esc(r.projectKey) + '</span>' : '') +
      (r.budgetLevel === 'stop' ? '<span class="chip despite" title="' + T('The supervisor started this run although the budget check said stop') + '">' + T('started despite stop') + '</span>' : '') + '</div>' +
      (twins.length > 1 ? '<div class="twins" role="group" aria-label="' + T('Concurrent runs of this agent') + '">' + twins.map((x, i) => '<button type="button" data-key="' + esc(x.key) + '" class="' + (x.key === r.key ? 'on' : '') + '">' + T('Run ') + digits(i + 1) + '</button>').join('') + '</div>' : '') +
      inspectorAct(S, r) +
      plainFirst(r, took) +
      '<dl class="kv"><div><dt>' + T('Start') + '</dt><dd dir="ltr">' + startTxt + '</dd></div>' +
      '<div><dt>' + (r.live ? T('Elapsed') : T('Duration')) + '</dt><dd dir="ltr"' + (r.live && !isNaN(r.start) ? ' data-since="' + r.start + '"' : '') + '>' + took + '</dd></div>' +
      '<div><dt>' + (r.live ? T('Last update') : T('Handed in')) + '</dt>' + news + '</div></dl>' +
      CR.inspectorExtra(r) +
      '<h3 class="sect">' + T('Task') + '</h3><p class="task">' + esc(cleanTask(r.task)) + '</p>'
    if (parent) html += '<p class="rel">' + T('Under ') + (parent.missing ? '<span dir="ltr" class="dim">' + esc(parent.id) + '</span>' : who(parent) + ' <span dir="ltr" class="dim">…' + esc(String(parent.id || '').slice(-4)) + '</span>') + '</p>'
    if (kids.length) {
      html += '<p class="rel">' + T('Delegated to ') + kids.map((k) => who(k) + ' <span class="dim">(' + (k.live ? STATUS.running.label + T(', ') + quietMins(Date.now() - k.start) + T(' min') : STATUS[stOf(k.status)].g + ' ' + STATUS[stOf(k.status)].label) + ')</span>').join(T(', ')) + '</p>'
    }
    html += '<h3 class="sect">' + (r.live ? T('Live log') : T('Log')) + (steps && steps.length ? ' <span class="dim">· ' + digits(steps.length) + T(' steps') + '</span>' : '') + '</h3>'
    if (steps && steps.length) {
      html += '<ol class="term" id="term">' + steps.map((s, i) => '<li class="' + (r.live && i === steps.length - 1 ? 'now' : '') + '"><time dir="ltr">' + hhmm(ms(s.at)) + '</time><span>' + esc(s.text) + '</span></li>').join('') + '</ol>'
    } else if (r.live) {
      html += '<div class="term nolog"><p>' + T('Waiting for the first report from this agent…') + '</p></div>'
    } else {
      html += '<div class="term nolog"><p>' + T('The step-by-step log for this run was not kept.') + '</p><p class="dim">' + T('Records from before this version did not keep <code dir="ltr">steps</code>.') + '</p></div>'
    }
    html += '<h3 class="sect">' + T('Report') + '</h3>'
    if (r.live) html += '<p class="muted">' + T('Not handed in yet — when it finishes, the agent puts the report slip on the supervisor desk.') + '</p>'
    else {
      // the summary is shown first, at the top (plainFirst)
      if (r.findings && r.findings.length) html += '<ul class="finds">' + r.findings.map((f) => '<li>' + esc(f) + '</li>').join('') + '</ul>'
      if (r.files && r.files.length) html += '<div class="files">' + r.files.map((f) => '<span class="file">' + esc(f) + '</span>').join('') + '</div>'
    }
    if (W3 && mode === 'office') html += W3.characterBox(r.agent)
    return html
  }

  /** A finished job in plain words, first (spec R-7.1 to R-7.3): what was done,
   *  how long it took, then money only when it is real or labelled; tokens
   *  stay further down and in Tools & usage. */
  function plainFirst(r, took) {
    if (r.live) return ''
    const plan = COMPANY && COMPANY.configured && COMPANY.company && COMPANY.company.payModel === 'plan'
    const est = r.usage && r.usage.estimated
    const money = typeof r.costUsd === 'number' ? (est ? T('about ') + usd(r.costUsd) + T(' (estimated)') : usd(r.costUsd)) : plan ? T('Included in your plan') : '<span title="' + T('Your assistant did not report usage') + '">—</span>'
    let html = '<div class="plain">' + (r.summary ? '<p class="sum" dir="auto">' + esc(r.summary) + '</p>' : '<p class="sum none">' + T('No summary given') + '</p>')
    if (Array.isArray(r.whatWasDone) && r.whatWasDone.length) html += '<h3 class="sect">' + T('What was done') + '</h3><ul class="done">' + r.whatWasDone.map((x) => '<li dir="auto">' + esc(x) + '</li>').join('') + '</ul>'
    const tms = r.durMs || (r.end - r.start) || 0
    const mins = Math.round(tms / 60000), hh = Math.floor(mins / 60), mm = mins % 60
    const plainTook = !tms ? '—' : mins < 1 ? T('under a minute') : (hh ? digits(hh) + T(' h') + ' ' : '') + (mm || !hh ? digits(mm) + T(' min') : '')
    void took
    return html + '<p class="tm">' + plainTook + ' · ' + money + '</p></div>'
  }

  // ---------- "Needs a look": the runs of this floor that are stalled or dead.
  // Nudge asks the supervisor, through its inbox, to check a stalled run; Clean
  // hides a dead run Arsenale closed (both api/run-action, board only on the
  // server; its log stays in Activity). The closed dead runs come from
  // api/run-actions. A run the monitor calls dead but has not closed yet gets no
  // button: the monitor closes it on its next pass, within 30 s.
  const NL = { dead: [], at: 0, busy: '', msg: null }
  function loadClosedDead(force) {
    if (!LIVE || (!force && Date.now() - NL.at < 15000)) return
    NL.at = Date.now()
    fetch('api/run-actions', { cache: 'no-store' }).then((res) => (res.ok ? res.json() : null)).then((d) => { if (d && Array.isArray(d.dead)) { NL.dead = d.dead; redrawLater() } }, () => { /* an older server: no list, no Clean */ })
  }
  const closedDead = (S) => {
    const ids = new Set(NL.dead.map((d) => d.id))
    return ((S.full || S).all || []).filter((r) => r.id && ids.has(r.id) && (!CO || r.officeId === officeId))
  }
  const runActBtn = (op, id) => !LIVE ? '' : '<button type="button" class="nb" data-runact="' + op + '|' + esc(id) + '"' + (NL.busy ? ' disabled' : '') + '>' + (NL.busy === op + '|' + id ? T('Sending…') : op === 'clean' ? T('Clean') : T('Nudge')) + '</button>'
  async function runAct(op, id) {
    if (NL.busy) return
    NL.busy = op + '|' + id; NL.msg = null; renderAll()
    try {
      await CR.post('api/run-action', { op, run: id })
      NL.msg = { ok: true, text: op === 'clean' ? T('Hidden here and on Live. The log stays in Activity.') : T('Your assistant is asked to check on this run.') }
      if (op === 'clean') NL.dead = NL.dead.filter((d) => d.id !== id)
    } catch (e) { NL.msg = { ok: false, text: errTxt(e.message) } }
    NL.busy = ''
    loadClosedDead(true)
    renderAll()
  }
  function needsLook(S) {
    loadClosedDead(false)
    const list = S.active.filter((r) => r.health === 'stalled' || r.health === 'dead').sort((a, b) => b.quiet - a.quiet)
    const closed = closedDead(S)
    if (!list.length && !closed.length && !NL.msg) return ''
    return '<div class="nh"><b>' + T('Needs a look') + '</b><span class="nn">' + digits(list.length + closed.length) + '</span></div>' +
      (NL.msg ? '<p class="nm' + (NL.msg.ok ? '' : ' bad') + '" role="status">' + esc(NL.msg.text) + '</p>' : '') +
      list.map((r) => {
        const dead = r.health === 'dead'
        return '<div class="nr"><span class="nt ' + r.health + '">' + (dead ? T('dead') : '◷ ' + quietSpan(r.quiet)) + '</span>' +
          '<span class="nx" dir="auto"><button type="button" data-key="' + esc(r.key) + '"><b>' + esc(r.agent) + '</b></button> ' + (dead ? T('closing now') : T('has not reported')) + '</span>' +
          (dead ? '' : runActBtn('nudge', r.id)) + '</div>'
      }).join('') +
      closed.map((r) => '<div class="nr"><span class="nt dead">' + T('dead') + '</span>' +
        '<span class="nx" dir="auto"><button type="button" data-key="' + esc(r.key) + '"><b>' + esc(r.agent) + '</b></button> ' + T('closed by Arsenale') + '</span>' +
        runActBtn('clean', r.id) + '</div>').join('')
  }
  /** The same two actions in the inspector, for the run it shows. */
  function inspectorAct(S, r) {
    if (r.live && r.health === 'stalled') return '<div class="iact"><span class="warn">' + T('Stalled: no report for ') + quietSpan(r.quiet) + '</span>' + runActBtn('nudge', r.id) + '</div>'
    if (r.live && r.health === 'dead') return '<div class="iact"><span class="dim">' + T('The process is gone. Arsenale closes this run on its next check.') + '</span></div>'
    if (!r.live && closedDead(S).some((x) => x.id === r.id)) return '<div class="iact"><span class="dim">' + T('Closed by Arsenale: the process had ended.') + '</span>' + runActBtn('clean', r.id) + '</div>'
    return ''
  }

  // ---------- the drawer: today's slips, and when open, the shift board
  function drawer(S, current) {
    const counts = { findings: 0, failed: 0 }
    S.today.forEach((d) => { if (counts[d.status] !== undefined) counts[d.status]++ })
    const list = S.today.slice().reverse().filter((d) => !filter || d.status === filter)
    const fbtn = (key, label) => '<button type="button" class="f' + (filter === key ? ' on' : '') + '" data-filter="' + key + '" aria-pressed="' + (filter === key) + '">' + label + '</button>'
    let html = '<div class="dr-top"><h2 id="dr-h">' + (drawerOpen ? T('Shift board') : T('Handed in today')) + ' <span class="dim">' + digits(S.today.length) + '</span></h2>'
    if (!drawerOpen) {
      html += '<span class="filters" role="group" aria-label="' + T('Filter') + '">' + fbtn('', T('All')) +
        fbtn('findings', '<span class="g g-findings">!</span> ' + T('Has findings ') + digits(counts.findings)) +
        fbtn('failed', '<span class="g g-failed">✕</span> ' + T('Failed ') + digits(counts.failed)) + '</span>'
    } else {
      html += '<span class="dim" style="font-size:12px">' + T('Time flows right to left; each small line is one step, and hatching means more than ') + digits(QUIET_MIN) + T(' minutes of quiet.') + '</span>'
    }
    html += '<button type="button" class="more-btn" data-toggle="1" aria-expanded="' + drawerOpen + '">' + (drawerOpen ? T('Back to the office ↓') : T('Shift board ↑')) + '</button>' +
      '<a class="arch" href="' + ARCHIVE_HREF + '">' + T('Archive of every day') + '</a></div>'
    if (!drawerOpen) {
      if (list.length) {
        html += '<ol class="slips">' + list.map((d) => {
          const st = stOf(d.status)
          return '<li><button type="button" class="slip g-' + st + (current && current.key === d.key ? ' on' : '') + '" data-key="' + esc(d.key) + '">' +
            '<span class="st"><span class="g g-' + st + '">' + STATUS[st].g + '</span> ' + STATUS[st].label + '</span>' +
            '<span class="sl1"><b>' + esc(d.agent) + '</b><time>' + hhmm(d.end) + '</time></span>' +
            '<span class="sl2">' + esc((d.projectKey || '—') + ' · ' + cleanTask(d.task)) + '</span></button></li>'
        }).join('') + '</ol>'
      } else if (S.today.length) {
        html += '<p class="muted pad">' + T('No report today with this result.') + '</p>'
      } else {
        const l = S.lastRun
        html += '<p class="muted pad">' + T('No report handed in yet today.') + (l ? T(' Last: ') + esc(new Date(l.end).toLocaleDateString(SHORT_LOCALE)) + ' <span dir="ltr">' + hhmm(l.end) + '</span>' + T(', ') + '<span dir="ltr">' + esc(l.agent) + '</span>' + T(', ') + STATUS[stOf(l.status)].label + '.' : '') + '</p>'
      }
      return html
    }
    return html + '<div class="sb" id="sb">' + shiftBoard(S, current) + '</div>'
  }

  function shiftBoard(S, current) {
    const box = $('drawer')
    const W = Math.max(600, (box ? box.clientWidth : 1060))
    const HEADW = 210, ROW = 42, TOP = 104, FUT = 240
    const TW = W - HEADW
    // lanes: working agents first (a parent before its children), then the rest by latest hand-in
    const order = []
    const push = (a) => { if (!order.includes(a)) order.push(a) }
    const act = S.active.slice().sort((a, b) => a.start - b.start)
    act.filter((a) => !parentOf(S, a) || !parentOf(S, a).live).forEach((a) => {
      push(a.agent)
      act.filter((c) => c.parentId && c.parentId === a.id).forEach((c) => push(c.agent))
    })
    act.forEach((a) => push(a.agent))
    const lastBy = new Map()
    S.today.forEach((r) => lastBy.set(r.agent, r.end))
    ;[...lastBy.entries()].sort((a, b) => b[1] - a[1]).forEach(([a]) => push(a))

    const spans = S.active.concat(S.today)
    let t0 = S.now - 3600000
    spans.forEach((r) => { if (!isNaN(r.start) && r.start < t0) t0 = r.start })
    t0 = Math.max(t0, S.dayStart)
    const step = S.now - t0 > 6 * 3600000 ? 3600000 : 1800000
    t0 = Math.floor(t0 / step) * step
    const nowX = 12 + FUT, XR = TW - 14
    const X = (t) => XR - (t - t0) / (S.now - t0) * (XR - nowX)
    const Hgt = TOP + Math.max(order.length, 1) * ROW + 44
    const svg = []
    const html = []
    for (let m = t0; m <= S.now; m += step) {
      const x = X(m)
      svg.push('<line x1="' + x + '" y1="36" x2="' + x + '" y2="' + Hgt + '" stroke="' + (new Date(m).getMinutes() ? '#E6EAEE' : '#D9DFE5') + '" stroke-width="1"/>')
      if (x > nowX + 40) html.push('<span class="sb-tick" style="left:' + x + 'px">' + hhmm(m) + '</span>')
    }
    svg.push('<rect x="12" y="36" width="' + (nowX - 12) + '" height="' + (Hgt - 36) + '" fill="url(#sbfuture)"/>')
    svg.push('<rect x="12" y="44" width="' + (XR - 12) + '" height="' + (ROW + 4) + '" fill="#F6F8FA"/>')
    S.today.forEach((d, i) => {
      const st = stOf(d.status)
      const fresh = i === S.today.length - 1
      html.push('<button type="button" class="sb-slip s-' + st + (fresh ? ' fresh' : '') + (current && current.key === d.key ? ' on' : '') + '" data-key="' + esc(d.key) + '" style="left:' + X(d.end) + 'px;top:' + (52 + (i % 2) * 17) + 'px"' +
        ' aria-label="' + esc(hhmm(d.end) + ', ' + d.agent + ', ' + STATUS[st].label) + '"><span class="g">' + STATUS[st].g + '</span>' +
        (fresh ? ' <span class="sb-nw">' + esc(d.agent) + T(' · new') + '</span>' : '') + '</button>')
    })
    const quietGaps = (steps, from, to) => {
      // stretches of ten minutes or more with no step, as [later, earlier] times
      const times = (steps || []).map((s) => ms(s.at)).filter((t) => !isNaN(t)).sort((a, b) => a - b)
      if (!times.length) return []
      const out = []
      const edges = [from].concat(times, [to])
      for (let i = 1; i < edges.length; i++) {
        if (edges[i] - edges[i - 1] >= QUIET_MIN * 60000 && (i > 1 || !isNaN(from))) out.push([edges[i], edges[i - 1]])
      }
      return out
    }
    // a label only where its bar has the lane to itself; runs of the same
    // agent that overlapped in time would print over each other
    const alone = (r) => !S.today.some((o) => o !== r && o.agent === r.agent && o.end > (isNaN(r.start) ? r.end : r.start) && (isNaN(o.start) ? o.end : o.start) < r.end)
    const barHtml = (r, y, cls) => {
      const end = r.live ? S.now : r.end
      const start = isNaN(r.start) ? end : Math.max(r.start, t0)
      const x1 = X(end), w = Math.max(X(start) - x1, 6)
      const st = r.live ? 'running' : stOf(r.status)
      const inner = []
      if (r.steps) {
        const gaps = quietGaps(r.steps, isNaN(r.start) ? NaN : r.start, r.live ? S.now : NaN)
        gaps.forEach(([later, earlier]) => {
          if (isNaN(later) || isNaN(earlier)) return
          inner.push('<span class="sb-hatch" style="left:' + (X(later) - x1) + 'px;width:' + (X(earlier) - X(later)) + 'px"></span>')
        })
        r.steps.forEach((p) => { const t = ms(p.at); if (!isNaN(t) && t >= start) inner.push('<i class="sb-stp" style="left:' + (X(t) - x1) + 'px"></i>') })
      }
      const label = !r.live && w > 70 && alone(r) ? '<span class="sb-bl">' + esc(cleanTask(r.task)) + '</span>' : ''
      const g = r.live ? '' : '<span class="g">' + STATUS[st].g + '</span>'
      return '<button type="button" class="sb-bar ' + cls + (current && current.key === r.key ? ' on' : '') + '" data-key="' + esc(r.key) + '" style="left:' + x1 + 'px;top:' + (y + 12) + 'px;width:' + w + 'px"' +
        ' aria-label="' + esc(r.agent + T(', ') + cleanTask(r.task) + T(', ') + STATUS[st].label + T(', ') + (isNaN(r.start) ? '' : hhmm(r.start)) + T(' to ') + (r.live ? T('now') : hhmm(r.end))) + '">' + inner.join('') + g + label + '</button>'
    }
    const laneY = new Map()
    order.forEach((agent, i) => laneY.set(agent, TOP + i * ROW))
    order.forEach((agent, i) => {
      const y = TOP + i * ROW
      svg.push('<line x1="12" y1="' + (y + ROW) + '" x2="' + XR + '" y2="' + (y + ROW) + '" stroke="#141C25"/>')
      if (current && current.agent === agent) svg.push('<rect x="12" y="' + (y + 1) + '" width="' + (XR - 12) + '" height="' + (ROW - 2) + '" fill="rgba(59,232,176,0.05)" stroke="rgba(59,232,176,0.3)"/>')
      S.today.filter((r) => r.agent === agent).forEach((r) => html.push(barHtml(r, y, 'b-' + stOf(r.status))))
      const runs = S.busy.get(agent) || []
      runs.forEach((run) => html.push(barHtml(run, y, 'b-run' + (run.stale ? ' stale' : ''))))
      const run = runs[0]
      if (run) {
        const txt = run.steps.length ? run.steps[run.steps.length - 1].text : T('Waiting for the first report…')
        html.push('<button type="button" class="sb-say' + (run.stale ? ' stale' : '') + '" data-key="' + esc(run.key) + '" style="left:16px;top:' + (y + 3) + 'px;width:' + (nowX - 32) + 'px">' +
          '<span>' + esc(txt) + '</span>' + (run.stale ? '<b>' + T('◷ quiet for ') + quietMins(S.now - run.lastAt) + T(' min') + '</b>' : '') + '</button>')
      }
    })
    // delegation: from the parent's lane down (or up) to the child's bar, at the moment it was handed over
    spans.forEach((c) => {
      const p = parentOf(S, c)
      if (!p || p.missing || !laneY.has(p.agent) || !laneY.has(c.agent) || p.agent === c.agent || isNaN(c.start)) return
      const x = X(Math.max(c.start, t0))
      const py = laneY.get(p.agent) + 30, cy = laneY.get(c.agent) + 12
      const dir = cy > py ? 1 : -1
      const tip = dir > 0 ? cy : cy + 18
      svg.push('<path d="M' + x + ',' + py + ' V' + tip + '" stroke="#6FA8E8" stroke-width="1.6" stroke-dasharray="3 3" fill="none"/>' +
        '<path d="M' + (x - 4) + ',' + (tip - 6 * dir) + ' l4,' + 6 * dir + ' l4,' + -6 * dir + '" fill="none" stroke="#6FA8E8" stroke-width="1.6"/>')
    })
    svg.push('<line x1="' + nowX + '" y1="36" x2="' + nowX + '" y2="' + Hgt + '" stroke="#0C8A62" stroke-width="1.5"/>')
    html.push('<span class="sb-nowlab" style="left:' + nowX + 'px">' + T('Now') + ' <span dir="ltr">' + hhmm(S.now) + '</span></span>')
    if (!order.length) html.push('<p class="sb-empty" style="top:' + (TOP + 12) + 'px;right:30px">' + T('No work has started today yet. The first run logged opens a new lane here.') + '</p>')

    const heads = order.map((agent, i) => {
      const run = (S.busy.get(agent) || [])[0]
      const last = S.today.filter((d) => d.agent === agent).pop()
      const st = run ? 'running' : stOf(last && last.status)
      const def = AGENT.get(agent)
      const on = current && current.agent === agent
      const kid = run && parentOf(S, run) && parentOf(S, run).live
      const key = run ? run.key : last.key
      return '<li style="top:' + (TOP + i * ROW) + 'px"><button type="button" class="sb-hd' + (on ? ' on' : '') + (kid ? ' kid' : '') + '" data-key="' + esc(key) + '">' +
        portrait(agent, 3, !run) +
        '<span class="sb-nm"><b dir="ltr">' + (kid ? '↳ ' : '') + esc(agent) + '</b><span>' + (run ? esc(run.projectKey || '—') + ' · <span dir="ltr">' + esc(run.modelKey || '—') + '</span>' : esc((def && def.title) || '')) + '</span></span>' +
        '<span class="sb-now st-' + st + '">' + (run ? '<span dir="ltr" data-since="' + run.start + '">' + span(S.now - run.start) + '</span>' : '<span class="g">' + STATUS[st].g + '</span>') + '</span></button></li>'
    }).join('')
    const absent = DATA.agents.map((a) => a.name).filter((a) => !order.includes(a))
    const headList = '<ol class="sb-heads">' +
      '<li style="top:44px" class="boss">' + portrait('supervisor', 3, false) + '<span class="sb-nm"><b>' + T('Supervisor') + '</b><span>' + T('Reports land on this line · ') + digits(S.today.length) + '</span></span></li>' +
      heads +
      '<li style="top:' + (TOP + order.length * ROW + 4) + 'px" class="absent" title="' + esc(absent.join(' · ')) + '"><span>' + digits(absent.length) + T(' agents had no work today:') + '</span> <span dir="ltr" class="sb-al">' + esc(absent.slice(0, 4).join(' · ')) + (absent.length > 4 ? ' …' : '') + '</span></li></ol>'
    return '<div class="sb-in" style="height:' + Hgt + 'px">' + headList +
      '<div class="sb-tl" style="width:' + TW + 'px;height:' + Hgt + 'px"><svg width="' + TW + '" height="' + Hgt + '" aria-hidden="true"><defs>' +
      '<pattern id="sbfuture" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#0B1117"/><line x1="0" y1="0" x2="0" y2="8" stroke="#0E151C" stroke-width="3"/></pattern></defs>' +
      svg.join('') + '</svg>' + html.join('') + '</div></div>'
  }

  // ---------- header
  function header(S) {
    const findings = S.today.filter((d) => d.status === 'findings').length
    const failed = S.today.filter((d) => d.status === 'failed').length
    const working = new Set(S.active.map((a) => a.agent))
    const ready = DATA.agents.filter((a) => !working.has(a.name)).length
    const quiet = S.active.filter((a) => a.stale).length
    const d = new Date(S.now)
    $('date').innerHTML = esc(d.toLocaleDateString(HDR_LOCALE, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })) + ' · <span dir="ltr" id="clock">' + hhmm(S.now) + '</span>'
    // the control room keeps the header to three counts; findings and
    // failures stay one click away in the drawer's filters
    void findings; void failed; void ready
    // one status group: working, quiet, handed in; what waits for you is the count on the Decisions tab
    const waitN = CR.waiting().length
    $('counts').innerHTML =
      '<li><i class="sdot ok" aria-hidden="true"></i><b class="acc">' + digits(S.active.length) + '</b> ' + T('working') + '</li>' +
      (quiet ? '<li><i class="sdot warn" aria-hidden="true"></i><b class="warn">' + digits(quiet) + '</b> ' + T('quiet') + '</li>' : '') +
      '<li><b>' + digits(S.today.length) + '</b> ' + T('handed in') + '</li>' +
      (CO ? '' : '<li><b class="gate-c">' + digits(CR.shown().length) + '</b> ' + T('waiting for you') + '</li>')
    for (const id of ['tc-appr', 'tc-appr2']) {
      const tc = $(id)
      if (tc) { tc.textContent = waitN ? digits(waitN) : ''; tc.setAttribute('aria-label', digits(waitN) + ' ' + T('waiting for you')) }
    }
    document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === mode)))
    // the narrow layout names the screen in the bar (the tabs are at the foot there)
    const SCREEN = { campus: T('Campus'), office: T('Office'), live: T('Live'), appr: T('Decisions'), team: T('Team'), plan: T('Plan'), tasks: T('Tasks'), dlv: T('Finished work'), act: T('Activity'), org: T('Org chart'), dec: T('Gate history'), use: T('Tools & usage'), set: T('Settings'), market: T('Marketplace'), vr: T('Version run'), sav: T('Savings') }
    const scrn = $('scrn')
    if (scrn) scrn.textContent = mode === 'office' && CO && CO.officeById(officeId) ? CO.oname(CO.officeById(officeId)) : SCREEN[mode] || ''
    if (CO) {
      const o = CO.officeById(officeId)
      const tab = $('vtab-office')
      if (tab) { tab.textContent = T('Office'); tab.title = o ? CO.oname(o) : '' }
      const legacy = $('omenu-legacy')
      if (legacy) {
        const MORE = { office: T('Office'), tasks: T('Tasks'), dlv: T('Finished work'), act: T('Activity'), dec: T('Gate history'), use: T('Tools & usage'), sav: T('Savings'), org: T('Org chart'), market: T('Marketplace'), set: T('Settings') }
        legacy.textContent = (MORE[mode] || T('More')) + ' ▾'
        legacy.setAttribute('aria-pressed', String(!!MORE[mode]))
      }
      const menu = $('omenu')
      if (menu) {
        menu.hidden = !omenuOpen
        if (omenuOpen) {
          const r = $('omenu-' + omenuOpen).getBoundingClientRect()
          menu.style.top = (r.bottom + 4) + 'px'
          menu.style.left = Math.max(8, (r.right - 220)) + 'px'
          menu.innerHTML = omenuOpen === 'legacy'
            ? '<button type="button" data-view="office" aria-current="' + (mode === 'office') + '">' + T('Office') + '</button><button type="button" data-view="tasks" aria-current="' + (mode === 'tasks') + '">' + T('Tasks') + '</button><button type="button" data-view="dlv" aria-current="' + (mode === 'dlv') + '">' + T('Finished work') + '</button><button type="button" data-view="act" aria-current="' + (mode === 'act') + '">' + T('Activity') + '</button><button type="button" data-view="org" aria-current="' + (mode === 'org') + '">' + T('Org chart') + '</button><button type="button" data-view="dec" aria-current="' + (mode === 'dec') + '">' + T('Gate history') + '</button><button type="button" data-view="use" aria-current="' + (mode === 'use') + '">' + T('Details: tools & usage') + '</button><button type="button" data-view="sav" aria-current="' + (mode === 'sav') + '">' + T('Savings') + '</button><button type="button" data-view="market" aria-current="' + (mode === 'market') + '">' + T('Marketplace') + '</button><button type="button" data-view="set" aria-current="' + (mode === 'set') + '">' + T('Settings') + '</button>'
            : CO.officeList().filter((x) => !x.builtIn || CO.counts(S_FULL, x.id).today || CO.counts(S_FULL, x.id).working).map((x) => '<button type="button" data-goto="office:' + esc(x.id) + '" aria-current="' + (x.id === officeId) + '"><span class="sq" style="background:' + esc(x.color) + '"></span>' + esc(CO.oname(x)) + '</button>').join('')
        }
      }
    }
  }

  // ---------- splitters: panel width and drawer height
  const board = $('board')
  const clampN = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v))
  function sizes() {
    const bw = $('v-office').clientWidth || board.clientWidth, bh = board.clientHeight
    // the office always keeps at least 520px of width and 180px of height
    const L = { iw: [280, Math.max(280, Math.min(720, bw - 520))], dh: [96, Math.max(96, bh - 52 - 180)], dho: [200, Math.max(200, bh - 52)] }
    const k = drawerOpen ? 'dho' : 'dh'
    return { L, k, iw: clampN(lay.iw, L.iw), dh: k === 'dho' && lay.dho == null ? L.dho[1] : clampN(lay[k], L[k]) }
  }
  function aria(el, v, [lo, hi]) {
    el.setAttribute('aria-valuenow', Math.round(v)); el.setAttribute('aria-valuemin', Math.round(lo)); el.setAttribute('aria-valuemax', Math.round(hi))
    el.setAttribute('aria-valuetext', digits(Math.round(v)) + T(' pixels'))
  }
  function applyLayout() {
    const z = sizes()
    board.style.setProperty('--iw', z.iw + 'px')
    board.style.setProperty('--dh', z.dh + 'px')
    aria($('split-v'), z.iw, z.L.iw)
    aria($('split-h'), z.dh, z.L[z.k])
  }
  let layoutQueued = false
  function setSize(axis, v) {
    const z = sizes()
    if (axis === 'x') lay.iw = clampN(v, z.L.iw)
    else lay[z.k] = clampN(v, z.L[z.k])
    if (!layoutQueued) { layoutQueued = true; requestAnimationFrame(() => { layoutQueued = false; applyLayout() }) }
  }
  function splitter(el, axis) {
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return
      e.preventDefault()
      el.setPointerCapture(e.pointerId)
      el.classList.add('drag')
      const z = sizes()
      const from = axis === 'x' ? e.clientX : e.clientY
      const v0 = axis === 'x' ? z.iw : z.dh
      // the panel sits on the right and grows to the left; the drawer grows upward
      const move = (ev) => setSize(axis, axis === 'x' ? v0 - (ev.clientX - from) : v0 - (ev.clientY - from))
      const up = () => {
        el.classList.remove('drag')
        el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up)
        saveLayout()
        if (drawerOpen && axis === 'x') renderAll() // the shift board is drawn to the drawer's width
      }
      el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up)
    })
    const reset = () => {
      if (axis === 'x') lay.iw = LAYOUT_DEF.iw
      else if (drawerOpen) lay.dho = null
      else lay.dh = LAYOUT_DEF.dh
      saveLayout(); applyLayout()
      if (drawerOpen && axis === 'x') renderAll()
    }
    el.addEventListener('dblclick', reset)
    el.addEventListener('keydown', (e) => {
      const z = sizes()
      const cur = axis === 'x' ? z.iw : z.dh
      const lim = axis === 'x' ? z.L.iw : z.L[z.k]
      const step = e.shiftKey ? 64 : 16
      const more = axis === 'x' ? 'ArrowLeft' : 'ArrowUp', less = axis === 'x' ? 'ArrowRight' : 'ArrowDown'
      let v = null
      if (e.key === more) v = cur + step
      else if (e.key === less) v = cur - step
      else if (e.key === 'Home') v = lim[0]
      else if (e.key === 'End') v = lim[1]
      else if (e.key === 'Enter') { e.preventDefault(); reset(); return }
      if (v === null) return
      e.preventDefault()
      setSize(axis, v); saveLayout()
      if (drawerOpen && axis === 'x') requestAnimationFrame(renderAll)
    })
  }

  // ---------- zoom and pan
  const stage = $('stage'), inner = $('stage-in')
  // The office floor in 3D when the page has three.js and WebGL; without them,
  // or when the GPU drops the context, the flat office stays (and is the one
  // the built file always shows).
  let W3 = null
  try {
    W3 = typeof office3d === 'function' && typeof OFFICE_CHARACTERS === 'object' ? office3d({
      esc, digits, calm, characters: OFFICE_CHARACTERS, crowd: crowdPills,
      // the office strip (company) over the top of the floor; the legend waits behind the ? (1.2)
      pad: { top: CO ? 104 : 8, bottom: 8 },
      onPick: (id, p) => { if (p && p.selKey) { sel = { key: p.selKey }; remember(); renderAll() } },
      onView: (v) => { view3[(CO ? officeId : '') || 'office'] = v; if (hashIsCurrent()) remember(); /* a late camera report must not pull the address back after the person left */ const z = $('zoomv'); if (z && W3) z.textContent = digits(W3.zoomPct()) + T('%') },
      onLost: () => { W3 = null; stage.classList.remove('w3on'); renderAll() },
    }) : null
  } catch (e) { W3 = null }
  if (W3) { W3.mount(stage); window.__office3d = W3 }
  const w3on = () => !!W3 && mode === 'office'
  const Z_MIN = 0.5, Z_MAX = 4
  let SW = 1060, SH = 716, fitK = 1
  function measure() { SW = stage.clientWidth; SH = stage.clientHeight; fitK = Math.max(0.05, Math.min(SW / 1060, SH / 716)) }
  // Labels grow and shrink with the office only between 85% and 130% of
  // their real size; past that they counter-scale and stay readable.
  const labelScale = () => { const s = fitK * view.z; return Math.min(1.3, Math.max(0.85, s)) / s }
  function clampView() {
    view.z = Math.min(Z_MAX, Math.max(Z_MIN, view.z))
    const s = fitK * view.z
    // the office may slide past an edge by at most 30% of itself or the stage,
    // so it can never be pushed out of sight
    const lim = (S, c, v) => {
      const slack = 0.3 * Math.min(S, c), base = (S - c) / 2
      return Math.min(Math.max(0, S - c) + slack - base, Math.max(Math.min(0, S - c) - slack - base, v))
    }
    view.x = lim(SW, 1060 * s, view.x); view.y = lim(SH, 716 * s, view.y)
  }
  let viewQueued = false, relayoutT = 0, easeT = 0, rememberT = 0
  function applyView(ease) {
    if (w3on()) { $('zoomv').textContent = digits(W3.zoomPct()) + T('%'); return }
    clampView()
    if (ease && !calm()) { inner.classList.add('ease'); clearTimeout(easeT); easeT = setTimeout(() => inner.classList.remove('ease'), 240) }
    clearTimeout(rememberT); rememberT = setTimeout(() => { if (hashIsCurrent()) remember() }, 400)
    if (viewQueued) return
    viewQueued = true
    requestAnimationFrame(() => {
      viewQueued = false
      const s = fitK * view.z
      inner.style.transform = 'translate(' + ((SW - 1060 * s) / 2 + view.x).toFixed(1) + 'px,' + ((SH - 716 * s) / 2 + view.y).toFixed(1) + 'px) scale(' + s.toFixed(4) + ')'
      inner.style.setProperty('--bs', labelScale().toFixed(3))
      $('zoomv').textContent = digits(Math.round(view.z * 100)) + T('%')
      // how crowded the labels are depends on their size: lay them out again once the zoom settles
      if (Math.abs(labelScale() - bubK) / bubK > 0.04) { clearTimeout(relayoutT); relayoutT = setTimeout(renderAll, 220) }
    })
  }
  function zoomAt(mx, my, f, ease) {
    const s = fitK * view.z
    const tx = (SW - 1060 * s) / 2 + view.x, ty = (SH - 716 * s) / 2 + view.y
    const z2 = Math.min(Z_MAX, Math.max(Z_MIN, view.z * f)), s2 = fitK * z2
    // keep the office point under the cursor where it is
    view = { z: z2, x: mx - (mx - tx) * s2 / s - (SW - 1060 * s2) / 2, y: my - (my - ty) * s2 / s - (SH - 716 * s2) / 2 }
    applyView(ease)
  }
  stage.addEventListener('wheel', (e) => {
    e.preventDefault()
    if (w3on()) { W3.zoomBy(Math.exp(-Math.max(-60, Math.min(60, e.deltaY)) * 0.0016)); return }
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? SH : 1
    const dx = e.deltaX * unit, dy = e.deltaY * unit
    // a sideways swipe (touchpad, or Shift+wheel) pans; everything else zooms.
    // A touchpad pinch arrives as Ctrl+wheel in small steps, hence its larger factor.
    if (!e.ctrlKey && Math.abs(dx) > Math.abs(dy)) { view.x -= dx; applyView(); return }
    const r = stage.getBoundingClientRect()
    zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-Math.max(-60, Math.min(60, dy)) * (e.ctrlKey ? 0.008 : 0.0016)))
  }, { passive: false })

