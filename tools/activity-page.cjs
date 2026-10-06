/* The Activity screen: who did what and when, newest first, grouped by day.
 *
 * Two sources, and the screen says which is which:
 *   - company/activity.jsonl, the lines the CLI and the dashboard write for
 *     every company change (budgets, pauses, the org chart, budget alerts),
 *     sent with the company as COMPANY.activity;
 *   - the history derived from the run records, gates and decisions already
 *     in DATA: runs started and finished, questions asked, answered and
 *     dismissed, decisions taken. These are marked "derived" and never
 *     written anywhere.
 *
 * activityView is never run in Node: like companyViews its source is written
 * into the page, so it must use only what the browser has.
 */

const ACTIVITY_STYLE = `
.act{overflow:auto;scrollbar-width:thin;scrollbar-color:#2A3644 transparent;flex:1;min-height:0}
.act h3{font:600 11px var(--mono);letter-spacing:.8px;text-transform:uppercase;color:var(--ink-dim);margin:14px 0 6px;position:sticky;top:0;background:var(--ground);padding:4px 0;z-index:1}
.act ol{list-style:none;margin:0;padding:0}
.act li{display:grid;grid-template-columns:52px 120px 1fr auto;gap:10px;align-items:baseline;padding:6px 8px;border-top:1px solid var(--line);font-size:12.5px;color:var(--ink-soft)}
.act li time{font:12px var(--mono);color:var(--ink-dim);direction:ltr}
.act li .who{font:600 12px var(--mono);color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;direction:ltr;text-align:start}
.act li .what b{color:var(--ink);font-weight:600}
.act li .k{font:10.5px var(--mono);padding:0 5px;border-radius:3px;border:1px solid var(--line);color:var(--ink-dim);white-space:nowrap}
.act li .k.der{border-style:dashed}
.act li.t-budget .k,.act li.t-company .k{color:var(--gate);border-color:var(--gate-line)}
.act li.t-gate .k{color:var(--warn)}
.act li.bad .what{color:var(--bad)}
.act .more{margin:12px 0 4px}
`

function activityView(h) {
  const { esc, fa, hhmm, ms, T, cleanTask } = h
  const st = { who: '', type: '', days: 7 }
  const DAY = 86400000

  /** Every event, newest first: { at, who, whoKind, type, text, derived, bad, officeId }. */
  function events(S) {
    const out = []
    const push = (e) => { if (!isNaN(e.at)) out.push(e) }
    for (const r of S.all) {
      if (!isNaN(r.start)) push({ at: r.start, who: r.agent, whoKind: 'agent', type: 'run', text: T('started') + ': ' + cleanTask(r.task), derived: true, officeId: r.officeId })
      push({ at: r.end, who: r.agent, whoKind: 'agent', type: 'run', text: T('handed in') + ' (' + T(STATUS_WORD[r.status] || 'No issues') + '): ' + cleanTask(r.task), derived: true, bad: r.status === 'failed', officeId: r.officeId })
    }
    for (const a of S.active) push({ at: a.start, who: a.agent, whoKind: 'agent', type: 'run', text: T('started') + ': ' + cleanTask(a.task) + ' · ' + T('working now'), derived: true, officeId: a.officeId })
    for (const g of DATA.gates || []) {
      const q = String(g.label || g.question || '')
      push({ at: ms(g.askedAt), who: 'supervisor', whoKind: 'supervisor', type: 'gate', text: T('asked') + ' (' + g.kind + '): ' + q, derived: true, officeId: g.officeId })
      if (g.status === 'answered') push({ at: ms(g.answeredAt), who: g.by === 'user' ? T('You') : g.by || T('You'), whoKind: 'board', type: 'gate', text: T('answered') + ' «' + String(g.answer || '') + '»: ' + q, derived: true, officeId: g.officeId })
      if (g.status === 'expired') push({ at: ms(g.expiredAt || g.updatedAt), who: T('You'), whoKind: 'board', type: 'gate', text: T('dismissed') + ': ' + q, derived: true, officeId: g.officeId })
    }
    for (const d of DATA.decisions || []) {
      const who = d.by === 'agent' ? d.agent || T('agent') : d.by === 'user' ? T('You') : 'supervisor'
      push({ at: ms(d.at), who, whoKind: d.by === 'agent' ? 'agent' : d.by === 'user' ? 'board' : 'supervisor', type: 'decision', text: (d.state === 'open' ? T('open question') + ': ' : T('decided') + ': ') + String(d.text || ''), derived: true })
    }
    const co = typeof COMPANY !== 'undefined' && COMPANY && COMPANY.configured ? COMPANY.activity || [] : []
    for (const l of co) {
      const actor = String(l.actor || '')
      const whoKind = actor === 'board' ? 'board' : actor === 'supervisor' ? 'supervisor' : actor === 'system' ? 'system' : 'agent'
      push({ at: ms(l.at), who: actor === 'board' ? T('You') : actor.replace(/^agent:/, ''), whoKind, type: /^budget/.test(l.action) ? 'budget' : 'company', text: String(l.summary || l.action || ''), derived: false, bad: /violation|hardstop/.test(l.action), officeId: l.officeId || '', via: l.via })
    }
    return out.sort((a, b) => b.at - a.at)
  }
  const STATUS_WORD = { ok: 'No issues', findings: 'Has findings', failed: 'Failed', stopped: 'Stopped' }
  const KIND = { run: 'run', gate: 'gate', decision: 'decision', budget: 'budget', company: 'company' }

  function render(S) {
    const all = events(S)
    const pass = (e) => (!st.who || e.whoKind === st.who) && (!st.type || e.type === st.type || (st.type === 'company' && e.type === 'budget'))
    const shown = all.filter(pass)
    const d0 = new Date(); d0.setHours(0, 0, 0, 0)
    const since = d0.getTime() - (st.days - 1) * DAY
    const recent = shown.filter((e) => e.at >= since)
    const older = shown.length - recent.length
    const chip = (key, val, label) => '<button type="button" class="fchip" data-aflt="' + key + '|' + val + '" aria-pressed="' + (st[key] === val) + '">' + label + '</button>'
    let html = '<div class="fbar"><h2>' + T('Activity') + '</h2>' +
      chip('who', '', T('Everyone')) + chip('who', 'board', T('You')) + chip('who', 'supervisor', T('Supervisor')) + chip('who', 'agent', T('Agents')) + chip('who', 'system', T('System')) +
      '<span class="dim" style="margin-inline-start:12px"></span>' +
      chip('type', '', T('Everything')) + chip('type', 'run', T('Runs')) + chip('type', 'gate', T('Questions')) + chip('type', 'decision', T('Decisions')) + chip('type', 'company', T('Company & budgets')) + '</div>'
    html += '<p class="muted">' + T('Newest first. Lines marked “derived” are read from the run records, questions and decisions; the others are the company log (company/activity.jsonl).') + '</p>'
    html += '<div class="act" id="act">'
    if (!recent.length) html += '<p class="empty">' + T('Nothing recorded in these days.') + '</p>'
    let day = ''
    for (const e of recent) {
      const d = new Date(e.at)
      const key = d.toDateString()
      if (key !== day) {
        if (day) html += '</ol>'
        day = key
        html += '<h3>' + esc(d.toLocaleDateString(LANG === 'fa' ? 'fa-IR' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' })) + '</h3><ol>'
      }
      html += '<li class="t-' + KIND[e.type] + (e.bad ? ' bad' : '') + '"><time>' + hhmm(e.at) + '</time><span class="who" title="' + esc(e.who) + '">' + esc(e.who === 'supervisor' ? T('Supervisor') : e.who) + '</span>' +
        '<span class="what">' + esc(e.text) + '</span><span class="k' + (e.derived ? ' der' : '') + '">' + T(e.type === 'budget' ? 'budget' : e.type === 'company' ? 'company' : e.type) + (e.derived ? ' · ' + T('derived') : '') + '</span></li>'
    }
    if (day) html += '</ol>'
    if (older) html += '<p class="more"><button type="button" class="fchip" data-amore="1">' + T('Show 7 more days') + ' (' + fa(older) + T(' older') + ')</button></p>'
    return html + '</div>'
  }

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-aflt],[data-amore]')
    if (!t) return
    if (t.dataset.amore) st.days += 7
    else { const [k, v] = t.dataset.aflt.split('|'); st[k] = v }
    h.redraw()
  })

  return { render, st }
}

module.exports = { ACTIVITY_STYLE, activityView }
