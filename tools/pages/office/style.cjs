const OFFICE_STYLE = `
:root{
  --font-ui: Arial, "Helvetica Neue", Helvetica, sans-serif;
  --ink: #1F2A36; --ink-soft: #4A5663; --ink-dim: #66727F;
  --ground: #F3F5F7; --panel: #FFFFFF; --panel-raised: #F6F8FA; --line: #D9DFE5;
  --accent: #0C8A62; --accent-soft: rgba(12,138,98,0.1); --accent-line: rgba(12,138,98,0.3);
  --cyan: #1F7A8C;
  --ok: #0C8A62; --ok-bg: rgba(12,138,98,0.1); --warn: #B8720F; --warn-ink: #9A5F08; --warn-bg: rgba(217,140,30,0.12);
  --bad: #C8372D; --bad-bg: rgba(200,55,45,0.12); --idle: #66727F; --idle-bg: rgba(106,118,131,0.12);
}
*{box-sizing:border-box}
html,body{height:100%}
body{margin:0;background:var(--ground);color:var(--ink);font:13px/1.6 var(--font-ui);overflow:hidden}
.board{position:fixed;inset:0;min-width:980px;min-height:620px;overflow:hidden;--iw:380px;--dh:132px}
.top{position:absolute;inset:0 0 auto 0;height:52px;display:flex;align-items:center;gap:18px;padding:0 20px;background:var(--panel);border-bottom:1px solid var(--line)}
h1{font-size:17px;margin:0;font-weight:700}
.date{color:var(--ink-dim);font-size:12.5px;white-space:nowrap}
.counts{display:flex;gap:16px;list-style:none;margin:0 auto 0 0;padding:0;font-size:12.5px;color:var(--ink-soft);white-space:nowrap}
.counts b{font:700 15px var(--font-ui);color:var(--ink);margin-left:3px}
.acc{color:var(--accent)!important}.warn{color:var(--warn-ink)!important}.bad{color:var(--bad)!important}
.live{font-size:12px;color:var(--ink-dim);display:flex;align-items:center;gap:6px;white-space:nowrap}
.helpl{width:20px;height:20px;border:1px solid var(--line,#c9d0d9);border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:var(--ink-dim);text-decoration:none}.helpl:hover{color:var(--accent)}
.live i{width:7px;height:7px;background:var(--accent);display:inline-block;animation:pulse 2s ease-in-out infinite}
.live.stale{color:var(--bad)}.live.stale i{background:var(--bad);animation:none}
.arch{font-size:12px;color:var(--ink-soft);text-decoration:none;border:1px solid var(--line);border-radius:3px;padding:2px 8px;background:var(--panel-raised);white-space:nowrap}
.arch:hover{color:var(--ink)}
.g{font-family:var(--font-ui);font-weight:700;display:inline-block;min-width:1em;text-align:center}
.g-ok{color:var(--ok)}.g-findings{color:var(--warn)}.g-failed{color:var(--bad)}.g-stopped{color:var(--idle)}.g-running{color:var(--accent)}
.dim{color:var(--ink-dim);font-weight:400}.muted{color:var(--ink-dim);font-size:12.5px;margin:4px 0 10px}

/* inspector */
.insp{position:absolute;left:0;top:52px;bottom:0;width:var(--iw);background:var(--panel);border-right:1px solid var(--line);padding:16px 18px;overflow-y:auto}
.who{display:flex;gap:12px;align-items:center}
.portrait{background:var(--panel-raised);border:1px solid var(--line);flex:none}
.ih{font:700 16px var(--font-ui);margin:0;text-align:start}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0 8px}
.chip{font:12px/1 var(--font-ui);padding:5px 8px;border:1px solid var(--line);border-radius:4px;color:var(--ink-soft);background:var(--panel-raised)}
.chip.mdl,.mdl{font-family:var(--font-ui)}
.st-running{color:var(--accent);border-color:var(--accent-line);background:var(--accent-soft)}
.st-failed{color:var(--bad);border-color:rgba(200,55,45,.35);background:var(--bad-bg)}
.st-ok{color:var(--ok)}.st-findings{color:var(--warn);background:var(--warn-bg)}.st-stopped{color:var(--idle)}
.heavy{color:#2F7F8A}.std{color:var(--ink-soft)}
.kv{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:6px 0 4px;padding:0}
.kv div{background:var(--panel-raised);border:1px solid var(--line);border-radius:4px;padding:5px 8px;min-width:0}
.kv dt{font-size:11px;color:var(--ink-dim)}.kv dd{margin:0;font:700 13px var(--font-ui);white-space:nowrap}
.sect{font-size:11.5px;font-weight:700;color:var(--accent);margin:14px 0 5px;letter-spacing:.02em}
.task{margin:0;font-size:13px;color:var(--ink);white-space:pre-wrap;overflow-wrap:anywhere}
.rel{margin:6px 0 0;font-size:12.5px;color:var(--ink-soft)}.rel b{font-family:var(--font-ui);color:var(--ink)}
.rel button{font:inherit;background:none;border:0;padding:0;color:inherit;cursor:pointer;text-decoration:underline dotted}
.term{list-style:none;margin:0;padding:8px 10px;background:var(--ground);border:1px solid var(--line);border-radius:4px;max-height:300px;overflow-y:auto;font-size:12px}
.term li{display:grid;grid-template-columns:40px 1fr;gap:8px;padding:2px 0;color:var(--ink-soft)}
.term time{font-family:var(--font-ui);color:var(--ink-dim)}
.term span{overflow-wrap:anywhere}
.term li.now span{color:var(--accent)}
.term li.now span::after{content:"";display:inline-block;width:7px;height:13px;background:var(--accent);margin-right:4px;vertical-align:-2px;animation:blink 1.1s step-end infinite}
.nolog{color:var(--ink-dim);font-size:12.5px;padding:10px}
.nolog p{margin:0 0 4px}.nolog code{font-family:var(--font-ui);color:var(--ink)}
ul.finds{margin:6px 0 0;padding:0 16px 0 0;font-size:12.5px;color:var(--ink-soft)}
.files{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px}
.file{font:11px var(--font-ui);padding:1px 6px;border:1px solid var(--line);border-radius:3px;color:var(--cyan);background:var(--panel-raised);direction:ltr}
.twins{margin:8px 0 0;display:flex;gap:4px;flex-wrap:wrap}
.twins button{font:11.5px var(--font-ui);color:var(--ink-soft);background:var(--panel-raised);border:1px solid var(--line);border-radius:3px;padding:1px 7px;cursor:pointer}
.twins button.on{color:var(--accent);border-color:var(--accent-line)}
.insp .slip{width:auto;margin-top:6px;cursor:default}.insp .slip p{margin:4px 0 0;color:var(--ink-soft)}

/* splitters: the panel and the drawer are resized by dragging the lines
   between them and the office; the sizes live in --iw and --dh on .board */
.split{position:absolute;z-index:8;touch-action:none}
.split::before{content:"";position:absolute;background:transparent;transition:background .15s}
.split::after{content:"";position:absolute;background:#C3CCD5;border-radius:2px;transition:background .15s}
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
.stage{position:absolute;left:var(--iw);right:0;top:52px;bottom:var(--dh);overflow:hidden;background:radial-gradient(ellipse at 50% 55%,#F7F8FA 0%,#F3F5F7 70%);cursor:grab;touch-action:none;outline:none}
.stage:focus-visible{box-shadow:inset 0 0 0 3px #2563EB}
.stage.panning,.stage.panning *{cursor:grabbing!important}
.stage.panning .stage-in{pointer-events:none}
.stage-in{position:absolute;left:0;top:0;width:1060px;height:716px;transform-origin:0 0;will-change:transform}
.stage-in.ease{transition:transform .2s ease-out}
.iso{position:absolute;inset:0}
.zoombar{position:absolute;left:12px;top:10px;z-index:3;display:flex;gap:3px;align-items:center;background:rgba(255,255,255,.94);border:1px solid var(--line);border-radius:3px;padding:3px;direction:ltr;cursor:default}
.zoombar button{font:14px/1 var(--font-ui);color:var(--ink-soft);background:var(--panel-raised);border:1px solid var(--line);border-radius:2px;min-width:26px;height:24px;cursor:pointer;padding:0 6px}
.zoombar button:hover{color:var(--ink);border-color:#C3CCD5}
.zoombar .fitb{font:12px var(--font-ui)}
.zoombar output{font:11.5px var(--font-ui);color:var(--ink);min-width:44px;text-align:center}
.zoombar .zh{font:11px var(--font-ui);color:var(--ink-dim);padding:0 6px 0 4px;white-space:nowrap}
.hl{animation:tapL .36s steps(1) infinite}.hr{animation:tapR .36s steps(1) infinite}
.glow{animation:glow 2.6s ease-in-out infinite}
.bob{animation:bob 3.8s ease-in-out infinite}
.breathe{transform-box:fill-box;transform-origin:50% 100%;animation:breathe 4.4s ease-in-out infinite}
.appear{animation:appear .45s ease-out both}
.walker{position:absolute;left:0;top:0;offset-anchor:50% 100%;offset-rotate:0deg;z-index:1;pointer-events:none;animation:walkpath 3s linear both}
.walker .lf1{animation:legA .44s steps(1) infinite}.walker .lf2{animation:legB .44s steps(1) infinite}
.walker .wb{animation:wbob .44s steps(1) infinite}
.fly{position:absolute;left:0;top:0;width:14px;height:10px;background:#F4F1EA;border:1.5px solid #1D2530;offset-rotate:0deg;pointer-events:none;z-index:3;animation:fly .9s cubic-bezier(.3,.1,.4,1) both}
.bub{position:absolute;transform:translate(calc(-50% + var(--dx)),-100%) scale(var(--bs,1));transform-origin:50% 100%;width:232px;text-align:start;background:#F4F1EA;color:#1D2530;border:2px solid #1D2530;border-radius:3px;padding:5px 8px 6px;font:12px/1.55 var(--font-ui);cursor:pointer;box-shadow:3px 3px 0 rgba(30,40,50,.16);z-index:2}
.bub::after{content:"";position:absolute;bottom:-9px;left:calc(50% - var(--dx) / var(--bs,1) - 6px);border:6px solid transparent;border-top:7px solid #1D2530;border-bottom:0}
.bh{display:flex;gap:5px;align-items:baseline;direction:ltr;font:11px var(--font-ui);margin-bottom:2px;white-space:nowrap}
.bh b{font-size:11px;overflow:hidden;text-overflow:ellipsis}
.bh .mdl{font-style:normal;padding:0 4px;border:1px solid #9AA3AD;border-radius:2px;font-size:10px;color:#39414C}
.bh .mdl.heavy{background:#DDEEF0;border-color:#3F8F99;color:#1F5A62}
.bh .el{margin-left:auto;color:#1C6B50;font-weight:700}
.bh .n2{font-size:10px;color:#39414C}
.bt{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.bub.sel{outline:3px solid var(--accent);outline-offset:1px;z-index:4}
.bub.stale{border-style:dashed;border-color:#8A5A12;background:#F6EAD2}
.bub.stale::after{border-top-color:#8A5A12}
.quiet{display:block;color:#7A4A06;font-weight:700;font-size:11.5px}
/* crowded: a bubble that would cover another shrinks to its name tag and
   opens again on hover, keyboard focus or selection */
.bub.mini{width:auto;padding:2px 6px;box-shadow:2px 2px 0 rgba(30,40,50,.16);z-index:1}
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
.tag{position:absolute;transform:translate(-50%,-100%) scale(var(--bs,1));transform-origin:50% 100%;font:10.5px/1 var(--font-ui);color:#1F2A36;background:rgba(255,255,255,.94);border:1px solid #C3CCD5;border-radius:2px;padding:3px 5px;white-space:nowrap;cursor:pointer;display:flex;gap:4px;align-items:center;direction:ltr;z-index:1}
.tag::after{content:"";position:absolute;left:50%;top:100%;width:1px;height:calc(var(--lead,0px) / var(--bs,1));background:#C3CCD5}
.tag.sel{outline:2px solid var(--accent);outline-offset:1px}
.tag.mini b{display:none}
.tag.mini:hover,.tag.mini:focus-visible{z-index:5}
.tag.mini:hover b,.tag.mini:focus-visible b{display:inline}
.tag.boss{font-family:var(--font-ui);font-size:11.5px;background:#F1ECF9;border-color:#AEB8C2;cursor:default}
.tag.more{cursor:default;color:var(--ink-dim);font-family:var(--font-ui)}
.tray-label{position:absolute;transform:translateY(-100%) scale(var(--bs,1));transform-origin:0 100%;font:11.5px var(--font-ui);color:#1D2530;background:#F4F1EA;border:1px solid #1D2530;padding:1px 6px;white-space:nowrap;cursor:pointer;z-index:1}
.tray-label.land{animation:land .7s ease-out both}
.deleg{position:absolute;transform:translate(-50%,0) scale(var(--bs,1));transform-origin:50% 0;font:11px var(--font-ui);color:#F4F1EA;background:#2B6CB0;padding:1px 6px;border-radius:2px;white-space:nowrap;z-index:1}
.runner{position:absolute;left:0;top:0;width:13px;height:10px;background:#F4F1EA;border:1.5px solid #2B6CB0;box-shadow:0 0 0 3px rgba(111,168,232,.35);offset-rotate:0deg;animation:walk 2.8s ease-in-out infinite;z-index:1}
.runner::after{content:"";position:absolute;left:2px;right:2px;top:3px;height:1px;background:#6FA8E8}
.flow{animation:flow 1s linear infinite}
.legend{position:absolute;right:14px;bottom:8px;margin:0;display:flex;gap:12px;font-size:11.5px;color:var(--ink-soft);background:rgba(255,255,255,.94);padding:4px 10px;border:1px solid var(--line);border-radius:3px;z-index:3}

/* drawer: today's slips; opened, today's shift board */
.drawer{position:absolute;left:var(--iw);right:0;bottom:0;height:var(--dh);background:var(--panel);border-top:1px solid var(--line);padding:8px 16px;z-index:6;overflow:hidden;display:flex;flex-direction:column}
.dr-top{display:flex;align-items:center;gap:12px;flex:none}
.dr-top h2{font-size:13px;margin:0;white-space:nowrap}
.filters{display:flex;gap:4px}
.f,.more-btn{font:12px var(--font-ui);color:var(--ink-soft);background:var(--panel-raised);border:1px solid var(--line);border-radius:3px;padding:2px 8px;cursor:pointer;white-space:nowrap}
.f.on{color:var(--accent);border-color:var(--accent-line)}
.more-btn{margin-inline-start:auto}
/* the strip's cards: a wrapping grid anchored to the top, not a one-row rail.
   Height comes from the drawer's --dh via flex:1, so dragging the splitter
   taller reveals more rows instead of leaving empty space beneath one row. */
.slips{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-wrap:wrap;align-content:flex-start;gap:8px;flex:1;min-height:0;overflow-x:hidden;overflow-y:auto}@supports not selector(::-webkit-scrollbar){.slips{scrollbar-width:thin}}
.slip{flex:none;width:176px;text-align:start;background:var(--panel-raised);border:1px solid var(--line);border-top:3px solid var(--idle);border-radius:3px;padding:5px 8px;color:var(--ink);font:12px/1.45 var(--font-ui);cursor:pointer;display:block}
.slip.g-ok{border-top-color:var(--ok)}.slip.g-findings{border-top-color:var(--warn)}.slip.g-failed{border-top-color:var(--bad)}
.slip.on{outline:2px solid var(--accent);outline-offset:-1px}
.slip .st{display:block;font-size:11px;color:var(--ink-soft)}
.sl1{display:flex;justify-content:space-between;direction:ltr;font:11.5px var(--font-ui);gap:6px}
.sl1 b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sl1 time{color:var(--ink-dim)}
.sl2{display:block;color:var(--ink-dim);font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pad{padding:14px 0;margin:0}

/* shift board (inside the open drawer) */
.sb{position:relative;flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;margin:8px -16px -8px;border-top:1px solid var(--line)}
.sb-in{position:relative}
.sb-heads{list-style:none;margin:0;padding:0;position:absolute;right:0;top:0;width:210px;height:100%;background:var(--panel);border-left:1px solid var(--line)}
.sb-heads li{position:absolute;right:0;width:210px;height:42px}
.sb-hd{display:flex;align-items:center;gap:8px;width:100%;height:100%;background:none;border:0;border-bottom:1px solid #E6EAEE;color:var(--ink);padding:0 10px;text-align:start;cursor:pointer;font:12px/1.3 var(--font-ui)}
.sb-hd.on{background:var(--accent-soft);box-shadow:inset -3px 0 0 var(--accent)}
.sb-hd.kid{padding-inline-start:22px}
.sb-hd .portrait{background:#F1F4F7;border-color:#D9DFE5;display:block}
.sb-nm{flex:1;min-width:0;display:flex;flex-direction:column}.sb-nm b{font:700 12px var(--font-ui);text-align:start;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sb-nm>span{color:var(--ink-dim);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-now{font:700 12px var(--font-ui);white-space:nowrap}
.sb-now.st-running,.sb-now.st-ok,.sb-now.st-findings,.sb-now.st-failed,.sb-now.st-stopped{background:none;border:0}
.sb-heads .boss{display:flex;align-items:center;gap:8px;padding:0 10px;height:46px;background:#F6F8FA;border-bottom:1px solid var(--line)}
.sb-heads .boss b{font-size:12.5px}
.sb-heads .absent{padding:4px 12px;font-size:11px;color:var(--ink-dim);height:auto;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-al{font:10.5px var(--font-ui)}
.sb-tl{position:absolute;left:0;top:0}
.sb-tl svg{position:absolute;inset:0}
.sb-tick{position:absolute;top:14px;transform:translateX(-50%);font:11px var(--font-ui);color:var(--ink-dim)}
.sb-nowlab{position:absolute;top:14px;transform:translateX(-50%);font-size:11px;color:#F3F5F7;background:var(--accent);padding:0 6px;border-radius:2px;white-space:nowrap;z-index:2}
.sb-bar{position:absolute;height:18px;border:1px solid;border-radius:2px;padding:0 4px;display:flex;align-items:center;gap:4px;overflow:hidden;cursor:pointer;font:11px/1 var(--font-ui);color:var(--ink)}
.sb-bar .g{flex:none;font-size:11px;order:2;margin-inline-start:auto}
.sb-bl{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--ink-soft)}
.b-ok{background:rgba(12,138,98,.12);border-color:rgba(12,138,98,.45)}.b-ok .g{color:var(--ok)}
.b-findings{background:var(--warn-bg);border-color:rgba(217,140,30,.55)}.b-findings .g{color:var(--warn)}
.b-failed{background:var(--bad-bg);border-color:rgba(200,55,45,.6)}.b-failed .g{color:var(--bad)}
.b-stopped{background:var(--idle-bg);border-color:#C3CCD5}.b-stopped .g{color:var(--idle)}
.sb-bar.on{outline:2px solid #2563EB;outline-offset:1px}
.b-run{background:linear-gradient(90deg,rgba(12,138,98,.55),rgba(12,138,98,.22) 30%);border-color:var(--accent);padding:0}
.b-run.stale{background:rgba(12,138,98,.18)}
.sb-hatch{position:absolute;top:0;bottom:0;background:repeating-linear-gradient(-45deg,rgba(217,140,30,.55) 0 3px,transparent 3px 7px);border-left:2px solid var(--warn)}
.sb-stp{position:absolute;top:3px;width:2px;height:10px;background:#0C8A62;opacity:.8}
.sb-bar:not(.b-run) .sb-stp{background:var(--ink-soft);opacity:.6}
.sb-say{position:absolute;height:36px;background:#F4F1EA;color:#1D2530;border:1.5px solid #1D2530;border-radius:3px;padding:2px 7px;font:11.5px/1.45 var(--font-ui);display:flex;flex-direction:column;justify-content:center;cursor:pointer;text-align:start}
.sb-say::after{content:"";position:absolute;left:100%;top:12px;border:6px solid transparent;border-left:7px solid #1D2530;border-right:0}
.sb-say span{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.sb-say.stale{background:#F6EAD2;border-style:dashed;border-color:#8A5A12}.sb-say.stale span{-webkit-line-clamp:1}.sb-say.stale b{color:#7A4A06;font-size:11px}
.sb-slip{position:absolute;transform:translateX(-50%);height:16px;min-width:14px;padding:0 3px;border:1px solid #9AA3AD;background:#E9E4D8;color:#1D2530;font:700 10px/14px var(--font-ui);border-radius:1px;cursor:pointer;display:flex;gap:3px;white-space:nowrap}
.sb-slip.s-ok .g{color:#11734F}.sb-slip.s-findings .g{color:#8A5A12}.sb-slip.s-failed .g{color:#A12A24}.sb-slip.s-failed{background:#F9E1DF}.sb-slip.s-stopped .g{color:#4A5563}
.sb-slip.fresh{border-color:#1D2530;box-shadow:0 0 0 2px var(--accent)}
.sb-slip.on{outline:2px solid #2563EB}
.sb-nw{font:700 10px/14px var(--font-ui)}
.sb-empty{position:absolute;color:var(--ink-dim);margin:0}

button:focus-visible,a:focus-visible{outline:3px solid #2563EB;outline-offset:2px}
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
@keyframes news{0%{scale:1}30%{scale:1.07;box-shadow:0 0 0 4px var(--accent),3px 3px 0 rgba(30,40,50,.16)}100%{scale:1}}
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
:root{--gate:#B8720F;--gate-line:rgba(217,140,30,.45);--measured:#1F7A8C;--who-user:#2563EB;--who-sup:#6B55B0;--who-agent:#1F7A8C;--heavy:#3F8F99;--other:#5A7A99}
.board{--rw:320px}
@media (max-width:1399px){.board{--rw:56px}}
.v-office{position:absolute;top:0;bottom:0;left:0;right:var(--rw)}
/* .v-office starts at top:0 and comes later in the page, so without this it
   lay over the whole header in the Office view and the three view tabs could
   not be clicked (only the language switch, which sits over the rail column). */
.top{z-index:20}
.views{display:flex;border:1px solid var(--line);border-radius:3px;overflow:hidden;flex:none}
.views button{font:12.5px var(--font-ui);background:var(--panel-raised);border:0;border-left:1px solid var(--line);padding:6px 14px;color:var(--ink-soft);cursor:pointer;white-space:nowrap}
.views button:last-child{border-left:0}
.views button[aria-pressed=true]{background:var(--accent-soft);color:var(--accent);font-weight:700;box-shadow:inset 0 -2px 0 var(--accent)}
/* at 1366 the nine view tabs, four counts and the Live badge no longer fit with the roomy spacing */
@media (max-width:1440px){.top{gap:12px;padding:0 14px}.views button{padding:6px 9px}.counts{gap:12px}}
.gate-c{color:var(--gate)!important}
.mono{font-family:var(--font-ui)}

/* the rail: what waits for the user, oldest first */
.rail{position:absolute;right:0;top:52px;bottom:0;width:320px;background:var(--panel);border-left:1px solid var(--line);padding:12px 14px;overflow-y:auto;z-index:9}@supports not selector(::-webkit-scrollbar){.rail{scrollbar-width:thin;scrollbar-color:#C9D1D9 transparent}}
.rail h2{font-size:14px;margin:0 0 2px;color:var(--gate);display:flex;gap:8px;align-items:baseline}
.rail h2 b{font:700 16px var(--font-ui)}
.rail h2 .x{margin-inline-start:auto;font:12px var(--font-ui);color:var(--ink-soft);background:var(--panel-raised);border:1px solid var(--line);border-radius:3px;padding:1px 8px;cursor:pointer;display:none}
.rail .hint{font-size:11.5px;color:var(--ink-dim);margin:0 0 8px}
.rail .sect{display:flex;justify-content:space-between;align-items:baseline;margin:14px 0 6px}
.rail .sect .src{font-weight:400;color:var(--ink-dim);font-size:11px}
.wait{background:var(--warn-bg);border:1px solid var(--gate-line);border-radius:3px;margin:0 0 7px}
.wait.late{border-color:rgba(200,55,45,.5);background:var(--bad-bg)}
.wait.hl{box-shadow:0 0 0 2px #2563EB}
.wait-go{display:block;width:100%;text-align:start;background:none;border:0;padding:7px 9px 5px;cursor:pointer;color:inherit;font:inherit}
.wh{display:flex;gap:6px;align-items:center;font-size:12px;font-weight:700}
.gl{font:700 11px/16px var(--font-ui);min-width:18px;height:18px;text-align:center;border:1px solid var(--gate-line);color:var(--gate);border-radius:2px;padding:0 3px;display:inline-block;flex:none}
.late .gl{border-color:rgba(200,55,45,.5);color:var(--bad)}
.age{margin-inline-start:auto;font:700 12px var(--font-ui);color:var(--gate);white-space:nowrap}
.late .age{color:var(--bad)}
.wq{display:block;font-size:12.5px;color:var(--ink);margin:3px 0;overflow-wrap:anywhere}
.wf{display:flex;justify-content:space-between;gap:6px;font-size:11px;color:var(--ink-dim)}
.ansbox{padding:0 9px 8px;display:flex;flex-wrap:wrap;gap:4px;align-items:center}
.ansbox button{font:12px var(--font-ui);color:var(--ink);background:var(--panel-raised);border:1px solid #C3CCD5;border-radius:3px;padding:2px 9px;cursor:pointer}
.ansbox button:hover{border-color:var(--gate)}
.ansbox button.armed{background:var(--gate);color:#1D2530;border-color:var(--gate);font-weight:700}
.ansbox button.yes{border-color:var(--accent-line);color:var(--accent)}
.ansbox button.no{border-color:rgba(200,55,45,.45);color:var(--bad)}
.ansbox button:disabled{opacity:.45;cursor:default}
.ansbox button.dis{margin-inline-start:auto;font-size:11px;color:var(--ink-dim);background:none;border-color:var(--line)}
.ansbox button.dis:hover{color:var(--ink);border-color:var(--gate)}
.ansbox button.dis.armed{color:#1D2530}
.bulk{display:block;width:100%;margin:2px 0 8px;font:12px var(--font-ui);color:var(--ink-soft);background:var(--panel-raised);border:1px dashed #C3CCD5;border-radius:3px;padding:4px 9px;cursor:pointer}
.bulk:hover{border-color:var(--gate)}
.bulk.armed{background:var(--gate);color:#1D2530;border-color:var(--gate);font-weight:700}
.bulk:disabled{opacity:.45;cursor:default}
.given .dim{color:var(--ink-dim)}
.given .rd{font-size:10.5px;margin-inline-start:4px;white-space:nowrap}
.given .rd.yes{color:var(--ok)}.given .rd.no{color:var(--gate)}
.ansbox form{display:flex;gap:4px;flex:1;min-width:0}
.ansbox input{flex:1;min-width:0;font:12px var(--font-ui);color:var(--ink);background:var(--ground);border:1px solid #C3CCD5;border-radius:3px;padding:2px 7px}
.ansbox input:focus{outline:1px solid var(--gate);outline-offset:0}
.ansmsg{flex-basis:100%;font-size:11px;color:var(--ink-dim)}
.ansmsg.err{color:var(--bad)}.ansmsg.ok{color:var(--ok)}
.pipe{border:1px solid var(--line);border-radius:4px;padding:7px 9px;margin-bottom:7px;background:var(--panel-raised)}
.pipe-h{display:flex;justify-content:space-between;gap:6px;font-size:12.5px;font-weight:700}
.pipe-h span{font:400 11px var(--font-ui);color:var(--ink-dim);white-space:nowrap}
.gsteps{display:flex;gap:3px;margin:6px 0 0;list-style:none;padding:0}
.gsteps li{flex:1;min-width:0;text-align:center;font-size:10.5px;line-height:1.3;padding:3px 2px;border:1px solid var(--line);border-radius:2px;color:var(--ink-dim);overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.gsteps li b{display:block;font:700 11px var(--font-ui)}
.gsteps .done{color:var(--ok);border-color:var(--accent-line);background:var(--accent-soft)}
.gsteps .wt{color:var(--gate);border-color:var(--gate-line);background:var(--warn-bg)}
.gsteps .lt{color:var(--bad);border-color:rgba(200,55,45,.5);background:var(--bad-bg)}
.gsteps .ex{text-decoration:line-through}
.given{list-style:none;margin:0;padding:0;font-size:12px}
.given li{display:grid;grid-template-columns:auto 1fr;gap:8px;padding:3px 0;border-bottom:1px solid #E6EAEE}
.given time{font-family:var(--font-ui);color:var(--ink-dim)}
.given .ans{color:var(--who-user)}
.rail .none{font-size:12px;color:var(--ink-dim);margin:0 0 8px}
.rail .say{font-size:12.5px;color:var(--ink-soft);margin:0 0 8px}
.rail .say b{font-family:var(--font-ui);color:var(--ink)}
/* folded: a narrow strip; a click opens the full rail over the page */
.mini-rail{display:none;position:absolute;right:0;top:52px;bottom:0;width:56px;background:var(--panel);border-left:1px solid var(--line);flex-direction:column;align-items:center;gap:8px;padding-top:10px;z-index:8;overflow-y:auto;scrollbar-width:none}
.mini-rail .ttl{writing-mode:vertical-rl;font:700 12px var(--font-ui);color:var(--gate);background:none;border:0;cursor:pointer;padding:0}
.mr{width:44px;min-height:44px;flex:none;border:1px solid var(--gate-line);background:var(--warn-bg);border-radius:3px;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;padding:2px}
.mr b{font:700 12px var(--font-ui);color:var(--gate)}
.mr span{font:10px var(--font-ui);color:var(--gate)}
.mr.late{border-color:rgba(200,55,45,.5);background:var(--bad-bg)}.mr.late b,.mr.late span{color:var(--bad)}
.mr.zero{border-style:dashed;background:none}.mr.zero b{color:var(--ink-dim)}
@media (max-width:1399px){
  .mini-rail{display:flex}
  .rail{display:none;box-shadow:-12px 0 32px rgba(30,40,50,.14);z-index:30}
  .board.rail-open .rail{display:block}
  .rail h2 .x{display:inline-block}
}

/* decisions and usage views */
.vm{position:absolute;left:0;right:var(--rw);top:52px;bottom:0;padding:14px 18px;overflow:hidden;display:flex;flex-direction:column;gap:10px}
.vm[hidden],.v-office[hidden]{display:none}
.fbar{display:flex;gap:6px;align-items:center;flex-wrap:wrap;flex:none}
.fbar h2{font-size:15px;margin:0 0 0 12px}
.fchip{font:12px var(--font-ui);background:var(--panel-raised);border:1px solid var(--line);border-radius:3px;padding:3px 9px;color:var(--ink-soft);cursor:pointer;white-space:nowrap}
.fchip b{font:700 11.5px var(--font-ui);margin-right:3px}
.fchip[aria-pressed=true]{color:var(--ink);border-color:#C3CCD5;background:#E8EEF5}
.fsel{background:var(--panel-raised);border:1px solid var(--line);color:var(--ink);font:12px var(--font-ui);padding:3px 8px;border-radius:3px}
.swim{position:relative;background:var(--panel);border:1px solid var(--line);border-radius:4px;height:176px;flex:none;overflow:hidden}
.lane{position:absolute;right:0;left:0;height:44px;border-bottom:1px solid #E6EAEE}
.lane .lh{position:absolute;right:0;top:0;bottom:0;width:92px;display:flex;align-items:center;gap:6px;padding-right:10px;font-size:12px;font-weight:700;background:#F1F4F7;border-left:1px solid var(--line);z-index:1}
.track{position:absolute;right:100px;left:14px;top:0;bottom:0}
.mk{position:absolute;top:50%;width:12px;height:12px;margin:-6px -6px 0 0;border:2px solid;border-radius:2px;background:var(--panel);padding:0;cursor:pointer;z-index:1}
.mk.u{border-color:var(--who-user);transform:rotate(45deg);background:#FFF6DB}
.mk.s{border-color:var(--who-sup);background:#F1ECF9}
.mk.a{border-color:var(--who-agent);border-radius:50%;background:#E6F4F6}
.mk.o{border-color:var(--gate);border-style:dashed;border-radius:50%}
.mk.sel{box-shadow:0 0 0 3px rgba(12,138,98,.45)}
.mlab{position:absolute;top:0;font-size:10.5px;color:var(--ink-soft);white-space:nowrap;transform:translateX(50%);pointer-events:none;max-width:160px;overflow:hidden;text-overflow:ellipsis}
.waitbar{position:absolute;top:50%;height:8px;margin-top:-4px;background:repeating-linear-gradient(135deg,rgba(217,140,30,.35) 0 5px,transparent 5px 10px);border:1px solid var(--gate-line)}
.waitbar.lt{background:repeating-linear-gradient(135deg,rgba(200,55,45,.35) 0 5px,transparent 5px 10px);border-color:rgba(200,55,45,.5)}
.axis{position:absolute;right:100px;left:14px;bottom:0;height:40px}
.axis span{position:absolute;bottom:18px;font:10.5px var(--font-ui);color:var(--ink-dim);transform:translateX(50%)}
.axis span::before{content:"";position:absolute;left:50%;bottom:15px;width:1px;height:132px;background:#E6EAEE}
.nowl{position:absolute;top:-136px;bottom:18px;width:0;border-left:1px dashed var(--accent)}
.nowl b{position:absolute;bottom:-17px;left:-18px;font:10.5px var(--font-ui);color:var(--accent);background:var(--panel);padding:0 2px;z-index:2}
.runs-ax{position:absolute;right:100px;left:14px;bottom:4px;height:10px}
.runs-ax i{position:absolute;height:6px;top:2px;background:#C9D1D9;border-radius:1px}
.runs-ax i.op{background:var(--heavy)}
.runs-ax i.lv{background:var(--accent)}
.tbl-wrap{flex:1;min-height:0;overflow:auto;border:1px solid var(--line);border-radius:4px;background:var(--panel)}@supports not selector(::-webkit-scrollbar){.tbl-wrap{scrollbar-width:thin;scrollbar-color:#C9D1D9 transparent}}
.vm table{border-collapse:collapse;width:100%}
.dt th,.dt td{text-align:start;padding:6px 10px;border-bottom:1px solid #E6EAEE;vertical-align:top;font-size:12.5px}
.dt thead th{font-size:11px;color:var(--ink-dim);font-weight:700;background:#F1F4F7;position:sticky;top:0;z-index:1}
.dt td.t{font-family:var(--font-ui);color:var(--ink-dim);width:52px;white-space:nowrap}
.dt td.w{width:130px;white-space:nowrap}
.dw{display:inline-flex;gap:5px;align-items:center;font-size:12px;font-weight:700}
.dw i{width:9px;height:9px;display:inline-block;border:2px solid;flex:none}
.dw.u{color:var(--who-user)}.dw.u i{border-color:var(--who-user);transform:rotate(45deg)}
.dw.s{color:var(--who-sup)}.dw.s i{border-color:var(--who-sup)}
.dw.a{color:var(--who-agent)}.dw.a i{border-color:var(--who-agent);border-radius:50%}
.dw.o{color:var(--gate)}.dw.o i{border-color:var(--gate);border-style:dashed;border-radius:50%}
.dt .d{color:var(--ink);overflow-wrap:anywhere}
.dt .r{color:var(--ink-soft);font-size:12px;overflow-wrap:anywhere}
.dt td.run{width:160px}
.lnk{font:11px var(--font-ui);color:var(--cyan);background:none;border:0;padding:0;cursor:pointer;text-decoration:underline dotted;direction:ltr;white-space:nowrap}
.pj{display:block;font-size:11px;color:var(--ink-dim)}
.dst{font-size:11px;padding:1px 6px;border-radius:2px;border:1px solid var(--line);white-space:nowrap;color:var(--ink-soft)}
.dst.wt{color:var(--gate);border-color:var(--gate-line);background:var(--warn-bg)}
.dst.lt{color:var(--bad);border-color:rgba(200,55,45,.5);background:var(--bad-bg)}
.dt tr.selrow td{background:rgba(12,138,98,.05)}
.dt tr.selrow td:first-child{box-shadow:inset -3px 0 0 var(--accent)}
.dt tr[data-dsel]{cursor:pointer}
.vm .empty{color:var(--ink-dim);padding:16px;margin:0;font-size:12.5px}
.kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;flex:none;margin:0}
.kpi{background:var(--panel);border:1px solid var(--line);border-radius:4px;padding:7px 10px;min-width:0}
.kpi dt{font-size:11.5px;color:var(--ink-dim)}
.kpi dd{margin:0;font:700 20px var(--font-ui);color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kpi dd small{font:400 11.5px var(--font-ui);color:var(--ink-soft);margin-right:4px}
.kpi.m dd{color:var(--measured)}
.kpi dd.unset{font:700 13px var(--font-ui);color:var(--gate);padding-top:5px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px;flex:none;max-height:46%;min-height:0}
.box{background:var(--panel);border:1px solid var(--line);border-radius:4px;padding:10px 12px;min-height:0;overflow:auto}@supports not selector(::-webkit-scrollbar){.box{scrollbar-width:thin;scrollbar-color:#C9D1D9 transparent}}
.box h3{font-size:13px;margin:0 0 6px;display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.box h3 span{font:400 11px var(--font-ui);color:var(--ink-dim)}
.hb th{font:700 11.5px var(--font-ui);text-align:left;direction:ltr;width:160px;padding:2px 0;color:var(--ink);white-space:nowrap}
.hb td{padding:2px 0}
.hb td.v{font:700 11.5px var(--font-ui);text-align:left;width:56px;color:var(--measured);direction:ltr}
.hbar{display:flex;height:11px;direction:ltr;margin-right:8px}
.hbar i{display:block;height:100%}
.hbar .op{background:var(--heavy)}.hbar .sn{background:var(--other)}
.hbar .nr{background:repeating-linear-gradient(135deg,#C9D1D9 0 3px,transparent 3px 6px);border:1px solid #C9D1D9}
.lg{display:flex;flex-wrap:wrap;gap:12px;font-size:11.5px;color:var(--ink-soft);margin-top:5px}
.lg i{display:inline-block;width:10px;height:10px;margin-left:4px;vertical-align:-1px}
.mx th,.mx td{padding:2px 3px;text-align:center;font-size:11px}
.mx thead th{font:700 10.5px var(--font-ui);color:var(--ink-dim)}
.mx tbody th{font:700 11px var(--font-ui);text-align:left;direction:ltr;color:var(--ink);white-space:nowrap;padding-left:0}
.mc{display:block;min-width:30px;height:20px;line-height:18px;border-radius:2px;font:700 11px var(--font-ui)}
.mc.u{background:rgba(31,122,140,.18);color:var(--measured);border:1px solid rgba(31,122,140,.4)}
.mc.u.hi{background:rgba(31,122,140,.38);color:#E4F6F8}
.mc.u.bad{background:var(--bad-bg);color:var(--bad);border-color:rgba(200,55,45,.5)}
.mc.z{border:1px dashed #C3CCD5;color:var(--ink-dim)}
.mc.n{background:repeating-linear-gradient(135deg,#E6EAEE 0 3px,transparent 3px 6px);color:transparent}
.mx td.norec{text-align:start;color:var(--ink-dim);font-size:11.5px}
.rt th,.rt td{padding:4px 8px;border-bottom:1px solid #E6EAEE;font-size:12px;text-align:start;white-space:nowrap}
.rt thead th{font-size:11px;color:var(--ink-dim);background:#F1F4F7;font-weight:700;position:sticky;top:0}
.rt td.n{font-family:var(--font-ui);text-align:left;direction:ltr}
.rt td.n.m{color:var(--measured)}
.rt td.tk{overflow:hidden;text-overflow:ellipsis;max-width:260px}
.rt tr[data-key]{cursor:pointer}.rt tr[data-key]:hover td{background:var(--panel-raised)}
.nrec{color:var(--ink-dim);font-family:var(--font-ui)!important;font-size:11.5px}
.opt{color:#2F7F8A}
/* inspector additions */
.toolline{font:11.5px var(--font-ui);direction:ltr;text-align:left;color:var(--ink-soft);margin:4px 0 2px;overflow-wrap:anywhere}
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

module.exports = { OFFICE_STYLE, CR_STYLE }
