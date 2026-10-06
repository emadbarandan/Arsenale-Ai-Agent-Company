/* The 1.0 screens: Tasks (a board, a list, a new-task page and a task page),
 * Approvals (one letter at a time), Team (an office room with a profile and a
 * hire panel at its side), Finished work, Settings (Assistants, Phone alerts,
 * Safety rules, Office packs, Privacy), the first-start wizard, the Today
 * strip and the browser's desktop notifications.
 *
 * everyoneViews is never run in Node: like companyViews its source is
 * written into the page, so it uses only what the browser has. Every string
 * a person reads goes through T(); the Persian text is in
 * dashboard-strings.cjs. The drawings come from everyoneArt (everyone-art.cjs).
 *
 * The screens read their data from the server's GET endpoints when they are
 * open, and write only through the server's POST endpoints, which check the
 * owner's key and write as the owner. Nothing here starts or stops an agent:
 * a task is a request the assistant reads the next time the owner talks to it.
 *
 * People are shown by name: a team member's name, else its job title, never
 * its file id (that is under Details). Time comes first; tokens and money only
 * under Details.
 *
 * Forms survive redraws: the main part of a screen is redrawn when its HTML
 * changes, the side panel (where the profile and hire forms are) only when it
 * opens or changes, and typed values are carried over even then.
 *
 * A file path is never opened: it is shown as text with "Copy path". Web
 * links open in a new browser tab.
 */

const EVERYONE_STYLE = `
/* the top bar has more views in 1.0: it gives up the date, then the live badge, then the smaller counts */
@media (max-width:1600px){.top .date{display:none}}
@media (max-width:1320px){.top .live{display:none}.views button{padding:6px 9px}.top{gap:10px}}
@media (max-width:1120px){.counts li:nth-child(n+2){display:none}.brand-b{display:none}}
.ev{position:absolute;left:0;right:var(--rw);top:52px;bottom:0;display:flex;overflow:hidden;--line-strong:#2B3A49;--ink-hi:#E9EFF5;--on-accent:#04140E;--rc:10px}
.ev[hidden]{display:none}
.ev-main{flex:1;min-width:0;padding:24px 36px 40px;overflow:auto;scrollbar-width:thin;scrollbar-color:#2A3644 transparent;position:relative}
.ev-main.room{padding:0;overflow:hidden;background:radial-gradient(ellipse at 50% 40%,#101A24 0,#080C10 70%)}
.ev-drawer{width:500px;flex:none;border-inline-start:1px solid var(--line-strong);background:var(--panel);box-shadow:-24px 0 40px rgba(0,0,0,.45);display:flex;flex-direction:column;min-height:0}
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
.ev .crumb button{font:13px var(--fa);color:var(--cyan);background:none;border:0;padding:0;cursor:pointer}
.ev .lbl{font:600 11px/1.3 var(--mono);letter-spacing:.09em;text-transform:uppercase;color:var(--ink-dim)}
[dir=rtl] .ev .lbl,[dir=rtl] .wz .lbl{letter-spacing:0;font-family:var(--fa);text-transform:none}
.ev .mut{color:var(--ink-dim)}.ev .soft{color:var(--ink-soft)}.ev .hi{color:var(--ink-hi)}
.ev .rw{display:flex;align-items:center;gap:12px}
.ev .sp{flex:1}
.ev .ell{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ev .card{background:var(--panel);border:1px solid var(--line);border-radius:var(--rc);min-width:0}
.ev .pad{padding:18px 20px}
.ev .sec{font-size:15.5px;font-weight:700;color:var(--ink-hi);margin:0 0 12px;display:flex;align-items:center;gap:10px}
.ev .sec small{font-weight:500;color:var(--ink-dim);font-size:13px}
.ev .b,.wz .b{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:38px;padding:0 16px;border-radius:8px;border:1px solid var(--line-strong);background:var(--panel-raised);color:var(--ink-hi);font:600 14px var(--fa);cursor:pointer;white-space:nowrap;text-decoration:none}
.ev .b.pri,.wz .b.pri{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}
.ev .b.bad{border-color:rgba(255,95,95,.5);color:#FF8F8F;background:transparent}
.ev .b.ghost,.wz .b.ghost{background:transparent;border-color:transparent;color:var(--ink-soft);font-weight:500}
.ev .b.sm,.wz .b.sm{height:32px;padding:0 12px;font-size:13px}
.ev .b.big,.wz .b.big{height:46px;padding:0 22px;font-size:15px}
.ev .b.armed,.wz .b.armed{background:var(--gate);border-color:var(--gate);color:#1D2530}
.ev .b:disabled,.wz .b:disabled{opacity:.45;cursor:default}
.ev .b:focus-visible,.wz .b:focus-visible,.ev input:focus-visible,.ev textarea:focus-visible,.ev select:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.ev .chip,.wz .chip{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 9px;border-radius:12px;font:600 12px var(--fa);border:1px solid var(--line-strong);color:var(--ink-soft);white-space:nowrap;background:none}
button.chip{cursor:pointer}
.ev .chip.ok,.wz .chip.ok{color:var(--accent);background:var(--accent-soft);border-color:var(--accent-line)}
.ev .chip.warn{color:var(--warn);background:var(--warn-bg);border-color:rgba(229,163,61,.4)}
.ev .chip.bad{color:#FF8F8F;background:var(--bad-bg);border-color:rgba(255,95,95,.4)}
.ev .chip[aria-pressed=true]{color:var(--accent);background:var(--accent-soft);border-color:var(--accent-line)}
.ev .risk{white-space:nowrap;display:inline-flex;align-items:center;gap:6px;height:22px;padding:0 9px;border-radius:5px;font:700 10.5px var(--mono);letter-spacing:.04em;text-transform:uppercase;color:#FFB4B4;background:var(--bad-bg);border:1px solid rgba(255,95,95,.5)}
.ev .risk.safe{color:var(--accent);background:var(--accent-soft);border-color:var(--accent-line)}
.ev .risk.mid{color:#F2C06B;background:var(--warn-bg);border-color:rgba(229,163,61,.5)}
.ev .risk.big{height:30px;font-size:12px}
[dir=rtl] .ev .risk{letter-spacing:0;font-family:var(--fa);text-transform:none}
.ev .pill{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;border-radius:12px;padding:2px 10px;height:24px;white-space:nowrap}
.ev .pill:before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}
.ev .pill.working{color:#3BE8B0;background:rgba(59,232,176,.10)}.ev .pill.waiting{color:#E5A33D;background:rgba(229,163,61,.13)}
.ev .pill.idle,.ev .pill.paused{color:#8A97A6;background:rgba(138,151,166,.12)}.ev .pill.done{color:#56B6C2;background:rgba(86,182,194,.12)}
.ev .av,.wz .av{position:relative;display:inline-block;flex:none;line-height:0}
.ev .av.bk,.wz .av.bk{border-radius:7px;padding:3px 3px 0}
.ev .av svg,.wz .av svg{display:block}
.ev .note{font-size:13px;color:var(--ink-dim);display:flex;gap:6px;align-items:flex-start;line-height:1.5}
.ev .hint{display:block;font-size:12px;color:var(--ink-dim);margin-top:3px}
.ev .msg,.wz .msg{font-size:13px;margin-top:8px}
.ev .msg.err,.wz .msg.err{color:#FF8F8F}.ev .msg.ok,.wz .msg.ok{color:var(--ok)}
.ev .empty{color:var(--ink-dim);font-size:13.5px;padding:8px 0}
.ev label.fl,.wz label.fl{display:flex;flex-direction:column;gap:6px;font-weight:600;color:var(--ink-hi);font-size:13px;margin:0 0 14px}
.ev label.fl .op{font-weight:400;color:var(--ink-dim)}
.ev input[type=text],.ev input[type=date],.ev input[type=number],.ev input[type=search],.ev textarea,.ev select,.wz input[type=text],.wz textarea{display:block;width:100%;font:14px var(--fa);color:var(--ink-hi);background:var(--ground);border:1px solid var(--line-strong);border-radius:8px;padding:9px 12px;box-sizing:border-box;font-weight:400}
.ev textarea,.wz textarea{min-height:96px;resize:vertical;line-height:1.5}
.ev input.bad{border-color:var(--bad)}
.ev input[type=checkbox],.wz input[type=checkbox],.ev input[type=radio],.wz input[type=radio]{accent-color:var(--accent);width:17px;height:17px;margin:0;flex:none}
.ev pre{font:12px/1.5 var(--mono);white-space:pre-wrap;word-break:break-word;background:var(--ground);border:1px solid var(--line);border-radius:6px;padding:10px 12px;color:var(--ink-soft);max-height:420px;overflow:auto;direction:ltr;text-align:left;margin:0}
.ev pre.txt{direction:auto;text-align:start;font:13px/1.55 var(--fa)}
.ev details>summary{cursor:pointer;color:var(--ink-soft);font-size:13px}
.tgl{appearance:none;-webkit-appearance:none;width:40px!important;height:22px!important;border-radius:11px;background:#2B3A49;position:relative;cursor:pointer;flex:none;margin:0}
.tgl:after{content:"";position:absolute;top:3px;inset-inline-start:3px;width:16px;height:16px;border-radius:50%;background:#C6D0DA;transition:inset-inline-start .12s}
.tgl:checked{background:var(--accent)}.tgl:checked:after{inset-inline-start:21px;background:#04140E}
.tgl:disabled{opacity:.45;cursor:default}
.seg{display:inline-flex;border:1px solid var(--line-strong,#2B3A49);border-radius:7px;overflow:hidden}
.seg button{font:12.5px var(--fa);background:transparent;border:0;border-inline-start:1px solid var(--line-strong,#2B3A49);color:var(--ink-dim);padding:6px 12px;cursor:pointer;white-space:nowrap}
.seg button:first-child{border-inline-start:0}
.seg button[aria-pressed=true]{background:#1E2A36;color:var(--ink-hi,#E9EFF5);font-weight:700}
.seg button.never[aria-pressed=true]{background:var(--bad-bg);color:#FF8F8F}
.seg button.allow[aria-pressed=true]{background:var(--accent-soft);color:var(--accent)}
.seg button:disabled{cursor:default}
/* tasks */
.ev .banner{display:flex;align-items:center;gap:12px;padding:12px 18px;margin:-6px 0 22px;border:1px solid rgba(229,163,61,.5);background:var(--warn-bg);border-radius:var(--rc)}
.ev .board4{display:grid;grid-template-columns:1fr 1fr 1.05fr 1fr;gap:20px;align-items:start}
.ev .col{display:flex;flex-direction:column;gap:10px;min-width:0}
.ev .colh{display:flex;align-items:center;gap:8px;padding:0 2px 4px;font-weight:700;color:var(--ink-hi);font-size:14.5px}
.ev .colh .n{font:600 12px var(--mono);color:var(--ink-dim)}
.ev .colw{background:rgba(229,163,61,.05);border:1px dashed rgba(229,163,61,.35);border-radius:12px;padding:10px;margin:-10px}
.ev .tk{padding:14px 16px;text-align:start;cursor:pointer;font:inherit;color:inherit;display:block;width:100%}
.ev .tk:hover{border-color:var(--line-strong)}
.ev .tk.wtk{border-color:rgba(229,163,61,.65);background:linear-gradient(0deg,var(--warn-bg),var(--warn-bg)),var(--panel);box-shadow:inset 4px 0 0 var(--warn)}
[dir=rtl] .ev .tk.wtk{box-shadow:inset -4px 0 0 var(--warn)}
.ev .tk.dn{opacity:.85}
.ev .tk .tt{color:var(--ink-hi);font-weight:600;font-size:14.5px;line-height:1.35;overflow-wrap:anywhere}
.ev .tk .q{color:var(--ink-soft);font-size:13px;margin-top:6px;padding:6px 10px;border-inline-start:3px solid var(--warn);background:rgba(0,0,0,.18);border-radius:0 6px 6px 0}
.ev .wb{display:inline-flex;gap:6px;align-items:center;margin-bottom:8px;font:700 11px var(--mono);color:#F2C06B;text-transform:uppercase;letter-spacing:.05em}
[dir=rtl] .ev .wb{letter-spacing:0;font-family:var(--fa);text-transform:none}
.ev .list .lr{display:grid;grid-template-columns:1fr auto auto auto;gap:12px;align-items:center;padding:10px 14px;border:1px solid var(--line);border-radius:8px;background:var(--panel);margin:0 0 6px;cursor:pointer;width:100%;text-align:start;font:13.5px var(--fa);color:var(--ink-soft)}
.ev .list .lr:hover{border-color:var(--line-strong)}
.ev .list h4{font:600 12px var(--fa);color:var(--ink-dim);margin:18px 0 8px}
.ev .two{display:grid;grid-template-columns:1fr 360px;gap:26px;align-items:start}
.ev .pick{display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:8px;margin:0 -10px;cursor:pointer;font-weight:400;color:var(--ink-soft);font-size:13.5px}
.ev .pick:has(input:checked){background:var(--accent-soft);box-shadow:inset 0 0 0 1px var(--accent-line);color:var(--ink-hi)}
.ev .facts>div{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:7px 0}
.ev .tl{display:flex;gap:12px;align-items:flex-start;padding:9px 0;border-top:1px solid var(--line)}
.ev .tl time{font:13px var(--mono);color:var(--ink-dim);width:46px;flex:none;direction:ltr}
.ev .cm{display:flex;gap:12px;align-items:flex-start;margin-bottom:14px}
.ev .cm .cb{flex:1;background:var(--panel-raised);border:1px solid var(--line);border-radius:10px;padding:10px 14px;min-width:0}
.ev .wbox{border-color:rgba(229,163,61,.6);background:linear-gradient(0deg,var(--warn-bg),var(--warn-bg)),var(--panel);box-shadow:inset 4px 0 0 var(--warn)}
[dir=rtl] .ev .wbox{box-shadow:inset -4px 0 0 var(--warn)}
/* approvals */
.ev .appr{display:grid;grid-template-columns:400px 1fr;gap:24px;align-items:start}
.ev .ai{display:flex;gap:12px;padding:14px 16px;border:0;border-bottom:1px solid var(--line);align-items:flex-start;background:none;width:100%;text-align:start;cursor:pointer;font:inherit;color:inherit}
.ev .ai:last-child{border-bottom:0}
.ev .ai[aria-current=true]{background:var(--panel-raised);box-shadow:inset 4px 0 0 var(--warn)}
[dir=rtl] .ev .ai[aria-current=true]{box-shadow:inset -4px 0 0 var(--warn)}
.ev .letter{padding:26px 30px}
.ev .prev{margin-top:16px;border:1px solid var(--line-strong);border-radius:10px;background:var(--ground);padding:16px 18px}
.ev .prev .body{color:var(--ink-hi);font-size:15px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}
.ev .whyno{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px}
.ev .whyno .t{color:var(--ink-soft);font-size:14px;line-height:1.55;margin-top:6px}
/* finished work */
.ev .gal{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:18px}
.ev .fc{overflow:hidden;display:flex;flex-direction:column}
.ev .th{height:150px;position:relative;border-bottom:1px solid var(--line);background:#0D1319;display:flex;align-items:center;justify-content:center;overflow:hidden}
.ev .th img{width:100%;height:100%;object-fit:cover}
.ev .tb{position:absolute;inset-inline-start:10px;top:10px;display:inline-flex;gap:5px;align-items:center;background:rgba(10,15,20,.88);border:1px solid var(--line-strong);border-radius:5px;padding:2px 7px;font:700 11px var(--mono);color:var(--ink-hi)}
/* settings */
.ev .setw{display:flex;align-items:flex-start;gap:30px}
.ev .snav{display:flex;flex-direction:column;gap:4px;width:210px;flex:none}
.ev .snav button{display:flex;align-items:center;gap:10px;height:40px;padding:0 12px;border-radius:8px;border:0;background:none;color:var(--ink-soft);font:14.5px var(--fa);cursor:pointer;text-align:start}
.ev .snav button[aria-pressed=true]{background:var(--panel-raised);color:var(--ink-hi);font-weight:700;box-shadow:inset 3px 0 0 var(--accent)}
[dir=rtl] .ev .snav button[aria-pressed=true]{box-shadow:inset -3px 0 0 var(--accent)}
.ev .rows>.r{display:flex;align-items:center;gap:12px;padding:13px 18px;border-top:1px solid var(--line)}
.ev .rows>.r:first-child{border-top:0}
.ev .rows>.more{padding:4px 18px 16px 60px;border-top:0}
[dir=rtl] .ev .rows>.more{padding:4px 60px 16px 18px}
.ev .exp{font:600 10px var(--mono);color:var(--warn);border:1px solid rgba(229,163,61,.45);border-radius:3px;padding:0 4px;margin-inline-start:6px;vertical-align:1px;text-transform:uppercase}
.ev .phone{background:var(--ground);border:1px solid var(--line);border-radius:12px;padding:14px}
.ev .phone .n{background:var(--panel-raised);border-radius:10px;padding:12px 14px;border-inline-start:4px solid var(--warn)}
.ev .packs{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}
.ev .pk{padding:14px;text-align:start;font:inherit;color:inherit;cursor:pointer;display:block;width:100%}
.ev .pk.off{border-style:dashed;background:transparent}
.ev .pk[aria-current=true]{border-color:var(--accent-line)}
/* team: the office room, a campus list, the people in it, and the side panel */
.ev .scene{position:absolute;inset:0;width:100%;height:100%}
.ev .scene .seat{cursor:pointer}
.ev .float{position:absolute;z-index:3;background:rgba(16,22,29,.94);border:1px solid var(--line-strong);border-radius:10px}
.ev .camp{left:20px;top:20px;padding:12px 14px;width:220px}
.ev .camp button{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;border:0;background:none;width:100%;color:var(--ink-soft);font:13.5px var(--fa);cursor:pointer;text-align:start}
.ev .camp button[aria-current=true]{background:var(--panel-raised);box-shadow:inset 0 0 0 1px var(--line-strong);color:var(--ink-hi);font-weight:700}
.ev .sw{width:10px;height:10px;border-radius:2px;display:inline-block;flex:none}
.ev .roster{inset-inline:20px;bottom:56px;padding:10px 14px;display:flex;gap:10px;align-items:center;overflow:auto hidden}
.ev .roster .m{display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:8px;border:1px solid var(--line);background:var(--panel-raised);cursor:pointer;font:inherit;color:inherit;text-align:start;flex:none}
.ev .roster .m[aria-current=true]{border-color:var(--accent)}
.ev .ticker{position:absolute;inset-inline:0;bottom:0;height:42px;background:rgba(16,22,29,.94);border-top:1px solid var(--line);display:flex;align-items:center;gap:22px;padding:0 20px;font-size:13px;color:var(--ink-soft);z-index:3;overflow:hidden;white-space:nowrap}
.ev .ticker i{display:inline-block;width:8px;height:8px;margin-inline-end:7px}
.ev .tool{inset-inline-end:20px;top:20px;padding:6px;display:flex;gap:6px}
.ph{display:flex;align-items:center;gap:14px;padding:16px 20px;border-bottom:1px solid var(--line)}
.ph h2{font-size:19px!important}
.pb{padding:18px 20px;overflow:auto;flex:1;display:flex;flex-direction:column;gap:16px;scrollbar-width:thin;scrollbar-color:#2A3644 transparent}
.pf{padding:14px 20px;border-top:1px solid var(--line);display:flex;gap:10px;background:var(--panel-raised);align-items:center;flex-wrap:wrap}
.ev .x{margin-inline-start:auto;width:36px;height:36px;border-radius:8px;border:1px solid var(--line-strong);display:grid;place-items:center;color:var(--ink-soft);background:none;cursor:pointer;flex:none}
.ev .stat{background:var(--panel-raised);border:1px solid var(--line);border-radius:8px;padding:14px 16px;flex:1;min-width:0}
.ev .now{border-color:var(--accent-line);background:var(--accent-soft)}
.ev .now.w{border-color:rgba(229,163,61,.45);background:var(--warn-bg)}
.ev .jr{display:flex;gap:10px;align-items:center;padding:7px 0;border-top:1px solid var(--line);font-size:13.5px}
.ev .looks{display:flex;gap:8px;flex-wrap:wrap}
.ev .looks label{padding:5px 5px 0;border-radius:8px;border:2px solid var(--line);cursor:pointer;line-height:0}
.ev .looks label:has(input:checked){border-color:var(--accent)}
.ev .looks input{position:absolute;opacity:0;width:1px;height:1px}
.ev .asks{display:grid;grid-template-columns:1fr 1fr;gap:8px 12px;font-size:13.5px}
.ev .asks label{display:flex;gap:8px;align-items:center;color:var(--ink-soft);font-weight:400}
.ev table.pol{border-collapse:collapse;width:100%;font-size:13px}
.ev table.pol td,.ev table.pol th{border-top:1px solid var(--line);padding:8px 6px;text-align:start;vertical-align:middle}
.ev table.pol th{font-weight:600;color:var(--ink-dim)}
/* the Today strip on the campus */
.today{position:absolute;inset-inline-start:16px;top:12px;z-index:5;background:rgba(16,22,29,.94);border:1px solid var(--line);border-radius:5px;padding:6px 12px;font-size:12.5px;color:var(--ink-soft);display:flex;gap:10px;align-items:center;flex-wrap:wrap;max-width:calc(100% - 40px)}
.today b{color:var(--ink);font-weight:600}
.today button{font:12.5px var(--fa);color:var(--cyan);background:none;border:0;padding:0;cursor:pointer;text-decoration:underline dotted}
/* the first-start wizard: the whole window, a campus on one side, the form on the other */
.wiz-back{position:fixed;inset:0;background:#080C10;z-index:70;--line-strong:#2B3A49;--ink-hi:#E9EFF5;--on-accent:#04140E}
.wiz-back[hidden]{display:none}
.wz{position:absolute;inset:0;display:flex;flex-direction:column;font-size:14px;color:var(--ink-soft)}
.wz .wtop{height:56px;flex:none;background:var(--panel);border-bottom:1px solid var(--line);display:flex;align-items:center;gap:8px;padding:0 18px}
.wz .wtop .logo{font-weight:700;font-size:18px;color:var(--ink-hi);display:flex;align-items:center;gap:8px;margin-inline-end:24px}
.wz .wtop .logo small{font:700 9.5px var(--mono);letter-spacing:.08em;color:var(--accent);border:1px solid var(--accent-line);padding:2px 5px;border-radius:3px}
.wz .stp{display:flex;align-items:center;gap:8px;height:36px;padding:0 14px;border-radius:8px;border:1px solid transparent;color:var(--ink-soft);font-weight:600;font-size:14px}
.wz .stp.on{background:var(--panel-raised);border-color:var(--line-strong);color:var(--ink-hi)}
.wz .stp.done{color:var(--accent)}
.wz .wbody{flex:1;display:flex;min-height:0}
.wz .wscene{flex:1;position:relative;min-width:0;overflow:hidden;background:radial-gradient(ellipse at 50% 40%,#101A24 0,#080C10 70%)}
.wz .wscene>svg{position:absolute;inset:0 0 120px 0;width:100%;height:calc(100% - 120px)}
.wz .guide{position:absolute;inset-inline-start:60px;bottom:40px;display:flex;gap:16px;align-items:flex-end}
.wz .say{background:var(--panel);border:1px solid var(--line-strong);border-radius:12px 12px 12px 2px;padding:14px 18px;font-size:16px;color:var(--ink-hi);max-width:380px;line-height:1.5}
.wz .wform{width:600px;max-width:52vw;flex:none;background:var(--panel);border-inline-start:1px solid var(--line-strong);display:flex;flex-direction:column;min-height:0}
.wz .wpad{padding:30px 32px 16px;overflow:auto;flex:1;display:flex;flex-direction:column;gap:14px;scrollbar-width:thin;scrollbar-color:#2A3644 transparent}
.wz h1{font-size:28px;color:var(--ink-hi);margin:6px 0 0;line-height:1.2}
.wz .lead{font-size:15px;color:var(--ink-soft);margin:6px 0 4px;line-height:1.5}
.wz .wfoot{padding:14px 28px;border-top:1px solid var(--line);display:flex;gap:12px;align-items:center;background:var(--panel-raised);flex:none}
.wz .oprow{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:8px;border:1px solid var(--line);cursor:pointer;margin:0}
.wz .oprow:has(input:checked){background:var(--panel-raised)}
.wz .oprow .bar{width:8px;height:36px;border-radius:2px;flex:none}
.wz .oprow b{display:block;color:var(--ink-hi);font-size:14.5px}
.wz .oprow span.d{font-size:12.5px;color:var(--ink-dim)}
.wz .seg2{display:inline-flex;border:1px solid var(--line-strong);border-radius:7px;overflow:hidden}
.wz .seg2 button,.wz .seg2 label{font:600 13.5px var(--fa);background:transparent;border:0;border-inline-start:1px solid var(--line-strong);color:var(--ink-dim);padding:8px 16px;cursor:pointer;display:flex;gap:6px;align-items:center;margin:0}
.wz .seg2>:first-child{border-inline-start:0}
.wz .seg2 [aria-pressed=true],.wz .seg2 label:has(input:checked){background:#1E2A36;color:var(--ink-hi)}
.wz .seg2 input{position:absolute;opacity:0;width:1px;height:1px}
.wz .step{display:flex;gap:14px;align-items:flex-start}
.wz .step .num{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font:700 13px var(--mono);flex:none;border:2px solid var(--accent);color:var(--accent)}
.wz .step .num.ok{background:var(--accent);color:var(--on-accent)}
.wz .wt{display:flex;gap:12px;align-items:center;padding:12px 14px;border-radius:8px;background:var(--warn-bg);border:1px solid rgba(229,163,61,.4)}
.wz .wt .dot{width:12px;height:12px;border-radius:50%;background:var(--warn);box-shadow:0 0 0 5px rgba(229,163,61,.25);flex:none}
.wz .wt.ok{background:var(--accent-soft);border-color:var(--accent-line)}
.wz .wt.ok .dot{background:var(--accent);box-shadow:0 0 0 5px rgba(59,232,176,.2)}
.wz .card{background:var(--panel-raised);border:1px solid var(--line);border-radius:8px;padding:10px 14px}
.wz pre{font:12px/1.5 var(--mono);white-space:pre-wrap;word-break:break-all;background:var(--ground);border:1px solid var(--line);border-radius:6px;padding:8px 10px;max-height:200px;overflow:auto;direction:ltr;text-align:left;margin:6px 0 0}
.wz .lbl{font:600 11px/1.3 var(--mono);letter-spacing:.09em;text-transform:uppercase;color:var(--ink-dim)}
.wz .hint{font-size:12.5px;color:var(--ink-dim)}
.wz .mut{color:var(--ink-dim)}
.wz .rw{display:flex;align-items:center;gap:12px}
@media (max-width:1100px){.wz .wscene{display:none}.wz .wform{width:auto;max-width:none;flex:1}}
`

function everyoneViews(h) {
  const { esc, fa, T, errTxt } = h
  const A = everyoneArt()
  const ic = A.ic
  const MODES = ['tasks', 'appr', 'team', 'dlv', 'set']
  const st = {
    data: {}, at: {}, busy: {}, err: {},
    drawer: null, dv: 0, dmsg: null,
    taskView: 'board', taskFilter: '', taskOffice: '', page: null, editTask: false,
    apprSel: '', note: '', dlvKind: '', dlvQ: '', setTab: 'assistants', openCard: '', openPack: '', channel: 'ntfy',
    teamOffice: '', armed: '', armT: 0, hire: null, wiz: null, wv: 0,
    test: null, notifSeen: null, lastMode: '',
  }
  try { const v = localStorage.getItem('arsenale-task-view'); if (v === 'list' || v === 'board') st.taskView = v } catch { /* a private window */ }
  const co = () => (typeof COMPANY !== 'undefined' && COMPANY && COMPANY.configured ? COMPANY : null)
  const canWrite = () => LIVE && !!ANSWER_TOKEN
  const offices = () => (co() ? co().offices.filter((o) => !o.builtIn && !o.archived) : [])
  const officeById = (id) => co() && co().offices.find((x) => x.id === id)
  const officeName = (id) => { const o = officeById(id); return !o ? id : o.builtIn ? T('Unassigned work') : LANG === 'fa' && o.nameFa ? o.nameFa : o.name }
  // the colours come with the page; a company poll before set-up carries none
  const themes0 = (typeof COMPANY !== 'undefined' && COMPANY && COMPANY.themes) || {}
  const themes = () => (typeof COMPANY !== 'undefined' && COMPANY && COMPANY.themes) || themes0
  const colorOf = (officeId) => { const o = officeById(officeId); return (o && o.color) || '#56B6C2' }
  const emp = (id) => (co() ? co().employees.find((e) => e.id === id) : null)

  // ---------- people, by name
  const titleOf = (e) => (!e ? '' : LANG === 'fa' ? e.titleFa || '' : e.title || '')
  /** What a person is called: the name they were given, else their job
   *  title, else (Persian page, no Persian title) the id, which is data. */
  function nameOf(id) {
    if (!id) return ''
    if (id === 'supervisor') return T('Your assistant')
    if (id === 'board') return T('You')
    const e = emp(id)
    return (e && (e.name || titleOf(e))) || id
  }
  /** "Mira, Campaign planner"; just the title when there is no name. */
  function nameLine(id) {
    const e = emp(id)
    if (!e || !e.name || !titleOf(e) || e.name === titleOf(e)) return nameOf(id)
    return e.name + T(', ') + titleOf(e)
  }
  const seedOf = (id) => { const e = emp(id); return id + (e && e.look ? ':' + e.look : '') }
  const colorOfMember = (id) => { const e = emp(id); return colorOf(e && e.homeOfficeId) }
  function face(id, size, back) {
    if (!id || id === 'supervisor') return A.robot(size)
    if (id === 'board') return A.owner(size)
    return A.person(seedOf(id), colorOfMember(id), size, back)
  }
  /** Who asked a question: the member who acts, the job's member, the task's
   *  member, else the assistant itself. */
  function askerOf(g) {
    if (g.action && g.action.member) return g.action.member
    const run = g.run && (DATA.runs || []).concat(DATA.active || []).find((r) => r.id === g.run)
    if (run && run.agent) return run.agent
    const t = g.taskId && taskById(g.taskId)
    if (t && t.assigneeAgentId) return t.assigneeAgentId
    return 'supervisor'
  }

  // ---------- time
  const when = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString(LANG === 'fa' ? 'fa-IR' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }
  const hm = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : fa(String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')) }
  const dayOf = (ymd) => { const d = new Date(ymd + 'T12:00:00'); return isNaN(d) ? ymd : d.toLocaleDateString(LANG === 'fa' ? 'fa-IR' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) }
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }
  const isToday = (iso) => { const d = new Date(iso); return !isNaN(d) && d.toDateString() === new Date().toDateString() }
  const dueLabel = (ymd) => (ymd === today() ? T('Today') : dayOf(ymd))
  /** "Today 10:22", "Yesterday", "2 Oct". */
  function day(iso) {
    const d = new Date(iso)
    if (isNaN(d)) return ''
    if (isToday(iso)) return T('Today') + ' ' + hm(iso)
    const y = new Date(); y.setDate(y.getDate() - 1)
    if (d.toDateString() === y.toDateString()) return T('Yesterday')
    return d.toLocaleDateString(LANG === 'fa' ? 'fa-IR' : 'en-GB', { day: 'numeric', month: 'short' })
  }
  const dur = (ms) => {
    const m = Math.round((ms || 0) / 60000)
    if (m < 1) return T('under a minute')
    const hh = Math.floor(m / 60), mm = m % 60
    return (hh ? fa(hh) + T(' h') + (mm ? ' ' : '') : '') + (mm || !hh ? fa(mm) + T(' min') : '')
  }
  /** "just now", "26 minutes ago", "yesterday". */
  function ago(iso) {
    const t = Date.parse(iso)
    if (isNaN(t)) return ''
    const m = Math.round((Date.now() - t) / 60000)
    if (m < 2) return T('just now')
    if (m < 60) return fa(m) + T(' minutes ago')
    if (m < 120) return T('an hour ago')
    if (isToday(iso)) return fa(Math.floor(m / 60)) + T(' hours ago')
    return day(iso)
  }
  const ltr = (s) => '<bdi dir="ltr">' + esc(s) + '</bdi>'
  const tokens = (n) => (h.k ? h.k(n || 0) : fa(n || 0))

  // ---------- data
  async function getJson(url) {
    const res = await fetch(url, { cache: 'no-store' })
    const body = await res.json().catch(() => ({}))
    // the browser no longer holds the owner's key: only opening the dashboard again helps
    if (res.status === 401) throw new Error('This page lost its key. Open the dashboard again with arsenale open.')
    if (!res.ok) throw new Error(body.error || ('HTTP ' + res.status))
    return body
  }
  /** Loads one data set, at most every `age` ms unless forced. */
  function load(key, url, force, age) {
    if (!LIVE) return
    // a forced load during one already under way comes after it: that one may
    // have left before the write it must show
    if (st.busy[key]) { if (force) st.redo = Object.assign(st.redo || {}, { [key]: url }); return }
    if (!force && st.at[key] && Date.now() - st.at[key] < (age || 5000)) return
    st.busy[key] = true
    getJson(url).then((d) => { st.data[key] = d; st.err[key] = '' }, (e) => { st.err[key] = e.message }).then(() => {
      st.busy[key] = false; st.at[key] = Date.now()
      const again = st.redo && st.redo[key]
      if (again) { delete st.redo[key]; load(key, again, true) }
      h.redraw()
    })
  }
  async function send(url, body) { return h.post(url, body) }
  function copy(text) {
    const done = () => { st.dmsg = { ok: true, text: T('Copied.') }; bump() }
    try { navigator.clipboard.writeText(text).then(done, () => fallback()) } catch { fallback() }
    function fallback() {
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select()
      try { document.execCommand('copy'); done() } catch { /* the text is on screen to copy by hand */ }
      ta.remove()
    }
  }
  const bump = () => { st.dv++; h.redraw() }
  const arm = (key) => {
    if (st.armed === key) { st.armed = ''; clearTimeout(st.armT); return true }
    st.armed = key; clearTimeout(st.armT); st.armT = setTimeout(() => { st.armed = ''; bump() }, 6000); bump()
    return false
  }
  const armedLabel = (key, label) => (st.armed === key ? T('Click again to confirm: ') + label : label)
  const armedCls = (key) => (st.armed === key ? ' armed' : '')
  const msgHtml = () => (st.dmsg ? '<p class="msg ' + (st.dmsg.ok ? 'ok' : 'err') + '" role="status">' + esc(st.dmsg.text) + '</p>' : '')
  const liveOnly = () => '<p class="empty">' + T('Open the live dashboard (arsenale serve) to use this screen.') + '</p>'
  const head = (title, sub, act, crumb) => (crumb ? '<div class="crumb">' + crumb + '</div>' : '') + '<div class="eh"><div><h1>' + title + '</h1>' + (sub ? '<p class="sub">' + sub + '</p>' : '') + '</div><div class="ea">' + (act || '') + '</div></div>'
  const gates = () => (Array.isArray(DATA.gates) ? DATA.gates : [])
  const waiting = () => gates().filter((g) => g.status === 'waiting').sort((a, b) => String(b.askedAt).localeCompare(String(a.askedAt)))
  const runsOf = (pred) => (DATA.runs || []).filter(pred)
  const taskList = () => (st.data.tasks && st.data.tasks.tasks) || []
  const taskById = (id) => taskList().find((t) => t.id === id) || (st.data.task && st.data.task.id === id ? st.data.task : null)

  // ---------- what an action means, in plain words (the words follow the page language)
  const CAT = {
    'message.send': ['Sending email or messages', 'Leaves your computer', 'Message', 'This is what would be sent', 'Approve and send', 'The message goes out at once and cannot be taken back.', 'Nothing is sent. {name} is told and can change it, or wait.', 'Send this message?'],
    'post.public': ['Posting online or on social media', 'Leaves your computer', 'Public', 'This is what would be posted', 'Approve and post', 'People see the post straight away. You can delete it later, but people may already have read it.', 'Nothing is posted. {name} is told and can change the text, or wait for a new date.', 'Post this online?'],
    payment: ['Paying or spending money', 'Leaves your computer', 'Money', 'This is what would be paid', 'Approve payment', 'Money leaves your account. A payment is hard to undo.', 'Nothing is paid. {name} is told.', 'Make this payment?'],
    delete: ['Deleting or overwriting files', 'Deletes files', 'Cannot be undone', 'This is what would be deleted', 'Approve and delete', 'Deleted files may not come back.', 'Nothing is deleted. {name} is told and keeps the files.', 'Delete these files?'],
    'share.external': ['Sharing files outside', 'Leaves your computer', 'Shared', 'This is what would be shared', 'Approve and share', 'Whoever gets the files can keep them.', 'Nothing is shared. {name} is told.', 'Share this outside?'],
    'account.change': ['Signing up or changing accounts', 'Leaves your computer', 'Accounts', 'This is what would change', 'Approve the change', 'It changes an account in your name.', 'Nothing changes. {name} is told.', 'Make this account change?'],
    'other.external': ['Anything else that leaves this computer', 'Leaves your computer', '', 'This is what would happen', 'Approve', 'It reaches something outside this computer.', 'Nothing happens. {name} is told.', 'Go ahead with this?'],
  }
  const catOf = (g) => CAT[g.action && g.action.category] || CAT['other.external']
  const longSum = (g) => Array.from(String(g.action.summary || '')).length > 100
  const qmark = (s) => { s = String(s || '').trim(); return /[?؟]$/.test(s) ? s : s + (LANG === 'fa' ? '؟' : '?') }
  /** The question in one plain sentence, drawn from the fields when it can be,
   *  so its words follow the page language; the stored English sentence is
   *  what an older dashboard shows. */
  function plainQ(g) {
    const p = g.payload || {}
    // a short summary is the question itself; a long one (a whole post) goes in the preview
    if (g.approvalType === 'action' && g.action) return longSum(g) ? T(catOf(g)[7]) : qmark(g.action.summary || T(catOf(g)[7]))
    if (g.approvalType === 'hire') return T('Add a team member: ') + (p.title || p.name || p.id || '') + T(', to ') + officeName(p.officeId) + (LANG === 'fa' ? '؟' : '?')
    return g.question
  }
  function riskOf(g) {
    if (g.approvalType === 'action' && g.action) { const c = catOf(g); return { cls: g.action.category === 'delete' ? 'mid' : '', label: T(c[1]), sub: c[2] ? T(c[2]) : '' } }
    return { cls: 'safe', label: T('Stays on your computer'), sub: '' }
  }
  const riskHtml = (g, big) => { const r = riskOf(g); return '<span class="risk ' + r.cls + (big ? ' big' : '') + '">' + ic(r.cls === 'safe' ? 'lock' : 'out', big ? 14 : 11) + ' ' + esc(r.label) + (big && r.sub ? ' · ' + esc(r.sub) : '') + '</span>' }

  // ========== tasks
  const STATE = { backlog: 'Later', todo: 'To do', in_progress: 'Working on it', in_review: 'Waiting for you', blocked: 'Stuck', done: 'Done', cancelled: 'Cancelled' }
  const ORDER = ['in_review', 'todo', 'in_progress', 'blocked', 'backlog', 'done', 'cancelled']
  function forWhom(t) {
    if (t.assigneeUserId === 'board') return T('You')
    if (t.assigneeAgentId) return nameOf(t.assigneeAgentId)
    if (t.assigneeOfficeId) return officeName(t.assigneeOfficeId)
    return T('Your assistant decides')
  }
  const whoId = (t) => t.assigneeUserId === 'board' ? 'board' : t.assigneeAgentId || 'supervisor'
  const taskGate = (t) => waiting().find((g) => g.taskId === t.id)
  const activeFor = (t) => (DATA.active || []).filter((r) => r.issue === t.id)
  const doneMs = (t) => runsOf((r) => r.issue === t.id).reduce((n, r) => n + (r.durMs || 0), 0)
  function column(t) {
    if (t.status === 'in_review' || taskGate(t)) return 'wait'
    if (t.status === 'in_progress' || t.status === 'blocked') return 'work'
    if (t.status === 'todo' || t.status === 'backlog') return 'todo'
    if (t.status === 'done' && Date.now() - Date.parse(t.completedAt || t.updatedAt) < 7 * 86400000) return 'done'
    return ''
  }
  function tasksMain() {
    if (!LIVE) return liveOnly()
    if (st.page && st.page.type === 'new') return taskNew()
    if (st.page && st.page.type === 'task') return taskPage()
    if (!co()) return head(T('Tasks')) + '<p class="empty">' + T('Tasks belong to a company. Set up your company first.') + '</p><p><button type="button" class="b pri" data-ev="wiz-open">' + T('Set up your company') + '</button></p>'
    load('tasks', 'api/tasks')
    load('packs', 'api/packs', false, 60000)
    load('connect', 'api/connect', false, 15000)
    const list = taskList()
    const tog = '<span class="seg" role="group" aria-label="' + T('Show as') + '"><button type="button" data-ev="tview" data-arg="board" aria-pressed="' + (st.taskView === 'board') + '">' + T('Board') + '</button><button type="button" data-ev="tview" data-arg="list" aria-pressed="' + (st.taskView === 'list') + '">' + T('List') + '</button></span>'
    let html = head(T('Tasks'), '', tog + notConnected() + (canWrite() ? '<button type="button" class="b pri" data-ev="task-new">' + ic('plus', 15, 2.4) + T('New task') + '</button>' : ''))
    if (st.err.tasks) html += '<p class="msg err">' + esc(errTxt(st.err.tasks)) + '</p>'
    const need = list.filter((t) => column(t) === 'wait')
    if (need.length) {
      const names = [...new Set(need.map((t) => { const g = taskGate(t); return nameOf(g ? askerOf(g) : whoId(t)) }))]
      html += '<div class="banner" role="status"><span style="color:var(--warn)">' + ic('bell', 22) + '</span><div><b class="hi">' + fa(need.length) + ' ' + T(need.length === 1 ? 'task needs you' : 'tasks need you') + '</b> <span class="soft">' + esc(names.length > 1 ? names.slice(0, -1).join(T(', ')) + T(' and ') + names[names.length - 1] : names[0]) + ' ' + T(names.length === 1 ? 'is waiting for a yes or no.' : 'are waiting for a yes or no.') + '</span></div><button type="button" class="b sm" data-ev="goto" data-arg="appr" style="margin-inline-start:auto">' + T('Go to Approvals') + '</button></div>'
    }
    if (!list.length) {
      html += '<p class="empty">' + T('No tasks yet. Write one, and your assistant will see it next time.') + '</p>'
      const samples = samplesOf()
      if (samples.length && canWrite()) html += '<div class="sec" style="margin-top:14px">' + T('Start from an example') + '</div><div class="gal">' + samples.slice(0, 6).map((s, i) => '<button type="button" class="card tk" data-ev="task-sample" data-arg="' + i + '"><div class="tt" dir="auto">' + esc(s.title) + '</div><p class="soft" dir="auto" style="font-size:13px;margin-top:6px">' + esc(s.description) + '</p></button>').join('') + '</div>'
      return html + '<p class="note" style="margin-top:16px">' + ic('info', 14) + T('Writing a task starts nothing. Your assistant picks it up the next time you talk to it.') + '</p>'
    }
    html += st.taskView === 'list' ? taskListHtml(list) : taskBoard(list)
    return html + '<p class="note" style="margin-top:22px">' + ic('info', 14) + T('Writing a task starts nothing. Your assistant picks it up the next time you talk to it.') + '</p>'
  }
  function taskCard(t) {
    const col = column(t), wait = col === 'wait', g = taskGate(t)
    const id = whoId(t)
    const late = t.dueDate && t.dueDate < today() && !['done', 'cancelled'].includes(t.status)
    let html = '<button type="button" class="card tk' + (wait ? ' wtk' : '') + (col === 'done' ? ' dn' : '') + '" data-ev="task-open" data-arg="' + esc(t.id) + '">'
    if (wait) html += '<div class="wb">' + ic('bell', 13, 2.2) + ' ' + T('Waiting for you') + '</div>'
    html += '<div class="tt" dir="auto">' + esc(t.title) + '</div>'
    if (g) html += '<div class="q" dir="auto">' + esc(plainQ(g)) + (g.approvalType === 'action' ? ' ' + riskHtml(g) : '') + '</div>'
    else if (t.status === 'in_review') html += '<div class="q">' + T('Ready for you to check.') + '</div>'
    html += '<div class="rw" style="margin-top:12px;gap:8px">' + face(g ? askerOf(g) : id, 24, true) + '<span class="soft ell" style="font-size:13px">' + esc(g ? nameOf(askerOf(g)) : forWhom(t)) + '</span><span class="sp"></span>'
    if (t.status === 'done') html += '<span class="chip">' + ic('check', 11, 3) + ' ' + T('Done') + ' ' + esc(day(t.completedAt || t.updatedAt)) + '</span>'
    else if (t.dueDate) html += '<span class="chip' + (late || t.dueDate === today() ? ' bad' : '') + '">' + ic('cal', 12) + ' ' + esc(dueLabel(t.dueDate)) + '</span>'
    html += '</div>'
    const act = activeFor(t)[0]
    if (t.status === 'blocked') html += '<p class="mut" style="font-size:12.5px;margin-top:6px">' + T('Stuck: your assistant needs something') + '</p>'
    else if (act) html += '<p class="mut" style="font-size:12.5px;margin-top:6px">' + T('Started ') + esc(ago(act.startedAt)) + '</p>'
    else if (t.status === 'done' && doneMs(t)) html += '<p class="mut" style="font-size:12.5px;margin-top:6px">' + T('Took ') + esc(dur(doneMs(t))) + '</p>'
    else if (t.status === 'backlog') html += '<p class="mut" style="font-size:12.5px;margin-top:6px">' + T('Later') + '</p>'
    return html + '</button>'
  }
  function taskBoard(list) {
    const col = (k, title, cls) => { const g = list.filter((t) => column(t) === k); return '<div class="col' + (cls || '') + '"><div class="colh">' + title + ' <span class="n">' + fa(g.length) + '</span></div>' + (g.length ? g.map(taskCard).join('') : '<p class="mut" style="font-size:13px;padding:6px 2px">' + T('Nothing here.') + '</p>') + '</div>' }
    return '<div class="board4">' + col('todo', T('To do')) + col('work', T('Working on it')) + '<div class="colw">' + col('wait', T('Waiting for you')) + '</div>' + col('done', T('Done this week')) + '</div>'
  }
  function taskListHtml(list) {
    const chip = (v, label) => '<button type="button" class="chip" data-ev="tfilter" data-arg="' + v + '" aria-pressed="' + (st.taskFilter === v) + '">' + label + (v ? ' ' + fa(list.filter((t) => t.status === v).length) : '') + '</button>'
    let html = '<div class="rw" style="gap:8px;flex-wrap:wrap;margin:-6px 0 6px">' + chip('', T('All')) + ORDER.slice(0, 4).map((s) => chip(s, T(STATE[s]))).join('') + chip('done', T('Done')) +
      '<select data-ev-change="toffice" aria-label="' + T('Office') + '" style="width:auto;display:inline-block;padding:4px 10px"><option value="">' + T('Every office') + '</option>' + offices().map((o) => '<option value="' + esc(o.id) + '"' + (st.taskOffice === o.id ? ' selected' : '') + '>' + esc(officeName(o.id)) + '</option>').join('') + '</select></div>'
    const memberOffice = (id) => { const e = emp(id); return e ? e.homeOfficeId : '' }
    const shown = list.filter((t) => (!st.taskFilter || t.status === st.taskFilter) && (!st.taskOffice || t.assigneeOfficeId === st.taskOffice || (t.assigneeAgentId && memberOffice(t.assigneeAgentId) === st.taskOffice)))
    html += '<div class="list">'
    for (const s of ORDER) {
      const g = shown.filter((t) => t.status === s)
      if (!g.length) continue
      html += '<h4>' + T(STATE[s]) + ' · ' + fa(g.length) + '</h4>' + g.map((t) => {
        const late = t.dueDate && t.dueDate < today() && !['done', 'cancelled'].includes(t.status)
        return '<button type="button" class="lr" data-ev="task-open" data-arg="' + esc(t.id) + '"><span class="rw" style="gap:10px;min-width:0">' + face(whoId(t), 22, true) + '<span class="hi ell" dir="auto">' + esc(t.title) + '</span></span><span class="chip">' + esc(forWhom(t)) + '</span>' + (t.dueDate ? '<span class="chip' + (late ? ' bad' : '') + '">' + esc(dueLabel(t.dueDate)) + '</span>' : '<span></span>') +
          '<span class="mut" style="font-size:12.5px">' + (t.seenAt ? T('seen by your assistant ') + hm(t.seenAt) : T('not seen yet')) + (t.comments ? ' · ' + fa(t.comments) + ' ' + T('comments') : '') + '</span></button>'
      }).join('')
    }
    return html + '</div>'
  }
  function samplesOf() {
    const packs = (st.data.packs && st.data.packs.packs) || []
    // one language per screen: the Persian page offers only examples that have a Persian text
    return packs.filter((p) => p.installed).flatMap((p) => p.sampleTasks || []).filter((x) => LANG !== 'fa' || x.titleFa).map((x) => (LANG === 'fa' ? Object.assign({}, x, { title: x.titleFa, description: x.descriptionFa || '' }) : x))
  }
  function notConnected() {
    const c = st.data.connect
    if (!c || (c.clients && c.clients.length)) return ''
    return '<button type="button" class="chip warn" data-ev="goto-connect">' + T('Your assistant is not connected yet') + '</button>'
  }
  const members = () => (co() ? co().employees : []).filter((x) => x.kind === 'employee' && x.status !== 'retired')
  function taskNew() {
    const pre = st.page.pre || {}
    const sel = st.page.who !== undefined ? st.page.who : pre.assignee || ''
    const who = (v, label, avatar) => '<label class="pick"><input type="radio" name="who" value="' + esc(v) + '"' + (sel === v ? ' checked' : '') + '>' + avatar + '<span dir="auto">' + label + '</span></label>'
    // the most likely people first: the pre-chosen one, then by office
    const people = members().slice().sort((a, b) => (b.id === sel) - (a.id === sel) || String(a.homeOfficeId).localeCompare(String(b.homeOfficeId)) || nameOf(a.id).localeCompare(nameOf(b.id)))
    let html = head(T('New task'), T('Say what you need, as you would to a colleague.'), '<button type="button" class="b ghost" data-ev="page-close">' + T('Cancel') + '</button><button type="submit" form="tnew" class="b pri">' + ic('send', 15) + T('Give this task') + '</button>', '<button type="button" data-ev="page-close">' + T('Tasks') + '</button> ' + ic('chev', 12) + ' ' + T('New task'))
    html += '<form id="tnew" data-evform="task-new"><div class="two"><div class="card pad" style="padding:22px">'
    html += '<label class="fl">' + T('What do you need?') + '<input type="text" name="title" maxlength="200" required dir="auto" style="font-size:17px;padding:12px" value="' + esc(pre.title || '') + '"></label>'
    html += '<label class="fl">' + T('Anything they should know?') + ' <span class="op">' + T('Optional') + '</span><textarea name="description" maxlength="8000" dir="auto" style="min-height:120px">' + esc(pre.description || '') + '</textarea></label>'
    html += '<details' + (pre.links ? ' open' : '') + '><summary>' + ic('link', 13) + ' ' + T('Add web links or file paths') + '</summary><div style="margin-top:10px"><label class="fl">' + T('Web links, one per line') + '<textarea name="urls" style="min-height:44px" dir="ltr" placeholder="https://"></textarea></label><label class="fl">' + T('File paths, one per line') + '<textarea name="paths" style="min-height:44px" dir="ltr"></textarea><span class="hint" style="font-weight:400">' + T('Shown as text with "Copy path". Arsenale never opens a file.') + '</span></label></div></details>'
    const samples = samplesOf()
    if (samples.length) html += '<p class="mut" style="font-size:12.5px;margin-top:14px">' + T('Quick ideas:') + '</p><div class="rw" style="gap:8px;margin-top:6px;flex-wrap:wrap">' + samples.slice(0, 4).map((s, i) => '<button type="button" class="chip" data-ev="task-sample" data-arg="' + i + '" dir="auto">' + esc(s.title.length > 42 ? s.title.slice(0, 40) + '…' : s.title) + '</button>').join('') + '</div>'
    html += msgHtml() + '</div><div style="display:flex;flex-direction:column;gap:18px">'
    html += '<div class="card pad"><div class="hi" style="font-weight:600;font-size:13px;margin-bottom:10px">' + T('Who should do it?') + '</div><div style="max-height:300px;overflow:auto;padding:0 10px;margin:0 -10px">' + who('', T('Let my assistant choose'), A.robot(26)) +
      people.map((e) => who(e.id, esc(nameLine(e.id)), face(e.id, 26))).join('') + offices().map((o) => who('office:' + o.id, T('Anyone in ') + esc(officeName(o.id)), '<span class="sw" style="width:22px;height:22px;border-radius:5px;background:' + esc(o.color || '#56B6C2') + '"></span>')).join('') + who('board', T('Me'), A.owner(26)) + '</div></div>'
    html += '<div class="card pad"><label class="fl">' + T('When is it due?') + ' <span class="op">' + T('Optional') + '</span><input type="date" name="dueDate"><span class="hint" style="font-weight:400">' + T('A date in the past is allowed and shown in red.') + '</span></label><label class="rw" style="margin:0;cursor:pointer"><span class="sp"><b class="hi" style="font-size:14px;display:block">' + T('Ask me before it is finished') + '</b><span class="mut" style="font-size:12.5px">' + T('You see the result first') + '</span></span><input type="checkbox" class="tgl" name="needsSignOff"' + (pre.needsSignOff ? ' checked' : '') + '></label></div>'
    html += '<p class="note">' + ic('info', 14) + T('The task goes into your assistant\'s inbox. It is picked up the next time your assistant checks, usually when you open a chat.') + '</p></div></div></form>'
    return html
  }
  function linksOf(f) {
    const urls = String(f.urls.value || '').split('\n').map((s) => s.trim()).filter(Boolean).map((url) => ({ url }))
    const paths = String(f.paths.value || '').split('\n').map((s) => s.trim()).filter(Boolean).map((p) => ({ path: p }))
    return urls.concat(paths)
  }
  function answerButtons(g, size) {
    const k = (v) => 'ap|' + g.id + '|' + v
    const lg = size === 'lg' ? ' big' : ''
    let b = ''
    if (g.approvalType === 'hire') {
      b += '<button type="button" class="b pri' + lg + armedCls(k('hire')) + '" data-ev="hire-yes" data-arg="' + esc(g.id) + '">' + ic('check', 16, 2.6) + esc(armedLabel(k('hire'), T('Hire as proposed'))) + '</button>'
      b += '<button type="button" class="b' + lg + '" data-ev="hire-edit" data-arg="' + esc(g.id) + '">' + ic('pencil', 15) + T('Edit and hire') + '</button>'
      b += '<button type="button" class="b bad' + lg + armedCls(k('decline')) + '" data-ev="hire-no" data-arg="' + esc(g.id) + '">' + ic('x', 15, 2.4) + esc(armedLabel(k('decline'), T('Decline'))) + '</button>'
    } else if (g.kind === 'approval') {
      const yes = g.approvalType === 'action' ? T(catOf(g)[4]) : T('Yes, go ahead')
      b += '<button type="button" class="b pri' + lg + armedCls(k('approve')) + '" data-ev="ans" data-arg="' + esc(g.id) + '" data-val="approve">' + ic('check', 16, 2.6) + esc(armedLabel(k('approve'), yes)) + '</button>'
      b += '<button type="button" class="b bad' + lg + armedCls(k('decline')) + '" data-ev="ans" data-arg="' + esc(g.id) + '" data-val="decline">' + ic('x', 15, 2.4) + esc(armedLabel(k('decline'), T('Decline'))) + '</button>'
    } else if (Array.isArray(g.choices) && g.choices.length) {
      b += g.choices.map((c, i) => '<button type="button" class="b' + (i ? '' : ' pri') + lg + armedCls(k(c)) + '" data-ev="ans" data-arg="' + esc(g.id) + '" data-val="' + esc(c) + '" dir="auto">' + esc(armedLabel(k(c), c)) + '</button>').join('')
    }
    return b
  }
  /** The reply box: a free answer, or "ask them to change something". */
  function replyForm(g, label) {
    return '<form data-evform="ans" data-id="' + esc(g.id) + '" data-note="' + (g.kind === 'approval' ? '1' : '') + '" class="rw" style="gap:8px;flex:1;min-width:260px"><input type="text" name="a" maxlength="300" dir="auto" aria-label="' + esc(label) + '" placeholder="' + esc(label) + '"><button type="submit" class="b">' + ic('send', 15) + T('Send') + '</button></form>'
  }
  function taskPage() {
    const t = st.data.task
    if (!t || t.id !== st.page.id) { load('task', 'api/task?id=' + encodeURIComponent(st.page.id), true); return '<p class="empty">' + T('Loading…') + '</p>' }
    load('dlv', 'api/deliverables', false, 10000)
    const crumb = '<button type="button" data-ev="page-close">' + T('Tasks') + '</button> ' + ic('chev', 12) + ' <span dir="auto">' + esc(t.title.length > 70 ? t.title.slice(0, 68) + '…' : t.title) + '</span>'
    const act = canWrite() ? '<button type="button" class="b" data-ev="task-edit">' + ic('pencil', 15) + T('Edit') + '</button>' + (t.status !== 'done' ? '<button type="button" class="b" data-ev="task-done" data-arg="' + esc(t.id) + '">' + ic('check', 15) + T('Mark as done') + '</button>' : '<button type="button" class="b" data-ev="task-reopen" data-arg="' + esc(t.id) + '">' + T('Open again') + '</button>') : ''
    let html = '<div class="crumb">' + crumb + '</div><div class="eh"><div><h1 dir="auto">' + esc(t.title) + '</h1><p class="sub"><span class="chip">' + T(STATE[t.status] || t.status) + '</span>' + (t.needsSignOff ? ' <span class="chip warn">' + T('needs your check') + '</span>' : '') + '</p></div><div class="ea">' + act + '</div></div>'
    html += '<div class="two" style="grid-template-columns:1fr 340px"><div style="display:flex;flex-direction:column;gap:18px;min-width:0">'
    if (st.editTask && canWrite()) html += taskEditForm(t)
    const g = waiting().find((x) => x.taskId === t.id)
    if (g) {
      const who = askerOf(g)
      html += '<div class="card pad wbox"><div class="rw" style="align-items:flex-start;gap:14px">' + face(who, 44) + '<div style="flex:1;min-width:0"><div class="lbl" style="color:#F2C06B">' + esc(nameOf(who)) + ' ' + T('is waiting for you') + '</div><div class="hi" dir="auto" style="font-size:17px;font-weight:600;margin-top:4px">' + esc(plainQ(g)) + '</div>' + (g.approvalType === 'action' && g.action.target ? '<p class="soft" dir="auto" style="font-size:13.5px;margin-top:4px">' + T('Where: ') + esc(g.action.target) + '</p>' : '') +
        (canWrite() ? '<div class="rw" style="margin-top:14px;gap:10px;flex-wrap:wrap">' + answerButtons(g) + (g.approvalType !== 'hire' ? replyForm(g, g.kind === 'approval' ? T('Reply with a note') : T('Your answer')) : '') + '<span class="sp"></span>' + riskHtml(g) + '</div>' : '') + (st.err['ap|' + g.id] ? '<p class="msg err">' + esc(errTxt(st.err['ap|' + g.id])) + '</p>' : '') + '</div></div></div>'
    }
    if (t.description) html += '<div class="card pad"><div class="sec">' + T('What you asked for') + '</div><pre class="txt">' + esc(t.description) + '</pre></div>'
    // what happened: the jobs' steps, the questions and the comments, newest first
    const jobs = (t.runIds || []).map((id) => (DATA.runs || []).concat(DATA.active || []).find((r) => r.id === id)).filter(Boolean)
    const ev = []
    for (const r of jobs) {
      ev.push({ at: r.startedAt, k: 'ok', text: nameOf(r.agent) + ' ' + T('started: ') + r.task })
      for (const s of (r.steps || []).slice(-6)) ev.push({ at: s.at, k: 'ok', text: s.text })
      if (r.finishedAt) ev.push({ at: r.finishedAt, k: 'ok', text: r.summary || T('Finished') })
    }
    for (const x of gates().filter((x) => x.taskId === t.id)) {
      ev.push({ at: x.askedAt, k: 'q', text: nameOf(askerOf(x)) + ' ' + T('asked you: ') + plainQ(x) })
      if (x.status === 'answered') ev.push({ at: x.answeredAt, k: 'ok', text: T('You answered: ') + x.answer })
    }
    ev.push({ at: t.createdAt, k: 'ok', text: t.createdBy === 'board' ? T('You wrote this task') : T('Your assistant wrote this task') })
    ev.sort((a, b) => String(b.at).localeCompare(String(a.at)))
    html += '<div class="card pad"><div class="sec">' + T('What happened') + ' <small>' + T('newest first') + '</small></div>' + ev.slice(0, 14).map((x) => '<div class="tl"><time>' + esc(isToday(x.at) ? hm(x.at) : day(x.at)) + '</time><span style="color:' + (x.k === 'q' ? 'var(--warn)' : 'var(--accent)') + '">' + ic(x.k === 'q' ? 'bell' : 'check', 16, 2.2) + '</span><span class="' + (x.k === 'q' ? 'hi' : 'soft') + '" dir="auto">' + esc(x.text) + '</span></div>').join('') + '</div>'
    html += '<div class="card pad"><div class="sec">' + T('Comments') + ' <small>' + fa(t.comments.length) + '</small></div>'
    if (!t.comments.length) html += '<p class="mut" style="font-size:13px;margin-bottom:12px">' + T('No comments yet.') + '</p>'
    for (const c of t.comments) {
      const by = c.by === 'board' ? 'board' : c.by === 'supervisor' ? 'supervisor' : String(c.by).replace(/^agent:/, '')
      html += '<div class="cm">' + face(by, 32) + '<div class="cb"><div class="rw" style="justify-content:space-between"><b class="hi" style="font-size:13.5px">' + esc(nameOf(by)) + '</b><span class="mut" style="font-size:12px">' + esc(day(c.at)) + '</span></div><div class="soft" dir="auto" style="font-size:14px;margin-top:2px;white-space:pre-wrap">' + esc(c.text) + '</div></div></div>'
    }
    if (canWrite()) html += '<form data-evform="task-comment" data-id="' + esc(t.id) + '" class="rw" style="gap:10px">' + A.owner(32) + '<textarea name="text" maxlength="4000" dir="auto" aria-label="' + T('Your comment') + '" placeholder="' + esc(T('Write a comment for ') + forWhom(t) + '…') + '" style="min-height:44px;flex:1"></textarea><button type="submit" class="b" aria-label="' + T('Add comment') + '">' + ic('send', 15) + '</button></form>'
    html += msgHtml() + '</div></div><div style="display:flex;flex-direction:column;gap:18px">'
    const spent = jobs.reduce((n, r) => n + (r.durMs || 0), 0)
    html += '<div class="card pad facts"><div><span class="mut">' + T('Assigned to') + '</span><span class="rw" style="gap:8px">' + face(whoId(t), 24) + '<b class="hi">' + esc(t.assigneeAgentId ? nameLine(t.assigneeAgentId) : forWhom(t)) + '</b></span></div>' +
      (t.assigneeAgentId || t.assigneeOfficeId ? '<div><span class="mut">' + T('Office') + '</span><span class="rw" style="gap:8px"><span class="sw" style="background:' + esc(colorOf(t.assigneeOfficeId || (emp(t.assigneeAgentId) || {}).homeOfficeId)) + '"></span><span class="hi">' + esc(officeName(t.assigneeOfficeId || (emp(t.assigneeAgentId) || {}).homeOfficeId)) + '</span></span></div>' : '') +
      '<div><span class="mut">' + T('Due') + '</span><b class="hi">' + (t.dueDate ? esc(dueLabel(t.dueDate)) + (t.dueDate < today() && t.status !== 'done' ? ' <span class="chip bad">' + T('This date has passed') + '</span>' : '') : '—') + '</b></div>' +
      '<div><span class="mut">' + T('Time spent') + '</span><b class="hi">' + (spent ? esc(dur(spent)) : '—') + '</b></div>' +
      '<div><span class="mut">' + T('Created') + '</span><span class="hi">' + (t.createdBy === 'board' ? T('by you, ') : T('by your assistant, ')) + esc(day(t.createdAt)) + '</span></div></div>'
    if (canWrite()) html += '<button type="button" class="b" data-ev="task-copy" data-arg="' + esc(t.id) + '">' + ic('copy', 15) + T('Copy a message for your assistant') + '</button>'
    const dls = ((st.data.dlv && st.data.dlv.deliverables) || []).filter((d) => d.taskId === t.id)
    html += '<div class="card pad"><div class="sec">' + T('Finished work') + ' <small>' + fa(dls.length) + '</small></div>' + (dls.length ? dls.map((d) => '<button type="button" class="rw" data-ev="dlv-open" data-arg="' + esc(d.id) + '" style="padding:8px 0;gap:12px;background:none;border:0;width:100%;cursor:pointer;text-align:start;font:inherit"><span style="width:56px;height:36px;border-radius:5px;overflow:hidden;border:1px solid var(--line);flex:none">' + A.thumb(kindArt(d), colorOfMember(d.agent)) + '</span><span style="flex:1;min-width:0"><span class="hi ell" dir="auto" style="font-size:13.5px;font-weight:600;display:block">' + esc(d.title) + '</span><span class="mut" style="font-size:12px">' + esc(extOf(d)) + (d.bytes ? ', ' + sizeOf(d.bytes) : '') + '</span></span></button>').join('') : '<p class="mut" style="font-size:13px">' + T('Nothing handed in yet.') + '</p>') + '</div>'
    if ((t.links || []).length) {
      html += '<div class="card pad"><div class="sec">' + T('Links') + '</div>'
      for (const l of t.links) html += l.url ? '<p style="margin:4px 0"><a href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer" dir="ltr" style="color:var(--cyan)">' + esc(l.title || l.url) + '</a></p>' : '<p class="rw" style="gap:8px;margin:4px 0">' + ltr(l.path) + '<button type="button" class="b sm" data-ev="copy" data-arg="' + esc(l.path) + '">' + T('Copy path') + '</button></p>'
      html += '</div>'
    }
    const tok = jobs.reduce((n, r) => n + (r.tokTotal || 0), 0)
    html += '<div class="card pad"><div class="sec" style="margin-bottom:6px">' + T('Details') + ' <small>' + T('for the curious') + '</small></div><p class="mut" style="font-size:12.5px;line-height:1.7">' + T('Task number: ') + ltr(t.id) + '<br>' + T('Jobs: ') + fa(jobs.length) + (tok ? ' · ' + T('Usage: ') + tokens(tok) + ' ' + T('tokens') : '') + (t.seenAt ? '<br>' + T('Seen by your assistant ') + esc(day(t.seenAt)) : '') + '</p></div>'
    return html + '</div></div>'
  }
  function taskEditForm(t) {
    const sel = t.assigneeUserId === 'board' ? 'board' : t.assigneeAgentId || (t.assigneeOfficeId ? 'office:' + t.assigneeOfficeId : '')
    const opts = ['<option value="">' + T('Let my assistant choose') + '</option>'].concat(members().map((e) => '<option value="' + esc(e.id) + '"' + (sel === e.id ? ' selected' : '') + '>' + esc(nameLine(e.id)) + '</option>'), offices().map((o) => '<option value="office:' + esc(o.id) + '"' + (sel === 'office:' + o.id ? ' selected' : '') + '>' + T('Anyone in ') + esc(officeName(o.id)) + '</option>'), ['<option value="board"' + (sel === 'board' ? ' selected' : '') + '>' + T('Me') + '</option>'])
    return '<form class="card pad" data-evform="task-edit" data-id="' + esc(t.id) + '"><label class="fl">' + T('What do you need?') + '<input type="text" name="title" maxlength="200" required dir="auto" value="' + esc(t.title) + '"></label><label class="fl">' + T('Anything they should know?') + '<textarea name="description" maxlength="8000" dir="auto">' + esc(t.description || '') + '</textarea></label>' +
      '<div class="rw" style="gap:12px;align-items:flex-start"><label class="fl" style="flex:1">' + T('Who should do it?') + '<select name="who">' + opts.join('') + '</select></label><label class="fl" style="flex:1">' + T('When is it due?') + '<input type="date" name="dueDate" value="' + esc(t.dueDate || '') + '"></label></div>' +
      '<div class="rw" style="gap:12px;flex-wrap:wrap"><label class="fl" style="margin:0">' + T('State') + '<select name="status" style="width:auto">' + ORDER.map((s) => '<option value="' + s + '"' + (t.status === s ? ' selected' : '') + '>' + T(STATE[s]) + '</option>').join('') + '</select></label><label class="rw" style="gap:8px;margin:18px 0 0;cursor:pointer"><input type="checkbox" class="tgl" name="needsSignOff"' + (t.needsSignOff ? ' checked' : '') + '><span class="soft">' + T('Ask me before it is finished') + '</span></label></div>' +
      '<div class="rw" style="gap:10px;margin-top:14px"><button type="submit" class="b pri">' + T('Save') + '</button><button type="button" class="b ghost" data-ev="task-edit">' + T('Cancel') + '</button></div></form>'
  }

  // ========== approvals
  function apprMain() {
    const wait = waiting()
    if (!wait.find((g) => g.id === st.apprSel)) st.apprSel = wait.length ? wait[0].id : ''
    const sub = wait.length ? fa(wait.length) + ' ' + T(wait.length === 1 ? 'thing your team would like your OK on.' : 'things your team would like your OK on.') + ' ' + T('Nothing happens until you answer.') : T('Nothing is waiting for you.')
    let html = head(T('Approvals'), sub)
    if (wait.length) {
      html += '<div class="appr"><div class="card" style="overflow:hidden">' + wait.map((g) => {
        const who = askerOf(g)
        const e = emp(who)
        return '<button type="button" class="ai" data-ev="appr-sel" data-arg="' + esc(g.id) + '" aria-current="' + (g.id === st.apprSel) + '">' + face(who, 34) + '<span style="min-width:0;flex:1"><span class="rw" style="justify-content:space-between;gap:8px"><b class="hi ell" style="font-size:13.5px">' + esc(nameOf(who)) + (e && e.name && titleOf(e) ? ' <span class="mut" style="font-weight:400">' + esc(titleOf(e)) + '</span>' : '') + '</b><span class="mut" style="font:12px var(--mono);flex:none">' + esc(isToday(g.askedAt) ? hm(g.askedAt) : day(g.askedAt)) + '</span></span><span class="soft" dir="auto" style="display:block;font-size:13.5px;line-height:1.35;margin-top:2px">' + esc(plainQ(g)) + '</span><span style="display:block;margin-top:6px">' + riskHtml(g) + '</span></span></button>'
      }).join('') + '</div>' + letter(wait.find((g) => g.id === st.apprSel)) + '</div>'
    }
    const done = gates().filter((g) => g.status !== 'waiting').sort((a, b) => String(b.answeredAt || b.expiredAt || '').localeCompare(String(a.answeredAt || a.expiredAt || ''))).slice(0, 10)
    if (done.length) html += '<div class="sec" style="margin-top:28px">' + T('Answered lately') + '</div><div class="card" style="overflow:hidden">' + done.map((g) => '<div class="rw" style="padding:12px 16px;border-top:1px solid var(--line);align-items:flex-start">' + face(askerOf(g), 26) + '<div style="flex:1;min-width:0"><div class="soft" dir="auto" style="font-size:13.5px">' + esc(plainQ(g)) + '</div><div class="mut" style="font-size:12.5px;margin-top:2px">' + (g.status === 'answered' ? T('Answer: ') + '<span dir="auto">' + esc(g.answer) + '</span>' : T('Closed without an answer')) + ' · ' + esc(day(g.answeredAt || g.expiredAt)) + (g.history && g.history.some((x) => /^phone:/.test(x.via || '')) ? ' · ' + T('from your phone') : '') + '</div></div></div>').join('') + '</div>'
    return html
  }
  function letter(g) {
    if (!g) return ''
    const p = g.payload || {}
    const who = askerOf(g)
    const task = g.taskId && taskById(g.taskId)
    if (g.taskId && !task) load('tasks', 'api/tasks', false, 15000)
    let html = '<div class="card letter" id="ap-' + esc(g.id) + '"><div class="rw" style="gap:14px;align-items:flex-start">' + face(who, 52) + '<div style="min-width:0"><b class="hi" style="font-size:15px">' + esc(nameLine(who)) + '</b><div class="mut" style="font-size:13px">' + T('asked at ') + esc(isToday(g.askedAt) ? hm(g.askedAt) : when(g.askedAt)) + (task ? ' · ' + T('task: ') + '<span dir="auto">' + esc(task.title) + '</span>' : '') + (g.officeId && officeById(g.officeId) && !officeById(g.officeId).builtIn ? ' · ' + esc(officeName(g.officeId)) : '') + '</div></div><span class="sp"></span>' + riskHtml(g, true) + '</div>'
    html += '<h2 dir="auto" style="font-size:25px;margin-top:20px">' + esc(plainQ(g)) + '</h2>'
    if (g.approvalType === 'action' && g.action) {
      // the preview never repeats the question: a long summary is shown here, a short one is the question above
      html += '<div class="prev"><div class="lbl" style="margin-bottom:8px">' + T(catOf(g)[3]) + '</div>' + (longSum(g) ? '<div class="body" dir="auto">' + esc(g.action.summary) + '</div>' + (g.action.target ? '<p class="mut" dir="auto" style="font-size:12.5px;margin-top:8px">' + T('Where: ') + esc(g.action.target) + '</p>' : '') : '<div class="body" dir="auto">' + (g.action.target ? T('Where: ') + esc(g.action.target) : esc(g.action.summary)) + '</div>') + '<p class="mut" style="font-size:12.5px;margin-top:8px">' + T('Who does it: ') + esc(nameLine(who)) + '</p></div>'
      html += whyNo(T(catOf(g)[5]), T(catOf(g)[6]).replace('{name}', nameOf(who)))
    } else if (g.approvalType === 'hire') {
      html += '<div class="prev"><div class="lbl" style="margin-bottom:8px">' + T('Who would join') + '</div><div class="rw" style="gap:12px;margin-bottom:10px">' + A.person(p.id || 'new', colorOf(p.officeId), 36, true) + '<div><b class="hi" dir="auto">' + esc(p.name || p.id) + '</b><div class="mut" style="font-size:13px" dir="auto">' + esc(p.title || '') + ' · ' + esc(officeName(p.officeId)) + '</div></div></div><p class="soft" dir="auto" style="font-size:14px">' + esc(p.description || '') + '</p><details style="margin-top:10px"><summary>' + T('Their instructions, in full') + '</summary><pre class="txt" style="margin-top:8px">' + esc(p.instructions || '') + '</pre></details></div>'
      html += whyNo(p.why ? esc(p.why) : T('Your assistant thinks a role is missing.'), T('No one is added. Your assistant is told.'), true)
    } else if (Array.isArray(g.choices) && g.choices.length && g.kind !== 'approval') {
      html += whyNo(T('Your team waits for your pick before it goes on.'), T('You can close it without an answer. Your assistant is told and decides itself, or asks again.'))
    } else {
      html += whyNo(T('Your assistant waits for your answer before it goes on.'), T('Nothing happens. Your assistant is told.'))
    }
    if (canWrite()) {
      const name = nameOf(who)
      html += '<div class="rw" style="margin-top:22px;gap:12px;flex-wrap:wrap">' + answerButtons(g, 'lg')
      if (g.approvalType !== 'hire' && (g.kind === 'approval' || !(g.choices || []).length)) html += st.note === g.id || !(g.kind === 'approval') ? replyForm(g, g.kind === 'approval' ? T('What should change?') : T('Your answer')) : '<button type="button" class="b ghost big" data-ev="appr-note" data-arg="' + esc(g.id) + '">' + ic('comment', 16) + esc(T('Ask ') + name + T(' to change something')) + '</button>'
      html += '</div><div class="rw" style="margin-top:12px"><button type="button" class="b ghost sm' + armedCls('ap|' + g.id + '|dis') + '" data-ev="dis" data-arg="' + esc(g.id) + '">' + esc(armedLabel('ap|' + g.id + '|dis', T('Close without answering'))) + '</button><span class="mut" style="font-size:12.5px">' + T('An answer here reaches your assistant the next time it checks.') + '</span></div>'
      if (st.err['ap|' + g.id]) html += '<p class="msg err">' + esc(errTxt(st.err['ap|' + g.id])) + '</p>'
    }
    return html + '</div>'
  }
  const whyNo = (why, no, escaped) => '<div class="whyno"><div><div class="lbl">' + T('Why it matters') + '</div><p class="t" dir="auto">' + (escaped ? why : esc(why)) + '</p></div><div><div class="lbl">' + T('If you say no') + '</div><p class="t" dir="auto">' + esc(no) + '</p></div></div>'

  // ========== team: an office room per office, the profile and the hire form at its side
  const TIER = { light: 'Light', standard: 'Standard', heavy: 'Strong' }
  const VAL = { ask: 'Always ask me', never: 'Never', allow: 'Allowed' }
  function statusOf(id) {
    const e = emp(id)
    if (e && e.status === 'paused') return 'paused'
    if (waiting().some((g) => askerOf(g) === id)) return 'waiting'
    if ((DATA.active || []).some((r) => r.agent === id)) return 'working'
    if ((DATA.runs || []).some((r) => r.agent === id && isToday(r.finishedAt))) return 'done'
    return 'idle'
  }
  const STATUS_WORD = { working: 'Working', waiting: 'Waiting for you', idle: 'Free', done: 'Finished today', paused: 'Paused' }
  function teamMembers(officeId) {
    const d = st.data.team
    const list = d ? d.members.filter((m) => m.kind !== 'ceo' && m.status !== 'retired') : []
    return list.filter((m) => (m.homeOfficeId || 'unassigned') === officeId)
  }
  function teamMain() {
    if (!LIVE) return liveOnly()
    if (!co()) return head(T('Team')) + '<p class="empty">' + T('No team members yet. Install an office pack or hire someone.') + '</p><p><button type="button" class="b pri" data-ev="wiz-open">' + T('Set up your company') + '</button></p>'
    load('team', 'api/team')
    const d = st.data.team
    if (!d) return '<p class="empty" style="padding:24px">' + T('Loading…') + '</p>'
    const offs = offices().concat(d.members.some((m) => m.kind !== 'ceo' && m.status !== 'retired' && !officeById(m.homeOfficeId || '')) ? [{ id: 'unassigned' }] : [])
    if (!offs.some((o) => o.id === st.teamOffice)) st.teamOffice = (offs.find((o) => teamMembers(o.id).length) || offs[0] || { id: '' }).id
    const here = teamMembers(st.teamOffice)
    // the busiest first at the desks: someone waiting for the owner, then working
    const rank = { waiting: 0, working: 1, done: 2, idle: 3, paused: 4 }
    const seated = here.slice().sort((a, b) => rank[statusOf(a.id)] - rank[statusOf(b.id)] || nameOf(a.id).localeCompare(nameOf(b.id))).slice(0, A.SEATS)
    const hot = st.drawer && st.drawer.type === 'member' ? st.drawer.id : ''
    const color = st.teamOffice === 'unassigned' ? '#8A97A6' : colorOf(st.teamOffice)
    const ghost = st.drawer && st.drawer.type === 'hire' && st.hire && st.hire.op !== 'edit' && seated.length < A.SEATS ? seated.length : undefined
    const svg = A.room(color, seated.map((m) => ({ id: esc(m.id), seed: seedOf(m.id), label: esc(nameOf(m.id).length > 18 ? nameOf(m.id).slice(0, 17) + '…' : nameOf(m.id)), status: statusOf(m.id), hot: m.id === hot })), { ghost, ghostLabel: esc(T('New desk')), sign: esc((st.teamOffice === 'unassigned' ? T('No office') : officeName(st.teamOffice)).toUpperCase()) })
    let html = '<svg class="scene" viewBox="0 0 900 640" preserveAspectRatio="xMidYMid meet" shape-rendering="crispEdges" role="img" aria-label="' + esc(T('The office room') + ': ' + (st.teamOffice === 'unassigned' ? T('No office') : officeName(st.teamOffice))) + '">' + svg + '</svg>'
    html += '<div class="float camp"><div class="lbl" style="margin-bottom:8px">' + T('Your campus') + '</div>' + offs.map((o) => {
      const list = teamMembers(o.id)
      return '<button type="button" data-ev="team-office" data-arg="' + esc(o.id) + '" aria-current="' + (o.id === st.teamOffice) + '"><span class="sw" style="background:' + esc(o.id === 'unassigned' ? '#8A97A6' : colorOf(o.id)) + '"></span><span class="sp ell">' + esc(o.id === 'unassigned' ? T('No office') : officeName(o.id)) + '</span><span class="mut" style="font:12px var(--mono)">' + fa(list.length) + '</span>' + (list.some((m) => statusOf(m.id) === 'waiting') ? '<i style="width:8px;height:8px;background:var(--warn);display:block" title="' + T('Waiting for you') + '"></i>' : '') + '</button>'
    }).join('') + (notSetUp() ? '<p class="mut" style="font-size:12.5px;padding:8px 8px 0;border-top:1px solid var(--line);margin-top:6px">' + esc(notSetUp()) + '</p>' : '') + '<div class="rw" style="gap:6px;border-top:1px solid var(--line);margin-top:6px;padding-top:8px;flex-wrap:wrap"><button type="button" class="b sm ghost" data-goto="org" style="padding:0 6px">' + T('Org chart') + '</button><button type="button" class="b sm ghost" data-ev="goto-packs" style="padding:0 6px">' + T('Add an office') + '</button></div></div>'
    html += '<div class="float roster"><span class="lbl" style="width:90px;flex:none">' + T('In this office') + '</span>' + (here.length ? here.map((m) => '<button type="button" class="m" data-ev="member-open" data-arg="' + esc(m.id) + '" aria-current="' + (m.id === hot) + '">' + face(m.id, 26) + '<span><b class="hi" style="font-size:13px;display:block">' + esc(nameOf(m.id)) + '</b><span class="mut" style="font-size:11.5px;line-height:1.1">' + esc(m.name && titleOf(m) && m.name !== titleOf(m) ? titleOf(m) : T(STATUS_WORD[statusOf(m.id)])) + '</span></span></button>').join('') : '<span class="mut">' + T('No one works here yet.') + '</span>') +
      (canWrite() && st.teamOffice !== 'unassigned' ? '<button type="button" class="b pri sm" data-ev="hire-new" style="margin-inline-start:auto;flex:none">' + ic('plus', 14, 2.4) + T('New desk') + '</button>' : '') + '</div>'
    const busy = d.members.filter((m) => ['working', 'waiting'].includes(statusOf(m.id))).slice(0, 4)
    html += '<div class="ticker" role="status">' + (busy.length ? busy.map((m) => { const s = statusOf(m.id); const r = (DATA.active || []).find((x) => x.agent === m.id); return '<span><i style="background:' + (s === 'waiting' ? '#E5A33D' : '#3BE8B0') + '"></i><b class="hi">' + esc(nameOf(m.id)) + '</b> ' + (s === 'waiting' ? T('is waiting for you') : r ? T('is working on: ') + '<span dir="auto">' + esc(r.doing || r.task) + '</span>' : T('is working')) + '</span>' }).join('') : '<span>' + T('Everyone is free right now.') + '</span>') + '</div>'
    return html
  }
  /** "Operations, Research, Design: not set up": the packs not installed yet. */
  function notSetUp() {
    load('packs', 'api/packs', false, 60000)
    const left = ((st.data.packs && st.data.packs.packs) || []).filter((p) => !p.installed)
    return left.length ? left.map((p) => (LANG === 'fa' && p.nameFa ? p.nameFa : p.name)).join(T(', ')) + T(': not set up') : ''
  }
  function monthRuns(id) {
    const d0 = new Date(); d0.setDate(1); d0.setHours(0, 0, 0, 0)
    return runsOf((r) => r.agent === id && Date.parse(r.finishedAt) >= d0.getTime())
  }
  function profile() {
    const d = st.data.team
    const m = d && d.members.find((x) => x.id === st.drawer.id)
    if (!m) return '<div class="pb"><p class="empty">' + T('Loading…') + '</p>' + msgHtml() + '</div>'
    const s = statusOf(m.id)
    const runs = monthRuns(m.id)
    const ms = runs.reduce((n, r) => n + (r.durMs || 0), 0), tok = runs.reduce((n, r) => n + (r.tokTotal || 0), 0)
    const r = (DATA.active || []).find((x) => x.agent === m.id)
    const g = waiting().find((x) => askerOf(x) === m.id)
    let html = '<div class="ph">' + face(m.id, 54, true) + '<div style="min-width:0"><h2 dir="auto">' + esc(nameOf(m.id)) + '</h2><div class="mut" style="font-size:13px;margin-top:2px">' + esc(m.name && titleOf(m) && m.name !== titleOf(m) ? titleOf(m) + ' · ' : '') + esc(officeName(m.homeOfficeId)) + '</div></div><button type="button" class="x" data-ev="drawer-close" aria-label="' + T('Close') + '">' + ic('x', 18) + '</button></div><div class="pb">'
    html += '<div class="rw"><span class="pill ' + s + '">' + T(STATUS_WORD[s]) + '</span>' + (m.reportsTo ? '<span class="mut" style="font-size:13px">' + T('Reports to ') + esc(nameOf(m.reportsTo)) + '</span>' : '') + '</div>'
    if (g) html += '<div class="stat now w"><div class="lbl" style="color:#F2C06B">' + T('Waiting for you') + '</div><div class="hi" dir="auto" style="font-size:15px;font-weight:600;margin-top:2px">' + esc(plainQ(g)) + '</div><button type="button" class="b sm" data-ev="goto-appr" data-arg="' + esc(g.id) + '" style="margin-top:8px">' + T('Answer') + '</button></div>'
    else if (r) html += '<div class="stat now"><div class="lbl" style="color:var(--accent)">' + T('Right now') + '</div><div class="hi" dir="auto" style="font-size:16px;font-weight:600;margin-top:2px">' + esc(r.doing || r.task) + '</div><div class="soft" style="font-size:13px">' + T('Started ') + esc(ago(r.startedAt)) + '</div></div>'
    const cost = co().company.payModel === 'plan' ? T('Included in your plan') : runs.some((x) => typeof x.costUsd === 'number') ? '$' + fa(runs.reduce((n, x) => n + (x.costUsd || 0), 0).toFixed(2)) : T('not counted')
    html += '<div class="rw" style="gap:12px;align-items:stretch"><div class="stat"><div class="lbl">' + T('This month') + '</div><div class="hi" style="font-size:24px;font-weight:700">' + (ms ? esc(dur(ms)) : '—') + '</div><div class="mut" style="font-size:12.5px">' + fa(runs.length) + ' ' + T(runs.length === 1 ? 'job finished' : 'jobs finished') + '</div></div><div class="stat"><div class="lbl">' + T('Details') + '</div><div class="mut" style="font-size:12.5px;line-height:1.6;margin-top:4px">' + tokens(tok) + ' ' + T('tokens') + '<br>' + T('Cost: ') + esc(cost) + '<br>' + T('Role file: ') + ltr(m.id) + (m.tier ? '<br>' + T('Strength: ') + T(TIER[m.tier]) : '') + '</div></div></div>'
    const def = (DATA.agents || []).find((x) => x.name === m.id) || {}
    const what = String(LANG === 'fa' ? def.descriptionFa || '' : def.descriptionEn || def.description || '').replace(/^"|"$/g, '')
    if ((m.skills || []).length) html += '<div><div class="sec" style="margin-bottom:8px">' + T('Good at') + '</div><div class="rw" style="flex-wrap:wrap;gap:6px">' + m.skills.map((x) => '<span class="chip" dir="auto" style="height:28px;font-size:13px">' + esc(x) + '</span>').join('') + '</div></div>'
    else if (what) html += '<div><div class="sec" style="margin-bottom:6px">' + T('What they do') + '</div><p class="soft" dir="auto" style="font-size:13.5px;line-height:1.55">' + esc(what) + '</p></div>'
    const asks = d.categories.filter((c) => m.policy[c.id] && m.policy[c.id].value === 'ask'), never = d.categories.filter((c) => m.policy[c.id] && m.policy[c.id].value === 'never')
    html += '<div><div class="sec" style="margin-bottom:8px">' + T('Asks you first before') + ' ' + ic('lock', 14) + '</div><div class="rw" style="flex-wrap:wrap;gap:6px">' + (asks.length ? asks.map((c) => '<span class="risk">' + ic('out', 11) + ' ' + esc(T(CAT[c.id] ? CAT[c.id][0] : c.label)) + '</span>').join('') : '<span class="mut" style="font-size:13px">' + T('Nothing: every action is allowed or never done.') + '</span>') + '</div>' + (never.length ? '<p class="mut" style="font-size:12.5px;margin-top:8px">' + T('Never does: ') + never.map((c) => esc(T(CAT[c.id] ? CAT[c.id][0] : c.label))).join(T(', ')) + '</p>' : '') + '</div>'
    const recent = runsOf((x) => x.agent === m.id).slice(0, 5)
    html += '<div><div class="sec" style="margin-bottom:8px">' + T('Recent jobs') + '</div>' + (r ? '<div class="jr"><span style="color:var(--warn)">' + ic('clock', 15, 2.2) + '</span><span class="hi sp" dir="auto">' + esc(r.task) + '</span><b class="hi" style="font:12.5px var(--mono)">' + esc(dur(Date.now() - Date.parse(r.startedAt))) + '</b></div>' : '') + (recent.length ? recent.map((x) => '<div class="jr"><span style="color:' + (x.status === 'failed' ? 'var(--bad)' : 'var(--accent)') + '">' + ic(x.status === 'failed' ? 'x' : 'check', 15, 2.2) + '</span><span class="hi sp" dir="auto">' + esc(x.summary && x.summary.length < 90 ? x.summary : x.task) + '</span><b class="hi" style="font:12.5px var(--mono)">' + esc(dur(x.durMs)) + '</b></div>').join('') : r ? '' : '<p class="mut" style="font-size:13px">' + T('No jobs yet.') + '</p>') + '</div>'
    // the rules of this one member, and the file behind them: the detail a curious owner opens
    html += '<details' + (st.profOpen === 'rules' ? ' open' : '') + ' data-ev-toggle="rules"><summary>' + T('Safety rules for this member') + '</summary><div style="margin-top:10px">' + policyTable(d.categories, m.policy, m.id) + '</div></details>'
    html += '<details' + (st.profOpen === 'instr' ? ' open' : '') + ' data-ev-toggle="instr"><summary>' + T('Instructions and earlier versions') + '</summary><div style="margin-top:10px">' + instrPart(m) + '</div></details>'
    html += msgHtml() + '</div>'
    if (canWrite()) {
      html += '<div class="pf"><button type="button" class="b pri" data-ev="task-for" data-arg="' + esc(m.id) + '">' + ic('plus', 15, 2.4) + esc(T('Give ') + nameOf(m.id) + T(' a task')) + '</button><button type="button" class="b" data-ev="member-edit" data-arg="' + esc(m.id) + '">' + ic('pencil', 14) + T('Edit') + '</button><span class="sp"></span>'
      if (m.managedFile && m.status !== 'retired') html += '<button type="button" class="b bad sm' + armedCls('retire|' + m.id) + '" data-ev="retire" data-arg="' + esc(m.id) + '">' + esc(armedLabel('retire|' + m.id, T('Retire'))) + '</button>'
      if (m.status === 'retired') html += '<button type="button" class="b sm" data-ev="unretire" data-arg="' + esc(m.id) + '">' + T('Bring back') + '</button>'
      html += '</div>'
    }
    return html
  }
  function instrPart(m) {
    const mm = st.data.member
    if (!mm || mm.id !== m.id) { load('member', 'api/member?id=' + encodeURIComponent(m.id), true); return '<p class="empty">' + T('Loading…') + '</p>' }
    let html = ''
    if (!mm.managed && mm.exists) html += '<p class="note">' + T('This file belongs to another tool (for example Claude Code). Editing it keeps a backup.') + '</p>'
    html += '<pre class="txt">' + esc(mm.body) + '</pre>'
    if (!mm.backups.length) html += '<p class="hint">' + T('No earlier versions yet. Every edit keeps the version before it.') + '</p>'
    for (const b of mm.backups) html += '<p class="rw" style="gap:8px;margin:6px 0">' + ltr(b) + (canWrite() && !/^retired-/.test(b) && mm.managed ? ' <button type="button" class="b sm' + armedCls('restore|' + b) + '" data-ev="restore" data-arg="' + esc(m.id) + '|' + esc(b) + '">' + esc(armedLabel('restore|' + b, T('Restore'))) + '</button>' : '') + '</p>'
    return html
  }
  function policyTable(cats, eff, member) {
    const pol = st.data.policy && st.data.policy.policy
    let html = '<div class="card rows" style="overflow:hidden">'
    for (const c of cats) {
      const v = eff[c.id] ? eff[c.id].value : 'ask'
      const words = CAT[c.id] || [c.label, 'Leaves your computer']
      const seg = ['ask', 'never', 'allow'].map((x) => '<button type="button" class="' + x + '" data-ev="pol" data-arg="' + esc((member || '') + '|' + c.id + '|' + x) + '" aria-pressed="' + (v === x) + '"' + (canWrite() ? '' : ' disabled') + '>' + T(VAL[x]) + '</button>').join('')
      const from = !member ? '' : eff[c.id] && eff[c.id].from === 'member' ? ' <span class="chip warn">' + T('changed for this member') + '</span>' + (canWrite() ? ' <button type="button" class="b sm ghost" data-ev="pol" data-arg="' + esc(member + '|' + c.id + '|') + '">' + T('Reset') + '</button>' : '') : ''
      html += '<div class="r" style="flex-wrap:wrap">' + (member ? '' : '<span class="risk' + (c.id === 'delete' ? ' mid' : '') + '" style="width:130px;justify-content:center">' + ic(c.id === 'delete' ? 'warn' : 'out', 12) + ' ' + T(c.id === 'delete' ? 'Careful' : 'Leaves') + '</span>') + '<span class="sp" style="min-width:150px"><span class="hi" style="font-size:' + (member ? 13.5 : 14.5) + 'px">' + T(words[0]) + '</span>' + (c.examples && !member ? '<span class="hint">' + T(c.examples) + '</span>' : '') + from + '</span><span class="seg">' + seg + '</span>'
      if (!member) html += c.id === 'payment' ? '<span class="chip" style="width:150px;justify-content:center">' + T('Computer only') + '</span>' : '<label class="rw" style="gap:8px;width:150px;margin:0;cursor:pointer"><input type="checkbox" class="tgl" data-ev-change="phone" data-arg="' + esc(c.id) + '"' + (pol && pol.phoneAllowed[c.id] ? ' checked' : '') + (canWrite() ? '' : ' disabled') + '><span class="soft" style="font-size:12.5px">' + T('From my phone too') + '</span></label>'
      html += '</div>'
    }
    return html + '</div><p class="note" style="margin-top:8px">' + ic('info', 13) + T('Arsenale asks and records. It cannot stop another program from acting, so keep sensitive accounts signed out of your assistant.') + '</p>'
  }
  const TEMPLATES = [
    ['Weekly newsletter', 'Newsletter writer', 'Writes our weekly newsletter from the notes I leave in the workspace folder. Short, friendly, three sections. Never sends it: it saves the draft and tells me.', 'Newsletters,Short summaries'],
    ['Customer replies', 'Reply drafter', 'Drafts replies to the customer messages I paste in, in our calm and friendly tone. Never sends them.', 'Friendly replies,Customer questions'],
    ['Meeting notes', 'Note taker', 'Turns my rough meeting notes into tidy minutes with a to-do list and who does what, by role.', 'Minutes,To-do lists'],
  ]
  function hireForm() {
    const f = st.hire
    const office = f.officeId && officeName(f.officeId)
    const v = (k) => esc(f[k] === undefined ? '' : f[k])
    const name = f.name || T('they')
    let html = '<div class="ph"><div style="min-width:0"><h2>' + (f.op === 'edit' ? esc(T('Edit ') + (f.name || f.id)) : esc(T('New desk in ') + (office || ''))) + '</h2><div class="mut" style="font-size:13px;margin-top:2px">' + T('Describe the job in plain words') + '</div></div><button type="button" class="x" data-ev="drawer-close" aria-label="' + T('Close') + '">' + ic('x', 18) + '</button></div>'
    html += '<form data-evform="hire" class="pb" id="hform">'
    if (f.preview) {
      html += '<p class="soft">' + T('This is the file Arsenale will write. Nothing is saved until you press the button.') + '</p><pre>' + esc(f.preview) + '</pre>'
    } else {
      if (f.op !== 'edit') html += '<div class="rw" style="flex-wrap:wrap;gap:6px"><button type="button" class="chip" data-ev="hire-tpl" data-arg="-1" aria-pressed="' + (f.tpl === undefined || f.tpl < 0) + '">' + T('Write my own') + '</button>' + TEMPLATES.map((x, i) => '<button type="button" class="chip" data-ev="hire-tpl" data-arg="' + i + '" aria-pressed="' + (f.tpl === i) + '">' + T(x[1]) + '</button>').join('') + '</div>'
      const err = f.err || {}
      html += '<div class="rw" style="gap:12px;align-items:flex-start"><label class="fl" style="flex:1;margin:0">' + T('Name') + '<input type="text" name="name" maxlength="60" dir="auto" value="' + v('name') + '" placeholder="' + T('e.g. Ada') + '"></label><label class="fl" style="flex:1.4;margin:0">' + T('Job title') + '<input type="text" name="title" maxlength="60" dir="auto" value="' + v('title') + '"' + (err.title ? ' class="bad" aria-invalid="true"' : '') + ' placeholder="' + T('e.g. Press release writer') + '"></label></div>'
      if (err.title) html += '<p class="msg err" style="margin-top:-8px">' + ic('warn', 14) + ' ' + T('Please give a job title so the team list is easy to read.') + '</p>'
      html += '<label class="fl" style="margin:0">' + esc(T('What should ') + name + T(' do?')) + '<textarea name="instructions" maxlength="8000" dir="auto" style="min-height:110px"' + (err.instructions ? ' class="bad" aria-invalid="true"' : '') + '>' + v('instructions') + '</textarea></label>'
      if (err.instructions) html += '<p class="msg err" style="margin-top:-8px">' + ic('warn', 14) + ' ' + T('Describe the job in a few more words (at least 10 characters).') + '</p>'
      html += '<div><div class="hi" style="font-weight:600;font-size:13px;margin-bottom:6px">' + T('Good at') + '</div><div class="rw" style="gap:6px;flex-wrap:wrap">' + (f.skills || []).map((x, i) => '<button type="button" class="chip" data-ev="skill-del" data-arg="' + i + '" title="' + T('Remove') + '" dir="auto">' + esc(x) + ' ×</button>').join('') + ((f.skills || []).length < 8 ? '<input type="text" name="skill" maxlength="40" dir="auto" placeholder="' + T('+ Add') + '" style="width:150px;padding:4px 10px;border-style:dashed" data-ev-enter="skill-add">' : '') + '</div></div>'
      html += '<div><div class="hi" style="font-weight:600;font-size:13px;margin-bottom:6px">' + T('Pick a look') + '</div><div class="looks" role="radiogroup" aria-label="' + T('Pick a look') + '">' + [0, 1, 2, 3, 4, 5].map((i) => '<label><input type="radio" name="look" value="' + i + '"' + ((f.look || 0) === i ? ' checked' : '') + ' aria-label="' + T('Look ') + fa(i + 1) + '">' + A.person((f.id || slug(f.name) || 'new-member') + (i ? ':' + i : ''), colorOf(f.officeId), 30, true) + '</label>').join('') + '</div></div>'
      if (f.op !== 'edit') {
        const cats = (st.data.team && st.data.team.categories) || []
        const def = (st.data.team && st.data.team.policy && st.data.team.policy.defaults) || {}
        html += '<div class="card pad" style="background:var(--panel-raised)"><div class="sec" style="margin-bottom:8px;font-size:14.5px">' + T('Asks you first before') + ' ' + ic('lock', 14) + '</div><div class="asks">' + cats.map((c) => { const cur = (f.policy || {})[c.id] || def[c.id] || 'ask'; return '<label><input type="checkbox" name="ask:' + esc(c.id) + '"' + (cur !== 'allow' ? ' checked' : '') + (c.id === 'payment' ? ' disabled' : '') + '><span>' + T(CAT[c.id] ? CAT[c.id][0] : c.label) + (cur === 'never' ? ' <span class="mut">(' + T('never') + ')</span>' : '') + '</span></label>' }).join('') + '</div><p class="hint">' + T('Unticked: allowed without asking. Paying always asks.') + '</p></div>'
      }
      html += '<details><summary>' + T('More options') + '</summary><div style="margin-top:12px">'
      html += '<label class="fl">' + T('Office') + '<select name="officeId">' + offices().map((o) => '<option value="' + esc(o.id) + '"' + (f.officeId === o.id ? ' selected' : '') + '>' + esc(officeName(o.id)) + '</option>').join('') + '</select></label>'
      if (f.op !== 'edit') html += '<label class="fl">' + T('Reports to') + '<select name="reportsTo"><option value="">' + T('The head of the office') + '</option><option value="supervisor"' + (f.reportsTo === 'supervisor' ? ' selected' : '') + '>' + T('Your assistant') + '</option>' + members().map((e) => '<option value="' + esc(e.id) + '"' + (f.reportsTo === e.id ? ' selected' : '') + '>' + esc(nameLine(e.id)) + '</option>').join('') + '</select></label>'
      html += '<label class="fl">' + T('In one line, for the team list') + ' <span class="op">' + T('Optional') + '</span><input type="text" name="description" maxlength="300" dir="auto" value="' + v('description') + '"><span class="hint" style="font-weight:400">' + T('Left empty, the first sentence of the job is used.') + '</span></label>'
      html += '<label class="fl">' + T('Short id (letters, digits, hyphens; used in files)') + '<input type="text" name="id" maxlength="60" dir="ltr" value="' + v('id') + '"' + (f.op === 'edit' ? ' readonly' : '') + '><span class="hint" style="font-weight:400">' + T('Left empty, it is made from a Latin name.') + '</span></label>'
      html += '<label class="fl">' + T('Strength') + '<select name="tier">' + ['light', 'standard', 'heavy'].map((x) => '<option value="' + x + '"' + ((f.tier || 'standard') === x ? ' selected' : '') + '>' + T(TIER[x]) + '</option>').join('') + '</select><span class="hint" style="font-weight:400">' + T('Light is quick and cheap, Strong is for hard work. Claude Code uses this; other assistants ignore it.') + '</span></label>'
      if (f.op !== 'edit') html += '<label class="fl">' + T('Monthly budget in USD (optional)') + '<input type="text" name="usd" dir="ltr" value="' + v('usd') + '" placeholder="25.50"></label>'
      html += '<p class="hi" style="font-weight:600;font-size:13px;margin:6px 0">' + T('In Claude Code') + '</p>'
      html += '<label class="rw" style="gap:8px;margin:4px 0"><input type="checkbox" name="edit"' + (f.caps && f.caps.edit === false ? '' : ' checked') + '><span class="soft">' + T('Create and edit files') + '</span></label>'
      html += '<label class="rw" style="gap:8px;margin:4px 0"><input type="checkbox" name="web"' + (f.caps && f.caps.web ? ' checked' : '') + '><span class="soft">' + T('Search the web') + '</span></label>'
      html += '<label class="rw" style="gap:8px;margin:4px 0"><input type="checkbox" name="commands"' + (f.caps && f.caps.commands ? ' checked' : '') + '><span class="soft">' + T('Run commands (advanced)') + '</span></label>'
      if (f.op === 'edit' && !f.managed) html += '<label class="rw" style="gap:8px;margin:8px 0"><input type="checkbox" name="confirmForeign"' + (f.confirmForeign ? ' checked' : '') + '><span class="soft">' + T('This file belongs to another tool. Edit it anyway; a backup will be kept.') + '</span></label>'
      html += '</div></details>'
    }
    html += msgHtml() + '</form><div class="pf">'
    const where = office || ''
    if (f.preview) html += '<button type="submit" form="hform" class="b pri">' + ic('check', 15, 2.6) + esc(f.op === 'edit' ? T('Save') : T('Add to ') + where) + '</button><button type="button" class="b ghost" data-ev="hire-back">' + T('Back') + '</button>'
    else html += '<button type="submit" form="hform" class="b pri">' + T('Next: check the file') + ' ' + ic('chev', 14, 2.4) + '</button><button type="button" class="b ghost" data-ev="drawer-close">' + T('Cancel') + '</button>'
    return html + '</div>'
  }
  const slug = (s) => (/^[\x20-\x7e]+$/.test(String(s || '')) ? String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^[^a-z]+|-+$/g, '').slice(0, 60) : '')
  function readHire(form) {
    const f = st.hire
    const el = form.elements
    const val = (n) => (el[n] && el[n].value !== undefined && !(el[n] instanceof RadioNodeList) ? String(el[n].value) : undefined)
    for (const k of ['name', 'id', 'title', 'officeId', 'reportsTo', 'description', 'instructions', 'tier', 'usd']) { const x = val(k); if (x !== undefined) f[k] = x.trim() }
    const look = [...el].find((x) => x.name === 'look' && x.checked)
    if (look) f.look = Number(look.value)
    if (el.edit) f.caps = { edit: el.edit.checked, web: el.web.checked, commands: el.commands.checked }
    if (el.confirmForeign) f.confirmForeign = el.confirmForeign.checked
    const skill = el.skill && String(el.skill.value).trim()
    if (skill) { f.skills = (f.skills || []).concat([skill]).slice(0, 8); el.skill.value = '' }
    const def = (st.data.team && st.data.team.policy && st.data.team.policy.defaults) || {}
    for (const e of [...el]) if (e.name && e.name.indexOf('ask:') === 0) {
      const c = e.name.slice(4)
      f.policy = f.policy || {}
      // ticked keeps "never" when that is the default; unticked is allowed
      f.policy[c] = e.checked ? (def[c] === 'never' ? 'never' : 'ask') : 'allow'
    }
    if (!f.id && f.op !== 'edit') f.id = slug(f.name) || slug(f.title)
  }
  function hireBody() {
    const f = st.hire
    const first = String(f.instructions || '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?؟])\s/)[0].slice(0, 300)
    const b = { id: f.id, name: f.name || f.title, title: f.title, officeId: f.officeId, reportsTo: f.reportsTo, description: f.description || first, instructions: f.instructions, tier: f.tier, caps: f.caps, policy: f.policy, skills: f.skills || [], look: f.look || 0 }
    if (f.usd) b.budget = { monthlyUsd: f.usd }
    if (f.op === 'edit') { b.op = 'edit'; b.confirmForeign = !!f.confirmForeign; delete b.policy; delete b.reportsTo }
    return b
  }

  // ========== finished work
  const KIND = { document: 'Documents', image: 'Images', sheet: 'Spreadsheets', link: 'Links' }
  // what a person looks for: documents (text too), pictures, tables and links
  const groupOf = (d) => (d.kind === 'image' || d.image ? 'image' : d.kind === 'link' ? 'link' : /csv|spreadsheet|excel/.test(d.mime || '') ? 'sheet' : 'document')
  const kindArt = (d) => (/^text\/plain/.test(d.mime || '') ? 'text' : { image: 'image', link: 'link', sheet: 'sheet', document: 'doc' }[groupOf(d)])
  function extOf(d) {
    if (d.kind === 'link') return T('Link')
    const n = /\.([A-Za-z0-9]{1,5})$/.exec(d.name || d.originalPath || '')
    if (n) return n[1].toUpperCase()
    return ({ 'text/markdown': 'MD', 'text/plain': 'TXT', 'text/csv': 'CSV', 'image/png': 'PNG', 'image/jpeg': 'JPG', 'image/gif': 'GIF', 'image/webp': 'WEBP', 'application/pdf': 'PDF' })[String(d.mime || '').split(';')[0]] || T('File')
  }
  const sizeOf = (b) => (b >= 1048576 ? fa((b / 1048576).toFixed(1)) + T(' MB') : fa(Math.max(1, Math.round(b / 1024))) + T(' KB'))
  function dlvMain() {
    if (!LIVE) return liveOnly()
    load('dlv', 'api/deliverables')
    const list = (st.data.dlv && st.data.dlv.deliverables) || []
    const q = st.dlvQ.trim().toLowerCase()
    const shown = list.filter((d) => (!st.dlvKind || groupOf(d) === st.dlvKind) && (!q || (d.title + ' ' + nameOf(d.agent) + ' ' + (d.agent || '')).toLowerCase().includes(q)))
    let html = head(T('Finished work'), T('Everything your team has made for you, newest first.'), '<label class="rw" style="gap:0;position:relative;margin:0"><span style="position:absolute;inset-inline-start:12px;color:var(--ink-dim);line-height:0">' + ic('search', 15) + '</span><input type="search" name="dq" data-ev-input="dq" value="' + esc(st.dlvQ) + '" placeholder="' + T('Search by name or person') + '" aria-label="' + T('Search by name or person') + '" style="width:260px;padding-inline-start:36px"></label>')
    if (!list.length) return html + '<p class="empty">' + T('What your team hands in appears here: documents, pictures, tables and links.') + '</p>'
    const n = (k) => list.filter((d) => groupOf(d) === k).length
    const chip = (v, label, icon) => '<button type="button" class="chip" data-ev="dkind" data-arg="' + v + '" aria-pressed="' + (st.dlvKind === v) + '">' + (icon ? ic(icon, 12) : '') + label + ' ' + fa(v ? n(v) : list.length) + '</button>'
    const fresh = list.filter((d) => isToday(d.createdAt)).length
    html += '<div class="rw" style="gap:8px;margin:-6px 0 20px;flex-wrap:wrap">' + chip('', T('All')) + chip('document', T(KIND.document), 'doc') + chip('image', T(KIND.image), 'image') + chip('sheet', T(KIND.sheet), 'table') + chip('link', T(KIND.link), 'link') + '<span class="sp"></span><span class="mut" style="font-size:13px">' + T('Today') + ' <b class="hi">' + fa(fresh) + ' ' + T('new') + '</b></span></div>'
    if (!shown.length) html += '<p class="empty">' + T('Nothing matches.') + '</p>'
    html += '<div class="gal">' + shown.slice(0, 80).map((d) => {
      const c = colorOfMember(d.agent)
      const open = d.state === 'stored' ? '<a class="b sm" style="flex:1" href="deliverables/' + esc(d.id) + '" target="_blank" rel="noopener">' + ic('eye', 14) + T('Open') + '</a>' : d.url ? '<a class="b sm" style="flex:1" href="' + esc(d.url) + '" target="_blank" rel="noopener noreferrer">' + ic('globe', 14) + T('Open page') + '</a>' : d.originalPath ? '<button type="button" class="b sm" style="flex:1" data-ev="copy" data-arg="' + esc(d.originalPath) + '">' + ic('copy', 14) + T('Copy path') + '</button>' : ''
      return '<div class="card fc"><button type="button" class="th" data-ev="dlv-open" data-arg="' + esc(d.id) + '" aria-label="' + esc(T('Preview: ') + d.title) + '" style="border:0;border-bottom:1px solid var(--line);cursor:pointer;padding:0;width:100%">' + (d.image && d.state === 'stored' ? '<img src="deliverables/' + esc(d.id) + '" alt="" loading="lazy">' : A.thumb(kindArt(d), c)) + '<span class="tb">' + ic({ image: 'image', link: 'link', sheet: 'table' }[groupOf(d)] || 'doc', 12) + ' ' + esc(extOf(d)) + '</span></button>' +
        '<div style="padding:12px 14px 14px;display:flex;flex-direction:column;flex:1"><div class="hi" dir="auto" style="font-weight:600;font-size:14.5px;line-height:1.3;min-height:38px">' + esc(d.title) + '</div><div class="rw" style="margin-top:8px;gap:8px">' + face(d.agent || 'supervisor', 22) + '<span class="soft ell" style="font-size:12.5px">' + esc(nameOf(d.agent || 'supervisor')) + '</span><span class="sp"></span><span class="mut" style="font-size:12.5px;flex:none">' + esc(day(d.createdAt)) + '</span></div>' +
        (d.state === 'missing' ? '<span class="chip warn" style="margin-top:8px;align-self:flex-start">' + T('File no longer there') + '</span>' : '') +
        '<div class="rw" style="margin-top:12px;gap:8px">' + open + '<button type="button" class="b sm ghost" data-ev="dlv-open" data-arg="' + esc(d.id) + '" aria-label="' + T('Preview') + '" title="' + T('Preview') + '">' + ic('eye', 15) + '</button></div></div></div>'
    }).join('') + '</div>'
    if (st.data.dlv.store) html += '<p class="mut" style="font-size:12.5px;margin-top:18px">' + T('Arsenale keeps its own copies: ') + fa(st.data.dlv.store.files) + ' · ' + sizeOf(st.data.dlv.store.bytes) + (st.data.dlv.store.warn ? ' · ' + T('over 2 GB: consider deleting old ones') : '') + '</p>'
    return html
  }
  function dlvPreview() {
    const list = (st.data.dlv && st.data.dlv.deliverables) || []
    const d = list.find((x) => x.id === st.drawer.id)
    if (!d) return ''
    let html = '<div class="ph"><div style="min-width:0"><h2 dir="auto">' + esc(d.title) + '</h2><div class="mut" style="font-size:13px;margin-top:2px">' + esc(nameOf(d.agent || 'supervisor')) + ' · ' + esc(day(d.createdAt)) + '</div></div><button type="button" class="x" data-ev="drawer-close" aria-label="' + T('Close') + '">' + ic('x', 18) + '</button></div><div class="pb">'
    if (d.note) html += '<p class="soft" dir="auto">' + esc(d.note) + '</p>'
    const job = d.jobId && (DATA.runs || []).find((r) => r.id === d.jobId)
    if (job) html += '<p class="soft">' + T('From the job: ') + '<span dir="auto">' + esc(job.summary || job.task) + '</span></p>'
    if (d.state === 'stored') {
      if (d.image) html += '<p><img src="deliverables/' + esc(d.id) + '" alt="' + esc(d.title) + '" style="max-width:100%;border:1px solid var(--line);border-radius:6px"></p>'
      else if (/^text\//.test(d.mime)) {
        const tx = st.data['txt|' + d.id]
        if (tx === undefined) {
          st.data['txt|' + d.id] = null
          fetch('deliverables/' + d.id, { cache: 'no-store' }).then((r) => r.text()).then((t) => { st.data['txt|' + d.id] = t; bump() }, () => { st.data['txt|' + d.id] = ''; bump() })
          html += '<p class="empty">' + T('Loading…') + '</p>'
        } else if (tx !== null) {
          if (/csv/.test(d.mime)) html += csvTable(tx)
          else html += '<pre class="txt">' + esc(tx.split('\n').slice(0, 200).join('\n')) + '</pre>'
        }
      } else html += '<p class="soft">' + T('No preview for this type.') + ' ' + sizeOf(d.bytes) + '</p>'
      html += '<div class="rw" style="gap:10px"><a class="b pri" href="deliverables/' + esc(d.id) + '" download>' + ic('download', 15) + T('Download') + '</a><a class="b" href="deliverables/' + esc(d.id) + '" target="_blank" rel="noopener">' + T('Open in a new tab') + '</a></div>'
    } else {
      if (d.url) html += '<p><a href="' + esc(d.url) + '" target="_blank" rel="noopener noreferrer" dir="ltr" style="color:var(--cyan)">' + esc(d.url) + '</a></p>'
      if (d.originalPath) html += '<p class="rw" style="gap:8px">' + ltr(d.originalPath) + ' <button type="button" class="b sm" data-ev="copy" data-arg="' + esc(d.originalPath) + '">' + T('Copy path') + '</button></p>'
      if (d.state === 'missing') html += '<p class="msg err">' + T('File no longer there') + '</p>'
      if (d.reason) html += '<p class="note">' + T('Not copied: ') + esc(errTxt(d.reason)) + '</p>'
    }
    if (d.taskId) html += '<p class="mut" style="font-size:12.5px">' + T('For the task: ') + '<button type="button" class="b sm ghost" data-ev="task-open" data-arg="' + esc(d.taskId) + '">' + esc((taskById(d.taskId) || {}).title || T('open it')) + '</button></p>'
    return html + msgHtml() + '</div>'
  }
  function csvTable(text) {
    const rows = text.split(/\r?\n/).filter((l) => l.length).slice(0, 51).map((line) => {
      const out = []; let cur = '', q = false
      for (let i = 0; i < line.length; i++) {
        const c = line[i]
        if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ } else if (c === '"') q = false; else cur += c }
        else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = '' } else cur += c
      }
      out.push(cur)
      return out
    })
    return '<div style="overflow:auto"><table class="pol">' + rows.map((r, i) => '<tr>' + r.map((c) => (i ? '<td dir="auto">' : '<th dir="auto">') + esc(c) + (i ? '</td>' : '</th>')).join('') + '</tr>').join('') + '</table></div>'
  }

  // ========== settings
  const SETTABS = [['assistants', 'Assistants', 'plug'], ['phone', 'Phone alerts', 'phone'], ['safety', 'Safety rules', 'shield'], ['packs', 'Office packs', 'box'], ['privacy', 'Privacy', 'lock']]
  function setMain() {
    if (!LIVE) return liveOnly()
    if (!SETTABS.some((x) => x[0] === st.setTab)) st.setTab = 'assistants'
    let html = head(T('Settings')) + '<div class="setw"><nav class="snav" aria-label="' + T('Settings') + '">' + SETTABS.map((x) => '<button type="button" data-ev="stab" data-arg="' + x[0] + '" aria-pressed="' + (st.setTab === x[0]) + '">' + ic(x[2], 18) + T(x[1]) + '</button>').join('') + '</nav><div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:22px">'
    if (st.setTab === 'assistants') html += assistantsTab()
    else if (st.setTab === 'phone') html += phoneTab()
    else if (st.setTab === 'safety') html += safetyTab()
    else if (st.setTab === 'packs') html += packsTab()
    else html += privacyTab()
    return html + '</div></div>'
  }
  // the names clients give at initialize (a label, not proof): which card each belongs to
  const CARD_RE = { 'claude-desktop': /^(claude-ai|claude-desktop)$/, 'claude-code': /^claude-code$/, cursor: /cursor/, vscode: /visual-studio-code|vscode|copilot/, codex: /codex/, gemini: /gemini/ }
  const seenFor = (c, clients) => { const re = CARD_RE[c.id]; return re ? clients.find((x) => re.test(x.id)) : c.id === 'other' ? clients.find((x) => !/^(claude-ai|claude-desktop|claude-code)$|cursor|visual-studio-code|vscode|copilot|codex|gemini/.test(x.id)) : null }
  function assistantsTab() {
    load('connect', 'api/connect', !!st.test, st.test ? 2000 : 5000)
    const d = st.data.connect
    if (!d) return '<p class="empty">' + T('Loading…') + '</p>'
    let html = '<div><div class="sec">' + T('Your assistants') + ' <small>' + T('The AI chats that do the work') + '</small></div><div class="card rows" style="overflow:hidden">'
    for (const c of d.cards) {
      const seen = seenFor(c, d.clients)
      const na = c.primary === 'none'
      const open = st.openCard === c.id
      const status = seen ? T('Connected, last heard ') + ago(seen.lastSeen) : na ? T(c.note || 'Cannot connect yet.') : T('Not connected')
      html += '<div class="r">' + A.robot(30) + '<div class="sp" style="min-width:0"><b class="hi">' + esc(T(c.name)) + '</b>' + (c.experimental ? '<span class="exp">' + T('experimental') + '</span>' : '') + '<div class="' + (seen ? 'soft' : 'mut') + '" style="font-size:13px">' + esc(status) + '</div></div>'
      if (seen) html += '<span class="chip ok">' + ic('check', 12, 3) + ' ' + T('Connected') + '</span><button type="button" class="b sm" data-ev="ctest" data-arg="' + esc(c.id) + '">' + T('Test') + '</button><button type="button" class="b sm ghost" data-ev="copen" data-arg="' + esc(c.id) + '" aria-expanded="' + open + '">' + T('More') + '</button>'
      else if (na) html += '<span class="chip">' + T('Not available') + '</span>'
      else html += '<button type="button" class="b sm' + (open ? '' : ' pri') + '" data-ev="copen" data-arg="' + esc(c.id) + '" aria-expanded="' + open + '">' + (open ? T('Close') : T('Connect')) + '</button>'
      html += '</div>'
      if (open) html += '<div class="more">' + connectSteps(c, d.clients, false) + '</div>'
    }
    html += '</div></div>'
    const known = new Set(d.cards.map((c) => (seenFor(c, d.clients) || {}).id).filter(Boolean))
    const rest = d.clients.filter((x) => !known.has(x.id))
    if (d.clients.length) html += '<div><div class="sec">' + T('What Arsenale remembers') + ' <small>' + T('The name an assistant gives is a label, not proof of who it is.') + '</small></div><div class="card rows">' + d.clients.map((c) => { const quiet = Date.now() - Date.parse(c.lastSeen) > 7 * 86400000; return '<div class="r"><b class="hi" dir="ltr">' + esc(c.name || c.id) + '</b><span class="mut sp" style="font-size:13px">' + esc(c.transport) + ' · ' + T('last call ') + esc(ago(c.lastSeen)) + ' · ' + fa(c.callsToday) + ' ' + T('calls today') + (quiet ? ' <span class="chip warn">' + T('quiet') + '</span>' : '') + (rest.includes(c) ? '' : '') + '</span><button type="button" class="b sm ghost' + armedCls('forget|' + c.id) + '" data-ev="forget" data-arg="' + esc(c.id) + '" title="' + T('A forgotten assistant can connect again; this only clears what Arsenale remembers about it.') + '">' + esc(armedLabel('forget|' + c.id, T('Forget'))) + '</button></div>' }).join('') + '</div></div>'
    html += '<details><summary>' + T('Advanced: custom instructions and MCP over HTTP') + '</summary><div style="margin-top:12px;display:flex;flex-direction:column;gap:10px"><p class="soft">' + T('Some assistants ignore the instructions Arsenale sends. Paste this into your assistant\'s custom instructions:') + '</p><pre>' + esc(T(d.customInstructions)) + '</pre><div><button type="button" class="b sm" data-ev="copy" data-arg="' + esc(T(d.customInstructions)) + '">' + T('Copy') + '</button></div>'
    html += '<p class="hi" style="font-weight:600">' + T('MCP over HTTP') + '</p><p class="soft">' + T('For assistants that accept only a web address. It works only while this dashboard runs, and needs a secret token on every call.') + '</p>'
    html += d.http.on ? '<p class="soft">' + T('On, at ') + ltr(d.http.url) + '</p>' : '<p class="soft">' + T('Off. To turn it on, set the environment variable ARSENALE_MCP_TOKEN to a random value of 32 or more characters and restart the dashboard.') + '</p><div><button type="button" class="b sm" data-ev="mktoken">' + T('Make a random token to copy') + '</button></div>' + (st.token ? '<pre>' + esc(st.token) + '</pre>' : '')
    html += '<p class="note">' + T('The token is stored in your assistant\'s settings in plain text. Anyone who can read those files can log as your assistant, but cannot answer or approve anything.') + '</p></div></details>'
    return html + msgHtml()
  }
  /** The three steps for one assistant: add Arsenale, restart, say hello. */
  function connectSteps(c, clients, wizard) {
    const seen = seenFor(c, clients)
    const testing = st.test && st.test.client === c.id
    const num = (n, ok) => '<span class="num' + (ok ? ' ok' : '') + '">' + fa(n) + '</span>'
    const B = wizard ? 'b' : 'b'
    let html = '<div style="display:flex;flex-direction:column;gap:14px">'
    let one = ''
    if (c.canWrite) one = '<button type="button" class="' + B + ' pri sm" data-ev="cpreview" data-arg="' + esc(c.id) + '">' + esc(T('Add Arsenale to ') + T(c.name)) + '</button>' + (st.added === c.id ? ' <span class="chip ok">' + ic('check', 12, 3) + ' ' + T('Added') + '</span>' : '')
    if (c.primary === 'command' || c.primary === 'copy') one += '<button type="button" class="' + B + ' sm" data-ev="copy" data-arg="' + esc(c.command) + '">' + T('Copy command') + '</button>'
    if (c.primary === 'link') one += '<a class="' + B + ' sm" href="' + esc(c.link) + '">' + T(c.id === 'cursor' ? 'Open in Cursor' : 'Open in VS Code') + '</a>'
    const what = c.canWrite ? esc(T('One new entry in the settings file of ') + T(c.name) + T('. A backup is kept next to it.')) : c.primary === 'command' ? T('Run this command once in a terminal.') : c.primary === 'link' ? T('Open the link; your editor asks you to confirm.') : esc(T(c.note || ''))
    html += '<div class="step rw" style="align-items:flex-start">' + num(1, st.added === c.id || !!seen) + '<div style="flex:1;min-width:0"><b class="hi">' + T('Let Arsenale add itself') + '</b><div class="soft" style="font-size:13.5px">' + what + '</div><div class="rw" style="margin-top:8px;gap:8px;flex-wrap:wrap">' + one + '</div>'
    if (c.snippet) html += '<details style="margin-top:8px"><summary>' + T('Show what will be added') + '</summary><pre>' + esc((c.command ? c.command + '\n\n' : '') + c.snippet) + '</pre></details>'
    if (st.cpv && st.cpv.client === c.id) {
      const p = st.cpv
      html += p.unchanged ? '<p class="msg ok">' + T('Arsenale is already in this file.') + '</p>' : '<p class="soft" style="margin-top:8px">' + T('File: ') + ltr(p.file) + '</p><p class="hint">' + T('Before:') + '</p><pre>' + esc(p.before === null ? T('(no file yet)') : p.before) + '</pre><p class="hint">' + T('After:') + '</p><pre>' + esc(p.after) + '</pre><div class="rw" style="gap:8px;margin-top:8px"><button type="button" class="' + B + ' pri sm" data-ev="capply" data-arg="' + esc(c.id) + '">' + T('Write this change (a backup is kept)') + '</button><button type="button" class="' + B + ' ghost sm" data-ev="ccancel">' + T('Cancel') + '</button></div>'
    }
    html += '</div></div>'
    html += '<div class="step rw" style="align-items:flex-start">' + num(2, !!seen) + '<div><b class="hi">' + esc(T('Restart ') + T(c.name)) + '</b><div class="soft" style="font-size:13.5px">' + T('Close it fully and open it again.') + '</div></div></div>'
    html += '<div class="step rw" style="align-items:flex-start">' + num(3, !!seen) + '<div style="flex:1"><b class="hi">' + T('Say hello') + '</b><div class="soft" style="font-size:13.5px">' + T('Type this in a new chat:') + '</div><div class="rw" style="margin-top:8px;background:var(--ground);border:1px solid var(--line-strong);border-radius:8px;padding:8px 12px"><span class="hi sp" style="font-size:15px">' + T('Say hello to Arsenale') + '</span><button type="button" class="' + B + ' sm" data-ev="copy-hello">' + T('Copy') + '</button></div></div></div>'
    const ok = !!seen || (testing && st.test.ok)
    if (wizard || testing) html += '<div class="wt rw' + (ok ? ' ok' : '') + '" role="status"><span class="dot"></span><div><b style="color:' + (ok ? 'var(--accent)' : '#F2C06B') + '">' + esc(ok ? T('Connected. Arsenale heard from ') + T(c.name) + '.' : testing && st.test.failed ? T('Not yet. Check the steps, then press Test.') : T('Waiting to hear from ') + T(c.name) + '…') + '</b><div class="soft" style="font-size:13px">' + (ok ? T('Every job it does now shows up here.') : T('Turns green when it answers.')) + '</div></div>' + (!ok && !testing ? '<button type="button" class="' + B + ' sm" data-ev="ctest" data-arg="' + esc(c.id) + '" style="margin-inline-start:auto">' + T('Test') + '</button>' : '') + '</div>'
    else if (!wizard) html += '<div><button type="button" class="' + B + ' sm" data-ev="ctest" data-arg="' + esc(c.id) + '">' + T('Test') + '</button></div>'
    return html + '</div>'
  }
  function phoneTab() {
    load('notify', 'api/notify')
    load('policy', 'api/policy', false, 30000)
    const d = st.data.notify
    const perm = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
    let html = '<div><div class="sec">' + T('On this computer') + ' <small>' + T('While this page is open in a tab') + '</small></div><div class="card pad rw" style="flex-wrap:wrap"><div class="sp"><b class="hi">' + T('Desktop notifications') + '</b><div class="mut" style="font-size:12.5px">' + T('When your assistant asks you something, when a task waits for you, or when a budget alert comes in.') + '</div></div>' +
      (perm === 'default' ? '<button type="button" class="b sm" data-ev="notif-perm">' + T('Allow notifications in this browser') + '</button>' : perm === 'denied' ? '<span class="chip warn">' + T('Blocked in the browser settings') + '</span>' : perm === 'unsupported' ? '<span class="chip warn">' + T('This browser has no notifications') + '</span>' : '<span class="chip ok">' + T('Allowed') + '</span>') +
      '<input type="checkbox" class="tgl" data-ev-change="notif" aria-label="' + T('Desktop notifications') + '"' + (notifOn() ? ' checked' : '') + '></div></div>'
    html += '<div><div class="sec">' + T('Phone alerts') + ' <span class="exp">' + T('experimental') + '</span> <small>' + T('Get a buzz when your team needs you') + '</small></div>'
    if (!d) return html + '<p class="empty">' + T('Loading…') + '</p></div>'
    const ch = st.channel
    const c = d[ch]
    html += '<div class="rw" style="gap:8px;margin-bottom:12px">' + [['ntfy', 'ntfy'], ['telegram', 'Telegram'], ['pushover', 'Pushover']].map((x) => '<button type="button" class="chip" data-ev="nchan" data-arg="' + x[0] + '" aria-pressed="' + (ch === x[0]) + '" style="height:32px;padding:0 14px;font-size:13.5px">' + (d[x[0]].enabled ? ic('check', 12, 3) + ' ' : '') + x[1] + '</button>').join('') + '</div>'
    html += '<div class="card pad" style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,330px);gap:24px"><div style="display:flex;flex-direction:column;gap:14px">'
    const lock = !canWrite()
    html += '<label class="rw" style="margin:0;cursor:pointer"><span class="sp"><b class="hi">' + T('Send alerts to my phone') + '</b><span class="mut" style="font-size:12.5px;display:block">' + (ch === 'ntfy' ? T('Using the free ntfy app. No account with Arsenale.') : ch === 'telegram' ? T('Through a Telegram bot you create.') : T('Through the Pushover app. It only notifies: no buttons.')) + (c.testedAt || c.enabled ? '' : ' ' + T('Send a test first.')) + '</span></span><input type="checkbox" class="tgl" data-ev-change="nfon" data-arg="' + ch + '"' + (c.enabled ? ' checked' : '') + (lock || !(c.testedAt || c.enabled) ? ' disabled' : '') + '></label>'
    if (ch !== 'pushover') html += '<label class="rw" style="margin:0;cursor:pointer"><span class="sp"><b class="hi">' + T('Show the question, with Approve and Decline') + '</b><span class="mut" style="font-size:12.5px;display:block">' + (ch === 'ntfy' ? T('The ntfy server you use sees the question text. A server of your own keeps it private.') : T('Telegram sees the question text; bot chats are not end-to-end encrypted.')) + '</span></span><input type="checkbox" class="tgl" data-ev-change="nfdetails" data-arg="' + ch + '"' + (c.details ? ' checked' : '') + (lock ? ' disabled' : '') + '></label>'
    if (ch === 'ntfy') html += '<div><p class="mut" style="font-size:12.5px">' + T('Server: ') + ltr(d.ntfy.server) + (d.ntfy.topic ? ' · ' + T('subscribe to: ') + ltr(d.ntfy.topic) : '') + '</p>' + (canWrite() ? '<form data-evform="ntfy" class="rw" style="gap:8px;margin-top:6px"><input type="text" name="server" dir="ltr" value="' + esc(d.ntfy.server) + '" aria-label="' + T('ntfy server') + '" style="flex:1"><button type="submit" class="b sm">' + T('Set up') + '</button></form>' : '') + '</div>'
    if (ch === 'telegram') {
      const tg = d.telegram
      html += '<div class="soft" style="font-size:13px">' + (tg.paired ? T('Paired with ') + '<b class="hi" dir="auto">' + esc(tg.pairedName || T('one private chat')) + '</b>.' : tg.pairLink ? T('Open this link on your phone within 10 minutes, and press Start in Telegram:') + '<br><a href="' + esc(tg.pairLink) + '" target="_blank" rel="noopener noreferrer" dir="ltr" style="color:var(--cyan);word-break:break-all">' + esc(tg.pairLink) + '</a>' : tg.pairCommand ? T('Within 10 minutes, send this to your bot in a private chat:') + '<br>' + ltr(tg.pairCommand) + ' <button type="button" class="b sm" data-ev="copy" data-arg="' + esc(tg.pairCommand) + '">' + T('Copy') + '</button>' : !d.env.telegram ? T('Create a bot with BotFather, set its token, then pair.') : T('Pair your phone: Arsenale makes a one-time link for your bot.')) + '</div>' + (canWrite() && d.env.telegram ? '<div><button type="button" class="b sm" data-ev="nf" data-arg="pair|telegram">' + (tg.paired ? T('Pair another phone') : T('Pair a phone')) + '</button></div>' : '')
    }
    if (canWrite()) html += '<div class="rw" style="gap:10px;flex-wrap:wrap"><button type="button" class="b sm" data-ev="nf" data-arg="test|' + ch + '">' + T('Send a test alert') + '</button>' + (c.testedAt ? '<span class="chip ok">' + ic('check', 12, 3) + ' ' + T('Last test: ') + esc(day(c.testedAt)) + '</span>' : '') + '</div>'
    html += '<p class="mut" style="font-size:12.5px">' + T('Last sent: ') + esc(c.lastSentAt ? day(c.lastSentAt) : '—') + (c.lastDecisionAt !== undefined ? ' · ' + T('last decision: ') + esc(c.lastDecisionAt ? day(c.lastDecisionAt) : '—') : '') + (c.invalidToday ? ' · ' + fa(c.invalidToday) + ' ' + T('invalid messages ignored today') : '') + '</p></div>'
    // what the phone shows, in the mode chosen: minimal unless details are on
    const sample = waiting()[0]
    html += '<div class="phone"><div class="lbl" style="margin-bottom:10px">' + T('What your phone shows') + '</div><div class="n">' + (c.details && sample ? '<b class="hi" dir="auto" style="font-size:13.5px">' + esc(nameOf(askerOf(sample)) + T(' asks: ') + plainQ(sample)) + '</b><div class="mut" style="font-size:12.5px;margin-top:2px">' + (phoneButtons(sample) ? T('Tap to Approve or Decline.') : T('Open Arsenale to answer: payments, hires and plain approvals are never answered from a phone.')) + '</div>' + (phoneButtons(sample) ? '<div class="rw" style="margin-top:10px;gap:8px"><span class="chip ok">' + T('Approve') + '</span><span class="chip bad">' + T('Decline') + '</span></div>' : '') : '<b class="hi" style="font-size:13.5px">' + fa(Math.max(1, waiting().length)) + ' ' + T('questions waiting') + '</b><div class="mut" style="font-size:12.5px;margin-top:2px">' + esc(co() ? co().company.name : 'Arsenale') + ' · ' + T('Open Arsenale to answer.') + '</div>') + '</div></div></div></div>'
    html += '<p class="note">' + ic('info', 13) + T('Secrets are read only from environment variables, never from a file: ARSENALE_PHONE_KEY (32+ characters) signs the buttons; ARSENALE_TELEGRAM_TOKEN, ARSENALE_NTFY_TOKEN, ARSENALE_PUSHOVER_TOKEN and ARSENALE_PUSHOVER_USER for the channels. Set them, then restart the dashboard.') + '</p>'
    html += '<p class="mut" style="font-size:12.5px">' + T('Signing key: ') + (d.env.key ? '<span class="chip ok">' + T('set') + '</span>' : '<span class="chip warn">' + T('not set: messages are sent without buttons') + '</span>') + ' · ' + T('Your computer must be on and Arsenale running. If it is asleep, your tap is picked up when it wakes, if the request has not expired.') + '</p>'
    if (canWrite()) html += '<form data-evform="expiry" class="rw" style="gap:10px;flex-wrap:wrap"><label class="rw" style="gap:8px;margin:0;font-size:13px" class="soft">' + T('A phone request expires after (minutes)') + '<input type="number" name="minutes" min="5" max="1440" value="' + esc(d.expiryMin) + '" style="width:100px"></label><button type="submit" class="b sm">' + T('Save') + '</button><span class="sp"></span><button type="button" class="b sm bad' + armedCls('nf|signout') + '" data-ev="nf" data-arg="signout|">' + esc(armedLabel('nf|signout', T('Sign out all phones'))) + '</button></form>'
    html += '<p class="mut" style="font-size:12.5px">' + T('Email notifications are not built yet (help wanted). Payments are never approved from a phone.') + '</p>'
    return html + '</div>' + msgHtml()
  }
  /** Whether a phone gets Approve / Decline for this question: an action whose
   *  rule allows phone approval (never a payment), or a choice; never a hire
   *  or a bare approval (notify.cjs decides the same on the server). */
  function phoneButtons(g) {
    const pol = st.data.policy && st.data.policy.policy
    if (g.approvalType === 'hire') return false
    if (g.approvalType === 'action' && g.action) return g.action.category !== 'payment' && !!(pol && pol.phoneAllowed && pol.phoneAllowed[g.action.category])
    return g.kind !== 'approval' && Array.isArray(g.choices) && g.choices.length > 0
  }
  function safetyTab() {
    load('policy', 'api/policy')
    const d = st.data.policy
    if (!d) return '<p class="empty">' + T('Loading…') + '</p>'
    let html = '<div><div class="sec">' + T('Safety rules') + ' <small>' + T('What your team must ask you before doing') + '</small></div>'
    if (d.policy.newer) html += '<p class="msg err">' + T('Safety rules written by a newer Arsenale: everything asks first, and editing is off.') + '</p>'
    const eff = {}
    for (const c of d.categories) eff[c.id] = { value: d.policy.defaults[c.id], from: 'default' }
    return html + policyTable(d.categories, eff, '') + '</div>' + msgHtml()
  }
  function packsTab() {
    load('packs', 'api/packs', false, 10000)
    const d = st.data.packs
    if (!d) return '<p class="empty">' + T('Loading…') + '</p>'
    let html = '<div><div class="sec">' + T('Office packs') + ' <small>' + T('Ready-made teams') + '</small></div>'
    html += '<p class="soft" style="margin-bottom:14px">' + T('Installing one adds the office and its team members; removing it keeps every file you changed and all history.') + '</p>'
    if (!co()) html += '<p class="note" style="margin-bottom:12px">' + T('Set up your company first: the wizard installs the packs you choose.') + ' <button type="button" class="b sm pri" data-ev="wiz-open">' + T('Set up your company') + '</button></p>'
    const th = themes()
    html += '<div class="packs">' + d.packs.map((p) => {
      const c = th[p.office && p.office.theme] || '#56B6C2'
      const lead = (p.members.find((m) => m.lead) || p.members[0] || { id: p.id }).id
      return '<button type="button" class="card pk' + (p.installed ? '' : ' off') + '" data-ev="pack-open" data-arg="' + esc(p.id) + '" aria-current="' + (st.openPack === p.id) + '"><span class="rw" style="gap:8px">' + A.person(lead, c, 24, true) + '<b class="hi" style="font-size:13.5px;line-height:1.2">' + esc(LANG === 'fa' && p.nameFa ? p.nameFa : p.name) + '</b></span><span class="rw" style="margin-top:12px;justify-content:space-between"><span class="mut" style="font-size:12.5px">' + fa(p.members.length) + ' ' + T('members') + '</span>' + (p.installed ? '<span class="chip ok">' + T('Installed') + '</span>' : p.needs ? '<span class="chip warn">' + T('Needs a newer Arsenale') + '</span>' : '<span class="b sm">' + T('Add') + '</span>') + '</span></button>'
    }).join('') + '</div>'
    const p = d.packs.find((x) => x.id === st.openPack)
    if (p) {
      let b = '<div class="card pad" style="margin-top:14px"><div class="rw"><b class="hi" style="font-size:15px">' + esc(LANG === 'fa' && p.nameFa ? p.nameFa : p.name) + '</b><span class="mut" style="font-size:12px">' + T('version ') + ltr(p.version) + '</span><span class="sp"></span><button type="button" class="x" data-ev="pack-open" data-arg="" aria-label="' + T('Close') + '" style="width:30px;height:30px">' + ic('x', 15) + '</button></div>'
      b += '<p class="soft" dir="auto" style="margin:8px 0 12px">' + esc(LANG === 'fa' && p.descriptionFa ? p.descriptionFa : p.description) + '</p><div class="rw" style="flex-wrap:wrap;gap:8px">' + p.members.map((m) => '<span class="chip" dir="auto">' + esc(LANG === 'fa' && m.titleFa ? m.titleFa : m.title || m.id) + (m.lead ? ' ★' : '') + '</span>').join('') + '</div><div class="rw" style="gap:8px;margin-top:14px">'
      if (p.installed) b += (canWrite() ? '<button type="button" class="b sm bad' + armedCls('pack|remove|' + p.id) + '" data-ev="pack" data-arg="remove|' + esc(p.id) + '">' + esc(armedLabel('pack|remove|' + p.id, T('Remove'))) + '</button>' : '') + (p.update && canWrite() ? '<button type="button" class="b sm pri" data-ev="pack" data-arg="update|' + esc(p.id) + '">' + T('Update') + '</button>' : '')
      else if (!p.needs && co() && canWrite()) b += '<button type="button" class="b sm pri" data-ev="pack" data-arg="install|' + esc(p.id) + '">' + T('Add this office') + '</button>'
      b += '</div>'
      if (st.conflict && st.conflict.id === p.id) b += '<p class="msg err">' + esc(errTxt(st.conflict.msg)) + '</p><div class="rw" style="gap:8px"><button type="button" class="b sm" data-ev="pack" data-arg="install-keep|' + esc(p.id) + '">' + T('Keep yours') + '</button><button type="button" class="b sm" data-ev="pack" data-arg="install-rename|' + esc(p.id) + '">' + T('Install as a copy') + '</button><button type="button" class="b sm ghost" data-ev="pack-cancel">' + T('Cancel') + '</button></div>'
      if (st.packMsg && st.packMsg.id === p.id) b += '<p class="msg ' + (st.packMsg.ok ? 'ok' : 'err') + '">' + esc(st.packMsg.text) + '</p>'
      html += b + '</div>'
    }
    return html + '<p class="note" style="margin-top:12px">' + ic('info', 13) + T('Only the packs that come with Arsenale can be installed. A pack is instructions your assistant follows, so packs from elsewhere are not accepted.') + '</p></div>'
  }
  function privacyTab() {
    const li = (s) => '<li style="margin:4px 0">' + s + '</li>'
    return '<div><div class="sec">' + T('Privacy') + '</div><div class="card pad soft" style="font-size:13.5px;line-height:1.6"><p>' + T('Everything stays on this computer. There is no account, no tracking and no telemetry.') + '</p><p style="margin-top:8px">' + T('Arsenale itself makes no network call unless you turn one of these on:') + '</p><ul>' +
      li(T('ntfy: the server you set (ntfy.sh unless you choose your own)')) + li(T('Telegram: api.telegram.org')) + li(T('Pushover: api.pushover.net')) + '</ul><p>' + T('Web links in tasks and deliverables open in your browser only when you click them. Arsenale never fetches them.') + '</p></div></div>' +
      '<div><div class="sec">' + T('Security') + '</div><div class="card pad soft" style="font-size:13.5px;line-height:1.6"><ul style="margin:0">' +
      li(T('Only this page can answer, approve, hire, set budgets or change the safety rules. Your assistant cannot, whatever it is told.')) +
      li(T('This page opens only with your own key, kept in a file only your account can read. Another account on this computer cannot open it.')) +
      li(T('The command line trusts what it is told: a command that says "by board" is taken as you. Anything that runs as your user on this computer can do that.')) +
      li(T('The safety rules are a request to your assistant, not a lock: Arsenale cannot stop another program\'s tools.')) +
      li(T('A file is copied into the deliverables store only from the folders you allowed, never a protected file (keys, passwords, licences).')) +
      li(T('Arsenale never opens or runs a file. A file path is shown as text.')) + '</ul></div></div>'
  }

  // ========== the wizard: four steps, a campus that grows on the left
  const ASSIST = [['claude-desktop', 'Claude Desktop'], ['vscode', 'VS Code'], ['cursor', 'Cursor'], ['claude-code', 'Claude Code'], ['codex', 'Codex CLI'], ['gemini', 'Gemini CLI'], ['other', 'Other']]
  const KEYWORDS = { 'content-marketing': /shop|store|bakery|cafe|restaurant|brand|market|social|blog|newsletter|sell|فروش|نانوا|کافه|بازار/i, 'customer-support': /shop|store|customer|client|delivery|service|order|sell|مشتری|خدمات|سفارش/i, operations: /office|bakery|delivery|supplier|shop|admin|عملیات|تحویل/i, research: /research|study|consult|analysis|پژوهش|تحقیق/i, hr: /hire|staff|team|people|recruit|کارمند|استخدام/i, finance: /invoice|account|budget|finance|book|مالی|حساب/i, design: /design|studio|brand|print|flyer|طراحی/i }
  const SHORT = { 'content-marketing': 'Campaigns, copy, social posts, newsletters', 'customer-support': 'Replies, tickets, help pages', finance: 'Invoices, expenses, budget in plain words', hr: 'Job ads, interviews, first-week plans', operations: 'Agendas, minutes, supplier requests', research: 'Sources, competitors, fact-checks', design: 'Moodboards, palettes, layout briefs' }
  function wizOpen() {
    st.wiz = { step: 1, name: '', mission: '', payModel: 'unknown', packs: [], assistant: 'claude-desktop', picked: false }
    st.wv++
    load('onboard', 'api/onboard', true)
    h.redraw()
  }
  const packColor = (p) => themes()[p.office && p.office.theme] || '#56B6C2'
  const packName = (p) => (LANG === 'fa' && p.nameFa ? p.nameFa : p.name)
  const packShort = (p) => (LANG === 'fa' && p.office && p.office.nameFa ? p.office.nameFa : p.office && p.office.name ? p.office.name.split(' & ')[0] : p.name)
  function wizScene(w, packs) {
    const chosen = packs.filter((p) => w.packs.includes(p.id))
    const plots = chosen.map((p) => ({ built: true, color: packColor(p), label: esc(packShort(p)), count: fa(p.members.length), h: 70 + p.members.length * 6 }))
    if (w.step === 1) for (let i = 0; i < 4; i++) plots.push({ built: false })
    let people = []
    if (w.step >= 4) people = chosen.flatMap((p, i) => p.members.slice(0, 2).map((m, n) => ({ seed: m.id, color: packColor(p), plot: i, n })))
    let svg = A.campus(plots.slice(0, 6), people)
    if (w.step === 3) {
      const c = (st.data.connect && st.data.connect.cards || []).find((x) => x.id === w.assistant)
      const linked = !!(c && st.data.connect && seenFor(c, st.data.connect.clients))
      svg = '<g transform="translate(-150,10) scale(.82)">' + svg + '</g>' + A.laptop(esc(c ? T(c.name) : ''), esc(linked ? T('connected') : T('waiting…')), linked)
    }
    return '<svg viewBox="0 0 900 600" preserveAspectRatio="xMidYMid meet" shape-rendering="crispEdges" aria-hidden="true">' + svg + '</svg>'
  }
  function wizHtml() {
    const w = st.wiz
    const d = st.data.onboard
    const packs = (d && d.packs) || []
    // the first look at the offices ticks the ones the description suggests
    if (w.step === 2 && !w.picked && packs.length) { w.picked = true; const text = w.name + ' ' + w.mission; w.packs = packs.filter((p) => KEYWORDS[p.id] && KEYWORDS[p.id].test(text)).map((p) => p.id).slice(0, 3) }
    const steps = [T('Welcome'), T('Offices'), T('Connect'), T('Review')]
    const top = '<div class="wtop"><div class="logo">' + ic('spark', 22) + ' Arsenale <small>' + T('SETUP') + '</small></div>' + steps.map((s, i) => '<span class="stp' + (i + 1 === w.step ? ' on' : i + 1 < w.step || w.step > 4 ? ' done' : '') + '">' + (i + 1 < w.step || w.step > 4 ? ic('check', 15, 2.8) : '<span style="font:12px var(--mono)">' + fa(i + 1) + '</span>') + ' ' + s + '</span>' + (i < 3 ? '<span class="mut" style="line-height:0">' + ic(LANG === 'fa' ? 'back' : 'chev', 14) + '</span>' : '')).join('') +
      '<span style="flex:1"></span>' + (w.step < 5 ? '<button type="button" class="b sm ghost" data-ev="wiz-close">' + T('Close (nothing is saved)') + '</button>' : '') + '</div>'
    const say = { 1: 'Hello! I am your assistant. Tell me about your company and we will build your team together.', 2: 'Tick an office and its building appears on your campus.', 3: 'Almost there. I will wait right here until I hear from you.', 4: 'This is your campus. Everyone is ready at their desk.', 5: 'Your company is set up. Give me a first task whenever you like.' }[Math.min(5, w.step)]
    const scene = '<div class="wscene">' + wizScene(w, packs) + '<div class="guide">' + A.robot(64) + '<div class="say">' + T(say) + '</div></div></div>'
    const lbl = (n) => '<div class="lbl">' + T('Step ') + fa(n) + T(' of 4') + '</div>'
    const back = '<button type="button" class="b ghost" data-ev="wiz-back">' + ic(LANG === 'fa' ? 'chev' : 'back', 16) + T('Back') + '</button>'
    const next = (label) => '<button type="submit" class="b pri big" style="margin-inline-start:auto">' + label + ' ' + ic(LANG === 'fa' ? 'back' : 'chev', 16, 2.4) + '</button>'
    let form = '<form data-evform="wiz" data-step="' + w.step + '" class="wform"><div class="wpad">'
    let foot = ''
    if (w.step === 1) {
      form += lbl(1) + '<h1>' + T('Welcome. Let us build your office.') + '</h1><p class="lead">' + T('You give jobs in plain words. Your team gets them done and asks you before anything leaves this computer.') + '</p>'
      form += '<label class="fl">' + T('What is your company called?') + '<input type="text" name="name" maxlength="60" dir="auto" required value="' + esc(w.name) + '" style="font-size:16px;padding:12px"></label>'
      form += '<label class="fl">' + T('What does it do?') + '<textarea name="mission" maxlength="300" dir="auto" style="min-height:80px">' + esc(w.mission) + '</textarea><span class="hint" style="font-weight:400">' + T('Helps your team write in the right tone.') + '</span></label>'
      form += '<div class="fl" style="display:flex;flex-direction:column;gap:6px;font-weight:600;color:var(--ink-hi);font-size:13px">' + T('Language') + '<span class="seg2"><button type="button" data-lang="en" aria-pressed="' + (LANG !== 'fa') + '">English</button><button type="button" data-lang="fa" aria-pressed="' + (LANG === 'fa') + '" style="font-family:var(--fa)">فارسی</button></span></div>'
      form += '<div class="fl" style="display:flex;flex-direction:column;gap:6px;font-weight:600;color:var(--ink-hi);font-size:13px;margin-top:6px">' + T('How do you pay for your AI assistant?') + '<span class="seg2" role="radiogroup">' + [['plan', T('A monthly plan')], ['api', T('Pay per use')], ['unknown', T('Not sure')]].map(([v, a]) => '<label><input type="radio" name="payModel" value="' + v + '"' + (w.payModel === v ? ' checked' : '') + '>' + a + '</label>').join('') + '</span><span class="hint" style="font-weight:400">' + T('On a plan Arsenale shows time, not money. Budgets can be set later.') + '</span></div>'
      form += '<p class="hint">' + T('To try it first on an invented company, run "arsenale demo" in a terminal: it opens a demo dashboard that is deleted when it stops.') + '</p>'
      foot = '<span class="hint">' + ic('lock', 14) + ' ' + T('Nothing is saved until the last step. About 3 minutes.') + '</span>' + next(T('Choose offices'))
    } else if (w.step === 2) {
      form += lbl(2) + '<h1>' + T('Which offices do you need?') + '</h1><p class="lead">' + T('You can add or remove offices later in Settings.') + '</p>'
      form += packs.length ? '<div style="display:flex;flex-direction:column;gap:8px">' + packs.map((p) => '<label class="oprow" style="border-color:' + (w.packs.includes(p.id) ? esc(packColor(p)) : 'var(--line)') + '"><input type="checkbox" name="pack" value="' + esc(p.id) + '"' + (w.packs.includes(p.id) ? ' checked' : '') + ' data-ev-change="wpack"><span class="bar" style="background:' + esc(packColor(p)) + '"></span><span style="flex:1;min-width:0"><b>' + esc(packName(p)) + '</b><span class="d">' + esc(SHORT[p.id] ? T(SHORT[p.id]) : LANG === 'fa' && p.descriptionFa ? p.descriptionFa : p.description) + '</span></span><span style="display:flex">' + p.members.slice(0, 3).map((m, i) => '<span style="margin-inline-start:' + (i ? -8 : 0) + 'px">' + A.person(m.id, packColor(p), 22) + '</span>').join('') + '</span></label>').join('') + '</div>' : '<p class="hint">' + T('Loading…') + '</p>'
      if (w.err) form += '<p class="msg err">' + esc(errTxt(w.err)) + '</p>'
      const n = packs.filter((p) => w.packs.includes(p.id))
      foot = back + '<span class="hint"><b style="color:var(--ink-hi)">' + fa(n.length) + ' ' + T(n.length === 1 ? 'office' : 'offices') + '</b>' + T(', ') + fa(n.reduce((s, p) => s + p.members.length, 0)) + ' ' + T('team members') + '</span>' + next(T('Connect assistant'))
    } else if (w.step === 3) {
      form += lbl(3) + '<h1>' + T('Connect your assistant') + '</h1><p class="lead">' + T('Arsenale shows you each change before it makes it, and keeps a backup.') + '</p>'
      const c = st.data.connect
      form += '<div class="rw" style="gap:8px;flex-wrap:wrap">' + ASSIST.map(([v, n]) => '<button type="button" class="chip' + (w.assistant === v ? ' ok' : '') + '" data-ev="wiz-asst" data-arg="' + v + '" aria-pressed="' + (w.assistant === v) + '" style="height:34px;padding:0 14px;font-size:13.5px">' + (v === 'other' ? T('Other') : esc(n)) + '</button>').join('') + '<span class="chip" style="height:34px;opacity:.65">' + T('ChatGPT: not yet') + '</span></div>'
      if (!c) { load('connect', 'api/connect', true); form += '<p class="hint">' + T('Loading…') + '</p>' } else {
        const card = c.cards.find((x) => x.id === w.assistant)
        if (card) form += '<div class="ev" style="position:static;display:block;--rw:0">' + connectSteps(card, c.clients, true) + '</div>'
      }
      form += msgHtml()
      foot = back + '<button type="button" class="b ghost" data-ev="wiz-skip" style="color:var(--cyan)">' + T('Skip for now') + '</button>' + next(T('Review'))
    } else if (w.step === 4) {
      form += lbl(4) + '<h1>' + T('Ready to open the doors?') + '</h1><p class="lead">' + T('Nothing has been saved yet. Check the summary.') + '</p>'
      for (const p of packs.filter((x) => w.packs.includes(x.id))) form += '<div class="card rw"><span style="width:6px;height:38px;border-radius:2px;background:' + esc(packColor(p)) + ';flex:none"></span><div style="width:150px;flex:none"><b style="color:var(--ink-hi)">' + esc(packShort(p)) + '</b><div class="hint">' + fa(p.members.length) + ' ' + T('team members') + '</div></div><span style="display:flex;gap:5px;flex-wrap:wrap">' + p.members.map((m) => A.person(m.id, packColor(p), 22, true)).join('') + '</span></div>'
      const asst = ASSIST.find((x) => x[0] === w.assistant)
      form += '<div class="card rw"><div style="flex:1"><div class="lbl">' + T('Company') + '</div><b style="color:var(--ink-hi)" dir="auto">' + esc(w.name) + '</b></div><div style="flex:1"><div class="lbl">' + T('Assistant') + '</div><div class="rw" style="gap:8px">' + A.robot(22) + '<b style="color:var(--ink-hi)">' + (w.assistant === 'other' ? T('Other') : esc(asst ? asst[1] : '')) + '</b></div></div></div>'
      form += '<div class="card rw" style="border-color:var(--accent-line);background:var(--accent-soft);align-items:flex-start"><span style="color:var(--accent);line-height:0">' + ic('shield', 20) + '</span><div style="font-size:13.5px"><b style="color:var(--ink-hi)">' + T('Safe by default.') + '</b> ' + T('Your team asks you first before it sends, posts, pays or deletes anything.') + '</div></div>'
      form += '<details><summary class="hint" style="cursor:pointer">' + T('Arsenale will create these files and folders, and nothing else') + '</summary>' + (w.preview ? '<pre>' + esc(w.preview.files.join('\n')) + '</pre>' : '<p class="hint">' + T('Loading…') + '</p>') + '</details>'
      if (w.err) form += '<p class="msg err">' + esc(errTxt(w.err)) + '</p>'
      foot = back + next(w.err ? T('Try again') : T('Create my team'))
    } else {
      form += '<div class="lbl">' + T('Done') + '</div><h1>' + T('Your company is set up') + '</h1><p class="lead">' + T('Give your first task, and your assistant sees it the next time you talk to it.') + '</p>'
      foot = '<button type="button" class="b" data-ev="wiz-done">' + T('Open my campus') + '</button><button type="button" class="b pri big" data-ev="wiz-first" style="margin-inline-start:auto">' + T('Give your first task') + '</button>'
    }
    form += '</div><div class="wfoot">' + foot + '</div></form>'
    return top + '<div class="wbody">' + scene + form + '</div>'
  }
  function wizStep(form) {
    const w = st.wiz
    const el = form.elements
    if (w.step === 1) { w.name = String(el.name.value).trim(); w.mission = String(el.mission.value).trim(); const p = [...el].find((x) => x.name === 'payModel' && x.checked); w.payModel = p ? p.value : 'unknown'; if (!w.name) return }
    if (w.step === 2) { w.packs = [...el].filter((x) => x.name === 'pack' && x.checked).map((x) => x.value); if (!w.packs.length) { w.err = 'Choose at least one office'; st.wv++; h.redraw(); return } }
    if (w.step === 4) { create(); return }
    w.err = ''
    w.step++
    if (w.step === 3) { load('connect', 'api/connect', true); if (!st.test) testConnect(w.assistant, true) }
    if (w.step === 4) send('api/onboard', Object.assign({ op: 'preview' }, answers())).then((b) => { w.preview = b.result; st.wv++; h.redraw() }, (e) => { w.err = e.message; st.wv++; h.redraw() })
    st.wv++
    h.redraw()
  }
  const answers = () => { const w = st.wiz; return { name: w.name, mission: w.mission, payModel: w.payModel, packs: w.packs, assistants: w.assistant ? [w.assistant] : [], lang: LANG, budget: null } }
  async function create() {
    const w = st.wiz
    w.err = ''
    try {
      const b = await send('api/onboard', answers())
      w.result = b.result
      w.step = 5
    } catch (e) { w.err = e.message }
    st.wv++
    h.redraw()
  }

  // ---------- notifications in this browser
  const notifOn = () => { try { return localStorage.getItem('arsenale-notify') !== 'off' } catch { return true } }
  function setNotif(on) {
    try { localStorage.setItem('arsenale-notify', on ? 'on' : 'off') } catch { /* private window */ }
    if (on && typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission().then(() => bump())
  }
  function notify(title, body, hash) {
    if (!notifOn() || typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    try {
      const n = new Notification(title, { body: String(body || '').slice(0, 160), tag: hash + '|' + title })
      n.onclick = () => { window.focus(); location.hash = hash; n.close() }
    } catch { /* some browsers allow notifications only from a service worker */ }
  }
  /** Called on every redraw: raises a notification for what is new since the
   *  page loaded (never for what was already there). */
  function watch() {
    if (!LIVE) return
    const wait = gates().filter((g) => g.status === 'waiting')
    const tasks = ((st.data.tasksN && st.data.tasksN.tasks) || []).filter((t) => t.status === 'in_review')
    const alerts = (co() && co().activity ? co().activity : []).filter((l) => /^budget\.(alert|hardstop)$/.test(l.action))
    const ids = { g: new Set(wait.map((g) => g.id)), t: new Set(tasks.map((t) => t.id)), b: new Set(alerts.map((a) => a.at + a.entityId)) }
    if (!st.notifSeen) { st.notifSeen = ids; return }
    for (const g of wait) if (!st.notifSeen.g.has(g.id)) notify(T('Your assistant asks you something'), g.question, '#/approvals')
    if (st.data.tasksN && st.notifSeen.tReady) for (const t of tasks) if (!st.notifSeen.t.has(t.id)) notify(T('A task is waiting for you'), t.title, '#/tasks')
    for (const a of alerts) if (!st.notifSeen.b.has(a.at + a.entityId)) notify(T('Budget alert'), a.summary, '#/campus')
    st.notifSeen = Object.assign(ids, { tReady: !!st.data.tasksN })
    if (notifOn() && co()) load('tasksN', 'api/tasks', false, 15000)
  }

  // ---------- the Today strip (campus and office)
  function todayStrip(S) {
    const done = S.today || []
    const ms = done.reduce((n, r) => n + (r.durMs || 0), 0)
    const wait = gates().filter((g) => g.status === 'waiting').length
    const d0 = new Date(); d0.setHours(0, 0, 0, 0)
    const dls = ((st.data.dlv && st.data.dlv.deliverables) || []).filter((d) => Date.parse(d.createdAt) >= d0.getTime()).length
    if (LIVE) load('dlv', 'api/deliverables', false, 30000)
    return '<div class="today" role="status"><b>' + T('Today') + '</b><span>' + T('your team finished ') + fa(done.length) + ' ' + T(done.length === 1 ? 'job' : 'jobs') + (ms ? ' ' + T('in') + ' ' + dur(ms) : '') + '</span>·<button type="button" data-ev="goto" data-arg="dlv">' + fa(dls) + ' ' + T('finished work') + '</button>·<button type="button" data-ev="goto" data-arg="appr">' + fa(wait) + ' ' + T(wait === 1 ? 'question waiting' : 'questions waiting') + '</button></div>'
  }

  // ---------- drawing
  function mainHtml(mode) {
    if (mode === 'tasks') return tasksMain()
    if (mode === 'appr') return apprMain()
    if (mode === 'team') return teamMain()
    if (mode === 'dlv') return dlvMain()
    return setMain()
  }
  function drawerHtml() {
    const d = st.drawer
    if (!d) return ''
    if (d.type === 'member') return profile()
    if (d.type === 'hire') return hireForm()
    if (d.type === 'dlv') return dlvPreview()
    return ''
  }
  /** Redraws a container, keeping what was typed into its fields. */
  function paint(el, html) {
    if (el.__html === html) return
    const typed = {}
    el.querySelectorAll('input[name],textarea[name],select[name]').forEach((i) => { if (i.type !== 'checkbox' && i.type !== 'radio' && !i.readOnly) typed[(i.form && i.form.dataset.evform || '') + '|' + i.name] = i.value })
    const act = document.activeElement && el.contains(document.activeElement) && document.activeElement.name ? { n: (document.activeElement.form && document.activeElement.form.dataset.evform || '') + '|' + document.activeElement.name, a: document.activeElement.selectionStart, b: document.activeElement.selectionEnd } : null
    const scroll = [...el.querySelectorAll('.pb,.wpad')].map((x) => x.scrollTop)
    const top = el.scrollTop
    el.innerHTML = html
    el.__html = html
    el.querySelectorAll('input[name],textarea[name],select[name]').forEach((i) => { const k = (i.form && i.form.dataset.evform || '') + '|' + i.name; if (Object.prototype.hasOwnProperty.call(typed, k) && i.type !== 'checkbox' && i.type !== 'radio' && !i.readOnly && !i.dataset.fixed) i.value = typed[k] })
    el.scrollTop = top
    el.querySelectorAll('.pb,.wpad').forEach((x, i) => { if (scroll[i]) x.scrollTop = scroll[i] })
    if (act) { const i = [...el.querySelectorAll('[name]')].find((x) => (x.form && x.form.dataset.evform || '') + '|' + x.name === act.n); if (i) { i.focus(); try { i.setSelectionRange(act.a, act.b) } catch { /* not a text field */ } } }
  }
  function render(mode, root) {
    if (st.lastMode !== mode) { st.lastMode = mode; if (st.drawer && !(mode === 'team' && (st.drawer.type === 'hire' || st.drawer.type === 'member'))) st.drawer = null; st.dmsg = null; if (mode !== 'tasks') { st.page = null; st.editTask = false } }
    if (!root.querySelector('.ev-main')) root.innerHTML = '<section class="ev-main"></section><aside class="ev-drawer" aria-live="polite"></aside>'
    const main = root.querySelector('.ev-main')
    main.classList.toggle('room', mode === 'team' && !!co() && LIVE)
    paint(main, mainHtml(mode))
    const dr = root.querySelector('.ev-drawer')
    // the side panel is redrawn when it changed, never on a mere poll; fresh
    // data for the open panel redraws it too (st.at: when each set arrived)
    const sig = st.dv + '|' + [st.at.team, st.at.member, st.at.dlv, st.at.policy].join(',') + '|' + (st.drawer ? JSON.stringify(st.drawer) : '') + '|' + (st.drawer && st.drawer.type === 'member' ? (st.data.team ? 'y' : 'n') + (st.data.member ? st.data.member.id + st.data.member.backups.length : '') + statusOf(st.drawer.id) + (DATA.runs || []).length : '') + '|' + (st.drawer && st.drawer.type === 'dlv' ? (st.data.dlv ? 'y' : 'n') : '')
    if (dr.__sig !== sig) { dr.__sig = sig; paint(dr, drawerHtml()) }
  }
  function renderWizard(box) {
    if (!st.wiz) { if (!box.hidden || box.innerHTML) { box.hidden = true; box.innerHTML = ''; box.__sig = ''; box.__html = '' } return }
    box.hidden = false
    const sig = st.wv + '|' + st.dv + '|' + (st.data.onboard ? 'y' : 'n') + '|' + (st.data.connect ? JSON.stringify(st.data.connect.clients) + JSON.stringify(st.test) + JSON.stringify(st.cpv || '') : '') + '|' + JSON.stringify(st.dmsg)
    if (box.__sig === sig) return
    box.__sig = sig
    paint(box, '<div class="wz" role="dialog" aria-modal="true" aria-label="' + T('Set up your company') + '">' + wizHtml() + '</div>')
  }
  /** On first load: no company and no job ever logged opens the wizard; a
   *  wizard left for a language switch comes back where it was. */
  function boot() {
    if (!LIVE || co()) return
    try {
      const saved = JSON.parse(sessionStorage.getItem('arsenale-wiz') || 'null')
      if (saved && saved.step) { sessionStorage.removeItem('arsenale-wiz'); st.wiz = saved; st.wv++; load('onboard', 'api/onboard', true); if (saved.step === 3) load('connect', 'api/connect', true); h.redraw(); return }
    } catch { /* ignore */ }
    getJson('api/onboard').then((d) => { st.data.onboard = d; if (d.wizard && !st.wiz) wizOpen() }, () => { /* an older server: no wizard */ })
  }

  // ---------- actions
  async function act(fn, after) {
    st.dmsg = null
    try { const r = await fn(); if (after) after(r) } catch (e) { st.dmsg = { ok: false, text: T('Not saved: ') + errTxt(e.message) } }
    bump()
  }
  function testConnect(client, quiet) {
    st.test = { client, from: Date.now(), ok: false, failed: false, quiet: !!quiet }
    const t = setInterval(() => {
      if (!st.test || st.test.client !== client) { clearInterval(t); return }
      const c = st.data.connect
      const hit = c && c.clients.some((x) => Date.parse(x.lastHello || x.lastSeen) >= st.test.from - 2000)
      if (hit) { st.test.ok = true; clearInterval(t) } else if (Date.now() - st.test.from > 180000) { st.test.failed = true; clearInterval(t) }
      load('connect', 'api/connect', true)
      bump()
    }, 2000)
  }
  function answerSent(id, b) {
    const i = gates().findIndex((g) => g.id === id)
    if (i >= 0 && b && b.gate) DATA.gates[i] = Object.assign(DATA.gates[i], b.gate)
    st.err['ap|' + id] = ''; st.note = ''
    if (st.page && st.page.type === 'task') load('task', 'api/task?id=' + encodeURIComponent(st.page.id), true)
    bump()
  }
  const openTask = (id) => { st.page = { type: 'task', id }; st.editTask = false; st.dmsg = null; st.drawer = null; load('task', 'api/task?id=' + encodeURIComponent(id), true); load('dlv', 'api/deliverables', false, 10000) }
  // a language switch reloads the page: the wizard keeps what was typed
  document.addEventListener('click', (e) => {
    if (!st.wiz || !e.target.closest('[data-lang]')) return
    const f = document.querySelector('.wz form[data-evform=wiz]')
    if (f && st.wiz.step === 1) { st.wiz.name = String(f.elements.name.value); st.wiz.mission = String(f.elements.mission.value) }
    try { sessionStorage.setItem('arsenale-wiz', JSON.stringify(Object.assign({}, st.wiz, { picked: st.wiz.step > 2 }))) } catch { /* private window: the wizard starts again */ }
  }, true)
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-ev]')
    if (!t) return
    const a = t.dataset.ev, arg = t.dataset.arg || ''
    if (a === 'tview') { st.taskView = arg; try { localStorage.setItem('arsenale-task-view', arg) } catch { /* ignore */ } h.redraw(); return }
    if (a === 'tfilter') { st.taskFilter = arg; h.redraw(); return }
    if (a === 'dkind') { st.dlvKind = arg; h.redraw(); return }
    if (a === 'stab') { st.setTab = arg; st.dmsg = null; h.redraw(); return }
    if (a === 'goto') { location.hash = '#/' + ({ dlv: 'deliverables', appr: 'approvals', tasks: 'tasks' }[arg] || arg); return }
    if (a === 'goto-connect') { st.setTab = 'assistants'; location.hash = '#/settings'; return }
    if (a === 'goto-packs') { st.setTab = 'packs'; location.hash = '#/settings'; return }
    if (a === 'goto-appr') { st.apprSel = arg; location.hash = '#/approvals'; return }
    if (a === 'appr-sel') { st.apprSel = arg; st.note = ''; h.redraw(); return }
    if (a === 'appr-note') { st.note = arg; bump(); return }
    if (a === 'drawer-close') { st.drawer = null; st.dmsg = null; st.hire = null; bump(); return }
    if (a === 'page-close') { st.page = null; st.editTask = false; st.dmsg = null; bump(); return }
    if (a === 'task-new') { st.page = { type: 'new' }; st.drawer = null; st.dmsg = null; bump(); return }
    if (a === 'task-sample') { const s = samplesOf()[Number(arg)]; st.page = { type: 'new', pre: s }; st.dmsg = null; bump(); return }
    if (a === 'task-for') { st.page = { type: 'new', who: arg }; st.drawer = null; st.dmsg = null; location.hash = '#/tasks'; bump(); return }
    if (a === 'task-open') { openTask(arg); if (location.hash !== '#/tasks') location.hash = '#/tasks'; bump(); return }
    if (a === 'task-edit') { st.editTask = !st.editTask; bump(); return }
    if (a === 'task-done' || a === 'task-reopen') { act(() => send('api/task', { op: 'update', id: arg, status: a === 'task-done' ? 'done' : 'todo' }), () => { load('task', 'api/task?id=' + encodeURIComponent(arg), true); load('tasks', 'api/tasks', true) }); return }
    if (a === 'task-copy') { copy(T('Please check Arsenale for task ') + arg + T(' and start it.')); return }
    if (a === 'copy') { copy(arg); return }
    if (a === 'copy-hello') { copy(T('Say hello to Arsenale')); return }
    if (a === 'team-office') { st.teamOffice = arg; st.drawer = null; bump(); return }
    // from the org chart: the profile opens on the Team screen, in the member's office
    if (a === 'member-open' && t.dataset.toTeam) { const e = emp(arg); if (e && e.homeOfficeId) st.teamOffice = e.homeOfficeId; location.hash = '#/team' }
    if (a === 'member-open') { st.drawer = { type: 'member', id: arg }; st.profOpen = ''; st.dmsg = null; st.data.member = null; load('policy', 'api/policy', false, 30000); bump(); return }
    // the preview opens beside the screen it was asked from (Finished work, or a task)
    if (a === 'dlv-open') { st.drawer = { type: 'dlv', id: arg }; st.dmsg = null; load('dlv', 'api/deliverables', false, 10000); bump(); return }
    if (a === 'hire-new') { st.hire = { op: 'hire', officeId: st.teamOffice && st.teamOffice !== 'unassigned' ? st.teamOffice : (offices()[0] || {}).id, tier: 'standard', skills: [], look: 0 }; st.drawer = { type: 'hire' }; st.dmsg = null; bump(); return }
    if (a === 'hire-back') { st.hire.preview = ''; st.dmsg = null; bump(); return }
    if (a === 'hire-tpl') {
      const f = t.closest('.ev-drawer') && document.getElementById('hform')
      if (f) readHire(f)
      const i = Number(arg)
      st.hire.tpl = i
      if (i >= 0) { const x = TEMPLATES[i]; st.hire.title = T(x[1]); st.hire.instructions = T(x[2]); st.hire.skills = T(x[3]).split(',') }
      bump(); return
    }
    if (a === 'skill-del') { const f = document.getElementById('hform'); if (f) readHire(f); st.hire.skills.splice(Number(arg), 1); bump(); return }
    if (a === 'member-edit') {
      const m = st.data.team.members.find((x) => x.id === arg), mm = st.data.member
      const body = mm && mm.id === arg ? mm.body : ''
      const sec = /## How to do this job\s*\n([\s\S]*?)\n## Safety/.exec(body)
      const def = (DATA.agents || []).find((x) => x.name === arg) || {}
      st.hire = { op: 'edit', id: arg, name: m.name || m.title || arg, title: m.title, officeId: m.homeOfficeId, description: String(def.descriptionEn || '').replace(/^"|"$/g, ''), instructions: sec ? sec[1].trim() : body.trim(), tier: m.tier || 'standard', managed: mm && mm.managed, skills: (m.skills || []).slice(), look: m.look || 0 }
      if (!mm || mm.id !== arg) load('member', 'api/member?id=' + encodeURIComponent(arg), true)
      st.drawer = { type: 'hire' }; st.dmsg = null; bump(); return
    }
    if (a === 'hire-edit') {
      const g = gates().find((x) => x.id === arg)
      if (!g) return
      const p = g.payload || {}
      st.hire = { op: 'hire', fromGate: g.id, id: p.id, name: p.name, title: p.title, officeId: p.officeId, description: p.description, instructions: p.instructions, tier: p.tier || 'standard', skills: [], look: 0 }
      st.teamOffice = p.officeId || st.teamOffice
      location.hash = '#/team'
      st.drawer = { type: 'hire' }; bump(); return
    }
    if (a === 'hire-yes' || a === 'hire-no') {
      if (!arm('ap|' + arg + '|' + (a === 'hire-yes' ? 'hire' : 'decline'))) return
      send('api/hire-decision', { gate: arg, decision: a === 'hire-yes' ? 'hire' : 'decline' }).then(() => { st.err['ap|' + arg] = ''; h.refresh(); bump() }, (err) => { st.err['ap|' + arg] = err.message; bump() })
      return
    }
    if (a === 'ans' || a === 'dis') {
      const key = 'ap|' + arg + '|' + (a === 'dis' ? 'dis' : t.dataset.val)
      if (!arm(key)) return
      ;(a === 'ans' ? send('api/answer', { gate: arg, answer: t.dataset.val }) : send('api/dismiss', { gate: arg })).then((b) => answerSent(arg, b), (err) => { st.err['ap|' + arg] = err.message; bump() })
      return
    }
    if (a === 'retire') { if (!arm('retire|' + arg)) return; act(() => send('api/team-member', { op: 'retire', id: arg }), () => { st.dmsg = { ok: true, text: T('Retired. Their history stays.') }; load('team', 'api/team', true) }); return }
    if (a === 'unretire') { act(() => send('api/team-member', { op: 'unretire', id: arg }), () => load('team', 'api/team', true)); return }
    if (a === 'restore') { const [id, b] = arg.split('|'); if (!arm('restore|' + b)) return; act(() => send('api/team-member', { op: 'restore', id, backup: b }), () => { st.dmsg = { ok: true, text: T('Restored. The version before is kept too.') }; st.data.member = null }); return }
    if (a === 'pol') {
      const [member, category, value] = arg.split('|')
      act(() => send('api/policy', member ? { scope: 'member', id: member, category, value: value || null } : { category, value }), () => { load('team', 'api/team', true); load('policy', 'api/policy', true) })
      return
    }
    if (a === 'pack-open') { st.openPack = st.openPack === arg ? '' : arg; st.conflict = null; st.packMsg = null; bump(); return }
    if (a === 'pack') {
      const [op, id] = arg.split('|')
      if (op === 'remove' && !arm('pack|remove|' + id)) return
      const body = op === 'remove' ? { op: 'remove', id } : op === 'update' ? { op: 'update', id } : { op: 'install', id, onConflict: op === 'install-keep' ? 'keep' : op === 'install-rename' ? 'rename' : undefined }
      st.conflict = null; st.packMsg = null
      send('api/pack', body).then((b) => {
        const r = b.result
        st.packMsg = { id, ok: true, text: op === 'remove' ? T('Removed.') + (r.kept.length ? ' ' + T('Kept because you changed them: ') + r.kept.join(', ') : '') : op === 'update' ? T('Updated.') : T('Installed: ') + r.files.join(', ') + (r.kept.length ? ' · ' + T('kept yours: ') + r.kept.join(', ') : '') }
        load('packs', 'api/packs', true); load('team', 'api/team', true); h.refresh()
      }, (err) => { if (/already exist/.test(err.message)) st.conflict = { id, msg: err.message }; else st.packMsg = { id, ok: false, text: errTxt(err.message) }; bump() })
      return
    }
    if (a === 'pack-cancel') { st.conflict = null; bump(); return }
    if (a === 'copen') { st.openCard = st.openCard === arg ? '' : arg; st.cpv = null; bump(); return }
    if (a === 'cpreview') { st.cpv = null; act(() => send('api/connect-preview', { client: arg }), (b) => { st.cpv = b.result; if (b.result && b.result.unchanged) st.added = arg }); return }
    if (a === 'ccancel') { st.cpv = null; bump(); return }
    if (a === 'capply') { act(() => send('api/connect-apply', { client: arg, hash: st.cpv.hash }), (b) => { st.cpv = null; st.added = arg; st.dmsg = { ok: true, text: T('Written. Backup: ') + (b.result.backup || T('none (new file)')) + '. ' + T('Restart your assistant, then say hello.') }; if (!st.test || st.test.client !== arg) testConnect(arg) }); return }
    if (a === 'ctest') { testConnect(arg); bump(); return }
    if (a === 'forget') { if (!arm('forget|' + arg)) return; act(() => send('api/mcp-forget', { id: arg }), () => load('connect', 'api/connect', true)); return }
    if (a === 'mktoken') { const b = new Uint8Array(32); crypto.getRandomValues(b); st.token = [...b].map((x) => x.toString(16).padStart(2, '0')).join(''); bump(); return }
    if (a === 'notif-perm') { if (typeof Notification !== 'undefined') Notification.requestPermission().then(() => bump()); return }
    if (a === 'nchan') { st.channel = arg; st.dmsg = null; bump(); return }
    if (a === 'nf') {
      const [op, channel] = arg.split('|')
      if (op === 'signout' && !arm('nf|signout')) return
      act(() => send('api/notify', { op, channel }), (b) => { st.data.notify = b.result; st.dmsg = { ok: true, text: op === 'test' ? T('Test sent. Check that it arrived on your phone.') : T('Saved.') } })
      return
    }
    if (a === 'wiz-open') { wizOpen(); return }
    if (a === 'wiz-close') { st.wiz = null; st.test = null; h.redraw(); return }
    if (a === 'wiz-back') { st.wiz.step--; st.wiz.err = ''; st.wv++; h.redraw(); return }
    if (a === 'wiz-asst') { st.wiz.assistant = arg; st.cpv = null; testConnect(arg, true); st.wv++; h.redraw(); return }
    if (a === 'wiz-skip') { st.wiz.step = 4; st.wv++; send('api/onboard', Object.assign({ op: 'preview' }, answers())).then((b) => { st.wiz.preview = b.result; st.wv++; h.redraw() }, (e2) => { st.wiz.err = e2.message; st.wv++; h.redraw() }); h.redraw(); return }
    if (a === 'wiz-done') { st.wiz = null; location.hash = '#/campus'; location.reload(); return }
    if (a === 'wiz-first') {
      const s = st.wiz.result && st.wiz.result.sampleTask
      st.wiz = null
      try { sessionStorage.setItem('arsenale-first-task', JSON.stringify(s || {})) } catch { /* ignore */ }
      location.hash = '#/tasks'
      location.reload()
    }
  })
  document.addEventListener('toggle', (e) => {
    const d = e.target
    if (d && d.dataset && d.dataset.evToggle) st.profOpen = d.open ? d.dataset.evToggle : st.profOpen === d.dataset.evToggle ? '' : st.profOpen
  }, true)
  document.addEventListener('input', (e) => {
    const t = e.target.closest('[data-ev-input]')
    if (t && t.dataset.evInput === 'dq') { st.dlvQ = t.value; h.redraw() }
  })
  document.addEventListener('keydown', (e) => {
    const t = e.target.closest && e.target.closest('[data-ev-enter]')
    if (t && e.key === 'Enter') { e.preventDefault(); const f = document.getElementById('hform'); if (f) readHire(f); bump() }
  })
  document.addEventListener('change', (e) => {
    const t = e.target.closest('[data-ev-change]')
    if (!t) return
    const a = t.dataset.evChange
    if (a === 'toffice') { st.taskOffice = t.value; h.redraw() }
    if (a === 'notif') { setNotif(t.checked); bump() }
    if (a === 'wpack') { const f = t.closest('form'); st.wiz.packs = [...f.elements].filter((x) => x.name === 'pack' && x.checked).map((x) => x.value); st.wiz.err = ''; st.wv++; h.redraw() }
    if (a === 'phone') act(() => send('api/policy', { category: t.dataset.arg, phoneAllowed: t.checked }), () => load('policy', 'api/policy', true))
    if (a === 'nfdetails') act(() => send('api/notify', { op: 'details', channel: t.dataset.arg, on: t.checked }), (b) => { st.data.notify = b.result })
    if (a === 'nfon') act(() => send('api/notify', { op: t.checked ? 'enable' : 'disable', channel: t.dataset.arg }), (b) => { st.data.notify = b.result })
  })
  document.addEventListener('submit', (e) => {
    const f = e.target.closest('[data-evform]')
    if (!f) return
    e.preventDefault()
    const a = f.dataset.evform
    const el = f.elements
    if (a === 'task-new') {
      const pick = [...el].find((x) => x.name === 'who' && x.checked)
      const who = pick ? String(pick.value) : ''
      const body = { title: el.title.value, description: el.description.value, dueDate: el.dueDate.value, links: linksOf(el), needsSignOff: el.needsSignOff.checked }
      if (who.indexOf('office:') === 0) body.assigneeOfficeId = who.slice(7); else if (who) body.assignee = who
      act(() => send('api/task', body), (b) => { openTask(b.result.id); st.data.task = null; load('tasks', 'api/tasks', true) })
    } else if (a === 'task-edit') {
      const who = String(el.who.value || '')
      const body = { op: 'update', id: f.dataset.id, title: el.title.value, description: el.description.value, dueDate: el.dueDate.value, status: el.status.value, needsSignOff: el.needsSignOff.checked }
      if (who.indexOf('office:') === 0) body.assigneeOfficeId = who.slice(7); else body.assignee = who
      act(() => send('api/task', body), () => { st.editTask = false; load('task', 'api/task?id=' + encodeURIComponent(f.dataset.id), true); load('tasks', 'api/tasks', true) })
    } else if (a === 'task-comment') {
      const text = String(el.text.value || '').trim()
      if (!text) return
      act(() => send('api/task-comment', { id: f.dataset.id, text }), () => { el.text.value = ''; load('task', 'api/task?id=' + encodeURIComponent(f.dataset.id), true) })
    } else if (a === 'ans') {
      const v = String(el.a.value || '').trim()
      // on an approval the box asks for a change: the answer says plainly it is not a yes
      if (v) send('api/answer', { gate: f.dataset.id, answer: f.dataset.note ? T('Not yet: ') + v : v }).then((b) => answerSent(f.dataset.id, b), (err) => { st.err['ap|' + f.dataset.id] = err.message; bump() })
    } else if (a === 'hire') {
      readHire(f)
      const hf = st.hire
      if (hf.preview) {
        const go = hf.fromGate ? send('api/hire-decision', { gate: hf.fromGate, decision: 'hire', edits: hireBody() }) : send('api/team-member', hireBody())
        act(() => go, () => { st.drawer = { type: 'member', id: hf.id }; st.hire = null; st.dmsg = { ok: true, text: T('Saved. Your assistant sees the change in its next conversation. Claude Code: restart the session.') }; load('team', 'api/team', true); h.refresh() })
        return
      }
      hf.err = { title: !String(hf.title || '').trim(), instructions: Array.from(String(hf.instructions || '').trim()).length < 10 && Array.from(String(hf.description || '').trim()).length < 10 }
      if (hf.err.title || hf.err.instructions) { bump(); return }
      hf.err = null
      send('api/team-member', Object.assign(hireBody(), { op: 'preview', id: hf.id || 'member-1' })).then((b) => { hf.preview = b.result.text; st.dmsg = null; bump() }, (err) => { st.dmsg = { ok: false, text: errTxt(err.message) }; bump() })
    } else if (a === 'ntfy') {
      act(() => send('api/notify', { op: 'setup', channel: 'ntfy', server: el.server.value }), (b) => { st.data.notify = b.result; st.dmsg = { ok: true, text: T('Set up. Subscribe to the topic in the ntfy app on your phone, then send a test.') } })
    } else if (a === 'expiry') {
      act(() => send('api/notify', { op: 'expiry', minutes: Number(el.minutes.value) }), (b) => { st.data.notify = b.result; st.dmsg = { ok: true, text: T('Saved.') } })
    } else if (a === 'wiz') wizStep(f)
  })
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    if (st.wiz && st.wiz.step < 5) { st.wiz = null; st.test = null; h.redraw() } else if (st.drawer) { st.drawer = null; st.hire = null; bump() } else if (st.page) { st.page = null; st.editTask = false; bump() }
  })
  // the wizard's "Give your first task" lands here after the reload
  try {
    const first = sessionStorage.getItem('arsenale-first-task')
    if (first) { sessionStorage.removeItem('arsenale-first-task'); const s = JSON.parse(first); st.page = { type: 'new', pre: s && s.title ? s : undefined } }
  } catch { /* ignore */ }

  return { MODES, render, renderWizard, todayStrip, watch, boot, wizOpen, st }
}

module.exports = { EVERYONE_STYLE, everyoneViews }
