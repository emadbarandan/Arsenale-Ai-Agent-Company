  /** The lounge along the back wall: sofa groups round coffee tables, then a
   *  coffee bar. Every seat, and the standing places at the bar for anyone
   *  left over, comes with the way in from the aisle. Walkers use the strip
   *  zC between the sofas and the low screen; the screen has a gap at every
   *  aisle. */
  function lounge(parent, r, need, aisleXs) {
    const zC = r.za - 0.6, gz = r.za - 2.0
    const nearAisle = (x) => aisleXs.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a), aisleXs[0])
    const seats = []
    const fit = Math.max(1, Math.floor((r.X1 - r.X0 - 1.6 - 2.8) / 3.6))
    const groups = Math.max(1, Math.min(fit, Math.ceil(need / 6)))
    const cols = ['#93A6B8', '#B8A691', '#9DB2A5']
    let gx = r.X0 + 2.3
    for (let gi = 0; gi < groups; gi++, gx += 3.6) {
      rug(parent, gx, gz, 3.3, 2.5, gi % 2 ? '#E6DCCE' : '#E3E6E1', 0.006)
      coffeeTable(parent, gx, gz, 0.52, 1.3)
      for (const side of [-1, 1]) {
        // two sofas facing each other across the table, along z
        sofa(parent, gx + side * 1.17, gz, side < 0 ? Math.PI / 2 : -Math.PI / 2, 3, cols[(gi + (side > 0 ? 1 : 0)) % cols.length])
        const fx = gx + side * 0.5, ax = nearAisle(fx)
        for (const dz of [-0.62, 0, 0.62]) {
          seats.push({
            sit: { x: gx + side * 1.12, z: gz + dz, rot: side < 0 ? Math.PI / 2 : -Math.PI / 2 },
            front: { x: fx, z: gz + dz, rot: side < 0 ? Math.PI / 2 : -Math.PI / 2 },
            inward: [{ x: ax, z: zC }, { x: fx, z: zC }, { x: fx, z: gz + dz }],
            exit: { x: ax, z: r.za, net: true }, sofa: true,
          })
        }
      }
    }
    // the coffee bar against the back wall, after the last group
    const bx = gx - 3.6 + 2.9
    mesh(G.rbox(2.2, 0.9, 0.6, 0.03), mat('#F2F3F5'), bx + 0.9, 0.45, r.Z0 + 0.35, parent)
    mesh(G.rbox(2.3, 0.04, 0.66, 0.015), mat(C.wood), bx + 0.9, 0.92, r.Z0 + 0.36, parent)
    const cm = new T3.Group(); cm.position.set(bx + 0.35, 0.94, r.Z0 + 0.32); parent.add(cm)
    mesh(G.rbox(0.36, 0.46, 0.38, 0.03), mat('#2F343B'), 0, 0.23, 0, cm)
    mesh(G.rbox(0.3, 0.1, 0.06, 0.01), mat('#C9CED4', { metalness: 0.4, roughness: 0.35 }), 0, 0.38, 0.2, cm)
    mesh(G.box(0.16, 0.02, 0.12), mat('#C9CED4', { metalness: 0.4, roughness: 0.35 }), 0, 0.05, 0.16, cm)
    mesh(G.cyl(0.035, 0.03, 0.08, 12), mat('#f4f1ea'), 0, 0.1, 0.17, cm)
    for (let i = 0; i < 4; i++) mesh(G.cyl(0.035, 0.03, 0.08, 12), mat(['#f4f1ea', '#93A6B8', '#f4f1ea', '#B8A691'][i]), bx + 0.85 + i * 0.12, 0.98, r.Z0 + 0.4, parent)
    mesh(G.rbox(0.62, 1.7, 0.6, 0.03), mat('#E4E7EB'), bx + 2.35, 0.85, r.Z0 + 0.35, parent) // a fridge
    plant(parent, bx + 3.05, r.Z0 + 0.45, 0.95, 0)
    // standing places at the bar for whoever finds no seat
    for (let i = 0; seats.length < need; i++) {
      const sx = bx + 0.3 + (i % 4) * 0.62, sz = r.Z0 + 1.15 + Math.floor(i / 4) * 0.62
      if (sz > zC - 0.4) break
      const ax = nearAisle(sx)
      seats.push({ sit: null, front: { x: sx, z: sz, rot: Math.PI }, inward: [{ x: ax, z: zC }, { x: sx, z: zC }, { x: sx, z: sz }], exit: { x: ax, z: r.za, net: true }, sofa: false })
    }
    // the low screen between the lounge and the desks, open at every aisle
    const pz = r.za - 0.24
    const gaps = aisleXs.slice().sort((a, b) => a - b)
    let x0 = r.X0 + 0.2
    for (const gxp of gaps.concat([r.X1 + 0.65])) {
      const x1 = Math.min(gxp - 0.65, r.X1 - 0.2)
      if (x1 - x0 > 0.5) partition(parent, (x0 + x1) / 2, pz, 0, x1 - x0, 0.95, '#C9D6CF')
      x0 = gxp + 0.65
    }
    floorText(parent, T('Lounge'), r.X0 + 2.3, zC + 0.02, 2.2)
    return { seats, zC, taken: new Map() }
  }

  // ---------- characters: one GLB template, cloned and baked per person
  const TARGET_H = 1.5, SEATED_H = 1.35
  const CLIP_RX = {
    idle: [/idle/i, /breath/i, /stand/i],
    typing: [/typing/i, /working/i, /\bwork/i, /type/i, /write/i, /keyboard/i],
    thinking: [/think/i, /ponder/i, /look/i],
    celebrate: [/celebrat/i, /cheer/i, /victory/i, /dance/i, /jump/i, /wave/i],
    // walking between the lounge, the supervisor and the desk; a file without
    // a walk clip glides in its idle pose, and one without a standing clip
    // waits at the supervisor in its idle pose
    walk: [/walk/i, /run/i, /stroll/i],
    stand: [/^stand/i, /standing/i, /wait/i],
    // the seated pose itself: on a sofa, and at a desk while the person thinks
    sit: [/^sit$/i, /seated/i],
  }
  // The shipped set (tools/characters) has exactly six clips, and each state
  // finds its own: working = Typing, walking = Walk, sitting = Sit, idle = Idle,
  // waiting at the supervisor = Stand, done = Celebrate.
  const SEATED_RX = /sit|seated/i
  const loader = new X.GLTFLoader()
  const parse = (buf) => new Promise((res, rej) => loader.parse(buf, '', res, rej))
  const fromB64 = (b64) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer }
  const templates = new Map() // agent ('' = the default) -> { gltf, name, bytes, source, seated, isDefault }
  function clipFor(clips, state, seated) {
    const pick = (rxs) => { for (const rx of rxs) { const c = clips.find((x) => rx.test(x.name)); if (c) return c } return null }
    if (seated && state === 'idle') { const c = clips.find((x) => SEATED_RX.test(x.name) && /idle/i.test(x.name)) || clips.find((x) => /^sit$/i.test(x.name)); if (c) return c }
    // a seated file's own idle stands in for its missing standing pose only when it is not a seated idle
    return pick(CLIP_RX[state]) || (state !== 'idle' ? clipFor(clips, 'idle', seated && state !== 'walk' && state !== 'stand') : (clips[0] || null))
  }
  async function addTemplate(agent, buf, name, source) {
    const gltf = await parse(buf)
    const ex = (gltf.scene && gltf.scene.userData && gltf.scene.userData.arsenale) || {}
    const clips = gltf.animations || []
    const tpl = { gltf, name, bytes: buf.byteLength, source, isDefault: !!ex.default, office: !!ex.office, seated: !!ex.seated || clips.some((c) => SEATED_RX.test(c.name)) }
    templates.set(agent, tpl)
    return tpl
  }
  // Whose model: the person's own file, else one of the shipped set picked by
  // the person's seed (the same pick the campus and the lists make, OFFICE_LOOK),
  // else the default character.
  let booted = false // set when every shipped character is parsed; nobody is drawn before, so nobody is swapped for another model
  function tplFor(src) {
    if (!booted) return null
    const own = templates.get(src.agent)
    if (own) return own
    if (typeof OFFICE_LOOK === 'object') { const t = templates.get('~set:' + OFFICE_LOOK.variant(src.seed || src.agent)); if (t) return t }
    return templates.get('')
  }
  // The office's colour on the shirt of a shipped character: one material for each colour, shared
  const shirtMats = new Map()
  function shirtMat(hex) {
    if (!shirtMats.has(hex)) shirtMats.set(hex, new T3.MeshStandardMaterial({ name: 'Shirt', vertexColors: true, color: hex, roughness: 0.8, metalness: 0 }))
    return shirtMats.get(hex)
  }
  // the person's own colours on the default character: skin, hair and the
  // shirt in their role colour. A file of someone's own keeps its colours.
  const TINT = { Skin: 'skin', Hair: 'hair', Shirt: 'shirt' }
  const charMat = new T3.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0 })
  // Bakes the plain-coloured meshes of a cloned character into ONE rigidly
  // skinned mesh (one draw call), with the meshes' own nodes as the bones, so
  // the clips still move them. The originals stay in the tree, switched off
  // with layers (visible = false would hide their children too).
  function bake(model, colours) {
    model.updateMatrixWorld(true)
    const inv = model.matrixWorld.clone().invert(), parts = [], joints = [], m4 = new T3.Matrix4()
    model.traverse((o) => {
      if (!o.isMesh || o.isSkinnedMesh) return
      const m = o.material
      if (Array.isArray(m) || !m.isMeshStandardMaterial || m.map || m.transparent || (m.emissive && m.emissive.getHex() !== 0)) return
      let ji = joints.indexOf(o)
      if (ji < 0) { joints.push(o); ji = joints.length - 1 }
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()
      g.applyMatrix4(m4.multiplyMatrices(inv, o.matrixWorld))
      const tint = colours && TINT[m.name] && colours[TINT[m.name]]
      parts.push({ g, c: tint ? new T3.Color(tint) : m.color, ji })
    })
    if (!parts.length) return null
    let n = 0
    parts.forEach((p) => { n += p.g.attributes.position.count })
    const P = new Float32Array(n * 3), N = new Float32Array(n * 3), Cc = new Float32Array(n * 3), SI = new Uint16Array(n * 4), SW = new Float32Array(n * 4)
    let o = 0
    for (const p of parts) {
      const c = p.g.attributes.position.count
      P.set(p.g.attributes.position.array, o * 3); N.set(p.g.attributes.normal.array, o * 3)
      for (let i = 0; i < c; i++) { Cc[(o + i) * 3] = p.c.r; Cc[(o + i) * 3 + 1] = p.c.g; Cc[(o + i) * 3 + 2] = p.c.b; SI[(o + i) * 4] = p.ji; SW[(o + i) * 4] = 1 }
      o += c
      p.g.dispose()
    }
    const g = new T3.BufferGeometry()
    g.setAttribute('position', new T3.BufferAttribute(P, 3)); g.setAttribute('normal', new T3.BufferAttribute(N, 3)); g.setAttribute('color', new T3.BufferAttribute(Cc, 3))
    g.setAttribute('skinIndex', new T3.Uint16BufferAttribute(SI, 4)); g.setAttribute('skinWeight', new T3.BufferAttribute(SW, 4))
    const sm = new T3.SkinnedMesh(g, charMat); sm.frustumCulled = false
    model.add(sm); model.updateMatrixWorld(true); sm.bind(new T3.Skeleton(joints), sm.matrixWorld)
    for (const j of joints) j.layers.disableAll()
    return sm
  }
  function makeCharacter(p, tpl) {
    const model = X.clone(tpl.gltf.scene)
    let tris = 0
    model.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; if (o.isSkinnedMesh) o.frustumCulled = false; const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3 } })
    const holder = new T3.Group(); holder.add(model)
    model.updateMatrixWorld(true)
    const box = new T3.Box3().setFromObject(model, true), size = box.getSize(new T3.Vector3())
    const want = tpl.seated ? SEATED_H : TARGET_H
    const s = tpl.isDefault ? 1 : want / (size.y || 1) // the default is made to size
    model.scale.multiplyScalar(s)
    model.updateMatrixWorld(true); box.setFromObject(model, true)
    const c = box.getCenter(new T3.Vector3())
    model.position.y -= box.min.y // the feet on the floor
    if (Math.hypot(c.x, c.z) > 0.25 * TARGET_H) { model.position.x -= c.x; model.position.z -= c.z } // a badly placed origin
    bake(model, tpl.isDefault ? { skin: p.skin, hair: p.hair, shirt: p.shirt } : null)
    if (tpl.office) { const tone = p.tone || p.shirt || '#6F7B88'; model.traverse((o) => { if (o.isMesh && o.material && o.material.name === 'Shirt') o.material = shirtMat(tone) }) }
    const clips = tpl.gltf.animations || []
    const mixer = new T3.AnimationMixer(model), map = {}
    for (const k of Object.keys(CLIP_RX)) { const cl = clipFor(clips, k, tpl.seated); map[k] = cl ? cl.name : null }
    // the default sits in its rest pose; standing up adds the thighs' length (0.36 m)
    const height = size.y * s
    return { holder, model, mixer, clips, map, tpl, tris: Math.round(tris), actions: {}, cur: null, height, standH: tpl.seated && map.walk ? height + 0.36 : height }
  }
  function playState(ch, state, now) {
    if (!ch || (ch.cur === state && !now)) return
    const name = ch.map[state] || ch.map.idle
    const prev = ch.cur ? ch.actions[ch.cur] : null
    ch.cur = state
    if (!name) { if (prev) prev.fadeOut(0.3); return }
    const clip = ch.clips.find((c) => c.name === name)
    let act = Object.values(ch.actions).find((x) => x.getClip() === clip)
    if (!act) act = ch.mixer.clipAction(clip)
    ch.actions[state] = act
    if (prev === act) return
    act.reset().setEffectiveWeight(1).fadeIn(now ? 0 : 0.3).play()
    if (prev) prev.fadeOut(0.3)
  }

  // remember dropped characters in this browser; every call is wrapped so the page works without IndexedDB
  let idb = null
  const idbOpen = () => new Promise((res) => { try { const r = indexedDB.open('arsenale-office-characters', 1); r.onupgradeneeded = () => r.result.createObjectStore('glb'); r.onsuccess = () => res(idb = r.result); r.onerror = () => res(null) } catch (e) { res(null) } })
  const idbPut = (k, v) => { try { if (idb) idb.transaction('glb', 'readwrite').objectStore('glb').put(v, k) } catch (e) { /* not kept */ } }
  const idbDel = (k) => { try { if (idb) idb.transaction('glb', 'readwrite').objectStore('glb').delete(k) } catch (e) { /* nothing to forget */ } }
  const idbAll = () => new Promise((res) => { try { if (!idb) return res([]); const out = [], rq = idb.transaction('glb', 'readonly').objectStore('glb').openCursor(); rq.onsuccess = () => { const c = rq.result; if (c) { out.push([c.key, c.value]); c.continue() } else res(out) }; rq.onerror = () => res([]) } catch (e) { res([]) } })

  // ---------- the office: work stations round the supervisor's station, in a room
  const PITCH = 4.75
  let O = null // { key, group, dyn, merged, byId, pick, bounds, r, sup, lounge, boards, boardSig }
  const cells = new Map() // office key -> Map(podium id -> [i, j])
  const ringGeo = new Map()
  function podRing(S, w) {
    const k = S + '|' + w
    if (!ringGeo.has(k)) { const sh = rrShape(S + 0.02, S + 0.02, 0.44); sh.holes.push(rrShape(S + 0.02 - 2 * w, S + 0.02 - 2 * w, 0.44 - w)); const g = new T3.ShapeGeometry(sh, 12); g.rotateX(-Math.PI / 2); ringGeo.set(k, g) }
    return ringGeo.get(k)
  }
  const selRing = new T3.Mesh(podRing(3, 0.05), new T3.MeshBasicMaterial({ color: C.blue, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false }))
  const hovRing = new T3.Mesh(podRing(3, 0.05), new T3.MeshBasicMaterial({ color: '#94a3b8', transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }))
  selRing.visible = hovRing.visible = false; selRing.renderOrder = hovRing.renderOrder = 2
  scene.add(selRing, hovRing)
  // the ground every office stands on: wide enough that zooming out never shows its edge
  const ground = new T3.Mesh(G.plane(), new T3.MeshBasicMaterial({ map: groundTex, transparent: true, depthWrite: false }))
  ground.scale.set(480, 1, 480); groundTex.repeat.set(240, 240); scene.add(ground)
  const TRAY_MAX = 14
  const trayPapers = new T3.InstancedMesh(G.box(0.3, 0.012, 0.4), mat('#ffffff'), TRAY_MAX)
  trayPapers.count = 0
  scene.add(trayPapers)
  const flyPaper = mesh(G.box(0.22, 0.012, 0.3), mat('#ffffff'), 0, 0, 0, scene); flyPaper.visible = false
  let fly = null
  const linkMat = new T3.LineDashedMaterial({ color: '#2B6CB0', dashSize: 0.18, gapSize: 0.12, transparent: true, opacity: 0.9 })
  let links = null, linkSig = ''
  const STATE_COL = { working: '#2563eb', quiet: '#f59e0b', waiting: '#f59e0b', findings: '#f59e0b', failed: '#ef4444', done: '#22c55e', idle: '#a3aab5', away: '#a3aab5', none: '#a3aab5' }

  // cells around the centre, nearest first: the supervisor's station is the centre
  function cellOrder(n) {
    const out = []
    for (let r = 1; out.length < n + 8; r++) {
      const ring = []
      for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) if (Math.max(Math.abs(i), Math.abs(j)) === r) ring.push([i, j])
      ring.sort((a, b) => (Math.atan2(a[1], a[0]) + 7) % (2 * Math.PI) - (Math.atan2(b[1], b[0]) + 7) % (2 * Math.PI))
      out.push(...ring)
    }
    return out
  }
  // A desk keeps its cell while it is on the floor: someone starting work
  // never makes the others move. The tray has no cell: it is on the
  // supervisor's desk.
  function layout(key, pods) {
    let map = cells.get(key)
    if (!map) { map = new Map(); cells.set(key, map) }
    const ids = new Set(pods.filter((p) => p.kind !== 'tray').map((p) => p.id))
    for (const id of [...map.keys()]) if (!ids.has(id)) map.delete(id)
    const used = new Set([...map.values()].map((c) => c.join(',')))
    const lead = pods.find((p) => p.kind === 'lead')
    if (lead && !map.has(lead.id)) map.set(lead.id, [0, 0])
    used.add('0,0')
    const free = cellOrder(pods.length).filter((c) => !used.has(c.join(',')))
    for (const p of pods) if (p.kind !== 'tray' && !map.has(p.id)) map.set(p.id, free.shift())
    return map
  }
  function disposeOffice() {
    if (!O) return
    scene.remove(O.group)
    O.merged.children.forEach((m) => m.geometry.dispose())
    O.group.traverse((o) => { if (o.userData.noMerge && o.material && o.material.map) { o.material.map.dispose(); o.material.dispose() } })
    for (const p of O.byId.values()) if (p.ch) p.ch.mixer.stopAllAction()
    O = null
  }
  function build(model) {
    const prevChars = new Map()
    if (O) for (const p of O.byId.values()) if (p.ch) prevChars.set(p.id + '|' + p.charSig, p.ch)
    disposeOffice()
    const map = layout(model.key, model.podiums)
    const group = new T3.Group(), decor = new T3.Group(), dyn = new T3.Group(), pick = []
    const byId = new Map()
    let imin = 0, imax = 0, jmin = 0, jmax = 0
    for (const [i, j] of map.values()) { imin = Math.min(imin, i); imax = Math.max(imax, i); jmin = Math.min(jmin, j); jmax = Math.max(jmax, j) }
    // the aisles run between the cells: x = (k + 0.5) * PITCH and z = (l + 0.5) * PITCH
    const r = { xa: (imin - 0.5) * PITCH, xb: (imax + 0.5) * PITCH, za: (jmin - 0.5) * PITCH, zb: (jmax + 0.5) * PITCH }
    r.X0 = r.xa - 1.1; r.X1 = r.xb + 0.9; r.Z0 = r.za - 4.1; r.Z1 = r.zb + 3.1
    const aisleXs = []
    for (let k = imin - 1; k <= imax; k++) aisleXs.push((k + 0.5) * PITCH)
    const W3 = (st, s, y) => { const v = new T3.Vector3(s.x, 0, s.z); st.localToWorld(v); return { x: v.x, z: v.z, y: y || 0, rot: s.rot !== undefined ? s.rot : s.cam !== undefined ? VIEW0.azim + s.cam : st.rotation.y + (s.ry || 0) } }
    const lead = model.podiums.find((p) => p.kind === 'lead')
    // the supervisor's station is always there, whether or not someone sits at it
    const sg = new T3.Group(); decor.add(sg)
    const ss = supStation(sg, model.supLabel || T('Supervisor'))
    decor.updateMatrixWorld(true)
    const sup = {
      x: 0, z: 0, exit: { x: PITCH / 2, z: PITCH / 2, net: true }, taken: new Map(),
      sit: W3(sg, ss.sit, DAIS), stand: W3(sg, ss.stand, DAIS), visits: ss.visits.map((v) => W3(sg, Object.assign({ rot: Math.PI }, v), DAIS)),
      trayAt: new T3.Vector3(SUP_TRAY.x, DAIS + 0.775, SUP_TRAY.z), hand: new T3.Vector3(0.1, DAIS + 0.77, -0.42),
    }
    const addPick = (id, x, y, z, w, hh, d) => { const pr = new T3.Mesh(G.box(w, hh, d), new T3.MeshBasicMaterial()); pr.visible = false; pr.position.set(x, y, z); pr.userData.id = id; group.add(pr); pick.push(pr) }
    const addDiamond = (p) => {
      p.pb = new T3.Mesh(geo('pbOct', () => new T3.OctahedronGeometry(0.11, 0)), new T3.MeshStandardMaterial({ color: '#a3aab5', emissive: '#a3aab5', emissiveIntensity: 0.45, roughness: 0.25, flatShading: true }))
      p.pb.scale.set(1, 1.75, 1)
      dyn.add(p.pb)
    }
    let desks = 0
    for (const src of model.podiums) {
      if (src.kind === 'tray') {
        const p = { id: src.id, kind: 'tray', x: SUP_TRAY.x, z: SUP_TRAY.z, S: 0.9, ringY: DAIS + 0.012, src, trayAt: sup.trayAt }
        addPick(src.id, p.x, DAIS + 0.95, p.z, 0.8, 0.5, 0.7)
        byId.set(src.id, p)
        continue
      }
      if (src.kind === 'lead') {
        const p = { id: src.id, kind: 'lead', x: 0, z: 0, S: SUP_S, ringY: DAIS + 0.012, src, sit: sup.sit, stand: sup.stand }
        addPick(src.id, 0, 1.3, -0.6, SUP_S, 2.6, 2.2)
        addDiamond(p)
        byId.set(src.id, p)
        continue
      }
      desks++
      const S = 3.0, [i, j] = map.get(src.id), x = i * PITCH, z = j * PITCH
      const pg = new T3.Group(); pg.position.set(x, 0, z); decor.add(pg)
      const st = new T3.Group(); st.rotation.y = hash(src.id) % 3 === 1 ? Math.PI / 2 : 0; pg.add(st)
      const spots = STATION.desk(src, st)
      decor.updateMatrixWorld(true)
      // the station's open front faces +z or +x, so the corner of the aisles at (+, +) is always its way out
      const p = { id: src.id, kind: 'desk', x, z, S, ringY: 0.012, src, sit: W3(st, spots.sit), stand: W3(st, spots.stand), front: W3(st, spots.front), exit: { x: x + PITCH / 2, z: z + PITCH / 2, net: true } }
      addPick(src.id, x, 0.8, z, S, 2.6, S)
      addDiamond(p)
      byId.set(src.id, p)
    }
    room(decor, r, model.title, model.color)
    const lg = lounge(decor, r, Math.max(1, desks), aisleXs)
    const merged = mergeStatic(decor)
    group.add(merged, decor, dyn)
    scene.add(group)
    const cx = (r.X0 + r.X1) / 2, cz = (r.Z0 + r.Z1) / 2
    sun.position.set(cx - 9, 16, cz - 4); sun.target.position.set(cx, 0, cz)
    O = { key: model.key, group, dyn, merged, byId, pick, bounds: { minX: r.X0, maxX: r.X1, minZ: r.Z0, maxZ: r.Z1 }, r, sup, lounge: lg, boards: null, boardSig: '' }
    computeOverview()
    // the people keep where they were and where they were going; their seats are handed out again
    if (walkersKey !== model.key) { walkers.clear(); walkersKey = model.key }
    for (const w of walkers.values()) { w.seat = -1; w.visit = -1; w.rebuilt = true }
    for (const p of byId.values()) placeCharacter(p, prevChars)
    // characters nobody took back: free their baked geometry
    for (const ch of prevChars.values()) ch.model.traverse((o) => { if (o.isSkinnedMesh) o.geometry.dispose() })
  }
  // the overview: the whole room in the stage
  function computeOverview() {
    if (!O) return
    const b = O.bounds, tgt = new T3.Vector3((b.minX + b.maxX) / 2, 0.45, (b.minZ + b.maxZ) / 2)
    const pad = h.pad || { top: 0, bottom: 0 }
    const oz = clamp(zoomFor(boxPts(b.minX, b.maxX, b.minZ, b.maxZ, 0, 2.7), tgt, Math.max(200, W - 40), Math.max(160, H - 60 - pad.top - pad.bottom)), 0.12, 2.4)
    // the room's middle sits in the middle of the free band, not of the stage
    const shift = (pad.top - pad.bottom) / 2 * (FR / oz) / H
    tgt.addScaledVector(new T3.Vector3(-Math.sin(VIEW0.azim), 0, -Math.cos(VIEW0.azim)), shift / Math.sin(VIEW0.elev))
    overview = { tx: tgt.x, ty: tgt.y, tz: tgt.z, azim: VIEW0.azim, elev: VIEW0.elev, zoom: oz }
  }
  function charSigOf(src) { const t = tplFor(src); return (t ? t.name + t.bytes : '-') + '|' + src.shirt + src.hair + src.skin + '|' + (src.tone || '') }
  function placeCharacter(p, reuse) {
    const src = p.src
    if (p.kind === 'tray' || !p.sit) return
    const tpl = tplFor(src)
    if (p.ch) { O.dyn.remove(p.ch.holder); p.ch.mixer.stopAllAction(); p.ch.model.traverse((o) => { if (o.isSkinnedMesh) o.geometry.dispose() }); p.ch = null }
    if (!tpl || !src.present) return
    p.charSig = charSigOf(src)
    let ch = reuse && reuse.get(p.id + '|' + p.charSig)
    if (ch) reuse.delete(p.id + '|' + p.charSig)
    else { ch = makeCharacter(src, tpl); ch.cur = null }
    // the lead stays at the supervisor's desk; everyone else is placed by their walker every frame
    const sp = tpl.seated ? p.sit : p.stand
    ch.holder.position.set(sp.x, sp.y || 0, sp.z); ch.holder.rotation.y = sp.rot
    p.ch = ch
    O.dyn.add(ch.holder)
    if (p.kind === 'lead') playState(ch, src.anim || 'idle', true)
    else ch.cur = null
  }
  const layoutSig = (model) => model.key + '|' + (model.title || '') + '|' + (model.supLabel || '') + '|' + model.podiums.map((p) => p.id + ':' + p.kind).join(',')

