const EVERYONE_STYLE = `
/* text a person typed, in any language: each block takes its own direction */
pre.txt,.tt,.cm .cb,.lr .hi{unicode-bidi:plaintext;text-align:start}

/* the top bar has more views in 1.0: it gives up the date, then the live badge, then the smaller counts */
@media (max-width:1600px){.top .date{display:none}}
@media (max-width:1320px){.top .live{display:none}.views button{padding:6px 9px}.top{gap:10px}}
@media (max-width:1120px){.counts li:nth-child(n+2){display:none}.brand-b{display:none}}
.ev{position:absolute;left:0;right:var(--rw);top:52px;bottom:0;display:flex;overflow:hidden;--line-strong:#CBD3DB;--ink-hi:#111A24;--on-accent:#FFFFFF;--rc:10px}
.ev[hidden]{display:none}
.ev-main{flex:1;min-width:0;padding:24px 36px 40px;overflow:auto;position:relative}@supports not selector(::-webkit-scrollbar){.ev-main{scrollbar-width:thin;scrollbar-color:#C9D1D9 transparent}}
.ev-main.room{padding:0;overflow:hidden;background:radial-gradient(ellipse at 50% 40%,#F7F8FA 0,#ECEFF2 70%)}
.ev-drawer{width:500px;flex:none;border-inline-start:1px solid var(--line-strong);background:var(--panel);box-shadow:-24px 0 40px rgba(30,40,50,.14);display:flex;flex-direction:column;min-height:0}
.ev-drawer:empty{display:none}
.ev .ic{flex:none;vertical-align:middle}
.ev h1{font-size:27px;line-height:1.25;color:var(--ink-hi);font-weight:700;margin:0;letter-spacing:-.01em}
.ev h2{font-size:22px;line-height:1.3;color:var(--ink-hi);margin:0}
.ev h3{font-size:15px;margin:0;color:var(--ink-hi)}
.ev p{margin:0}
.ev .eh{display:flex;align-items:flex-start;gap:16px;margin:0 0 20px}
.ev .eh .sub{color:var(--ink-soft);font-size:14.5px;margin-top:4px}
.ev .eh .ea{margin-inline-start:auto;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.ev .crumb{font-size:13px;color:var(--ink-dim);display:flex;gap:8px;align-items:center;margin-bottom:6px}
.ev .crumb button{font:13px var(--font-ui);color:var(--cyan);background:none;border:0;padding:0;cursor:pointer}
.ev .lbl{font:700 11px/1.3 var(--font-ui);letter-spacing:.09em;text-transform:uppercase;color:var(--ink-dim)}
.ev .mut{color:var(--ink-dim)}.ev .soft{color:var(--ink-soft)}.ev .hi{color:var(--ink-hi)}
.ev .rw{display:flex;align-items:center;gap:12px}
.ev .sp{flex:1}
.ev .ell{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ev .card{background:var(--panel);border:1px solid var(--line);border-radius:var(--rc);min-width:0}
.ev .pad{padding:18px 20px}
.ev .sec{font-size:15.5px;font-weight:700;color:var(--ink-hi);margin:0 0 12px;display:flex;align-items:center;gap:10px}
.ev .sec small{font-weight:400;color:var(--ink-dim);font-size:13px}
.ev .b,.wz .b{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:38px;padding:0 16px;border-radius:8px;border:1px solid var(--line-strong);background:var(--panel-raised);color:var(--ink-hi);font:700 14px var(--font-ui);cursor:pointer;white-space:nowrap;text-decoration:none}
.ev .b.pri,.wz .b.pri{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}
.ev .b.bad{border-color:rgba(200,55,45,.5);color:#C8372D;background:transparent}
.ev .b.ghost,.wz .b.ghost{background:transparent;border-color:transparent;color:var(--ink-soft);font-weight:400}
.ev .b.sm,.wz .b.sm{height:32px;padding:0 12px;font-size:13px}
.ev .b.big,.wz .b.big{height:46px;padding:0 22px;font-size:15px}
.ev .b.armed,.wz .b.armed{background:var(--gate);border-color:var(--gate);color:#1D2530}
.ev .b:disabled,.wz .b:disabled{opacity:.45;cursor:default}
.ev .b:focus-visible,.wz .b:focus-visible,.ev input:focus-visible,.ev textarea:focus-visible,.ev select:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.ev .chip,.wz .chip{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 9px;border-radius:12px;font:700 12px var(--font-ui);border:1px solid var(--line-strong);color:var(--ink-soft);white-space:nowrap;background:none}
button.chip{cursor:pointer}
.ev .chip.ok,.wz .chip.ok{color:var(--accent);background:var(--accent-soft);border-color:var(--accent-line)}
.ev .chip.warn{color:var(--warn-ink);background:var(--warn-bg);border-color:rgba(217,140,30,.4)}
.ev .chip.bad{color:#C8372D;background:var(--bad-bg);border-color:rgba(200,55,45,.4)}
.ev .chip[aria-pressed=true]{color:var(--accent);background:var(--accent-soft);border-color:var(--accent-line)}
.ev .risk{white-space:nowrap;display:inline-flex;align-items:center;gap:6px;height:22px;padding:0 9px;border-radius:5px;font:700 10.5px var(--font-ui);letter-spacing:.04em;text-transform:uppercase;color:#B42318;background:var(--bad-bg);border:1px solid rgba(200,55,45,.5)}
.ev .risk.safe{color:var(--accent);background:var(--accent-soft);border-color:var(--accent-line)}
.ev .risk.mid{color:#9A6206;background:var(--warn-bg);border-color:rgba(217,140,30,.5)}
.ev .risk.big{height:30px;font-size:12px}
.ev .pill{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700;border-radius:12px;padding:2px 10px;height:24px;white-space:nowrap}
.ev .pill:before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}
.ev .pill.working{color:#0C8A62;background:rgba(12,138,98,.10)}.ev .pill.waiting{color:#B8720F;background:rgba(217,140,30,.13)}
.ev .pill.quiet{color:var(--warn-ink);background:rgba(217,140,30,.13)}.ev .pill.stalled{color:#B3261E;background:rgba(200,55,45,.12)}.ev .pill.dead{color:#5A6673;background:#F4F6F8;box-shadow:inset 0 0 0 1px #8C97A3}
.ev .pill.dead:before{background:#98A2AD}
.ev .tfil{display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin:0 0 14px}
.ev .tfil .tf{display:flex;gap:6px;align-items:center;font-size:13px;color:var(--ink-dim);margin:0}
.ev .tfil select{height:34px;padding-block:0}
.ev .tdir{overflow:auto}
.ev table.dir{border-collapse:collapse;width:100%;font-size:13.5px;min-width:1040px}
.ev table.dir th{font:700 11px var(--font-ui);letter-spacing:.08em;text-transform:uppercase;color:var(--ink-dim);text-align:start;padding:12px 10px;border-bottom:1px solid var(--line);white-space:nowrap}
.ev table.dir td{padding:9px 10px;border-top:1px solid var(--line);vertical-align:middle;color:var(--ink-soft);white-space:nowrap}
.ev table.dir .n{text-align:end;font-variant-numeric:tabular-nums}.ev table.dir td.lo{color:var(--warn-ink)}
.ev table.dir td.tkx{max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ev table.dir tr.grp th{background:var(--panel-raised);color:var(--ink-hi);text-transform:none;letter-spacing:0;font-size:13px;padding:8px 10px}
.ev table.dir tr.trow{cursor:pointer}.ev table.dir tr.trow:hover td{background:var(--panel-raised)}
.ev table.dir tr.trow[aria-current=true] td{background:var(--accent-soft)}
.ev table.dir tr.trow:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
.ev .spark{display:block}
.ev .tiles .stat .ok{color:var(--accent)}.ev .tiles .stat .bad{color:#C8372D}
.ev .bars{display:flex;align-items:flex-end;gap:5px;height:64px;padding:8px;background:var(--panel-raised);border:1px solid var(--line);border-radius:8px}
.ev .bars i{flex:1;background:#7DB9A4;border-radius:2px 2px 0 0;display:block}.ev .bars i.z{background:#DDE3E8}
.ev .pill.idle,.ev .pill.paused{color:#66727F;background:rgba(106,118,131,.12)}.ev .pill.done{color:#1F7A8C;background:rgba(31,122,140,.12)}
.ev .av,.wz .av{position:relative;display:inline-block;flex:none;line-height:0}
.ev .av.bk,.wz .av.bk{border-radius:7px;padding:3px 3px 0}
.ev .av svg,.wz .av svg{display:block}
.ev .note{font-size:13px;color:var(--ink-dim);display:flex;gap:6px;align-items:flex-start;line-height:1.5}
.ev .hint{display:block;font-size:12px;color:var(--ink-dim);margin-top:3px}
.ev .msg,.wz .msg{font-size:13px;margin-top:8px}
.ev .msg.err,.wz .msg.err{color:#C8372D}.ev .msg.ok,.wz .msg.ok{color:var(--ok)}
.ev .empty{color:var(--ink-dim);font-size:13.5px;padding:8px 0}
.ev label.fl,.wz label.fl{display:flex;flex-direction:column;gap:6px;font-weight:700;color:var(--ink-hi);font-size:13px;margin:0 0 14px}
.ev label.fl .op{font-weight:400;color:var(--ink-dim)}
.ev input[type=text],.ev input[type=date],.ev input[type=number],.ev input[type=search],.ev textarea,.ev select,.wz input[type=text],.wz textarea{display:block;width:100%;font:14px var(--font-ui);color:var(--ink-hi);background:var(--ground);border:1px solid var(--line-strong);border-radius:8px;padding:9px 12px;box-sizing:border-box;font-weight:400}
.ev textarea,.wz textarea{min-height:96px;resize:vertical;line-height:1.5}
.ev input.bad{border-color:var(--bad)}
.ev input[type=checkbox],.wz input[type=checkbox],.ev input[type=radio],.wz input[type=radio]{accent-color:var(--accent);width:17px;height:17px;margin:0;flex:none}
.ev pre{font:12px/1.5 var(--font-ui);white-space:pre-wrap;word-break:break-word;background:var(--ground);border:1px solid var(--line);border-radius:6px;padding:10px 12px;color:var(--ink-soft);max-height:420px;overflow:auto;direction:ltr;text-align:left;margin:0}
.ev pre.txt{direction:auto;text-align:start;font:13px/1.55 var(--font-ui)}
.ev details>summary{cursor:pointer;color:var(--ink-soft);font-size:13px}
.tgl{appearance:none;-webkit-appearance:none;width:40px!important;height:22px!important;border-radius:11px;background:#CBD3DB;position:relative;cursor:pointer;flex:none;margin:0}
.tgl:after{content:"";position:absolute;top:3px;inset-inline-start:3px;width:16px;height:16px;border-radius:50%;background:#1F2A36;transition:inset-inline-start .12s}
.tgl:checked{background:var(--accent)}.tgl:checked:after{inset-inline-start:21px;background:#FFFFFF}
.tgl:disabled{opacity:.45;cursor:default}
.seg{display:inline-flex;border:1px solid var(--line-strong,#CBD3DB);border-radius:7px;overflow:hidden}
.seg button{font:12.5px var(--font-ui);background:transparent;border:0;border-inline-start:1px solid var(--line-strong,#CBD3DB);color:var(--ink-dim);padding:6px 12px;cursor:pointer;white-space:nowrap}
.seg button:first-child{border-inline-start:0}
.seg button[aria-pressed=true]{background:#D9DFE5;color:var(--ink-hi,#111A24);font-weight:700}
.seg button.never[aria-pressed=true]{background:var(--bad-bg);color:#C8372D}
.seg button.allow[aria-pressed=true]{background:var(--accent-soft);color:var(--accent)}
.seg button:disabled{cursor:default}
/* tasks */
.ev .banner{display:flex;align-items:center;gap:12px;padding:12px 18px;margin:-6px 0 22px;border:1px solid rgba(217,140,30,.5);background:var(--warn-bg);border-radius:var(--rc)}
.ev .board4{display:grid;grid-template-columns:1fr 1fr 1.05fr 1fr;gap:20px;align-items:start}
.ev .col{display:flex;flex-direction:column;gap:10px;min-width:0}
.ev .colh{display:flex;align-items:center;gap:8px;padding:0 2px 4px;font-weight:700;color:var(--ink-hi);font-size:14.5px}
.ev .colh .n{font:700 12px var(--font-ui);color:var(--ink-dim)}
.ev .colw{background:rgba(217,140,30,.05);border:1px dashed rgba(217,140,30,.35);border-radius:12px;padding:10px;margin:-10px}
.ev .tk{padding:14px 16px;text-align:start;cursor:pointer;font:inherit;color:inherit;display:block;width:100%}
.ev .tk:hover{border-color:var(--line-strong)}
.ev .tk.wtk{border-color:rgba(217,140,30,.65);background:linear-gradient(0deg,var(--warn-bg),var(--warn-bg)),var(--panel)}
.ev .tk.dn{opacity:.85}
.ev .tk .tt{color:var(--ink-hi);font-weight:700;font-size:14.5px;line-height:1.35;overflow-wrap:anywhere}
.ev .tk .q{color:var(--ink-soft);font-size:13px;margin-top:6px;padding:6px 10px;border:1px solid var(--line);background:rgba(30,40,50,.1);border-radius:6px}
.ev .wb{display:inline-flex;gap:6px;align-items:center;margin-bottom:8px;font:700 11px var(--font-ui);color:#9A6206;text-transform:uppercase;letter-spacing:.05em}
.ev .list .lr{display:grid;grid-template-columns:1fr auto auto auto;gap:12px;align-items:center;padding:10px 14px;border:1px solid var(--line);border-radius:8px;background:var(--panel);margin:0 0 6px;cursor:pointer;width:100%;text-align:start;font:13.5px var(--font-ui);color:var(--ink-soft)}
.ev .list .lr:hover{border-color:var(--line-strong)}
.ev .list h4{font:700 12px var(--font-ui);color:var(--ink-dim);margin:18px 0 8px}
.ev .two{display:grid;grid-template-columns:1fr 360px;gap:26px;align-items:start}
.ev .pick{display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:8px;margin:0 -10px;cursor:pointer;font-weight:400;color:var(--ink-soft);font-size:13.5px}
.ev .pick:has(input:checked){background:var(--accent-soft);box-shadow:inset 0 0 0 1px var(--accent-line);color:var(--ink-hi)}
.ev .facts>div{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:7px 0}
.ev .tl{display:flex;gap:12px;align-items:flex-start;padding:9px 0;border-top:1px solid var(--line)}
.ev .tl time{font:13px var(--font-ui);color:var(--ink-dim);width:46px;flex:none;direction:ltr}
.ev .cm{display:flex;gap:12px;align-items:flex-start;margin-bottom:14px}
.ev .cm .cb{flex:1;background:var(--panel-raised);border:1px solid var(--line);border-radius:10px;padding:10px 14px;min-width:0}
.ev .wbox{border-color:rgba(217,140,30,.6);background:linear-gradient(0deg,var(--warn-bg),var(--warn-bg)),var(--panel)}
/* approvals */
.ev .appr{display:grid;grid-template-columns:400px 1fr;gap:24px;align-items:start}
.ev .apv{display:flex;gap:12px;padding:14px 16px;border:0;border-bottom:1px solid var(--line);align-items:flex-start;background:none;width:100%;text-align:start;cursor:pointer;font:inherit;color:inherit}
.ev .apv:last-child{border-bottom:0}
.ev .apv[aria-current=true]{background:var(--panel-raised);box-shadow:inset 4px 0 0 var(--warn)}
.ev .letter{padding:26px 30px}
.ev .prev{margin-top:16px;border:1px solid var(--line-strong);border-radius:10px;background:var(--ground);padding:16px 18px}
.ev .prev .body{color:var(--ink-hi);font-size:15px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}
.ev .whyno{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px}
.ev .whyno .t{color:var(--ink-soft);font-size:14px;line-height:1.55;margin-top:6px}
/* finished work */
.ev .gal{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:18px}
.ev .fc{overflow:hidden;display:flex;flex-direction:column}
.ev .th{height:150px;position:relative;border-bottom:1px solid var(--line);background:#F1F4F7;display:flex;align-items:center;justify-content:center;overflow:hidden}
.ev .th img{width:100%;height:100%;object-fit:cover}
.ev .tb{position:absolute;inset-inline-start:10px;top:10px;display:inline-flex;gap:5px;align-items:center;background:rgba(255,255,255,.94);border:1px solid var(--line-strong);border-radius:5px;padding:2px 7px;font:700 11px var(--font-ui);color:var(--ink-hi)}
/* settings */
.ev .setw{display:flex;align-items:flex-start;gap:30px}
.ev .snav{display:flex;flex-direction:column;gap:4px;width:210px;flex:none}
.ev .snav button{display:flex;align-items:center;gap:10px;height:40px;padding:0 12px;border-radius:8px;border:0;background:none;color:var(--ink-soft);font:14.5px var(--font-ui);cursor:pointer;text-align:start}
.ev .snav button[aria-pressed=true]{background:var(--panel-raised);color:var(--ink-hi);font-weight:700;box-shadow:inset 3px 0 0 var(--accent)}
.ev .rows>.r{display:flex;align-items:center;gap:12px;padding:13px 18px;border-top:1px solid var(--line)}
.ev .rows>.r:first-child{border-top:0}
.ev .rows>.more{padding:4px 18px 16px 60px;border-top:0}
.ev .exp{font:700 10px var(--font-ui);color:var(--warn-ink);border:1px solid rgba(217,140,30,.45);border-radius:3px;padding:0 4px;margin-inline-start:6px;vertical-align:1px;text-transform:uppercase}
.ev .phone{background:var(--ground);border:1px solid var(--line);border-radius:12px;padding:14px}
.ev .phone .n{background:var(--panel-raised);border-radius:10px;padding:12px 14px;border:1px solid var(--line)}
.ev .packs{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}
.ev .pk{padding:14px;text-align:start;font:inherit;color:inherit;cursor:pointer;display:block;width:100%}
.ev .pk.off{border-style:dashed;background:transparent}
.ev .pk[aria-current=true]{border-color:var(--accent-line)}
/* team: the office room, a campus list, the people in it, and the side panel */
.ev .scene{position:absolute;inset:0;width:100%;height:100%}
.ev .scene .seat{cursor:pointer}
.ev .float{position:absolute;z-index:3;background:rgba(255,255,255,.94);border:1px solid var(--line-strong);border-radius:10px}
.ev .camp{left:20px;top:20px;padding:12px 14px;width:220px}
.ev .camp button{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;border:0;background:none;width:100%;color:var(--ink-soft);font:13.5px var(--font-ui);cursor:pointer;text-align:start}
.ev .camp button[aria-current=true]{background:var(--panel-raised);box-shadow:inset 0 0 0 1px var(--line-strong);color:var(--ink-hi);font-weight:700}
.ev .sw{width:10px;height:10px;border-radius:2px;display:inline-block;flex:none}
.ev .roster{inset-inline:20px;bottom:56px;padding:10px 14px;display:flex;gap:10px;align-items:center;overflow:auto hidden}
.ev .roster .m{display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:8px;border:1px solid var(--line);background:var(--panel-raised);cursor:pointer;font:inherit;color:inherit;text-align:start;flex:none}
.ev .roster .m[aria-current=true]{border-color:var(--accent)}
.ev .ticker{position:absolute;inset-inline:0;bottom:0;height:42px;background:rgba(255,255,255,.94);border-top:1px solid var(--line);display:flex;align-items:center;gap:22px;padding:0 20px;font-size:13px;color:var(--ink-soft);z-index:3;overflow:hidden;white-space:nowrap}
.ev .ticker i{display:inline-block;width:8px;height:8px;margin-inline-end:7px}
.ev .tool{inset-inline-end:20px;top:20px;padding:6px;display:flex;gap:6px}
.ph{display:flex;align-items:center;gap:14px;padding:16px 20px;border-bottom:1px solid var(--line)}
.ph h2{font-size:19px!important}
.pb{padding:18px 20px;overflow:auto;flex:1;display:flex;flex-direction:column;gap:16px}@supports not selector(::-webkit-scrollbar){.pb{scrollbar-width:thin;scrollbar-color:#C9D1D9 transparent}}
.pf{padding:14px 20px;border-top:1px solid var(--line);display:flex;gap:10px;background:var(--panel-raised);align-items:center;flex-wrap:wrap}
.ev .x{margin-inline-start:auto;width:36px;height:36px;border-radius:8px;border:1px solid var(--line-strong);display:grid;place-items:center;color:var(--ink-soft);background:none;cursor:pointer;flex:none}
.ev .stat{background:var(--panel-raised);border:1px solid var(--line);border-radius:8px;padding:14px 16px;flex:1;min-width:0}
.ev .now{border-color:var(--accent-line);background:var(--accent-soft)}
.ev .now.w{border-color:rgba(217,140,30,.45);background:var(--warn-bg)}
.ev .jr{display:flex;gap:10px;align-items:center;padding:7px 0;border-top:1px solid var(--line);font-size:13.5px}
.ev .looks{display:flex;gap:8px;flex-wrap:wrap}
.ev .looks label{padding:5px 5px 0;border-radius:8px;border:2px solid var(--line);cursor:pointer;line-height:0}
.ev .looks label:has(input:checked){border-color:var(--accent)}
.ev .looks input{position:absolute;opacity:0;width:1px;height:1px}
.ev .asks{display:grid;grid-template-columns:1fr 1fr;gap:8px 12px;font-size:13.5px}
.ev .asks label{display:flex;gap:8px;align-items:center;color:var(--ink-soft);font-weight:400}
.ev table.pol{border-collapse:collapse;width:100%;font-size:13px}
.ev table.pol td,.ev table.pol th{border-top:1px solid var(--line);padding:8px 6px;text-align:start;vertical-align:middle}
.ev table.pol th{font-weight:700;color:var(--ink-dim)}
/* the Today strip on the campus */
.today{position:absolute;inset-inline-start:16px;top:12px;z-index:5;background:rgba(255,255,255,.94);border:1px solid var(--line);border-radius:5px;padding:6px 12px;font-size:12.5px;color:var(--ink-soft);display:flex;gap:10px;align-items:center;flex-wrap:wrap;max-width:calc(100% - 40px)}
.today b{color:var(--ink);font-weight:700}
.today button{font:12.5px var(--font-ui);color:var(--cyan);background:none;border:0;padding:0;cursor:pointer;text-decoration:underline dotted}
/* the first-start wizard: the whole window, a campus on one side, the form on the other */
.wiz-back{position:fixed;inset:0;background:#ECEFF2;z-index:70;--line-strong:#CBD3DB;--ink-hi:#111A24;--on-accent:#FFFFFF}
.wiz-back[hidden]{display:none}
.wz{position:absolute;inset:0;display:flex;flex-direction:column;font-size:14px;color:var(--ink-soft)}
.wz .wtop{height:56px;flex:none;background:var(--panel);border-bottom:1px solid var(--line);display:flex;align-items:center;gap:8px;padding:0 18px}
.wz .wtop .logo{font-weight:700;font-size:18px;color:var(--ink-hi);display:flex;align-items:center;gap:8px;margin-inline-end:24px}
.wz .wtop .logo small{font:700 9.5px var(--font-ui);letter-spacing:.08em;color:var(--accent);border:1px solid var(--accent-line);padding:2px 5px;border-radius:3px}
.wz .stp{display:flex;align-items:center;gap:8px;height:36px;padding:0 14px;border-radius:8px;border:1px solid transparent;color:var(--ink-soft);font-weight:700;font-size:14px}
.wz .stp.on{background:var(--panel-raised);border-color:var(--line-strong);color:var(--ink-hi)}
.wz .stp.done{color:var(--accent)}
.wz .wbody{flex:1;display:flex;min-height:0}
.wz .wscene{flex:1;position:relative;min-width:0;overflow:hidden;background:radial-gradient(ellipse at 50% 40%,#F7F8FA 0,#ECEFF2 70%)}
.wz .wscene>svg{position:absolute;inset:0 0 120px 0;width:100%;height:calc(100% - 120px)}
.wz .guide{position:absolute;inset-inline-start:60px;bottom:40px;display:flex;gap:16px;align-items:flex-end}
.wz .say{background:var(--panel);border:1px solid var(--line-strong);border-radius:12px 12px 12px 2px;padding:14px 18px;font-size:16px;color:var(--ink-hi);max-width:380px;line-height:1.5}
.wz .wform{width:600px;max-width:52vw;flex:none;background:var(--panel);border-inline-start:1px solid var(--line-strong);display:flex;flex-direction:column;min-height:0}
.wz .wpad{padding:30px 32px 16px;overflow:auto;flex:1;display:flex;flex-direction:column;gap:14px}@supports not selector(::-webkit-scrollbar){.wz .wpad{scrollbar-width:thin;scrollbar-color:#C9D1D9 transparent}}
.wz h1{font-size:28px;color:var(--ink-hi);margin:6px 0 0;line-height:1.2}
.wz .lead{font-size:15px;color:var(--ink-soft);margin:6px 0 4px;line-height:1.5}
.wz .wfoot{padding:14px 28px;border-top:1px solid var(--line);display:flex;gap:12px;align-items:center;background:var(--panel-raised);flex:none}
.wz .oprow{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:8px;border:1px solid var(--line);cursor:pointer;margin:0}
.wz .oprow:has(input:checked){background:var(--panel-raised)}
.wz .oprow .bar{width:8px;height:36px;border-radius:2px;flex:none}
.wz .oprow b{display:block;color:var(--ink-hi);font-size:14.5px}
.wz .oprow span.d{font-size:12.5px;color:var(--ink-dim)}
.wz .seg2{display:inline-flex;border:1px solid var(--line-strong);border-radius:7px;overflow:hidden}
.wz .seg2 button,.wz .seg2 label{font:700 13.5px var(--font-ui);background:transparent;border:0;border-inline-start:1px solid var(--line-strong);color:var(--ink-dim);padding:8px 16px;cursor:pointer;display:flex;gap:6px;align-items:center;margin:0}
.wz .seg2>:first-child{border-inline-start:0}
.wz .seg2 [aria-pressed=true],.wz .seg2 label:has(input:checked){background:#D9DFE5;color:var(--ink-hi)}
.wz .seg2 input{position:absolute;opacity:0;width:1px;height:1px}
.wz .step{display:flex;gap:14px;align-items:flex-start}
.wz .step .num{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font:700 13px var(--font-ui);flex:none;border:2px solid var(--accent);color:var(--accent)}
.wz .step .num.ok{background:var(--accent);color:var(--on-accent)}
.wz .wt{display:flex;gap:12px;align-items:center;padding:12px 14px;border-radius:8px;background:var(--warn-bg);border:1px solid rgba(217,140,30,.4)}
.wz .wt .dot{width:12px;height:12px;border-radius:50%;background:var(--warn);box-shadow:0 0 0 5px rgba(217,140,30,.25);flex:none}
.wz .wt.ok{background:var(--accent-soft);border-color:var(--accent-line)}
.wz .wt.ok .dot{background:var(--accent);box-shadow:0 0 0 5px rgba(12,138,98,.2)}
.wz .card{background:var(--panel-raised);border:1px solid var(--line);border-radius:8px;padding:10px 14px}
.wz pre{font:12px/1.5 var(--font-ui);white-space:pre-wrap;word-break:break-all;background:var(--ground);border:1px solid var(--line);border-radius:6px;padding:8px 10px;max-height:200px;overflow:auto;direction:ltr;text-align:left;margin:6px 0 0}
.wz .lbl{font:700 11px/1.3 var(--font-ui);letter-spacing:.09em;text-transform:uppercase;color:var(--ink-dim)}
.wz .hint{font-size:12.5px;color:var(--ink-dim)}
.wz .mut{color:var(--ink-dim)}
.wz .rw{display:flex;align-items:center;gap:12px}
@media (max-width:1100px){.wz .wscene{display:none}.wz .wform{width:auto;max-width:none;flex:1}}
/* live (spec 1.1, 14.1): the control table, tiles, the version run strip, the right rail */
.ev{--warn-ink:#9A5F08}
.ev .sm{font-size:12.5px}
.ev .bd{color:#B42318}.ev .ok.sm,.ev span.ok{color:var(--accent)}
.ev .wk{color:var(--warn-ink)}
.ev .lnk{font:inherit;color:var(--cyan);background:none;border:0;padding:0;cursor:pointer;text-decoration:underline dotted;font-size:12.5px}
.ev a.lnk{text-decoration:underline dotted}
.ev .b[aria-pressed=true]{background:var(--accent-soft);border-color:var(--accent-line);color:var(--accent)}
.ev .lgbar{display:flex;gap:18px;align-items:center;flex-wrap:wrap;font-size:12.5px;color:var(--ink-soft)}
.ev .lgd{display:inline-flex;align-items:center;gap:7px}
.ev .lgd i{display:inline-block;width:24px;height:6px;border-radius:3px}
.ev .lgd i.g1{background:var(--accent)}.ev .lgd i.g2{width:2px;height:12px;border-radius:0;background:var(--ink-hi)}
.ev .lgd i.g3,.ev .bar.hatch{background:repeating-linear-gradient(135deg,#B9C7D1 0 4px,#DCE4EA 4px 8px)}
.ev .tiles{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:14px;margin:0 0 18px}
.ev .tile{background:var(--panel);border:1px solid var(--line);border-radius:var(--rc);padding:14px 18px;min-width:0}
.ev .tile b{display:block;font-size:26px;line-height:1.15;color:var(--ink-hi)}
.ev .tile b small{font-size:15px;font-weight:700;color:var(--ink-soft)}
.ev .tile span{font-size:13px;color:var(--ink-soft)}
.ev .tile.warn{background:var(--warn-bg);border-color:rgba(217,140,30,.45)}.ev .tile.warn b{color:var(--warn-ink)}
.ev .tile.bad{background:var(--bad-bg);border-color:rgba(200,55,45,.4)}.ev .tile.bad b{color:#B42318}
.ev .stb{border-color:rgba(200,55,45,.5);background:var(--bad-bg);margin:0 0 14px}
.ev .lvr{margin:0 0 18px;overflow:hidden}
.ev .lvh{padding:14px 20px;gap:12px;flex-wrap:wrap;border-bottom:1px solid var(--line)}
.ev .lvb{padding:16px 20px 18px;display:flex;flex-direction:column;gap:14px}
.ev .lvbig .pc{font-size:30px;color:var(--accent);line-height:1}
.ev .vseg{display:flex;gap:4px;margin-top:10px}
.ev .vseg span{height:10px;background:#E1E7EC;border-radius:3px;overflow:hidden;min-width:8px}
.ev .vseg i{display:block;height:100%;background:var(--accent)}
.ev .vph{display:grid;gap:16px}
.ev .chip.sm{height:20px;font-size:11px;padding:0 7px}
.ev .chip.run{color:var(--accent);background:var(--accent-soft);border-color:var(--accent-line)}
.ev .lgrid{display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:18px;align-items:start}
.ev .ltab{overflow:hidden}
.ev .lth{padding:14px 18px;gap:12px;border-bottom:1px solid var(--line)}
.ev .lscroll{overflow-x:auto}
.ev table.lt2{width:100%;border-collapse:collapse;font-size:13.5px;table-layout:fixed;min-width:1000px}
.ev table.lt2 th{text-align:start;font:700 11px var(--font-ui);letter-spacing:.08em;text-transform:uppercase;color:var(--ink-dim);padding:9px 12px;background:var(--panel-raised);border-bottom:1px solid var(--line)}
.ev table.lt2 td{padding:12px;border-bottom:1px solid var(--line);vertical-align:middle}
.ev table.lt2 tbody tr:last-child td{border-bottom:0}
.ev table.lt2 .num{text-align:end;white-space:nowrap}
.ev table.lt2 tr.rqt{background:rgba(217,140,30,.06)}
.ev table.lt2 tr.rst{background:rgba(217,140,30,.1)}
.ev table.lt2 tr.rdd{background:#F1F3F5;color:var(--ink-dim)}
.ev .lt{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere;line-height:1.35}
.ev .lt2 .la{display:flex;flex-direction:column;gap:6px;align-items:stretch}
.ev .pb2{min-width:0}
.ev .bar{position:relative;height:8px;background:#E1E7EC;border-radius:4px}
.ev .bar i{display:block;height:100%;background:var(--accent);border-radius:4px}
.ev .bar.hatch i{background:transparent}
.ev .bar .tick{position:absolute;top:-3px;width:2px;height:14px;background:var(--ink-hi);transform:translateX(-1px)}
.ev .pn{display:flex;gap:10px;align-items:center;margin-top:6px;font-size:12.5px;color:var(--ink-dim);white-space:nowrap}
.ev .pn .rp b{color:var(--accent)}.ev .pn .es b{color:var(--cyan)}
.ev .pn .df{color:var(--warn-ink);line-height:0}
.ev .lp{display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 9px;border-radius:11px;font:700 12px var(--font-ui);white-space:nowrap;border:1px solid var(--line-strong);color:var(--ink-soft)}
.ev .lp.warn{color:var(--warn-ink);background:var(--warn-bg);border-color:rgba(217,140,30,.5)}
.ev .lp.bad{color:#B42318;background:var(--bad-bg);border-color:rgba(200,55,45,.5)}
.ev .lp.dead{border-style:dashed;color:var(--ink-dim);background:#F1F3F5}
.ev .lp.q{background:var(--panel-raised)}
.ev .lside{padding:16px 18px}
.ev .lside.dead{border-color:rgba(200,55,45,.35)}
.ev .qh{border:1px solid var(--accent-line);background:var(--accent-soft);border-radius:10px;padding:12px 14px}
.ev .qh.hung{border-color:rgba(217,140,30,.6);background:var(--warn-bg)}
.ev .qw{padding:8px 0;border-top:1px solid var(--line)}.ev .qw:first-of-type{border-top:0}
.ev .qw .no{width:22px;height:22px;border-radius:50%;border:1px solid var(--line-strong);display:grid;place-items:center;font:700 11px var(--font-ui);color:var(--ink-soft);flex:none}
.ev .dr{padding:10px 0;border-top:1px solid var(--line)}
.ev .rr{padding:10px 0;border-top:1px solid var(--line)}.ev .rr:first-of-type{border-top:0}
/* the table needs 1000 px; beside the 330 px side column it has less than that up to a 1440 px window */
@media (max-width:1440px){.ev .lgrid{grid-template-columns:1fr}}
@media (max-width:1280px){.ev .tiles{grid-template-columns:repeat(3,minmax(0,1fr))}}

/* decisions (spec 1.1, 14.2): three columns, the evidence in the side panel */
.ev .dcols{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px;align-items:start}
.ev .dcol{display:flex;flex-direction:column;gap:12px;min-width:0}
.ev .dch{margin-bottom:2px}.ev .dcn{font-size:16px;font-weight:700}
.ev .dc{padding:16px 18px}
.ev .dc.old{border-color:rgba(200,55,45,.55);box-shadow:inset 0 3px 0 #C8372D}
.ev .dc.lk{background:linear-gradient(0deg,rgba(200,55,45,.04),rgba(200,55,45,.04)),var(--panel);border-color:rgba(200,55,45,.3)}
.ev .dc .dt{font-size:15.5px;line-height:1.35;margin:10px 0 4px;color:var(--ink-hi);overflow-wrap:anywhere}
.ev .dc .dbt{margin-top:14px}
.ev .dc .lockn{display:flex;gap:6px;align-items:center;margin-top:10px;font-size:13px;color:var(--ink-soft)}
.ev .kind{display:inline-flex;align-items:center;gap:6px;height:22px;padding:0 9px;border-radius:5px;font:700 11.5px var(--font-ui);border:1px solid var(--line-strong);color:var(--ink-soft);background:var(--panel-raised)}
.ev .kind.q,.ev .kind.appr,.ev .kind.hire,.ev .kind.act{color:#5B49A0;border-color:rgba(107,85,176,.4);background:rgba(107,85,176,.08)}
.ev .kind.merge,.ev .kind.next-phase,.ev .kind.build{color:var(--cyan);border-color:rgba(31,122,140,.4);background:rgba(31,122,140,.08)}
.ev .kind.publish{color:#B42318;border-color:rgba(200,55,45,.45);background:var(--bad-bg)}
.ev .age{font:700 12.5px var(--font-ui);color:var(--ink-dim);display:inline-flex;gap:4px;align-items:center}
.ev .age.warn{color:var(--warn-ink)}.ev .age.bad{color:#B42318}
.ev .dlog{overflow:hidden}.ev .dl{padding:10px 14px;border-top:1px solid var(--line)}.ev .dl:first-child{border-top:0}
.ev .dl time{width:42px;flex:none;direction:ltr}
.ev-drawer .letter{padding:18px 20px;border:0}.ev-drawer .letter>.rw:first-child{flex-wrap:wrap}.ev-drawer .letter .whyno{grid-template-columns:1fr}
.ev .alately{margin-top:28px}.ev .alately summary{font-size:14px;font-weight:700;color:var(--ink-soft)}

/* settings: decisions and notifications */
.ev .srow{display:flex;align-items:center;gap:14px;padding:14px 18px;border-top:1px solid var(--line)}
.ev .srow:first-child{border-top:0}
.ev .srow.master{background:var(--panel-raised)}.ev .srow.master.on{background:var(--accent-soft)}
.ev .srow:not(.master){padding-inline-start:34px}
.ev .srow.off b{color:var(--ink-dim)}
.ev .srow.locked{background:rgba(200,55,45,.04)}.ev .srow.locked b{display:flex;gap:6px;align-items:center}
.ev .nfc{display:flex;flex-direction:column;gap:14px}
.ev .nfsep{height:1px;background:var(--line)}
.ev .nev label{font-size:13.5px}
.ev input[type=password]{display:block;width:100%;font:14px var(--font-ui);color:var(--ink-hi);background:var(--ground);border:1px solid var(--line-strong);border-radius:8px;padding:9px 12px;box-sizing:border-box}
`

module.exports = { EVERYONE_STYLE }
