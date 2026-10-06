/* The drawings of the 1.0 screens: pixel people, the assistant's robot, the
 * line icons, file thumbnails, and the isometric campus and office room of
 * the wizard and the Team screen.
 *
 * everyoneArt is never run in Node: like everyoneViews its source is written
 * into the page, so it uses only what the browser has and returns strings.
 * Nothing here reads data or the page language; a caller passes what is drawn
 * and any text (already through T()), and every text that comes from data is
 * escaped by the caller.
 *
 * A person's look is a pure function of a seed (their id, or id + ':' + the
 * look they picked), so the same member looks the same on every screen and in
 * every browser, with nothing stored but an optional small number.
 */

function everyoneArt() {
  const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) } return h >>> 0 }
  const SKIN = ['#F1C8A5', '#DDA77F', '#B97A56', '#8A5A3C']
  const HAIR = ['#2B2118', '#5A3A22', '#C9A24B', '#1A1A1F', '#8C4A2F', '#A9B2BC']
  function shade(hex, f) {
    const n = parseInt(String(hex || '#8A97A6').slice(1), 16) || 0
    const m = (v) => Math.max(0, Math.min(255, Math.round(v * f)))
    return '#' + [m(n >> 16), m((n >> 8) & 255), m(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join('')
  }
  // 12 x 14 cells: hair H, skin S, eyes E, glasses G, mouth M, shirt T
  function cells(seed, shirt) {
    const h = hash(seed)
    const skin = SKIN[h % 4], hair = HAIR[(h >> 3) % 6], style = (h >> 6) % 5, glasses = ((h >> 9) % 3) === 0
    const g = ['...HHHHHH...', '..HHHHHHHH..', '..HHSSSSHH..', '..HSSSSSSH..', '..SSESSESS..', '..SSSSSSSS..', '..SSSMMSSS..', '...SSSSSS...',
      '....SSSS....', '..TTTTTTTT..', '.TTTTTTTTTT.', '.TTTTTTTTTT.', '.TTTTTTTTTT.', '.TTTTTTTTTT.'].map((r) => r.split(''))
    const set = (r, c, v) => { g[r][c] = v }
    if (style === 1) { for (let r = 3; r <= 9; r++) { set(r, 2, 'H'); set(r, 9, 'H') } for (let r = 3; r <= 8; r++) { set(r, 1, 'H'); set(r, 10, 'H') } set(9, 2, 'T'); set(9, 9, 'T') }
    if (style === 2) { g[0] = '............'.split(''); g[1] = '...HHHHHH...'.split('') }
    if (style === 3) { g[0] = '....HHHH....'.split(''); set(3, 2, 'S'); set(3, 9, 'S'); for (let r = 4; r <= 5; r++) { set(r, 2, 'H'); set(r, 9, 'H') } }
    if (style === 4) { g[0] = '..HHHHHHHH..'.split(''); g[1] = '.HHHHHHHHHH.'.split('') }
    if (glasses) g[4] = '..GEGSSGEG..'.split('')
    const col = { H: hair, S: skin, E: '#1A1A1F', G: '#1A1A1F', M: '#8C4A3C', T: shirt || '#56B6C2' }
    let out = ''
    g.forEach((row, r) => row.forEach((ch, c) => { if (ch !== '.') out += '<rect x="' + c + '" y="' + r + '" width="1.02" height="1.02" fill="' + col[ch] + '"/>' }))
    return out
  }
  const ROBOT = ['.....AA.....', '.....AA.....', '..BBBBBBBB..', '.BBBBBBBBBB.', '.BWWBBBBWWB.', '.BWKBBBBKWB.', '.BBBBBBBBBB.', '.BBBGGGGBBB.', '..BBBBBBBB..', '...CCCCCC...', '.CCCCCCCCCC.', '.CCCCCCCCCC.', '.CCCCCCCCCC.', '.CCCCCCCCCC.']
  function robotCells() {
    const col = { A: '#3BE8B0', B: '#C6D0DA', W: '#0A0F14', K: '#3BE8B0', G: '#56B6C2', C: '#2C3A48' }
    let out = ''
    ROBOT.forEach((row, y) => row.split('').forEach((ch, x) => { if (ch !== '.') out += '<rect x="' + x + '" y="' + y + '" width="1.02" height="1.02" fill="' + col[ch] + '"/>' }))
    return out
  }
  const svgOf = (inner, w) => '<svg width="' + w + '" height="' + Math.round(w * 14 / 12) + '" viewBox="0 0 12 14" shape-rendering="crispEdges" aria-hidden="true">' + inner + '</svg>'
  /** A person: `seed` picks the face, `color` is the office (the shirt). */
  const person = (seed, color, size, back) => '<span class="av' + (back ? ' bk' : '') + '"' + (back ? ' style="background:' + shade(color, 0.42) + '"' : '') + '>' + svgOf(cells(seed, color), size || 32) + '</span>'
  const owner = (size) => '<span class="av">' + svgOf(cells('owner-of-the-company', '#3BE8B0'), size || 32) + '</span>'
  const robot = (size) => '<span class="av">' + svgOf(robotCells(), size || 32) + '</span>'
  /** The same person as an SVG group, for the iso scenes. */
  const personG = (seed, color, x, y, scale) => '<g transform="translate(' + x + ',' + y + ') scale(' + scale + ')" shape-rendering="crispEdges">' + cells(seed, color) + '</g>'

  const IC = {
    check: 'M5 12l5 5 9-10', x: 'M6 6l12 12M18 6L6 18', plus: 'M12 5v14M5 12h14', chev: 'M9 6l6 6-6 6', back: 'M15 6l-6 6 6 6',
    bell: 'M6 17V11a6 6 0 0 1 12 0v6l2 2H4zM10 21h4', out: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
    lock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3', shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01',
    cal: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4', clock: 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', send: 'M3 11l18-8-8 18-2-8z',
    comment: 'M4 5h16v11H9l-5 4z', pencil: 'M4 20l1-5L16 4l4 4L9 19zM14 6l4 4', eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    doc: 'M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v5h5M9 13h6M9 17h6', image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9.5h.01',
    table: 'M4 5h16v14H4zM4 10h16M4 15h16M10 5v14', link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
    globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18', download: 'M12 4v11M7 11l5 5 5-5M5 20h14',
    search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4', plug: 'M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4', phone: 'M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM11 18h2',
    box: 'M3 8l9-5 9 5v8l-9 5-9-5zM3 8l9 5 9-5M12 13v8', warn: 'M12 3l10 18H2zM12 10v5M12 18h.01', home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
    copy: 'M8 8h11v12H8zM5 16V4h11', trash: 'M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13', spark: 'M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z', pause: 'M8 5v14M16 5v14',
  }
  /** A line icon, decorative (aria-hidden): the button or label next to it says what it is. */
  const ic = (n, s, sw) => '<svg class="ic" width="' + (s || 16) + '" height="' + (s || 16) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (sw || 1.9) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + (IC[n] || '') + '"/></svg>'

  /** A drawn stand-in for a file that has no picture of its own. */
  function thumb(kind, c) {
    const W = 260, H = 150
    let s = ''
    if (kind === 'doc') s = '<rect x="70" y="14" width="120" height="122" rx="3" fill="#E9EFF5"/><rect x="82" y="28" width="60" height="8" fill="#10161D"/><rect x="82" y="46" width="96" height="4" fill="#9AA7B5"/><rect x="82" y="56" width="90" height="4" fill="#9AA7B5"/><rect x="82" y="66" width="96" height="4" fill="#9AA7B5"/><rect x="82" y="82" width="40" height="22" fill="' + c + '"/><rect x="128" y="82" width="50" height="4" fill="#9AA7B5"/><rect x="128" y="92" width="44" height="4" fill="#9AA7B5"/><rect x="82" y="112" width="96" height="4" fill="#9AA7B5"/>'
    else if (kind === 'sheet') { for (let r = 0; r < 6; r++) for (let q = 0; q < 5; q++) s += '<rect x="' + (22 + q * 44) + '" y="' + (18 + r * 20) + '" width="42" height="18" fill="' + (r === 0 ? c : (r + q) % 2 ? '#1B2530' : '#222E3B') + '"/>' }
    else if (kind === 'link') s = '<rect x="22" y="22" width="216" height="106" rx="6" fill="#141B23" stroke="#2B3A49"/><rect x="36" y="38" width="22" height="22" rx="4" fill="' + c + '"/><rect x="68" y="40" width="110" height="7" fill="#C6D0DA"/><rect x="68" y="54" width="70" height="5" fill="#8A97A6"/><rect x="36" y="78" width="188" height="5" fill="#3A4856"/><rect x="36" y="90" width="160" height="5" fill="#3A4856"/><rect x="36" y="102" width="120" height="5" fill="#3A4856"/>'
    else s = '<rect x="30" y="20" width="200" height="110" rx="4" fill="#0D1319" stroke="#2B3A49"/><rect x="44" y="36" width="12" height="5" fill="' + c + '"/><rect x="62" y="36" width="90" height="5" fill="#A6B1BD"/><rect x="44" y="52" width="150" height="5" fill="#6A7785"/><rect x="44" y="66" width="170" height="5" fill="#6A7785"/><rect x="44" y="80" width="130" height="5" fill="#6A7785"/><rect x="44" y="94" width="160" height="5" fill="#6A7785"/>'
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" shape-rendering="crispEdges" aria-hidden="true">' + s + '</svg>'
  }

  // ---------- isometric scenes
  function iso(ox, oy, TW, TH) {
    const P = (x, y, z) => [ox + (x - y) * TW / 2, oy + (x + y) * TH / 2 - (z || 0)]
    const poly = (pts, fill, stroke, extra) => '<polygon points="' + pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ') + '" fill="' + fill + '" stroke="' + (stroke || 'none') + '" stroke-width="1" stroke-linejoin="round"' + (extra || '') + '/>'
    const box = (x, y, w, d, h, top, left, right, z0) => {
      z0 = z0 || 0
      const A = P(x, y, z0 + h), B = P(x + w, y, z0 + h), C = P(x + w, y + d, z0 + h), D = P(x, y + d, z0 + h)
      const B0 = P(x + w, y, z0), C0 = P(x + w, y + d, z0), D0 = P(x, y + d, z0)
      return poly([D, C, C0, D0], left) + poly([B, C, C0, B0], right) + poly([A, B, C, D], top)
    }
    return { P, poly, box }
  }
  const text = (x, y, s, o) => { o = o || {}; return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" text-anchor="middle" style="font:' + (o.w || 600) + ' ' + (o.size || 12) + 'px ' + (o.mono ? 'var(--mono)' : 'var(--fa)') + ';fill:' + (o.fill || '#C6D0DA') + '">' + s + '</text>' }
  // `s` is already escaped by the caller; its length only sizes the label
  const tag = (x, y, s, o) => {
    o = o || {}
    const plain = String(s).replace(/&[a-z#0-9]+;/g, 'x')
    const w = Math.max(36, plain.length * 7 + 18)
    return '<g class="tagg"><rect x="' + (x - w / 2).toFixed(1) + '" y="' + (y - 12).toFixed(1) + '" width="' + w + '" height="22" rx="4" fill="' + (o.bg || '#0A0F14') + '" stroke="' + (o.stroke || '#2B3A49') + '"/>' + text(x, y + 4, s, { size: 12, fill: o.fill || '#E9EFF5' }) + '</g>'
  }
  const BUBBLE = { working: ['#3BE8B0', '...'], waiting: ['#E5A33D', '!'], done: ['#56B6C2', 'ok'], idle: ['#8A97A6', 'zz'], paused: ['#8A97A6', '||'] }
  const bubble = (x, y, kind) => {
    const c = BUBBLE[kind] || BUBBLE.idle
    return '<g><rect x="' + (x - 17).toFixed(1) + '" y="' + (y - 20).toFixed(1) + '" width="34" height="20" rx="4" fill="#0A0F14" stroke="' + c[0] + '" stroke-width="1.5"/><polygon points="' + (x - 4).toFixed(1) + ',' + y.toFixed(1) + ' ' + (x + 4).toFixed(1) + ',' + y.toFixed(1) + ' ' + x.toFixed(1) + ',' + (y + 6).toFixed(1) + '" fill="' + c[0] + '"/>' + text(x, y - 6, c[1], { size: 12, fill: c[0], w: 800, mono: true }) + '</g>'
  }

  /** The campus: up to six buildings on a grass slab. plots: [{ color, label,
   *  count, h, built }], people: [{ seed, color, plot }] standing at a plot. */
  function campus(plots, people) {
    const SPOTS = [[1, 1], [5, 1], [1, 5], [5, 5], [3, 0.2], [3, 6.2]]
    const I = iso(450, 110, 100, 50), P = I.P, poly = I.poly, box = I.box
    const size = 8, mid = size / 2
    let s = poly([P(0, 0), P(size, 0), P(size, size), P(0, size)], '#10241B', '#1B3A2B')
    for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) if ((i + j) % 2) s += poly([P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)], '#0F2219')
    s += poly([P(mid - 0.3, 0), P(mid + 0.3, 0), P(mid + 0.3, size), P(mid - 0.3, size)], '#1A222B') + poly([P(0, mid - 0.3), P(size, mid - 0.3), P(size, mid + 0.3), P(0, mid + 0.3)], '#1A222B')
    s += poly([P(0, size), P(size, size), P(size, size, -14), P(0, size, -14)], '#0B1812') + poly([P(size, 0), P(size, size), P(size, size, -14), P(size, 0, -14)], '#08130E')
    const placed = plots.slice(0, SPOTS.length).map((p, i) => Object.assign({ x: SPOTS[i][0], y: SPOTS[i][1] }, p))
    const labels = []
    for (const p of placed.slice().sort((a, b) => (a.x + a.y) - (b.x + b.y))) {
      const w = 2, d = 2
      if (!p.built) {
        s += poly([P(p.x, p.y), P(p.x + w, p.y), P(p.x + w, p.y + d), P(p.x, p.y + d)], 'rgba(255,255,255,.025)', '#3A4856', ' stroke-dasharray="6 5"')
        const c = P(p.x + w / 2, p.y + d / 2)
        s += text(c[0], c[1] + 8, '+', { size: 26, fill: '#6A7785', w: 300 })
        continue
      }
      const h = p.h || 90, col = p.color
      s += poly([P(p.x - 0.15, p.y - 0.15), P(p.x + w + 0.15, p.y - 0.15), P(p.x + w + 0.15, p.y + d + 0.15), P(p.x - 0.15, p.y + d + 0.15)], '#1B2430')
      s += box(p.x, p.y, w, d, h, shade(col, 0.55), '#1F2C3A', '#18232F')
      s += box(p.x - 0.05, p.y - 0.05, w + 0.1, d + 0.1, 10, col, shade(col, 0.75), shade(col, 0.6), h)
      const rows = Math.floor((h - 20) / 26), cols = Math.round(w * 2.2)
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) { const u = 0.22 + c * (w - 0.44) / Math.max(1, cols - 1) - 0.1, z = 14 + r * 26; s += poly([P(p.x + u, p.y + d, z), P(p.x + u + 0.22, p.y + d, z), P(p.x + u + 0.22, p.y + d, z + 15), P(p.x + u, p.y + d, z + 15)], (r + c + p.x) % 3 === 0 ? col : '#2A3A4B') }
        for (let c = 0; c < cols; c++) { const u = 0.22 + c * (d - 0.44) / Math.max(1, cols - 1) - 0.1, z = 14 + r * 26; s += poly([P(p.x + w, p.y + u, z), P(p.x + w, p.y + u + 0.22, z), P(p.x + w, p.y + u + 0.22, z + 15), P(p.x + w, p.y + u, z + 15)], (r + c) % 4 === 1 ? col : '#223040') }
      }
      const t = P(p.x + w / 2, p.y + d / 2, h + 10)
      labels.push(tag(t[0], t[1] - 22, p.label + (p.count !== undefined && p.count !== '' ? ' · ' + p.count : ''), { stroke: col }))
    }
    for (const a of people || []) {
      const p = placed[a.plot]
      if (!p) continue
      const q = P(p.x + 0.35 + (a.n || 0) * 0.75, p.y + 2.45)
      s += '<ellipse cx="' + q[0].toFixed(1) + '" cy="' + (q[1] + 2).toFixed(1) + '" rx="14" ry="6" fill="rgba(0,0,0,.4)"/>' + personG(a.seed, a.color, q[0] - 18, q[1] - 40, 3)
    }
    return s + labels.join('')
  }

  /** The assistant's laptop, next to the campus while the wizard waits for its hello. */
  function laptop(label, sub, linked) {
    const I = iso(660, 215, 100, 50), P = I.P, box = I.box
    const sp = P(1.2, 0.14, 70)
    let wire = ''
    for (let i = 0; i < 8; i++) wire += '<rect x="' + (540 + i * 22) + '" y="' + (430 - i * 11) + '" width="8" height="8" fill="' + (linked || i < 4 ? '#3BE8B0' : '#3A4856') + '"/>'
    return wire + box(0, 0, 2.4, 1.6, 10, '#C6D0DA', '#8A97A6', '#6A7785') + box(0, 0, 2.4, 0.14, 100, '#222E3B', linked ? '#0E3A2C' : '#0E2B3A', '#18232F', 10) +
      '<g transform="translate(' + sp[0].toFixed(1) + ',' + sp[1].toFixed(1) + ') matrix(1,.5,0,1,0,0)">' + text(0, 0, label, { size: 17, fill: linked ? '#3BE8B0' : '#56B6C2' }) + text(0, 22, sub, { size: 13, fill: '#8A97A6', w: 400 }) + '</g>'
  }

  /** One office room with up to six desks. members: [{ seed, label (escaped),
   *  status, hot }]; ghost: the seat index of a desk being added; sign: the
   *  office name on the wall (escaped). */
  function room(color, members, opts) {
    opts = opts || {}
    const SEATS = [[0.5, 1.1], [2.2, 1.1], [3.9, 1.1], [1.3, 3.2], [3.0, 3.2], [4.7, 3.2]]
    const I = iso(420, 210, 120, 60), P = I.P, poly = I.poly, box = I.box
    const H = 150, FA_ = '#17212B', FB = '#141D26'
    let s = poly([P(0, 0), P(6, 0), P(6, 5), P(0, 5)], FB, '#1E2A36')
    for (let i = 0; i < 6; i++) for (let j = 0; j < 5; j++) s += poly([P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)], (i + j) % 2 ? FA_ : FB, '#1B2631')
    s += poly([P(1.2, 2.3), P(4.8, 2.3), P(4.8, 4.9), P(1.2, 4.9)], shade(color, 0.22), shade(color, 0.4), ' stroke-width="1.5"')
    s += poly([P(0, 5), P(6, 5), P(6, 5, -16), P(0, 5, -16)], '#0B1117') + poly([P(6, 0), P(6, 5), P(6, 5, -16), P(6, 0, -16)], '#080D12')
    s += poly([P(0, 0, 0), P(6, 0, 0), P(6, 0, H), P(0, 0, H)], '#1B2633', '#0E151C') + poly([P(0, 0, 0), P(0, 5, 0), P(0, 5, H), P(0, 0, H)], '#162029', '#0E151C')
    s += poly([P(0, 0, H - 14), P(6, 0, H - 14), P(6, 0, H), P(0, 0, H)], color) + poly([P(0, 0, H - 14), P(0, 5, H - 14), P(0, 5, H), P(0, 0, H)], shade(color, 0.75))
    for (const u of [0.5, 1.9, 3.3]) s += poly([P(u, 0, 60), P(u + 1.1, 0, 60), P(u + 1.1, 0, 118), P(u, 0, 118)], '#0E2B3A', '#2B3A49') + poly([P(u + 0.05, 0, 64), P(u + 0.55, 0, 64), P(u + 0.55, 0, 114), P(u + 0.05, 0, 114)], 'rgba(86,182,194,.18)')
    s += poly([P(0, 0.6, 52), P(0, 2.4, 52), P(0, 2.4, 118), P(0, 0.6, 118)], '#E3E9EF', '#7A8794')
    for (let i = 0; i < 4; i++) s += poly([P(0, 0.8, 64 + i * 13), P(0, 1.2 + i * 0.25, 64 + i * 13), P(0, 1.2 + i * 0.25, 68 + i * 13), P(0, 0.8, 68 + i * 13)], i === 0 ? color : '#9AA7B5')
    const tags = []
    const seats = members.slice(0, SEATS.length).map((m, i) => ({ m, i, x: SEATS[i][0], y: SEATS[i][1] })).sort((a, b) => (a.x + a.y) - (b.x + b.y))
    for (const st of seats) {
      const m = st.m, x = st.x, y = st.y
      s += '<g class="seat" data-ev="member-open" data-arg="' + m.id + '">'
      s += box(x + 0.45, y - 0.62, 0.6, 0.5, 14, shade(color, 0.5), shade(color, 0.38), shade(color, 0.28)) + box(x + 0.45, y - 0.66, 0.6, 0.08, 46, shade(color, 0.45), shade(color, 0.35), shade(color, 0.25))
      const ap = P(x + 0.75, y - 0.3, 20)
      const bx = ap[0] - 30, by = ap[1] - 58
      s += personG(m.seed, color, bx, by, 5)
      s += box(x, y, 1.5, 0.8, 38, '#2A3947', '#1D2A36', '#16212B') + box(x, y, 1.5, 0.8, 5, shade(color, 0.8), shade(color, 0.5), shade(color, 0.4), 38)
      const lit = m.status === 'working' ? '#1F6F58' : m.status === 'waiting' ? '#7A5A1C' : '#1B2530'
      s += box(x + 1.0, y + 0.12, 0.42, 0.07, 26, '#0E151C', lit, '#0A0F14', 43) + box(x + 1.15, y + 0.14, 0.12, 0.1, 4, '#0E151C', '#0E151C', '#0A0F14', 43)
      if (m.hot) s += poly([P(x - 0.25, y - 0.8), P(x + 1.75, y - 0.8), P(x + 1.75, y + 1.15), P(x - 0.25, y + 1.15)], 'rgba(59,232,176,.07)', '#3BE8B0', ' stroke-width="2" stroke-dasharray="7 5"')
      s += bubble(ap[0], by - 6, m.status) + '</g>'
      tags.push(tag(ap[0], by - 34, m.label, { stroke: m.hot ? '#3BE8B0' : '#2B3A49', fill: m.hot ? '#3BE8B0' : '#E9EFF5', bg: m.hot ? '#0E2B22' : '#0A0F14' }))
    }
    s += tags.join('')
    if (opts.ghost !== undefined && opts.ghost < SEATS.length) {
      const gx = SEATS[opts.ghost][0], gy = SEATS[opts.ghost][1]
      s += poly([P(gx - 0.25, gy - 0.8), P(gx + 1.75, gy - 0.8), P(gx + 1.75, gy + 1.15), P(gx - 0.25, gy + 1.15)], 'rgba(59,232,176,.08)', '#3BE8B0', ' stroke-width="2" stroke-dasharray="7 5"')
      s += poly([P(gx, gy), P(gx + 1.5, gy), P(gx + 1.5, gy + 0.8), P(gx, gy + 0.8)], 'rgba(59,232,176,.14)', '#3BE8B0', ' stroke-width="1.5" stroke-dasharray="4 4"')
      const t = P(gx + 0.75, gy + 0.4, 40), b = P(gx + 0.75, gy + 0.8, 0)
      s += text(t[0], t[1] + 6, '+', { size: 34, fill: '#3BE8B0', w: 300 }) + tag(b[0], b[1] + 18, opts.ghostLabel || '', { stroke: '#3BE8B0', fill: '#3BE8B0' })
    }
    const plant = (x, y) => box(x, y, 0.5, 0.5, 22, '#4A3A2E', '#35291F', '#2A2018') + box(x + 0.1, y + 0.1, 0.3, 0.3, 44, '#2F8F66', '#236B4E', '#1C5640', 22) + box(x + 0.18, y + 0.18, 0.14, 0.14, 66, '#3BE8B0', '#2F8F66', '#236B4E', 22)
    s += plant(5.2, 0.3) + plant(0.2, 4.2)
    const sp = P(3.2, 0, 132)
    if (opts.sign) s += '<g transform="translate(' + sp[0].toFixed(1) + ',' + sp[1].toFixed(1) + ') matrix(1,.5,0,1,0,0)">' + text(0, 0, opts.sign, { size: 13, fill: '#0A0F14', w: 800 }) + '</g>'
    return s
  }

  return { hash, shade, person, owner, robot, personG, ic, thumb, campus, laptop, room, SEATS: 6 }
}

module.exports = { everyoneArt }
