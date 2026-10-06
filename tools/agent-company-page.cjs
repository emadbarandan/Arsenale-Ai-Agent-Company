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
.board.rail-mini .rail{display:none;box-shadow:-12px 0 32px rgba(0,0,0,.55);z-index:30}
.board.rail-mini.rail-open .rail{display:block}
.board.rail-mini .rail h2 .x{display:inline-block}
h1.co{white-space:nowrap;font-size:17px}
.brand-b{font:600 10px var(--mono);color:var(--accent);border:1px solid var(--accent-line);padding:1px 5px;border-radius:3px;margin-inline-start:8px;vertical-align:3px;white-space:nowrap}
.views .omenu-wrap{position:relative;display:flex}
.omenu{position:fixed;z-index:40;background:var(--panel);border:1px solid #3A4757;border-radius:4px;padding:4px;min-width:220px;box-shadow:0 8px 24px rgba(0,0,0,.5)}
.omenu button{display:flex;gap:8px;align-items:center;width:100%;text-align:start;font:12.5px var(--fa);color:var(--ink-soft);background:none;border:0;padding:6px 8px;border-radius:3px;cursor:pointer}
.omenu button:hover,.omenu button[aria-current=true]{background:var(--panel-raised);color:var(--ink)}
.sq{display:inline-block;width:10px;height:10px;flex:none}
.cv{position:absolute;left:0;right:var(--rw);top:52px;bottom:0;overflow:hidden}
.cv[hidden]{display:none}
.cbtn{font:600 12px var(--fa);border:1px solid var(--line);background:#16202A;color:var(--ink);border-radius:4px;padding:4px 10px;cursor:pointer;white-space:nowrap}
.cbtn.go{color:var(--accent);border-color:var(--accent-line);background:var(--accent-soft)}
.cbtn.ok{background:var(--accent);color:#06241B;border-color:var(--accent)}
.cbtn.sm{font-size:11px;padding:1px 7px;font-weight:600}
.cbtn.armed{background:var(--gate);color:#1D2530;border-color:var(--gate)}
.cbtn:disabled{opacity:.45;cursor:default}
.ch{font:600 11px var(--mono);letter-spacing:.8px;text-transform:uppercase;color:var(--ink-dim);margin:0 0 8px;display:flex;gap:8px;align-items:center}
.ch .sp{flex:1}
/* campus */
.cwrap{display:flex;height:100%}
.cmap{flex:1;position:relative;overflow:hidden;background:radial-gradient(ellipse at 50% 45%,#0F1820 0%,#0A0F14 70%);min-width:0}
.cmap-in{position:absolute;left:0;top:0;width:1060px;height:848px;transform-origin:0 0}
.cmap-in svg{position:absolute;left:0;top:0}
.cmap .bld{cursor:pointer}
.cmap .bld:hover polygon{filter:brightness(1.12)}
.sign{position:absolute;width:224px;background:rgba(16,22,29,.96);border:1px solid var(--line);border-top:3px solid var(--c);border-radius:5px;padding:8px 10px 9px;text-align:start}
.sign h3{margin:0 0 5px;font-size:14px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sign .n{display:flex;gap:11px;font-family:var(--mono);font-size:12px;margin-bottom:6px;white-space:nowrap;direction:ltr;justify-content:flex-end}
[dir=ltr] .sign .n{justify-content:flex-start}
.sign .n .a{color:var(--ok)}.sign .n .b{color:var(--warn)}.sign .n .c{color:var(--ink)}
.sign .cbar{margin:0 0 7px}
.sign.small{width:auto;padding:4px 8px}
.sign.small h3{font-size:12px}
.ctip{position:absolute;left:18px;bottom:56px;font-size:12px;color:var(--ink-dim);background:rgba(16,22,29,.9);border:1px solid var(--line);padding:6px 10px;border-radius:5px}
.ctip b{font-family:var(--mono);color:var(--ink)}
.cleg{position:absolute;right:16px;bottom:16px;display:flex;gap:14px;font-size:12px;color:var(--ink-soft);background:rgba(16,22,29,.9);border:1px solid var(--line);padding:6px 10px;border-radius:5px;flex-wrap:wrap}
.cleg i{display:inline-block;width:9px;height:9px;margin-inline-end:6px;vertical-align:-1px}
.cside{width:380px;flex:none;border-inline-start:1px solid var(--line);background:var(--panel);padding:16px 18px;overflow-y:auto;scrollbar-width:thin;scrollbar-color:#2A3644 transparent}
.ckpis{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px}
.ckpi{border:1px solid var(--line);border-radius:5px;padding:8px 10px;background:var(--panel-raised);min-width:0}
.ckpi b{display:block;font:700 20px var(--mono);color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ckpi b small{font-size:11px;font-weight:600}
.ckpi span{font-size:11.5px;color:var(--ink-dim);display:block}
.ckpi.cw b{color:var(--warn)}.ckpi.cg b{color:var(--ok)}
.cmaster{display:flex;gap:8px;align-items:center;font-size:12px;color:var(--ink-soft);margin:0 0 14px;flex-wrap:wrap}
.cmaster b{color:var(--ink)}
.cmaster .off{color:var(--warn)}
.orow{display:grid;grid-template-columns:10px 1fr auto;gap:2px 10px;padding:9px 0;border-top:1px solid var(--line);align-items:center}
.orow .sq{grid-row:1 / span 2}
.orow .on{font:600 13px var(--fa);color:var(--ink);background:none;border:0;padding:0;text-align:start;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.orow .on:hover{color:#fff;text-decoration:underline dotted}
.orow .ct{font:12px var(--mono);color:var(--ink-soft);white-space:nowrap;direction:ltr}
.orow .ct u{text-decoration:none;color:var(--ok)}.orow .ct s{text-decoration:none;color:var(--warn)}
.orow .bw{grid-column:2 / span 2;display:flex;gap:8px;align-items:center;font-size:11px;color:var(--ink-dim)}
.orow .bw .cbar{flex:1}
.cbar{height:6px;background:#1A2530;border-radius:1px;position:relative;min-width:40px;direction:ltr}
.cbar i{display:block;height:100%;max-width:100%}
.cbar b{position:absolute;top:-2px;bottom:-2px;width:1px;background:#6C7886}
.num{font-family:var(--mono);font-variant-numeric:tabular-nums}
.cfeed{margin:0 0 14px;padding:0;list-style:none;font-size:12.5px;color:var(--ink-soft)}
.cfeed li{padding:6px 0;border-top:1px solid var(--line);display:flex;gap:8px}
.cfeed time{font-family:var(--mono);color:var(--ink-dim);flex:none;width:40px}
.cfeed b{font-family:var(--mono);color:var(--ink);font-weight:600}
.cfeed li>span{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.cnote{font-size:11.5px;color:var(--ink-dim);margin:0 0 10px}
.cnote code{font-family:var(--mono);color:var(--ink)}
.cbanner{margin:0 0 12px;padding:8px 10px;border:1px solid var(--gate-line);background:var(--warn-bg);border-radius:4px;font-size:12px;color:var(--ink)}
.cbanner code{font-family:var(--mono)}
.csetup{position:absolute;inset:40px;display:flex;align-items:center;justify-content:center}
.csetup div{max-width:560px;background:var(--panel);border:1px dashed #3A4757;border-radius:6px;padding:22px 26px;font-size:13px;color:var(--ink-soft)}
.csetup h2{margin:0 0 8px;font-size:16px;color:var(--ink)}
.csetup code{font-family:var(--mono);color:var(--cyan);direction:ltr;display:inline-block}
/* office strip, over the floor */
.board.co .zoombar{left:auto;right:12px}
[dir=rtl] .board.co .zoombar{right:auto;left:12px}
[dir=rtl] .ohead{left:auto;right:14px}
#vtab-office{max-width:170px;overflow:hidden;text-overflow:ellipsis}
.board.co .counts{gap:12px}
.board.co .top{gap:14px}
.ohead{max-width:calc(100% - 350px)}
.crumb{flex-wrap:nowrap}
.ohead{position:absolute;left:14px;top:10px;z-index:3;display:flex;flex-direction:column;gap:6px;pointer-events:none}
.ohead>*{pointer-events:auto}
.crumb{display:flex;align-items:center;gap:10px;font-size:13px;flex-wrap:wrap}
.crumb button{font:13px var(--fa);color:var(--ink-dim);background:none;border:0;padding:0;cursor:pointer}
.crumb button:hover{color:var(--ink)}
.crumb b{font-size:16px;color:#fff}
.ostats{display:flex;gap:6px;flex-wrap:wrap}
.ostats div{background:rgba(16,22,29,.95);border:1px solid var(--line);border-radius:5px;padding:4px 10px;font-size:11.5px;color:var(--ink-dim);min-width:64px}
.ostats b{display:block;font:700 15px var(--mono);color:var(--ink);white-space:nowrap}
.ostats .a b{color:var(--ok)}.ostats .b b{color:var(--warn)}.ostats .r b{color:var(--bad)}
.tag.away{font-family:var(--fa);background:#1B2430;border-style:dashed;color:var(--ink-soft)}
.ovf{position:absolute;transform:translate(0,-100%) scale(var(--bs,1));transform-origin:0 100%;background:rgba(16,22,29,.95);border:1px solid var(--gate-line);border-radius:3px;padding:4px 8px;font:11.5px var(--fa);color:var(--ink-soft);z-index:2;max-width:260px}
.ovf b{color:var(--gate)}
.ovf button{font:11px var(--mono);color:var(--cyan);background:none;border:0;padding:0 3px;cursor:pointer;text-decoration:underline dotted}
.chip.despite{color:var(--bad);border-color:rgba(255,95,95,.45);background:var(--bad-bg)}
/* org chart */
.org{padding:14px 20px 40px;height:100%;overflow:auto;scrollbar-width:thin;scrollbar-color:#2A3644 transparent;position:relative}
.otools{display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap}
.otools h2{font-size:16px;margin:0;color:#fff}
.otools .sp{flex:1}
.ochip{font-size:11.5px;padding:2px 7px;border:1px solid var(--line);border-radius:4px;background:#0E141B;color:var(--ink-soft);white-space:nowrap}
.olvl{display:flex;flex-direction:column;align-items:center}
.node{display:flex;gap:10px;align-items:center;background:var(--panel-raised);border:1px solid var(--line);border-radius:6px;padding:7px 10px;position:relative;text-align:start;min-width:0}
.node.big{min-width:320px;padding:10px 14px}
.node .nm{font:700 13px var(--mono);color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;direction:ltr;text-align:start}
.node .tt{font-size:11.5px;color:var(--ink-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.node .meta{display:flex;gap:6px;margin-top:4px;align-items:center;flex-wrap:wrap}
.node .mid{min-width:0;flex:1}
.node .rt{margin-inline-start:auto;text-align:end;min-width:92px;flex:none}
.node .rt .num{font-size:11px;color:var(--ink-soft);display:block;margin-top:4px;white-space:nowrap}
.node .rt .cbar{margin-top:4px}
.node.nboard{border-color:rgba(255,209,102,.5)}.node.nceo{border-color:rgba(201,182,242,.5)}
.node.retired{opacity:.55;border-style:dashed}
.node .portrait{display:block}
.vl{width:1px;height:16px;background:#3C4856}
.bus{height:1px;background:#3C4856;width:75%}
.ocols{display:grid;gap:14px;width:100%}
.ocol{position:relative;padding-top:16px;min-width:0}
.ocol:before{content:"";position:absolute;left:50%;top:0;width:1px;height:16px;background:#3C4856}
.ocolh{font:11px var(--mono);color:var(--ink-dim);display:flex;flex-wrap:wrap;justify-content:space-between;gap:2px 6px;padding:6px 2px 4px}
.ocolh b{color:var(--ink)}
.node.head{border-top:3px solid var(--c);width:100%}
.oemps{margin:0;margin-inline-start:22px;padding:0;list-style:none;border-inline-start:1px solid #3C4856}
.oemps li{position:relative;padding-top:8px}
.oemps li:before{content:"";position:absolute;inset-inline-start:0;top:30px;width:14px;height:1px;background:#3C4856}
.oemps .node{margin-inline-start:14px}
.mdlc{font:11px var(--mono);padding:1px 6px;border:1px solid rgba(86,182,194,.3);border-radius:4px;color:#7FB7C0;background:rgba(86,182,194,.07);white-space:nowrap}
.pill{display:inline-flex;align-items:center;gap:4px;font-size:11px;padding:0 6px;border-radius:4px;white-space:nowrap;border:1px solid}
.pill .g{font-family:var(--mono);font-weight:700;min-width:0}
.pill.working{color:var(--ok);border-color:var(--accent-line);background:var(--accent-soft)}
.pill.quiet,.pill.waiting{color:var(--warn);border-color:rgba(229,163,61,.4);background:var(--warn-bg)}
.pill.idle,.pill.away{color:var(--ink-soft);border-color:var(--line);background:rgba(138,151,166,.1)}
.pill.paused{color:var(--bad);border-color:rgba(255,95,95,.4);background:var(--bad-bg)}
.alert{font:10px var(--mono);padding:0 4px;border-radius:2px;white-space:nowrap}
.alert.s{color:var(--warn);border:1px solid rgba(229,163,61,.5)}.alert.h{color:var(--bad);border:1px solid rgba(255,95,95,.5)}
.ocont{margin-top:18px}
.ocont .chips{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}
.oft{display:flex;gap:18px;font-size:12px;color:var(--ink-dim);margin-top:18px;flex-wrap:wrap}
.oft i{display:inline-block;width:9px;height:9px;margin-inline-end:6px}
.oft .t{display:inline-block;width:1px;height:10px;background:#6C7886;margin-inline-end:6px}
/* the org chart since 1.0: you, your assistant, one coloured column per office */
.org{padding:26px 40px 40px;background:radial-gradient(ellipse at 50% 0%,#101A24 0,var(--ground) 60%)}
.org .otools{align-items:flex-start;margin-bottom:6px}
.org .otools h2{font-size:28px;color:#E9EFF5;line-height:1.2}
.org .osub{margin:4px 0 0;font-size:14.5px;color:var(--ink-soft)}
.org .osub .ochip{font-size:inherit;padding:0;border:0;background:none;color:var(--ink-soft)}
.org .ochip.w{color:var(--warn);border-color:rgba(229,163,61,.4);background:var(--warn-bg);padding:0 6px}
.onode{display:flex;gap:14px;align-items:center;width:400px;max-width:100%;padding:12px 20px;border:1px solid var(--accent-line);border-radius:10px;background:var(--panel)}
.onode.asst{border-color:#2B3A49}
.onode b{display:block;font-size:16px;color:#E9EFF5}
.onode span{font-size:13px;color:var(--ink-soft)}
.onode .av{line-height:0;flex:none}
.olink{height:38px;position:relative;width:100%;display:flex;justify-content:center}
.olink i{width:2px;height:100%;background:var(--accent);display:block}
.olink span{position:absolute;inset-inline-start:calc(50% + 14px);top:10px;font:12px var(--mono);color:var(--ink-dim)}
[dir=rtl] .olink span{font-family:var(--fa)}
.obus{width:calc(100% - (100% / var(--n)));height:2px;background:#2B3A49;display:flex;justify-content:space-between;margin:0 auto}
.obus i{width:9px;height:9px;margin-top:-3.5px;display:block}
.org .ocols{gap:16px;margin-top:0}
.org .ocol{padding-top:30px}
.org .ocol:before{top:0;height:30px;width:2px;background:#2B3A49}
.org .ocolh{font:700 15px var(--fa);color:#0A0F14;border-radius:10px 10px 0 0;padding:11px 16px;align-items:center;flex-wrap:nowrap}
.org .ocolh b{color:#0A0F14;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.org .ocolh .ocnt{font:700 11px var(--mono);background:rgba(10,15,20,.28);color:#0A0F14;border-radius:9px;padding:1px 8px;flex:none}
.ompl{list-style:none;margin:0;padding:10px 14px;border:1px solid var(--line);border-top:0;border-radius:0 0 10px 10px;background:var(--panel)}
.opr{display:flex;align-items:center;gap:6px}
.opr.retired{opacity:.55}
.opb{flex:1;min-width:0;display:flex;gap:12px;align-items:center;padding:7px 2px;background:none;border:0;cursor:pointer;text-align:start;font:inherit;color:inherit;border-radius:6px}
.opb:hover:not(:disabled) b{text-decoration:underline dotted}
.opb:disabled{cursor:default}
.oav{position:relative;border-radius:8px;padding:5px 7px 0;line-height:0;flex:none}
.oav i{position:absolute;inset-inline-end:-3px;bottom:-2px;width:10px;height:10px;border-radius:50%;border:2px solid var(--panel)}
.otx{min-width:0}
.otx b{display:block;font-size:14.5px;color:#E9EFF5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.otx span{display:block;font-size:13px;color:var(--ink-soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.onone{font-size:13px;color:var(--ink-dim);padding:8px 2px}
.oready{display:flex;align-items:center;gap:18px;margin-top:34px;padding:16px 24px;border:1px dashed #2B3A49;border-radius:10px;font-size:14px;color:var(--ink-soft);flex-wrap:wrap}
.oready b{color:#E9EFF5}
.oready .ic{color:var(--ink-dim);line-height:0}
.oready .cbtn{margin-inline-start:auto}
/* the budget dialog */
.cdlg-back{position:fixed;inset:0;background:rgba(5,8,12,.6);z-index:60;display:flex;align-items:center;justify-content:center}
.cdlg-back[hidden]{display:none}
.cdlg{width:400px;background:var(--panel);border:1px solid #3A4757;border-radius:6px;padding:16px 18px;box-shadow:0 16px 40px rgba(0,0,0,.6);font-size:12.5px}
.cdlg h3{margin:0 0 2px;font-size:15px;color:#fff}
.cdlg .sub{color:var(--ink-dim);margin:0 0 12px;font-size:12px}
.cdlg label{display:block;margin:0 0 10px;color:var(--ink-soft)}
.cdlg label.ck{display:flex;gap:8px;align-items:flex-start}
.cdlg input[type=text]{display:block;width:100%;margin-top:3px;font:13px var(--mono);color:var(--ink);background:var(--ground);border:1px solid #3A4757;border-radius:3px;padding:4px 8px;direction:ltr}
.cdlg input:focus{outline:1px solid var(--accent)}
.cdlg .hint{display:block;font-size:11px;color:var(--ink-dim);margin-top:2px}
.cdlg .row{display:flex;gap:8px;justify-content:flex-end;margin-top:14px}
.cdlg .msg{font-size:12px;margin-top:8px}
.cdlg .msg.err{color:var(--bad)}.cdlg .msg.ok{color:var(--ok)}
`

function companyViews(h) {
  const { esc, fa, hhmm, ms, T, k, usd, errTxt, portrait, sprite, post, redraw, go, refresh } = h
  const QUIET_MS = 10 * 60000
  const ST_COL = { working: '#3BE8B0', quiet: '#E5A33D', waiting: '#E5A33D', paused: '#FF5F5F', idle: '#3C4856', away: '#2A3440' }
  const st = { armed: '', armT: 0, retired: false, dlg: null, busy: false, mmsg: '' }
  const C = () => COMPANY
  const canEdit = () => LIVE && !!ANSWER_TOKEN && !C().readOnly
  const officeList = () => C().offices.filter((o) => !o.archived)
  const officeById = (id) => C().offices.find((o) => o.id === id) || null
  const emp = (id) => C().employees.find((e) => e.id === id) || null
  // One language per screen: an office has a name in each, and only the one
  // in the page's language is shown (the English name when there is no Persian one).
  const oname = (o) => (!o ? '' : LANG === 'fa' && o.nameFa ? o.nameFa : o.builtIn ? T(o.name) : o.name)
  // the title of a person: Persian titles only on the Persian page; a title the
  // server made up from the id ("Eng lead") is English and so is not shown there
  const autoTitle = (e) => String(e.title).toLowerCase() === e.id.replace(/-/g, ' ').toLowerCase()
  const etitle = (e) => (LANG === 'fa' ? e.titleFa || (autoTitle(e) ? '' : e.title) : e.title) || ''
  // "2026-10" is the Gregorian key of the month; the Persian page names the Persian month
  const periodTxt = (key) => {
    const m = /^(\d{4})-(\d{2})$/.exec(String(key || ''))
    if (!m || LANG !== 'fa') return String(key || '')
    return new Date(Number(m[1]), Number(m[2]) - 1, 15).toLocaleDateString('fa-IR', { year: 'numeric', month: 'long' })
  }
  // file diagnostics from the server are English sentences around a file name
  const problemTxt = (p) => {
    let m = /^(.+?)( is missing or unreadable| is not a list| is not an object)$/.exec(p)
    if (m) return m[1] + T(m[2])
    m = /^project (.+) names an unknown office "(.*)"$/.exec(p)
    if (m) return T('project ') + m[1] + T(' names an unknown office ') + '«' + m[2] + '»'
    return p
  }
  const pctTxt = (p) => (p === null || p === undefined ? '—' : fa(Math.min(999, Math.round(p))) + T('%'))

  /** Spend as "1.24M tok · $3.20". USD that needs a missing price is "USD
   *  n/a"; a sum that misses some runs says so. */
  function money(sp) {
    if (!sp) return ''
    // each part isolated, so "$0" stays "$0" inside Persian text
    const tok = '<bdi>' + k(sp.tokens) + ' ' + T('tok') + '</bdi> · '
    if (sp.usdStatus === 'none') return tok + '<bdi dir="ltr">' + (sp.runs ? T('USD n/a') : '$' + fa(0)) + '</bdi>'
    if (sp.usdStatus === 'na') return tok + '<bdi dir="ltr" class="dim" title="' + T('Model prices are not set in model-prices.json') + '">' + T('USD n/a') + '</bdi>'
    return tok + '<bdi dir="ltr">' + usd(sp.usd) + (sp.usdStatus === 'partial' ? '<span class="dim" title="' + fa(sp.usdMissing) + T(' runs have tokens but no price') + '">+</span>' : '') + '</bdi>'
  }
  /** The budget bar, with the alert threshold as a tick; nothing at all when
   *  the budget is off, so a switched-off budget never looks like a limit. */
  function bar(b) {
    if (!b || !b.on || b.pct === null) return ''
    const c = b.level === 'stop' || b.level === 'over' ? '#FF5F5F' : b.level === 'soft' ? '#E5A33D' : '#3BE8B0'
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
  const SLOTS = [
    { at: [1.0, 1.0], sign: [60, 14] }, { at: [6.2, 1.0], sign: [760, 14] },
    { at: [1.0, 6.2], sign: [40, 560] }, { at: [6.2, 6.2], sign: [790, 610] },
  ]
  function iso(ox, oy, TW, TH) {
    const P = (x, y, z) => [ox + (x - y) * TW / 2, oy + (x + y) * TH / 2 - (z || 0)]
    const poly = (pts, fill) => '<polygon points="' + pts.map((p) => p.map((n) => Math.round(n * 10) / 10).join(',')).join(' ') + '" fill="' + fill + '"/>'
    const box = (x, y, w, d, z, hgt, c) =>
      poly([P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + hgt), P(x, y + d, z + hgt)], c[1]) +
      poly([P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + hgt), P(x + w, y, z + hgt)], c[2]) +
      poly([P(x, y, z + hgt), P(x + w, y, z + hgt), P(x + w, y + d, z + hgt), P(x, y + d, z + hgt)], c[0])
    const winL = (Y, x0, x1, z0, z1, f) => poly([P(x0, Y, z0), P(x1, Y, z0), P(x1, Y, z1), P(x0, Y, z1)], f)
    const winR = (X, y0, y1, z0, z1, f) => poly([P(X, y0, z0), P(X, y1, z0), P(X, y1, z1), P(X, y0, z1)], f)
    return { P, poly, box, winL, winR }
  }
  const shade = (hex, f) => '#' + [1, 3, 5].map((i) => Math.max(0, Math.min(255, Math.round(parseInt(hex.substr(i, 2), 16) * f))).toString(16).padStart(2, '0')).join('')

  /** Who has a window in an office building: the home staff, and visitors
   *  while they work there. Busiest first, so the top floor shows the work. */
  function windowsOf(S, officeId) {
    const order = { working: 0, quiet: 1, waiting: 2, paused: 3, idle: 4, away: 5 }
    const ids = new Set(C().employees.filter((e) => e.kind === 'employee' && e.homeOfficeId === officeId).map((e) => e.id))
    for (const a of S.active) if (a.officeId === officeId) ids.add(a.agent)
    return [...ids].map((id) => ({ id, s: empStatus(S, id, officeId) })).sort((a, b) => order[a.s] - order[b.s] || a.id.localeCompare(b.id))
  }

  function campus(S) {
    const list = officeList().filter((o) => !o.builtIn)
    const un = officeById('unassigned')
    const unC = counts(S, 'unassigned')
    const showUn = un && (unC.working || unC.today || unC.waiting)
    const many = list.length > 4
    const W = 1060, H = 848
    const g = many ? Math.ceil(Math.sqrt(list.length)) : 2
    const I = iso(530, many ? 160 : 200, many ? 200 / g : 100, many ? 100 / g : 50)
    const { P, poly, box, winL, winR } = I
    const N = many ? g * 5 : 10
    let s = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" shape-rendering="crispEdges" aria-hidden="true">'
    s += poly([P(0, 0), P(N, 0), P(N, N), P(0, N)], '#13201C')
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if ((i + j) % 2) s += poly([P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)], '#16251F')
    s += poly([P(0, N), P(N, N), P(N, N, -14), P(0, N, -14)], '#0B1311') + poly([P(N, 0), P(N, N), P(N, N, -14), P(N, 0, -14)], '#08100D')
    const roads = []
    for (let r = 1; r < (many ? g : 2); r++) roads.push(r * 5 - 0.45)
    for (const r of roads) {
      s += poly([P(r, 0), P(r + 0.9, 0), P(r + 0.9, N), P(r, N)], '#27323E') + poly([P(0, r), P(N, r), P(N, r + 0.9), P(0, r + 0.9)], '#27323E')
      for (let t = 0.2; t < N; t += 0.8) s += poly([P(r + 0.42, t), P(r + 0.48, t), P(r + 0.48, t + 0.4), P(r + 0.42, t + 0.4)], '#56606C') + poly([P(t, r + 0.42), P(t + 0.4, r + 0.42), P(t + 0.4, r + 0.48), P(t, r + 0.48)], '#56606C')
    }
    const tree = (x, y) => { const [px, py] = P(x, y); return '<rect x="' + (px - 2) + '" y="' + (py - 10) + '" width="4" height="10" fill="#5A3A22"/><rect x="' + (px - 10) + '" y="' + (py - 26) + '" width="20" height="16" fill="#1F5A3E"/><rect x="' + (px - 6) + '" y="' + (py - 32) + '" width="12" height="8" fill="#2A7A52"/>' }
    const signs = []
    const lines = []
    const items = []
    list.forEach((o, i) => {
      const at = many ? [(i % g) * 5 + 1, Math.floor(i / g) * 5 + 1] : SLOTS[i].at
      const wins = windowsOf(S, o.id)
      const rows = Math.max(2, Math.min(4, Math.ceil(wins.length / 6)))
      const hgt = 24 + rows * 28
      const w = 2.8, d = 2.8, c = o.color || '#8A97A6'
      let b = box(at[0], at[1], w, d, 0, hgt, ['#2B3744', '#1D2732', '#151D26'])
      b += poly([P(at[0], at[1], hgt), P(at[0] + w, at[1], hgt), P(at[0] + w, at[1] + d, hgt), P(at[0], at[1] + d, hgt)], '#2F3C4A')
      b += box(at[0] - 0.05, at[1] + d - 0.05, w + 0.1, 0.05, hgt - 8, 8, [shade(c, 1), shade(c, 0.8), shade(c, 0.6)])
      b += box(at[0] + w - 0.05, at[1] - 0.05, 0.05, d + 0.1, hgt - 8, 8, [shade(c, 0.8), shade(c, 0.7), shade(c, 0.5)])
      // the top floors' windows: one per employee, coloured by what they do
      const cw = w / 6
      for (let r = 0; r < rows; r++) for (let ci = 0; ci < 6; ci++) {
        const z0 = 14 + r * ((hgt - 34) / rows), z1 = z0 + ((hgt - 34) / rows) - 8
        const n = (rows - 1 - r) * 6 + ci
        const who = wins[n]
        const f = who ? ST_COL[who.s] : (ci + r) % 3 === 0 ? '#1E2B38' : '#101820'
        b += winL(at[1] + d, at[0] + ci * cw + cw * 0.2, at[0] + ci * cw + cw * 0.8, z0, z1, f)
        b += winR(at[0] + w, at[1] + ci * (d / 6) + d / 12 * 0.4, at[1] + ci * (d / 6) + d / 6 * 0.8, z0, z1, (ci + r) % 4 === 1 ? '#233241' : '#0F1720')
      }
      const label = oname(o) + T(', ') + fa(counts(S, o.id).working) + ' ' + T('working')
      items.push([at[0] + at[1], '<g class="bld" data-goto="office:' + esc(o.id) + '" role="button" tabindex="0" aria-label="' + esc(label) + '">' + b + '</g>'])
      const roof = P(at[0] + w / 2, at[1] + d / 2, hgt)
      if (many) {
        signs.push({ o, x: roof[0] - 70, y: roof[1] - 70, small: true })
      } else {
        const [sx, sy] = SLOTS[i].sign
        signs.push({ o, x: sx, y: sy })
        lines.push([sx + 112, sy + (sy < 400 ? 132 : -2), roof[0], roof[1]])
      }
    })
    if (!many) {
      // the supervisor's kiosk on the plaza; heads of offices sit in their buildings
      s += poly([P(4.1, 4.1), P(5.9, 4.1), P(5.9, 5.9), P(4.1, 5.9)], '#2E3B48')
      const [kx, ky] = P(5, 5)
      items.push([9.5, '<g class="bld" data-goto="office:' + esc(hqId()) + '" role="button" tabindex="0" aria-label="' + esc(T('Supervisor desk')) + '">' + box(4.5, 4.5, 1, 1, 0, 26, ['#C9B6F2', '#7C6FA3', '#5A4F7C']) +
        '<rect x="' + (kx - 1) + '" y="' + (ky - 58) + '" width="2" height="34" fill="#8A97A6"/><rect x="' + (kx + 1) + '" y="' + (ky - 58) + '" width="16" height="10" fill="' + (ceoAway() ? '#56606C' : '#FFD166') + '"/></g>'])
      for (const [x, y] of [[4.2, 4.3], [0.5, 5.4], [9.6, 9.6], [4.2, 9.4], [5.8, 0.5]]) items.push([x + y, tree(x, y)])
      if (!showUn) items.push([13.6, tree(9.3, 4.3)])
    }
    if (showUn && !many) {
      // work no project claims sits in a shed by the road, not in an office
      items.push([13.1, '<g class="bld" data-goto="office:unassigned" role="button" tabindex="0" aria-label="' + esc(oname(un)) + '">' + box(9.0, 3.85, 0.85, 0.6, 0, 26, ['#56606C', '#3C4856', '#2B3744']) + '</g>'])
      const [ux, uy] = P(9.4, 4.1, 26)
      signs.push({ o: un, x: ux - 40, y: uy - 92, small: true })
    }
    // visitors on their way: one figure on the road for each employee
    // working in an office that is not their home
    let v = 0
    for (const a of S.active) {
      const e = emp(a.agent)
      if (!e || !e.homeOfficeId || e.homeOfficeId === a.officeId || v >= 6 || many) continue
      const i = list.findIndex((o) => o.id === a.officeId)
      if (i < 0) continue
      const at = SLOTS[i].at
      const spot = [[5, 2.3], [5, 3.2], [2.3, 5], [3.2, 5], [7.8, 5], [5, 7.6]][(i * 2 + v) % 6]
      void at
      const [px, py] = P(spot[0], spot[1])
      items.push([spot[0] + spot[1], sprite('stand', a.agent, px, py, 2)])
      v++
    }
    items.sort((a, b) => a[0] - b[0])
    s += items.map((x) => x[1]).join('') + '</svg>'
    const html = signs.map(({ o, x, y, small }) => {
      const c = counts(S, o.id)
      const sd = o.standing || {}
      return '<div class="sign' + (small ? ' small' : '') + '" style="--c:' + esc(o.color || '#8A97A6') + ';left:' + x + 'px;top:' + y + 'px">' +
        '<h3 title="' + esc(oname(o)) + '">' + esc(oname(o)) + '</h3>' +
        '<div class="n"><span class="a" title="' + T('working') + '">▸ ' + fa(c.working) + '</span><span class="b" title="' + T('waiting for you') + '">! ' + fa(c.waiting) + '</span>' + (small ? '' : '<span class="c">' + money(sd.spend) + '</span>') + '</div>' +
        (small ? '' : bar(sd.budget)) +
        '<button type="button" class="cbtn go" data-goto="office:' + esc(o.id) + '">' + T('Enter office →') + '</button></div>'
    }).join('')
    const svgLines = '<svg width="' + W + '" height="' + H + '" style="pointer-events:none" aria-hidden="true">' + lines.map((l) => '<line x1="' + l[0] + '" y1="' + l[1] + '" x2="' + l[2] + '" y2="' + l[3] + '" stroke="#3C4856" stroke-dasharray="3 3"/>').join('') + '</svg>'
    const leg = '<div class="cleg"><span>' + T('Windows on the top floors: one per employee') + '</span><span><i style="background:#3BE8B0"></i>' + T('working') + '</span><span><i style="background:#E5A33D"></i>' + T('waiting') + '</span><span><i style="background:#FF5F5F"></i>' + T('paused') + '</span><span><i style="background:#3C4856"></i>' + T('idle') + '</span></div>'
    const tip = many ? '' : '<div class="ctip">' + T('Lavender kiosk = ') + '<b>' + T('Supervisor desk') + '</b>. ' + T('Click a building to enter.') + '</div>'
    return '<div class="cwrap"><div class="cmap" id="cmap"><div class="cmap-in" id="cmap-in">' + s + svgLines + html + '</div>' + tip + leg + '</div>' + side(S) + '</div>'
  }
  const hqId = () => { const o = officeList().find((x) => x.leadEmployeeId === 'supervisor') || officeList()[0]; return o ? o.id : 'unassigned' }
  const ceoAway = () => { const hb = C().heartbeat; return !hb || !hb.lastSeenAt || Date.now() - ms(hb.lastSeenAt) > 30 * 60000 }

  function side(S) {
    const co = C()
    const sd = co.standing
    const waitingAll = (DATA.gates || []).filter((g) => g.status === 'waiting').length
    const working = new Set(S.active.map((a) => a.agent)).size
    let html = '<aside class="cside" aria-label="' + T('Company summary') + '">'
    if (co.readOnly) html += '<p class="cbanner">' + T('Company data was written by a newer dashboard (v') + fa(co.schemaVersion) + T('). Editing is disabled.') + '</p>'
    else if (!LIVE) html += '<p class="cbanner">' + T('Open from the live server to edit.') + '</p>'
    for (const p of co.problems || []) html += '<p class="cbanner">' + esc(problemTxt(p)) + '</p>'
    html += '<div class="ch">' + T('Company this month') + ' <span class="dim">' + esc(periodTxt(co.periodKey)) + '</span></div>'
    html += '<div class="ckpis"><div class="ckpi cw"><b>' + fa(waitingAll) + '</b><span>' + T('waiting for you') + '</span></div>' +
      '<div class="ckpi cg"><b>' + fa(working) + '</b><span>' + T('working now') + '</span></div>' +
      '<div class="ckpi"><b dir="ltr">' + k(sd.spend.tokens).replace(/(\s?[^\d۰-۹٫.\s]+)$/, '<small>$1</small>') + '</b><span>' + (sd.budget.on && sd.budget.tokens ? T('tokens of ') + k(sd.budget.tokens.limit) : T('tokens this month')) + '</span></div></div>'
    html += '<p class="cnote">' + money(sd.spend) + (sd.spend.unmeasured ? ' · ' + fa(sd.spend.unmeasured) + T(' runs unmeasured') : '') + (sd.budget.on ? ' · ' + T('company budget ') + pctTxt(sd.budget.pct) : '') + '</p>'
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
        '<span class="ct"><u>▸' + fa(c.working) + '</u> &nbsp;<s>!' + fa(c.waiting) + '</s> &nbsp;' + money(o.standing.spend) + '</span>' +
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
    if (un.length) html += '<p class="cnote">' + T('Project names this month that no project claims: ') + un.map(([n, c]) => '<code dir="ltr">' + esc(n) + '</code> ×' + fa(c)).join(T(', ')) + '</p>'
    return html + '</aside>'
  }

  // ---------- the strip over an office floor
  function officeHead(S, officeId) {
    const o = officeById(officeId)
    if (!o) return ''
    const c = counts(S.full || S, officeId)
    const home = C().employees.filter((e) => e.kind === 'employee' && e.homeOfficeId === officeId)
    const idle = home.filter((e) => empStatus(S.full || S, e.id, officeId) === 'idle').length
    const sd = o.standing || {}
    const b = sd.budget
    return '<div class="crumb"><button type="button" data-goto="campus">' + T('Campus') + '</button><span class="dim">/</span><span class="sq" style="background:' + esc(o.color) + '"></span><b>' + esc(oname(o)) + '</b>' + '</div>' +
      '<div class="ostats"><div class="a"><b>' + fa(c.working) + '</b>' + T('working') + '</div><div class="b"><b>' + fa(c.waiting) + '</b>' + T('waiting for you') + '</div><div><b>' + fa(idle) + '</b>' + T('idle') + '</div>' +
      '<div><b dir="ltr">' + (sd.spend ? k(sd.spend.tokens) : '—') + '</b>' + T('tokens this month') + '</div>' +
      '<div><b dir="ltr">' + (!sd.spend || sd.spend.usdStatus === 'na' || (sd.spend.usdStatus === 'none' && sd.spend.runs) ? T('n/a') : usd(sd.spend.usd)) + '</b>' + T('USD') + '</div>' +
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
    const dot = s === 'working' || s === 'quiet' ? '#3BE8B0' : s === 'waiting' ? '#E5A33D' : s === 'paused' ? '#FF5F5F' : ''
    const budget = C().company.budgetsEnabled && e.kind === 'employee' ? editBtn('employee', e.id) : ''
    return '<li class="opr' + (e.kind === 'retired' ? ' retired' : '') + '"><button type="button" class="opb" data-ev="member-open" data-arg="' + esc(e.id) + '" data-to-team="1"' + (e.kind === 'retired' ? ' disabled' : '') + '><span class="oav" style="background:' + esc(ART.shade(o.color || '#56B6C2', 0.42)) + '">' + ART.person(e.id + (e.look ? ':' + e.look : ''), o.color, 30) + (dot ? '<i style="background:' + dot + '" title="' + esc(T(STATUS_TXT[s])) + '"></i>' : '') + '</span><span class="otx"><b dir="auto">' + esc(pname(e)) + '</b>' + (ptitle(e) || e.kind === 'retired' ? '<span dir="auto">' + esc(e.kind === 'retired' ? T('retired: definition file removed') : ptitle(e)) + '</span>' : '') + '</span></button>' + budget + '</li>'
  }

  function org(S) {
    const co = C()
    const offices = officeList().filter((o) => !o.builtIn)
    const people = co.employees.filter((e) => e.kind === 'employee' || (st.retired && e.kind === 'retired'))
    const staffN = people.filter((e) => e.kind === 'employee' && e.id !== 'supervisor').length
    const waitingAll = (DATA.gates || []).filter((g) => g.status === 'waiting').length
    const hb = co.heartbeat
    const away = ceoAway()
    const cname = LANG === 'fa' && co.company.nameFa ? co.company.nameFa : co.company.name
    const asst = (co.company.assistants || []).map((a) => CLIENT_NAMES[a]).filter(Boolean)
    let html = '<div class="org"><div class="otools"><div><h2 dir="auto">' + esc(cname || T('Org chart')) + '</h2><p class="osub">' + T('Your AI team: ') + '<span class="ochip">' + fa(staffN) + ' ' + T('team members') + '</span> ' + T('in') + ' <span class="ochip">' + fa(offices.length) + ' ' + T(offices.length === 1 ? 'office' : 'offices') + '</span>. ' + T('They ask you first before anything leaves the computer.') + '</p></div><span class="sp"></span>' +
      '<button type="button" class="cbtn" data-retired="1" aria-pressed="' + st.retired + '">' + (st.retired ? T('Hide retired') : T('Show retired')) + '</button></div>'
    html += '<div class="olvl">'
    html += '<div class="onode own">' + ART.owner(36) + '<div><b>' + T('You') + '</b><span>' + T('Owner. Gives tasks and says yes or no.') + (waitingAll ? ' <span class="ochip w">' + fa(waitingAll) + ' ' + T('waiting for you') + '</span>' : '') + '</span></div></div>'
    html += '<div class="olink"><i></i><span>' + T('gives tasks, answers questions') + '</span></div>'
    html += '<div class="onode asst">' + ART.robot(36) + '<div><b>' + T('Your assistant') + '</b><span>' + (asst.length ? esc(asst.join(T(', '))) + '. ' : '') + T('Takes on each role.') + ' · ' + (hb && hb.lastSeenAt ? (away ? T('last seen ') : T('active, last seen ')) + '<span dir="ltr">' + hhmm(ms(hb.lastSeenAt)) + '</span>' : T('not seen yet')) + '</span></div></div>'
    html += '<div class="olink"><i></i><span>' + T('hands each job to a team member') + '</span></div>'
    html += '<div class="obus" style="--n:' + Math.max(1, offices.length) + '">' + offices.map((o) => '<i style="background:' + esc(o.color) + '"></i>').join('') + '</div>'
    html += '<div class="ocols" style="grid-template-columns:repeat(' + Math.max(1, offices.length) + ',minmax(230px,1fr))">'
    for (const o of offices) {
      const staff = people.filter((e) => e.homeOfficeId === o.id && e.id !== 'supervisor')
      const head = o.leadEmployeeId && o.leadEmployeeId !== 'supervisor' ? staff.find((e) => e.id === o.leadEmployeeId) : null
      const rest = staff.filter((e) => !head || e.id !== head.id).sort((a, b) => pname(a).localeCompare(pname(b)))
      html += '<div class="ocol"><div class="ocolh" style="background:' + esc(o.color) + '"><b dir="auto">' + esc(oname(o)) + '</b><span class="ocnt">' + fa(staff.length) + '</span></div><ul class="ompl">' + (head ? orgRow(S, head, o) : '') + rest.map((e) => orgRow(S, e, o)).join('') + (staff.length ? '' : '<li class="onone">' + T('No one works here yet.') + '</li>') + '</ul></div>'
    }
    html += '</div></div>'
    // the office packs not installed yet, read once from the server
    if (LIVE && st.packsLeft === undefined) { st.packsLeft = null; fetch('api/packs', { cache: 'no-store' }).then((r) => r.json()).then((d) => { st.packsLeft = (d.packs || []).filter((p) => !p.installed).map((p) => (LANG === 'fa' && p.nameFa ? p.nameFa : p.name)); redraw() }, () => { st.packsLeft = [] }) }
    const cons = co.employees.filter((e) => e.kind === 'contractor')
    if (cons.length) html += '<div class="ocont"><div class="ch">' + T('Contractors') + ' <span class="dim" style="text-transform:none;letter-spacing:0">' + T('agent names with no definition in the agent folders, this month') + '</span></div><div class="chips">' + cons.map((e) => '<span class="ochip" dir="ltr">' + esc(e.id) + ' ×' + fa(e.runsThisPeriod) + '</span>').join('') + '</div></div>'
    if (LIVE && !(st.packsLeft && !st.packsLeft.length)) html += '<div class="oready"><span class="ic">' + ART.ic('box', 18) + '</span><b>' + T('Ready to add') + '</b>' + (st.packsLeft && st.packsLeft.length ? st.packsLeft.map((x) => '<span class="opk" dir="auto">' + esc(x) + '</span>').join('') : '<span class="dim">' + T('Office packs in Settings') + '</span>') + '<button type="button" class="cbtn" data-ev="goto-packs">' + T('Add an office') + '</button></div>'
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
      '<p class="sub">' + T('Counted from the runs the supervisor logs, per calendar month. Saved in company/ and read by the supervisor at its next turn.') + '</p>' +
      '<label class="ck"><input type="checkbox" name="enabled"' + (b.enabled ? ' checked' : '') + '> <span>' + T('Budget on') + '<span class="hint">' + T('Off keeps the numbers but shows usage only: no alerts, no refusals.') + '</span></span></label>' +
      '<label>' + T('Tokens per month') + '<input type="text" name="monthlyTokens" inputmode="numeric" autocomplete="off" value="' + esc(val(b.monthlyTokens)) + '" placeholder="2000000"><span class="hint">' + T('Empty = no limit. 0 = nothing may be spent. Cache reads are not counted.') + '</span></label>' +
      '<label>' + T('USD per month') + '<input type="text" name="monthlyUsd" inputmode="decimal" autocomplete="off" value="' + esc(val(b.monthlyUsd)) + '" placeholder="25.00"><span class="hint">' + (co.pricesSet ? T('From the prices in model-prices.json.') : T('Model prices are not set in model-prices.json: USD use shows n/a and cannot be checked.')) + '</span></label>' +
      '<label>' + T('Alert at (%)') + '<input type="text" name="softAlertPct" inputmode="numeric" autocomplete="off" value="' + esc(val(b.softAlertPct)) + '"></label>' +
      '<label class="ck"><input type="checkbox" name="hardStop"' + (b.hardStop ? ' checked' : '') + '> <span>' + T('Hard stop at 100%') + '<span class="hint">' + T('The supervisor’s --budget-check then refuses to start agents here. The dashboard cannot stop a running agent.') + '</span></span></label>' +
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
    const t = e.target.closest('[data-budget],[data-bcancel],[data-bclear],[data-bmaster],[data-retired]')
    if (!t) { if (e.target.id === 'cdlg') closeBudget(); return }
    if (t.dataset.budget) { openBudget(t.dataset.budget); return }
    if (t.dataset.bcancel) { closeBudget(); return }
    if (t.dataset.bclear) { saveBudget(null); return }
    if (t.dataset.retired) { st.retired = !st.retired; redraw(); return }
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
  // keyboard: Enter on a building enters it, like a click
  document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches && e.target.matches('g.bld')) go(e.target.getAttribute('data-goto')) })

  /** The map is drawn at 1060x848 and scaled to the space it has. */
  function fit() {
    const box = document.getElementById('cmap'), inner = document.getElementById('cmap-in')
    if (!box || !inner) return
    const s = Math.min(box.clientWidth / 1060, box.clientHeight / 848)
    inner.style.transform = 'translate(' + Math.max(0, (box.clientWidth - 1060 * s) / 2).toFixed(1) + 'px,0) scale(' + s.toFixed(4) + ')'
  }

  return { scope, desks, campus, org, officeHead, counts, fit, oname, officeById, officeList, emp, dialogOpen: () => !!st.dlg }
}

module.exports = { COMPANY_STYLE, companyViews }
