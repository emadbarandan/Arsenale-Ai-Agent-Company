const { t, langScript } = require('../../dashboard-strings.cjs')
const path = require('path')
const { COMPANY_STYLE, companyViews } = require('../../agent-company-page.cjs')
// The campus art and the 3D office (office-world.cjs, see OFFICE-WORLD-NOTE.md).
// Loaded fresh with this file, so a changed drawing shows on the next reload.
delete require.cache[require.resolve('../../office-world.cjs')]
const { WORLD_STYLE, campusArt, office3d, worldScripts } = require('../../office-world.cjs')
const { characterScripts, PEOPLE_STYLE } = require('../world/people.cjs')
const { ACTIVITY_STYLE, activityView } = require('../../activity-page.cjs')
const { VR_STYLE, versionRunView } = require('../../version-run-page.cjs')
const { EVERYONE_STYLE, everyoneViews } = require('../../everyone-page.cjs')
const { everyoneArt } = require('../../everyone-art.cjs')
const { homeDesks } = require('./home-desks.cjs')
const { OFFICE_STYLE, CR_STYLE } = require('./style.cjs')
const { controlRoom } = require('./control-room.cjs')
const { STAGE_STYLE } = require('../stage/style.cjs')
const { GLASS_STYLE } = require('../stage/glass.cjs')
const { IDENTITY_STYLE, dsMark, dsLogo, DS_FAVICON } = require('../stage/identity.cjs')
const { officeClient } = require('./client.cjs')

// The bottom tab bar of the narrow (9:16) layout: the five screens of the top bar, which it replaces there
const tabIcon = (d) => '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>'
const BTABS = [
  ['campus', 'Campus', tabIcon('M3 21h18M5 21V8l7-4 7 4v13M9 21v-6h6v6M9 10h.01M15 10h.01')],
  ['office', 'Office', tabIcon('M4 20h16M6 20v-7h12v7M9 13V8h6v5M12 4v4')],
  ['live', 'Live', tabIcon('M3 12h4l3-7 4 14 3-7h4')],
  ['appr', 'Decisions', tabIcon('M4 5h16v14H4zM8 12l3 3 5-6')],
  ['team', 'Team', tabIcon('M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 4a4 4 0 0 1 0 7M22 21v-1a6 6 0 0 0-4-5.6')],
]

/** The office page. `live` swaps the self-reloading file for server polling;
 *  `token` (live only) lets the page post answers to the server. */
function renderOffice(state, opts = {}) {
  const live = !!opts.live
  // English is the only language (dashboard-strings.cjs); opts.lang is not read
  const lang = 'en'
  const T = (key) => t(lang, key)
  const dir = 'ltr'
  const data = JSON.stringify(state).replace(/</g, '\\u003c')
  const archive = live ? 'archive' : 'agent-dashboard-archive.html'
  // the server's per-start secret: only a page it served can post an answer
  const token = live && opts.token ? String(opts.token) : ''
  const refresh = live ? '' : `<meta http-equiv="refresh" content="${state.active.length ? 4 : 15}" />`
  // the company, if one is set up (agent-company.cjs companyState); without it
  // the page is the single office it always was
  // with no company yet the wizard still draws each office pack in its colour
  const company = opts.company && opts.company.configured ? opts.company : { configured: false, themes: require('../../agent-company.cjs').THEMES }
  const co = company.configured
  // the demo's showcase look (arsenale demo --showcase, or ?showcase=1 on a demo server): never in the real app
  const demo = !!opts.demo
  const showcase = demo && !!opts.showcase
  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
${refresh}
<link rel="icon" href="${DS_FAVICON}" />
<title>Arsenale</title>
<style>${OFFICE_STYLE}${CR_STYLE}${COMPANY_STYLE}${WORLD_STYLE}${PEOPLE_STYLE}${ACTIVITY_STYLE}${VR_STYLE}${EVERYONE_STYLE}${STAGE_STYLE}${GLASS_STYLE}${IDENTITY_STYLE}</style>
</head>
<body>
<div class="board${live ? ' live' : ''}${showcase ? ' showcase' : ''}" id="board">
  <header class="top">
    <h1 class="brand${co ? ' co' : ''}">${dsMark(28)}<span class="wm">${dsLogo(26)}<b class="sr">Arsenale</b></span><span class="scrn" id="scrn"></span></h1><span class="date" id="date"></span>
    <div class="views" role="group" aria-label="${T('View')}"><button type="button" data-view="campus" aria-pressed="false">${T('Campus')}</button><button type="button" data-view="office" id="vtab-office" aria-pressed="true">${T('Office')}</button>${co
      // five screens in the bar; the rest, and the two views from before the company, under "More"
      ? '<button type="button" data-omenu="office" id="omenu-office" aria-label="' + T('Choose an office') + '" aria-haspopup="true">▾</button><button type="button" data-view="live" aria-pressed="false">' + T('Live') + '</button><button type="button" data-view="appr" aria-pressed="false">' + T('Decisions') + '<span class="tc" id="tc-appr"></span></button><button type="button" data-view="team" aria-pressed="false">' + T('Team') + '</button><button type="button" data-omenu="legacy" id="omenu-legacy" aria-haspopup="true">' + T('More') + ' ▾</button>'
      : `<button type="button" data-view="appr" aria-pressed="false">${T('Decisions')}</button><button type="button" data-view="dec" aria-pressed="false">${T('Gate history')}</button><button type="button" data-view="use" aria-pressed="false">${T('Tools & usage')}</button><button type="button" data-view="act" aria-pressed="false">${T('Activity')}</button><button type="button" data-view="live" aria-pressed="false">${T('Live')}</button><button type="button" data-view="set" aria-pressed="false">${T('Settings')}</button>`}</div>
    <div class="sgrp" role="status"><ul class="counts" id="counts" aria-label="${T('Summary')}"></ul>
    <span class="live" id="mode"${live ? ' title="' + T('Refreshes every 1.5 seconds') + '"' : ''}><i></i> ${live ? T('Live') : T('Built file · refreshes automatically')}</span></div>
    <button type="button" class="helpb" id="helpb" data-help="1" aria-haspopup="true" aria-expanded="false" aria-controls="helpop" title="${T('Help and legends')}" aria-label="${T('Help and legends')}">?</button>
  </header>
  <div class="helpop" id="helpop" hidden>
    <b>${T('Help')}</b>
    ${live ? '<a class="hlink" href="help" target="_blank" rel="noopener">' + T('Open the user guide') + ' ↗</a>' : ''}
    <button type="button" data-legends="1" aria-pressed="false">${T('Show legends and notes on the screen')}</button>
    ${demo ? '<button type="button" data-showcase="1" aria-pressed="' + showcase + '">' + T('Showcase: hide the dock, legends and notes (demo only)') + '</button>' : ''}
    <p>${T('Legends explain the colours and marks of the screen you are on. They stay hidden until you show them here.')}</p>
  </div>
  <div class="v-office" id="v-office">
  <aside class="insp" id="insp" aria-label="${T('Agent details')}" aria-live="polite"></aside>
  <main class="stage" id="stage" tabindex="0" aria-label="${T('Office view — mouse wheel or + and - to zoom, drag or arrow keys to pan, 0 to fit')}"><div class="stage-in" id="stage-in"></div><div class="ohead" id="ohead"></div><div class="needs" id="needs" hidden></div>
    <div class="zoombar" id="zoombar" role="group" aria-label="${T('Office zoom')}"><button type="button" data-zoom="out" title="${T('Zoom out (-)')}" aria-label="${T('Zoom out')}">−</button><output id="zoomv">${T('100%')}</output><button type="button" data-zoom="in" title="${T('Zoom in (+)')}" aria-label="${T('Zoom in')}">+</button><button type="button" class="fitb" data-zoom="fit" title="${T('Fit whole office (0)')}">${T('Fit')}</button><span class="zh">${T('Mouse wheel: zoom · Drag: pan')}</span></div>
    <p class="legend" id="legend"></p></main>
  <section class="drawer" id="drawer" aria-labelledby="dr-h"></section>
  <div class="split split-v" id="split-v" role="separator" aria-orientation="vertical" aria-controls="insp" tabindex="0" title="${T('Drag to resize the panel; double-click: default size')}" aria-label="${T('Details panel width')}"></div>
  <div class="split split-h" id="split-h" role="separator" aria-orientation="horizontal" aria-controls="drawer" tabindex="0" title="${T('Drag to resize the report strip height; double-click: default size')}" aria-label="${T('Report strip height')}"></div>
  </div>
  <main class="vm" id="v-dec" aria-label="${T('Gate history')}" hidden></main>
  <main class="vm" id="v-use" aria-label="${T('Tools & usage')}" hidden></main>
  <main class="vm" id="v-act" aria-label="${T('Activity')}" hidden></main>
  <main class="vm" id="v-vr" aria-label="${T('Version run')}" hidden></main>
  <main class="cv" id="v-campus" aria-label="${T('Campus')}" hidden></main>
  <main class="cv" id="v-org" aria-label="${T('Org chart')}" hidden></main>
  <main class="ev" id="v-ev" hidden></main>
  <aside class="rail" id="rail" aria-labelledby="rail-h"></aside>
  <nav class="mini-rail" id="minirail" aria-label="${T('Waiting for you, collapsed')}"></nav>
  <aside class="dock" id="dock" aria-label="${T('Waiting for you')}" hidden></aside>
  ${co ? '<nav class="btabs" aria-label="' + T('Screens') + '">' + BTABS.map(([v, label, icon]) => '<button type="button" data-view="' + v + '" aria-pressed="false">' + icon + '<span>' + T(label) + '</span>' + (v === 'appr' ? '<b class="tc" id="tc-appr2"></b>' : '') + '</button>').join('') + '</nav>' : ''}
</div>
<div class="omenu" id="omenu" hidden></div>
<div class="cdlg-back" id="cdlg" hidden></div>
<div class="wiz-back" id="wiz" hidden></div>
${live ? worldScripts({ characterDirs: [path.join(require('../../paths.cjs').HOME, 'characters')] }) + characterScripts() : ''}
<script>
let DATA = ${data};
const LIVE = ${live};
const DEMO = ${demo};
const ARCHIVE_HREF = ${JSON.stringify(archive)};
let ANSWER_TOKEN = ${JSON.stringify(token)};
let COMPANY = ${JSON.stringify(company).replace(/</g, '\\u003c')};
const homeDesks = (${homeDesks.toString()});
${langScript(lang, live)}
const campusArt = (${campusArt.toString()});
const office3d = (${office3d.toString()});
const controlRoom = (${controlRoom.toString()});
const companyViews = (${companyViews.toString()});
const activityView = (${activityView.toString()});
const versionRunView = (${versionRunView.toString()});
const everyoneArt = (${everyoneArt.toString()});
const everyoneViews = (${everyoneViews.toString()});
(${officeClient.toString()})();
</script>
</body>
</html>
`
}

module.exports = { renderOffice }
