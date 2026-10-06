/* The office view of the agent dashboard: an isometric pixel office where
 * every agent owns a desk in a department. Working agents type at their desk
 * under a speech bubble, agents who handed something in today rest in the
 * lounge, reports land in the supervisor's in-tray, and the drawer at the
 * bottom opens today's shift board (one lane per agent, time right to left).
 *
 * build-agent-dashboard.cjs reads the records and calls renderOffice(). The
 * page itself is drawn in the browser by officeClient(), from the same state
 * the server's api/state returns, so it can redraw on every poll and move the
 * clock (elapsed time, "quiet for 10 minutes") without new data.
 *
 * officeClient is never run in Node: its source is written into the page.
 * Keep it free of anything that only exists in Node.
 *
 * The office is one of three views. The rail "waiting for you" and the other
 * two views (decisions and gates, tools and usage) come from controlRoom().
 *
 * Language: renderOffice() picks English or Persian per request (opts.lang),
 * using tools/dashboard-strings.cjs for its own static shell text. The same
 * FA table is serialized into the page for controlRoom/officeClient, which
 * run in the browser and call the injected T(key) — see the bottom of
 * renderOffice() for how LANG, FA and T get into that <script>.
 */
const { t, langSwitch, langScript } = require('./dashboard-strings.cjs')
const { COMPANY_STYLE, companyViews } = require('./agent-company-page.cjs')
const { ACTIVITY_STYLE, activityView } = require('./activity-page.cjs')
const { EVERYONE_STYLE, everyoneViews } = require('./everyone-page.cjs')
const { everyoneArt } = require('./everyone-art.cjs')

/** Desks for whatever agents exist: { seats: {name: [zone, slot]}, zones:
 *  {name: zone} }. The zone comes from the agent's `zone:` frontmatter or its
 *  labels `dept`, else from words in its name ("…-reviewer" reviews, "ui-…"
 *  designs, "…-docs" writes), else build. Slots are handed out by name, so a
 *  desk does not move when another agent is added to a different zone. A full
 *  zone spills into the zone with the most free desks; with every desk taken an
 *  agent has no home desk and takes a guest desk while it works. Leads have no
 *  desk: an office's head sits at the round table.
 *
 *  Shared with agent-company.cjs (an employee's default zone) and written into
 *  the page for officeClient, so it must stay a pure function. */
function homeDesks(agents) {
  const CAP = { build: 4, review: 6, docs: 4, design: 4 }
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k)
  const zoneOf = (a) => {
    const d = String(a.dept || '').toLowerCase()
    if (d === 'lead' || has(CAP, d)) return d
    const n = String(a.name || '').toLowerCase()
    if (/-lead$|^lead-/.test(n)) return 'lead'
    if (/^(ui|ux)-|design|spec|visual|scout|product/.test(n)) return 'design'
    if (/review|audit|secur|migrat|perform|validat|verif/.test(n)) return 'review'
    if (/doc|guide|explain|seo|writer|agent-builder/.test(n)) return 'docs'
    return 'build'
  }
  const seats = {}, zones = {}
  const used = { build: 0, review: 0, docs: 0, design: 0 }
  const spill = []
  const list = (agents || []).filter((a) => a && a.name).slice().sort((a, b) => String(a.name).localeCompare(String(b.name)))
  for (const a of list) {
    const z = zoneOf(a)
    zones[a.name] = z
    if (z === 'lead') continue
    if (used[z] < CAP[z]) seats[a.name] = [z, used[z]++]
    else spill.push(a.name)
  }
  for (const name of spill) {
    const z = Object.keys(CAP).sort((x, y) => (CAP[y] - used[y]) - (CAP[x] - used[x]))[0]
    if (used[z] < CAP[z]) seats[name] = [z, used[z]++]
  }
  return { seats, zones }
}

const OFFICE_STYLE = `
:root{
  --mono: "Cascadia Code", "JetBrains Mono", "Fira Code", Consolas, monospace;
  --fa: "Segoe UI", Tahoma, sans-serif;
  --ink: #C6D0DA; --ink-soft: #A6B1BD; --ink-dim: #8A97A6;
  --ground: #0A0F14; --panel: #10161D; --panel-raised: #141B23; --line: #1E2A36;
  --accent: #3BE8B0; --accent-soft: rgba(59,232,176,0.1); --accent-line: rgba(59,232,176,0.3);
  --cyan: #56B6C2;
  --ok: #3BE8B0; --ok-bg: rgba(59,232,176,0.1); --warn: #E5A33D; --warn-bg: rgba(229,163,61,0.12);
  --bad: #FF5F5F; --bad-bg: rgba(255,95,95,0.12); --idle: #8A97A6; --idle-bg: rgba(138,151,166,0.12);
}
*{box-sizing:border-box}
html,body{height:100%}
body{margin:0;background:var(--ground);color:var(--ink);font:13px/1.6 var(--fa);overflow:hidden}
.board{position:fixed;inset:0;min-width:980px;min-height:620px;overflow:hidden;--iw:380px;--dh:132px}
.top{position:absolute;inset:0 0 auto 0;height:52px;display:flex;align-items:center;gap:18px;padding:0 20px;background:var(--panel);border-bottom:1px solid var(--line)}
h1{font-size:17px;margin:0;font-weight:700}
.date{color:var(--ink-dim);font-size:12.5px;white-space:nowrap}
.counts{display:flex;gap:16px;list-style:none;margin:0 auto 0 0;padding:0;font-size:12.5px;color:var(--ink-soft);white-space:nowrap}
.counts b{font:700 15px var(--mono);color:var(--ink);margin-left:3px}
.acc{color:var(--accent)!important}.warn{color:var(--warn)!important}.bad{color:var(--bad)!important}
.live{font-size:12px;color:var(--ink-dim);display:flex;align-items:center;gap:6px;white-space:nowrap}
.live i{width:7px;height:7px;background:var(--accent);display:inline-block;animation:pulse 2s ease-in-out infinite}
.live.stale{color:var(--bad)}.live.stale i{background:var(--bad);animation:none}
.arch{font-size:12px;color:var(--ink-soft);text-decoration:none;border:1px solid var(--line);border-radius:3px;padding:2px 8px;background:var(--panel-raised);white-space:nowrap}
.langsw{display:flex;gap:0;border:1px solid var(--line);border-radius:3px;overflow:hidden;flex:none}
.langsw button{font:12px var(--fa);color:var(--ink-soft);background:var(--panel-raised);border:0;padding:2px 8px;cursor:pointer}
.langsw button+button{border-inline-start:1px solid var(--line)}
.langsw button[aria-pressed="true"]{color:var(--ink);background:var(--accent-soft)}
.arch:hover{color:var(--ink)}
.g{font-family:var(--mono);font-weight:700;display:inline-block;min-width:1em;text-align:center}
.g-ok{color:var(--ok)}.g-findings{color:var(--warn)}.g-failed{color:var(--bad)}.g-stopped{color:var(--idle)}.g-running{color:var(--accent)}
.dim{color:var(--ink-dim);font-weight:400}.muted{color:var(--ink-dim);font-size:12.5px;margin:4px 0 10px}

/* inspector */
.insp{position:absolute;left:0;top:52px;bottom:0;width:var(--iw);background:var(--panel);border-right:1px solid var(--line);padding:16px 18px;overflow-y:auto}
.who{display:flex;gap:12px;align-items:center}
.portrait{background:var(--panel-raised);border:1px solid var(--line);flex:none}
.ih{font:700 16px var(--mono);margin:0;text-align:start}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0 8px}
.chip{font:12px/1 var(--fa);padding:5px 8px;border:1px solid var(--line);border-radius:4px;color:var(--ink-soft);background:var(--panel-raised)}
.chip.mdl,.mdl{font-family:var(--mono)}
.st-running{color:var(--accent);border-color:var(--accent-line);background:var(--accent-soft)}
.st-failed{color:var(--bad);border-color:rgba(255,95,95,.35);background:var(--bad-bg)}
.st-ok{color:var(--ok)}.st-findings{color:var(--warn);background:var(--warn-bg)}.st-stopped{color:var(--idle)}
.opus{color:#9CD3DA}.son{color:var(--ink-soft)}
.kv{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:6px 0 4px;padding:0}
.kv div{background:var(--panel-raised);border:1px solid var(--line);border-radius:4px;padding:5px 8px;min-width:0}
.kv dt{font-size:11px;color:var(--ink-dim)}.kv dd{margin:0;font:600 13px var(--mono);white-space:nowrap}
.kv dd.fa{font-family:var(--fa)}
.sect{font-size:11.5px;font-weight:700;color:var(--accent);margin:14px 0 5px;letter-spacing:.02em}
.task{margin:0;font-size:13px;color:var(--ink);white-space:pre-wrap;overflow-wrap:anywhere}
.rel{margin:6px 0 0;font-size:12.5px;color:var(--ink-soft)}.rel b{font-family:var(--mono);color:var(--ink)}
.rel button{font:inherit;background:none;border:0;padding:0;color:inherit;cursor:pointer;text-decoration:underline dotted}
.term{list-style:none;margin:0;padding:8px 10px;background:var(--ground);border:1px solid var(--line);border-radius:4px;max-height:300px;overflow-y:auto;font-size:12px}
.term li{display:grid;grid-template-columns:40px 1fr;gap:8px;padding:2px 0;color:var(--ink-soft)}
.term time{font-family:var(--mono);color:var(--ink-dim)}
.term span{overflow-wrap:anywhere}
.term li.now span{color:var(--accent)}
.term li.now span::after{content:"";display:inline-block;width:7px;height:13px;background:var(--accent);margin-right:4px;vertical-align:-2px;animation:blink 1.1s step-end infinite}
.nolog{color:var(--ink-dim);font-size:12.5px;padding:10px}
.nolog p{margin:0 0 4px}.nolog code{font-family:var(--mono);color:var(--ink)}
ul.finds{margin:6px 0 0;padding:0 16px 0 0;font-size:12.5px;color:var(--ink-soft)}
.files{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px}
.file{font:11px var(--mono);padding:1px 6px;border:1px solid var(--line);border-radius:3px;color:var(--cyan);background:var(--panel-raised);direction:ltr}
.twins{margin:8px 0 0;display:flex;gap:4px;flex-wrap:wrap}
.twins button{font:11.5px var(--fa);color:var(--ink-soft);background:var(--panel-raised);border:1px solid var(--line);border-radius:3px;padding:1px 7px;cursor:pointer}
.twins button.on{color:var(--accent);border-color:var(--accent-line)}
.insp .slip{width:auto;margin-top:6px;cursor:default}.insp .slip p{margin:4px 0 0;color:var(--ink-soft)}

/* splitters: the panel and the drawer are resized by dragging the lines
   between them and the office; the sizes live in --iw and --dh on .board */
.split{position:absolute;z-index:8;touch-action:none}
.split::before{content:"";position:absolute;background:transparent;transition:background .15s}
.split::after{content:"";position:absolute;background:#3A4757;border-radius:2px;transition:background .15s}
.split:hover::before,.split.drag::before,.split:focus-visible::before{background:var(--accent)}
.split:hover::after,.split.drag::after,.split:focus-visible::after{background:var(--accent)}
.split:focus-visible{outline:none}
.split-v{top:52px;bottom:0;left:calc(var(--iw) - 4px);width:8px;cursor:col-resize}
.split-v::before{top:0;bottom:0;left:3px;width:2px}
.split-v::after{top:50%;left:2px;width:4px;height:32px;margin-top:-16px}
.split-h{left:var(--iw);right:0;bottom:calc(var(--dh) - 4px);height:8px;cursor:row-resize}
.split-h::before{left:0;right:0;top:3px;height:2px}
.split-h::after{left:50%;top:2px;height:4px;width:40px;margin-left:-20px}

/* stage: the office is drawn at 1060x716, scaled to fit, then zoomed and
   panned by the transform on .stage-in. Labels on the floor counter-scale
   by --bs so they stay readable at any zoom. */
.stage{position:absolute;left:var(--iw);right:0;top:52px;bottom:var(--dh);overflow:hidden;background:radial-gradient(ellipse at 50% 55%,#111922 0%,#0A0F14 70%);cursor:grab;touch-action:none;outline:none}
.stage:focus-visible{box-shadow:inset 0 0 0 3px #FFD166}
.stage.panning,.stage.panning *{cursor:grabbing!important}
.stage.panning .stage-in{pointer-events:none}
.stage-in{position:absolute;left:0;top:0;width:1060px;height:716px;transform-origin:0 0;will-change:transform}
.stage-in.ease{transition:transform .2s ease-out}
.iso{position:absolute;inset:0}
.zoombar{position:absolute;left:12px;top:10px;z-index:3;display:flex;gap:3px;align-items:center;background:rgba(16,22,29,.88);border:1px solid var(--line);border-radius:3px;padding:3px;direction:ltr;cursor:default}
.zoombar button{font:14px/1 var(--mono);color:var(--ink-soft);background:var(--panel-raised);border:1px solid var(--line);border-radius:2px;min-width:26px;height:24px;cursor:pointer;padding:0 6px}
.zoombar button:hover{color:var(--ink);border-color:#3A4757}
.zoombar .fitb{font:12px var(--fa)}
.zoombar output{font:11.5px var(--mono);color:var(--ink);min-width:44px;text-align:center}
.zoombar .zh{font:11px var(--fa);color:var(--ink-dim);padding:0 6px 0 4px;white-space:nowrap}
.hl{animation:tapL .36s steps(1) infinite}.hr{animation:tapR .36s steps(1) infinite}
.glow{animation:glow 2.6s ease-in-out infinite}
.bob{animation:bob 3.8s ease-in-out infinite}
.breathe{transform-box:fill-box;transform-origin:50% 100%;animation:breathe 4.4s ease-in-out infinite}
.appear{animation:appear .45s ease-out both}
.walker{position:absolute;left:0;top:0;offset-anchor:50% 100%;offset-rotate:0deg;z-index:1;pointer-events:none;animation:walkpath 3s linear both}
.walker .lf1{animation:legA .44s steps(1) infinite}.walker .lf2{animation:legB .44s steps(1) infinite}
.walker .wb{animation:wbob .44s steps(1) infinite}
.fly{position:absolute;left:0;top:0;width:14px;height:10px;background:#F4F1EA;border:1.5px solid #1D2530;offset-rotate:0deg;pointer-events:none;z-index:3;animation:fly .9s cubic-bezier(.3,.1,.4,1) both}
.bub{position:absolute;transform:translate(calc(-50% + var(--dx)),-100%) scale(var(--bs,1));transform-origin:50% 100%;width:232px;text-align:start;background:#F4F1EA;color:#1D2530;border:2px solid #1D2530;border-radius:3px;padding:5px 8px 6px;font:12px/1.55 var(--fa);cursor:pointer;box-shadow:3px 3px 0 rgba(0,0,0,.35);z-index:2}
.bub::after{content:"";position:absolute;bottom:-9px;left:calc(50% - var(--dx) / var(--bs,1) - 6px);border:6px solid transparent;border-top:7px solid #1D2530;border-bottom:0}
.bh{display:flex;gap:5px;align-items:baseline;direction:ltr;font:11px var(--mono);margin-bottom:2px;white-space:nowrap}
.bh b{font-size:11px;overflow:hidden;text-overflow:ellipsis}
.bh .mdl{font-style:normal;padding:0 4px;border:1px solid #9AA3AD;border-radius:2px;font-size:10px;color:#39414C}
.bh .mdl.opus{background:#DDEEF0;border-color:#6FA9B1;color:#1F5A62}
.bh .el{margin-left:auto;color:#1C6B50;font-weight:700}
.bh .n2{font-size:10px;color:#39414C}
.bt{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.bub.sel{outline:3px solid var(--accent);outline-offset:1px;z-index:4}
.bub.stale{border-style:dashed;border-color:#8A5A12;background:#F6EAD2}
.bub.stale::after{border-top-color:#8A5A12}
.quiet{display:block;color:#7A4A06;font-weight:700;font-size:11.5px}
/* crowded: a bubble that would cover another shrinks to its name tag and
   opens again on hover, keyboard focus or selection */
.bub.mini{width:auto;padding:2px 6px;box-shadow:2px 2px 0 rgba(0,0,0,.35);z-index:1}
.bub.mini .bh{margin:0;font-size:10.5px}
.bub.mini .mdl,.bub.mini .bt,.bub.mini .quiet{display:none}
.bub.mini:hover,.bub.mini:focus-visible{width:232px;padding:5px 8px 6px;z-index:5}
.bub.mini:hover .mdl,.bub.mini:focus-visible .mdl{display:inline}
.bub.mini:hover .bt,.bub.mini:focus-visible .bt{display:-webkit-box}
.bub.mini:hover .quiet,.bub.mini:focus-visible .quiet{display:block}
.bub .qg{display:none;color:#7A4A06}.bub.mini.stale .qg{display:inline}
.bub.hand{width:230px;background:#EAF6F0}
.bub.hand.g-failed{background:#F9E1DF}.bub.hand.g-findings{background:#F6EAD2}
.bub.hand .el{color:#1D2530}
.bub.hand .g-ok{color:#11734F}.bub.hand .g-failed{color:#A12A24}.bub.hand .g-findings{color:#8A5A12}.bub.hand .g-stopped{color:#4A5563}
.bub.enter,.tag.enter{animation:rise .35s ease-out both}
.bub.news{animation:news .7s ease-out both}
.tag{position:absolute;transform:translate(-50%,-100%) scale(var(--bs,1));transform-origin:50% 100%;font:10.5px/1 var(--mono);color:#E4E8EC;background:rgba(16,22,29,.9);border:1px solid #3A4757;border-radius:2px;padding:3px 5px;white-space:nowrap;cursor:pointer;display:flex;gap:4px;align-items:center;direction:ltr;z-index:1}
.tag::after{content:"";position:absolute;left:50%;top:100%;width:1px;height:calc(var(--lead,0px) / var(--bs,1));background:#3A4757}
.tag.sel{outline:2px solid var(--accent);outline-offset:1px}
.tag.mini b{display:none}
.tag.mini:hover,.tag.mini:focus-visible{z-index:5}
.tag.mini:hover b,.tag.mini:focus-visible b{display:inline}
.tag.boss{font-family:var(--fa);font-size:11.5px;background:#1D2530;border-color:#56606C;cursor:default}
.tag.more{cursor:default;color:var(--ink-dim);font-family:var(--fa)}
.tray-label{position:absolute;transform:translateY(-100%) scale(var(--bs,1));transform-origin:0 100%;font:11.5px var(--fa);color:#1D2530;background:#F4F1EA;border:1px solid #1D2530;padding:1px 6px;white-space:nowrap;cursor:pointer;z-index:1}
.tray-label.land{animation:land .7s ease-out both}
.deleg{position:absolute;transform:translate(-50%,0) scale(var(--bs,1));transform-origin:50% 0;font:11px var(--fa);color:#F4F1EA;background:#2B6CB0;padding:1px 6px;border-radius:2px;white-space:nowrap;z-index:1}
.runner{position:absolute;left:0;top:0;width:13px;height:10px;background:#F4F1EA;border:1.5px solid #2B6CB0;box-shadow:0 0 0 3px rgba(111,168,232,.35);offset-rotate:0deg;animation:walk 2.8s ease-in-out infinite;z-index:1}
.runner::after{content:"";position:absolute;left:2px;right:2px;top:3px;height:1px;background:#6FA8E8}
.flow{animation:flow 1s linear infinite}
.legend{position:absolute;right:14px;bottom:8px;margin:0;display:flex;gap:12px;font-size:11.5px;color:var(--ink-soft);background:rgba(16,22,29,.85);padding:4px 10px;border:1px solid var(--line);border-radius:3px;z-index:3}

/* drawer: today's slips; opened, today's shift board */
.drawer{position:absolute;left:var(--iw);right:0;bottom:0;height:var(--dh);background:var(--panel);border-top:1px solid var(--line);padding:8px 16px;z-index:6;overflow:hidden;display:flex;flex-direction:column}
.dr-top{display:flex;align-items:center;gap:12px;flex:none}
.dr-top h2{font-size:13px;margin:0;white-space:nowrap}
.filters{display:flex;gap:4px}
.f,.more-btn{font:12px var(--fa);color:var(--ink-soft);background:var(--panel-raised);border:1px solid var(--line);border-radius:3px;padding:2px 8px;cursor:pointer;white-space:nowrap}
.f.on{color:var(--accent);border-color:var(--accent-line)}
.more-btn{margin-inline-start:auto}
/* the strip's cards: a wrapping grid anchored to the top, not a one-row rail.
   Height comes from the drawer's --dh via flex:1, so dragging the splitter
   taller reveals more rows instead of leaving empty space beneath one row. */
.slips{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-wrap:wrap;align-content:flex-start;gap:8px;flex:1;min-height:0;overflow-x:hidden;overflow-y:auto;scrollbar-width:thin}
.slip{flex:none;width:176px;text-align:start;background:var(--panel-raised);border:1px solid var(--line);border-top:3px solid var(--idle);border-radius:3px;padding:5px 8px;color:var(--ink);font:12px/1.45 var(--fa);cursor:pointer;display:block}
.slip.g-ok{border-top-color:var(--ok)}.slip.g-findings{border-top-color:var(--warn)}.slip.g-failed{border-top-color:var(--bad)}
.slip.on{outline:2px solid var(--accent);outline-offset:-1px}
.slip .st{display:block;font-size:11px;color:var(--ink-soft)}
.sl1{display:flex;justify-content:space-between;direction:ltr;font:11.5px var(--mono);gap:6px}
.sl1 b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sl1 time{color:var(--ink-dim)}
.sl2{display:block;color:var(--ink-dim);font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pad{padding:14px 0;margin:0}

/* shift board (inside the open drawer) */
.sb{position:relative;flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;margin:8px -16px -8px;border-top:1px solid var(--line)}
.sb-in{position:relative}
.sb-heads{list-style:none;margin:0;padding:0;position:absolute;right:0;top:0;width:210px;height:100%;background:var(--panel);border-left:1px solid var(--line)}
.sb-heads li{position:absolute;right:0;width:210px;height:42px}
.sb-hd{display:flex;align-items:center;gap:8px;width:100%;height:100%;background:none;border:0;border-bottom:1px solid #141C25;color:var(--ink);padding:0 10px;text-align:start;cursor:pointer;font:12px/1.3 var(--fa)}
.sb-hd.on{background:var(--accent-soft);box-shadow:inset -3px 0 0 var(--accent)}
.sb-hd.kid{padding-inline-start:22px}
.sb-hd .portrait{background:#0D1319;border-color:#1E2A36;display:block}
.sb-nm{flex:1;min-width:0;display:flex;flex-direction:column}.sb-nm b{font:600 12px var(--mono);text-align:start;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sb-nm>span{color:var(--ink-dim);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-now{font:700 12px var(--mono);white-space:nowrap}
.sb-now.st-running,.sb-now.st-ok,.sb-now.st-findings,.sb-now.st-failed,.sb-now.st-stopped{background:none;border:0}
.sb-heads .boss{display:flex;align-items:center;gap:8px;padding:0 10px;height:46px;background:#141B23;border-bottom:1px solid var(--line)}
.sb-heads .boss b{font-size:12.5px}
.sb-heads .absent{padding:4px 12px;font-size:11px;color:var(--ink-dim);height:auto;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-al{font:10.5px var(--mono)}
.sb-tl{position:absolute;left:0;top:0}
.sb-tl svg{position:absolute;inset:0}
.sb-tick{position:absolute;top:14px;transform:translateX(-50%);font:11px var(--mono);color:var(--ink-dim)}
.sb-nowlab{position:absolute;top:14px;transform:translateX(-50%);font-size:11px;color:#0A0F14;background:var(--accent);padding:0 6px;border-radius:2px;white-space:nowrap;z-index:2}
.sb-bar{position:absolute;height:18px;border:1px solid;border-radius:2px;padding:0 4px;display:flex;align-items:center;gap:4px;overflow:hidden;cursor:pointer;font:11px/1 var(--fa);color:var(--ink)}
.sb-bar .g{flex:none;font-size:11px;order:2;margin-inline-start:auto}
.sb-bl{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--ink-soft)}
.b-ok{background:rgba(59,232,176,.12);border-color:rgba(59,232,176,.45)}.b-ok .g{color:var(--ok)}
.b-findings{background:var(--warn-bg);border-color:rgba(229,163,61,.55)}.b-findings .g{color:var(--warn)}
.b-failed{background:var(--bad-bg);border-color:rgba(255,95,95,.6)}.b-failed .g{color:var(--bad)}
.b-stopped{background:var(--idle-bg);border-color:#3A4757}.b-stopped .g{color:var(--idle)}
.sb-bar.on{outline:2px solid #FFD166;outline-offset:1px}
.b-run{background:linear-gradient(90deg,rgba(59,232,176,.55),rgba(59,232,176,.22) 30%);border-color:var(--accent);padding:0}
.b-run.stale{background:rgba(59,232,176,.18)}
.sb-hatch{position:absolute;top:0;bottom:0;background:repeating-linear-gradient(-45deg,rgba(229,163,61,.55) 0 3px,transparent 3px 7px);border-left:2px solid var(--warn)}
.sb-stp{position:absolute;top:3px;width:2px;height:10px;background:#E9FFF7;opacity:.8}
.sb-bar:not(.b-run) .sb-stp{background:var(--ink-soft);opacity:.6}
.sb-say{position:absolute;height:36px;background:#F4F1EA;color:#1D2530;border:1.5px solid #1D2530;border-radius:3px;padding:2px 7px;font:11.5px/1.45 var(--fa);display:flex;flex-direction:column;justify-content:center;cursor:pointer;text-align:start}
.sb-say::after{content:"";position:absolute;left:100%;top:12px;border:6px solid transparent;border-left:7px solid #1D2530;border-right:0}
.sb-say span{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.sb-say.stale{background:#F6EAD2;border-style:dashed;border-color:#8A5A12}.sb-say.stale span{-webkit-line-clamp:1}.sb-say.stale b{color:#7A4A06;font-size:11px}
.sb-slip{position:absolute;transform:translateX(-50%);height:16px;min-width:14px;padding:0 3px;border:1px solid #9AA3AD;background:#E9E4D8;color:#1D2530;font:700 10px/14px var(--mono);border-radius:1px;cursor:pointer;display:flex;gap:3px;white-space:nowrap}
.sb-slip.s-ok .g{color:#11734F}.sb-slip.s-findings .g{color:#8A5A12}.sb-slip.s-failed .g{color:#A12A24}.sb-slip.s-failed{background:#F9E1DF}.sb-slip.s-stopped .g{color:#4A5563}
.sb-slip.fresh{border-color:#1D2530;box-shadow:0 0 0 2px var(--accent)}
.sb-slip.on{outline:2px solid #FFD166}
.sb-nw{font:600 10px/14px var(--fa)}
.sb-empty{position:absolute;color:var(--ink-dim);margin:0}

button:focus-visible,a:focus-visible{outline:3px solid #FFD166;outline-offset:2px}
@keyframes blink{50%{opacity:0}}
@keyframes pulse{50%{opacity:.35}}
@keyframes walk{0%{offset-distance:0%;opacity:0}10%{opacity:1}88%{opacity:1}100%{offset-distance:100%;opacity:0}}
@keyframes flow{to{stroke-dashoffset:-20}}
@keyframes tapL{0%{transform:translateY(0)}50%{transform:translateY(-3px)}}
@keyframes tapR{0%{transform:translateY(-3px)}50%{transform:translateY(0)}}
@keyframes glow{0%,100%{opacity:.4}50%{opacity:1}}
@keyframes bob{50%{transform:translateY(-2px)}}
@keyframes breathe{50%{transform:scaleY(1.04)}}
@keyframes appear{from{opacity:0}}
@keyframes rise{from{opacity:0;translate:0 6px}}
@keyframes news{0%{scale:1}30%{scale:1.07;box-shadow:0 0 0 4px var(--accent),3px 3px 0 rgba(0,0,0,.35)}100%{scale:1}}
@keyframes walkpath{0%{offset-distance:0%;opacity:0}5%{opacity:1}95%{opacity:1}100%{offset-distance:100%;opacity:0}}
@keyframes legA{0%{opacity:1}50%{opacity:0}}
@keyframes legB{0%{opacity:0}50%{opacity:1}}
@keyframes wbob{0%{transform:translateY(0)}50%{transform:translateY(-2px)}}
@keyframes fly{0%{offset-distance:0%;opacity:0}8%{opacity:1}85%{opacity:1;scale:1}100%{offset-distance:100%;opacity:0;scale:.6}}
@keyframes land{30%{scale:1.15;box-shadow:0 0 0 3px var(--accent)}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}.runner{offset-distance:50%}.walker,.fly{display:none}}
`

/* The control room around the office: the "waiting for you" rail on the
 * right, in every view, and two more views next to the office: decisions and
 * gates, and tools and usage. Classes are prefixed or scoped (.rail, .vm) so
 * they never restyle the office's own .who, .g, .sect or .now. */
const CR_STYLE = `
:root{--gate:#E5A33D;--gate-line:rgba(229,163,61,.45);--measured:#56B6C2;--who-user:#FFD166;--who-sup:#C9B6F2;--who-agent:#56B6C2;--opus:#6FA9B1;--sonnet:#3E5871}
.board{--rw:320px}
@media (max-width:1399px){.board{--rw:56px}}
.v-office{position:absolute;top:0;bottom:0;left:0;right:var(--rw)}
/* .v-office starts at top:0 and comes later in the page, so without this it
   lay over the whole header in the Office view and the three view tabs could
   not be clicked (only the language switch, which sits over the rail column). */
.top{z-index:20}
.views{display:flex;border:1px solid var(--line);border-radius:3px;overflow:hidden;flex:none}
.views button{font:12.5px var(--fa);background:var(--panel-raised);border:0;border-left:1px solid var(--line);padding:6px 14px;color:var(--ink-soft);cursor:pointer;white-space:nowrap}
.views button:last-child{border-left:0}
.views button[aria-pressed=true]{background:var(--accent-soft);color:var(--accent);font-weight:700;box-shadow:inset 0 -2px 0 var(--accent)}
.gate-c{color:var(--gate)!important}
.mono{font-family:var(--mono)}

/* the rail: what waits for the user, oldest first */
.rail{position:absolute;right:0;top:52px;bottom:0;width:320px;background:var(--panel);border-left:1px solid var(--line);padding:12px 14px;overflow-y:auto;scrollbar-width:thin;scrollbar-color:#2A3644 transparent;z-index:9}
.rail h2{font-size:14px;margin:0 0 2px;color:var(--gate);display:flex;gap:8px;align-items:baseline}
.rail h2 b{font:700 16px var(--mono)}
.rail h2 .x{margin-inline-start:auto;font:12px var(--fa);color:var(--ink-soft);background:var(--panel-raised);border:1px solid var(--line);border-radius:3px;padding:1px 8px;cursor:pointer;display:none}
.rail .hint{font-size:11.5px;color:var(--ink-dim);margin:0 0 8px}
.rail .sect{display:flex;justify-content:space-between;align-items:baseline;margin:14px 0 6px}
.rail .sect .src{font-weight:400;color:var(--ink-dim);font-size:11px}
.wait{background:var(--warn-bg);border:1px solid var(--gate-line);border-inline-start:3px solid var(--gate);border-radius:3px;margin:0 0 7px}
.wait.late{border-color:rgba(255,95,95,.5);border-inline-start-color:var(--bad);background:var(--bad-bg)}
.wait.hl{box-shadow:0 0 0 2px #FFD166}
.wait-go{display:block;width:100%;text-align:start;background:none;border:0;padding:7px 9px 5px;cursor:pointer;color:inherit;font:inherit}
.wh{display:flex;gap:6px;align-items:center;font-size:12px;font-weight:600}
.gl{font:700 11px/16px var(--mono);min-width:18px;height:18px;text-align:center;border:1px solid var(--gate-line);color:var(--gate);border-radius:2px;padding:0 3px;display:inline-block;flex:none}
.late .gl{border-color:rgba(255,95,95,.5);color:var(--bad)}
.age{margin-inline-start:auto;font:700 12px var(--mono);color:var(--gate);white-space:nowrap}
.late .age{color:var(--bad)}
.wq{display:block;font-size:12.5px;color:var(--ink);margin:3px 0;overflow-wrap:anywhere}
.wf{display:flex;justify-content:space-between;gap:6px;font-size:11px;color:var(--ink-dim)}
.ansbox{padding:0 9px 8px;display:flex;flex-wrap:wrap;gap:4px;align-items:center}
.ansbox button{font:12px var(--fa);color:var(--ink);background:var(--panel-raised);border:1px solid #3A4757;border-radius:3px;padding:2px 9px;cursor:pointer}
.ansbox button:hover{border-color:var(--gate)}
.ansbox button.armed{background:var(--gate);color:#1D2530;border-color:var(--gate);font-weight:700}
.ansbox button.yes{border-color:var(--accent-line);color:var(--accent)}
.ansbox button.no{border-color:rgba(255,95,95,.45);color:var(--bad)}
.ansbox button:disabled{opacity:.45;cursor:default}
.ansbox button.dis{margin-inline-start:auto;font-size:11px;color:var(--ink-dim);background:none;border-color:var(--line)}
.ansbox button.dis:hover{color:var(--ink);border-color:var(--gate)}
.ansbox button.dis.armed{color:#1D2530}
.bulk{display:block;width:100%;margin:2px 0 8px;font:12px var(--fa);color:var(--ink-soft);background:var(--panel-raised);border:1px dashed #3A4757;border-radius:3px;padding:4px 9px;cursor:pointer}
.bulk:hover{border-color:var(--gate)}
.bulk.armed{background:var(--gate);color:#1D2530;border-color:var(--gate);font-weight:700}
.bulk:disabled{opacity:.45;cursor:default}
.given .dim{color:var(--ink-dim)}
.given .rd{font-size:10.5px;margin-inline-start:4px;white-space:nowrap}
.given .rd.yes{color:var(--ok)}.given .rd.no{color:var(--gate)}
.ansbox form{display:flex;gap:4px;flex:1;min-width:0}
.ansbox input{flex:1;min-width:0;font:12px var(--fa);color:var(--ink);background:var(--ground);border:1px solid #3A4757;border-radius:3px;padding:2px 7px}
.ansbox input:focus{outline:1px solid var(--gate);outline-offset:0}
.ansmsg{flex-basis:100%;font-size:11px;color:var(--ink-dim)}
.ansmsg.err{color:var(--bad)}.ansmsg.ok{color:var(--ok)}
.pipe{border:1px solid var(--line);border-radius:4px;padding:7px 9px;margin-bottom:7px;background:var(--panel-raised)}
.pipe-h{display:flex;justify-content:space-between;gap:6px;font-size:12.5px;font-weight:600}
.pipe-h span{font:400 11px var(--fa);color:var(--ink-dim);white-space:nowrap}
.gsteps{display:flex;gap:3px;margin:6px 0 0;list-style:none;padding:0}
.gsteps li{flex:1;min-width:0;text-align:center;font-size:10.5px;line-height:1.3;padding:3px 2px;border:1px solid var(--line);border-radius:2px;color:var(--ink-dim);overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.gsteps li b{display:block;font:700 11px var(--mono)}
.gsteps .done{color:var(--ok);border-color:var(--accent-line);background:var(--accent-soft)}
.gsteps .wt{color:var(--gate);border-color:var(--gate-line);background:var(--warn-bg)}
.gsteps .lt{color:var(--bad);border-color:rgba(255,95,95,.5);background:var(--bad-bg)}
.gsteps .ex{text-decoration:line-through}
.given{list-style:none;margin:0;padding:0;font-size:12px}
.given li{display:grid;grid-template-columns:auto 1fr;gap:8px;padding:3px 0;border-bottom:1px solid #151D26}
.given time{font-family:var(--mono);color:var(--ink-dim)}
.given .ans{color:var(--who-user)}
.rail .none{font-size:12px;color:var(--ink-dim);margin:0 0 8px}
.rail .say{font-size:12.5px;color:var(--ink-soft);margin:0 0 8px}
.rail .say b{font-family:var(--mono);color:var(--ink)}
/* folded: a narrow strip; a click opens the full rail over the page */
.mini-rail{display:none;position:absolute;right:0;top:52px;bottom:0;width:56px;background:var(--panel);border-left:1px solid var(--line);flex-direction:column;align-items:center;gap:8px;padding-top:10px;z-index:8;overflow-y:auto;scrollbar-width:none}
.mini-rail .ttl{writing-mode:vertical-rl;font:700 12px var(--fa);color:var(--gate);background:none;border:0;cursor:pointer;padding:0}
.mr{width:44px;min-height:44px;flex:none;border:1px solid var(--gate-line);background:var(--warn-bg);border-radius:3px;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;padding:2px}
.mr b{font:700 12px var(--mono);color:var(--gate)}
.mr span{font:10px var(--mono);color:var(--gate)}
.mr.late{border-color:rgba(255,95,95,.5);background:var(--bad-bg)}.mr.late b,.mr.late span{color:var(--bad)}
.mr.zero{border-style:dashed;background:none}.mr.zero b{color:var(--ink-dim)}
@media (max-width:1399px){
  .mini-rail{display:flex}
  .rail{display:none;box-shadow:-12px 0 32px rgba(0,0,0,.55);z-index:30}
  .board.rail-open .rail{display:block}
  .rail h2 .x{display:inline-block}
}

/* decisions and usage views */
.vm{position:absolute;left:0;right:var(--rw);top:52px;bottom:0;padding:14px 18px;overflow:hidden;display:flex;flex-direction:column;gap:10px}
.vm[hidden],.v-office[hidden]{display:none}
.fbar{display:flex;gap:6px;align-items:center;flex-wrap:wrap;flex:none}
.fbar h2{font-size:15px;margin:0 0 0 12px}
.fchip{font:12px var(--fa);background:var(--panel-raised);border:1px solid var(--line);border-radius:3px;padding:3px 9px;color:var(--ink-soft);cursor:pointer;white-space:nowrap}
.fchip b{font:700 11.5px var(--mono);margin-right:3px}
.fchip[aria-pressed=true]{color:var(--ink);border-color:#3A4757;background:#1B2430}
.fsel{background:var(--panel-raised);border:1px solid var(--line);color:var(--ink);font:12px var(--fa);padding:3px 8px;border-radius:3px}
.swim{position:relative;background:var(--panel);border:1px solid var(--line);border-radius:4px;height:176px;flex:none;overflow:hidden}
.lane{position:absolute;right:0;left:0;height:44px;border-bottom:1px solid #151D26}
.lane .lh{position:absolute;right:0;top:0;bottom:0;width:92px;display:flex;align-items:center;gap:6px;padding-right:10px;font-size:12px;font-weight:600;background:#0D1319;border-left:1px solid var(--line);z-index:1}
.track{position:absolute;right:100px;left:14px;top:0;bottom:0}
.mk{position:absolute;top:50%;width:12px;height:12px;margin:-6px -6px 0 0;border:2px solid;border-radius:2px;background:var(--panel);padding:0;cursor:pointer;z-index:1}
.mk.u{border-color:var(--who-user);transform:rotate(45deg);background:#261F0C}
.mk.s{border-color:var(--who-sup);background:#1B1829}
.mk.a{border-color:var(--who-agent);border-radius:50%;background:#0F2226}
.mk.o{border-color:var(--gate);border-style:dashed;border-radius:50%}
.mk.sel{box-shadow:0 0 0 3px rgba(59,232,176,.45)}
.mlab{position:absolute;top:3px;font-size:10.5px;color:var(--ink-soft);white-space:nowrap;transform:translateX(50%);pointer-events:none;max-width:160px;overflow:hidden;text-overflow:ellipsis}
.waitbar{position:absolute;top:50%;height:8px;margin-top:-4px;background:repeating-linear-gradient(135deg,rgba(229,163,61,.35) 0 5px,transparent 5px 10px);border:1px solid var(--gate-line)}
.waitbar.lt{background:repeating-linear-gradient(135deg,rgba(255,95,95,.35) 0 5px,transparent 5px 10px);border-color:rgba(255,95,95,.5)}
.axis{position:absolute;right:100px;left:14px;bottom:0;height:40px}
.axis span{position:absolute;bottom:18px;font:10.5px var(--mono);color:var(--ink-dim);transform:translateX(50%)}
.axis span::before{content:"";position:absolute;left:50%;bottom:15px;width:1px;height:132px;background:#18212B}
.nowl{position:absolute;top:-136px;bottom:18px;width:0;border-left:1px dashed var(--accent)}
.nowl b{position:absolute;bottom:-17px;left:-18px;font:10.5px var(--mono);color:var(--accent);background:var(--panel);padding:0 2px;z-index:2}
.runs-ax{position:absolute;right:100px;left:14px;bottom:4px;height:10px}
.runs-ax i{position:absolute;height:6px;top:2px;background:#2A3644;border-radius:1px}
.runs-ax i.op{background:var(--opus)}
.runs-ax i.lv{background:var(--accent)}
.tbl-wrap{flex:1;min-height:0;overflow:auto;border:1px solid var(--line);border-radius:4px;background:var(--panel);scrollbar-width:thin;scrollbar-color:#2A3644 transparent}
.vm table{border-collapse:collapse;width:100%}
.dt th,.dt td{text-align:start;padding:6px 10px;border-bottom:1px solid #151D26;vertical-align:top;font-size:12.5px}
.dt thead th{font-size:11px;color:var(--ink-dim);font-weight:600;background:#0D1319;position:sticky;top:0;z-index:1}
.dt td.t{font-family:var(--mono);color:var(--ink-dim);width:52px;white-space:nowrap}
.dt td.w{width:130px;white-space:nowrap}
.dw{display:inline-flex;gap:5px;align-items:center;font-size:12px;font-weight:600}
.dw i{width:9px;height:9px;display:inline-block;border:2px solid;flex:none}
.dw.u{color:var(--who-user)}.dw.u i{border-color:var(--who-user);transform:rotate(45deg)}
.dw.s{color:var(--who-sup)}.dw.s i{border-color:var(--who-sup)}
.dw.a{color:var(--who-agent)}.dw.a i{border-color:var(--who-agent);border-radius:50%}
.dw.o{color:var(--gate)}.dw.o i{border-color:var(--gate);border-style:dashed;border-radius:50%}
.dt .d{color:var(--ink);overflow-wrap:anywhere}
.dt .r{color:var(--ink-soft);font-size:12px;overflow-wrap:anywhere}
.dt td.run{width:160px}
.lnk{font:11px var(--mono);color:var(--cyan);background:none;border:0;padding:0;cursor:pointer;text-decoration:underline dotted;direction:ltr;white-space:nowrap}
.pj{display:block;font-size:11px;color:var(--ink-dim)}
.dst{font-size:11px;padding:1px 6px;border-radius:2px;border:1px solid var(--line);white-space:nowrap;color:var(--ink-soft)}
.dst.wt{color:var(--gate);border-color:var(--gate-line);background:var(--warn-bg)}
.dst.lt{color:var(--bad);border-color:rgba(255,95,95,.5);background:var(--bad-bg)}
.dt tr.selrow td{background:rgba(59,232,176,.05)}
.dt tr.selrow td:first-child{box-shadow:inset -3px 0 0 var(--accent)}
.dt tr[data-dsel]{cursor:pointer}
.vm .empty{color:var(--ink-dim);padding:16px;margin:0;font-size:12.5px}
.kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;flex:none;margin:0}
.kpi{background:var(--panel);border:1px solid var(--line);border-radius:4px;padding:7px 10px;min-width:0}
.kpi dt{font-size:11.5px;color:var(--ink-dim)}
.kpi dd{margin:0;font:700 20px var(--mono);color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kpi dd small{font:400 11.5px var(--fa);color:var(--ink-soft);margin-right:4px}
.kpi.m dd{color:var(--measured)}
.kpi dd.unset{font:600 13px var(--fa);color:var(--gate);padding-top:5px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px;flex:none;max-height:46%;min-height:0}
.box{background:var(--panel);border:1px solid var(--line);border-radius:4px;padding:10px 12px;min-height:0;overflow:auto;scrollbar-width:thin;scrollbar-color:#2A3644 transparent}
.box h3{font-size:13px;margin:0 0 6px;display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.box h3 span{font:400 11px var(--fa);color:var(--ink-dim)}
.hb th{font:600 11.5px var(--mono);text-align:left;direction:ltr;width:160px;padding:2px 0;color:var(--ink);white-space:nowrap}
.hb td{padding:2px 0}
.hb td.v{font:700 11.5px var(--mono);text-align:left;width:56px;color:var(--measured);direction:ltr}
.hbar{display:flex;height:11px;direction:ltr;margin-right:8px}
.hbar i{display:block;height:100%}
.hbar .op{background:var(--opus)}.hbar .sn{background:var(--sonnet)}
.hbar .nr{background:repeating-linear-gradient(135deg,#2A3644 0 3px,transparent 3px 6px);border:1px solid #2A3644}
.lg{display:flex;flex-wrap:wrap;gap:12px;font-size:11.5px;color:var(--ink-soft);margin-top:5px}
.lg i{display:inline-block;width:10px;height:10px;margin-left:4px;vertical-align:-1px}
.mx th,.mx td{padding:2px 3px;text-align:center;font-size:11px}
.mx thead th{font:600 10.5px var(--mono);color:var(--ink-dim)}
.mx tbody th{font:600 11px var(--mono);text-align:left;direction:ltr;color:var(--ink);white-space:nowrap;padding-left:0}
.mc{display:block;min-width:30px;height:20px;line-height:18px;border-radius:2px;font:600 11px var(--mono)}
.mc.u{background:rgba(86,182,194,.18);color:var(--measured);border:1px solid rgba(86,182,194,.4)}
.mc.u.hi{background:rgba(86,182,194,.38);color:#E4F6F8}
.mc.u.bad{background:var(--bad-bg);color:var(--bad);border-color:rgba(255,95,95,.5)}
.mc.z{border:1px dashed #3A4757;color:var(--ink-dim)}
.mc.n{background:repeating-linear-gradient(135deg,#151D26 0 3px,transparent 3px 6px);color:transparent}
.mx td.norec{text-align:start;color:var(--ink-dim);font-size:11.5px}
.rt th,.rt td{padding:4px 8px;border-bottom:1px solid #151D26;font-size:12px;text-align:start;white-space:nowrap}
.rt thead th{font-size:11px;color:var(--ink-dim);background:#0D1319;font-weight:600;position:sticky;top:0}
.rt td.n{font-family:var(--mono);text-align:left;direction:ltr}
.rt td.n.m{color:var(--measured)}
.rt td.tk{overflow:hidden;text-overflow:ellipsis;max-width:260px}
.rt tr[data-key]{cursor:pointer}.rt tr[data-key]:hover td{background:var(--panel-raised)}
.nrec{color:var(--ink-dim);font-family:var(--fa)!important;font-size:11.5px}
.opt{color:#9CD3DA}
/* inspector additions */
.toolline{font:11.5px var(--mono);direction:ltr;text-align:left;color:var(--ink-soft);margin:4px 0 2px;overflow-wrap:anywhere}
.toolline b{color:var(--measured)}
.toolline s{color:var(--ink-dim)}
.toolline .bad{color:var(--bad)}
.insp details{margin-top:6px;font-size:12px;color:var(--ink-soft)}
.insp details summary{cursor:pointer;color:var(--ink-dim)}
.insp .plain{margin:10px 0 4px}
.insp .plain .sum{font-size:15px;line-height:1.45;color:var(--ink);margin:0 0 6px}
.insp .plain .sum.none{color:var(--ink-dim);font-size:13px}
.insp .plain ul.done{margin:0 0 6px;padding-inline-start:18px;font-size:12.5px;color:var(--ink-soft)}
.insp .plain .tm{font-size:12.5px;color:var(--ink-soft);margin:0}
.file.w{color:var(--warn)}
`

/** The client half of the control room. Like officeClient it is written
 *  into the page as source, so it must not use anything that only Node has.
 *  officeClient calls it once with its helpers and gets the renderers back. */
function controlRoom(h) {
  const { esc, fa, hhmm, ms, span, cleanTask, isHeavy, T, k, usd, errTxt } = h
  const LATE_MS = 2 * 3600000 // a gate waiting longer than this turns red
  const STALE_MS = 24 * 3600000 // older than this, "dismiss all" offers to close it
  const TOOLS = ['Read', 'Grep', 'Glob', 'Edit', 'Write', 'Bash', 'PowerShell', 'Agent']
  const TOOL_SHORT = { PowerShell: 'PS' }
  const KIND = { A: 'A', B: 'B', C: 'C', approval: T('OK') }
  const WHO = { user: 'u', supervisor: 's', agent: 'a' }
  const WHO_FA = { u: T('You'), s: T('Supervisor'), a: T('Agents'), o: T('Waiting for you') }

  const st = { armed: '', msg: {}, busy: '', sent: [], dwho: '', dproj: '', dsel: '', hl: '' }
  const hm = (v) => { const m = Math.max(0, Math.round(v / 60000)); return Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0') }
  const clip = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s }
  const id4 = (id) => String(id || '').slice(-4)
  const APPROVAL_FA = { approve: T('Approve'), decline: T('Decline') }
  const said = (g, a) => (g && g.kind === 'approval' && APPROVAL_FA[a] ? APPROVAL_FA[a] : a)
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
    if (g.kind === 'approval') html += btn('approve', T('Approve'), 'yes') + btn('decline', T('Decline'), 'no')
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
      '<span class="wh"><span class="gl">' + esc(KIND[g.kind] || g.kind) + '</span>' + esc(clip(g.label || g.question, 34)) +
      '<span class="age">' + (late ? '⚠ ' : '') + hm(age) + '</span></span>' +
      '<span class="wq">' + esc((g.project ? g.project + ': ' : '') + g.question) + '</span>' +
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
        return '<li class="' + cls + '" title="' + esc(tip) + '"><b>' + esc(KIND[g.kind] || g.kind) + '</b>' + esc(clip(g.label || g.question, 12)) + mark + '</li>'
      })
      for (const kd of ['A', 'B', 'C']) if (!seen.has(kd)) steps.push('<li><b>' + kd + '</b>—</li>')
      return '<div class="pipe"><div class="pipe-h">' + esc(proj) + (round ? ' <span>' + esc(round) + '</span>' : '') + '</div><ol class="gsteps">' + steps.join('') + '</ol></div>'
    }).join('')
  }

  /** What is no longer waiting, newest first: answers and dismissals, with
   *  whether the supervisor has read the ones given on this page. */
  function given(S) {
    const closed = (g) => (g.status === 'answered' ? ms(g.answeredAt) : g.status === 'expired' ? ms(g.expiredAt || g.updatedAt) : NaN)
    const list = gatesOf().filter((g) => !isNaN(closed(g))).sort((a, b) => closed(b) - closed(a))
    if (!list.length) return '<p class="none">' + T('Nothing answered or dismissed yet.') + '</p>'
    const day = (t) => (t >= S.dayStart ? '' : new Date(t).toLocaleDateString(LANG === 'fa' ? 'fa-IR' : 'en-GB', { day: 'numeric', month: 'short' }) + ' ')
    return '<ul class="given">' + list.slice(0, 15).map((g) => {
      const t = closed(g)
      const own = (g.history || []).some((x) => x.via === 'dashboard')
      const what = g.status === 'expired' ? '<span class="dim">' + T('dismissed') + '</span>' : '<span class="ans">«' + esc(said(g, g.answer)) + '»</span>'
      const read = own ? ' <span class="rd ' + (g.seen ? 'yes' : 'no') + '">' + (g.seen ? T('read by the supervisor') : T('not read yet')) + '</span>' : ''
      return '<li><time dir="ltr">' + day(t) + hhmm(t) + '</time><span>' + esc(clip(g.label || g.question, 40)) + ' — ' + what + read + '</span></li>'
    }).join('') + '</ul>' + (list.length > 15 ? '<p class="none">' + fa(list.length - 15) + T(' older ones not shown') + '</p>' : '')
  }

  // inside an office the rail shows that office's questions (st.only)
  const shown = () => waiting().filter((g) => !st.only || st.only(g))

  function rail(S, mode) {
    const w = shown()
    const elsewhere = waiting().length - w.length
    let html = '<h2 id="rail-h">' + T('Waiting for you') + ' <b>' + fa(w.length) + '</b><button type="button" class="x" data-railclose="1">' + T('Close ✕') + '</button></h2>'
    html += '<p class="hint">' + (canAnswer() ? T('Answer here, or reply to the supervisor in the chat. Oldest first.')
      : LIVE ? T('Answer the supervisor in the chat. To answer from here, restart the dashboard server once.')
        : T('Answer the supervisor in the chat. Answering from here only works while the page is open from the local server.')) + '</p>'
    // an answered gate leaves the list at once; say so where it was
    st.sent = st.sent.filter((x) => S.now - x.at < 20000)
    html += st.sent.map((x) => '<p class="ansmsg ok" role="status">' + (x.dismissed ? esc(clip(x.shown, 40)) + T(' dismissed.') : '«' + esc(clip(x.shown, 40)) + T('” recorded. The supervisor picks it up from answers.jsonl.')) + '</p>').join('')
    html += w.length ? w.map((g) => waitCard(S, g)).join('') : '<p class="none">' + T('Nothing is waiting for you.') + '</p>'
    if (elsewhere > 0) html += '<p class="none">' + fa(elsewhere) + T(' more in other offices') + '</p>'
    // questions that sat for a day are nearly always settled in the chat already
    const stale = w.filter((g) => ageOf(g, S.now) > STALE_MS)
    if (canAnswer() && stale.length > 1) {
      const armed = st.armed === 'dis|*'
      html += '<button type="button" class="bulk' + (armed ? ' armed' : '') + '" data-dis="*"' + (st.busy ? ' disabled' : '') + '>' + (armed ? T('Click again to dismiss ') : T('Dismiss all older than 24 h ')) + '(' + fa(stale.length) + ')</button>'
    }
    if (mode === 'use') html += '<div class="sect">' + T('Where did the tokens go? ') + '<span class="src">' + T('summary for today') + '</span></div>' + where(S)
    html += '<div class="sect">' + T('Gates per project') + '</div>' + pipes(S)
    html += '<div class="sect">' + T('Answered and dismissed') + '</div>' + given(S)
    return html
  }

  function mini(S) {
    const w = shown()
    let html = '<button type="button" class="ttl" data-railopen="1" aria-label="' + T('Open the waiting-for-you rail, ') + fa(w.length) + T(' items') + '">' + T('Waiting for you') + ' ' + fa(w.length) + '</button>'
    html += w.slice(0, 9).map((g) => {
      const age = ageOf(g, S.now), late = age > LATE_MS
      return '<button type="button" class="mr' + (late ? ' late' : '') + '" data-railopen="' + esc(g.id) + '" aria-label="' + esc(T('Gate ') + (KIND[g.kind] || g.kind) + T(', ') + (g.project || '') + T(', ') + g.question + T(', ') + hm(age)) + '"><b>' + esc(KIND[g.kind] || g.kind) + '</b><span>' + hm(age) + '</span></button>'
    }).join('')
    if (!w.length) html += '<span class="mr zero" aria-hidden="true"><b>—</b></span>'
    return html
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
        name: who === 'a' ? (d.agent || (S.byId.get(d.run) || {}).agent || T('agent')) : WHO_FA[who],
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
    const chip = (key, label, count, color) => '<button type="button" class="fchip" data-dwho="' + key + '" aria-pressed="' + (st.dwho === key) + '"' + (color ? ' style="color:' + color + '"' : '') + '>' + label + ' <b>' + fa(count) + '</b></button>'
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
      html += '<p class="empty">' + (all.length ? T('Nothing matches this filter.') : T('No decision or gate logged today. The supervisor logs them with <code dir="ltr">--decision</code> and <code dir="ltr">--gate</code>.')) + '</p></div>'
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
      // cannot be clicked: nudge each one that has close neighbours up or down
      const near = placed[lane].filter((q) => Math.abs(q - p) < 1.4).length
      placed[lane].push(p)
      const nudge = near ? ';margin-top:' + (-6 + [0, -10, 10, -5, 5][near % 5]) + 'px' : ''
      let html = '<button type="button" class="mk ' + cls + (st.dsel === id ? ' sel' : '') + '" style="right:' + p.toFixed(2) + '%' + nudge + '" data-dsel="' + esc(id) + '" aria-label="' + esc(hhmm(t) + ' ' + label) + '"></button>'
      if (label && Math.abs(p - labelled[lane]) > 8) { labelled[lane] = p; html += '<span class="mlab" style="right:' + p.toFixed(2) + '%">' + esc(clip(label, 22)) + '</span>' }
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
    const lane = (key, top) => '<div class="lane" style="top:' + top + 'px"><div class="lh"><span class="dw ' + key + '"><i></i>' + esc(WHO_FA[key]) + '</span></div><div class="track">' +
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
    if (opT) html += '<p class="say">' + fa(op.length) + T(' heavy-model runs took ') + '<b>' + fa(Math.round(opT / tot * 100)) + T('%</b> of tokens and <b>') + fa(time ? Math.round(opTime / time * 100) : 0) + T('%</b> of the time.') + '</p>'
    const big = runs.slice().sort((a, b) => (b.tokTotal || 0) - (a.tokTotal || 0))[0]
    if (big) html += '<p class="say">' + T('Largest single run: ') + '<span dir="ltr" class="mono">' + esc(big.agent) + '</span> · ' + esc(clip(cleanTask(big.task), 50)) + ' (<b>' + k(big.tokTotal) + '</b>).</p>'
    let rr = null
    for (const r of runs) {
      const t = tr(r)
      if (!t) continue
      for (const f of t.files) if (f.read >= 5 && (!rr || f.read > rr.n)) rr = { r, n: f.read, f: f.path }
    }
    // word order differs enough between the two languages (verb-final in
    // Persian) that a simple prefix/suffix T() swap would misplace the file
    // name span, so this one sentence is built per language, not via T().
    if (rr) html += '<p class="say">' + (LANG === 'fa'
      ? '<span dir="ltr" class="mono">' + esc(rr.r.agent) + ' ' + esc(id4(rr.r.id)) + '</span> فایل <span dir="ltr" class="mono">' + esc(rr.f.split(/[\\/]/).pop()) + '</span> را <b>' + fa(rr.n) + '</b> بار خواند — نشانهٔ خواندن تکراری (قانون ۹.۲).'
      : '<span dir="ltr" class="mono">' + esc(rr.r.agent) + ' ' + esc(id4(rr.r.id)) + '</span> read <span dir="ltr" class="mono">' + esc(rr.f.split(/[\\/]/).pop()) + '</span> <b>' + fa(rr.n) + '</b> times — a sign of repeated reading (rule 9.2).') + '</p>'
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
      : '<dd>' + (costKnown.length ? usd(cost) : '—') + (costKnown.length < runs.length ? '<small>' + fa(runs.length - costKnown.length) + T(' no data') + '</small>' : '') + '</dd>'
    let html = '<dl class="kpis">' +
      '<div class="kpi m"><dt>' + T('Tokens today') + '</dt><dd>' + k(tot) + '<small>' + T('excludes cache reads') + '</small></dd></div>' +
      '<div class="kpi"><dt>' + T('Heavy-model share') + '</dt><dd>' + (tot ? fa(Math.round(opT / tot * 100)) + T('%') : '—') + '<small>' + fa(opRuns.length) + T(' of ') + fa(runs.length) + T(' runs') + '</small></dd></div>' +
      '<div class="kpi m"><dt>' + T('Tool calls') + '</dt><dd>' + fa(tools) + '</dd></div>' +
      '<div class="kpi"><dt>' + T('Agent work time') + '</dt><dd>' + hm(time) + '<small>' + T('hours') + '</small></dd></div>' +
      '<div class="kpi"><dt>' + T('Cost (USD)') + '</dt>' + costDd + '</div>' +
      '<div class="kpi"><dt>' + T('No data') + '</dt><dd style="color:var(--ink-dim)">' + fa(nodata) + '<small>' + T('runs without a transcript') + '</small></dd></div></dl>'
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
      return '<tr><th scope="row" title="' + esc(a.name) + '">' + esc(clip(a.name, 17)) + ' ×' + fa(a.n) + '</th><td><div class="hbar">' +
        (a.op ? '<i class="op" style="width:' + (a.op / max * 100).toFixed(1) + '%"></i>' : '') +
        (a.sn ? '<i class="sn" style="width:' + (a.sn / max * 100).toFixed(1) + '%"></i>' : '') +
        (!t ? '<i class="nr" style="width:12%"></i>' : '') + '</div></td>' +
        (t ? '<td class="v">' + k(t) + (a.live ? '…' : '') + '</td>' : '<td class="v nrec">' + T('not recorded') + '</td>') + '</tr>'
    }).join('')
    return '<section class="box" aria-labelledby="h-tok"><h3 id="h-tok">' + T('Tokens by agent') + ' <span>' + T('from the transcript; input + cache writes + output') + '</span></h3>' +
      (rows ? '<table class="hb">' + rows + '</table>' : '<p class="empty">' + T('No runs today.') + '</p>') +
      '<div class="lg"><span><i style="background:var(--opus)"></i>' + T('Heavy models') + '</span><span><i style="background:var(--sonnet)"></i>' + T('Other models') + '</span><span><i style="background:repeating-linear-gradient(135deg,#3A4757 0 3px,transparent 3px 6px);border:1px solid #3A4757"></i>' + T('not recorded') + '</span><span class="dim">' + T('… = still running') + '</span></div></section>'
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
        if (c) return '<td><span class="mc u' + (c >= 40 ? ' hi' : '') + (ok ? '' : ' bad') + '" title="' + esc(tool) + (ok ? '' : T(' — not allowed in the definition')) + '">' + fa(c) + '</span></td>'
        if (!ok) return '<td><span class="mc n" title="' + esc(tool) + T(' not allowed in the definition') + '">·</span></td>'
        return '<td><span class="mc z">' + fa(0) + '</span></td>'
      })
      const other = Object.entries(a.counts).filter(([n]) => !TOOLS.includes(n))
      const oc = other.reduce((s, [, c]) => s + c, 0)
      cells.push('<td>' + (oc ? '<span class="mc u" title="' + esc(other.map(([n, c]) => n + ' ' + c).join(T(', '))) + '">' + fa(oc) + '</span>' : '<span class="mc z">' + fa(0) + '</span>') + '</td>')
      return '<tr><th scope="row" title="' + esc(a.name) + (al === null ? T(' — built-in agent, its allowed tools are not known here') : '') + '">' + esc(clip(a.name, 17)) + '</th>' + cells.join('') + '</tr>'
    }).join('')
    return '<section class="box" aria-labelledby="h-mx"><h3 id="h-mx">' + T('Tools: allowed vs used') + ' <span>' + T('number = calls today') + '</span></h3>' +
      (rows ? '<table class="mx"><thead><tr><th scope="col"></th>' + TOOLS.map((t) => '<th scope="col">' + (TOOL_SHORT[t] || t) + '</th>').join('') + '<th scope="col">' + T('Other') + '</th></tr></thead><tbody>' + rows + '</tbody></table>' : '<p class="empty">' + T('No runs today.') + '</p>') +
      '<div class="lg"><span><i style="background:rgba(86,182,194,.3);border:1px solid rgba(86,182,194,.5)"></i>' + T('used') + '</span><span><i style="border:1px dashed #3A4757"></i>' + T('allowed, 0 calls') + '</span><span><i style="background:repeating-linear-gradient(135deg,#3A4757 0 3px,transparent 3px 6px)"></i>' + T('not allowed in the definition') + '</span></div></section>'
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
        (r.toolTotal ? '<td class="n m">' + fa(r.toolTotal) + '</td>' : nr) +
        '<td class="n">' + (changed === null ? '—' : fa(changed)) + '</td>' +
        '<td class="n">' + fa(ds.length) + (open ? ' <span style="color:var(--gate)">+' + fa(open) + T(' open') + '</span>' : '') + '</td></tr>'
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
      '<div><dt>' + T('Tools') + '</dt><dd style="color:var(--measured)">' + (r.toolTotal ? fa(r.toolTotal) : '<span class="nrec">' + T('not recorded') + '</span>') + '</dd></div>' +
      '<div><dt>' + T('Cost') + '</dt><dd>' + (typeof r.costUsd === 'number' ? usd(r.costUsd) : '<span class="nrec">' + (t && !(DATA.prices && DATA.prices.set) ? T('no price') : '—') + '</span>') + '</dd></div></dl>'
    if (!t) {
      const why = r.transcript && r.transcript.reason === 'missing' ? T('The transcript file is no longer there.') : r.live ? T('This run transcript has not been found yet.') : T('This run transcript was not recorded.')
      return html + '<p class="muted" style="margin:4px 0 0">' + T('Tools and files: ') + why + '</p>'
    }
    const used = Object.entries(t.toolCounts || {}).sort((a, b) => b[1] - a[1])
    const zero = al && al !== 'all' ? [...al].filter((n) => !t.toolCounts[n]) : []
    html += '<div class="toolline">' + used.map(([n, c]) => '<span' + (al && al !== 'all' && !al.has(n) ? ' class="bad" title="' + T('not allowed in the definition') + '"' : '') + '>' + esc(n) + ' <b>' + fa(c) + '</b></span>').join(' · ') +
      (zero.length ? ' · ' + zero.map((n) => '<s>' + esc(n) + ' ' + fa(0) + '</s>').join(' · ') : '') + '</div>'
    if (t.tokens && t.tokens.cacheRead) html += '<p class="muted" style="margin:2px 0 0">' + T('Cache reads: ') + '<span dir="ltr" class="mono">' + k(t.tokens.cacheRead) + '</span></p>'
    const changed = t.files.filter((f) => f.edit + f.write > 0)
    const read = t.files.filter((f) => !(f.edit + f.write))
    html += '<h3 class="sect">' + T('Files') + ' <span class="dim">· ' + fa(changed.length) + T(' changed, ') + fa(read.length) + T(' read') + (t.hiddenFiles ? T(', ') + fa(t.hiddenFiles) + T(' hidden') : '') + '</span></h3>'
    const name = (f) => { const p = f.path.split(/[\\/]/); return p.slice(-2).join('/') }
    if (changed.length) html += '<div class="files">' + changed.map((f) => '<span class="file w" title="' + esc(f.path + ' — ' + (f.write ? 'Write ' + f.write : '') + (f.edit ? ' Edit ' + f.edit : '')) + '">' + esc(name(f)) + '</span>').join('') + '</div>'
    else html += '<p class="muted" style="margin:2px 0">' + T('No file changed.') + '</p>'
    if (read.length) html += '<details><summary>' + fa(read.length) + T(' files read') + '</summary><div class="files">' + read.map((f) => '<span class="file" title="' + esc(f.path + ' — Read ' + f.read) + '">' + esc(name(f)) + (f.read > 1 ? ' ×' + fa(f.read) : '') + '</span>').join('') + '</div></details>'
    if (t.hiddenFiles) html += '<p class="muted" style="margin:4px 0 0">' + fa(t.hiddenFiles) + T(' confidential files (keys, licences, documents) were only counted, their names are not shown.') + '</p>'
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
    // errTxt gives the Persian text where the message is shown
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
      const body = await post('api/answer', { gate: id, answer: value })
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

  return { st, rail, mini, decisions, usage, inspectorExtra, answer, dismiss, waiting, shown, canAnswer, post }
}

function officeClient() {
  const QUIET_MIN = 10 // minutes without a step before a working agent counts as quiet
  const STATUS = {
    running: { fa: T('Working'), g: '▶' },
    ok: { fa: T('No issues'), g: '✓' },
    findings: { fa: T('Has findings'), g: '!' },
    failed: { fa: T('Failed'), g: '✕' },
    stopped: { fa: T('Stopped'), g: '■' },
  }
  const stOf = (s) => (Object.prototype.hasOwnProperty.call(STATUS, s) ? s : 'ok')

  const $ = (id) => document.getElementById(id)
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const fa = (n) => (LANG === 'fa' ? String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]) : String(n))
  // date locales: 'fa-IR' gives the Persian calendar; the English ones are
  // the same ones the pre-i18n English-only page used (en-CA for the short
  // y-m-d dates, en-GB for the header's long weekday/day/month/year date).
  const SHORT_LOCALE = LANG === 'fa' ? 'fa-IR' : 'en-CA'
  const HDR_LOCALE = LANG === 'fa' ? 'fa-IR' : 'en-GB'
  const ms = (iso) => { const t = new Date(iso).getTime(); return isNaN(t) ? NaN : t }
  const hhmm = (t) => { const d = new Date(t); return isNaN(d) ? '' : String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') }
  const span = (v) => {
    const s = Math.max(0, Math.floor(v / 1000)); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60)
    return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(s % 60).padStart(2, '0')
  }
  // numbers on the Persian page: Persian digits and the Persian decimal point
  const fnum = (s) => (LANG === 'fa' ? String(s).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]).replace(/\./g, '٫') : String(s))
  const k = (n) => (n >= 1e6 ? fnum((n / 1e6).toFixed(2)) + T('M') : n >= 1e4 ? fnum(Math.round(n / 1000)) + T('k') : n >= 1000 ? fnum((n / 1000).toFixed(1)) + T('k') : fnum(Math.round(n || 0)))
  const usd = (n) => '$' + fnum(n >= 100 ? n.toFixed(0) : n.toFixed(2))
  // A server message shown to the person: known ones have a Persian text; any
  // other keeps its English words behind a Persian "unexpected error".
  const errTxt = (m) => {
    m = String(m == null ? '' : m)
    if (LANG !== 'fa') return m
    if (Object.prototype.hasOwnProperty.call(FA, m)) return FA[m]
    let x = /^(no such (?:office|employee): )(.*)$/.exec(m)
    if (x) return T(x[1]) + x[2]
    x = /^Company data was written by a newer dashboard \(v(\d+)\)\. Editing is disabled\.$/.exec(m)
    if (x) return T('Company data was written by a newer dashboard (v') + fa(x[1]) + T('). Editing is disabled.')
    x = /^HTTP (\d+)$/.exec(m)
    if (x) return T('Server error ') + fa(x[1])
    return T('Unexpected error') + ' (' + m + ')'
  }
  const minsFa = (v) => fa(Math.max(0, Math.round(v / 60000)))
  const cleanTask = (t) => String(t || '').replace(/\s*\(under\s+[^)]*\)\s*/gi, ' ').trim()
  // the heavy tier (AGENT-RULES rule 3): model names that start with one of the
  // prefixes in config.json "heavyModels" (default: Opus)
  const isHeavy = (m) => { const s = String(m || '').toLowerCase(); return (DATA.heavy || ['Opus']).some((p) => p && s.startsWith(String(p).toLowerCase())) }

  // Frontmatter colour -> shirt colour, muted so it never reads as a status.
  const ROLE = {
    blue: '#4F7FD9', green: '#4E9E6E', orange: '#D07F3A', red: '#B8504E', cyan: '#3E9AA6',
    purple: '#8468C2', pink: '#C2628F', yellow: '#C9A63A',
  }
  // Hair and skin per agent, so two agents in the same colour still differ.
  const LOOK = {
    'implementer': ['#2B1D14', '#E0B48C'], 'tester': ['#A8652E', '#F0C9A0'], 'release-builder': ['#111111', '#C68A5E'],
    'release-manager': ['#8C8C8C', '#E8BE96'], 'code-reviewer': ['#3A2A1E', '#D9A77C'], 'security-reviewer': ['#111111', '#9C6B48'],
    'data-migration': ['#D9B46A', '#F2CFAE'], 'architecture-reviewer': ['#6E6E6E', '#E3B58E'], 'performance': ['#4A2F1F', '#B97F57'],
    'domain-validator': ['#1E1E1E', '#DDB08A'], 'spec-writer': ['#7A3E22', '#EFC7A4'], 'ui-designer': ['#1B1B1B', '#D6A07A'],
    'ux-reviewer': ['#B5793E', '#F1CDA8'], 'visual-qa': ['#2E2018', '#C9936A'], 'user-guide': ['#5B3A26', '#E6BC93'],
    'dev-docs': ['#999999', '#DCAE86'], 'docs-explainer': ['#161616', '#E9C29C'], 'agent-builder': ['#6B4226', '#D2A07B'],
  }
  const HAIRS = ['#2B1D14', '#111111', '#6E6E6E', '#A8652E', '#5B3A26', '#D9B46A']
  const SKINS = ['#E0B48C', '#C68A5E', '#F0C9A0', '#9C6B48', '#DDB08A', '#B97F57']
  const hash = (s) => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h }

  // Departments and their desks, in floor grid units. Who sits where comes
  // from homeDesks() over the agents that exist; an agent with no desk there
  // takes a guest desk while it works.
  const DEPTS = {
    build: { fa: T('Build & release'), slots: [[1, 2], [4.5, 2], [1, 5], [4.5, 5]] },
    review: { fa: T('Review'), slots: [[8, 2], [10.5, 2], [13, 2], [8, 5], [10.5, 5], [13, 5]] },
    docs: { fa: T('Docs'), slots: [[16, 2], [19, 2], [16, 5], [19, 5]] },
    design: { fa: T('Design & spec'), slots: [[1, 9], [4.5, 9], [1, 12], [4.5, 12]] },
  }
  let HOME = homeDesks(DATA.agents).seats
  // Guest desks for built-in or unknown agents (Explore, general-purpose, …),
  // only drawn while someone sits at one.
  const GUEST = [[12.6, 8.3], [12.7, 12.3]]
  const LOUNGE = [
    { kind: 'sofa', at: [16.7, 8.75], z: 10 }, { kind: 'sofa', at: [17.8, 8.75], z: 10 }, { kind: 'sofa', at: [18.9, 8.75], z: 10 },
    { kind: 'stand', at: [20.9, 9.2], z: 0 }, { kind: 'sofa', at: [20.65, 10.95], z: 9 },
    { kind: 'stand', at: [17.4, 12.2], z: 0 }, { kind: 'stand', at: [19.0, 12.6], z: 0 },
    { kind: 'stand', at: [16.3, 11.1], z: 0 }, { kind: 'stand', at: [20.6, 12.9], z: 0 },
  ]

  // ---------- pixel people
  const STAND = ['..hhhh..', '.hhhhhh.', '.hssssh.', '.sesses.', '..ssss..', '.cccccc.', 'cccccccc', 'cdccccdc',
    's.cccc.s', '..pppp..', '..pppp..', '..p..p..', '..p..p..', '.kk..kk.']
  const SEAT = STAND.slice(0, 8)
  const HANDS = 's.cccc.s'
  const SOFA = STAND.slice(0, 9).concat(['.pppppp.', '.pp..pp.'])
  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16)
    const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)))
    return '#' + ((1 << 24) | (f(n >> 16) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).slice(1)
  }
  let AGENT = new Map()
  const CR = controlRoom({ esc, fa, hhmm, ms, span, cleanTask, isHeavy, agents: () => AGENT, T, k, usd, errTxt })
  function palette(agent, dim) {
    let hair, skin, shirt
    if (agent === 'supervisor') { hair = '#3A3A3A'; skin = '#D9A77C'; shirt = '#56606C' } else if (agent === 'board') { hair = '#C8A24A'; skin = '#F0C8A0'; shirt = '#C9A63A' } else {
      const look = (Object.prototype.hasOwnProperty.call(LOOK, agent) && LOOK[agent]) || [HAIRS[hash(agent) % HAIRS.length], SKINS[hash(agent + '.') % SKINS.length]]
      hair = look[0]; skin = look[1]
      const def = AGENT.get(agent)
      shirt = (def && Object.prototype.hasOwnProperty.call(ROLE, def.color) && ROLE[def.color]) || '#6F7B88'
    }
    const p = { h: hair, s: skin, e: '#1A1A1A', c: shirt, d: shade(shirt, 0.72), p: '#2F3A48', k: '#1B222B' }
    if (dim) for (const k of Object.keys(p)) p[k] = shade(p[k], 0.78)
    return p
  }
  function grid(rows, pal, px, x, y, extra) {
    let out = ''
    rows.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) {
        const ch = row[c]
        if (ch !== '.') out += '<rect x="' + (x + c * px) + '" y="' + (y + r * px) + '" width="' + px + '" height="' + px + '" fill="' + pal[ch] + '"/>'
      }
    })
    return '<g ' + (extra || '') + '>' + out + '</g>'
  }
  // anchor (x, y) = bottom centre of the sprite
  function sprite(kind, agent, x, y, px, opts) {
    opts = opts || {}
    const pal = palette(agent, opts.dim)
    const left = x - (8 * px) / 2
    if (kind === 'seat') {
      const top = y - 9 * px
      if (!opts.typing) return grid(SEAT, pal, px, left, top) + grid([HANDS], pal, px, left, top + 8 * px)
      // the two hands tap in turn, so typing reads at a glance
      return grid(SEAT, pal, px, left, top) + grid(['..cccc..'], pal, px, left, top + 8 * px) +
        grid(['s.......'], pal, px, left, top + 8 * px, 'class="hl"') + grid(['.......s'], pal, px, left, top + 8 * px, 'class="hr"')
    }
    if (kind === 'sofa') return grid(SOFA, pal, px, left, y - SOFA.length * px)
    const top = y - STAND.length * px
    let s = grid(STAND, pal, px, left, top)
    if (opts.paper) s += '<rect x="' + (left + 2 * px) + '" y="' + (top + 7 * px) + '" width="' + 4 * px + '" height="' + 3 * px + '" fill="#F4F1EA" stroke="#B9B2A3" stroke-width="0.6"/>'
    return s
  }
  // A walking figure, drawn in its own little svg that CSS moves along a path
  // (offset-path) in office coordinates; its two leg frames swap in turn.
  const LEGS_A = ['..p..p..', '.p....p.', 'kk....kk']
  const LEGS_B = ['..p..p..', '..p..p..', '.kk..kk.']
  function walker(agent, path, dur, el, paper) {
    const pal = palette(agent)
    let s = grid(STAND.slice(0, 11), pal, 3, 0, 0) + grid(LEGS_A, pal, 3, 0, 33, 'class="lf1"') + grid(LEGS_B, pal, 3, 0, 33, 'class="lf2"')
    if (paper) s += '<rect x="6" y="21" width="12" height="9" fill="#F4F1EA" stroke="#B9B2A3" stroke-width="0.6"/>'
    return '<svg class="walker" width="24" height="42" viewBox="0 0 24 42" shape-rendering="crispEdges" aria-hidden="true"' +
      ' style="offset-path:path(\'' + path + '\');animation-duration:' + dur.toFixed(2) + 's;animation-delay:' + (-el).toFixed(2) + 's"><g class="wb">' + s + '</g></svg>'
  }
  function portrait(agent, px, dim) {
    const pal = palette(agent, dim)
    const rows = STAND.slice(0, 9)
    const w = 10 * px, h = rows.length * px + px
    return '<svg class="portrait" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" shape-rendering="crispEdges" aria-hidden="true">' + grid(rows, pal, px, px, px) + '</svg>'
  }

  // ---------- isometric geometry
  const H = 26, Q = 13, X0 = 426, Y0 = 150
  const P = (gx, gy, z) => [X0 + (gx - gy) * H, Y0 + (gx + gy) * Q - (z || 0)]
  const pts = (arr) => arr.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ')
  const poly = (arr, fill, extra) => '<polygon points="' + pts(arr) + '" fill="' + fill + '" ' + (extra || '') + '/>'
  function box(gx, gy, w, d, h, z, top, left, right) {
    return '<g>' +
      poly([P(gx, gy + d, z), P(gx + w, gy + d, z), P(gx + w, gy + d, z + h), P(gx, gy + d, z + h)], left) +
      poly([P(gx + w, gy, z), P(gx + w, gy + d, z), P(gx + w, gy + d, z + h), P(gx + w, gy, z + h)], right) +
      poly([P(gx, gy, z + h), P(gx + w, gy, z + h), P(gx + w, gy + d, z + h), P(gx, gy + d, z + h)], top) + '</g>'
  }

  // ---------- walking routes, in floor grid units
  // Everyone walks along the corridor south of the partitions (y 7.7). The
  // top departments are entered through the gaps between partitions, and a
  // desk is reached down the free column just west of it, so a route never
  // cuts straight through a partition.
  const LOUNGE_DOOR = [17.6, 11.6]
  const HANDIN_AT = [9.4, 12.3]
  function toDesk(gx, gy) {
    const col = gx - 0.35
    const gate = gy < 7 ? (gx < 7.3 ? 6.8 : gx < 14.9 ? 14.3 : 15.5) : null
    const out = gate === null ? [[col, 7.7]] : [[gate, 7.7], [gate, 6.6], [col, 6.6]]
    return out.concat([[col, gy - 0.4], [gx + 0.4, gy - 0.4]])
  }
  function routePath(list) {
    const p = list.map(([gx, gy]) => P(gx, gy))
    let len = 0
    for (let i = 1; i < p.length; i++) len += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1])
    // about a desk width a second: slow enough to follow, short enough not to bore
    return { d: 'M' + p.map((q) => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(' L'), dur: Math.min(5.5, Math.max(2, len / 120)) }
  }
  const arrivalRoute = (from, desk) => routePath([from || LOUNGE_DOOR, [15.2, 7.9]].concat(toDesk(desk[0], desk[1])))
  const handInRoute = (desk) => routePath(toDesk(desk[0], desk[1]).reverse().concat([[8.6, 7.7], [8.6, 11.8], HANDIN_AT]))

  // ---------- state
  let sel = null          // { key } of the selected run, or { agent }
  let mode = 'office'     // campus | office | org | dec | use
  let officeId = ''       // the office on the floor, when a company is set up
  let railOpen = false    // the folded rail, opened over the page
  let drawerOpen = false
  let filter = ''
  let view = { z: 1, x: 0, y: 0 } // zoom on top of the fit, and pan in screen px
  try {
    const saved = JSON.parse(sessionStorage.getItem('agent-office') || '{}')
    sel = saved.sel || null; drawerOpen = !!saved.drawer; filter = saved.filter || ''
    if (['office', 'dec', 'use', 'campus', 'org', 'act', 'tasks', 'appr', 'team', 'dlv', 'set'].includes(saved.mode)) mode = saved.mode
    if (typeof saved.office === 'string') officeId = saved.office
    const v = saved.view
    if (v && [v.z, v.x, v.y].every((n) => typeof n === 'number' && isFinite(n))) view = { z: v.z, x: v.x, y: v.y }
  } catch { /* a private window simply forgets */ }
  const remember = () => {
    try { sessionStorage.setItem('agent-office', JSON.stringify({ sel, drawer: drawerOpen, filter, view, mode, office: officeId })) } catch { /* ignore */ }
    syncHash()
  }

  // ---------- the company: campus, offices, org chart (agent-company-page.cjs)
  // Every screen has an address (#/campus, #/office/<id>, #/org), so a
  // bookmark or a link opens it; the server needs no new page for that.
  const CO = COMPANY && COMPANY.configured ? companyViews({
    esc, fa, hhmm, ms, T, isHeavy, k, usd, errTxt,
    portrait: (a, px, dim) => portrait(a, px, dim), sprite: (k, a, x, y, px, o) => sprite(k, a, x, y, px, o),
    post: (u, b) => CR.post(u, b), redraw: () => renderAll(), go: (to) => navigate(to), refresh: () => fetchCompany(true),
  }) : null
  const HASH = { campus: 'campus', org: 'org', decisions: 'dec', usage: 'use', office: 'office', activity: 'act', tasks: 'tasks', approvals: 'appr', team: 'team', deliverables: 'dlv', settings: 'set' }
  const AV = activityView({ esc, fa, hhmm, ms, T, cleanTask, redraw: () => renderAll() })
  // the 1.0 screens (everyone-page.cjs): tasks, approvals, team, deliverables, settings, the wizard
  const EV = everyoneViews({ esc, fa, T, errTxt, k, post: (u, b) => CR.post(u, b), redraw: () => redrawLater(), refresh: () => fetchCompany(true) })
  function fromHash() {
    const m = /^#\/(campus|org|decisions|usage|office|activity|tasks|approvals|team|deliverables|settings)(?:\/([\w-]+))?/.exec(location.hash || '')
    if (!m) return false
    mode = HASH[m[1]]
    if (m[2]) officeId = m[2]
    return true
  }
  function syncHash() {
    const h = mode === 'office' ? (CO ? '#/office/' + officeId : '#/office') : '#/' + Object.keys(HASH).find((k) => HASH[k] === mode)
    if (location.hash !== h) try { history.replaceState(null, '', h) } catch { /* a file: page may refuse; the view still changes */ }
  }
  function fixOffice() {
    if (!CO) { if (mode === 'org') mode = 'office'; return }
    const list = CO.officeList()
    if (!list.some((o) => o.id === officeId)) officeId = (list.find((o) => o.leadEmployeeId === 'supervisor') || list[0] || { id: 'unassigned' }).id
  }
  function navigate(to) {
    if (to === 'campus' || to === 'org' || EV.MODES.includes(to)) mode = to
    else if (/^office:/.test(to)) { mode = 'office'; officeId = to.slice(7); sel = null }
    fixOffice()
    railOpen = false; omenuOpen = ''
    remember()
    renderAll()
  }
  let omenuOpen = ''        // '' | 'office' | 'legacy': which menu under the view tabs is open
  let hadSaved = false
  try { hadSaved = !!sessionStorage.getItem('agent-office') } catch { /* ignore */ }
  if (!fromHash() && CO && !hadSaved) mode = 'campus'
  fixOffice()
  window.addEventListener('hashchange', () => { if (fromHash()) { fixOffice(); renderAll() } })

  // Panel and drawer sizes outlive the session, so they go to localStorage.
  // dho is the open shift board's height; null means "all the way up".
  let companyTag = '', companyGone = false
  const LAYOUT_KEY = 'agent-office-layout'
  const LAYOUT_DEF = { iw: 380, dh: 132, dho: null }
  let lay = Object.assign({}, LAYOUT_DEF)
  try {
    const l = JSON.parse(localStorage.getItem(LAYOUT_KEY) || '{}')
    for (const k of ['iw', 'dh', 'dho']) if (typeof l[k] === 'number' && isFinite(l[k])) lay[k] = l[k]
  } catch { /* storage blocked: the defaults will do */ }
  const saveLayout = () => { try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(lay)) } catch { /* ignore */ } }

  // Motion. Everything below is keyed by the moment it began, and each
  // redraw hands CSS a negative animation-delay, so a walk that is cut by a
  // redraw carries on from where it was instead of starting over.
  const RM = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null
  const calm = () => !!(RM && RM.matches)
  let prev = null            // what the last drawing showed
  let S_FULL = null          // the last derived state of the whole company, for the office menu
  const arrive = new Map()   // agent -> { t0, from } walking from the lounge to the desk
  let handWalk = null        // { key, t0, desk } walking a report to the supervisor
  const newsAt = new Map()   // run key -> when its latest step arrived
  let bubK = 1               // how much labels are counter-scaled at this zoom

  function derive() {
    const now = Date.now()
    const d0 = new Date(); d0.setHours(0, 0, 0, 0)
    AGENT = new Map(DATA.agents.map((a) => [a.name, a]))
    const byId = new Map()
    const active = DATA.active.map((a) => {
      const steps = Array.isArray(a.steps) && a.steps.length ? a.steps : (a.doing ? [{ at: a.startedAt, text: a.doing }] : [])
      const lastAt = steps.length ? ms(steps[steps.length - 1].at) : ms(a.startedAt)
      const quiet = now - (isNaN(lastAt) ? now : lastAt)
      const r = Object.assign({}, a, { live: true, key: 'a:' + a.id, steps, start: ms(a.startedAt), end: now, lastAt, quiet, stale: quiet >= QUIET_MIN * 60000 })
      if (a.id) byId.set(a.id, r)
      return r
    })
    const all = DATA.runs.map((r) => {
      const end = ms(r.finishedAt)
      const start = ms(r.startedAt) || (r.durMs ? end - r.durMs : NaN)
      const x = Object.assign({}, r, { live: false, key: 'r:' + (r.id || r.finishedAt + '|' + r.agent + '|' + String(r.task || '').slice(0, 40)), start, end, steps: Array.isArray(r.steps) ? r.steps : null })
      if (r.id) byId.set(r.id, x)
      return x
    })
    const today = all.filter((r) => r.end >= d0.getTime()).sort((a, b) => a.end - b.end)
    const busy = new Map()
    for (const a of active) {
      const list = busy.get(a.agent) || []
      list.push(a); busy.set(a.agent, list)
    }
    for (const list of busy.values()) list.sort((a, b) => b.lastAt - a.lastAt)
    const lastRun = all.slice().sort((a, b) => b.end - a.end)[0] || null
    return { now, active, today, all, byId, busy, lastRun, dayStart: d0.getTime() }
  }

  function deskMap(S) {
    // the agents can change while the page is open (a definition added)
    HOME = homeDesks(DATA.agents).seats
    if (CO) return CO.desks(S, officeId, { DEPTS, HOME, GUEST })
    const desks = new Map()
    for (const [name, [dept, i]] of Object.entries(HOME)) desks.set(name, DEPTS[dept].slots[i])
    // Guest desks go to whoever is working without a desk, first come first seated.
    let g = 0
    for (const a of S.active) {
      if (desks.has(a.agent)) continue
      if (g < GUEST.length) desks.set(a.agent, GUEST[g++])
    }
    return desks
  }

  function selected(S) {
    if (sel && sel.key) {
      const hit = S.active.find((a) => a.key === sel.key) || S.all.find((r) => r.key === sel.key)
      if (hit) return hit
      // the selected run finished: follow it to its record
      const id = sel.key.slice(2)
      const done = S.all.find((r) => r.id && r.id === id)
      if (done) { sel = { key: done.key }; return done }
    }
    if (sel && sel.agent) {
      const list = S.busy.get(sel.agent)
      if (list) return list[0]
      const last = S.today.filter((r) => r.agent === sel.agent).pop()
      if (last) return last
    }
    // nothing chosen: the busiest thing on the floor
    const recent = S.active.slice().sort((a, b) => b.lastAt - a.lastAt)[0]
    return recent || S.today[S.today.length - 1] || null
  }

  const parentOf = (S, r) => (r.parentId ? S.byId.get(r.parentId) || { agent: '', id: r.parentId, missing: true } : null)
  const childrenOf = (S, r) => (r.id ? S.active.concat(S.today).filter((x) => x.parentId === r.id) : [])

  // ---------- the office
  function scene(S, desks, current) {
    const items = []
    const overlays = []
    const add = (depth, s) => items.push([depth, s])

    let base = ''
    base += poly([P(0, 14, 0), P(22, 14, 0), P(22, 14, -12), P(0, 14, -12)], '#161D26')
    base += poly([P(22, 0, 0), P(22, 14, 0), P(22, 14, -12), P(22, 0, -12)], '#11171F')
    base += poly([P(0, 0), P(22, 0), P(22, 14), P(0, 14)], '#C9C0AE')
    for (let i = 1; i < 22; i++) base += '<line x1="' + P(i, 0)[0] + '" y1="' + P(i, 0)[1] + '" x2="' + P(i, 14)[0] + '" y2="' + P(i, 14)[1] + '" stroke="#BFB5A1" stroke-width="1"/>'
    for (let j = 1; j < 14; j++) base += '<line x1="' + P(0, j)[0] + '" y1="' + P(0, j)[1] + '" x2="' + P(22, j)[0] + '" y2="' + P(22, j)[1] + '" stroke="#C3BAA7" stroke-width="0.6"/>'
    const carpet = (a, b, c, d, fill) => poly([P(a, c), P(b, c), P(b, d), P(a, d)], fill)
    base += carpet(7.6, 14.6, 7.6, 13.8, '#B7AE9C')
    base += carpet(15.4, 21.8, 9.6, 13.6, '#A9B3AE')
    base += poly([P(0, 0, 0), P(22, 0, 0), P(22, 0, 70), P(0, 0, 70)], '#2A3442')
    base += poly([P(0, 0, 0), P(0, 14, 0), P(0, 14, 70), P(0, 0, 70)], '#222B37')
    base += '<polyline points="' + pts([P(0, 14, 70), P(0, 0, 70), P(22, 0, 70)]) + '" fill="none" stroke="#3A4757" stroke-width="3"/>'
    for (const wx of [2, 5, 8.5, 13.5, 16, 19]) {
      base += poly([P(wx, 0, 26), P(wx + 1.8, 0, 26), P(wx + 1.8, 0, 58), P(wx, 0, 58)], '#34465A')
      base += poly([P(wx + 0.1, 0, 28), P(wx + 0.6, 0, 28), P(wx + 1.1, 0, 56), P(wx + 0.6, 0, 56)], '#3F566D')
    }

    // project boards on the left wall: the projects that had work today
    const proj = new Map()
    const bump = (k, f) => { if (!k) return; const e = proj.get(k) || { run: 0, done: 0, findings: 0, failed: 0 }; f(e); proj.set(k, e) }
    S.active.forEach((a) => bump(a.projectKey, (e) => e.run++))
    S.today.forEach((r) => bump(r.projectKey, (e) => { e.done++; if (r.status === 'findings') e.findings++; if (r.status === 'failed') e.failed++ }))
    const boards = [...proj.entries()].sort((a, b) => (b[1].run - a[1].run) || (b[1].done - a[1].done)).slice(0, 3)
    boards.forEach(([name, e], i) => {
      const gy0 = 0.6 + i * 4.5
      const flag = e.failed ? 'x ' + fa(e.failed) + T(' failed') : e.findings ? '! ' + fa(e.findings) + T(' with findings') : ''
      base += poly([P(0, gy0, 18), P(0, gy0 + 4.0, 18), P(0, gy0 + 4.0, 60), P(0, gy0, 60)], '#E9E4D8')
      base += poly([P(0, gy0, 18), P(0, gy0 + 4.0, 18), P(0, gy0 + 4.0, 21), P(0, gy0, 21)], '#9C9484')
      const [tx, ty] = P(0, gy0 + 3.8, 52)
      const title = name.length > 15 ? name.slice(0, 14) + '…' : name
      base += '<g transform="matrix(0.894,-0.447,0,1,' + tx + ',' + ty + ')" font-family="Consolas, monospace">' +
        '<text x="0" y="0" font-size="10.5" font-weight="700" fill="#1D2530" direction="ltr">' + esc(title) + '</text>' +
        '<text x="0" y="14" font-size="9.5" fill="#39414C" direction="ltr">' + fa(e.run) + T(' running · ') + fa(e.done) + T(' in') + '</text>' +
        '<text x="0" y="27" font-size="9.5" fill="' + (flag ? '#8A2F2A' : '#39414C') + '" direction="ltr">' + (flag || T('no open issue')) + '</text></g>'
    })
    // the wall clock tells the real time
    const [cx, cy] = P(11.5, 0, 50)
    const t = new Date(S.now)
    const ha = ((t.getHours() % 12) + t.getMinutes() / 60) / 12 * 2 * Math.PI
    const ma = t.getMinutes() / 60 * 2 * Math.PI
    base += '<ellipse cx="' + cx + '" cy="' + cy + '" rx="9" ry="11" fill="#E9E4D8" stroke="#9C9484" stroke-width="2"/>' +
      '<line x1="' + cx + '" y1="' + cy + '" x2="' + (cx + Math.sin(ma) * 7).toFixed(1) + '" y2="' + (cy - Math.cos(ma) * 8).toFixed(1) + '" stroke="#1D2530" stroke-width="1.4"/>' +
      '<line x1="' + cx + '" y1="' + cy + '" x2="' + (cx + Math.sin(ha) * 4.5).toFixed(1) + '" y2="' + (cy - Math.cos(ha) * 5.5).toFixed(1) + '" stroke="#1D2530" stroke-width="1.8"/>'
    const floorText = (gx, gy, text) => {
      const [x, y] = P(gx, gy)
      return '<text transform="matrix(0.894,0.447,-0.894,0.447,' + x + ',' + y + ')" font-family="Tahoma, sans-serif" font-size="12" font-weight="700" fill="#453E32" direction="rtl" text-anchor="middle">' + text + '</text>'
    }
    base += floorText(3.6, 6.6, DEPTS.build.fa) + floorText(11.4, 6.6, DEPTS.review.fa) + floorText(18.6, 6.6, DEPTS.docs.fa)
    // a company office: its head sits at the round table; HQ's head is the supervisor
    const lead = desks.lead === undefined ? 'supervisor' : desks.lead
    base += floorText(3.6, 13.8, DEPTS.design.fa) + floorText(11.1, 13.6, lead && lead !== 'supervisor' ? T('Lead desk') : T('Supervisor desk')) + floorText(18.6, 13.9, T('Break room'))

    const part = (gx, gy, w, d) => add(gx + w / 2 + gy + d / 2 - 0.4, box(gx, gy, w, d, 18, 0, '#6F7B88', '#4E5966', '#44505C'))
    part(0, 7.0, 6.2, 0.18); part(8.4, 7.0, 5.4, 0.18); part(16.2, 7.0, 5.8, 0.18)
    part(7.3, 0.6, 0.18, 5.6); part(14.9, 0.6, 0.18, 5.6)

    // desks, and whoever is working at them
    const guestSet = new Set(GUEST.map((g) => g.join(',')))
    for (const [agent, [gx, gy]] of desks) {
      const isGuest = guestSet.has(gx + ',' + gy)
      const runs = S.busy.get(agent)
      const run = runs && runs[0]
      const def = AGENT.get(agent)
      const role = isGuest || !def || !Object.prototype.hasOwnProperty.call(ROLE, def.color) ? '#6F7B88' : ROLE[def.color]
      add(gx + gy - 0.6, box(gx + 0.1, gy - 0.85, 0.6, 0.5, 10, 0, '#3C4652', '#2C343E', '#262D36') +
        box(gx + 0.1, gy - 0.95, 0.6, 0.1, 26, 0, '#3C4652', '#2C343E', '#262D36'))
      let desk = box(gx, gy, 2, 0.9, 14, 0, '#B98A5A', '#8E6640', '#7A5636')
      desk += poly([P(gx, gy + 0.9, 0), P(gx + 2, gy + 0.9, 0), P(gx + 2, gy + 0.9, 3), P(gx, gy + 0.9, 3)], role)
      desk += box(gx + 1.3, gy + 0.05, 0.62, 0.12, 15, 16, '#27303B', '#1F2730', '#1A2029')
      desk += box(gx + 1.53, gy + 0.15, 0.16, 0.16, 2, 14, '#27303B', '#1F2730', '#1A2029')
      const [lx, ly] = P(gx + 1.61, gy + 0.17, 26)
      desk += '<rect x="' + (lx - 1.5) + '" y="' + (ly - 1.5) + '" width="3" height="3" fill="' + (run ? (run.stale ? '#E5A33D' : '#3BE8B0') : '#44505C') + '"/>'
      if ((gx * 7 + gy) % 3 === 0) desk += box(gx + 0.2, gy + 0.2, 0.45, 0.35, 3, 14, '#F2EEE4', '#D8D2C4', '#CBC4B4')
      desk += box(gx + 0.15, gy + 0.08, 0.6, 0.22, 1.5, 14, '#39424D', '#2A313A', '#242A32')
      if (run) {
        // the screen's light spills round the monitor; it pulses while typing
        const [gx2, gy2] = P(gx + 1.61, gy + 0.1, 24)
        desk = '<ellipse cx="' + gx2 + '" cy="' + gy2 + '" rx="24" ry="15" fill="url(#' + (run.stale ? 'mgw' : 'mg') + ')"' + (run.stale ? '' : ' class="glow" style="animation-delay:-' + (hash(agent) % 26) / 10 + 's"') + '/>' + desk
        const [sx, sy] = P(gx + 0.4, gy - 0.4, 16)
        const arr = arrive.get(agent)
        let wait = null
        if (arr) {
          const rt = arrivalRoute(arr.from, [gx, gy])
          const el = (S.now - arr.t0) / 1000
          if (el < rt.dur) { overlays.push({ kind: 'walker', agent, path: rt.d, dur: rt.dur, el }); wait = rt.dur - el }
        }
        const seat = sprite('seat', agent, sx, sy, 3, { typing: !run.stale })
        add(gx + gy + 0.2, wait === null ? seat : '<g class="appear" style="animation-delay:' + wait.toFixed(2) + 's">' + seat + '</g>')
        overlays.push({ kind: 'bubble', run, count: runs.length, x: sx, y: sy - 29, wait })
      }
      add(gx + gy + 1.4, desk)
    }

    // the supervisor's round table and its in-tray
    const [tx, ty] = P(11, 10.7, 16)
    const table = '<ellipse cx="' + tx + '" cy="' + (ty + 7) + '" rx="60" ry="30" fill="#6B4D31"/>' +
      '<ellipse cx="' + tx + '" cy="' + ty + '" rx="60" ry="30" fill="#B98A5A"/>' +
      '<ellipse cx="' + tx + '" cy="' + ty + '" rx="52" ry="25" fill="none" stroke="#A67B4F" stroke-width="1"/>'
    let tray = box(10.5, 10.9, 0.9, 0.7, 3, 16, '#3B4552', '#2C343E', '#262D36')
    S.today.slice(-6).forEach((d, i) => {
      const edge = { ok: '#9FD9C3', findings: '#E5A33D', failed: '#E0625C', stopped: '#A0A9B4' }[stOf(d.status)]
      tray += box(10.56 + (i % 2) * 0.03, 10.95, 0.78, 0.6, 1.6, 19 + i * 1.8, '#F4F1EA', edge, '#D8D2C4')
    })
    const [spx, spy] = P(10.6, 9.35, 16)
    const leadRuns = lead ? S.busy.get(lead) : null
    if (lead) add(19.8, sprite('seat', lead, spx, spy, 3, { typing: !!(leadRuns && !leadRuns[0].stale) }))
    add(21.0, table + tray)
    if (leadRuns) overlays.push({ kind: 'bubble', run: leadRuns[0], count: leadRuns.length, x: spx, y: spy - 29 })
    else if (lead) overlays.push({ kind: 'boss', x: spx, y: spy - 29, name: lead })
    // home staff working in another office: an empty chair that says where (spec R16)
    for (const w of desks.away || []) {
      const [ax, ay] = P(w.desk[0] + 1, w.desk[1] + 0.2, 30)
      overlays.push({ kind: 'away', x: ax, y: ay, agent: w.agent, officeId: w.officeId })
    }
    if (desks.overflow && desks.overflow.length) {
      const [ox, oy] = P(0.6, 13.6)
      overlays.push({ kind: 'ovf', x: ox, y: oy, list: desks.overflow.map((a) => ({ agent: a, run: (S.busy.get(a) || [])[0] })) })
    }
    const trayO = S.today.length ? overlays[overlays.push({ kind: 'tray', n: S.today.length }) - 1] : null
    if (trayO) [trayO.x, trayO.y] = P(10.95, 11.2, 34)
    const handIn = handInOf(S)
    if (handIn) {
      const [hx, hy] = P(HANDIN_AT[0], HANDIN_AT[1])
      let wait = null
      if (handWalk && handWalk.key === handIn.key && handWalk.desk) {
        const rt = handInRoute(handWalk.desk)
        const el = (S.now - handWalk.t0) / 1000
        if (el < rt.dur + 1.6) {
          if (el < rt.dur) overlays.push({ kind: 'walker', agent: handIn.agent, path: rt.d, dur: rt.dur, el, paper: true })
          wait = rt.dur - el
          // the slip leaves the hand, arcs over the table and drops in the tray
          const [ex, ey] = P(10.95, 11.25, 36)
          overlays.push({ kind: 'fly', path: 'M' + hx + ',' + (hy - 20) + ' Q' + ((hx + ex) / 2).toFixed(1) + ',' + (Math.min(hy, ey) - 46).toFixed(1) + ' ' + ex.toFixed(1) + ',' + ey.toFixed(1), wait })
          if (trayO) trayO.wait = wait + 0.8
        }
      }
      const man = sprite('stand', handIn.agent, hx, hy, 3, { paper: !(handWalk && handWalk.key === handIn.key) })
      add(25.4, wait === null ? man : '<g class="appear" style="animation-delay:' + wait.toFixed(2) + 's">' + man + '</g>')
      overlays.push({ kind: 'handin', x: hx, y: hy - 44, run: handIn, wait })
    }

    // lounge furniture
    add(24.6, box(16.1, 8.1, 3.4, 0.35, 26, 0, '#58707D', '#465A66', '#3C4E59'))
    add(25.0, box(16.1, 8.45, 3.4, 0.8, 10, 0, '#6A8491', '#526A77', '#475D69'))
    add(29.4, box(17.2, 10.3, 1.7, 0.9, 8, 0, '#8E6640', '#6E4E31', '#5E4229') + box(17.5, 10.5, 0.2, 0.2, 4, 8, '#F4F1EA', '#D8D2C4', '#CBC4B4'))
    add(30.8, box(20.2, 10.6, 0.95, 0.95, 9, 0, '#6A8491', '#526A77', '#475D69') + box(20.2, 10.5, 0.95, 0.15, 22, 0, '#58707D', '#465A66', '#3C4E59'))
    add(27.9, box(20.1, 7.4, 1.8, 0.7, 20, 0, '#5E6A76', '#48525D', '#3E4751') + box(21.0, 7.5, 0.55, 0.45, 18, 20, '#2A3139', '#20262D', '#1B2026'))
    const [pgx, pgy] = P(15.8, 13.2)
    add(29.2, box(15.5, 12.95, 0.6, 0.6, 12, 0, '#9C6B48', '#7E5337', '#6E472E') +
      '<circle cx="' + pgx + '" cy="' + (pgy - 28) + '" r="13" fill="#4F7A4F"/><circle cx="' + (pgx - 8) + '" cy="' + (pgy - 36) + '" r="9" fill="#5E8C59"/><circle cx="' + (pgx + 7) + '" cy="' + (pgy - 39) + '" r="8" fill="#6A9A63"/>')

    // the lounge: worked today, not working now; latest first
    const seen = new Set()
    const idle = []
    for (const r of S.today.slice().reverse()) {
      if (seen.has(r.agent) || S.busy.has(r.agent) || (handIn && r.agent === handIn.agent)) continue
      seen.add(r.agent); idle.push(r)
    }
    const loungeAt = new Map()
    idle.slice(0, LOUNGE.length).forEach((last, i) => {
      const s = LOUNGE[i]
      const [x, y] = P(s.at[0], s.at[1], s.z)
      loungeAt.set(last.agent, s.at)
      // idle people breathe (on the sofa) or sway (standing), out of step with each other
      const sway = '<g class="' + (s.kind === 'sofa' ? 'breathe' : 'bob') + '" style="animation-delay:-' + (i * 0.7).toFixed(1) + 's">' +
        sprite(s.kind === 'sofa' ? 'sofa' : 'stand', last.agent, x, y, 3, { dim: true }) + '</g>'
      add(s.at[0] + s.at[1] + 0.5, prev && !prev.lounge.has(last.agent) ? '<g class="appear">' + sway + '</g>' : sway)
      overlays.push({ kind: 'idle', agent: last.agent, x, y: y - (s.kind === 'sofa' ? 33 : 42) - 4, last })
    })
    if (idle.length > LOUNGE.length) {
      const [x, y] = P(21.3, 13.6)
      overlays.push({ kind: 'more', x, y, n: idle.length - LOUNGE.length })
    }

    // delegation: a slip travelling from the parent's desk to the child's
    let deleg = ''
    for (const child of S.active) {
      const parent = parentOf(S, child)
      if (!parent || !parent.live || parent.agent === child.agent) continue
      const a = desks.get(parent.agent), b = desks.get(child.agent)
      if (!a || !b) continue
      const [ax, ay] = P(a[0] + 1, a[1] + 1.35)
      const [bx, by] = P(b[0] + 1, b[1] + 1.35)
      const mx = (ax + bx) / 2, my = Math.max(ay, by) + 18
      const d = 'M' + ax + ',' + ay + ' Q' + mx + ',' + my + ' ' + bx + ',' + by
      deleg += '<path class="flow" d="' + d + '" fill="none" stroke="#2B6CB0" stroke-width="2" stroke-dasharray="5 5" opacity="0.9"/>' +
        '<circle cx="' + ax + '" cy="' + ay + '" r="3" fill="#2B6CB0"/><path d="M' + (bx - 6) + ',' + (by - 1) + ' l6,1 l-4,5" fill="none" stroke="#2B6CB0" stroke-width="2"/>'
      overlays.push({ kind: 'deleg', x: mx, y: my + 2, path: d, parent, child })
    }

    items.sort((a, b) => a[0] - b[0])
    const glow = (id, c) => '<radialGradient id="' + id + '"><stop offset="0" stop-color="' + c + '" stop-opacity=".75"/><stop offset=".55" stop-color="' + c + '" stop-opacity=".25"/><stop offset="1" stop-color="' + c + '" stop-opacity="0"/></radialGradient>'
    const svg = '<svg class="iso" width="1060" height="716" viewBox="0 0 1060 716" shape-rendering="crispEdges" aria-hidden="true">' +
      '<defs>' + glow('mg', '#7DF5CF') + glow('mgw', '#F2B75A') + '</defs>' +
      base + '<g shape-rendering="geometricPrecision">' + deleg + '</g>' + items.map((i) => i[1]).join('') + '</svg>'
    return { svg, overlays: layout(overlays, current), loungeAt }
  }

  // a report handed in within the last minute and a half is still being delivered
  const handInOf = (S) => S.today.slice().reverse().find((r) => S.now - r.end < 90000 && !S.busy.has(r.agent)) || null

  // What changed since the last drawing starts a walk, a pulse or a fade.
  // On the first drawing nothing has "changed", so only a run that began
  // (or ended) in the last few seconds is animated.
  function noteMotion(S, desks) {
    const now = S.now
    for (const [agent, a] of arrive) if (now - a.t0 > 8000) arrive.delete(agent)
    for (const [k, t] of newsAt) if (now - t > 1000) newsAt.delete(k)
    if (calm()) { arrive.clear(); handWalk = null; newsAt.clear(); return }
    for (const [agent, runs] of S.busy) {
      const first = runs.reduce((a, b) => (a.start < b.start ? a : b))
      const fresh = prev ? !prev.busy.has(agent) : now - first.start < 6000
      if (fresh && !arrive.has(agent) && desks.has(agent)) arrive.set(agent, { t0: prev ? now : first.start, from: prev && prev.lounge.get(agent) })
      for (const r of runs) if (prev && prev.steps.has(r.key) && prev.steps.get(r.key) !== r.steps.length) newsAt.set(r.key, now)
    }
    const h = handInOf(S)
    if (h && (!handWalk || handWalk.key !== h.key)) {
      const fresh = prev ? !prev.today.has(h.key) : now - h.end < 6000
      const desk = (prev && prev.desks.get(h.agent)) || desks.get(h.agent)
      if (fresh && desk) handWalk = { key: h.key, t0: prev ? now : h.end, desk }
    }
  }

  // Bubbles are placed one at a time, most important first (the selected run,
  // then quiet ones, then the freshest news). Each tries a few sideways
  // offsets; if every one of them would cover a bubble already placed, it
  // shrinks to its name tag, which opens again on hover, focus or selection.
  // Lounge tags are then lifted until they clear everything placed so far.
  // Sizes are in office pixels; at a high zoom the labels are counter-scaled
  // (bubK < 1), take less floor, and fewer of them need to shrink.
  function layout(list, current) {
    const k = bubK
    const placed = []
    const hit = (r) => placed.some((p) => r[0] < p[2] && r[2] > p[0] && r[1] < p[3] && r[3] > p[1])
    const bubbles = list.filter((o) => o.kind === 'bubble')
    const score = (o) => (current && o.run.key === current.key ? 1e15 : 0) + (o.run.stale ? 1e14 : 0) + (o.run.lastAt || 0)
    bubbles.sort((a, b) => score(b) - score(a))
    for (const o of list.filter((o) => o.kind === 'handin' || o.kind === 'boss')) {
      const w = (o.kind === 'boss' ? 60 : 234) * k
      const h = (o.kind === 'boss' ? 22 : 64) * k
      placed.push([o.x - w / 2, o.y - h, o.x + w / 2, o.y])
    }
    for (const o of bubbles) {
      const h = (o.run.stale ? 86 : 68) * k
      o.dx = null
      if (current && o.run.key === current.key) o.forced = true
      for (const dx of [0, -64, 64, -100, 100]) {
        let x = o.x + dx * k
        x = Math.min(Math.max(x, 120 * k), 1060 - 120 * k)
        const r = [x - 118 * k, o.y - h - 2, x + 118 * k, o.y + 8]
        if (r[1] < 0) continue
        if (!hit(r) || o.forced) { o.dx = x - o.x; placed.push(r); break }
      }
      if (o.dx === null) {
        o.mini = true
        o.dx = 0
        const w = (26 + o.run.agent.length * 6.6 + 50) * k
        placed.push([o.x - w / 2, o.y - 22 * k, o.x + w / 2, o.y])
      }
    }
    for (const o of list.filter((o) => o.kind === 'idle')) {
      const w = (22 + o.agent.length * 6.6) * k
      o.lead = null
      for (let lead = 0; lead <= 64; lead += 4) {
        const r = [o.x - w / 2, o.y - lead - 20 * k, o.x + w / 2, o.y - lead]
        if (!hit(r)) { o.lead = lead; placed.push(r); break }
      }
      // no room: only the result glyph shows, the name on hover or focus
      if (o.lead === null) { o.mini = true; o.lead = 0; placed.push([o.x - 10 * k, o.y - 20 * k, o.x + 10 * k, o.y]) }
    }
    return list
  }

  // One animation per label: arriving (held back until its walker sits
  // down), fresh news (a single pulse), or simply new on the floor (fade in).
  function motion(o, id) {
    if (o.wait != null && o.wait > -0.45) return [' appear', 'animation-delay:' + o.wait.toFixed(2) + 's;']
    const t = newsAt.get(id.slice(id.indexOf(':') + 1))
    if (o.kind === 'bubble' && t) return [' news', 'animation-delay:' + ((t - Date.now()) / 1000).toFixed(2) + 's;']
    if (prev && !prev.keys.has(id)) return [' enter', '']
    return ['', '']
  }
  const overlayId = (o) => (o.kind === 'bubble' ? 'b:' + o.run.key : o.kind === 'idle' ? 'i:' + o.last.key : o.kind === 'handin' ? 'h:' + o.run.key : '')

  function overlayHtml(o, current) {
    if (o.kind === 'walker') return walker(o.agent, o.path, o.dur, o.el, o.paper)
    if (o.kind === 'fly') return '<span class="fly" style="offset-path:path(\'' + o.path + '\');animation-delay:' + o.wait.toFixed(2) + 's" aria-hidden="true"></span>'
    if (o.kind === 'bubble') {
      const r = o.run
      const last = r.steps.length ? r.steps[r.steps.length - 1].text : T('Waiting for the first report…')
      const isSel = current && current.key === r.key
      const [mc, ms_] = motion(o, overlayId(o))
      return '<button type="button" class="bub' + (r.stale ? ' stale' : '') + (o.mini && !isSel ? ' mini' : '') + (isSel ? ' sel' : '') + mc +
        '" data-key="' + esc(r.key) + '" style="' + ms_ + 'left:' + o.x + 'px;top:' + o.y + 'px;--dx:' + o.dx + 'px"' +
        ' aria-label="' + esc(r.agent + T(', ') + STATUS.running.fa + (r.stale ? T(', quiet') : '') + T(', ') + last) + '">' +
        '<span class="bh"><b>' + esc(r.agent) + '</b><i class="mdl ' + (isHeavy(r.modelKey) ? 'opus' : 'son') + '">' + esc(r.modelKey || '—') + '</i>' +
        (o.count > 1 ? '<span class="n2">×' + o.count + '</span>' : '') +
        '<span class="el"><span class="qg">◷ </span>▶ <span data-since="' + r.start + '">' + span(Date.now() - r.start) + '</span></span></span>' +
        '<span class="bt">' + esc(last) + '</span>' +
        (r.stale ? '<span class="quiet">' + T('◷ quiet for ') + '<span data-quiet="' + r.lastAt + '">' + minsFa(Date.now() - r.lastAt) + '</span>' + T(' min') + '</span>' : '') +
        '</button>'
    }
    if (o.kind === 'idle') {
      const l = o.last
      const st = stOf(l.status)
      const isSel = current && current.agent === o.agent && !current.live
      const [mc, ms_] = motion(o, overlayId(o))
      return '<button type="button" class="tag' + (o.mini ? ' mini' : '') + (isSel ? ' sel' : '') + mc + '" data-key="' + esc(l.key) + '" style="' + ms_ + 'left:' + o.x + 'px;top:' + (o.y - o.lead) + 'px;--lead:' + o.lead + 'px"' +
        ' aria-label="' + esc(o.agent + T(', ready. Last task: ') + STATUS[st].fa) + '"><b>' + esc(o.agent) + '</b>' +
        '<span class="g g-' + st + '" title="' + STATUS[st].fa + '">' + STATUS[st].g + '</span></button>'
    }
    if (o.kind === 'boss') return '<span class="tag boss" style="left:' + o.x + 'px;top:' + o.y + 'px"><b' + (o.name && o.name !== 'supervisor' ? ' dir="ltr" class="mono"' : '') + '>' + (o.name && o.name !== 'supervisor' ? esc(o.name) : T('Supervisor')) + '</b></span>'
    if (o.kind === 'away') return '<button type="button" class="tag away" data-goto="office:' + esc(o.officeId) + '" style="left:' + o.x + 'px;top:' + o.y + 'px"><b dir="ltr">' + esc(o.agent) + '</b> ' + T('In ') + esc(CO ? CO.oname(CO.officeById(o.officeId)) : o.officeId) + ' →</button>'
    if (o.kind === 'ovf') return '<div class="ovf" style="left:' + o.x + 'px;top:' + o.y + 'px"><b>' + T('Overflow') + '</b> · ' + T('no free desk: ') + o.list.map((w) => '<button type="button" dir="ltr"' + (w.run ? ' data-key="' + esc(w.run.key) + '"' : '') + '>' + esc(w.agent) + '</button>').join(' ') + '</div>'
    if (o.kind === 'tray') return '<button type="button" class="tray-label' + (o.wait != null && o.wait > -0.7 ? ' land' : '') + '" data-open="1" style="' + (o.wait != null && o.wait > -0.7 ? 'animation-delay:' + o.wait.toFixed(2) + 's;' : '') + 'left:' + (o.x + 30) + 'px;top:' + (o.y + 62) + 'px">' + fa(o.n) + T(' reports handed in') + '</button>'
    if (o.kind === 'more') return '<span class="tag more" style="left:' + o.x + 'px;top:' + o.y + 'px">+' + fa(o.n) + T(' more') + '</span>'
    if (o.kind === 'handin') {
      const r = o.run
      const st = stOf(r.status)
      const [mc, ms_] = motion(o, overlayId(o))
      return '<button type="button" class="bub hand g-' + st + mc + '" data-key="' + esc(r.key) + '" style="' + ms_ + 'left:' + o.x + 'px;top:' + o.y + 'px;--dx:-60px"' +
        ' aria-label="' + esc(r.agent + T(' handed in a report: ') + STATUS[st].fa) + '">' +
        '<span class="bh"><b>' + esc(r.agent) + '</b><span class="el"><span class="g g-' + st + '">' + STATUS[st].g + '</span> ' + STATUS[st].fa + ' · ' + hhmm(r.end) + '</span></span>' +
        '<span class="bt">' + esc(r.summary || cleanTask(r.task)) + '</span></button>'
    }
    if (o.kind === 'deleg') {
      return '<span class="deleg" style="left:' + o.x + 'px;top:' + o.y + 'px">' + esc(o.parent.agent) + ' ← ' + esc(o.child.agent) + T(' · delegated ') + '<span dir="ltr">' + hhmm(o.child.start) + '</span></span>' +
        '<span class="runner" style="offset-path:path(\'' + o.path + '\')" aria-hidden="true"></span>'
    }
    return ''
  }

  // ---------- the inspector
  function inspector(S, r) {
    if (!r) {
      const l = S.lastRun
      const st = l ? stOf(l.status) : 'ok'
      return '<h2 class="ih" style="font-family:var(--fa)">' + T('No one has taken a task yet') + '</h2>' +
        '<p class="muted">' + T('When the supervisor gives an agent a task, it sits down at its desk and you see its live log here.') + '</p>' +
        (l ? '<h3 class="sect">' + T('Last report') + '</h3><div class="slip g-' + st + '"><span class="st"><span class="g g-' + st + '">' + STATUS[st].g + '</span> ' + STATUS[st].fa + '</span>' +
          '<b dir="ltr">' + esc(l.agent) + '</b> · ' + esc(l.projectKey || '—') + ' · ' + esc(new Date(l.end).toLocaleDateString(SHORT_LOCALE)) + ' <span dir="ltr">' + hhmm(l.end) + '</span>' +
          '<p>' + esc(l.summary || cleanTask(l.task)) + '</p></div>' : '') +
        '<h3 class="sect">' + fa(DATA.agents.length) + T(' agents, 0 working') + '</h3>' +
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
    if (r.live) news = '<dd class="fa' + (r.stale ? ' warn' : '') + '">' + (r.stale ? '◷ ' : '') + '<span data-quiet="' + r.lastAt + '">' + minsFa(Date.now() - r.lastAt) + '</span>' + T(' min ago') + '</dd>'
    else news = '<dd dir="ltr">' + hhmm(r.end) + '</dd>'
    const who = (x) => '<button type="button" data-key="' + esc(x.key) + '"><b dir="ltr">' + esc(x.agent) + '</b></button>'
    let html = '<div class="who">' + portrait(r.agent, 5, false) +
      '<div><h2 class="ih" dir="ltr">' + esc(r.agent) + '</h2><div class="muted" style="margin:0">' + esc((def && def.title) || (def ? '' : T('agent with no definition in the agent folders'))) + '</div></div></div>' +
      '<div class="chips"><span class="chip st-' + st + '"><span class="g">' + STATUS[st].g + '</span> ' + STATUS[st].fa + '</span>' +
      '<span class="chip mdl ' + (isHeavy(r.modelKey) ? 'opus' : 'son') + '">' + esc((r.modelKey || '—') + (r.effort ? ' · ' + r.effort : '')) + '</span>' +
      (r.projectKey ? '<span class="chip">' + esc(r.projectKey) + '</span>' : '') +
      (r.budgetLevel === 'stop' ? '<span class="chip despite" title="' + T('The supervisor started this run although the budget check said stop') + '">' + T('started despite stop') + '</span>' : '') + '</div>' +
      (twins.length > 1 ? '<div class="twins" role="group" aria-label="' + T('Concurrent runs of this agent') + '">' + twins.map((x, i) => '<button type="button" data-key="' + esc(x.key) + '" class="' + (x.key === r.key ? 'on' : '') + '">' + T('Run ') + fa(i + 1) + '</button>').join('') + '</div>' : '') +
      plainFirst(r, took) +
      '<dl class="kv"><div><dt>' + T('Start') + '</dt><dd dir="ltr">' + startTxt + '</dd></div>' +
      '<div><dt>' + (r.live ? T('Elapsed') : T('Duration')) + '</dt><dd dir="ltr"' + (r.live && !isNaN(r.start) ? ' data-since="' + r.start + '"' : '') + '>' + took + '</dd></div>' +
      '<div><dt>' + (r.live ? T('Last update') : T('Handed in')) + '</dt>' + news + '</div></dl>' +
      CR.inspectorExtra(r) +
      '<h3 class="sect">' + T('Task') + '</h3><p class="task">' + esc(cleanTask(r.task)) + '</p>'
    if (parent) html += '<p class="rel">' + T('Under ') + (parent.missing ? '<span dir="ltr" class="dim">' + esc(parent.id) + '</span>' : who(parent) + ' <span dir="ltr" class="dim">…' + esc(String(parent.id || '').slice(-4)) + '</span>') + '</p>'
    if (kids.length) {
      html += '<p class="rel">' + T('Delegated to ') + kids.map((k) => who(k) + ' <span class="dim">(' + (k.live ? STATUS.running.fa + T(', ') + minsFa(Date.now() - k.start) + T(' min') : STATUS[stOf(k.status)].g + ' ' + STATUS[stOf(k.status)].fa) + ')</span>').join(T(', ')) + '</p>'
    }
    html += '<h3 class="sect">' + (r.live ? T('Live log') : T('Log')) + (steps && steps.length ? ' <span class="dim">· ' + fa(steps.length) + T(' steps') + '</span>' : '') + '</h3>'
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
    const plainTook = !tms ? '—' : mins < 1 ? T('under a minute') : (hh ? fa(hh) + T(' h') + ' ' : '') + (mm || !hh ? fa(mm) + T(' min') : '')
    void took
    return html + '<p class="tm">' + plainTook + ' · ' + money + '</p></div>'
  }

  // ---------- the drawer: today's slips, and when open, the shift board
  function drawer(S, current) {
    const counts = { findings: 0, failed: 0 }
    S.today.forEach((d) => { if (counts[d.status] !== undefined) counts[d.status]++ })
    const list = S.today.slice().reverse().filter((d) => !filter || d.status === filter)
    const fbtn = (key, label) => '<button type="button" class="f' + (filter === key ? ' on' : '') + '" data-filter="' + key + '" aria-pressed="' + (filter === key) + '">' + label + '</button>'
    let html = '<div class="dr-top"><h2 id="dr-h">' + (drawerOpen ? T('Shift board') : T('Handed in today')) + ' <span class="dim">' + fa(S.today.length) + '</span></h2>'
    if (!drawerOpen) {
      html += '<span class="filters" role="group" aria-label="' + T('Filter') + '">' + fbtn('', T('All')) +
        fbtn('findings', '<span class="g g-findings">!</span> ' + T('Has findings ') + fa(counts.findings)) +
        fbtn('failed', '<span class="g g-failed">✕</span> ' + T('Failed ') + fa(counts.failed)) + '</span>'
    } else {
      html += '<span class="dim" style="font-size:12px">' + T('Time flows right to left; each small line is one step, and hatching means more than ') + fa(QUIET_MIN) + T(' minutes of quiet.') + '</span>'
    }
    html += '<button type="button" class="more-btn" data-toggle="1" aria-expanded="' + drawerOpen + '">' + (drawerOpen ? T('Back to the office ↓') : T('Shift board ↑')) + '</button>' +
      '<a class="arch" href="' + ARCHIVE_HREF + '">' + T('Archive of every day') + '</a></div>'
    if (!drawerOpen) {
      if (list.length) {
        html += '<ol class="slips">' + list.map((d) => {
          const st = stOf(d.status)
          return '<li><button type="button" class="slip g-' + st + (current && current.key === d.key ? ' on' : '') + '" data-key="' + esc(d.key) + '">' +
            '<span class="st"><span class="g g-' + st + '">' + STATUS[st].g + '</span> ' + STATUS[st].fa + '</span>' +
            '<span class="sl1"><b>' + esc(d.agent) + '</b><time>' + hhmm(d.end) + '</time></span>' +
            '<span class="sl2">' + esc((d.projectKey || '—') + ' · ' + cleanTask(d.task)) + '</span></button></li>'
        }).join('') + '</ol>'
      } else if (S.today.length) {
        html += '<p class="muted pad">' + T('No report today with this result.') + '</p>'
      } else {
        const l = S.lastRun
        html += '<p class="muted pad">' + T('No report handed in yet today.') + (l ? T(' Last: ') + esc(new Date(l.end).toLocaleDateString(SHORT_LOCALE)) + ' <span dir="ltr">' + hhmm(l.end) + '</span>' + T(', ') + '<span dir="ltr">' + esc(l.agent) + '</span>' + T(', ') + STATUS[stOf(l.status)].fa + '.' : '') + '</p>'
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
      svg.push('<line x1="' + x + '" y1="36" x2="' + x + '" y2="' + Hgt + '" stroke="' + (new Date(m).getMinutes() ? '#141C25' : '#1E2A36') + '" stroke-width="1"/>')
      if (x > nowX + 40) html.push('<span class="sb-tick" style="left:' + x + 'px">' + hhmm(m) + '</span>')
    }
    svg.push('<rect x="12" y="36" width="' + (nowX - 12) + '" height="' + (Hgt - 36) + '" fill="url(#sbfuture)"/>')
    svg.push('<rect x="12" y="44" width="' + (XR - 12) + '" height="' + (ROW + 4) + '" fill="#10161D"/>')
    S.today.forEach((d, i) => {
      const st = stOf(d.status)
      const fresh = i === S.today.length - 1
      html.push('<button type="button" class="sb-slip s-' + st + (fresh ? ' fresh' : '') + (current && current.key === d.key ? ' on' : '') + '" data-key="' + esc(d.key) + '" style="left:' + X(d.end) + 'px;top:' + (52 + (i % 2) * 17) + 'px"' +
        ' aria-label="' + esc(hhmm(d.end) + ', ' + d.agent + ', ' + STATUS[st].fa) + '"><span class="g">' + STATUS[st].g + '</span>' +
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
        ' aria-label="' + esc(r.agent + T(', ') + cleanTask(r.task) + T(', ') + STATUS[st].fa + T(', ') + (isNaN(r.start) ? '' : hhmm(r.start)) + T(' to ') + (r.live ? T('now') : hhmm(r.end))) + '">' + inner.join('') + g + label + '</button>'
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
          '<span>' + esc(txt) + '</span>' + (run.stale ? '<b>' + T('◷ quiet for ') + minsFa(S.now - run.lastAt) + T(' min') + '</b>' : '') + '</button>')
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
    svg.push('<line x1="' + nowX + '" y1="36" x2="' + nowX + '" y2="' + Hgt + '" stroke="#3BE8B0" stroke-width="1.5"/>')
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
      '<li style="top:44px" class="boss">' + portrait('supervisor', 3, false) + '<span class="sb-nm"><b>' + T('Supervisor') + '</b><span>' + T('Reports land on this line · ') + fa(S.today.length) + '</span></span></li>' +
      heads +
      '<li style="top:' + (TOP + order.length * ROW + 4) + 'px" class="absent" title="' + esc(absent.join(' · ')) + '"><span>' + fa(absent.length) + T(' agents had no work today:') + '</span> <span dir="ltr" class="sb-al">' + esc(absent.slice(0, 4).join(' · ')) + (absent.length > 4 ? ' …' : '') + '</span></li></ol>'
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
    $('counts').innerHTML =
      '<li><b class="acc">' + fa(S.active.length) + '</b> <span class="g g-running">▶</span> ' + T('Working') + '</li>' +
      (quiet ? '<li><b class="warn">' + fa(quiet) + '</b> <span class="g warn">◷</span> ' + T('Quiet') + '</li>' : '') +
      '<li><b>' + fa(S.today.length) + '</b> ' + T('handed in') + '</li>' +
      '<li><b class="gate-c">' + fa(CR.shown().length) + '</b> ' + T('waiting for you') + '</li>'
    document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === mode)))
    if (CO) {
      const o = CO.officeById(officeId)
      const tab = $('vtab-office')
      if (tab) tab.textContent = T('Office') + (o && mode === 'office' ? ' · ' + CO.oname(o) : '')
      const legacy = $('omenu-legacy')
      if (legacy) {
        legacy.textContent = (mode === 'dec' ? T('Decisions & gates') : mode === 'use' ? T('Tools & usage') : mode === 'org' ? T('Org chart') : mode === 'set' ? T('Settings') : T('More')) + ' ▾'
        legacy.setAttribute('aria-pressed', String(mode === 'dec' || mode === 'use' || mode === 'org' || mode === 'set'))
      }
      const menu = $('omenu')
      if (menu) {
        menu.hidden = !omenuOpen
        if (omenuOpen) {
          const r = $('omenu-' + omenuOpen).getBoundingClientRect()
          menu.style.top = (r.bottom + 4) + 'px'
          menu.style.left = Math.max(8, (LANG === 'fa' ? r.left : r.right - 220)) + 'px'
          menu.innerHTML = omenuOpen === 'legacy'
            ? '<button type="button" data-view="org" aria-current="' + (mode === 'org') + '">' + T('Org chart') + '</button><button type="button" data-view="dec" aria-current="' + (mode === 'dec') + '">' + T('Decisions & gates') + '</button><button type="button" data-view="use" aria-current="' + (mode === 'use') + '">' + T('Details: tools & usage') + '</button><button type="button" data-view="set" aria-current="' + (mode === 'set') + '">' + T('Settings') + '</button>'
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
    el.setAttribute('aria-valuetext', fa(Math.round(v)) + T(' pixels'))
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
      // the panel grows to the right; the drawer grows upward
      const move = (ev) => setSize(axis, axis === 'x' ? v0 + ev.clientX - from : v0 - (ev.clientY - from))
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
      const more = axis === 'x' ? 'ArrowRight' : 'ArrowUp', less = axis === 'x' ? 'ArrowLeft' : 'ArrowDown'
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
    clampView()
    if (ease && !calm()) { inner.classList.add('ease'); clearTimeout(easeT); easeT = setTimeout(() => inner.classList.remove('ease'), 240) }
    clearTimeout(rememberT); rememberT = setTimeout(remember, 400)
    if (viewQueued) return
    viewQueued = true
    requestAnimationFrame(() => {
      viewQueued = false
      const s = fitK * view.z
      inner.style.transform = 'translate(' + ((SW - 1060 * s) / 2 + view.x).toFixed(1) + 'px,' + ((SH - 716 * s) / 2 + view.y).toFixed(1) + 'px) scale(' + s.toFixed(4) + ')'
      inner.style.setProperty('--bs', labelScale().toFixed(3))
      $('zoomv').textContent = fa(Math.round(view.z * 100)) + T('%')
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
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? SH : 1
    const dx = e.deltaX * unit, dy = e.deltaY * unit
    // a sideways swipe (touchpad, or Shift+wheel) pans; everything else zooms.
    // A touchpad pinch arrives as Ctrl+wheel in small steps, hence its larger factor.
    if (!e.ctrlKey && Math.abs(dx) > Math.abs(dy)) { view.x -= dx; applyView(); return }
    const r = stage.getBoundingClientRect()
    zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-Math.max(-60, Math.min(60, dy)) * (e.ctrlKey ? 0.008 : 0.0016)))
  }, { passive: false })

  // Dragging pans. A left-button drag only counts after 5px, so a click on a
  // bubble or a person still selects it; the middle button or a held Space
  // pans at once. The click that ends a drag is swallowed.
  let pan = null, spaceDown = false, swallowClick = false
  stage.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault() }) // no autoscroll
  stage.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.zoombar,.legend')) return
    if (e.button !== 0 && e.button !== 1) return
    pan = { id: e.pointerId, x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, on: false }
    if (e.button === 1 || spaceDown) { e.preventDefault(); startPan(e) }
  })
  function startPan(e) { pan.on = true; stage.setPointerCapture(e.pointerId); stage.classList.add('panning') }
  stage.addEventListener('pointermove', (e) => {
    if (!pan || e.pointerId !== pan.id) return
    const dx = e.clientX - pan.x, dy = e.clientY - pan.y
    if (!pan.on && Math.hypot(dx, dy) > 5) startPan(e)
    if (pan.on) { view.x = pan.vx + dx; view.y = pan.vy + dy; applyView() }
  })
  const endPan = (e) => {
    if (!pan || e.pointerId !== pan.id) return
    if (pan.on) { swallowClick = true; setTimeout(() => { swallowClick = false }, 0) }
    stage.classList.remove('panning')
    pan = null
  }
  stage.addEventListener('pointerup', endPan)
  stage.addEventListener('pointercancel', endPan)
  window.addEventListener('click', (e) => { if (swallowClick) { swallowClick = false; e.stopPropagation(); e.preventDefault() } }, true)
  document.addEventListener('keydown', (e) => {
    // Space held = pan the office. It must leave text fields alone: this used
    // to swallow every space typed into an answer box ("use defaults" -> "usedefaults").
    if (e.key === ' ' && !e.target.closest('button,a,[role=separator],input,textarea,select,[contenteditable]')) { spaceDown = true; e.preventDefault(); return }
    if (e.target !== stage) return
    const pans = { ArrowLeft: [60, 0], ArrowRight: [-60, 0], ArrowUp: [0, 60], ArrowDown: [0, -60] }
    if (pans[e.key]) { view.x += pans[e.key][0]; view.y += pans[e.key][1]; applyView(true) }
    else if (e.key === '+' || e.key === '=') zoomAt(SW / 2, SH / 2, 1.25, true)
    else if (e.key === '-' || e.key === '_') zoomAt(SW / 2, SH / 2, 0.8, true)
    else if (e.key === '0') { view = { z: 1, x: 0, y: 0 }; applyView(true) }
    else return
    e.preventDefault()
  })
  document.addEventListener('keyup', (e) => { if (e.key === ' ') spaceDown = false })
  $('zoombar').addEventListener('click', (e) => {
    const b = e.target.closest('[data-zoom]')
    if (!b) return
    if (b.dataset.zoom === 'fit') { view = { z: 1, x: 0, y: 0 }; applyView(true) }
    else zoomAt(SW / 2, SH / 2, b.dataset.zoom === 'in' ? 1.25 : 0.8, true)
  })
  if (window.ResizeObserver) new ResizeObserver(() => { measure(); applyView() }).observe(stage)

  function renderAll() {
    applyLayout()
    measure(); clampView(); bubK = labelScale()
    const S0 = derive()
    S_FULL = S0
    // the floor shows one office; the campus, the org chart and their counts the whole company
    const S = CO ? CO.scope(S0, officeId) : S0
    const desks = deskMap(S)
    noteMotion(S, desks)
    const current = selected(S)
    const termBox = $('term')
    const stick = !termBox || termBox.scrollTop + termBox.clientHeight >= termBox.scrollHeight - 4
    const sbBox = $('sb')
    const sbTop = sbBox ? sbBox.scrollTop : 0
    // set before the header counts: inside an office they count that office's questions
    CR.st.only = CO && mode === 'office' ? (g) => g.officeId === officeId : null
    header(CO && mode !== 'office' ? S0 : S)
    controlRoomViews(S, S0)
    const { svg, overlays, loungeAt } = scene(S, desks, current)
    $('stage-in').innerHTML = svg + overlays.map((o) => overlayHtml(o, current)).join('')
    $('insp').innerHTML = inspector(S, current)
    const dr = $('drawer')
    dr.classList.toggle('open', drawerOpen)
    dr.innerHTML = drawer(S, current)
    const t = $('term')
    if (t && stick) t.scrollTop = t.scrollHeight
    const sb = $('sb')
    if (sb) sb.scrollTop = sbTop
    prev = {
      busy: new Set(S.busy.keys()), today: new Set(S.today.map((r) => r.key)), desks, lounge: loungeAt,
      keys: new Set(overlays.map(overlayId).filter(Boolean)), steps: new Map(S.active.map((a) => [a.key, a.steps.length])),
    }
    applyView()
  }

  // The rail, the strip and the two other views. The rail is redrawn on every
  // poll, so a half-typed answer and the scroll positions are carried over.
  function controlRoomViews(S, S0) {
    board.classList.toggle('rail-open', railOpen)
    board.classList.toggle('co', !!CO)
    // the campus and the org chart need the width: the rail folds to its strip there
    board.classList.toggle('rail-mini', mode === 'campus' || mode === 'org' || EV.MODES.includes(mode))
    $('v-office').hidden = mode !== 'office'
    $('v-dec').hidden = mode !== 'dec'
    $('v-use').hidden = mode !== 'use'
    $('v-campus').hidden = mode !== 'campus'
    $('v-org').hidden = mode !== 'org'
    $('v-act').hidden = mode !== 'act'
    $('v-ev').hidden = !EV.MODES.includes(mode)
    if (EV.MODES.includes(mode)) EV.render(mode, $('v-ev'))
    EV.renderWizard($('wiz'))
    EV.watch()
    $('ohead').innerHTML = CO && mode === 'office' ? CO.officeHead(S, officeId) : ''
    if (mode === 'campus') {
      $('v-campus').innerHTML = CO ? CO.campus(S0) : '<div class="csetup"><div><h2>' + T('No company set up') + '</h2><p>' + T('The dashboard works as a single office until a company is set up.') + '</p>' + (LIVE ? '<p><button type="button" class="cbtn ok" data-ev="wiz-open">' + T('Set up your company') + '</button></p>' : '') + '<p>' + T('Or from the command line:') + ' <code>arsenale log --company-init --seed &lt;file&gt;</code></p><p>' + T('Deleting the company folder in the data folder brings this view back.') + '</p></div></div>'
      if (CO) { const map = $('v-campus').querySelector('.cmap'); if (map) map.insertAdjacentHTML('beforeend', EV.todayStrip(S0)) }
      if (CO) CO.fit()
    } else if (mode === 'org' && CO) {
      const box = $('v-org').querySelector('.org'), top = box ? box.scrollTop : 0
      $('v-org').innerHTML = CO.org(S0)
      const nb = $('v-org').querySelector('.org')
      if (nb) nb.scrollTop = top
    }
    const railEl = $('rail')
    const act = document.activeElement
    const keep = act && act.dataset && act.dataset.keep && railEl.contains(act) ? { id: act.dataset.keep, a: act.selectionStart, b: act.selectionEnd } : null
    const typed = {}
    railEl.querySelectorAll('input[data-keep]').forEach((i) => { if (i.value) typed[i.dataset.keep] = i.value })
    const railTop = railEl.scrollTop
    railEl.innerHTML = CR.rail(S, mode)
    railEl.scrollTop = railTop
    railEl.querySelectorAll('input[data-keep]').forEach((i) => { if (typed[i.dataset.keep]) i.value = typed[i.dataset.keep] })
    if (keep) {
      const i = [...railEl.querySelectorAll('input[data-keep]')].find((x) => x.dataset.keep === keep.id)
      if (i) { i.focus(); try { i.setSelectionRange(keep.a, keep.b) } catch { /* ignore */ } }
    }
    $('minirail').innerHTML = CR.mini(S)
    if (mode === 'dec') {
      const tb = $('dtbl'), top = tb ? tb.scrollTop : 0
      $('v-dec').innerHTML = CR.decisions(S)
      if ($('dtbl')) $('dtbl').scrollTop = top
    } else if (mode === 'act') {
      const box = $('act'), top = box ? box.scrollTop : 0
      $('v-act').innerHTML = AV.render(S0)
      if ($('act')) $('act').scrollTop = top
    } else if (mode === 'use') {
      const box = $('v-use').querySelector('.runs-box'), top = box ? box.scrollTop : 0
      $('v-use').innerHTML = CR.usage(S)
      const nb = $('v-use').querySelector('.runs-box')
      if (nb) nb.scrollTop = top
    }
  }

  // Control-room clicks: the view switch, the rail, answers and the decision
  // filters. Registered before the office's own click handler, which then
  // selects a run when the target also carries data-key.
  let armT = 0
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-view],[data-railopen],[data-railclose],[data-gate-go],[data-ans],[data-dis],[data-dwho],[data-dsel],[data-go],[data-goto],[data-omenu]')
    if (!t) { if (omenuOpen && !e.target.closest('#omenu')) { omenuOpen = ''; renderAll() } return }
    if (t.dataset.goto) { navigate(t.dataset.goto); return }
    if (t.dataset.omenu) { omenuOpen = omenuOpen === t.dataset.omenu ? '' : t.dataset.omenu; renderAll(); return }
    if (t.dataset.go) { mode = t.dataset.go; railOpen = false; return } // the office handler selects and redraws
    if (t.dataset.view) { mode = t.dataset.view; railOpen = false; omenuOpen = '' }
    else if (t.dataset.railopen) { railOpen = true; CR.st.hl = t.dataset.railopen === '1' ? '' : t.dataset.railopen }
    else if (t.dataset.railclose) { railOpen = false }
    else if (t.dataset.gateGo) { mode = 'dec'; railOpen = false; CR.st.dsel = 'g:' + t.dataset.gateGo; CR.st.dwho = ''; CR.st.dproj = '' }
    else if (t.dataset.ans) {
      const key = t.dataset.ans + '|' + t.dataset.val
      // a button answer takes two clicks, so a stray click cannot approve a push
      if (CR.st.armed !== key) { CR.st.armed = key; clearTimeout(armT); armT = setTimeout(() => { CR.st.armed = ''; renderAll() }, 6000) }
      else { clearTimeout(armT); CR.answer(t.dataset.ans, t.dataset.val, renderAll); return }
    } else if (t.dataset.dis) {
      // closing a question without an answer also takes two clicks
      const key = 'dis|' + t.dataset.dis
      if (CR.st.armed !== key) { CR.st.armed = key; clearTimeout(armT); armT = setTimeout(() => { CR.st.armed = ''; renderAll() }, 6000) }
      else { clearTimeout(armT); CR.dismiss(t.dataset.dis, renderAll, derive()); return }
    } else if (t.dataset.dwho !== undefined) { CR.st.dwho = t.dataset.dwho }
    else if (t.dataset.dsel) { CR.st.dsel = t.dataset.dsel }
    remember()
    renderAll()
    if (t.dataset.gateGo || (t.dataset.dsel && t.classList.contains('mk'))) {
      const row = document.getElementById('row-' + CR.st.dsel.replace(/[^A-Za-z0-9_-]/g, '_'))
      if (row) row.scrollIntoView({ block: 'nearest' })
    }
  })
  document.addEventListener('submit', (e) => {
    const f = e.target.closest('[data-ansform]')
    if (!f) return
    e.preventDefault()
    const v = String(f.elements.a.value || '').trim()
    if (v) CR.answer(f.dataset.ansform, v, renderAll)
  })
  document.addEventListener('change', (e) => {
    if (e.target.id === 'dproj') { CR.st.dproj = e.target.value; renderAll() }
  })

  function tick() {
    const now = Date.now()
    document.querySelectorAll('[data-since]').forEach((e) => { e.textContent = span(now - Number(e.dataset.since)) })
    document.querySelectorAll('[data-quiet]').forEach((e) => { e.textContent = minsFa(now - Number(e.dataset.quiet)) })
    const c = $('clock')
    if (c) c.textContent = hhmm(now)
  }

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-key],[data-toggle],[data-filter],[data-open]')
    if (!t) return
    if (t.dataset.toggle) { drawerOpen = !drawerOpen }
    else if (t.dataset.open) { drawerOpen = true }
    else if (t.dataset.filter !== undefined) { filter = t.dataset.filter }
    else if (t.dataset.key) { sel = { key: t.dataset.key } }
    remember()
    renderAll()
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && omenuOpen) { omenuOpen = ''; renderAll(); return }
    if (e.key === 'Escape' && railOpen) { railOpen = false; renderAll(); return }
    if (e.key === 'Escape' && drawerOpen) { drawerOpen = false; remember(); renderAll() }
    // Enter on a runs-table row opens that run in the office
    if (e.key === 'Enter' && e.target.matches && e.target.matches('tr[data-key]')) e.target.click()
  })
  window.addEventListener('resize', () => { if (drawerOpen) renderAll(); else applyLayout(); if (CO && mode === 'campus') CO.fit() })
  splitter($('split-v'), 'x')
  splitter($('split-h'), 'y')
  $('legend').innerHTML = '<span><span class="g g-running">▶</span> ' + T('Working') + '</span><span><span class="g g-ok">✓</span> ' + T('No issues') + '</span><span><span class="g g-findings">!</span> ' + T('Has findings') + '</span><span><span class="g g-failed">✕</span> ' + T('Failed') + '</span><span><span class="g g-stopped">■</span> ' + T('Stopped') + '</span><span><span class="g warn">◷</span> ' + T('Quiet for more than ') + fa(QUIET_MIN) + T(' min') + '</span>'

  // A redraw replaces every button. One that lands between mouse-down and
  // mouse-up on a button throws that click away, so with agents logging all
  // day some clicks "did nothing". Redraws caused by the clock or by new data
  // wait until the button is released (the 4 s cap: a release lost outside the window).
  let pressedAt = 0, pendingRender = false
  const redrawLater = () => { if (pressedAt && Date.now() - pressedAt < 4000) pendingRender = true; else renderAll() }
  document.addEventListener('pointerdown', () => { pressedAt = Date.now() }, true)
  const released = () => {
    pressedAt = 0
    if (pendingRender) { pendingRender = false; setTimeout(renderAll, 80) } // after the click handlers ran
  }
  document.addEventListener('pointerup', released, true)
  document.addEventListener('pointercancel', released, true)

  renderAll()
  EV.boot()
  setInterval(tick, 1000)
  // the clock alone moves things: quiet agents, the now line, the wall clock
  setInterval(redrawLater, 30000)

  if (LIVE) {
    const shape = (d) => JSON.stringify([d.runs, d.active, d.agents, d.gates, d.decisions, d.prices, d.answers])
    let last = shape(DATA)
    let stateTag = ''
    const badge = $('mode')
    const poll = async () => {
      try {
        // the server answers 304 with no body while nothing changed on disk
        const res = await fetch('api/state', { cache: 'no-store', headers: stateTag ? { 'If-None-Match': stateTag } : {} })
        if (res.status !== 304 && !res.ok) throw new Error('HTTP ' + res.status)
        badge.className = 'live'
        badge.innerHTML = '<i></i> ' + T('Live · every 1.5s')
        if (res.status === 304) return
        stateTag = res.headers.get('ETag') || ''
        const fresh = await res.json()
        const now = shape(fresh)
        if (now === last) return
        last = now
        DATA = fresh
        redrawLater()
      } catch {
        badge.className = 'live stale'
        badge.innerHTML = '<i></i> ' + T('Disconnected from server')
      }
    }
    setInterval(poll, 1500)
    // budgets and spending change slowly: every 5 s, and 304 when nothing did
    setInterval(() => fetchCompany(false), 5000)
  }

  async function fetchCompany(force) {
    if (!LIVE || companyGone) return
    try {
      const res = await fetch('api/company', { cache: 'no-store', headers: companyTag && !force ? { 'If-None-Match': companyTag } : {} })
      // a server started before this code knows no api/company: keep the copy in the page
      if (res.status === 404 || res.status === 405) { companyGone = true; return }
      if (res.status === 304 || !res.ok) return
      companyTag = res.headers.get('ETag') || ''
      const fresh = await res.json()
      // a company just made in the wizard: the page reloads when the wizard closes
      if (!!fresh.configured !== !!(COMPANY && COMPANY.configured)) { if (!EV.st.wiz) location.reload(); return }
      COMPANY = fresh
      if (!(CO && CO.dialogOpen())) redrawLater()
    } catch { /* the state poll already shows the disconnection */ }
  }
}

/** The office page. `live` swaps the self-reloading file for server polling;
 *  `token` (live only) lets the page post answers to the server. */
function renderOffice(state, opts = {}) {
  const live = !!opts.live
  const lang = opts.lang === 'fa' ? 'fa' : 'en'
  const T = (key) => t(lang, key)
  const dir = lang === 'fa' ? 'rtl' : 'ltr'
  const data = JSON.stringify(state).replace(/</g, '\\u003c')
  const archive = live ? 'archive' : 'agent-dashboard-archive.html'
  // the server's per-start secret: only a page it served can post an answer
  const token = live && opts.token ? String(opts.token) : ''
  const refresh = live ? '' : `<meta http-equiv="refresh" content="${state.active.length ? 4 : 15}" />`
  // the company, if one is set up (agent-company.cjs companyState); without it
  // the page is the single office it always was
  // with no company yet the wizard still draws each office pack in its colour
  const company = opts.company && opts.company.configured ? opts.company : { configured: false, themes: require('./agent-company.cjs').THEMES }
  const co = company.configured
  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
${refresh}
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 16 16%27%3E%3Crect width=%2716%27 height=%2716%27 rx=%273%27 fill=%27%230A0F14%27/%3E%3Crect x=%273%27 y=%273%27 width=%2710%27 height=%2710%27 fill=%27%233BE8B0%27/%3E%3C/svg%3E" />
<title>Arsenale</title>
<style>${OFFICE_STYLE}${CR_STYLE}${COMPANY_STYLE}${ACTIVITY_STYLE}${EVERYONE_STYLE}</style>
</head>
<body>
<div class="board" id="board">
  <header class="top">
    <h1${co ? ' class="co"' : ''}>Arsenale${co ? '<span class="brand-b">' + T('BOARD VIEW') + '</span>' : ''}</h1><span class="date" id="date"></span>
    <div class="views" role="group" aria-label="${T('View')}"><button type="button" data-view="campus" aria-pressed="false">${T('Campus')}</button><button type="button" data-view="office" id="vtab-office" aria-pressed="true">${T('Office')}</button>${co
      // the two views from before the company stay one release, under "More" (spec Q11)
      ? '<button type="button" data-omenu="office" id="omenu-office" aria-label="' + T('Choose an office') + '" aria-haspopup="true">▾</button><button type="button" data-view="tasks" aria-pressed="false">' + T('Tasks') + '</button><button type="button" data-view="appr" aria-pressed="false">' + T('Approvals') + '</button><button type="button" data-view="dlv" aria-pressed="false">' + T('Finished work') + '</button><button type="button" data-view="team" aria-pressed="false">' + T('Team') + '</button><button type="button" data-view="act" aria-pressed="false">' + T('Activity') + '</button><button type="button" data-omenu="legacy" id="omenu-legacy" aria-haspopup="true">' + T('More') + ' ▾</button>'
      : `<button type="button" data-view="appr" aria-pressed="false">${T('Approvals')}</button><button type="button" data-view="dec" aria-pressed="false">${T('Decisions & gates')}</button><button type="button" data-view="use" aria-pressed="false">${T('Tools & usage')}</button><button type="button" data-view="act" aria-pressed="false">${T('Activity')}</button><button type="button" data-view="set" aria-pressed="false">${T('Settings')}</button>`}</div>
    <ul class="counts" id="counts" aria-label="${T('Summary')}"></ul>
    <span class="live" id="mode"><i></i> ${live ? T('Live · every 1.5s') : T('Built file · refreshes automatically')}</span>
    ${live ? langSwitch(lang) : ''}
  </header>
  <div class="v-office" id="v-office">
  <aside class="insp" id="insp" aria-label="${T('Agent details')}" aria-live="polite"></aside>
  <main class="stage" id="stage" tabindex="0" aria-label="${T('Office view — mouse wheel or + and - to zoom, drag or arrow keys to pan, 0 to fit')}"><div class="stage-in" id="stage-in"></div><div class="ohead" id="ohead"></div>
    <div class="zoombar" id="zoombar" role="group" aria-label="${T('Office zoom')}"><button type="button" data-zoom="out" title="${T('Zoom out (-)')}" aria-label="${T('Zoom out')}">−</button><output id="zoomv">${T('100%')}</output><button type="button" data-zoom="in" title="${T('Zoom in (+)')}" aria-label="${T('Zoom in')}">+</button><button type="button" class="fitb" data-zoom="fit" title="${T('Fit whole office (0)')}">${T('Fit')}</button><span class="zh">${T('Mouse wheel: zoom · Drag: pan')}</span></div>
    <p class="legend" id="legend"></p></main>
  <section class="drawer" id="drawer" aria-labelledby="dr-h"></section>
  <div class="split split-v" id="split-v" role="separator" aria-orientation="vertical" aria-controls="insp" tabindex="0" title="${T('Drag to resize the panel; double-click: default size')}" aria-label="${T('Details panel width')}"></div>
  <div class="split split-h" id="split-h" role="separator" aria-orientation="horizontal" aria-controls="drawer" tabindex="0" title="${T('Drag to resize the report strip height; double-click: default size')}" aria-label="${T('Report strip height')}"></div>
  </div>
  <main class="vm" id="v-dec" aria-label="${T('Decisions & gates')}" hidden></main>
  <main class="vm" id="v-use" aria-label="${T('Tools & usage')}" hidden></main>
  <main class="vm" id="v-act" aria-label="${T('Activity')}" hidden></main>
  <main class="cv" id="v-campus" aria-label="${T('Campus')}" hidden></main>
  <main class="cv" id="v-org" aria-label="${T('Org chart')}" hidden></main>
  <main class="ev" id="v-ev" hidden></main>
  <aside class="rail" id="rail" aria-labelledby="rail-h"></aside>
  <nav class="mini-rail" id="minirail" aria-label="${T('Waiting for you, collapsed')}"></nav>
</div>
<div class="omenu" id="omenu" hidden></div>
<div class="cdlg-back" id="cdlg" hidden></div>
<div class="wiz-back" id="wiz" hidden></div>
<script>
let DATA = ${data};
const LIVE = ${live};
const ARCHIVE_HREF = ${JSON.stringify(archive)};
let ANSWER_TOKEN = ${JSON.stringify(token)};
let COMPANY = ${JSON.stringify(company).replace(/</g, '\\u003c')};
const homeDesks = (${homeDesks.toString()});
${langScript(lang, live)}
const controlRoom = (${controlRoom.toString()});
const companyViews = (${companyViews.toString()});
const activityView = (${activityView.toString()});
const everyoneArt = (${everyoneArt.toString()});
const everyoneViews = (${everyoneViews.toString()});
(${officeClient.toString()})();
</script>
</body>
</html>
`
}

module.exports = { renderOffice, officeClient, controlRoom, OFFICE_STYLE, CR_STYLE, homeDesks }
