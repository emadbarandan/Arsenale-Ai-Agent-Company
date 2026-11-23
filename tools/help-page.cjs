'use strict'
/** The user guide as one page: the same source (docs/guide/src/guide.html)
 *  feeds the Help page on the dashboard and the PDF (docs/guide/build.cjs). */
const fs = require('fs')
const path = require('path')

const SRC = path.join(__dirname, '..', 'docs', 'guide', 'src', 'guide.html')
const IMG = path.join(__dirname, '..', 'docs')
const VERSION = require('../package.json').version
const { dsMark, DS_FAVICON } = require('./pages/stage/identity.cjs')

const TOC = [['start', 'Start'], ['campus', 'Campus'], ['office', 'Office'], ['live', 'Live'], ['decisions', 'Decisions'], ['team', 'Team'], ['tasks', 'Tasks'], ['finished', 'Finished work'], ['activity', 'Activity'], ['versionrun', 'Version run'], ['gatehistory', 'Gate history'], ['settings', 'Settings'], ['phone', 'Phone notifications'], ['safety', 'Safety'], ['queue', 'The test queue'], ['resume', 'After a restart']]

const CSS = `
*{box-sizing:border-box}
body{font:14px/1.55 Arial,Helvetica,sans-serif;color:#1c2430;margin:0;background:#fff}
main{max-width:760px;margin:0 auto;padding:28px 24px 60px}
h1{font-size:28px;margin:0 0 4px;display:flex;align-items:center;gap:12px}h1 .mark{flex:none}h2{font-size:19px;margin:0 0 8px;padding-top:6px}
section{margin:0 0 26px}p,ul,ol{margin:6px 0}
.sub{color:#5b6675;margin:0 0 18px}
nav.toc{display:flex;flex-wrap:wrap;gap:6px 14px;margin:0 0 24px;font-size:13px}
a{color:#0b7a5a}code,pre{font-family:Consolas,"Courier New",monospace;font-size:12.5px;background:#f0f2f5;border-radius:4px}
code{padding:1px 4px}pre{padding:8px 10px;overflow-x:auto}
table{border-collapse:collapse}td{padding:3px 14px 3px 0;vertical-align:top}
img{display:block;max-width:100%;border:1px solid #d5dae1;border-radius:4px;margin:10px 0}
.note{border-left:3px solid #0b7a5a;padding:2px 10px;background:#f4f8f6}
`
const PDF_CSS = '@page{size:A4;margin:16mm 16mm 18mm}main{max-width:none;padding:0}section{break-inside:avoid-page}img{max-height:78mm;width:auto;max-width:100%}.cover{height:240mm;display:flex;flex-direction:column;justify-content:center}.cover h1{font-size:44px}.cover .sub{font-size:16px}.pg{break-before:page}'

/** mode 'help': links and images served by the dashboard; mode 'pdf': local files */
function render(mode, opts) {
  const o = opts || {}
  const pdf = mode === 'pdf'
  const toc = pdf ? '' : '<nav class="toc" aria-label="Sections">' + TOC.map((t) => '<a href="#' + t[0] + '">' + t[1] + '</a>').join('') + '</nav>'
  const base = o.imgBase || (pdf ? '../../' : '/help/img/')
  const body = fs.readFileSync(SRC, 'utf8').replace(/@img\//g, base)
  return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Arsenale Help</title><link rel="icon" href="' + DS_FAVICON + '"><style>' + CSS + (pdf ? PDF_CSS : '') +
    '</style></head><body><main>' +
    (pdf ? '<div class="cover"><h1>' + dsMark(64) + 'Arsenale</h1><p class="sub">User guide, version ' + VERSION + '</p></div><div class="pg"></div>' : '<h1>' + dsMark(36) + 'Arsenale Help</h1><p class="sub">Version ' + VERSION + '</p>') +
    toc + body + '</main></body></html>'
}

/** a picture the guide uses: only png files in docs/screenshots and docs/media */
function imagePath(rel) {
  const m = /^(screenshots|media)\/([A-Za-z0-9._-]+\.png)$/.exec(String(rel || ''))
  if (!m) return null
  const p = path.join(IMG, m[1], m[2])
  return fs.existsSync(p) ? p : null
}

module.exports = { render, imagePath, TOC }
