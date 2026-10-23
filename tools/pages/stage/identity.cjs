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
   empty lists get the empty pose, loading the logo spinner, "nothing is waiting" the cheer */
.board.served .ev p.empty,.board.served .vm p.empty{display:flex;flex-direction:column;align-items:flex-start;gap:12px}
.board.served .ev p.empty::before,.board.served .vm p.empty::before,.board.served .ev .dnone::before{content:"";display:block;flex:none;width:112px;height:112px;border-radius:22px;background:#E8F3EC url(mascot/empty.gif) center/cover no-repeat;box-shadow:inset 0 0 0 1px rgba(15,46,40,.05)}
.board.served .ev p.empty[role=status]::before{width:56px;height:56px;border-radius:16px;background-image:url(mascot/loading.gif)}
.board.served .ev .dnone::before{width:140px;height:140px;margin-bottom:14px;background-image:url(mascot/cheer.gif)}
.board.served .ev .drawer p.empty::before,.board.served .ev .pb p.empty::before{width:80px;height:80px;border-radius:18px}
@media (max-width:480px){.board.served .ev p.empty::before,.board.served .vm p.empty::before{width:80px;height:80px}}
.omenu button:hover{background:var(--idle-bg)}
.ev .b.pri,.sign .more .cbtn.go{box-shadow:0 6px 16px rgba(15,46,40,.22)}
`

module.exports = { IDENTITY_STYLE, dsMark, dsLogo, DS_FAVICON }
