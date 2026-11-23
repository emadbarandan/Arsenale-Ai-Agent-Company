/* The "Version run" page: what an autonomous version run is doing.
 *
 * It reads and shows; it writes nothing and starts nothing. The one write is
 * the owner's answer to a gate, through the dashboard's existing answer box
 * (api/answer), so the rules for answering stay in one place.
 *
 * Sources (spec autonomous-mode section 7):
 *   <data>/version-runs/*.json   the mirror records (runlog.versionRun);
 *   the run log                  tokens per phase (runlog.versionLedger),
 *                                and the agents running now (DATA.active);
 *   DATA.gates / DATA.decisions  the live state the page already holds.
 * `load()` serves the first two as GET api/version-runs; the view puts the
 * rest together. N runs are N columns and N sets of rows, never merged.
 *
 * versionRunView is never run in Node: like activityView its source is
 * written into the page, so it uses only what the browser has plus `h`.
 */
const fs = require('fs')
const path = require('path')

/** Every version run with its token ledger, oldest first. A record that
 *  cannot be read is skipped; a ledger that fails reads as "not recorded". */
function load() {
  const P = require('./paths.cjs')
  const L = require('./runlog.cjs')
  let names = []
  try { names = fs.readdirSync(P.VERSION_RUNS) } catch { /* no run yet */ }
  const runs = []
  for (const n of names) {
    if (!/^[\w.-]+\.json$/.test(n)) continue
    const file = path.join(P.VERSION_RUNS, n)
    let rec
    try { rec = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { continue }
    if (!rec || typeof rec !== 'object' || !rec.id) continue
    let ledger = { phases: [], tokens: null }
    try { ledger = L.versionLedger(rec.id) } catch { /* not recorded */ }
    // the mirror has no start time of its own: its file's birth time stands in
    let born = ''
    try { born = fs.statSync(file).birthtime.toISOString() } catch { /* unknown */ }
    runs.push(Object.assign({}, rec, { startedAt: rec.startedAt || born, ledger }))
  }
  return { runs: runs.sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt))) }
}

/** Lays the Live page's percent (overall and per phase) over the records, so
 *  both pages show the same numbers. The mirror file never stores them. */
function withLive(data, liveRuns) {
  const by = new Map((liveRuns || []).map((v) => [v.id, v]))
  for (const r of data.runs) {
    const v = by.get(r.id)
    if (!v) continue
    r.percent = v.percent
    const ph = new Map((v.phases || []).map((p) => [p.id, p]))
    r.phases = (r.phases || []).map((p) => (ph.has(p.id) ? Object.assign({}, p, { percent: ph.get(p.id).percent }) : p))
  }
  return data
}

const VR_STYLE = `
.vr{overflow:auto;flex:1;min-height:0;display:grid;gap:14px;align-content:start;padding-bottom:20px}@supports not selector(::-webkit-scrollbar){.vr{scrollbar-width:thin;scrollbar-color:#C9D1D9 transparent}}
.vr .v-card{background:var(--panel);border:1px solid var(--line);border-radius:3px;min-width:0}
.vr .v-card>h3{margin:0;padding:7px 12px;font:700 11px var(--font-ui);text-transform:uppercase;letter-spacing:.6px;color:var(--ink-dim);border-bottom:1px solid var(--line);display:flex;justify-content:space-between;gap:10px}
.vr h1{font-size:16px;margin:0}
.vr table{width:100%;border-collapse:collapse}
.vr th{text-align:left;font-weight:400;color:var(--ink-dim);font-size:11px;padding:5px 10px;border-bottom:1px solid var(--line);white-space:nowrap}
.vr td{padding:6px 10px;border-bottom:1px solid #EDF0F3;vertical-align:middle}
.vr tr:last-child td{border-bottom:0}
.vr .n{text-align:right;font-variant-numeric:tabular-nums}
.vr .dim{color:var(--ink-dim)}
.vr .tx{unicode-bidi:plaintext;text-align:start}
.vr .bl{border-left:1px solid var(--line)}
.vr .v-mono{font-family:Consolas,monospace;font-size:12px}
.vr .vchip{display:inline-block;border:1px solid var(--line);padding:1px 7px;border-radius:3px;font-size:11px;background:#fff;white-space:nowrap;color:var(--ink-soft)}
.vr .vchip.run{color:var(--accent);border-color:#9AD3BE;background:#E8F6F0}
.vr .vchip.wait{color:var(--warn);border-color:#E6C48A;background:#FDF4E3}
.vr .vchip.bad{color:var(--bad);border-color:#E8A9A4;background:#FCECEA}
.vr .vchip.sup{color:#6B55B0}.vr .vchip.usr{color:#2563EB}.vr .vchip.ag{color:var(--cyan)}
.vr .v-sq{display:inline-block;width:8px;height:8px;margin-right:5px;background:currentColor}
.vr .v-gates{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}
.vr .v-gate{padding:9px 12px;display:grid;gap:6px;align-content:start;border-left:1px solid var(--line)}
.vr .v-gate:first-child{border-left:0}
.vr .v-row{display:flex;gap:8px;align-items:center;justify-content:space-between}
.vr .ansbox{padding:0}
.vr .pair{display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:14px;align-items:start}
.vr .v-hd{padding:12px;display:flex;gap:16px;align-items:center;flex-wrap:wrap}
.vr .v-kv{display:grid}.vr .v-kv span:first-child{font-size:11px;color:var(--ink-dim)}
.vr .v-pad{padding:12px;border-top:1px solid var(--line)}
.vr .big{font-size:20px;font-weight:700}
.vr .v-bar{height:8px;background:#E6EAEE;border-radius:2px;min-width:60px;flex:1}
.vr .v-bar i{display:block;height:100%;background:var(--accent);border-radius:2px}
.vr .v-bar i.g{background:#9AA5B1}
.vr .v-gauge{height:18px;background:#E6EAEE;position:relative;border-radius:2px;display:flex;overflow:hidden}
.vr .v-gauge i{display:block;height:100%;border-right:1px solid #fff}
.vr .v-tick{position:absolute;top:0;bottom:0;width:0;border-left:2px solid var(--ink)}
.vr .v-gl{position:relative;height:16px;font-size:11px;color:var(--ink-dim);margin-top:3px}
.vr .v-gl span{white-space:nowrap;position:absolute;transform:translateX(-50%)}
.vr .v-legend{display:flex;gap:12px;flex-wrap:wrap;margin-top:6px;font-size:11px;color:var(--ink-soft)}
.vr .v-scroll{overflow:auto}
.fbar .v-sel{margin-left:auto;font-size:12px;color:var(--ink-dim);display:flex;gap:8px;align-items:center}
.fbar .v-sel select{font:12px var(--font-ui);color:var(--ink);background:var(--panel);border:1px solid var(--line);border-radius:3px;padding:3px 6px}
.vr .empty{color:var(--ink-dim);padding:16px;margin:0}
.vr .empty code{background:var(--panel-raised);border:1px solid var(--line);padding:1px 6px;border-radius:3px}
`

function versionRunView(h) {
  const { esc, T, ms } = h
  const st = { data: null, error: false, supOnly: false, at: 0, busy: false, sel: '' }
  const SEG = ['#0C8A62', '#1F7A8C', '#6B55B0', '#B8720F', '#2563EB', '#8A5A44', '#66727F']

  // Not part of the 1.5 s state poll: read when the page is opened and every
  // 3 s while it is the one showing. A built file has no server to ask.
  function fetchRuns() {
    if (!h.live() || st.busy) return
    st.busy = true
    fetch('api/version-runs', { cache: 'no-store', credentials: 'same-origin' })
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json() })
      .then((d) => { st.data = d; st.error = false }, () => { st.error = true })
      .then(() => { st.busy = false; if (h.shown()) h.redraw() })
  }
  function watch() {
    if (Date.now() - st.at > 3000) { st.at = Date.now(); fetchRuns() }
  }

  const label = (r) => (r ? (r.app || r.id) + (r.version ? ' ' + r.version : '') : '—')
  const ago = (t) => {
    const s = Math.max(0, Math.round((Date.now() - t) / 1000))
    return s < 60 ? s + ' s' : s < 3600 ? Math.round(s / 60) + ' min' : Math.floor(s / 3600) + ' h ' + String(Math.round((s % 3600) / 60)).padStart(2, '0') + ' m'
  }
  const kfmt = (n) => (n >= 1e6 ? String(+(n / 1e6).toFixed(2)) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n))
  const phaseClass = (s) => (/merged|done/.test(s) ? 'run' : /block/.test(s) ? 'bad' : /gating|fixing|wait/.test(s) ? 'wait' : '')
  const statusClass = (s) => (s === 'running' || s === 'done' ? 'run' : s === 'blocked' || s === 'stopped' ? 'bad' : s === 'waiting for owner' ? 'wait' : '')

  function gauge(r) {
    const total = r.ledger && r.ledger.tokens
    const budget = Number(r.budget) || 0
    if (!budget) return '<p class="dim" style="margin:0">' + T('No budget set') + (total ? ' · ' + kfmt(total) + ' ' + T('tokens used') : '') + '</p>'
    if (total === null || total === undefined) return '<p class="dim" style="margin:0">' + T('Tokens not recorded') + ' · ' + T('budget') + ' ' + kfmt(budget) + '</p>'
    const pct = Math.round(total / budget * 100)
    const tone = pct >= 100 ? 'var(--bad)' : pct >= 80 ? 'var(--warn)' : 'var(--accent)'
    const state = pct >= 100 ? '<span class="vchip bad">' + T('budget reached, no new agents') + '</span>' : pct >= 80 ? '<span class="vchip wait">' + T('warning at 80 %') + '</span>' : '<span class="vchip run">' + T('within budget') + '</span>'
    // one segment per phase, scaled to the whole budget; the sum stops at the bar's end
    let left = 100
    const phases = (r.ledger.phases || []).filter((p) => p.tokens)
    const segs = phases.map((p, i) => {
      const w = Math.min(left, p.tokens / budget * 100)
      left -= w
      return '<i title="' + esc(p.phase + ': ' + kfmt(p.tokens)) + '" style="width:' + w.toFixed(2) + '%;background:' + SEG[i % SEG.length] + '"></i>'
    }).join('')
    const key = phases.map((p, i) => '<span><span class="v-sq" style="color:' + SEG[i % SEG.length] + '"></span>' + esc(p.phase) + ' ' + kfmt(p.tokens) + '</span>').join('')
    return '<div class="v-row" style="margin-bottom:6px"><span><span class="big" style="color:' + tone + '">' + pct + ' %</span> <span class="dim">' + kfmt(total) + ' ' + T('of') + ' ' + kfmt(budget) + ' ' + T('tokens') + '</span></span>' + state + '</div>' +
      '<div class="v-gauge" role="img" aria-label="' + pct + ' % ' + T('of the token budget') + '">' + segs + '<span class="v-tick" style="left:80%"></span><span class="v-tick" style="right:0"></span></div>' +
      '<div class="v-gl"><span style="left:0;transform:none">0</span><span style="left:80%">80 % ' + T('warn') + '</span><span style="left:100%;transform:translateX(-100%)">100 % ' + T('stop') + '</span></div>' +
      (key ? '<div class="v-legend">' + key + '</div>' : '')
  }

  function header(r) {
    const t = ms(r.startedAt), u = ms(r.updatedAt)
    return '<div class="v-card"><div class="v-hd"><h1 class="tx" dir="auto">' + esc(label(r)) + '</h1><span class="vchip ' + statusClass(r.status) + '">' + esc(r.status) + '</span>' +
      '<div class="v-kv"><span>' + T('Elapsed') + '</span><span>' + (isNaN(t) ? '—' : ago(t)) + '</span></div>' +
      '<div class="v-kv"><span>' + T('Updated') + '</span><span>' + (isNaN(u) ? '—' : ago(u) + ' ' + T('ago')) + '</span></div>' +
      (r.percent === null || r.percent === undefined ? '' : '<div class="v-kv"><span>' + T('Overall') + '</span><span><b>' + Math.round(r.percent) + ' %</b></span></div>') +
      '<div class="v-kv"><span>' + T('Branch') + '</span><span class="v-mono tx" dir="auto">' + esc(r.integrationBranch || '—') + '</span></div></div>' +
      '<div class="v-pad">' + gauge(r) + '</div></div>'
  }

  function phaseCells(r, p, sep) {
    const bl = sep ? ' bl' : ''
    if (!p) return '<td class="dim' + bl + '" colspan="4">—</td>'
    const tok = ((r.ledger && r.ledger.phases) || []).find((x) => x.phase === p.id)
    const pct = Math.round(Number(p.percent) || 0)
    return '<td class="' + bl.trim() + '"><b class="tx" dir="auto">' + esc(p.name || p.id) + '</b> <span class="dim">' + esc(p.tier || '') + '</span></td>' +
      '<td><div class="v-row" style="justify-content:flex-start"><div class="v-bar"><i class="' + (/block/.test(p.status) || !pct ? 'g' : '') + '" style="width:' + pct + '%"></i></div><b class="n" style="width:36px">' + pct + '%</b></div></td>' +
      '<td><span class="vchip ' + phaseClass(p.status) + '">' + esc(p.status) + '</span></td>' +
      '<td class="n">' + (tok && tok.tokens ? kfmt(tok.tokens) : '<span class="dim" title="' + T('Not recorded') + '">—</span>') + '</td>'
  }
  function compare(runs) {
    const rows = Math.max.apply(null, runs.map((r) => r.phases.length).concat(1))
    const head = '<tr><th rowspan="2">#</th>' + runs.map((r, i) => '<th colspan="4" class="' + (i ? 'bl' : '') + '">' + esc(label(r)) + '</th>').join('') + '</tr><tr>' +
      runs.map((r, i) => '<th class="' + (i ? 'bl' : '') + '">' + T('Phase') + '</th><th style="width:15%">' + T('Complete') + '</th><th>' + T('State') + '</th><th class="n">' + T('Tokens') + '</th>').join('') + '</tr>'
    let body = ''
    for (let i = 0; i < rows; i++) body += '<tr><td class="dim">' + (i + 1) + '</td>' + runs.map((r, j) => phaseCells(r, r.phases[i], j > 0)).join('') + '</tr>'
    return '<div class="v-card"><h3>' + T('Phases') + '<span>' + T('percent of requests merged') + '</span></h3><div class="v-scroll"><table>' + head + body + '</table></div></div>'
  }

  function gatesCard(runs) {
    const by = new Map(runs.map((r) => [r.id, r]))
    const open = (DATA.gates || []).filter((g) => g.status === 'waiting' && by.has(g.versionRun)).sort((a, b) => String(a.askedAt).localeCompare(String(b.askedAt)))
    if (!open.length) return '<div class="v-card"><h3>' + T('Waiting for you') + '<span>' + T('nothing') + '</span></h3></div>'
    return '<div class="v-card"><h3>' + T('Waiting for you') + '<span>' + open.length + '</span></h3><div class="v-gates">' + open.map((g) => {
      const waited = ms(g.askedAt)
      return '<div class="v-gate"><div class="v-row"><span class="vchip wait">' + esc(g.label || g.kind) + '</span><span class="dim">' + esc(label(by.get(g.versionRun))) + (isNaN(waited) ? '' : ' · ' + ago(waited)) + '</span></div>' +
        '<b class="tx" dir="auto">' + esc(g.question) + '</b>' + h.answerBox(g) + '</div>'
    }).join('') + '</div></div>'
  }

  function agentsCard(runs, S0) {
    const by = new Map(runs.map((r) => [r.id, r]))
    const act = S0.active.filter((a) => by.has(a.versionRun))
    const html = '<div class="v-card"><h3>' + T('Current agents') + '<span>' + act.length + ' ' + T('running') + '</span></h3>'
    if (!act.length) return html + '<p class="empty">' + T('No agent is running for these runs.') + '</p></div>'
    let rows = ''
    for (const a of act) {
      const r = by.get(a.versionRun)
      const ph = r.phases.find((p) => p.id === a.phase)
      const step = a.steps && a.steps.length ? a.steps[a.steps.length - 1].text : a.doing
      rows += '<tr><td>' + esc(label(r)) + '</td><td><b>' + esc(a.agent) + '</b></td><td class="tx" dir="auto">' + esc(ph ? ph.name || ph.id : a.phase || '—') + '</td>' +
        '<td class="dim tx" dir="auto">' + esc(a.task || '') + '</td><td class="dim">' + esc(a.model || '—') + '</td><td class="tx" dir="auto">' + esc(step || '—') + '</td><td class="n">' + (isNaN(a.start) ? '—' : ago(a.start)) + '</td></tr>'
    }
    return html + '<div class="v-scroll"><table><tr><th>' + T('Run') + '</th><th>' + T('Agent') + '</th><th>' + T('Phase') + '</th><th>' + T('Task') + '</th><th>' + T('Model') + '</th><th>' + T('Step') + '</th><th class="n">' + T('Time') + '</th></tr>' + rows + '</table></div></div>'
  }

  // A decision belongs to a run when its run or project field names the run id.
  function decisionsCard(runs) {
    const ids = new Set(runs.map((r) => r.id))
    const mine = (DATA.decisions || []).filter((d) => ids.has(d.run) || ids.has(d.project)).sort((a, b) => String(a.at).localeCompare(String(b.at)))
    const num = new Map(mine.map((d, i) => [d.id, i + 1]))
    const shown = mine.filter((d) => !st.supOnly || d.by === 'supervisor').reverse()
    const KIND = { supervisor: ['sup', 'Supervisor', ''], user: ['usr', 'Owner', 'transform:rotate(45deg)'], agent: ['ag', 'Agent', 'border-radius:50%'] }
    const html = '<div class="v-card"><h3>' + T('Decisions, newest first') + '<button type="button" class="fchip" data-vrsup="1" aria-pressed="' + st.supOnly + '">' + T('Supervisor only') + '</button></h3>'
    if (!shown.length) return html + '<p class="empty">' + T('No decisions recorded.') + '</p></div>'
    let rows = ''
    for (const d of shown) {
      const k = KIND[d.by] || KIND.agent
      const run = runs.find((r) => r.id === d.run || r.id === d.project)
      rows += '<tr><td class="v-mono">D' + num.get(d.id) + '</td><td>' + esc(label(run)) + '</td><td><span class="vchip ' + k[0] + '"><span class="v-sq" style="' + k[2] + '"></span>' + T(k[1]) + '</span></td>' +
        '<td><b class="tx" dir="auto">' + esc(d.text) + '</b>' + (d.reason ? '<br><span class="dim tx" dir="auto">' + esc(d.reason) + '</span>' : '') + '</td><td><span class="vchip">' + (d.state === 'open' ? T('open') : T('taken')) + '</span></td></tr>'
    }
    return html + '<div class="v-scroll"><table><tr><th>ID</th><th>' + T('Run') + '</th><th>' + T('By') + '</th><th>' + T('Decision and reason') + '</th><th>' + T('Status') + '</th></tr>' + rows + '</table></div></div>'
  }

  // Read from the record's optional "reviews" list: { phase, round, findings,
  // confirmed, rejected, unclear, report }. The report path is shown as text;
  // a file is never opened from here.
  function reviewsCard(runs) {
    const list = []
    for (const r of runs) for (const v of Array.isArray(r.reviews) ? r.reviews : []) list.push({ r, v })
    list.sort((a, b) => (Number(b.v.round) || 0) - (Number(a.v.round) || 0))
    const html = '<div class="v-card"><h3>' + T('Review reports') + '</h3>'
    if (!list.length) return html + '<p class="empty">' + T('No review has run yet.') + '</p></div>'
    let rows = ''
    for (const { r, v } of list) {
      const ph = r.phases.find((p) => p.id === v.phase)
      rows += '<tr><td>' + esc(label(r)) + '</td><td class="tx" dir="auto">' + esc(ph ? ph.name || ph.id : v.phase || '—') + '</td><td class="n">' + esc(v.round) + '</td><td class="n">' + esc(v.findings) + '</td>' +
        '<td>' + [v.confirmed, v.rejected, v.unclear].map((x) => esc(x == null ? '—' : x)).join(' / ') + '</td><td class="v-mono dim tx" dir="auto">' + esc(v.report || '') + '</td></tr>'
    }
    return html + '<div class="v-scroll"><table><tr><th>' + T('Run') + '</th><th>' + T('Phase') + '</th><th class="n">' + T('Rnd') + '</th><th class="n">' + T('Findings') + '</th><th>' + T('Conf / rej / unclear') + '</th><th>' + T('Report') + '</th></tr>' + rows + '</table></div></div>'
  }

  // Decision A24: side by side while at most two runs are active; beyond that
  // one run at a time, chosen here. The default is the run with an open gate,
  // then the newest.
  const isActive = (r) => !/^(done|stopped|empty)$/.test(r.status)
  function pick(all) {
    if (all.filter(isActive).length <= 2) return { runs: all, selector: '' }
    const waiting = new Set((DATA.gates || []).filter((g) => g.status === 'waiting').map((g) => g.versionRun))
    const dflt = all.filter((r) => waiting.has(r.id)).pop() || all[all.length - 1]
    const cur = all.find((r) => r.id === st.sel) || dflt
    const selector = '<label class="v-sel">' + T('Run') + ' <select data-vrsel="1" aria-label="' + T('Run') + '">' +
      all.map((r) => '<option value="' + esc(r.id) + '"' + (r.id === cur.id ? ' selected' : '') + '>' + esc(label(r)) + ' · ' + esc(r.status) + '</option>').join('') + '</select></label>'
    return { runs: [cur], selector }
  }

  function render(S0) {
    watch()
    const all = st.data ? st.data.runs.map((r) => Object.assign({}, r, { phases: Array.isArray(r.phases) ? r.phases : [] })) : []
    const shownRuns = pick(all)
    const runs = shownRuns.runs
    const head = '<div class="fbar"><h2>' + T('Version run') + '</h2>' + shownRuns.selector + '</div>'
    if (!runs.length) {
      const known = st.data || st.error || !h.live()
      return head + '<div class="vr"><div class="v-card"><p class="empty">' + (known
        ? T('No version run yet. Start one from the repo of the app:') + ' <code>arsenale autonomous start &lt;version&gt;</code>'
        : T('Loading…')) + '</p></div></div>'
    }
    return head + '<div class="vr" id="vr">' + gatesCard(all) /* a question of a run not selected must not hide */ +
      '<div class="pair">' + runs.map(header).join('') + '</div>' +
      compare(runs) + agentsCard(runs, S0) +
      '<div class="pair">' + decisionsCard(runs) + reviewsCard(runs) + '</div></div>'
  }

  document.addEventListener('change', (e) => {
    const sel = e.target.closest && e.target.closest('[data-vrsel]')
    if (!sel) return
    st.sel = sel.value
    h.redraw()
  })
  document.addEventListener('click', (e) => {
    if (!e.target.closest('[data-vrsup]')) return
    st.supOnly = !st.supOnly
    h.redraw()
  })

  return { render, st, fetchRuns }
}

module.exports = { VR_STYLE, versionRunView, load, withLive }
