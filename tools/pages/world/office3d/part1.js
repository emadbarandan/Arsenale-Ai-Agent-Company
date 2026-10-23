  const T3 = window.THREE, X = window.THREE_ADDONS
  if (!T3 || !X || !X.GLTFLoader || !X.toCreasedNormals || !X.clone) return null
  let renderer
  try {
    renderer = new T3.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
  } catch (e) {
    return null // no WebGL here: the page keeps its flat office
  }
  const { esc } = h
  const FONT_UI = 'Arial, "Helvetica Neue", Helvetica, sans-serif'
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  // No shadows anywhere (owner, 2026-10-12): everything stands flush on the
  // floor, and a drop shadow only made the desks look as if they floated.
  renderer.shadowMap.enabled = false
  renderer.outputColorSpace = T3.SRGBColorSpace
  renderer.toneMapping = T3.NeutralToneMapping
  // A software renderer (no GPU, a remote desktop, a headless test browser)
  // draws at one pixel per pixel and fewer frames, so the rest of the page stays quick.
  let soft = false
  try {
    const gl = renderer.getContext(), dbg = gl.getExtension('WEBGL_debug_renderer_info')
    soft = /swiftshader|basic render|llvmpipe|software|warp/i.test(dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '')
  } catch (e) { /* unknown: treat it as a GPU */ }
  if (soft) renderer.setPixelRatio(1)
  const cvs = renderer.domElement
  cvs.setAttribute('aria-hidden', 'true')
  const host = document.createElement('div'); host.className = 'w3host'
  const ov = document.createElement('div'); ov.className = 'w3ov'
  const cardsEl = document.createElement('div'), pageEl = document.createElement('div')
  ov.append(cardsEl, pageEl)
  const projEl = document.createElement('div'); projEl.className = 'w3proj'
  const dropEl = document.createElement('div'); dropEl.className = 'w3drop'; dropEl.innerHTML = '<span>' + T('Drop the .glb on a desk') + '</span>'
  const toastEl = document.createElement('div'); toastEl.className = 'w3toast'; toastEl.setAttribute('role', 'status')
  host.append(cvs, ov, projEl, dropEl, toastEl)
  const fileIn = document.createElement('input'); fileIn.type = 'file'; fileIn.accept = '.glb,model/gltf-binary'; fileIn.hidden = true
  host.appendChild(fileIn)

  const scene = new T3.Scene()
  // soft daylight: cool sky, warm bounce off the floor, a key light from the
  // windows (back left) and a weak fill from the open front; none casts a shadow
  scene.add(new T3.HemisphereLight('#f4f6ff', '#e8e2d8', 1.75))
  const sun = new T3.DirectionalLight('#fffaf3', 2.1)
  scene.add(sun, sun.target)
  const fill = new T3.DirectionalLight('#e9eeff', 0.45); fill.position.set(12, 6, 10); scene.add(fill)

  // ---------- camera: orthographic isometric, with our own pan, orbit and zoom
  const cam = new T3.OrthographicCamera(-1, 1, 1, -1, 0.1, 400)
  const VIEW0 = { azim: Math.PI / 4, elev: 0.64 }
  const FR = 15 // frustum height at zoom 1
  const view = { target: new T3.Vector3(0, 0.4, 0), azim: VIEW0.azim, elev: VIEW0.elev, zoom: 1, auto: true }
  let W = 800, H = 500, tween = null, overview = null, focusId = null
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
  const lerp = (a, b, t) => a + (b - a) * t
  function applyCam() {
    const a = W / H, d = 60
    cam.left = -FR * a / 2; cam.right = FR * a / 2; cam.top = FR / 2; cam.bottom = -FR / 2
    cam.zoom = view.zoom
    cam.position.set(view.target.x + d * Math.cos(view.elev) * Math.sin(view.azim), view.target.y + d * Math.sin(view.elev), view.target.z + d * Math.cos(view.elev) * Math.cos(view.azim))
    cam.lookAt(view.target); cam.updateProjectionMatrix(); cam.updateMatrixWorld()
    ovDirty = true
  }
  // the zoom that fits `pts` (world) around `tgt` into availW x availH pixels, at the default angles
  function zoomFor(pts, tgt, availW, availH) {
    const keep = { t: view.target.clone(), az: view.azim, el: view.elev, z: view.zoom }
    view.target.copy(tgt); view.azim = VIEW0.azim; view.elev = VIEW0.elev; view.zoom = 1; applyCam()
    let mx = 1e-3, my = 1e-3
    const v = new T3.Vector3()
    for (const p of pts) { v.copy(p).applyMatrix4(cam.matrixWorldInverse); mx = Math.max(mx, Math.abs(v.x)); my = Math.max(my, Math.abs(v.y)) }
    view.target.copy(keep.t); view.azim = keep.az; view.elev = keep.el; view.zoom = keep.z; applyCam()
    return Math.min((FR * W / H / 2) * (availW / W) / mx, (FR / 2) * (availH / H) / my)
  }
  const boxPts = (x0, x1, z0, z1, y0, y1) => { const o = []; for (const x of [x0, x1]) for (const z of [z0, z1]) for (const y of [y0, y1]) o.push(new T3.Vector3(x, y, z)); return o }
  const viewOf = () => ({ tx: view.target.x, ty: view.target.y, tz: view.target.z, azim: view.azim, elev: view.elev, zoom: view.zoom })
  function startTween(goal, d) {
    if (h.calm && h.calm()) { setView(goal); return }
    tween = { from: viewOf(), to: goal, t: 0, d: d || 0.75 }
  }
  function setView(g) {
    view.target.set(g.tx, g.ty, g.tz); view.azim = g.azim; view.elev = g.elev; view.zoom = g.zoom
    applyCam()
  }
  let viewSaveT = 0
  function viewChanged(byUser) {
    // a pan, an orbit or a zoom by hand ends a focus: the other cards light up again
    if (byUser) { view.auto = false; if (focusId) { focusId = null; ovDirty = true } }
    clearTimeout(viewSaveT)
    viewSaveT = setTimeout(() => { if (h.onView) h.onView(Object.assign(viewOf(), { auto: view.auto })) }, 400)
  }
  function fit(animated) {
    focusId = null; view.auto = true
    if (!overview) return
    if (animated) startTween(overview, 0.7); else setView(overview)
    viewChanged(false)
  }
  function focus(id) {
    const p = O && O.byId.get(id)
    if (!p) return
    focusId = id
    const hs = p.S / 2, tgt = new T3.Vector3(p.x, 0.75, p.z)
    const zoom = clamp(zoomFor(boxPts(p.x - hs, p.x + hs, p.z - hs, p.z + hs, -0.55, 2.4), tgt, W - 120, H - 160), 0.8, 3.6)
    startTween({ tx: tgt.x, ty: tgt.y, tz: tgt.z, azim: VIEW0.azim, elev: VIEW0.elev, zoom }, 0.85)
    view.auto = false
    viewChanged(false)
  }

  // ---------- materials and geometry, cached
  const MC = new Map()
  function mat(hex, o) {
    const k = hex + JSON.stringify(o || {})
    if (!MC.has(k)) MC.set(k, new T3.MeshStandardMaterial(Object.assign({ color: hex, roughness: 0.78, metalness: 0 }, o || {})))
    return MC.get(k)
  }
  const GC = new Map()
  const geo = (key, fn) => { if (!GC.has(key)) GC.set(key, fn()); return GC.get(key) }
  function rrShape(w, d, r) {
    const s = new T3.Shape(), x = -w / 2, y = -d / 2
    r = Math.min(r, w / 2, d / 2)
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d)
    s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y)
    return s
  }
  // a soft rounded box: an extruded rounded rectangle with a bevel, creased normals
  function roundedBox(w, hh, d, r) {
    const b = Math.min(r, hh / 2 - 0.001, w / 2 - 0.001, d / 2 - 0.001)
    const g = new T3.ExtrudeGeometry(rrShape(w - 2 * b, d - 2 * b, Math.max(0.001, r)), { depth: Math.max(0.0005, hh - 2 * b), bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 3, curveSegments: 4 })
    g.rotateX(-Math.PI / 2); g.translate(0, -(hh / 2 - b), 0)
    return X.toCreasedNormals(g, 0.7)
  }
  const G = {
    box: (w, hh, d) => geo('b' + [w, hh, d], () => new T3.BoxGeometry(w, hh, d)),
    cyl: (rt, rb, hh, s) => geo('c' + [rt, rb, hh, s || 12], () => new T3.CylinderGeometry(rt, rb, hh, s || 12)),
    ico: (r, d) => geo('i' + [r, d || 1], () => new T3.IcosahedronGeometry(r, d === undefined ? 1 : d)),
    cone: (r, hh, s) => geo('o' + [r, hh, s || 5], () => new T3.ConeGeometry(r, hh, s || 5)),
    rbox: (w, hh, d, r) => geo('r' + [w, hh, d, r || 0.03], () => roundedBox(w, hh, d, r || 0.03)),
    plane: () => geo('pl', () => { const g = new T3.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2); return g }),
  }
  function mesh(g, m, x, y, z, parent, o) {
    o = o || {}
    const me = new T3.Mesh(g, m)
    me.position.set(x || 0, y || 0, z || 0)
    if (o.rx) me.rotation.x = o.rx
    if (o.ry) me.rotation.y = o.ry
    if (o.rz) me.rotation.z = o.rz
    if (parent) parent.add(me)
    return me
  }
  // a flat rounded rectangle lying on the floor (a rug, a zone, a floor tile)
  const flatGeo = (w, d, r) => geo('flat' + [w, d, r], () => { const g = new T3.ShapeGeometry(rrShape(w, d, r), 6); g.rotateX(-Math.PI / 2); return g })
  // textures are drawn in code: no image is downloaded
  function canvasTex(w, hh, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = hh
    draw(c.getContext('2d'), w, hh)
    const t = new T3.CanvasTexture(c); t.colorSpace = T3.SRGBColorSpace; t.anisotropy = 4
    return t
  }
  let seed = 7
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }
  // one screen atlas (2x2 tiles: code, tests, dashboard, design), so every monitor shares one draw call
  const screenAtlas = canvasTex(512, 320, (g) => {
    const tile = (ox, oy, fn) => { g.save(); g.translate(ox, oy); g.beginPath(); g.rect(0, 0, 256, 160); g.clip(); fn(g, 256, 160); g.restore() }
    tile(0, 0, (g, w, hh) => {
      g.fillStyle = '#16233d'; g.fillRect(0, 0, w, hh); g.fillStyle = '#22345a'; g.fillRect(0, 0, w, 14); g.fillStyle = '#1b2b49'; g.fillRect(0, 14, 46, hh)
      const cols = ['#8fb4ff', '#8fb4ff', '#a5b4cb', '#a5b4cb', '#6ee7d4', '#d0c3ff']
      for (let y = 24; y < hh - 6; y += 9) { let x = 54 + ((y / 9) % 4) * 8; while (x < w - 26 && rnd() > 0.18) { const ww = 10 + rnd() * 38; g.fillStyle = cols[(rnd() * cols.length) | 0]; g.fillRect(x, y, ww, 4); x += ww + 6 } }
      for (let y = 24; y < hh - 10; y += 12) { g.fillStyle = '#3a4d74'; g.fillRect(8, y, 28, 4) }
    })
    tile(256, 0, (g, w, hh) => {
      g.fillStyle = '#16233d'; g.fillRect(0, 0, w, hh); g.fillStyle = '#22345a'; g.fillRect(0, 0, w, 14)
      for (let i = 0; i < 11; i++) { const y = 24 + i * 12; g.fillStyle = i === 6 ? '#f87171' : '#4ade80'; g.fillRect(12, y, 7, 7); g.fillStyle = '#a5b4cb'; g.fillRect(26, y + 1, 50 + rnd() * 80, 4) }
      g.fillStyle = '#22c55e'; g.beginPath(); g.arc(205, 70, 34, 0, Math.PI * 1.7); g.lineTo(205, 70); g.fill(); g.fillStyle = '#16233d'; g.beginPath(); g.arc(205, 70, 20, 0, Math.PI * 2); g.fill()
    })
    tile(0, 160, (g, w, hh) => {
      g.fillStyle = '#f7f9fc'; g.fillRect(0, 0, w, hh); g.fillStyle = '#e3e9f2'; g.fillRect(0, 0, w, 14)
      for (let i = 0; i < 3; i++) { g.fillStyle = '#ffffff'; g.fillRect(10 + i * 82, 22, 74, 30); g.fillStyle = ['#2563eb', '#22c55e', '#f59e0b'][i]; g.fillRect(16 + i * 82, 30, 30, 5); g.fillStyle = '#cbd5e1'; g.fillRect(16 + i * 82, 40, 50, 4) }
      for (let i = 0; i < 9; i++) { g.fillStyle = i % 3 === 0 ? '#2563eb' : '#bcd2fb'; const bh = 16 + rnd() * 66; g.fillRect(16 + i * 25, 150 - bh, 15, bh) }
      g.fillStyle = '#cbd5e1'; g.fillRect(10, 151, 236, 2)
    })
    tile(256, 160, (g, w, hh) => {
      g.fillStyle = '#fbf8f6'; g.fillRect(0, 0, w, hh); g.fillStyle = '#ece6e2'; g.fillRect(0, 0, w, 14)
      g.fillStyle = '#ffffff'; g.fillRect(24, 24, 96, 124); g.fillRect(136, 24, 96, 124)
      g.fillStyle = '#f2a7b5'; g.fillRect(32, 32, 80, 40); g.fillStyle = '#c4b5fd'; g.fillRect(144, 32, 80, 26); g.fillStyle = '#7c3aed'; g.fillRect(144, 120, 44, 14)
      g.fillStyle = '#d6d3d1'; for (let i = 0; i < 5; i++) { g.fillRect(32, 80 + i * 11, 70 - i * 6, 4); g.fillRect(144, 66 + i * 10, 76 - i * 8, 4) }
    })
  })
  function screenGeo(tile, w, hh) {
    return geo('scr' + [tile, w, hh], () => {
      const g = new T3.PlaneGeometry(w, hh), uv = g.attributes.uv, c = tile % 2, r = (tile / 2) | 0
      // tile column c -> u in [.5c, .5c+.5]; row 0 (top of the canvas) -> v in [.5, 1]
      for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5 * c + 0.5 * uv.getX(i), (r === 0 ? 0.5 : 0) + 0.5 * uv.getY(i))
      uv.needsUpdate = true
      return g
    })
  }
  const screenMat = new T3.MeshBasicMaterial({ map: screenAtlas })
  // the ground: a faint grid only, one tile a metre, on a clear canvas, so the page's white and
  // its soft green halo show through (the renderer has alpha; no shadows fall on it)
  const groundTex = canvasTex(128, 128, (g) => {
    g.clearRect(0, 0, 128, 128)
    g.strokeStyle = 'rgba(15,46,40,.07)'; g.lineWidth = 2; g.strokeRect(1, 1, 126, 126); g.beginPath(); g.moveTo(64, 0); g.lineTo(64, 128); g.moveTo(0, 64); g.lineTo(128, 64); g.stroke()
  })
  groundTex.wrapS = groundTex.wrapT = T3.RepeatWrapping
  // words written on the floor or on a sign: Arial on a transparent canvas
  function textTex(lines, o) {
    o = o || {}
    const w = o.w || 512, hh = o.h || 128
    return canvasTex(w, hh, (g) => {
      if (o.bg) { g.fillStyle = o.bg; g.beginPath(); g.roundRect(0, 0, w, hh, o.r || 0); g.fill() }
      g.textBaseline = 'middle'; g.textAlign = o.align || 'center'
      const x = o.align === 'left' ? (o.pad || 24) : w / 2
      lines.forEach((l, i) => {
        g.font = (l.bold === false ? '400 ' : '700 ') + (l.size || 44) + 'px ' + FONT_UI
        g.fillStyle = l.color || o.color || '#55606C'
        let s = String(l.text || '')
        while (s.length > 1 && g.measureText(s).width > w - 2 * (o.pad || 24)) s = s.slice(0, -2) + '…'
        g.fillText(s, x, l.y !== undefined ? l.y : hh / 2)
      })
    })
  }

  // ---------- merge the static props into a few vertex-coloured meshes
  const VCM = new Map()
  function vcMat(m) {
    const k = [m.roughness, m.metalness, m.side].join('|')
    if (!VCM.has(k)) VCM.set(k, new T3.MeshStandardMaterial({ vertexColors: true, roughness: m.roughness, metalness: m.metalness, side: m.side }))
    return VCM.get(k)
  }
  function mergeStatic(group) {
    group.updateMatrixWorld(true)
    const buckets = new Map(), kill = []
    group.traverse((o) => {
      if (!o.isMesh || Array.isArray(o.material) || o.userData.noMerge) return
      const m = o.material
      const vc = m.isMeshStandardMaterial && !m.map && !m.transparent && m.emissive.getHex() === 0
      const key = (vc ? 'vc|' + [m.roughness, m.metalness, m.side].join('|') : m.uuid) + '|' + (+o.castShadow) + (+o.receiveShadow)
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()
      g.applyMatrix4(o.matrixWorld)
      if (vc) { const n = g.attributes.position.count, c = new Float32Array(n * 3); for (let i = 0; i < n; i++) { c[i * 3] = m.color.r; c[i * 3 + 1] = m.color.g; c[i * 3 + 2] = m.color.b } g.setAttribute('color', new T3.BufferAttribute(c, 3)) }
      if (!buckets.has(key)) buckets.set(key, { m: vc ? vcMat(m) : m, vc, cs: o.castShadow, rs: o.receiveShadow, gs: [] })
      buckets.get(key).gs.push(g); kill.push(o)
    })
    kill.forEach((o) => o.parent.remove(o))
    const out = new T3.Group()
    for (const b of buckets.values()) {
      let n = 0
      b.gs.forEach((g) => { n += g.attributes.position.count })
      const P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = b.vc ? null : new Float32Array(n * 2), Cc = b.vc ? new Float32Array(n * 3) : null
      let o3 = 0, o2 = 0
      for (const g of b.gs) {
        const c = g.attributes.position.count
        P.set(g.attributes.position.array, o3)
        if (g.attributes.normal) N.set(g.attributes.normal.array, o3)
        if (U && g.attributes.uv) U.set(g.attributes.uv.array, o2)
        if (Cc) Cc.set(g.attributes.color.array, o3)
        o3 += c * 3; o2 += c * 2
        g.dispose()
      }
      const mg = new T3.BufferGeometry()
      mg.setAttribute('position', new T3.BufferAttribute(P, 3)); mg.setAttribute('normal', new T3.BufferAttribute(N, 3))
      if (U) mg.setAttribute('uv', new T3.BufferAttribute(U, 2))
      if (Cc) mg.setAttribute('color', new T3.BufferAttribute(Cc, 3))
      mg.computeBoundingSphere()
      const me = new T3.Mesh(mg, b.m); me.castShadow = b.cs; me.receiveShadow = b.rs
      out.add(me)
    }
    return out
  }

  // ---------- props
  const C = {
    desk: '#f6f6f4', leg: '#c9cfd7', wood: '#c79a6b', woodSide: '#a97c51',
    chair: '#3c4149', chairD: '#2b2f35', monitor: '#1f232a', key: '#e8ebef', blue: '#2563eb', pot: '#eef0f2', potT: '#d9c6b0',
    leaf1: '#7fb58e', leaf2: '#5f9d74', leaf3: '#a3cfae', cab: '#eceef1', paper: '#ffffff', fabric: '#CBD4DE',
  }
  function chair(x, z, ry, parent, col) {
    const g = new T3.Group(); g.position.set(x, 0, z); g.rotation.y = ry
    for (let k = 0; k < 5; k++) { const an = k / 5 * Math.PI * 2; mesh(G.box(0.035, 0.03, 0.24), mat(C.chairD), Math.sin(an) * 0.11, 0.04, Math.cos(an) * 0.11, g, { ry: an }); mesh(G.ico(0.025, 1), mat(C.chairD), Math.sin(an) * 0.22, 0.025, Math.cos(an) * 0.22, g) }
    mesh(G.cyl(0.026, 0.026, 0.34, 8), mat('#9aa3ae', { metalness: 0.4, roughness: 0.4 }), 0, 0.24, 0, g)
    mesh(G.rbox(0.46, 0.08, 0.44, 0.035), mat(col || C.chair), 0, 0.45, 0, g)
    mesh(G.rbox(0.42, 0.46, 0.07, 0.035), mat(col || C.chair), 0, 0.76, -0.22, g, { rx: -0.08 })
    mesh(G.box(0.04, 0.2, 0.04), mat(C.chairD), 0, 0.55, -0.2, g)
    for (const sx of [-1, 1]) mesh(G.rbox(0.05, 0.04, 0.26, 0.015), mat(C.chairD), sx * 0.24, 0.6, 0, g)
    parent.add(g)
    return g
  }
  function desk(x, z, ry, parent, o) {
    const g = new T3.Group(); g.position.set(x, 0, z); g.rotation.y = ry
    const w = o.w || 1.5, d = o.d || 0.7, hh = o.h || 0.74, top = o.top || C.desk, legc = o.leg || C.leg
    mesh(G.rbox(w, 0.05, d, 0.02), mat(top), 0, hh - 0.025, 0, g)
    mesh(G.rbox(0.42, hh - 0.06, d - 0.08, 0.02), mat(legc), w / 2 - 0.25, (hh - 0.05) / 2, 0, g)
    for (let i = 0; i < 3; i++) mesh(G.box(0.3, 0.008, 0.01), mat('#a9b0b9'), w / 2 - 0.25, 0.16 + i * 0.2, -(d - 0.08) / 2 - 0.003, g, { cast: false })
    mesh(G.box(0.04, hh - 0.05, d - 0.1), mat(legc), -w / 2 + 0.06, (hh - 0.05) / 2, 0, g)
    const mons = o.mons === undefined ? 1 : o.mons
    for (let i = 0; i < mons; i++) {
      const mx = mons === 1 ? 0 : (i - 0.5) * 0.66, myaw = mons === 1 ? 0 : (i === 0 ? 0.22 : -0.22)
      const mg = new T3.Group(); mg.position.set(mx, hh, 0.17); mg.rotation.y = myaw; g.add(mg)
      mesh(G.rbox(0.2, 0.02, 0.14, 0.008), mat(C.monitor), 0, 0.01, 0, mg); mesh(G.box(0.05, 0.17, 0.04), mat(C.monitor), 0, 0.1, 0.02, mg)
      mesh(G.rbox(0.62, 0.38, 0.035, 0.012), mat(C.monitor), 0, 0.36, 0, mg)
      const sc = new T3.Mesh(screenGeo(((o.tile || 0) + i) % 4, 0.57, 0.33), screenMat); sc.position.set(0, 0.36, -0.019); sc.rotation.y = Math.PI; sc.castShadow = false; mg.add(sc)
    }
    mesh(G.rbox(0.44, 0.02, 0.14, 0.006), mat(C.key), 0, hh + 0.01, -0.12, g); mesh(G.rbox(0.07, 0.02, 0.1, 0.01), mat(C.key), 0.32, hh + 0.01, -0.12, g)
    if (o.mug) mesh(G.cyl(0.04, 0.036, 0.09, 12), mat(o.mug), -w / 2 + 0.2, hh + 0.045, -0.08, g)
    if (o.papers) for (let i = 0; i < 3; i++) mesh(G.box(0.21, 0.006, 0.29), mat(C.paper), w / 2 - 0.3 + i * 0.012, hh + 0.004 + i * 0.006, -0.1, g, { ry: i * 0.14 - 0.1 })
    if (o.lamp) {
      const lg = new T3.Group(); lg.position.set(-w / 2 + 0.16, hh, 0.18); g.add(lg)
      mesh(G.cyl(0.07, 0.08, 0.025, 14), mat('#2f343b'), 0, 0.012, 0, lg); mesh(G.box(0.02, 0.32, 0.02), mat('#2f343b'), 0, 0.17, 0, lg, { rz: 0.25 })
      mesh(G.box(0.02, 0.26, 0.02), mat('#2f343b'), 0.1, 0.4, -0.06, lg, { rx: 0.9, rz: -0.4 }); mesh(G.cone(0.07, 0.11, 14), mat('#f3c766'), 0.14, 0.47, -0.15, lg, { rx: -2.3 })
    }
    parent.add(g)
    return g
  }
  function plant(parent, x, z, s, kind) {
    const g = new T3.Group(); g.position.set(x, 0, z); g.scale.setScalar(s); parent.add(g)
    mesh(G.cyl(0.17, 0.13, 0.3, 14), mat(kind === 1 ? C.potT : C.pot), 0, 0.15, 0, g); mesh(G.cyl(0.155, 0.155, 0.02, 14), mat('#6b5544'), 0, 0.29, 0, g, { cast: false })
    const L = mat(C.leaf1, { flatShading: true }), L2 = mat(C.leaf2, { flatShading: true }), L3 = mat(C.leaf3, { flatShading: true })
    if (kind === 1) { // a tall snake plant
      for (let i = 0; i < 7; i++) { const an = i / 7 * Math.PI * 2; mesh(G.cone(0.05, 0.6 + ((i * 37) % 5) * 0.06, 4), i % 2 ? L : L2, Math.cos(an) * 0.06, 0.58, Math.sin(an) * 0.06, g, { rx: Math.sin(an) * 0.18, rz: -Math.cos(an) * 0.18 }) }
    } else {
      mesh(G.ico(0.22, 0), L, 0, 0.5, 0, g); mesh(G.ico(0.17, 0), L2, 0.1, 0.68, -0.04, g); mesh(G.ico(0.14, 0), L3, -0.09, 0.74, 0.06, g); mesh(G.ico(0.12, 0), L, 0.02, 0.84, 0.02, g)
    }
    return g
  }
  function cabinet(parent, x, z, ry, o) {
    const g = new T3.Group(); g.position.set(x, 0, z); g.rotation.y = ry; parent.add(g)
    const w = o.w || 0.85, hh = 0.62, d = 0.4
    mesh(G.rbox(w, hh, d, 0.025), mat(C.cab), 0, hh / 2, 0, g)
    mesh(G.box(w - 0.06, 0.008, 0.01), mat('#d7dbe1'), 0, hh * 0.5, d / 2 + 0.001, g, { cast: false })
    o.binders.forEach((c, i) => mesh(G.rbox(0.075, 0.28, 0.27, 0.01), mat(c), -w / 2 + 0.09 + i * 0.085, hh + 0.14, 0, g, { rz: i === o.binders.length - 1 ? 0.28 : 0 }))
    if (o.box) mesh(G.rbox(0.26, 0.14, 0.24, 0.02), mat('#ffffff'), w / 2 - 0.16, hh + 0.07, 0, g)
    return g
  }
  const rug = (parent, x, z, w, d, col, y) => mesh(flatGeo(w, d, 0.18), mat(col, { roughness: 0.95 }), x, y || 0.006, z, parent)
  const shadeHex = (hex, k) => { const c = new T3.Color(hex); const w = new T3.Color('#ffffff'); return '#' + (k > 0 ? c.lerp(w, k) : c.multiplyScalar(1 + k)).getHexString() }
  const hash = (s) => { let x = 7; for (const ch of String(s)) x = (x * 31 + ch.charCodeAt(0)) >>> 0; return x }
  // a low screen between desks: a fabric panel standing on two feet on the floor
  function partition(parent, x, z, ry, w, hh, col) {
    const g = new T3.Group(); g.position.set(x, 0, z); g.rotation.y = ry; parent.add(g)
    mesh(G.rbox(w, hh - 0.05, 0.05, 0.02), mat(col || C.fabric), 0, 0.04 + (hh - 0.05) / 2, 0, g)
    mesh(G.box(w + 0.01, 0.025, 0.065), mat('#f4f5f7'), 0, hh, 0, g)
    for (const sx of [-1, 1]) mesh(G.box(0.05, 0.04, 0.32), mat(C.leg), sx * (w / 2 - 0.14), 0.02, 0, g)
    return g
  }
  // a sofa along its own x, facing +z; seats are 0.62 apart
  function sofa(parent, x, z, ry, seats, col) {
    const g = new T3.Group(); g.position.set(x, 0, z); g.rotation.y = ry; parent.add(g)
    const w = seats * 0.62 + 0.3, dk = shadeHex(col, -0.12), lt = shadeHex(col, 0.18)
    mesh(G.rbox(w, 0.3, 0.84, 0.05), mat(dk), 0, 0.15, 0, g)
    for (let i = 0; i < seats; i++) mesh(G.rbox(0.6, 0.13, 0.62, 0.05), mat(lt), (i - (seats - 1) / 2) * 0.62, 0.36, 0.08, g)
    mesh(G.rbox(w, 0.42, 0.2, 0.06), mat(col), 0, 0.5, -0.32, g)
    for (const sx of [-1, 1]) mesh(G.rbox(0.16, 0.44, 0.84, 0.05), mat(col), sx * (w / 2 - 0.08), 0.22, 0, g)
    return g
  }
  function coffeeTable(parent, x, z, w, d) {
    mesh(G.rbox(w, 0.04, d, 0.02), mat(C.wood), x, 0.4, z, parent)
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) mesh(G.box(0.04, 0.38, 0.04), mat(C.woodSide), x + sx * (w / 2 - 0.06), 0.19, z + sz * (d / 2 - 0.06), parent)
    mesh(G.cyl(0.04, 0.036, 0.09, 12), mat('#f4f1ea'), x - w * 0.2, 0.465, z + d * 0.1, parent)
    mesh(G.box(0.22, 0.012, 0.3), mat(C.paper), x + w * 0.15, 0.426, z - d * 0.1, parent, { ry: 0.3 })
  }

  // One work station per desk podium, flat on the floor. Station frame: the
  // desk at the back (-z) behind a low screen, the seated person faces -z,
  // the open front (+z) leads to the aisle. Returns where a person sits, where
  // one stands, and the point in front of the chair a walker comes in by.
  const STATION = {
    desk(p, st) {
      const k = hash(p.agent || p.id), wood = k % 2 === 0, mons = 1 + ((k >> 3) % 2)
      rug(st, 0, 0.05, 2.5, 2.4, shadeHex(p.shirt || '#94a3b8', 0.9))
      desk(0, -0.55, Math.PI, st, { w: 1.5, d: 0.7, top: wood ? C.wood : C.desk, leg: wood ? C.woodSide : C.leg, mons, tile: (k >> 5) % 4, mug: p.shirt || C.blue, papers: true, lamp: mons !== 2 })
      chair(0, 0.24, Math.PI, st)
      cabinet(st, 1.12, -0.35, -Math.PI / 2, { w: 0.8, binders: mons === 2 ? ['#334155', '#64748b', '#cbd5e1', '#2563eb', '#93b4f5'] : ['#2563eb', '#93b4f5', '#cbd5e1', '#64748b', '#f0b44c', '#e2e8f0'], box: mons !== 2 })
      partition(st, 0, -1.3, 0, 2.5, 1.15)
      plant(st, -1.12, -0.95, 0.85, mons === 2 ? 1 : 0)
      return { sit: { x: 0, z: 0.2, ry: Math.PI }, stand: { x: 0.72, z: 0.62, cam: -0.35 }, front: { x: 0, z: 0.95 } }
    },
  }

  // ---------- the supervisor's station: a low lilac platform in the middle of
  // the floor, a wide desk the supervisor sits behind facing the room, the
  // in-tray on it, and a tall panel with the sign. Visitors stand in front.
  const DAIS = 0.06, SUP_S = 3.6
  const SUP_COL = { top: '#ECE6F7', edge: '#CDBEEC', panel: '#D9CDF2', ink: '#4F3F86', chair: '#8E7DBA' }
  function supStation(st, label) {
    mesh(G.rbox(SUP_S, DAIS, SUP_S, 0.028), mat(SUP_COL.edge, { roughness: 0.85 }), 0, DAIS / 2, 0, st)
    mesh(flatGeo(SUP_S - 0.12, SUP_S - 0.12, 0.2), mat(SUP_COL.top, { roughness: 0.9 }), 0, DAIS + 0.001, 0, st)
    const top = new T3.Group(); top.position.y = DAIS; st.add(top)
    desk(0, -0.35, 0, top, { w: 2.1, d: 0.85, top: C.wood, leg: C.woodSide, mons: 0, mug: SUP_COL.chair })
    // a laptop, low enough that the supervisor's face shows over it
    const lp = new T3.Group(); lp.position.set(-0.35, 0.74, -0.5); top.add(lp)
    mesh(G.rbox(0.36, 0.018, 0.25, 0.006), mat('#c9ced4', { metalness: 0.3, roughness: 0.4 }), 0, 0.009, 0, lp)
    const scr = mesh(G.rbox(0.36, 0.24, 0.012, 0.006), mat('#c9ced4', { metalness: 0.3, roughness: 0.4 }), 0, 0.12, -0.125, lp, { rx: 0.25 })
    const sc = new T3.Mesh(screenGeo(2, 0.32, 0.2), screenMat); sc.position.set(0, 0, 0.007); scr.add(sc)
    for (let i = 0; i < 3; i++) mesh(G.box(0.21, 0.006, 0.29), mat(C.paper), 0.1 + i * 0.012, 0.744 + i * 0.006, -0.42, top, { ry: i * 0.14 - 0.1 })
    // the in-tray, at the desk's front corner
    mesh(G.rbox(0.5, 0.03, 0.44, 0.012), mat(C.blue), SUP_TRAY.x, 0.755, SUP_TRAY.z, top)
    for (const [dx, dz, w, d] of [[0, 0.21, 0.5, 0.025], [0, -0.21, 0.5, 0.025], [0.24, 0, 0.025, 0.44], [-0.24, 0, 0.025, 0.44]]) mesh(G.box(w, 0.06, d), mat(C.blue), SUP_TRAY.x + dx, 0.785, SUP_TRAY.z + dz, top)
    chair(0, -1.02, 0, top, SUP_COL.chair)
    // the panel behind, with the sign
    mesh(G.rbox(2.9, 2.0, 0.08, 0.03), mat(SUP_COL.panel), 0, 1.0, -1.55, top)
    mesh(G.box(2.92, 0.03, 0.1), mat('#f4f5f7'), 0, 2.01, -1.55, top)
    const sign = new T3.Mesh(geo('supSign', () => new T3.PlaneGeometry(2.2, 0.5)), new T3.MeshBasicMaterial({ map: textTex([{ text: label, size: 104, color: SUP_COL.ink }], { w: 1024, h: 232, bg: '#FFFFFF', r: 24 }), toneMapped: false }))
    sign.position.set(0, 1.5, -1.505); sign.userData.noMerge = true; top.add(sign)
    plant(top, -1.45, -1.4, 1.05, 1); plant(top, 1.5, -1.35, 0.8, 0)
    return {
      sit: { x: 0, z: -0.98, ry: 0 }, stand: { x: -0.75, z: -0.95, cam: -0.2 },
      // visitors line up in front of the desk, facing the supervisor
      visits: [{ x: 0.5, z: 0.62 }, { x: -0.35, z: 0.66 }, { x: 1.3, z: 0.6 }, { x: -1.15, z: 0.7 }],
    }
  }
  const SUP_TRAY = { x: 0.7, z: -0.2 }

  // ---------- the room around the desks: the floor and its zones, two walls
  // with windows, the project screens and the door, the lounge and the
  // reception. r: { X0, X1, Z0, Z1, xa, xb, za, zb } (see build).
  const ZONE = { room: '#F5F4F1', work: '#EEF1F4', lounge: '#EFE6DA', reception: '#E9EDF2', label: '#8C96A1' }
  function floorText(parent, text, x, z, w, ry) {
    const t = new T3.Mesh(geo('ft' + w, () => { const g = new T3.PlaneGeometry(w, w / 4); g.rotateX(-Math.PI / 2); return g }), new T3.MeshBasicMaterial({ map: textTex([{ text, size: 72, color: ZONE.label }], { w: 1024, h: 256 }), transparent: true, depthWrite: false, toneMapped: false }))
    t.position.set(x, 0.012, z); t.rotation.y = ry || 0; t.userData.noMerge = true; parent.add(t)
    return t
  }
  function room(parent, r, title, color) {
    const W = r.X1 - r.X0, D = r.Z1 - r.Z0
    const slab = (x0, x1, z0, z1, col, y) => mesh(G.plane(), mat(col, { roughness: 0.95 }), (x0 + x1) / 2, y, (z0 + z1) / 2, parent).scale.set(x1 - x0, 1, z1 - z0)
    slab(r.X0, r.X1, r.Z0, r.Z1, ZONE.room, 0.002)
    if (color) {
      // the office's colour: a border round the floor, along the two open sides, and a low kerb under it
      const dark = '#' + new T3.Color(color).multiplyScalar(0.66).getHexString()
      const B = 0.5
      slab(r.X0, r.X1, r.Z1 - B, r.Z1, color, 0.0025); slab(r.X1 - B, r.X1, r.Z0, r.Z1, color, 0.0025)
      mesh(G.box(W + 0.02, 0.16, 0.08), mat(dark), r.X0 + W / 2, 0.08, r.Z1 + 0.04, parent)
      mesh(G.box(0.08, 0.16, D + 0.1), mat(dark), r.X1 + 0.04, 0.08, r.Z0 + D / 2 + 0.02, parent)
      // the sign on the back wall: the name in white on the dark shade, for contrast
      if (title) {
        const sw = Math.min(5.2, Math.max(2.8, title.length * 0.34 + 1))
        const sign = new T3.Mesh(geo('wallSign' + sw.toFixed(2), () => new T3.PlaneGeometry(sw, 0.4)), new T3.MeshBasicMaterial({ map: textTex([{ text: title, size: 72, color: '#FFFFFF', y: 52 }], { w: Math.round(1024 * sw / 4.2), h: 99, bg: dark, align: 'left', pad: 28 }), toneMapped: false }))
        // above the window heads (2.28 m), under the wall's cap
        sign.position.set(r.X1 - sw / 2 - 0.6, 2.49, r.Z0 + 0.012); sign.userData.noMerge = true; parent.add(sign)
      }
    }
    slab(r.xa + 0.15, r.xb - 0.15, r.za + 0.15, r.zb - 0.15, ZONE.work, 0.003)
    slab(r.X0 + 0.15, r.X1 - 0.15, r.Z0 + 0.15, r.za - 0.4, ZONE.lounge, 0.003)
    slab(r.X0 + 0.15, r.X0 + 5.2, r.zb + 0.45, r.Z1 - 0.15, ZONE.reception, 0.003)
    // the walls: only the two at the back, so nothing stands between the camera and the floor
    const wall = mat('#F8F8F6', { roughness: 0.9 }), cap = mat('#E2E5E9'), skirt = mat('#D8DCE1')
    const WH = 2.7, WT = 0.14
    mesh(G.box(WT, WH, D + WT), wall, r.X0 - WT / 2, WH / 2, r.Z0 + D / 2 - WT / 2, parent)
    mesh(G.box(W + WT, WH, WT), wall, r.X0 + W / 2 - WT / 2, WH / 2, r.Z0 - WT / 2, parent)
    mesh(G.box(WT + 0.02, 0.04, D + WT), cap, r.X0 - WT / 2, WH + 0.02, r.Z0 + D / 2 - WT / 2, parent)
    mesh(G.box(W + WT, 0.04, WT + 0.02), cap, r.X0 + W / 2 - WT / 2, WH + 0.02, r.Z0 - WT / 2, parent)
    mesh(G.box(0.02, 0.1, D), skirt, r.X0 + 0.01, 0.05, r.Z0 + D / 2, parent)
    mesh(G.box(W, 0.1, 0.02), skirt, r.X0 + W / 2, 0.05, r.Z0 + 0.01, parent)
    // windows: daylight glass in white frames, along the back wall and the lounge end of the side wall
    const glass = new T3.MeshStandardMaterial({ color: '#CFE0EE', emissive: '#DCEAF6', emissiveIntensity: 0.45, roughness: 0.25 }), frame = mat('#FFFFFF')
    const winX = (x) => { mesh(G.box(1.3, 1.3, 0.02), glass, x, 1.62, r.Z0 + 0.012, parent); mesh(G.box(1.42, 0.06, 0.05), frame, x, 0.96, r.Z0 + 0.025, parent); mesh(G.box(1.42, 0.06, 0.05), frame, x, 2.28, r.Z0 + 0.025, parent); for (const dx of [-0.68, 0, 0.68]) mesh(G.box(0.05, 1.32, 0.05), frame, x + dx, 1.62, r.Z0 + 0.025, parent) }
    const winZ = (z) => { mesh(G.box(0.02, 1.3, 1.3), glass, r.X0 + 0.012, 1.62, z, parent); mesh(G.box(0.05, 0.06, 1.42), frame, r.X0 + 0.025, 0.96, z, parent); mesh(G.box(0.05, 0.06, 1.42), frame, r.X0 + 0.025, 2.28, z, parent); for (const dz of [-0.68, 0, 0.68]) mesh(G.box(0.05, 1.32, 0.05), frame, r.X0 + 0.025, 1.62, z + dz, parent) }
    for (let x = r.X0 + 1.4; x < r.X1 - 0.9; x += 2.1) winX(x)
    for (let z = r.Z0 + 1.4; z < r.za - 0.6; z += 2.1) winZ(z)
    // the door: glass doors in the side wall, by the reception, with a mat in front
    const dz0 = r.zb + 1.95
    mesh(G.box(0.03, 2.2, 1.7), mat('#8D99A6'), r.X0 + 0.015, 1.1, dz0, parent)
    for (const s of [-1, 1]) mesh(G.box(0.02, 2.06, 0.76), new T3.MeshStandardMaterial({ color: '#BFD2E2', emissive: '#D7E6F2', emissiveIntensity: 0.35, roughness: 0.2 }), r.X0 + 0.035, 1.08, dz0 + s * 0.4, parent)
    mesh(G.box(0.05, 0.4, 0.03), mat('#5F6B78'), r.X0 + 0.06, 1.05, dz0 - 0.05, parent); mesh(G.box(0.05, 0.4, 0.03), mat('#5F6B78'), r.X0 + 0.06, 1.05, dz0 + 0.05, parent)
    rug(parent, r.X0 + 0.75, dz0, 1.1, 1.8, '#9AA5B1')
    // the reception: a long counter facing the room, the office's name on its front
    const rx = r.X0 + 2.75, rz = r.zb + 1.65
    mesh(G.rbox(2.6, 1.02, 0.6, 0.04), mat('#F2F3F5'), rx, 0.51, rz, parent)
    mesh(G.rbox(2.72, 0.05, 0.72, 0.02), mat(C.wood), rx, 1.045, rz, parent)
    mesh(G.box(2.62, 0.05, 0.62), mat(C.woodSide), rx, 0.04, rz, parent)
    const name = new T3.Mesh(geo('recName', () => new T3.PlaneGeometry(2.3, 0.62)), new T3.MeshBasicMaterial({ map: textTex([{ text: title || T('Reception'), size: 62, color: '#34404D', y: 92 }, { text: T('Reception'), size: 38, bold: false, color: '#7A8591', y: 176 }], { w: 1024, h: 276 }), transparent: true, toneMapped: false }))
    name.position.set(rx, 0.56, rz + 0.305); name.userData.noMerge = true; parent.add(name)
    chair(rx + 0.4, rz - 0.75, 0, parent, '#5E6B79')
    const mon = new T3.Group(); mon.position.set(rx + 0.45, 1.07, rz - 0.12); mon.rotation.y = Math.PI; parent.add(mon)
    mesh(G.box(0.05, 0.16, 0.04), mat(C.monitor), 0, 0.08, 0.02, mon); mesh(G.rbox(0.5, 0.31, 0.03, 0.01), mat(C.monitor), 0, 0.3, 0, mon)
    plant(parent, rx - 1.75, rz, 1.0, 1); plant(parent, r.X0 + 0.55, r.Z1 - 0.55, 0.9, 0)
    // plants in the corners, by the windows
    plant(parent, r.X0 + 0.55, r.Z0 + 0.55, 1.25, 1); plant(parent, r.X1 - 0.6, r.Z0 + 0.6, 1.1, 0)
    floorText(parent, T('Reception'), rx, r.Z1 - 0.55, 2.4)
    floorText(parent, T('Work area'), r.xb - 1.6, r.zb - 0.6, 2.4)
  }

