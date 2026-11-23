  // Dragging pans. A left-button drag only counts after 5px, so a click on a
  // bubble or a person still selects it; the middle button or a held Space
  // pans at once. The click that ends a drag is swallowed.
  let pan = null, spaceDown = false, swallowClick = false
  stage.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault() }) // no autoscroll
  stage.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.zoombar,.legend') || w3on()) return
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
    if (w3on()) {
      if (pans[e.key]) W3.panBy(pans[e.key][0], pans[e.key][1])
      else if (e.key === '+' || e.key === '=') W3.zoomBy(1.25)
      else if (e.key === '-' || e.key === '_') W3.zoomBy(0.8)
      else if (e.key === '0') W3.fit()
      else return
      e.preventDefault()
      return
    }
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
    if (w3on()) { if (b.dataset.zoom === 'fit') W3.fit(); else W3.zoomBy(b.dataset.zoom === 'in' ? 1.25 : 0.8); return }
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
    stage.classList.toggle('w3on', w3on())
    let overlays = [], loungeAt = new Map(), keys3 = null
    if (w3on()) {
      const model = scene3d(S, desks, current)
      keys3 = model.keys
      W3.sync(model)
      if ($('stage-in').firstChild) $('stage-in').innerHTML = ''
    } else {
      const sc = scene(S, desks, current)
      overlays = sc.overlays; loungeAt = sc.loungeAt
      $('stage-in').innerHTML = sc.svg + overlays.map((o) => overlayHtml(o, current)).join('')
      crowdPills($('stage-in'), [...$('stage-in').querySelectorAll('.w3card')].filter((e) => !e.classList.contains('tone-idle')), () => renderAll())
    }
    $('insp').innerHTML = inspector(S, current)
    $('needs').innerHTML = needsLook(S)
    $('needs').hidden = !$('needs').innerHTML
    const dr = $('drawer')
    dr.classList.toggle('open', drawerOpen)
    dr.innerHTML = drawer(S, current)
    const t = $('term')
    if (t && stick) t.scrollTop = t.scrollHeight
    const sb = $('sb')
    if (sb) sb.scrollTop = sbTop
    prev = {
      busy: new Set(S.busy.keys()), today: new Set(S.today.map((r) => r.key)), desks, lounge: loungeAt,
      keys: keys3 || new Set(overlays.map(overlayId).filter(Boolean)), steps: new Map(S.active.map((a) => [a.key, a.steps.length])),
    }
    applyView()
  }

  // The rail, the strip and the two other views. The rail is redrawn on every
  // poll, so a half-typed answer and the scroll positions are carried over.
  function controlRoomViews(S, S0) {
    board.classList.toggle('rail-open', railOpen)
    board.classList.toggle('co', !!CO)
    // the campus and the org chart need the width: the rail folds to its strip there
    board.classList.toggle('rail-mini', mode === 'campus' || mode === 'org' || mode === 'vr' || mode === 'sav' || mode === 'plan' || EV.MODES.includes(mode))
    $('v-office').hidden = mode !== 'office'
    $('v-dec').hidden = mode !== 'dec'
    $('v-use').hidden = mode !== 'use'
    $('v-campus').hidden = mode !== 'campus'
    $('v-org').hidden = mode !== 'org'
    $('v-act').hidden = mode !== 'act'
    $('v-vr').hidden = mode !== 'vr'
    $('v-sav').hidden = mode !== 'sav'
    $('v-plan').hidden = mode !== 'plan'
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
    // the dock: the oldest three waiting, floating over the campus and the office (the other screens carry the count on the Decisions tab)
    const dk = $('dock'), dkHtml = mode === 'campus' || mode === 'office' ? CR.dock(S) : ''
    dk.hidden = !dkHtml
    if (dk.innerHTML !== dkHtml) dk.innerHTML = dkHtml
    board.dataset.screen = mode
    if (mode === 'dec') {
      const tb = $('dtbl'), top = tb ? tb.scrollTop : 0
      $('v-dec').innerHTML = CR.decisions(S)
      if ($('dtbl')) $('dtbl').scrollTop = top
    } else if (mode === 'act') {
      const box = $('act'), top = box ? box.scrollTop : 0
      $('v-act').innerHTML = AV.render(S0)
      if ($('act')) $('act').scrollTop = top
    } else if (mode === 'vr') {
      const box = $('vr'), top = box ? box.scrollTop : 0
      $('v-vr').innerHTML = VV.render(S0)
      if ($('vr')) $('vr').scrollTop = top
    } else if (mode === 'sav') {
      const box = $('sv'), top = box ? box.scrollTop : 0
      $('v-sav').innerHTML = SV.render()
      if ($('sv')) $('sv').scrollTop = top
    } else if (mode === 'plan') {
      PV.mount($('v-plan'))
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
  // the ? in the top bar: the guide, and the legends and notes, which stay hidden until shown
  let legendsOn = false
  try { legendsOn = localStorage.getItem('arsenale-legends') === '1' } catch { /* storage blocked */ }
  const helpUi = () => {
    board.classList.toggle('legends', legendsOn)
    const b = document.querySelector('[data-legends]')
    if (b) b.setAttribute('aria-pressed', String(legendsOn))
    const sc = document.querySelector('[data-showcase]')
    if (sc) sc.setAttribute('aria-pressed', String(board.classList.contains('showcase')))
  }
  helpUi()
  document.addEventListener('click', (e) => {
    const pop = $('helpop'), btn = $('helpb')
    const t = e.target.closest('[data-help],[data-legends],[data-showcase]')
    if (!t) { if (pop && !pop.hidden && !e.target.closest('#helpop')) { pop.hidden = true; btn.setAttribute('aria-expanded', 'false') } return }
    if (t.dataset.help) { pop.hidden = !pop.hidden; btn.setAttribute('aria-expanded', String(!pop.hidden)); return }
    if (t.dataset.legends) { legendsOn = !legendsOn; try { localStorage.setItem('arsenale-legends', legendsOn ? '1' : '0') } catch { /* ignore */ } }
    // the showcase look exists in the demo only (DEMO is false on every real page)
    if (t.dataset.showcase && DEMO) board.classList.toggle('showcase')
    helpUi()
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
    document.querySelectorAll('[data-quiet]').forEach((e) => { e.textContent = quietMins(now - Number(e.dataset.quiet)) })
    const c = $('clock')
    if (c) c.textContent = hhmm(now)
  }

  // Nudge and Clean ("Needs a look" and the inspector): one click each, as on Live
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-runact]')
    if (!t || t.disabled) return
    const [op, id] = t.dataset.runact.split('|')
    runAct(op, id)
  })
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
    if (e.key === 'Escape' && w3on() && !omenuOpen && !railOpen && !drawerOpen && !(CO && CO.dialogOpen())) { W3.fit(); return }
    if (e.key === 'Escape' && omenuOpen) { omenuOpen = ''; renderAll(); return }
    if (e.key === 'Escape' && !$('helpop').hidden) { $('helpop').hidden = true; $('helpb').setAttribute('aria-expanded', 'false'); $('helpb').focus(); return }
    if (e.key === 'Escape' && railOpen) { railOpen = false; renderAll(); return }
    if (e.key === 'Escape' && drawerOpen) { drawerOpen = false; remember(); renderAll() }
    // Enter on a runs-table row opens that run in the office
    if (e.key === 'Enter' && e.target.matches && e.target.matches('tr[data-key]')) e.target.click()
  })
  window.addEventListener('resize', () => { if (drawerOpen) renderAll(); else applyLayout(); if (CO && mode === 'campus') CO.fit() })
  splitter($('split-v'), 'x')
  splitter($('split-h'), 'y')
  $('legend').innerHTML = '<span><span class="g g-running">▶</span> ' + T('Working') + '</span><span><span class="g g-ok">✓</span> ' + T('No issues') + '</span><span><span class="g g-findings">!</span> ' + T('Has findings') + '</span><span><span class="g g-failed">✕</span> ' + T('Failed') + '</span><span><span class="g g-stopped">■</span> ' + T('Stopped') + '</span><span><span class="g warn">◷</span> ' + T('Quiet for more than ') + digits(QUIET_MIN) + T(' min') + '</span>'

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
        badge.innerHTML = '<i></i> ' + T('Live')
        badge.title = T('Refreshes every 1.5 seconds')
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
