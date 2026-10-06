/* Deliverables: what the team handed in (documents, images, links, files),
 * kept so the owner finds them in one gallery.
 *
 *   <home>/deliverables/index/<id>.json    one record per deliverable
 *   <home>/deliverables/blobs/<sha256>.<ext>  the stored copy, content-addressed
 *
 * Three sources, each handled on its own terms (spec R-7.6):
 *   url      http(s) only; stored as a link and never fetched (no network call)
 *   content  text (md, txt, csv; at most 1 MB) or an image (png, jpeg, gif,
 *            webp; at most 5 MB) whose first bytes prove its type. SVG and
 *            HTML are refused: they can carry script.
 *   path     copied into the store ONLY when, after links are resolved, it is
 *            inside a deliverable folder the owner allowed (config.json
 *            "deliverableRoots", default <home>/workspace), matches no secret
 *            pattern, is at most 25 MB and has an allowed type. Otherwise it
 *            is kept as link-only text with the reason, and nothing is read.
 * All stored copies together are at most 5 GB (a warning shows from 2 GB).
 *
 * A path is never opened or executed here or anywhere in Arsenale; the store
 * copy is served only by the dashboard, under a sandbox CSP (the server).
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const P = require('./paths.cjs')
const { writeAtomic } = require('./build-agent-dashboard.cjs')
const { fail, clipCp, actorLabel } = require('./runlog.cjs')

const DIR = path.join(P.HOME, 'deliverables')
const INDEX = path.join(DIR, 'index')
const BLOBS = path.join(DIR, 'blobs')
const SCHEMA = 1
const KINDS = ['document', 'image', 'link', 'file', 'text']
const MB = 1024 * 1024
// store: the hard cap on all stored copies together (the warning is at 2 GB)
const LIMITS = { text: 1 * MB, image: 5 * MB, path: 25 * MB, store: 5 * 1024 * MB }
const STORE_FULL = 'The deliverable store is full (5 GB): nothing more is stored'
// the type allowlist: extension -> mime, and how a file of it is checked
const TYPES = {
  png: { mime: 'image/png', image: true }, jpg: { mime: 'image/jpeg', image: true }, jpeg: { mime: 'image/jpeg', image: true },
  gif: { mime: 'image/gif', image: true }, webp: { mime: 'image/webp', image: true },
  md: { mime: 'text/markdown; charset=utf-8', text: true }, txt: { mime: 'text/plain; charset=utf-8', text: true }, csv: { mime: 'text/csv; charset=utf-8', text: true },
  pdf: { mime: 'application/pdf' },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', zip: true },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', zip: true },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', zip: true },
  odt: { mime: 'application/vnd.oasis.opendocument.text', zip: true },
}
const IMAGE_MIME = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' }
// the dashboard's own secret-path rule (build-agent-dashboard.cjs SECRET_PATH),
// plus the folders that hold keys on every system
const SECRET = /(^|[\\/])secrets[\\/]|\.(lic|pem|key|pfx|p12|kdbx|ppk)$|(^|[\\/])\.env[^\\/]*$|(^|[\\/])id_[^\\/]*$|(^|[\\/])\.(ssh|gnupg|aws)[\\/]/i

/** What the first bytes say a file is, or ''. */
function sniff(buf) {
  const b = buf
  if (b.length >= 8 && b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG') return 'png'
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg'
  if (b.length >= 6 && /^GIF8[79]a$/.test(b.toString('latin1', 0, 6))) return 'gif'
  if (b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'webp'
  if (b.length >= 5 && b.toString('latin1', 0, 5) === '%PDF-') return 'pdf'
  if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) return 'zip'
  return ''
}
/** Text means valid UTF-8 with no NUL byte. */
function isText(buf) {
  if (buf.includes(0)) return false
  try { new TextDecoder('utf-8', { fatal: true }).decode(buf); return true } catch { return false }
}
const looksLikeMarkup = (buf) => /^\s*(<!doctype|<html|<svg|<\?xml|<script)/i.test(buf.slice(0, 200).toString('utf8'))

function sizeText(n) { return n >= MB ? (n / MB).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB' }

/** Checks a buffer against the extension it claims; returns the extension
 *  to store it under, or throws with a sentence. */
function checkBuffer(buf, ext) {
  const t = TYPES[ext]
  if (!t) throw fail(400, 'type not previewed')
  const s = sniff(buf)
  if (t.image) { if (s !== (ext === 'jpeg' ? 'jpg' : ext)) throw fail(400, 'not a valid image'); return ext === 'jpeg' ? 'jpg' : ext }
  if (t.text) { if (!isText(buf) || looksLikeMarkup(buf)) throw fail(400, 'not plain text'); return ext }
  if (ext === 'pdf') { if (s !== 'pdf') throw fail(400, 'not a valid PDF'); return ext }
  if (t.zip) { if (s !== 'zip') throw fail(400, 'not a valid ' + ext + ' file'); return ext }
  throw fail(400, 'type not previewed')
}

function storeBlob(buf, ext) {
  fs.mkdirSync(BLOBS, { recursive: true })
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex')
  const file = sha256 + '.' + ext
  const full = path.join(BLOBS, file)
  if (!fs.existsSync(full)) {
    // a connected client must not be able to fill the disk
    if (storeSize().bytes + buf.length > LIMITS.store) throw fail(413, STORE_FULL)
    writeAtomic(full, buf)
  }
  return { file, bytes: buf.length, sha256, mime: TYPES[ext].mime }
}

function roots() {
  const list = Array.isArray(P.CONFIG.deliverableRoots) && P.CONFIG.deliverableRoots.length ? P.CONFIG.deliverableRoots : [path.join(P.HOME, 'workspace')]
  return list.map((r) => path.resolve(P.expandHome(String(r))))
}

/** A path offered as a deliverable: the store copy, or why there is none.
 *  A missing file and one outside the folders get the same reason: a client
 *  with no file tool must not learn from it whether a path exists. The
 *  native realpath expands Windows short names (SECRE~1), so the secret rule
 *  sees the real name; a hard link could make any file look like one inside. */
function fromPath(p) {
  const given = String(p)
  if (SECRET.test(given)) return { reason: 'protected file' }
  const real = P.insideRoots(given, roots(), fs.realpathSync.native)
  if (!real) return { reason: 'outside your deliverable folders' }
  if (SECRET.test(real)) return { reason: 'protected file' }
  const st = fs.statSync(real)
  if (!st.isFile()) return { reason: 'not a file' }
  if (st.nlink > 1) return { reason: 'a hard link to another file' }
  if (st.size > LIMITS.path) return { reason: 'too large: ' + sizeText(st.size) + ', the limit is 25 MB' }
  const ext = path.extname(real).slice(1).toLowerCase()
  if (!TYPES[ext]) return { reason: 'type not previewed' }
  const buf = fs.readFileSync(real)
  try { return { blob: storeBlob(buf, checkBuffer(buf, ext)) } } catch (e) { return { reason: e.message } }
}

/** Registers one deliverable. Never throws for a path that cannot be stored:
 *  that becomes a link-only record with the reason (spec 5.7). */
function addDeliverable(input, actor) {
  const title = clipCp(String(input.title || '').trim(), 120)
  if (!title) throw fail(400, 'A deliverable needs a title (1 to 120 characters)')
  const kind = KINDS.includes(input.kind) ? input.kind : 'file'
  const given = ['url', 'path', 'content'].filter((k) => input[k] !== undefined && input[k] !== '')
  if (given.length !== 1) throw fail(400, 'Give exactly one of url, path or content')
  const rec = {
    schemaVersion: SCHEMA, id: 'dl-' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + Math.random().toString(36).slice(2, 6),
    kind, title, note: clipCp(input.note || '', 300),
    jobId: input.job_id ? String(input.job_id).replace(/[^\w.-]/g, '').slice(0, 80) : '',
    taskId: input.task_id ? String(input.task_id).replace(/[^\w-]/g, '').slice(0, 20) : '',
    agent: input.team_member ? String(input.team_member).replace(/[^\w.-]/g, '').slice(0, 60) : '',
    by: actorLabel(actor), clientId: actor.clientId || '', createdAt: new Date().toISOString(),
    source: given[0], url: '', originalPath: '', blob: null, state: 'stored', reason: '',
  }
  if (rec.jobId && !rec.agent) { try { const r = require('./runlog.cjs').readActive(rec.jobId); if (r) rec.agent = r.agent } catch { /* finished or unknown */ } }
  if (given[0] === 'url') {
    const url = String(input.url)
    if (!/^https?:\/\/[^\s]+$/i.test(url) || url.length > 2000) throw fail(400, 'A link must start with https:// or http://')
    rec.url = url
    rec.state = 'link-only'
  } else if (given[0] === 'path') {
    const p = String(input.path)
    if (Array.from(p).length > 400 || /[\u0000-\u001f]/.test(p)) throw fail(400, 'A file path is at most 400 characters, with no control characters')
    rec.originalPath = p
    const r = fromPath(p)
    if (r.blob) rec.blob = r.blob
    else { rec.state = 'link-only'; rec.reason = r.reason }
  } else {
    // content: text as given, or an image as base64 with its mime type
    const mime = String(input.mime || '').toLowerCase()
    if (Object.hasOwn(IMAGE_MIME, mime) || kind === 'image') {
      const ext = IMAGE_MIME[mime]
      if (!ext) throw fail(400, 'An image needs mime image/png, image/jpeg, image/gif or image/webp')
      const b64 = String(input.content)
      if (b64.length > Math.ceil(LIMITS.image / 3) * 4 + 8) throw fail(413, 'This image is ' + sizeText(b64.length * 0.75) + '; the limit is 5 MB')
      const buf = Buffer.from(b64, 'base64')
      if (buf.length > LIMITS.image) throw fail(413, 'This image is ' + sizeText(buf.length) + '; the limit is 5 MB')
      rec.blob = storeBlob(buf, checkBuffer(buf, ext))
    } else {
      if (/^image\/svg|html|xml/.test(mime)) throw fail(400, 'SVG and HTML are not stored as content; save them as a file')
      const buf = Buffer.from(String(input.content), 'utf8')
      if (buf.length > LIMITS.text) throw fail(413, 'This text is ' + sizeText(buf.length) + '; the limit is 1 MB')
      const ext = mime === 'text/csv' ? 'csv' : mime === 'text/plain' ? 'txt' : 'md'
      rec.blob = storeBlob(buf, checkBuffer(buf, ext))
    }
  }
  fs.mkdirSync(INDEX, { recursive: true })
  writeAtomic(path.join(INDEX, rec.id + '.json'), JSON.stringify(rec, null, 2))
  try { require('./agent-company.cjs').activity({ actor: rec.by, action: 'deliverable.added', entityType: 'deliverable', entityId: rec.id, summary: title + (rec.state === 'stored' ? '' : ' (link only' + (rec.reason ? ': ' + rec.reason : '') + ')'), via: actor.door }) } catch { /* no company */ }
  return rec
}

function readOne(id) {
  const clean = String(id || '').replace(/[^\w.-]/g, '')
  if (!/^dl-[\w-]+$/.test(clean)) return null
  try { return JSON.parse(fs.readFileSync(path.join(INDEX, clean + '.json'), 'utf8')) } catch { return null }
}

/** Every deliverable, newest first, with what the gallery needs. */
function listDeliverables(filter) {
  filter = filter || {}
  let names = []
  try { names = fs.readdirSync(INDEX).filter((f) => f.endsWith('.json')) } catch { return [] }
  const out = []
  for (const f of names) {
    let r
    try { r = JSON.parse(fs.readFileSync(path.join(INDEX, f), 'utf8')) } catch { continue }
    if (!r || !/^dl-/.test(String(r.id))) continue
    if (Number(r.schemaVersion) > SCHEMA) r = Object.assign({}, r, { state: 'link-only', reason: 'written by a newer Arsenale', blob: null })
    if (filter.kind && r.kind !== filter.kind) continue
    if (filter.taskId && r.taskId !== filter.taskId) continue
    if (filter.agent && r.agent !== filter.agent) continue
    const missing = r.state === 'link-only' && r.source === 'path' && r.originalPath && !fs.existsSync(r.originalPath)
    out.push({
      id: r.id, kind: r.kind, title: r.title, note: r.note || '', jobId: r.jobId || '', taskId: r.taskId || '', agent: r.agent || '',
      by: r.by || '', createdAt: r.createdAt, source: r.source, url: r.url || '', originalPath: r.originalPath || '',
      state: missing ? 'missing' : r.state, reason: r.reason || '',
      mime: r.blob ? r.blob.mime : '', bytes: r.blob ? r.blob.bytes : 0, image: !!(r.blob && /^image\//.test(r.blob.mime)),
    })
  }
  return out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
}

/** The stored copy for the server: file path, mime and whether it may show
 *  inline. Only from the store, never from the original path. */
function blobFor(id) {
  const r = readOne(id)
  if (!r || !r.blob || !/^[a-f0-9]{64}\.[a-z]+$/.test(String(r.blob.file))) return null
  const ext = r.blob.file.split('.').pop()
  const t = TYPES[ext]
  if (!t) return null
  const file = path.join(BLOBS, r.blob.file)
  if (!fs.existsSync(file)) return null
  return { file, mime: t.mime, inline: !!(t.image || t.text || ext === 'pdf'), name: r.title.replace(/[^\w .-]/g, '_').slice(0, 80) + '.' + ext, text: !!t.text }
}

/** How much the store holds (Settings readout, the 2 GB soft warning). */
function storeSize() {
  let bytes = 0, files = 0
  try { for (const f of fs.readdirSync(BLOBS)) { bytes += fs.statSync(path.join(BLOBS, f)).size; files++ } } catch { /* empty */ }
  return { bytes, files, warn: bytes > 2 * 1024 * MB }
}

module.exports = { DIR, INDEX, BLOBS, KINDS, TYPES, SECRET, LIMITS, STORE_FULL, addDeliverable, listDeliverables, readOne, blobFor, storeSize, sniff, roots }
