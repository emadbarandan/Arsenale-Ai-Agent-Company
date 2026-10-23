/* The Arsenale Design System on the dashboard: its two typefaces, its colours and its logo.
 * Visual only: it comes last in the page's <style>, so it redefines the tokens every screen
 * already reads (--font-ui, --ink, --accent, ...) and recolours the few places that set a
 * colour of their own. No markup, class or layout changes.
 *
 * Fonts: Arsenale Text (400, 500, 600) for everything, Arsenale Sans (400, 600, 700) for
 * titles and big numbers; both embedded as data URIs, so the page still fetches nothing.
 * Colours: forest-green #0F2E28 ink, arsenale-green #0EA36B accent (a fill, never small text
 * on mint), mint-light #E8F3EC page, mint-lighter #F4F9F6, white panels, card-bg #D7E4DC.
 * Text that was accent green is forest-green; status dots keep their meaning. */
const fs = require('fs')
const path = require('path')
const DIR = path.join(__dirname, 'identity')

// a missing file (a copy of the code without its assets) leaves that face or logo out, never the page
const read = (f, enc) => { try { return fs.readFileSync(path.join(DIR, f), enc) } catch { return null } }
const b64 = (f) => { const b = read(f); return b && b.toString('base64') }
const face = (family, file, weight) => !b64(file) ? '' : '@font-face{font-family:"' + family + '";src:url(data:font/woff2;base64,' + b64(file) + ') format("woff2");font-weight:' + weight + ';font-style:normal;font-display:block}'
const FONTS = [
  face('Arsenale Text', 'ArsenaleText-Regular.woff2', 400),
  face('Arsenale Text', 'ArsenaleText-Medium.woff2', 500),
  face('Arsenale Text', 'ArsenaleText-SemiBold.woff2', 600),
  face('Arsenale Sans', 'ArsenaleSans-Regular.woff2', 400),
  face('Arsenale Sans', 'ArsenaleSans-SemiBold.woff2', 600),
  face('Arsenale Sans', 'ArsenaleSans-Bold.woff2', 700),
].join('')

// the logo files of the design system (Logos group), drawn as given
const svg = (f) => (read(f, 'utf8') || '').replace(/<\?xml[^>]*>\s*/, '')
const ICON_SVG = svg('arsenale-icon-primary.svg')
const LOGO_SVG = svg('arsenale-horizontal-primary.svg')
const sized = (s, cls, h) => s.replace('<svg ', '<svg class="' + cls + '" aria-hidden="true" ').replace(/ width="[^"]*" height="[^"]*"/, ' height="' + h + '"')
/** The icon (four blocks) at a given height. */
const dsMark = (h) => sized(ICON_SVG, 'mark', h)
/** The horizontal logo (icon and wordmark) at a given height. */
const dsLogo = (h) => sized(LOGO_SVG, 'dslogo', h)
const DS_FAVICON = 'data:image/svg+xml,' + encodeURIComponent(ICON_SVG).replace(/'/g, '%27')

const IDENTITY_STYLE = FONTS + `
:root{
  --font-ui:"Arsenale Text","Sora",Arial,sans-serif;
  --font-display:"Arsenale Sans","Sora",Arial,sans-serif;
  --forest:#0F2E28;--ds-green:#0EA36B;
  --ink:#0F2E28;--ink-hi:#0F2E28;--ink-soft:#33423D;--ink-dim:#66736D;
  --ground:#E8F3EC;--page:#E8F3EC;--panel:#FFFFFF;--panel-raised:#F4F9F6;--line:#D7E4DC;--line-strong:#A8B8B1;
  --accent:#0EA36B;--accent-h:#0F2E28;--accent-soft:#D7E4DC;--accent-line:rgba(14,163,107,.45);
  --ok:#0EA36B;--ok-bg:#D7E4DC;--idle-bg:#F0F6F2;
  --sh1:0 1px 2px rgba(15,46,40,.06),0 4px 14px rgba(15,46,40,.06);
  --sh2:0 2px 6px rgba(15,46,40,.06),0 18px 44px rgba(15,46,40,.13);
  --pri-grad:linear-gradient(180deg,#19B87B 0%,#0EA36B 60%,#0C935F 100%);
}
body{font-family:var(--font-ui)}
/* svg labels drawn with a font attribute (desk names, campus signs) */
svg text{font-family:var(--font-ui)}

/* ---------- titles and big numbers: Arsenale Sans */
h1,h2,h3,.ctitle h2,.ohead .crumb b,.ih,.ev h1,.ev h2,.ev h3,.vm .fbar h2,.vm .v-card h1,.rail h2,.helpop>b,
.ev .dfocus .dt,.ev .lvbig .pc,.ev .lvh .vtt,.ev .tiles .stat .hi,.vm .kpi dd,.insp .kv dd,.counts b,.ckpi b,
.sign h3,.dock .dtl,.ev .tgh,.ev .tbody b,.ev .rch b.hi,.ev .lrun .lth2>b,.ev .dqh,.org .ocolh{font-family:var(--font-display)}
.ctitle h2,.ohead .crumb b,.ev h1,.vm .fbar h2{letter-spacing:-.01em}

/* ---------- the logo in the top bar: the horizontal logo; the icon alone on narrow screens */
h1.brand .dslogo{display:block;height:26px;width:auto}
h1.brand .mark{display:none}
h1.brand .wm{display:flex;align-items:center}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media (max-width:480px){h1.brand .mark{display:block}}

/* ---------- accent green is a fill; text in it becomes forest-green */
.ctitle p b,.cmap .today button,.dock .dlink,.helpop .hlink,.cmonth .cm-act,.ostats .a,.ostats .a b,.ev .lnk,.ev a.lnk,
.acc,.helpb:hover,.helpb[aria-expanded=true],.drow:hover .dq,.ev .dqt:hover,.btabs button[aria-pressed=true]{color:var(--forest)!important;font-weight:600}
.dock .dlink:hover,.ev .lnk:hover{text-decoration:underline;text-underline-offset:3px;text-decoration-color:var(--ds-green)}

/* ---------- primary actions: a forest pill with a white label (14.6:1) */
.ev .b.pri,.sign .more .cbtn.go{background:var(--forest);color:#FFFFFF;font-weight:600;border-radius:999px;border:0}
.ev .b.pri:hover,.sign .more .cbtn.go:hover{background:#163F37;color:#FFFFFF}

/* ---------- counts and ages: forest ink on card-bg, no orange */
.tc,.dock .cnt{background:var(--accent-soft);color:var(--forest)}
.drow .da,.ev .dq .age{color:var(--ink);font-weight:600}
.drow.late .da,.ev .dq .age.bad,.ev .dfocus .age{color:var(--ink)}
.drow .dk,.ev .dqk{color:var(--ink-dim);font-weight:600}
.views button[aria-pressed=true]{color:var(--forest);font-weight:600}
.seg button[aria-pressed=true],.vm .fchip[aria-pressed=true],.ev .tfil .chip[aria-pressed=true],.helpop button[aria-pressed=true]{color:var(--forest)}

/* ---------- the mascot at key moments (served by the live dashboard at /mascot/; the built file shows text only):
   empty lists get the empty pose, loading the logo spinner, "nothing is waiting" the cheer,
   an empty office the coffee break, help the wave */
.board.served .ev p.empty,.board.served .vm p.empty{display:flex;flex-direction:column;align-items:flex-start;gap:12px}
.board.served .ev p.empty::before,.board.served .vm p.empty::before,.board.served .ev .dnone::before{content:"";display:block;flex:none;width:112px;height:112px;border-radius:22px;background:#E8F3EC url(mascot/empty.gif) center/cover no-repeat;box-shadow:inset 0 0 0 1px rgba(15,46,40,.05)}
.board.served .ev p.empty[role=status]::before{width:56px;height:56px;border-radius:16px;background-image:url(mascot/loading.gif)}
.board.served .ev .dnone::before{width:140px;height:140px;margin-bottom:14px;background-image:url(mascot/cheer.gif)}
.board.served .ev .drawer p.empty::before,.board.served .ev .pb p.empty::before{width:80px;height:80px;border-radius:18px}
/* small empties: an empty task column and "Done without you · Nothing yet" on Decisions */
.board.served .ev .col>p.mut,.board.served .ev .lbl+p.mut.sm{display:flex;flex-direction:column;align-items:flex-start;gap:8px}
.board.served .ev .col>p.mut::before,.board.served .ev .lbl+p.mut.sm::before{content:"";display:block;width:72px;height:72px;border-radius:18px;background:#E8F3EC url(mascot/empty.gif) center/cover no-repeat}
/* an office with no one at work: the inspector's empty state has the coffee break */
.board.served .insp>h2.ih:first-child::before{content:"";display:block;width:120px;height:120px;margin-bottom:14px;border-radius:22px;background:#E8F3EC url(mascot/coffee.gif) center/cover no-repeat}
/* help: the wave says hello */
.board.served .helpop>b{display:flex;align-items:center;gap:12px}
.board.served .helpop>b::before{content:"";flex:none;width:56px;height:56px;border-radius:16px;background:#E8F3EC url(mascot/wave.gif) center/cover no-repeat}
@media (max-width:480px){.board.served .ev p.empty::before,.board.served .vm p.empty::before{width:80px;height:80px}}
/* ---------- states in the design system's colours: no orange, peach or pink fills.
   Working = arsenale-green, waiting for you = forest-green, idle = grey, and stalled or late
   = a small red mark only (a dot, an icon, a word), always on white glass, never a red fill.
   Each state also keeps its word or icon, so colour is never the only sign. */
:root,.ev,.wz{
  --warn:#0F2E28;--warn-ink:#0F2E28;--warn-bg:rgba(14,163,107,.07);
  --gate:#0F2E28;--gate-line:rgba(15,46,40,.2);
  --bad:#C8372D;--bad-ink:#A92B22;--bad-bg:rgba(15,46,40,.04);
  --calm-line:rgba(15,46,40,.12);
}
/* the waiting list in the rail, the dock and the Decisions queue: white glass cards */
.wait,.wait.late{background:linear-gradient(180deg,rgba(255,255,255,.9),rgba(255,255,255,.66));border:0;border-radius:16px;margin:0 0 10px;
  box-shadow:inset 0 1px 0 #FFFFFF,inset 0 0 0 1px rgba(14,163,107,.1),0 8px 22px rgba(14,120,80,.1)}
.wait.hl{box-shadow:inset 0 0 0 2px var(--accent),0 8px 22px rgba(14,120,80,.16)}
.wait .wh .wk,.wh{color:var(--ink-dim)}
.gl,.late .gl{border:0;color:var(--forest);background:none}
.late .gl,.wait.late .wh .ag,.drow.late .da{color:var(--bad-ink)}
.ansbox button,.ansbox button.yes,.ansbox button.no,.needs .nb{border:0;border-radius:999px;background:rgba(255,255,255,.85);box-shadow:inset 0 0 0 1px var(--calm-line);color:var(--ink)}
.ansbox button.yes{color:var(--forest);font-weight:600;box-shadow:inset 0 0 0 1px rgba(14,163,107,.45)}
.ansbox button.no{color:var(--bad-ink)}
.ansbox button.armed,.ansbox button.dis.armed,.ev .b.armed,.wz .b.armed{background:var(--forest);color:#FFFFFF;box-shadow:none}
.ansbox button.dis{box-shadow:none;background:none;color:var(--ink-dim)}
.ansbox input{border:0;border-radius:999px;background:#FFFFFF;box-shadow:inset 0 0 0 1px var(--calm-line)}
/* chips, pills, tags and tiles that used to be peach or pink */
.ev .chip.warn,.ev .lp.warn,.ev .risk.mid,.ev .exp,.ev .pill.waiting,.ev .pill.quiet,.pill.quiet,.pill.waiting,.org .ochip.w,.alert.s{color:var(--forest);background:rgba(14,163,107,.08);border-color:transparent}
.ev .chip.bad,.ev .lp.bad,.ev .pill.stalled,.pill.paused,.chip.despite,.alert.h,.ev .kind.publish,.vr .vchip.bad,.st-failed,.gsteps .lt,.dst.lt,.mc.u.bad{color:var(--bad-ink);background:rgba(255,255,255,.85);border-color:transparent;box-shadow:inset 0 0 0 1px rgba(200,55,45,.25)}
.ev .tile.warn,.ev .tile.bad,.ev .now.w,.ev .qh.hung,.ev .wbox,.ev .mkt-flags,.wz .wt,.b-findings,.b-failed,.mr.late,.ev .dc.lk{background:linear-gradient(180deg,rgba(255,255,255,.9),rgba(255,255,255,.66));border-color:var(--calm-line)}
.ev .tile.warn b{color:var(--forest)}.ev .tile.bad b{color:var(--bad-ink)}
.wz .wt .dot{background:var(--forest);box-shadow:0 0 0 5px rgba(14,163,107,.14)}
.ev .dc.old{border-color:transparent}
.ev table.lt2 tr.rqt,.ev table.lt2 tr.rst,.ev .srow.locked{background:rgba(14,163,107,.05)}
.ev .lside.dead{border-color:var(--calm-line)}
.seg button.never[aria-pressed=true]{background:none;color:var(--bad-ink)}
.tag.boss,.mk.s{background:rgba(14,163,107,.08)}
/* the office: name pills and the "needs a look" card */
.w3card.tone-wait,.w3card.tone-quiet,.w3card.tone-stalled{border-color:transparent;background:rgba(255,255,255,.9)}
.w3card.tone-wait .dot,.w3card.tone-quiet .dot,.w3chip.tone-wait .dot,.w3chip.tone-quiet .dot{background:var(--forest)}
.w3card.tone-wait small,.w3card.tone-quiet small{color:var(--forest)}
.w3card.tone-stalled,.w3card.tone-stalled small{color:var(--bad-ink)}
.iact .warn{color:var(--forest)}
.c3gl.bad{border-color:rgba(200,55,45,.35)}
/* bars: waiting phases forest, stalled red, on the soft track */
.ev .trk.warn i,.ev .bar.thick.warn i{background:var(--forest)}
.waitbar{background:repeating-linear-gradient(135deg,rgba(15,46,40,.22) 0 5px,transparent 5px 10px)}
.sb-hatch{background:repeating-linear-gradient(-45deg,rgba(15,46,40,.3) 0 3px,transparent 3px 7px)}
.ev .b.bad{border-color:transparent;color:var(--bad-ink)}
.ev .kind{background:rgba(14,163,107,.08);color:var(--forest);border-color:transparent}
/* the side drawer (a person, a task, hiring) and dialogs: glass sheets with green shadows */
.ev .ev-drawer,.cdlg{background:linear-gradient(180deg,rgba(255,255,255,.94),rgba(248,252,250,.86));-webkit-backdrop-filter:blur(28px) saturate(1.9);backdrop-filter:blur(28px) saturate(1.9);border:0;box-shadow:inset 1px 0 0 rgba(14,163,107,.1),-18px 0 48px rgba(14,120,80,.12)}
.cdlg{border-radius:22px;padding:20px 22px;box-shadow:inset 0 0 0 1px rgba(14,163,107,.1),0 24px 60px rgba(14,120,80,.18)}
.cdlg-back{background:rgba(15,46,40,.16);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
/* the full-screen setup wizard sits on the same white with a soft green halo */
.wiz-back{background:radial-gradient(55% 45% at 50% 28%,rgba(14,163,107,.11) 0%,transparent 70%),#FFFFFF}
.ev .ev-drawer .stat,.ev .tiles .stat{background:rgba(255,255,255,.7);border:0;border-radius:14px;box-shadow:inset 0 0 0 1px var(--calm-line)}
.ev input[type=text],.ev input[type=search],.ev input[type=number],.ev input:not([type]),.ev textarea,.ev select,.wz input[type=text],.wz textarea,.wz select,.cdlg input[type=text]{background:#FFFFFF;border:0;border-radius:12px;box-shadow:inset 0 0 0 1px var(--calm-line)}
.ev input:focus,.ev textarea:focus,.ev select:focus,.wz input:focus,.wz textarea:focus{outline:2px solid var(--accent);outline-offset:1px}
.ev input[type=checkbox],.wz input[type=checkbox],.ev input[type=radio]{accent-color:var(--forest)}
.rail h2 .x{border:0;border-radius:999px;background:rgba(255,255,255,.8);box-shadow:inset 0 0 0 1px var(--calm-line);padding:3px 10px}
.omenu button:hover{background:var(--idle-bg)}
.ev .b.pri,.sign .more .cbtn.go{box-shadow:0 6px 16px rgba(15,46,40,.22)}
`

module.exports = { IDENTITY_STYLE, dsMark, dsLogo, DS_FAVICON }
