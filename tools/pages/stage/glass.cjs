/* The glass finish over the Stage look, after the Fit Check / GymSight logic: quiet glass,
 * one focus, faded edges. Visual only: it comes after STAGE_STYLE, keeps every layout, markup
 * and class a script or a test reads, and takes its colours from identity.cjs.
 *
 * - Backgrounds are white with soft green halos that fade out, never a flat tint.
 * - Things that float (top bar, dock, rail, menus, the office card and drawer, zoom tools) are
 *   Liquid Glass: a white-to-clear vertical gradient, blur 24 saturate 1.9, a white rim on top.
 * - Content cards are glass cards: 22 px radius, a white rim, a soft far shadow, no border.
 * - No boxes inside: chips and filters are text segments, hand-in slips and "needs a look" rows
 *   are frameless with fading hairlines, banners are a quiet line with a dot.
 * - Labels in sentence case (no capitals), titles big and tight, the primary action a forest pill.
 * Without backdrop-filter, or with reduced transparency, glass falls back to solid white. */
const GLASS_STYLE = `
:root{
  --halo:rgba(14,163,107,.11);--halo-soft:rgba(14,163,107,.06);
  --haze:radial-gradient(55% 45% at 50% 28%,var(--halo) 0%,transparent 70%),radial-gradient(40% 40% at 92% 95%,var(--halo-soft) 0%,transparent 70%),radial-gradient(35% 35% at 4% 70%,var(--halo-soft) 0%,transparent 70%),#FFFFFF;
  --glass-top:rgba(255,255,255,.72);--glass-bottom:rgba(255,255,255,.42);
  --glass:linear-gradient(180deg,var(--glass-top),var(--glass-bottom));
  --glass-solid:rgba(255,255,255,.86);
  --glass-blur:blur(24px) saturate(1.9) brightness(1.04);
  --glass-hi:inset 0 1px 0 rgba(255,255,255,.95),inset 0 0 0 1px rgba(255,255,255,.55);
  --shadow-glass:var(--glass-hi),0 12px 34px rgba(15,46,40,.12);
  --shadow-card:var(--glass-hi),0 18px 44px rgba(15,46,40,.08),0 2px 6px rgba(15,46,40,.04);
  --hair:rgba(15,46,40,.08);
  --hairline:linear-gradient(90deg,transparent,var(--hair) 14%,var(--hair) 86%,transparent);
  --track:#E3EDE7;
  --r-card:22px;--r-sheet:22px;--r-menu:18px;
}

/* ---------- the haze behind every screen */
body,.board,.ev-main,.vm{background:var(--haze)}
.cmap{background:radial-gradient(50% 45% at 58% 42%,var(--halo) 0%,transparent 70%),radial-gradient(35% 35% at 8% 85%,var(--halo-soft) 0%,transparent 70%),#FFFFFF}
.board[data-screen=office],.v-office .stage,.stage.w3on{background:radial-gradient(50% 50% at 42% 48%,var(--halo) 0%,transparent 70%),#FFFFFF}

/* ---------- Liquid Glass: everything that floats */
.top,.dock,.rail,.board.rail-mini .rail,.helpop,.omenu,.cmonth,.cside,.v-office .insp,.v-office .drawer,
.board.co .zoombar,.zoombar,.needs,.legend,.cleg,.ctip,.btabs,.w3proj div,.sign{
  background:var(--glass);-webkit-backdrop-filter:var(--glass-blur);backdrop-filter:var(--glass-blur);
  border:0;box-shadow:var(--shadow-glass)
}
.top{box-shadow:inset 0 -1px 0 var(--hair),0 8px 30px rgba(15,46,40,.05)}
.btabs{box-shadow:inset 0 1px 0 var(--hair),0 -8px 30px rgba(15,46,40,.06)}
.helpop,.omenu,.rail,.board.rail-mini .rail{background:var(--glass-solid)}
.dock,.rail,.board.rail-mini .rail,.helpop,.cside,.v-office .insp,.v-office .drawer{border-radius:var(--r-sheet)}
.needs,.legend,.cleg,.ctip{border-radius:var(--r-menu)}
.omenu{border-radius:var(--r-menu);padding:6px}
.omenu button{border-radius:12px}
.cmonth,.board.co .zoombar,.zoombar{border-radius:999px}
.zoombar button{border-radius:999px}
.w3proj div{border-radius:14px}

/* the status group and ? : quiet capsules in the bar */
.sgrp,.helpb{border:0;background:rgba(255,255,255,.55);box-shadow:inset 0 0 0 1px var(--hair)}
.counts li+li{border-left:0;position:relative}
.counts li+li::before{content:"";position:absolute;left:0;top:25%;bottom:25%;width:1px;background:var(--hair)}
.top .live{border-left:0}
/* the active screen: a dot under the word, the word heavier */
.views button[aria-pressed=true]::after{left:50%;right:auto;width:5px;height:5px;margin-left:-2.5px;bottom:9px;border-radius:50%}
.helpop button{border:0;border-radius:12px;background:rgba(255,255,255,.6);box-shadow:inset 0 0 0 1px var(--hair)}

/* ---------- campus: office cards and the round stage tools */
.sign{border-radius:16px}
.sign:after{background:var(--glass-solid);border-color:transparent}
.sign:hover,.sign:focus-within,.sign.hot{outline:0;box-shadow:0 0 0 2px var(--accent-line),var(--shadow-glass)}
.sign .more{border-top:0;background:var(--hairline) top/100% 1px no-repeat}
.czoom button,.czoom output{background:var(--glass);-webkit-backdrop-filter:var(--glass-blur);backdrop-filter:var(--glass-blur);border:0;border-radius:999px;box-shadow:var(--shadow-glass)}
.czoom .cbuild:hover{background:var(--glass-solid)}

/* ---------- office: name pills, the card's facts, the drawer's slips */
.w3card,.w3chip,.w3card.tone-wait,.w3card.tone-quiet{background:var(--glass-solid);-webkit-backdrop-filter:var(--glass-blur);backdrop-filter:var(--glass-blur);box-shadow:var(--shadow-glass)}
.insp .kv div{background:none;box-shadow:none;border-radius:0;padding:8px 0;border-bottom:1px solid var(--hair)}
.insp .term{background:none;box-shadow:none;border-radius:0}
.insp .sect,.ev .lbl,.vm .box h3,.vm .v-card>h3,.ch,.act h3{text-transform:none;letter-spacing:0;font-weight:600;font-size:13px;color:var(--ink-dim)}
.insp .chips .chip{border-radius:999px}
.dr-top{gap:14px}
.dr-top h2{font-size:16px}
/* filters and toggles in the drawer: text segments, the chosen one heavier with a dot */
.f,.more-btn,.arch{background:none;border:0;border-radius:0;padding:4px 2px;font-size:13px;color:var(--ink-dim);position:relative}
.f.on{color:var(--ink);font-weight:600;border:0}
.f.on::after{content:"";position:absolute;left:50%;bottom:-3px;width:4px;height:4px;margin-left:-2px;border-radius:50%;background:var(--accent)}
.more-btn:hover,.arch:hover,.f:hover{color:var(--ink)}
/* slips: frameless, a status dot instead of the coloured top border, hairlines between */
.slips{gap:0 18px;scrollbar-width:none}
.slips::-webkit-scrollbar{display:none}
.slip{background:none;border:0;border-radius:0;padding:8px 0 8px 14px;position:relative;width:196px;font-size:13px}
.slip::before{content:"";position:absolute;left:0;top:13px;width:6px;height:6px;border-radius:50%;background:var(--idle)}
.slip.g-ok::before{background:var(--accent)}.slip.g-findings::before{background:var(--warn)}.slip.g-failed::before{background:var(--bad)}
.slip::after{content:"";position:absolute;left:14px;right:0;bottom:0;height:1px;background:var(--hairline)}
.slip .st{color:var(--ink-dim)}
.slip .st .g{display:none}
.slip.on{outline:0}.slip.on .sl1 b{text-decoration:underline;text-decoration-color:var(--accent);text-underline-offset:3px}
/* needs a look: quiet rows, no tags */
.needs{border:0;color:var(--ink)}
.needs .nn{background:none;border:0;color:var(--bad-ink);padding:0}
.needs .nr{border-top:0;padding:8px 0;background:var(--hairline) top/100% 1px no-repeat}
.needs .nt,.needs .nt.dead{background:none;border:0;padding:0 0 0 12px;position:relative;font-size:13px;color:var(--bad-ink);font-weight:600}
.needs .nt::before{content:"";position:absolute;left:0;top:50%;width:6px;height:6px;margin-top:-3px;border-radius:50%;background:var(--bad)}
.needs .nt.dead{color:var(--ink-dim)}.needs .nt.dead::before{background:var(--idle)}
.needs .nx button{color:var(--ink)}
.needs .nb{border:0;background:rgba(255,255,255,.7);box-shadow:inset 0 0 0 1px var(--hair);border-radius:999px;color:var(--ink)}

/* ---------- list screens: glass cards on the haze, nothing boxed inside them */
.ev .card,.vm .box,.vm .v-card,.vm .kpi,.ev .ttile,.act ol{
  background:linear-gradient(180deg,rgba(255,255,255,.82),rgba(255,255,255,.6));
  -webkit-backdrop-filter:var(--glass-blur);backdrop-filter:var(--glass-blur);
  border:0;border-radius:var(--r-card);box-shadow:var(--shadow-card)
}
.act li{background:transparent}
.act li:first-of-type,.act li:last-of-type{border-radius:0}
.ev .dc.dq{background:none;box-shadow:none;border-radius:0;-webkit-backdrop-filter:none;backdrop-filter:none;border-bottom:0;background:var(--hairline) bottom/100% 1px no-repeat}
.ev .dqueue .dch{border-bottom:0;background:var(--hairline) bottom/100% 1px no-repeat}
.ev .dc.dfocus,.ev .lvr{box-shadow:var(--shadow-card),0 30px 60px rgba(15,46,40,.06)}
.ev .dc.old,.ev .rcard.bad{box-shadow:var(--shadow-card)}
.ev .ttile[aria-current=true]{box-shadow:0 0 0 2px var(--accent),var(--shadow-card)}
.ev .ttile:hover{box-shadow:var(--shadow-card),0 22px 40px rgba(15,46,40,.12)}
.ev .dtile{background:none;border:1.5px dashed var(--line-strong);border-radius:var(--r-card);box-shadow:none}
.ev .tpic{background:radial-gradient(70% 90% at 70% 100%,color-mix(in srgb,var(--oc) 22%,#FFFFFF),#FFFFFF)}
.ev .tpic .pill{background:rgba(255,255,255,.8);border:0;box-shadow:inset 0 0 0 1px var(--hair)}

/* banners: a quiet line, a dot and one sentence, no box */
.ev .banner,.ev .banner.stb{background:none;border:0;border-radius:0;padding:14px 0;margin:0 0 22px;
  background:var(--hairline) top/100% 1px no-repeat,var(--hairline) bottom/100% 1px no-repeat}

/* the big titles: tight and calm */
.ev h1,.vm .fbar h2,.ctitle h2,.ohead .crumb b{font-size:34px;line-height:1.07;letter-spacing:-.03em}
.ev .eh .sub,.ctitle p,.ev .lsum{color:var(--ink-dim)}
.ev .dfocus .dt{letter-spacing:-.03em}
.ev .lvbig .pc{letter-spacing:-.04em}

/* buttons: pills; the one primary action a forest pill; the rest quiet */
.ev .b,.ev .b.sm{border-radius:999px;padding-inline:16px;border:0;background:rgba(255,255,255,.75);box-shadow:inset 0 0 0 1px var(--hair),0 1px 2px rgba(15,46,40,.06)}
.ev .b:hover{background:#FFFFFF}
.ev .b.pri{background:var(--forest);color:#FFFFFF;box-shadow:0 6px 16px rgba(15,46,40,.22)}
.ev .b.pri:hover{background:#163F37;color:#FFFFFF}
.ev .b.bad{background:none;box-shadow:inset 0 0 0 1px rgba(169,43,34,.3)}
.ev .b.ghost{background:none;box-shadow:none}
.ev .chip,.ev .lp,.ev .kind{border-radius:999px}
/* segments and filter chips: words, the chosen one ink and heavier */
.seg{border:0;border-radius:0;overflow:visible;gap:14px;background:none;box-shadow:none;padding:0}
.seg button,.seg button:first-child{border:0;background:none;padding:6px 0;color:var(--ink-dim);font-weight:500;position:relative}
.seg button[aria-pressed=true]{background:none;color:var(--ink);font-weight:700;box-shadow:none}
.seg button[aria-pressed=true]::after{content:"";position:absolute;left:50%;bottom:-2px;width:5px;height:5px;margin-left:-2.5px;border-radius:50%;background:var(--accent)}
.vm .fchip,.ev .tfil .chip{background:none;border:0;box-shadow:none;border-radius:0;padding:0 4px;color:var(--ink-dim);font-weight:500}
.vm .fchip[aria-pressed=true],.ev .tfil .chip[aria-pressed=true]{background:none;box-shadow:none;color:var(--ink);font-weight:700}
.ev .tfil input[type=search]{border:0;border-radius:999px;background:rgba(255,255,255,.7);box-shadow:inset 0 0 0 1px var(--hair)}
.vm .v-sel select{border-radius:999px}
/* progress: a soft track, a green fill */
.ev .trk,.ev .bar.thick{background:var(--track)}
.ev .trk i{background:linear-gradient(90deg,#19B87B,var(--accent))}
.wait{border-radius:16px;border:0;background:rgba(252,241,221,.7)}
.ansbox button,.needs .nb{border-radius:999px}

/* scrolling strips fade at their edges; no scrollbars on floating panels */
.slips{-webkit-mask-image:linear-gradient(180deg,#000 80%,transparent);mask-image:linear-gradient(180deg,#000 80%,transparent)}
.rail,.cside,.v-office .insp,.v-office .drawer,.omenu,.ev-main,.vm{scrollbar-width:none}
.rail::-webkit-scrollbar,.cside::-webkit-scrollbar,.v-office .insp::-webkit-scrollbar,.v-office .drawer::-webkit-scrollbar,.omenu::-webkit-scrollbar,.ev-main::-webkit-scrollbar,.vm::-webkit-scrollbar{display:none}

/* focus stays visible on glass */
.ev .b:focus-visible,.seg button:focus-visible,.f:focus-visible,.slip:focus-visible,.czoom button:focus-visible{outline:2px solid var(--accent);outline-offset:3px}

/* solid fallbacks: no blur support, or the person asked for less transparency */
@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){
  :root{--glass-top:rgba(255,255,255,.96);--glass-bottom:rgba(255,255,255,.94);--glass-solid:#FFFFFF}
}
@media (prefers-reduced-transparency:reduce){
  :root{--glass-top:rgba(255,255,255,.96);--glass-bottom:rgba(255,255,255,.94);--glass-solid:#FFFFFF}
}
`

module.exports = { GLASS_STYLE }
