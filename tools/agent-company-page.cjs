/* The company screens of the dashboard: the campus (one building per office),
 * the org chart, the strip over an office floor, and the budget dialog.
 *
 * companyViews is never run in Node: like controlRoom and officeClient its
 * source is written into the page, so it must not use anything Node has. It
 * reads COMPANY (from agent-company.cjs companyState(), refreshed from
 * api/company) and the run state the office already derived.
 *
 * Every edit is a request: it is saved in company/ and the supervisor reads it
 * at its next turn (log-agent-run.cjs --inbox). Nothing here starts, stops or
 * pauses an agent.
 */

const COMPANY_STYLE = `
.board.rail-mini{--rw:56px}
.board.rail-mini .mini-rail{display:flex}
.board.rail-mini .rail{display:none;box-shadow:-12px 0 32px rgba(30,40,50,.14);z-index:30}
.board.rail-mini.rail-open .rail{display:block}
.board.rail-mini .rail h2 .x{display:inline-block}
h1.co{white-space:nowrap;font-size:17px}
.brand-b{font:700 10px var(--font-ui);color:var(--accent);border:1px solid var(--accent-line);padding:1px 5px;border-radius:3px;margin-inline-start:8px;vertical-align:3px;white-space:nowrap}
.views .omenu-wrap{position:relative;display:flex}
.omenu{position:fixed;z-index:40;background:var(--panel);border:1px solid #C3CCD5;border-radius:4px;padding:4px;min-width:220px;box-shadow:0 8px 24px rgba(30,40,50,.14)}
.omenu button{display:flex;gap:8px;align-items:center;width:100%;text-align:start;font:12.5px var(--font-ui);color:var(--ink-soft);background:none;border:0;padding:6px 8px;border-radius:3px;cursor:pointer}
.omenu button:hover,.omenu button[aria-current=true]{background:var(--panel-raised);color:var(--ink)}
.sq{display:inline-block;width:10px;height:10px;flex:none}
.cv{position:absolute;left:0;right:var(--rw);top:52px;bottom:0;overflow:hidden}
.cv[hidden]{display:none}
.cbtn{font:700 12px var(--font-ui);border:1px solid var(--line);background:#F6F8FA;color:var(--ink);border-radius:4px;padding:4px 10px;cursor:pointer;white-space:nowrap}
.cbtn.go{color:var(--accent);border-color:var(--accent-line);background:var(--accent-soft)}
.cbtn.ok{background:var(--accent);color:#FFFFFF;border-color:var(--accent)}
.cbtn.sm{font-size:11px;padding:1px 7px;font-weight:700}
.cbtn.armed{background:var(--gate);color:#1D2530;border-color:var(--gate)}
.cbtn:disabled{opacity:.45;cursor:default}
.ch{font:700 11px var(--font-ui);letter-spacing:.8px;text-transform:uppercase;color:var(--ink-dim);margin:0 0 8px;display:flex;gap:8px;align-items:center}
.ch .sp{flex:1}
/* campus: the map, its cards and its zoom bar are WORLD_STYLE in office-world.cjs */
.cside{width:380px;flex:none;border-inline-start:1px solid var(--line);background:var(--panel);padding:16px 18px;overflow-y:auto;scrollbar-width:thin;scrollbar-color:#C9D1D9 transparent}
.ckpis{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px}
.ckpi{border:1px solid var(--line);border-radius:5px;padding:8px 10px;background:var(--panel-raised);min-width:0}
.ckpi b{display:block;font:700 20px var(--font-ui);color:#111A24;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ckpi b small{font-size:11px;font-weight:700}
.ckpi span{font-size:11.5px;color:var(--ink-dim);display:block}
.ckpi.cw b{color:var(--warn)}.ckpi.cg b{color:var(--ok)}
.cmaster{display:flex;gap:8px;align-items:center;font-size:12px;color:var(--ink-soft);margin:0 0 14px;flex-wrap:wrap}
.cmaster b{color:var(--ink)}
.cmaster .off{color:var(--warn)}
.orow{display:grid;grid-template-columns:10px 1fr auto;gap:2px 10px;padding:9px 0;border-top:1px solid var(--line);align-items:center}
.orow .sq{grid-row:1 / span 2}
.orow .on{font:700 13px var(--font-ui);color:var(--ink);background:none;border:0;padding:0;text-align:start;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.orow .on:hover{color:#111A24;text-decoration:underline dotted}
.orow .ct{font:12px var(--font-ui);color:var(--ink-soft);white-space:nowrap;direction:ltr}
.orow .ct u{text-decoration:none;color:var(--ok)}.orow .ct s{text-decoration:none;color:var(--warn)}
.orow .bw{grid-column:2 / span 2;display:flex;gap:8px;align-items:center;font-size:11px;color:var(--ink-dim)}
.orow .bw .cbar{flex:1}
.cbar{height:6px;background:#E3E8ED;border-radius:1px;position:relative;min-width:40px;direction:ltr}
.cbar i{display:block;height:100%;max-width:100%}
.cbar b{position:absolute;top:-2px;bottom:-2px;width:1px;background:#6C7886}
.num{font-family:var(--font-ui);font-variant-numeric:tabular-nums}
.cfeed{margin:0 0 14px;padding:0;list-style:none;font-size:12.5px;color:var(--ink-soft)}
.cfeed li{padding:6px 0;border-top:1px solid var(--line);display:flex;gap:8px}
.cfeed time{font-family:var(--font-ui);color:var(--ink-dim);flex:none;width:40px}
.cfeed b{font-family:var(--font-ui);color:var(--ink);font-weight:700}
.cfeed li>span{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.cnote{font-size:11.5px;color:var(--ink-dim);margin:0 0 10px}
.cnote code{font-family:var(--font-ui);color:var(--ink)}
.cbanner{margin:0 0 12px;padding:8px 10px;border:1px solid var(--gate-line);background:var(--warn-bg);border-radius:4px;font-size:12px;color:var(--ink)}
.cbanner code{font-family:var(--font-ui)}
.csetup{position:absolute;inset:40px;display:flex;align-items:center;justify-content:center}
.csetup div{max-width:560px;background:var(--panel);border:1px dashed #C3CCD5;border-radius:6px;padding:22px 26px;font-size:13px;color:var(--ink-soft)}
.csetup h2{margin:0 0 8px;font-size:16px;color:var(--ink)}
.csetup code{font-family:var(--font-ui);color:var(--cyan);direction:ltr;display:inline-block}
/* office strip, over the floor */
.board.co .zoombar{left:auto;right:12px}
#vtab-office{max-width:170px;overflow:hidden;text-overflow:ellipsis}
.board.co .counts{gap:12px}
.board.co .top{gap:14px}
.ohead{max-width:calc(100% - 350px)}
.crumb{flex-wrap:nowrap}
.ohead{position:absolute;left:14px;top:10px;z-index:3;display:flex;flex-direction:column;gap:6px;pointer-events:none}
.ohead>*{pointer-events:auto}
.crumb{display:flex;align-items:center;gap:10px;font-size:13px;flex-wrap:wrap}
.crumb button{font:13px var(--font-ui);color:var(--ink-dim);background:none;border:0;padding:0;cursor:pointer}
.crumb button:hover{color:var(--ink)}
.crumb b{font-size:16px;color:#111A24}
.ostats{display:flex;gap:6px;flex-wrap:wrap}
.ostats div{background:rgba(255,255,255,.94);border:1px solid var(--line);border-radius:5px;padding:4px 10px;font-size:11.5px;color:var(--ink-dim);min-width:64px}
.ostats b{display:block;font:700 15px var(--font-ui);color:var(--ink);white-space:nowrap}
.ostats .a b{color:var(--ok)}.ostats .b b{color:var(--warn)}.ostats .r b{color:var(--bad)}
.tag.away{font-family:var(--font-ui);background:#E8EEF5;border-style:dashed;color:var(--ink-soft)}
.ovf{position:absolute;transform:translate(0,-100%) scale(var(--bs,1));transform-origin:0 100%;background:rgba(255,255,255,.94);border:1px solid var(--gate-line);border-radius:3px;padding:4px 8px;font:11.5px var(--font-ui);color:var(--ink-soft);z-index:2;max-width:260px}
.ovf b{color:var(--gate)}
.ovf button{font:11px var(--font-ui);color:var(--cyan);background:none;border:0;padding:0 3px;cursor:pointer;text-decoration:underline dotted}
.chip.despite{color:var(--bad);border-color:rgba(200,55,45,.45);background:var(--bad-bg)}
/* org chart */
.org{padding:14px 20px 40px;height:100%;overflow:auto;scrollbar-width:thin;scrollbar-color:#C9D1D9 transparent;position:relative}
.otools{display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap}
.otools h2{font-size:16px;margin:0;color:#111A24}
.otools .sp{flex:1}
.ochip{font-size:11.5px;padding:2px 7px;border:1px solid var(--line);border-radius:4px;background:#F1F4F7;color:var(--ink-soft);white-space:nowrap}
.olvl{display:flex;flex-direction:column;align-items:center}
.node{display:flex;gap:10px;align-items:center;background:var(--panel-raised);border:1px solid var(--line);border-radius:6px;padding:7px 10px;position:relative;text-align:start;min-width:0}
.node.big{min-width:320px;padding:10px 14px}
.node .nm{font:700 13px var(--font-ui);color:#111A24;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;direction:ltr;text-align:start}
.node .tt{font-size:11.5px;color:var(--ink-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.node .meta{display:flex;gap:6px;margin-top:4px;align-items:center;flex-wrap:wrap}
.node .mid{min-width:0;flex:1}
.node .rt{margin-inline-start:auto;text-align:end;min-width:92px;flex:none}
.node .rt .num{font-size:11px;color:var(--ink-soft);display:block;margin-top:4px;white-space:nowrap}
.node .rt .cbar{margin-top:4px}
.node.nboard{border-color:rgba(37,99,235,.5)}.node.nceo{border-color:rgba(107,85,176,.5)}
.node.retired{opacity:.55;border-style:dashed}
.node .portrait{display:block}
.vl{width:1px;height:16px;background:#C3CCD5}
.bus{height:1px;background:#C3CCD5;width:75%}
.ocols{display:grid;gap:14px;width:100%}
.ocol{position:relative;padding-top:16px;min-width:0}
.ocol:before{content:"";position:absolute;left:50%;top:0;width:1px;height:16px;background:#C3CCD5}
.ocolh{font:11px var(--font-ui);color:var(--ink-dim);display:flex;flex-wrap:wrap;justify-content:space-between;gap:2px 6px;padding:6px 2px 4px}
.ocolh b{color:var(--ink)}
.node.head{border-top:3px solid var(--c);width:100%}
.oemps{margin:0;margin-inline-start:22px;padding:0;list-style:none;border-inline-start:1px solid #C3CCD5}
.oemps li{position:relative;padding-top:8px}
.oemps li:before{content:"";position:absolute;inset-inline-start:0;top:30px;width:14px;height:1px;background:#C3CCD5}
.oemps .node{margin-inline-start:14px}
.mdlc{font:11px var(--font-ui);padding:1px 6px;border:1px solid rgba(31,122,140,.3);border-radius:4px;color:#2F7F8A;background:rgba(31,122,140,.07);white-space:nowrap}
.pill{display:inline-flex;align-items:center;gap:4px;font-size:11px;padding:0 6px;border-radius:4px;white-space:nowrap;border:1px solid}
.pill .g{font-family:var(--font-ui);font-weight:700;min-width:0}
.pill.working{color:var(--ok);border-color:var(--accent-line);background:var(--accent-soft)}
.pill.quiet,.pill.waiting{color:var(--warn);border-color:rgba(217,140,30,.4);background:var(--warn-bg)}
.pill.idle,.pill.away{color:var(--ink-soft);border-color:var(--line);background:rgba(106,118,131,.1)}
.pill.paused{color:var(--bad);border-color:rgba(200,55,45,.4);background:var(--bad-bg)}
.alert{font:10px var(--font-ui);padding:0 4px;border-radius:2px;white-space:nowrap}
.alert.s{color:var(--warn);border:1px solid rgba(217,140,30,.5)}.alert.h{color:var(--bad);border:1px solid rgba(200,55,45,.5)}
.ocont{margin-top:18px}
.ocont .chips{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}
.oft{display:flex;gap:18px;font-size:12px;color:var(--ink-dim);margin-top:18px;flex-wrap:wrap}
.oft i{display:inline-block;width:9px;height:9px;margin-inline-end:6px}
.oft .t{display:inline-block;width:1px;height:10px;background:#6C7886;margin-inline-end:6px}
/* the org chart since 1.0: you, your assistant, one coloured column per office */
.org{padding:26px 40px 40px;background:radial-gradient(ellipse at 50% 0%,#F7F8FA 0,var(--ground) 60%)}
.org .otools{align-items:flex-start;margin-bottom:6px}
.org .otools h2{font-size:28px;color:#111A24;line-height:1.2}
.org .osub{margin:4px 0 0;font-size:14.5px;color:var(--ink-soft)}
.org .osub .ochip{font-size:inherit;padding:0;border:0;background:none;color:var(--ink-soft)}
.org .ochip.w{color:var(--warn);border-color:rgba(217,140,30,.4);background:var(--warn-bg);padding:0 6px}
.onode{display:flex;gap:14px;align-items:center;width:400px;max-width:100%;padding:12px 20px;border:1px solid var(--accent-line);border-radius:10px;background:var(--panel)}
.onode.asst{border-color:#CBD3DB}
.onode b{display:block;font-size:16px;color:#111A24}
.onode span{font-size:13px;color:var(--ink-soft)}
.onode .av{line-height:0;flex:none}
.olink{height:38px;position:relative;width:100%;display:flex;justify-content:center}
.olink i{width:2px;height:100%;background:var(--accent);display:block}
.olink span{position:absolute;inset-inline-start:calc(50% + 14px);top:10px;font:12px var(--font-ui);color:var(--ink-dim)}
.obus{width:calc(100% - (100% / var(--n)));height:2px;background:#CBD3DB;display:flex;justify-content:space-between;margin:0 auto}
.obus i{width:9px;height:9px;margin-top:-3.5px;display:block}
.org .ocols{gap:16px;margin-top:0}
.org .ocol{padding-top:30px}
.org .ocol:before{top:0;height:30px;width:2px;background:#CBD3DB}
.org .ocolh{font:700 15px var(--font-ui);color:#F3F5F7;border-radius:10px 10px 0 0;padding:11px 16px;align-items:center;flex-wrap:wrap}
/* a name keeps a fixed width and ends in an ellipsis; the numbers give way first */
.org .ocolh b{color:#F3F5F7;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:0 1 auto;min-width:100px}
.org .ocolh .ocnt{font:700 11px var(--font-ui);background:rgba(30,40,50,.12);color:#F3F5F7;border-radius:9px;padding:1px 8px;flex:none}
.ompl{list-style:none;margin:0;padding:10px 14px;border:1px solid var(--line);border-top:0;border-radius:0 0 10px 10px;background:var(--panel)}
.opr{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.opr.retired{opacity:.55}
.opb{flex:1 1 150px;min-width:150px;display:flex;gap:12px;align-items:center;padding:7px 2px;background:none;border:0;cursor:pointer;text-align:start;font:inherit;color:inherit;border-radius:6px}
.opb:hover:not(:disabled) b{text-decoration:underline dotted}
.opb:disabled{cursor:default}
/* what each person costs this month: model, tokens or the budget, its bar */
/* model, cost and Budget… move under the name together when the column is narrow */
.oside{flex:none;margin-inline-start:auto;display:flex;align-items:center;gap:6px}
.ost{flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:2px;max-width:46%;text-align:end}
.ost .ostl{display:flex;gap:4px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
.ost .num{font-size:12px;color:var(--ink-soft);font-variant-numeric:tabular-nums;white-space:nowrap}
.ost .cbar{width:90px}
/* the budget line never gets cut: it takes a line of its own under the name and the count */
.org .ocolh .ocsp{order:3;flex:1 0 100%;font:400 13px var(--font-ui);color:#F3F5F7;opacity:.95;margin:2px 0 0;white-space:nowrap;font-variant-numeric:tabular-nums}
.org .ocolh .ocnt{margin-inline-start:auto}
.oav{position:relative;border-radius:8px;padding:5px 7px 0;line-height:0;flex:none}
.oav i{position:absolute;inset-inline-end:-3px;bottom:-2px;width:10px;height:10px;border-radius:50%;border:2px solid var(--panel)}
.otx{min-width:0}
.otx b{display:block;font-size:14.5px;color:#111A24;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.otx span{display:block;font-size:13px;color:var(--ink-soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.onone{font-size:13px;color:var(--ink-dim);padding:8px 2px}
.oready{display:flex;align-items:center;gap:18px;margin-top:34px;padding:16px 24px;border:1px dashed #CBD3DB;border-radius:10px;font-size:14px;color:var(--ink-soft);flex-wrap:wrap}
.oready b{color:#111A24}
.oready .ic{color:var(--ink-dim);line-height:0}
.oready .cbtn{margin-inline-start:auto}
/* the budget dialog */
.cdlg-back{position:fixed;inset:0;background:rgba(30,40,50,.28);z-index:60;display:flex;align-items:center;justify-content:center}
.cdlg-back[hidden]{display:none}
.cdlg{width:400px;background:var(--panel);border:1px solid #C3CCD5;border-radius:6px;padding:16px 18px;box-shadow:0 16px 40px rgba(30,40,50,.14);font-size:12.5px}
.cdlg h3{margin:0 0 2px;font-size:15px;color:#111A24}
.cdlg .sub{color:var(--ink-dim);margin:0 0 12px;font-size:12px}
.cdlg label{display:block;margin:0 0 10px;color:var(--ink-soft)}
.cdlg label.ck{display:flex;gap:8px;align-items:flex-start}
.cdlg input[type=text]{display:block;width:100%;margin-top:3px;font:13px var(--font-ui);color:var(--ink);background:var(--ground);border:1px solid #C3CCD5;border-radius:3px;padding:4px 8px;direction:ltr}
.cdlg input:focus{outline:1px solid var(--accent)}
.cdlg .hint{display:block;font-size:11px;color:var(--ink-dim);margin-top:2px}
.cdlg .row{display:flex;gap:8px;justify-content:flex-end;margin-top:14px}
.cdlg .msg{font-size:12px;margin-top:8px}
.cdlg .msg.err{color:var(--bad)}.cdlg .msg.ok{color:var(--ok)}
`

function companyViews(h) {
  const { esc, digits, hhmm, ms, T, k, usd, errTxt, portrait, sprite, post, redraw, go, refresh } = h
  const QUIET_MS = 10 * 60000
  const st = { armed: '', armT: 0, retired: false, dlg: null, busy: false, mmsg: '', side: false }
  // the campus is drawn, zoomed and panned by the shared art (office-world.cjs); this file says what is on it
  const CA = campusArt({ esc, digits, go, post, refresh, redraw })
  window.__campus = CA
  const ST_COL = CA.ST_COL
  const C = () => COMPANY
  const canEdit = () => LIVE && !!ANSWER_TOKEN && !C().readOnly
  const officeList = () => C().offices.filter((o) => !o.archived)
  const officeById = (id) => C().offices.find((o) => o.id === id) || null
  const emp = (id) => C().employees.find((e) => e.id === id) || null
  const oname = (o) => (!o ? '' : o.builtIn ? T(o.name) : o.name)
  const etitle = (e) => e.title || ''
  const periodTxt = (key) => String(key || '')
  // file diagnostics from the server are English sentences around a file name
  const problemTxt = (p) => {
    let m = /^(.+?)( is missing or unreadable| is not a list| is not an object)$/.exec(p)
    if (m) return m[1] + T(m[2])
    m = /^project (.+) names an unknown office "(.*)"$/.exec(p)
    if (m) return T('project ') + m[1] + T(' names an unknown office ') + '«' + m[2] + '»'
    return p
  }
  // a count of zero is shown as a dash (owner rule); a measurement such as a percent keeps its zero
  const nz = (n) => (n ? digits(n) : '—')
  const pctTxt = (p) => (p === null || p === undefined ? '—' : digits(Math.min(999, Math.round(p))) + T('%'))

  /** Spend as "1.24M tok · $3.20". USD that needs a missing price is "USD
   *  n/a"; a sum that misses some runs says so. */
  function money(sp) {
    if (!sp) return ''
    // each part isolated, so "$0" stays "$0" inside other text
    const tok = '<bdi>' + k(sp.tokens) + ' ' + T('tok') + '</bdi> · '
    // nothing measured is not "$0": like every unpriced sum it is n/a
    if (sp.usdStatus === 'none') return tok + '<bdi dir="ltr">' + T('USD n/a') + '</bdi>'
    if (sp.usdStatus === 'na') return tok + '<bdi dir="ltr" class="dim" title="' + T('Model prices are not set in model-prices.json') + '">' + T('USD n/a') + '</bdi>'
    return tok + '<bdi dir="ltr">' + usd(sp.usd) + (sp.usdStatus === 'partial' ? '<span class="dim" title="' + digits(sp.usdMissing) + T(' runs have tokens but no price') + '">+</span>' : '') + '</bdi>'
  }
  /** The budget bar, with the alert threshold as a tick; nothing at all when
   *  the budget is off, so a switched-off budget never looks like a limit. */
  function bar(b) {
    if (!b || !b.on || b.pct === null) return ''
    const c = b.level === 'stop' || b.level === 'over' ? '#C8372D' : b.level === 'soft' ? '#0F2E28' : '#0C8A62'
    return '<div class="cbar" role="img" aria-label="' + esc(pctTxt(b.pct) + T(' of budget')) + '"><i style="width:' + Math.min(100, b.pct).toFixed(1) + '%;background:' + c + '"></i><b style="left:' + b.softAlertPct + '%"></b></div>'
  }
  /** "1.2M / 2M tok" or "$3.20 / $10" for a budget that is on. */
  function limitTxt(b) {
    if (!b || !b.on) return ''
    const parts = []
    if (b.tokens) parts.push(k(b.tokens.used) + ' / ' + k(b.tokens.limit) + ' ' + T('tok'))
    if (b.usd) parts.push(b.usd.status === 'na' ? T('USD n/a') + ' / ' + usd(b.usd.limit) : usd(b.usd.used) + ' / ' + usd(b.usd.limit))
    return parts.join(' · ')
  }
  function budgetWord(b) {
    if (!C().company.budgetsEnabled) return T('Budgets off')
    if (!b || b.level === 'none') return T('No budget set')
    if (b.level === 'off') return T('Budget off')
    return T('Monthly budget')
  }
  const editBtn = (scope, id, label) => (canEdit() ? '<button type="button" class="cbtn sm" data-budget="' + esc(scope + '|' + id) + '">' + esc(label || T('Budget…')) + '</button>' : '')

  // ---------- who is where, right now
  function counts(S, officeId) {
    const act = S.active.filter((a) => a.officeId === officeId)
    const people = new Set(act.map((a) => a.agent))
    const quiet = new Set(act.filter((a) => a.stale).map((a) => a.agent))
    const waiting = (DATA.gates || []).filter((g) => g.status === 'waiting' && g.officeId === officeId).length
    const today = S.today.filter((r) => r.officeId === officeId).length
    return { working: people.size, quiet: [...quiet].filter((a) => !act.some((x) => x.agent === a && !x.stale)).length, waiting, today, runs: act }
  }
  /** An employee's state as seen from one office (or the company when
   *  officeId is empty). Pauses and hard stops win over everything. */
  function empStatus(S, id, officeId) {
    const e = emp(id)
    if (e && (e.status === 'paused' || (e.standing && e.standing.budget && e.standing.budget.level === 'stop'))) return 'paused'
    const runs = S.active.filter((a) => a.agent === id)
    const here = officeId ? runs.filter((a) => a.officeId === officeId) : runs
    if (here.length) return here.every((a) => a.stale) ? 'quiet' : 'working'
    if (runs.length) return 'away'
    const waiting = (DATA.gates || []).some((g) => g.status === 'waiting' && g.run && S.byId.get(g.run) && S.byId.get(g.run).agent === id && (!officeId || g.officeId === officeId))
    return waiting ? 'waiting' : 'idle'
  }
  const STATUS_TXT = { working: 'Working', quiet: 'Quiet', waiting: 'Waiting', paused: 'Paused', idle: 'Idle', away: 'Away' }
  const STATUS_G = { working: '▸', quiet: '◷', waiting: '!', paused: '×', idle: '·', away: '→' }
  const pill = (s) => '<span class="pill ' + s + '"><span class="g">' + STATUS_G[s] + '</span>' + T(STATUS_TXT[s]) + '</span>'

  /** The office's view of the run state: only what resolves to it. */
  function scope(S, officeId) {
    const keep = (r) => r.officeId === officeId
    const active = S.active.filter(keep)
    const today = S.today.filter(keep)
    const busy = new Map()
    for (const a of active) { const l = busy.get(a.agent) || []; l.push(a); busy.set(a.agent, l) }
    for (const l of busy.values()) l.sort((a, b) => b.lastAt - a.lastAt)
    return Object.assign({}, S, { active, today, busy, lastRun: today[today.length - 1] || null, full: S })
  }

  /** Desks on one office floor (spec R15-R18): home employees at their own
   *  desk, visitors at a free desk of their zone, then a guest desk, then the
   *  overflow card. Home employees working elsewhere leave an empty chair. */
  function desks(S, officeId, geo) {
    const { DEPTS, HOME, GUEST } = geo
    const desks = new Map()
    desks.away = []; desks.overflow = []
    const office = officeById(officeId)
    desks.lead = office && office.leadEmployeeId ? office.leadEmployeeId : ''
    const taken = {}
    const place = (name, zone) => {
      const d = DEPTS[zone]
      if (!d) return null
      const own = Object.prototype.hasOwnProperty.call(HOME, name) ? HOME[name] : null
      let i = own && own[0] === zone && !taken[zone + own[1]] ? own[1] : -1
      if (i < 0) {
        // keep the slots of the zone's regular owners free while others are left
        const reserved = new Set(Object.values(HOME).filter((h) => h[0] === zone).map((h) => h[1]))
        i = d.slots.findIndex((_, j) => !taken[zone + j] && !reserved.has(j))
        if (i < 0) i = d.slots.findIndex((_, j) => !taken[zone + j])
      }
      if (i < 0) return null
      taken[zone + i] = 1
      return d.slots[i]
    }
    const full = S.full || S
    for (const e of C().employees) {
      if (e.kind !== 'employee' || e.homeOfficeId !== officeId || e.id === desks.lead || e.id === 'supervisor') continue
      const slot = place(e.id, e.zone)
      if (!slot) continue
      desks.set(e.id, slot)
      const elsewhere = full.active.find((a) => a.agent === e.id && a.officeId !== officeId)
      if (elsewhere && !S.busy.has(e.id)) desks.away.push({ agent: e.id, desk: slot, officeId: elsewhere.officeId })
    }
    let g = 0
    for (const [agent] of S.busy) {
      if (desks.has(agent) || agent === desks.lead) continue
      const e = emp(agent)
      const slot = e && e.kind === 'employee' ? place(agent, e.zone) : null
      if (slot) desks.set(agent, slot)
      else if (g < GUEST.length) desks.set(agent, GUEST[g++])
      else desks.overflow.push(agent)
    }
    return desks
  }

  // ---------- the campus
  function windowsOf(S, officeId) {
    // who has a window in an office building: the home staff, and visitors
    // while they work there; busiest first, so the top floor shows the work
    const order = { working: 0, quiet: 1, waiting: 2, paused: 3, idle: 4, away: 5 }
    const ids = new Set(C().employees.filter((e) => e.kind === 'employee' && e.homeOfficeId === officeId).map((e) => e.id))
    for (const a of S.active) if (a.officeId === officeId) ids.add(a.agent)
    return [...ids].map((id) => ({ id, s: empStatus(S, id, officeId) })).sort((a, b) => order[a.s] - order[b.s] || a.id.localeCompare(b.id))
  }

  function campus(S) {
    // the layout is the server's (campus.cjs); an older server sends none, and the offices are then laid out in a row-by-row grid
    let cp = C().campus
    if (!cp) {
      const list = officeList().filter((o) => !o.builtIn)
      const cols = 3
      cp = { grid: { cols, rows: Math.max(4, Math.ceil(list.length / cols)) }, buildings: list.map((o, i) => ({ id: 'b-' + o.id, officeId: o.id, type: 'business', x: i % cols, y: Math.floor(i / cols), rot: 0, floors: 1 })), types: [], readOnly: true }
    }
    const cardOf = (o, small) => {
      const c = counts(S, o.id)
      const sd = o.standing || {}
      return {
        id: o.id, name: oname(o), color: o.color || '#8A97A6', small, kind: small ? 'shed' : '', wins: small ? [] : windowsOf(S, o.id),
        label: oname(o) + T(', ') + digits(c.working) + ' ' + T('working'),
        // the card: the name, who works and what waits; tokens, the budget and the way in open on hover or focus
        sign: '<h3 title="' + esc(oname(o)) + '"><i class="sw" aria-hidden="true"></i>' + esc(oname(o)) + '</h3>' +
          '<div class="n">' + (c.working ? '<span class="a"><i class="sdot ok" aria-hidden="true"></i><b>' + digits(c.working) + '</b> ' + T('working') + '</span>' : '') + (c.waiting ? '<span class="b"><i class="sdot warn" aria-hidden="true"></i><b>' + digits(c.waiting) + '</b> ' + T('waiting') + '</span>' : '') + (!c.working && !c.waiting ? '<span class="z">' + T('Nobody at work') + '</span>' : '') + '</div>' +
          '<div class="more">' + (small ? '' : '<div class="c">' + money(sd.spend) + T(' this month') + (sd.budget && sd.budget.on ? ' · ' + pctTxt(sd.budget.pct) + T(' of budget') : '') + '</div>' + bar(sd.budget)) +
          (c.quiet ? '<div class="c">' + digits(c.quiet) + ' ' + T('quiet') + '</div>' : '') +
          '<button type="button" class="cbtn go" data-goto="office:' + esc(o.id) + '">' + T('Enter office →') + '</button></div>',
      }
    }
    const cells = cp.buildings.map((b) => officeById(b.officeId)).filter(Boolean).map((o) => cardOf(o, false))
    // work no project claims sits in a shed on its own plot, on a free lot
    const un = officeById('unassigned')
    const unC = counts(S, 'unassigned')
    if (un && (unC.working || unC.today || unC.waiting)) cells.push(cardOf(un, true))
    // visitors: a figure at the door for each employee working away from home
    const visitors = []
    for (const a of S.active) {
      const e = emp(a.agent)
      if (!e || !e.homeOfficeId || e.homeOfficeId === a.officeId) continue
      visitors.push({ officeId: a.officeId, draw: (x, y) => sprite('stand', a.agent, x, y, 2) })
    }
    const legend = '<div class="cleg"><span>' + T('Windows on the top floors: one per employee') + '</span><span><i style="background:' + ST_COL.working + '"></i>' + T('working') + '</span><span><i style="background:' + ST_COL.waiting + '"></i>' + T('waiting') + '</span><span><i style="background:' + ST_COL.paused + '"></i>' + T('paused') + '</span><span><i style="background:' + ST_COL.idle + '"></i>' + T('idle') + '</span></div>'
    const tip = '<div class="ctip">' + T('Lavender kiosk = ') + '<b>' + T('Supervisor desk') + '</b>. ' + T('Click a building to enter.') + '</div>'
    // the company's name over the campus; the month's numbers in one chip, which opens the company panel
    const co = C(), sd = co.standing
    const people = co.employees.filter((e) => e.kind === 'employee' && e.status !== 'retired').length
    const atWork = new Set(S.active.map((a) => a.agent)).size
    const title = '<div class="ctitle"><h2>' + esc(co.company.name || T('Your company')) + '</h2><p>' + digits(officeList().filter((o) => !o.builtIn).length) + ' ' + T('offices') + ' · ' + digits(people) + ' ' + T('people') + ' · <b>' + digits(atWork) + ' ' + T('at work now') + '</b></p></div>'
    const month = '<button type="button" class="cmonth" data-cside="1" aria-expanded="' + st.side + '"><b>' + T('This month') + '</b> · ' + k(sd.spend.tokens) + (sd.budget.on && sd.budget.tokens ? T(' tokens of ') + k(sd.budget.tokens.limit) : ' ' + T('tokens')) + (sd.spend.usdStatus === 'none' || sd.spend.usdStatus === 'na' ? ' · ' + T('USD n/a') : ' · ' + usd(sd.spend.usd)) + '<span class="cm-act">' + T(st.side ? 'Hide details' : 'Details') + '</span></button>'
    return CA.draw({ campus: cp, cells, canEdit: canEdit() && !!cp.types.length, hq: { id: hqId(), lit: !ceoAway(), label: T('Supervisor desk') }, visitors, legend, tip, side: side(S), title, month, sideOpen: st.side })
  }
  const hqId = () => { const o = officeList().find((x) => x.leadEmployeeId === 'supervisor') || officeList()[0]; return o ? o.id : 'unassigned' }
  const ceoAway = () => { const hb = C().heartbeat; return !hb || !hb.lastSeenAt || Date.now() - ms(hb.lastSeenAt) > 30 * 60000 }

  function side(S) {
    const co = C()
    const sd = co.standing
    const waitingAll = (DATA.gates || []).filter((g) => g.status === 'waiting').length
    const working = new Set(S.active.map((a) => a.agent)).size
    let html = '<aside class="cside" aria-label="' + T('Company summary') + '">'
    if (co.readOnly) html += '<p class="cbanner">' + T('Company data was written by a newer dashboard (v') + digits(co.schemaVersion) + T('). Editing is disabled.') + '</p>'
    else if (!LIVE) html += '<p class="cbanner">' + T('Open from the live server to edit.') + '</p>'
    for (const p of co.problems || []) html += '<p class="cbanner">' + esc(problemTxt(p)) + '</p>'
    html += '<div class="ch">' + T('Company this month') + ' <span class="dim">' + esc(periodTxt(co.periodKey)) + '</span></div>'
    html += '<div class="ckpis"><div class="ckpi cw"><b>' + nz(waitingAll) + '</b><span>' + T('waiting for you') + '</span></div>' +
      '<div class="ckpi cg"><b>' + nz(working) + '</b><span>' + T('working now') + '</span></div>' +
      '<div class="ckpi"><b dir="ltr">' + k(sd.spend.tokens).replace(/(\s?[^\d.\s]+)$/, '<small>$1</small>') + '</b><span>' + (sd.budget.on && sd.budget.tokens ? T('tokens of ') + k(sd.budget.tokens.limit) : T('tokens this month')) + '</span></div></div>'
    html += '<p class="cnote">' + money(sd.spend) + (sd.spend.unmeasured ? ' · ' + digits(sd.spend.unmeasured) + T(' runs unmeasured') : '') + (sd.budget.on ? ' · ' + T('company budget ') + pctTxt(sd.budget.pct) : '') + '</p>'
    if (sd.budget.on) html += bar(sd.budget) + '<p></p>'
    const on = co.company.budgetsEnabled
    const armed = st.armed === 'master'
    html += '<div class="cmaster">' + T('Budgets: ') + (on ? '<b>' + T('on') + '</b>' : '<b class="off">' + T('off — usage only, no alerts, no refusals') + '</b>') +
      (canEdit() ? '<button type="button" class="cbtn sm' + (armed ? ' armed' : '') + '" data-bmaster="' + (on ? 'off' : 'on') + '">' + (armed ? T('Click again to confirm') : on ? T('Turn off') : T('Turn on')) + '</button>' + editBtn('company', '', T('Company budget…')) : '') +
      (st.mmsg ? '<span class="ansmsg err" role="status">' + esc(st.mmsg) + '</span>' : '') + '</div>'
    html += '<div class="ch">' + T('Offices') + '</div>'
    for (const o of officeList()) {
      const c = counts(S, o.id)
      if (o.builtIn && !(c.working || c.today || c.waiting)) continue
      const b = o.standing.budget
      html += '<div class="orow"><span class="sq" style="background:' + esc(o.color) + '"></span><button type="button" class="on" data-goto="office:' + esc(o.id) + '">' + esc(oname(o)) + '</button>' +
        '<span class="ct"><u>▸' + digits(c.working) + '</u> &nbsp;<s>!' + digits(c.waiting) + '</s> &nbsp;' + money(o.standing.spend) + '</span>' +
        '<div class="bw"><span>' + budgetWord(b) + '</span>' + (b.on ? bar(b) + '<span class="num">' + pctTxt(b.pct) + '</span>' : '<span style="flex:1"></span>') + (o.builtIn ? '' : editBtn('office', o.id)) + '</div></div>'
    }
    html += '<div class="ch" style="margin-top:14px">' + T('Supervisor') + '</div>'
    const hb = co.heartbeat
    html += '<p class="cnote">' + (!hb || !hb.lastSeenAt ? T('Not seen yet: the supervisor stamps this with --answers or --heartbeat.')
      : (ceoAway() ? T('Away. Last seen ') : T('Active. Last seen ')) + '<span dir="ltr">' + hhmm(ms(hb.lastSeenAt)) + '</span>' + (ceoAway() ? T('. Requests are read when the supervisor is next active.') : '')) + '</p>'
    const feed = (DATA.decisions || []).filter((d) => ms(d.at) >= S.dayStart).slice(-4).reverse()
    if (feed.length) {
      html += '<div class="ch">' + T('Decisions today') + '</div><ul class="cfeed">' + feed.map((d) => '<li><time dir="ltr">' + hhmm(ms(d.at)) + '</time><span><b dir="ltr">' + esc(d.by === 'agent' ? d.agent || T('agent') : T(d.by === 'user' ? 'You' : 'Supervisor')) + '</b> ' + esc(String(d.text || '').slice(0, 120)) + '</span></li>').join('') + '</ul>'
    }
    const un = Object.entries(co.unmapped || {})
    if (un.length) html += '<p class="cnote">' + T('Project names this month that no project claims: ') + un.map(([n, c]) => '<code dir="ltr">' + esc(n) + '</code> ×' + digits(c)).join(T(', ')) + '</p>'
    return html + '</aside>'
  }

  // ---------- the strip over an office floor
  // `idleN`: the floor's own count when there is one (the 3D lounge), so the
  // strip and the lounge never disagree; without it, the company's home staff.
  function officeHead(S, officeId, idleN) {
    const o = officeById(officeId)
    if (!o) return ''
    const c = counts(S.full || S, officeId)
    const home = C().employees.filter((e) => e.kind === 'employee' && e.homeOfficeId === officeId)
    const idle = Number.isInteger(idleN) ? idleN : home.filter((e) => empStatus(S.full || S, e.id, officeId) === 'idle').length
    const sd = o.standing || {}
    const b = sd.budget
    return '<div class="crumb"><button type="button" data-goto="campus">' + T('Campus') + '</button><span class="dim">/</span><span class="sq" style="background:' + esc(o.color) + '"></span><b>' + esc(oname(o)) + '</b>' + '</div>' +
      '<div class="ostats"><div class="a"><b>' + nz(c.working) + '</b>' + T('working') + '</div><div class="b"><b>' + nz(c.waiting) + '</b>' + T('waiting for you') + '</div><div><b>' + nz(idle) + '</b>' + T('idle') + '</div>' +
      '<div><b dir="ltr">' + (sd.spend ? k(sd.spend.tokens) : '—') + '</b>' + T('tokens this month') + '</div>' +
      '<div><b dir="ltr">' + (!sd.spend || sd.spend.usdStatus === 'na' || sd.spend.usdStatus === 'none' ? T('n/a') : usd(sd.spend.usd)) + '</b>' + T('USD') + '</div>' +
      (b && b.on ? '<div class="' + (b.level === 'stop' || b.level === 'over' ? 'r' : b.level === 'soft' ? 'b' : '') + '"><b>' + pctTxt(b.pct) + '</b>' + T('monthly budget') + '</div>' : '<div><b>—</b>' + budgetWord(b) + '</div>') +
      (o.builtIn ? '' : '<div style="display:flex;align-items:center">' + editBtn('office', o.id) + '</div>') + '</div>'
  }

  // ---------- the org chart: you, your assistant, and one column per office
  // People are shown by name and job title, never by their file id; a member
  // opens their profile on the Team screen. Budgets, when they are on, keep
  // their "Budget…" button on each row.
  const ART = everyoneArt()
  const CLIENT_NAMES = { 'claude-desktop': 'Claude Desktop', 'claude-code': 'Claude Code', cursor: 'Cursor', vscode: 'VS Code', codex: 'Codex CLI', gemini: 'Gemini CLI', chatgpt: 'ChatGPT', other: 'Other' }
  const pname = (e) => e.name || etitle(e) || e.id
  const ptitle = (e) => (e.name && etitle(e) && e.name !== etitle(e) ? etitle(e) : '')
  function orgRow(S, e, o) {
    const s = empStatus(S, e.id, '')
    const dot = s === 'working' || s === 'quiet' ? '#0C8A62' : s === 'waiting' ? '#0F2E28' : s === 'paused' ? '#C8372D' : ''
    const budget = C().company.budgetsEnabled && e.kind === 'employee' ? editBtn('employee', e.id) : ''
    // this month's model, tokens or budget: the board reads what each person costs here
    const b = e.standing && e.standing.budget
    const sp = e.standing && e.standing.spend
    const al = b && b.on ? (b.level === 'stop' ? '<span class="alert h">' + T('HARD STOP') + '</span>' : b.level === 'over' ? '<span class="alert h">' + digits(100) + T('%') + '+</span>' : b.level === 'soft' ? '<span class="alert s">' + digits(b.softAlertPct) + T('%') + '+</span>' : '') : ''
    const num = b && b.on ? limitTxt(b) : sp && sp.tokens ? k(sp.tokens) + ' ' + T('tok') : ''
    const stat = e.kind === 'retired' || !(e.model || al || num) ? '' : '<span class="ost"><span class="ostl">' + (e.model ? '<span class="mdlc">' + esc(e.model) + '</span>' : '') + al + '</span>' + (num ? '<span class="num" dir="ltr">' + num + '</span>' : '') + bar(b) + '</span>'
    return '<li class="opr' + (e.kind === 'retired' ? ' retired' : '') + '"><button type="button" class="opb" data-ev="member-open" data-arg="' + esc(e.id) + '" data-to-team="1"' + (e.kind === 'retired' ? ' disabled' : '') + '><span class="oav" style="background:' + esc(ART.shade(o.color || '#56B6C2', 0.42)) + '">' + ART.person(e.id + (e.look ? ':' + e.look : ''), o.color, 30) + (dot ? '<i style="background:' + dot + '" title="' + esc(T(STATUS_TXT[s])) + '"></i>' : '') + '</span><span class="otx"><b dir="auto">' + esc(pname(e)) + '</b>' + (ptitle(e) || e.kind === 'retired' ? '<span dir="auto">' + esc(e.kind === 'retired' ? T('retired: definition file removed') : ptitle(e)) + '</span>' : '') + '</span></button>' + (stat || budget ? '<span class="oside">' + stat + budget + '</span>' : '') + '</li>'
  }

  function org(S) {
    const co = C()
    const offices = officeList().filter((o) => !o.builtIn)
    const people = co.employees.filter((e) => e.kind === 'employee' || (st.retired && e.kind === 'retired'))
    const staffN = people.filter((e) => e.kind === 'employee' && e.id !== 'supervisor').length
    const waitingAll = (DATA.gates || []).filter((g) => g.status === 'waiting').length
    const hb = co.heartbeat
    const away = ceoAway()
    const cname = co.company.name
    const asst = (co.company.assistants || []).map((a) => CLIENT_NAMES[a]).filter(Boolean)
    let html = '<div class="org"><div class="otools"><div><h2 dir="auto">' + esc(cname || T('Org chart')) + '</h2><p class="osub">' + T('Your AI team: ') + '<span class="ochip">' + digits(staffN) + ' ' + T('team members') + '</span> ' + T('in') + ' <span class="ochip">' + digits(offices.length) + ' ' + T(offices.length === 1 ? 'office' : 'offices') + '</span>. ' + T('They ask you first before anything leaves the computer.') + '</p></div><span class="sp"></span>' +
      '<button type="button" class="cbtn" data-retired="1" aria-pressed="' + st.retired + '">' + (st.retired ? T('Hide retired') : T('Show retired')) + '</button></div>'
    html += '<div class="olvl">'
    html += '<div class="onode own">' + ART.owner(36) + '<div><b>' + T('You') + '</b><span>' + T('Owner. Gives tasks and says yes or no.') + (waitingAll ? ' <span class="ochip w">' + digits(waitingAll) + ' ' + T('waiting for you') + '</span>' : '') + (co.company.budgetsEnabled && co.standing && co.standing.budget && co.standing.budget.on ? ' <span class="ochip">' + T('company budget ') + pctTxt(co.standing.budget.pct) + '</span>' : '') + '</span></div></div>'
    html += '<div class="olink"><i></i><span>' + T('gives tasks, answers questions') + '</span></div>'
    html += '<div class="onode asst">' + ART.robot(36) + '<div><b>' + T('Your assistant') + '</b><span>' + (asst.length ? esc(asst.join(T(', '))) + '. ' : '') + T('Takes on each role.') + ' · ' + (hb && hb.lastSeenAt ? (away ? T('last seen ') : T('active, last seen ')) + '<span dir="ltr">' + hhmm(ms(hb.lastSeenAt)) + '</span>' : T('not seen yet')) + '</span></div></div>'
    html += '<div class="olink"><i></i><span>' + T('hands each job to a team member') + '</span></div>'
    html += '<div class="obus" style="--n:' + Math.max(1, offices.length) + '">' + offices.map((o) => '<i style="background:' + esc(o.color) + '"></i>').join('') + '</div>'
    html += '<div class="ocols" style="grid-template-columns:repeat(' + Math.max(1, offices.length) + ',minmax(230px,1fr))">'
    for (const o of offices) {
      const staff = people.filter((e) => e.homeOfficeId === o.id && e.id !== 'supervisor')
      const head = o.leadEmployeeId && o.leadEmployeeId !== 'supervisor' ? staff.find((e) => e.id === o.leadEmployeeId) : null
      const rest = staff.filter((e) => !head || e.id !== head.id).sort((a, b) => pname(a).localeCompare(pname(b)))
      const ob = o.standing && o.standing.budget
      const otok = ob && ob.on ? limitTxt(ob) : o.standing && o.standing.spend && o.standing.spend.tokens ? k(o.standing.spend.tokens) + ' ' + T('tok') : ''
      html += '<div class="ocol"><div class="ocolh" style="background:' + esc(o.color) + '"><b dir="auto">' + esc(oname(o)) + '</b>' + (otok ? '<span class="ocsp" dir="ltr">' + otok + '</span>' : '') + '<span class="ocnt">' + digits(staff.length) + '</span></div><ul class="ompl">' + (head ? orgRow(S, head, o) : '') + rest.map((e) => orgRow(S, e, o)).join('') + (staff.length ? '' : '<li class="onone">' + T('No one works here yet.') + '</li>') + '</ul></div>'
    }
    html += '</div></div>'
    // the office packs not installed yet, read once from the server
    if (LIVE && st.packsLeft === undefined) { st.packsLeft = null; fetch('api/packs', { cache: 'no-store' }).then((r) => r.json()).then((d) => { st.packsLeft = (d.packs || []).filter((p) => !p.installed && !officeList().some((o) => p.office && o.id === p.office.id)).map((p) => p.name); redraw() }, () => { st.packsLeft = [] }) }
    const cons = co.employees.filter((e) => e.kind === 'contractor')
    if (cons.length) html += '<div class="ocont"><div class="ch">' + T('Contractors') + ' <span class="dim" style="text-transform:none;letter-spacing:0">' + T('agent names with no definition in the agent folders, this month') + '</span></div><div class="chips">' + cons.map((e) => '<span class="ochip" dir="ltr">' + esc(e.id) + ' ×' + digits(e.runsThisPeriod) + (e.standing && e.standing.spend && e.standing.spend.tokens ? ' · ' + k(e.standing.spend.tokens) + ' ' + T('tok') : '') + '</span>').join('') + '</div></div>'
    html += '<div class="oft"><span><i style="background:#0C8A62"></i>' + T('working') + '</span><span><i style="background:#0F2E28"></i>' + T('waiting for you') + '</span><span><i style="background:#C8372D"></i>' + T('paused or stopped by budget') + '</span>' +
      (co.company.budgetsEnabled ? '<span><span class="t"></span>' + T('tick on the bar = alert threshold') + '</span><span style="margin-inline-start:auto">' + T('Bar = this month’s spend against the budget') + '</span>' : '<span style="margin-inline-start:auto">' + T('Budgets are off: tokens this month only') + '</span>') + '</div>'
    if (LIVE && !(st.packsLeft && !st.packsLeft.length)) html += '<div class="oready"><span class="ic">' + ART.ic('box', 18) + '</span><b>' + T('Ready to add') + '</b>' + (st.packsLeft && st.packsLeft.length ? st.packsLeft.map((x) => '<span class="opk" dir="auto">' + esc(x) + '</span>').join('') : '<span class="dim">' + T('More offices in the Marketplace') + '</span>') + '<button type="button" class="cbtn" data-ev="goto-packs">' + T('Add an office') + '</button></div>'
    return html + '</div>'
  }

  // ---------- the budget dialog
  function openBudget(scopeId) {
    const [scope, id] = scopeId.split('|')
    const co = C()
    const cur = scope === 'company' ? co.company.budget : scope === 'office' ? (officeById(id) || {}).budget : (emp(id) || {}).budget
    const b = cur || { enabled: true, monthlyTokens: null, monthlyUsd: null, softAlertPct: 80, hardStop: false }
    const what = scope === 'company' ? T('the whole company') : scope === 'office' ? oname(officeById(id)) : id
    st.dlg = { scope, id }
    const val = (v) => (v === null || v === undefined ? '' : String(v))
    const box = document.getElementById('cdlg')
    box.innerHTML = '<form class="cdlg" data-bform="1" role="dialog" aria-modal="true" aria-labelledby="cdlg-h">' +
      '<h3 id="cdlg-h">' + T('Monthly budget — ') + '<span' + (scope === 'employee' ? ' dir="ltr"' : '') + '>' + esc(what) + '</span></h3>' +
      '<p class="sub">' + T('Counted per calendar month from logged runs.') + '</p>' +
      '<label class="ck"><input type="checkbox" name="enabled"' + (b.enabled ? ' checked' : '') + '> <span>' + T('Budget on') + '<span class="hint">' + T('Off keeps the numbers but shows usage only: no alerts, no refusals.') + '</span></span></label>' +
      '<label>' + T('Tokens per month') + '<input type="text" name="monthlyTokens" inputmode="numeric" autocomplete="off" value="' + esc(val(b.monthlyTokens)) + '" placeholder="2000000"><span class="hint">' + T('Empty = no limit. 0 = nothing may be spent. Cache reads are not counted.') + '</span></label>' +
      '<label>' + T('USD per month') + '<input type="text" name="monthlyUsd" inputmode="decimal" autocomplete="off" value="' + esc(val(b.monthlyUsd)) + '" placeholder="25.00"><span class="hint">' + (co.pricesSet ? T('From the prices in model-prices.json.') : T('Model prices are not set in model-prices.json: USD use shows n/a and cannot be checked.')) + '</span></label>' +
      '<label>' + T('Alert at (%)') + '<input type="text" name="softAlertPct" inputmode="numeric" autocomplete="off" value="' + esc(val(b.softAlertPct)) + '"></label>' +
      '<label class="ck"><input type="checkbox" name="hardStop"' + (b.hardStop ? ' checked' : '') + '> <span>' + T('Hard stop at 100%') + '<span class="hint">' + T('The supervisor then refuses to start agents here.') + '</span></span></label>' +
      '<div class="msg" id="cdlg-msg" role="status"></div>' +
      '<div class="row">' + (cur ? '<button type="button" class="cbtn" data-bclear="1">' + T('Remove budget') + '</button>' : '') + '<span style="flex:1"></span><button type="button" class="cbtn" data-bcancel="1">' + T('Cancel') + '</button><button type="submit" class="cbtn ok">' + T('Save') + '</button></div></form>'
    box.hidden = false
    const first = box.querySelector('input[name=monthlyTokens]')
    if (first) first.focus()
  }
  function closeBudget() {
    const box = document.getElementById('cdlg')
    box.hidden = true; box.innerHTML = ''; st.dlg = null
  }
  async function saveBudget(budget) {
    const msg = document.getElementById('cdlg-msg')
    if (!st.dlg || st.busy) return
    st.busy = true
    msg.className = 'msg'; msg.textContent = T('Sending…')
    try {
      await post('api/budget', { scope: st.dlg.scope, id: st.dlg.id, budget })
      msg.className = 'msg ok'; msg.textContent = T('Saved. The supervisor reads it at its next turn.')
      await refresh()
      setTimeout(() => { if (st.dlg) closeBudget(); redraw() }, 1200)
    } catch (e) {
      msg.className = 'msg err'; msg.textContent = T('Not saved: ') + restartHint(e.message)
    }
    st.busy = false
  }
  const restartHint = (m) => (m === 'restart the dashboard server once to turn this on' || m === 'not found' ? T('Restart the dashboard server to edit company data.') : errTxt(m))

  document.addEventListener('submit', (e) => {
    const f = e.target.closest('[data-bform]')
    if (!f) return
    e.preventDefault()
    const v = (n) => String(f.elements[n].value || '').trim()
    saveBudget({ enabled: f.elements.enabled.checked, monthlyTokens: v('monthlyTokens') || null, monthlyUsd: v('monthlyUsd') || null, softAlertPct: v('softAlertPct') || 80, hardStop: f.elements.hardStop.checked })
  })
  document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-budget],[data-bcancel],[data-bclear],[data-bmaster],[data-retired],[data-cside]')
    if (!t) { if (e.target.id === 'cdlg') closeBudget(); return }
    if (t.dataset.budget) { openBudget(t.dataset.budget); return }
    if (t.dataset.bcancel) { closeBudget(); return }
    if (t.dataset.bclear) { saveBudget(null); return }
    if (t.dataset.retired) { st.retired = !st.retired; redraw(); return }
    if (t.dataset.cside) { st.side = !st.side; redraw(); return }
    if (t.dataset.bmaster) {
      // switching every budget off or on takes two clicks
      if (st.armed !== 'master') { st.armed = 'master'; clearTimeout(st.armT); st.armT = setTimeout(() => { st.armed = ''; redraw() }, 6000); redraw(); return }
      clearTimeout(st.armT); st.armed = ''
      st.mmsg = ''
      try { await post('api/budget', { scope: 'master', enabled: t.dataset.bmaster === 'on' }); await refresh() } catch (err) { st.mmsg = T('Not saved: ') + restartHint(err.message) }
      redraw()
    }
  })
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && st.dlg) { closeBudget(); e.stopPropagation() } }, true)

  /** Lays the freshly drawn campus into its space, at the zoom and pan it was left at. */
  const fit = () => CA.fit()

  return { scope, desks, campus, org, officeHead, counts, fit, oname, officeById, officeList, emp, dialogOpen: () => !!st.dlg }
}

module.exports = { COMPANY_STYLE, companyViews }
