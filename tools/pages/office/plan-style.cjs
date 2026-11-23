/* Styles of the Dock (screen "Plan", spec 1.4 section 4). Glass cards on the haze, logical CSS
 * properties only (margin-inline-start, inset-inline-end, text-align: start) so a right-to-left
 * locale is additive, and every grid or flex child has min-width:0 so a long name ellipsizes
 * instead of widening the page. Works from 360 px to a wide desktop with no sideways page scroll. */
const PLAN_STYLE = `
#v-plan{padding:0;overflow:hidden;display:flex;flex-direction:column;min-width:0}
#v-plan[hidden]{display:none}
.plan{flex:1;min-height:0;min-width:0;overflow:auto;padding:22px 40px 40px;display:flex;flex-direction:column;gap:14px;font:15px/1.4 var(--font-ui);color:var(--ink)}
.plan *{box-sizing:border-box}
.plan .glass{background:linear-gradient(180deg,rgba(255,255,255,.82),rgba(255,255,255,.6));-webkit-backdrop-filter:var(--glass-blur);backdrop-filter:var(--glass-blur);border:0;border-radius:var(--r-card,22px);box-shadow:var(--sh-card,var(--sh1))}
.pl-top{display:flex;align-items:center;gap:14px;min-width:0;flex:none}
.pl-top .lb{flex:0 1 220px;min-width:120px}
.pl-proj{font:700 15px var(--font-ui);max-inline-size:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:0 1 auto}
.pl-tabs{display:flex;gap:4px;min-width:0;flex:1;overflow-x:auto;scrollbar-width:none;padding:2px}
.pl-tabs::-webkit-scrollbar{display:none}
.pl-tabs button{flex:none;font:600 14px var(--font-ui);padding:8px 14px;border:0;border-radius:999px;background:none;color:var(--ink-dim);cursor:pointer;white-space:nowrap;min-block-size:40px}
.pl-tabs button[aria-selected=true]{background:var(--lb-bg);color:var(--ink);box-shadow:var(--lb-rim)}
.pl-tabs button:focus-visible,.pl-b:focus-visible,.pl-link:focus-visible,.pl-vn:focus-visible,.plan input:focus-visible,.plan textarea:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.pl-count{font-style:normal;font-size:12px;padding:1px 7px;border-radius:999px;background:var(--accent-soft);color:var(--accent-h);margin-inline-start:4px}
.pl-body{display:flex;flex-direction:column;gap:14px;min-width:0}
.pl-bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;min-width:0}
.pl-bar .lb{flex:0 1 320px;min-width:140px}
.pl-row{display:flex;gap:10px;flex-wrap:wrap;margin-block-start:10px}
.pl-b{font:600 14px var(--font-ui);color:var(--ink);background:var(--lb-bg);border:0;border-radius:999px;padding:0 16px;min-block-size:40px;cursor:pointer;box-shadow:var(--lb-rim);max-inline-size:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pl-b:hover:not(:disabled){background:#fff}
.pl-b.pri{background:var(--forest,#0F2E28);color:#fff;box-shadow:0 6px 16px rgba(15,46,40,.22)}
.pl-b.bad{color:var(--bad-ink)}
.pl-b:disabled{opacity:.5;cursor:not-allowed}
.pl-link{background:none;border:0;padding:0;font:600 14px var(--font-ui);color:var(--accent-h);cursor:pointer;text-decoration:underline;text-underline-offset:3px;text-align:start}
.pl-banner{margin:0;padding:12px 16px;border-radius:16px;background:rgba(255,255,255,.7);box-shadow:var(--lb-rim);color:var(--ink-soft);overflow-wrap:anywhere}
.pl-banner.warn{background:rgba(252,241,221,.8)}.pl-banner.bad{background:rgba(251,231,228,.85);color:var(--bad-ink)}
.pl-lanes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;align-items:start;min-width:0}
.pl-lane{min-width:0;display:flex;flex-direction:column;gap:12px;padding:6px;border-radius:var(--r-card,22px)}
.pl-lane.over{background:rgba(14,163,107,.08);box-shadow:inset 0 0 0 2px var(--accent-line)}
.pl-lane>h3{margin:0 4px;font:700 14px var(--font-ui);color:var(--ink-dim)}
.pl-lane>h3 span{font-weight:500}
.pl-card{min-width:0;padding:16px 18px;display:flex;flex-direction:column;gap:10px}
.pl-card[draggable=true]{cursor:grab}
.pl-card header{display:flex;align-items:center;gap:10px;min-width:0}
.pl-card h3{margin:0;font:700 14px var(--font-ui);color:var(--ink-dim)}
.pl-vn{flex:1;min-width:0;display:flex;align-items:baseline;gap:8px;background:none;border:0;padding:0;cursor:pointer;text-align:start;color:var(--ink);font:inherit}
.pl-vn b{flex:none;font:700 18px var(--font-ui)}
.pl-vn span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ink-soft)}
.pl-hn{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:700 20px var(--font-ui)}
.pl-chip{flex:none;display:inline-block;max-inline-size:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:600 12px var(--font-ui);padding:2px 10px;border-radius:999px;background:var(--idle-bg);color:var(--ink-soft)}
.pl-chip.s-active,.pl-chip.t-done{background:var(--accent-soft);color:var(--accent-h)}
.pl-chip.s-released{background:var(--ok-bg);color:var(--ok)}.pl-chip.s-dropped,.pl-chip.t-cancelled{background:var(--idle-bg);color:var(--ink-dim)}
.pl-chip.s-unlisted,.pl-chip.t-blocked{background:var(--warn-bg);color:var(--bad-ink)}.pl-chip.own{background:var(--accent-soft);color:var(--accent-h)}
.pl-mid{display:flex;align-items:center;gap:14px;min-width:0}
.pl-nums{display:flex;flex-direction:column;min-width:0}.pl-nums b{font:700 20px var(--font-ui)}.pl-nums span{color:var(--ink-dim);font-size:13px;overflow-wrap:anywhere}
.pl-ring{position:relative;flex:none;display:inline-grid;place-items:center}
.pl-ring svg{position:absolute;inset:0;inline-size:100%;block-size:100%}
.pl-ring .t{fill:none;stroke:var(--track,#E3EDE7);stroke-width:3.4}.pl-ring .f{fill:none;stroke:var(--accent);stroke-width:3.4;stroke-linecap:round}
.pl-ring b{position:relative;font:700 11px var(--font-ui);text-align:center;max-inline-size:80%;line-height:1.05}
.pl-facts{margin:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 14px}
.pl-facts>div{min-width:0}.pl-facts dt{font-size:12px;color:var(--ink-dim)}.pl-facts dd{margin:0;font:600 14px var(--font-ui);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pl-note,.pl-ready,.pl-line,.pl-goal{margin:0;overflow-wrap:anywhere}.pl-note{color:var(--ink-dim);font-size:13px}.pl-ready{color:var(--accent-h);font-weight:700}
.pl-acts{display:flex;flex-wrap:wrap;gap:8px;min-width:0}
.pl-fold{display:flex;flex-direction:column;gap:12px}
.pl-empty{margin:0;color:var(--ink-dim);padding:8px 4px}
.pl-unplanned{padding:14px 18px;display:flex;flex-direction:column;gap:8px;min-width:0}
.pl-unplanned>h3{margin:0;font:700 14px var(--font-ui);color:var(--ink-dim)}.pl-unplanned>h3 span{font-weight:500}
.pl-unplanned ul,.pl-props{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px;min-width:0}
.pl-bug{min-width:0;display:flex;flex-direction:column;gap:8px}
.pl-bugrow{display:flex;align-items:center;gap:10px;min-width:0}
.pl-bugrow .id{flex:none;font:600 13px var(--font-ui);color:var(--ink-dim)}.pl-bugrow .ti{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pl-into{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;min-width:0}.pl-into label{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--ink-dim);min-width:0;flex:1 1 200px}
.pl-prop .pl-pq{margin:0;font:600 15px var(--font-ui);overflow-wrap:anywhere}
.pl-prop .pl-sheet{box-shadow:none;background:none;padding:6px 0 0}
.dock .dprop{font:600 13px var(--font-ui);padding:4px 12px;border:0;border-radius:999px;background:var(--accent-soft);color:var(--accent-h);cursor:pointer;min-block-size:32px}
.pl-empty-card{padding:26px 24px;display:flex;flex-direction:column;gap:6px;max-inline-size:640px;min-width:0}
.pl-empty-card h3{margin:0;font:700 22px var(--font-ui)}.pl-empty-card p{margin:0;color:var(--ink-soft)}
.pl-cmd{display:flex;flex-direction:column;gap:8px;margin-block-start:10px;min-width:0;align-items:flex-start}
.pl-cmd code,.pl-pre{max-inline-size:100%;overflow:auto;padding:10px 12px;border-radius:12px;background:rgba(15,46,40,.06);font:13px/1.45 ui-monospace,Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere}
.pl-pre{margin:0}
.pl-sheet{padding:18px 20px;display:flex;flex-direction:column;gap:10px;max-inline-size:560px;min-width:0}
.pl-sheet h3{margin:0;font:700 18px var(--font-ui)}
.pl-sheet label{display:flex;flex-direction:column;gap:4px;min-width:0}.pl-sheet label>span{font-size:13px;color:var(--ink-dim)}
.plan input,.plan textarea{font:15px var(--font-ui);color:var(--ink);min-width:0;inline-size:100%;border:0;border-radius:14px;padding:9px 14px;background:var(--lb-bg);box-shadow:var(--lb-rim);resize:vertical}
.plan input[readonly]{opacity:.7}
.pl-inline{display:flex;gap:8px;min-width:0;flex:1 1 220px}.pl-inline input{flex:1}
.pl-seg{display:inline-flex;gap:14px}.pl-seg button{font:600 14px var(--font-ui);background:none;border:0;padding:8px 2px;color:var(--ink-dim);cursor:pointer;min-block-size:40px}.pl-seg button[aria-pressed=true]{color:var(--ink);box-shadow:inset 0 -2px 0 var(--accent)}
.pl-shipbox{align-items:stretch}
.pl-ship{inline-size:100%;max-inline-size:760px;block-size:auto;margin-inline:auto;display:block}
.pl-ship .seg{fill:var(--track,#E3EDE7)}.pl-ship .fill{fill:var(--accent)}.pl-ship .sep{stroke:#fff;stroke-width:2}.pl-ship .out{fill:none;stroke:var(--forest,#0F2E28);stroke-width:3;stroke-linejoin:round}
.pl-ship .cab{fill:#fff;stroke:var(--forest,#0F2E28);stroke-width:2}.pl-ship .mast{stroke:var(--forest,#0F2E28);stroke-width:3}.pl-ship .sail{fill:var(--accent-soft);stroke:var(--forest,#0F2E28);stroke-width:2}
.pl-hulls{list-style:none;margin:0;padding:0;display:grid;gap:8px;min-width:0}
.pl-hulls li{min-width:0;display:flex;flex-direction:column}.pl-hulls b,.pl-hulls span,.pl-hulls small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pl-hulls small{color:var(--ink-dim)}
.pl-table{display:flex;flex-direction:column;gap:14px;min-width:0}
.pl-group h4{margin:0 0 6px;display:flex;justify-content:space-between;gap:12px;font:700 15px var(--font-ui);min-width:0}.pl-group h4 span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pl-group h4 em{flex:none;font-style:normal;font-weight:500;color:var(--ink-dim)}
.pl-group table{inline-size:100%;table-layout:fixed;border-collapse:collapse}
.pl-group th{text-align:start;font-weight:500;color:var(--ink-dim);font-size:12px;padding:5px 8px}
.pl-group td{padding:8px;vertical-align:top;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-block-start:1px solid var(--hair)}
.pl-group col.id,.pl-group th:nth-child(1){inline-size:84px}.pl-group th:nth-child(3){inline-size:112px}.pl-group th:nth-child(4),.pl-group th:nth-child(5),.pl-group th:nth-child(6){inline-size:64px}.pl-group th:nth-child(7){inline-size:76px}.pl-group th:nth-child(8){inline-size:124px}
.pl-group th:nth-child(9){inline-size:96px}
.pl-ql,.pl-tl{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;min-width:0}
.pl-q,.pl-tl li{display:flex;align-items:center;gap:10px;min-width:0;padding-block:8px;border-block-start:1px solid var(--hair)}
.pl-q:first-child,.pl-tl li:first-child{border-block-start:0}
.pl-q[draggable=true]{cursor:grab}.pl-q.over{box-shadow:inset 0 2px 0 var(--accent)}
.pl-q .n{flex:none;inline-size:28px;font:700 14px var(--font-ui);color:var(--ink-dim)}
.pl-q .id,.pl-tl .id{flex:none;font:600 13px var(--font-ui);color:var(--ink-dim);max-inline-size:84px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pl-q .ti,.pl-tl .ti{flex:1 1 0;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pl-q .meta,.pl-tl .meta{flex:0 1 auto;min-width:0;display:flex;gap:6px;max-inline-size:45%;overflow:hidden}
.pl-q .pl-acts{flex:none;flex-wrap:nowrap}.pl-q .pl-b{padding:0 12px;min-inline-size:40px}
.pl-today{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;align-items:start;min-width:0}
.pl-tg h3 span,.pl-gone h3 span{font-weight:500;color:var(--ink-dim)}
.pl-card>h3 span{font-weight:500;color:var(--ink-dim)}
.pl-decs ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:12px}
.pl-dec{display:flex;flex-direction:column;gap:6px;min-width:0;padding-block:6px;border-block-end:1px solid var(--hair)}
.pl-dec p{margin:0;overflow-wrap:anywhere}.pl-dec .o{display:flex;flex-wrap:wrap;gap:6px}.pl-dec.done{opacity:.8}
.pl-dec .pick{align-items:center}
.pl-decs details{margin-block-start:8px}.pl-decs summary{cursor:pointer;font-weight:600;color:var(--ink-dim)}
@media (max-width:899px){
  .plan{padding:14px 16px 24px}
  .pl-today{grid-template-columns:minmax(0,1fr)}
  .pl-q,.pl-tl li{flex-wrap:wrap}.pl-q .ti,.pl-tl .ti{flex-basis:calc(100% - 120px)}.pl-q .meta,.pl-tl .meta{max-inline-size:100%}
  .pl-lanes{grid-template-columns:minmax(0,1fr)}
  .pl-top{flex-direction:column;align-items:stretch;gap:8px}.pl-top .lb{flex:none;inline-size:100%}
}
@media (max-width:700px){
  .pl-group table,.pl-group tbody,.pl-group tr,.pl-group td{display:block;inline-size:100%}
  .pl-group thead{display:none}
  .pl-group tr{border-block-start:1px solid var(--hair);padding-block:6px}.pl-group tr:first-child{border-block-start:0}
  .pl-group td{display:flex;justify-content:space-between;gap:12px;padding:3px 2px;border:0;text-align:end;white-space:normal}
  .pl-group td::before{content:attr(data-l);color:var(--ink-dim);text-align:start;flex:none}
  .pl-group td.ti{overflow-wrap:anywhere}
  .pl-group td>*{min-width:0}
  .pl-hulls b{font-size:12px}
}
@media (prefers-reduced-motion:no-preference){.pl-lane{transition:background .15s}}
`

module.exports = { PLAN_STYLE }
