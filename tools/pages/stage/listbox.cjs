/* The glass listbox (spec 1.4 section 4.4, rule 1): a native <select> popup ignores CSS, so every
 * select on a Plan screen is enhanced into a button plus an ARIA listbox drawn with the glass
 * tokens of glass.cjs. The native select stays in the DOM, hidden, as the form value; choosing
 * sets it and fires its "change" event. Keyboard: Up, Down, Home, End, type-ahead, Enter, Space,
 * Escape, Tab. One popup is open at a time; it is drawn on the page (position: fixed) so no
 * scrolling panel clips it, and closes when its button is gone (the view redrew).
 *
 *   const LB = listboxView({ esc })      // in the page
 *   LB.enhance(rootElement)              // after each draw
 *
 * The strings it shows come from the options themselves; it has none of its own. */
const LISTBOX_STYLE = `
.lb{position:relative;display:inline-block;min-width:0;max-width:100%;vertical-align:middle}
.lb.block{display:block}
.lb-native{display:none!important}
.lb-btn{display:flex;align-items:center;gap:8px;width:100%;min-width:0;max-width:100%;min-height:36px;padding:0 14px;margin:0;border:0;border-radius:999px;cursor:pointer;font:600 14px var(--font-ui);color:var(--ink);text-align:start;
  background:var(--lb-bg);box-shadow:var(--lb-rim);-webkit-backdrop-filter:var(--glass-blur);backdrop-filter:var(--glass-blur)}
.lb-btn:hover{background:var(--lb-bg-hi)}
.lb-btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.lb-btn[aria-disabled=true]{opacity:.55;cursor:not-allowed}
.lb-val{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lb-car{flex:none;width:9px;height:9px;border-inline-end:2px solid var(--ink-dim);border-bottom:2px solid var(--ink-dim);transform:rotate(45deg) translate(-2px,-2px)}
.lb-btn[aria-expanded=true] .lb-car{transform:rotate(225deg) translate(-2px,-2px)}
.lb-pop{position:fixed;z-index:60;margin:0;padding:6px;list-style:none;overflow:auto;overscroll-behavior:contain;border-radius:var(--r-menu,18px);
  background:var(--glass-solid);-webkit-backdrop-filter:var(--glass-blur);backdrop-filter:var(--glass-blur);box-shadow:var(--lb-pop-shadow)}
@supports not selector(::-webkit-scrollbar){.lb-pop{scrollbar-width:thin;scrollbar-color:var(--lb-thumb) transparent}}
.lb-pop[hidden]{display:none}
.lb-pop::-webkit-scrollbar{width:8px}.lb-pop::-webkit-scrollbar-button{display:none;width:0;height:0}.lb-pop::-webkit-scrollbar-thumb{background:var(--lb-thumb);border-radius:8px}
.lb-opt{padding:9px 12px;border-radius:12px;cursor:pointer;font:500 14px var(--font-ui);color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lb-opt[aria-selected=true]{font-weight:700;color:var(--accent-h)}
.lb-opt.on{background:var(--lb-opt-on)}
.lb-opt[aria-disabled=true]{color:var(--ink-dim);cursor:default}
`

/** The browser half. Written into the page with toString(), like the other view functions. */
function listboxView(h) {
  const esc = h.esc
  let pop = null, owner = null, sel = null, active = -1, typed = '', typedAt = 0, openW = 0
  const opts = () => (sel ? [...sel.options] : [])
  function close(focus) {
    if (pop) { pop.hidden = true; pop.innerHTML = '' }
    if (owner) { owner.setAttribute('aria-expanded', 'false'); owner.removeAttribute('aria-activedescendant'); if (focus && owner.isConnected) owner.focus() }
    owner = null; sel = null; active = -1
  }
  function ensurePop() {
    if (pop && pop.isConnected) return pop
    pop = document.createElement('ul')
    pop.id = 'lb-pop'; pop.className = 'lb-pop glass'; pop.setAttribute('role', 'listbox'); pop.hidden = true
    document.body.appendChild(pop)
    pop.addEventListener('mousedown', (e) => e.preventDefault())
    pop.addEventListener('click', (e) => { const o = e.target.closest('[data-i]'); if (o) choose(+o.dataset.i) })
    return pop
  }
  function mark() {
    const kids = pop ? [...pop.children] : []
    kids.forEach((k, i) => { k.classList.toggle('on', i === active); k.id = 'lb-o' + i })
    if (owner && active >= 0) owner.setAttribute('aria-activedescendant', 'lb-o' + active)
    if (kids[active] && kids[active].scrollIntoView) kids[active].scrollIntoView({ block: 'nearest' })
  }
  function place() {
    const r = owner.getBoundingClientRect()
    const vh = window.innerHeight, vw = window.innerWidth
    const below = vh - r.bottom - 12, above = r.top - 12
    const want = Math.min(pop.scrollHeight + 2, 320)
    const up = below < Math.min(want, 160) && above > below
    const maxH = Math.max(96, Math.min(320, up ? above : below))
    const w = Math.min(Math.max(r.width, 160), vw - 16)
    pop.style.minWidth = Math.min(r.width, vw - 16) + 'px'; pop.style.maxWidth = (vw - 16) + 'px'; pop.style.maxHeight = maxH + 'px'
    pop.style.left = Math.max(8, Math.min(r.left, vw - w - 8)) + 'px'
    pop.style.top = up ? 'auto' : (r.bottom + 6) + 'px'
    pop.style.bottom = up ? (vh - r.top + 6) + 'px' : 'auto'
  }
  function open(btn) {
    const s = btn.parentNode.querySelector('select')
    if (!s || btn.getAttribute('aria-disabled') === 'true') return
    if (owner === btn) { close(true); return }
    close(false)
    owner = btn; sel = s; openW = window.innerWidth
    const p = ensurePop()
    p.setAttribute('aria-label', btn.getAttribute('aria-label') || '')
    p.innerHTML = opts().map((o, i) => '<li class="lb-opt" role="option" data-i="' + i + '" aria-selected="' + o.selected + '"' + (o.disabled ? ' aria-disabled="true"' : '') + '>' + esc(o.textContent) + '</li>').join('')
    p.hidden = false
    btn.setAttribute('aria-expanded', 'true')
    active = Math.max(0, opts().findIndex((o) => o.selected))
    place(); mark()
  }
  function choose(i) {
    const s = sel, o = s && s.options[i]
    if (!o || o.disabled) return
    const btn = owner
    const changed = s.selectedIndex !== i
    s.selectedIndex = i
    close(true)
    if (btn && btn.isConnected) btn.querySelector('.lb-val').textContent = o.textContent
    if (changed) s.dispatchEvent(new Event('change', { bubbles: true }))
  }
  function step(d) {
    const n = opts().length
    if (!n) return
    let i = active
    for (let c = 0; c < n; c++) { i = Math.min(n - 1, Math.max(0, i + d)); if (!opts()[i].disabled || i === 0 || i === n - 1) break }
    active = i; mark()
  }
  function ahead(ch) {
    const now = Date.now()
    typed = now - typedAt > 700 ? ch : typed + ch; typedAt = now
    const list = opts(), q = typed.toLowerCase()
    const from = typed.length === 1 ? active + 1 : active
    for (let k = 0; k < list.length; k++) {
      const i = (from + k) % list.length
      if (!list[i].disabled && list[i].textContent.toLowerCase().startsWith(q)) { active = i; mark(); return }
    }
  }
  document.addEventListener('keydown', (e) => {
    const btn = e.target.closest && e.target.closest('.lb-btn')
    if (!btn && !owner) return
    if (!owner) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); open(btn) }
      else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); open(btn); ahead(e.key) }
      return
    }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); step(1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); step(-1) }
    else if (e.key === 'Home') { e.preventDefault(); active = 0; mark() }
    else if (e.key === 'End') { e.preventDefault(); active = opts().length - 1; mark() }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(active) }
    else if (e.key === 'Tab') close(false)
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); ahead(e.key) }
  }, true)
  document.addEventListener('click', (e) => {
    const btn = e.target.closest && e.target.closest('.lb-btn')
    if (btn) { e.preventDefault(); open(btn); return }
    if (owner && !(pop && pop.contains(e.target))) close(false)
  })
  window.addEventListener('resize', () => { if (owner && window.innerWidth !== openW) close(false) })
  document.addEventListener('scroll', (e) => { if (owner && !(pop && pop.contains(e.target))) close(false) }, true)
  /** Turn each plain select under `root` into a glass listbox. Safe to call again after a redraw. */
  function enhance(root) {
    if (owner && !owner.isConnected) close(false)
    for (const s of root.querySelectorAll('select:not([data-lb])')) {
      s.dataset.lb = '1'; s.classList.add('lb-native'); s.setAttribute('tabindex', '-1'); s.setAttribute('aria-hidden', 'true')
      const w = document.createElement('span')
      w.className = 'lb' + (s.dataset.block ? ' block' : '')
      const b = document.createElement('button')
      b.type = 'button'; b.className = 'lb-btn'; b.setAttribute('aria-haspopup', 'listbox'); b.setAttribute('aria-expanded', 'false')
      b.setAttribute('aria-label', s.getAttribute('aria-label') || s.title || '')
      if (s.disabled) b.setAttribute('aria-disabled', 'true')
      if (s.title) b.title = s.title
      const cur = s.options[s.selectedIndex]
      b.innerHTML = '<span class="lb-val">' + esc(cur ? cur.textContent : '') + '</span><i class="lb-car"></i>'
      s.parentNode.insertBefore(w, s)
      w.appendChild(b); w.appendChild(s)
    }
  }
  return { enhance, close, isOpen: () => !!owner }
}

module.exports = { LISTBOX_STYLE, listboxView }
