# PROJECT.md: <app name>

<!--
Copy this file to the root of the app's git repo as PROJECT.md and fill it in.
Every agent reads it before doing anything (AGENT-RULES.md, rule 0), so write
facts, not wishes. Delete the hint comments once a section is filled in.
If a fact is unknown, write "unknown" rather than leaving the heading empty.
Agents will then ask instead of guessing.
-->

Last checked against the code: <YYYY-MM-DD>

## Stack

<!-- Runtime, framework, language, packaging. Name the entry points. -->
- Runtime / shell: <e.g. Electron 3x, main process `main.cjs`, preload `preload.cjs`>
- UI: <e.g. React 18 + Vite, `src/App.jsx`>
- Language: <JS / TS; is `tsc -b` part of the build?>
- Tests: <e.g. Vitest / custom Electron harness in `scripts/test/`>
- Notable modules: <calc engine, crypto, licence core; say which files are pure logic>

## Commands

| Purpose | Command | Notes |
|---|---|---|
| Install | `npm ci` | <never `npm install` unless told; lockfile is authoritative> |
| Run (dev) | `npm run dev` | <which URL> |
| Run (Electron) | <e.g. `npm run electron:dev`> | <user-data dir, flags> |
| Test (all) | <e.g. `npm test`> | <does it run against `dist/`? then build first> |
| Test (subset) | <e.g. `npm run test:only -- --only=<text>`> | |
| Type check | <e.g. `npx tsc -b`> | |
| Build (web) | <e.g. `npx vite build`> | |
| Build (installer) | <e.g. `npm run electron:build`> | <any multi-step ritual, and why each step exists> |

## Dev port

- Dev server: <port, e.g. 5177>. Other apps on this machine use: <list, to avoid clashes>.
- Remote-debugging port for visual QA, if one is fixed: <port or "pick a free one">.

## Installer output

- Output folder: <e.g. `C:/myapp-installer-build`>. <Why it is outside a synced folder, if it is: sync locks.>
- File name pattern: <e.g. `MyApp Setup <version>.exe`>
- Icon check: <how to verify the embedded icon, and the known trap>

## Version files

<!-- Every place the version number lives. They must all agree. -->
- `package.json` and `package-lock.json`
- <e.g. `src/version.js`>
- <About modal "new" list: file and symbol>
- <release notes: e.g. `build/RELEASE_NOTES.txt` or `CHANGELOG.md`>
- Update feed: <e.g. Gist URL name (not its token), which fields it holds>

## Forbidden paths

<!-- Agents never open, print or copy these. List patterns, not contents. -->
- `secrets/`, `*.pem`, `*.key`, `*.lic`, `.env*`
- <the app's document format that may hold real data, e.g. `*.myappdoc`>
- <the licence folder, e.g. path of the licence folder>
- <folders agents must not edit, e.g. generated files, vendored code, `node_modules/`>
- Test data: <where the invented fixtures live, e.g. `scripts/test/fixtures.cjs`, `docs/user-guide/tools/demo-data.cjs`>

## Git policy

- Repo root: <path; say if the workspace root is a different repo>
- Main branch: <name>. Working branch: <name or "ask">.
- Commit allowed by agents: <no / only when the supervisor says so / standing permission>.
- Push, merge, tag allowed: <no / only on explicit instruction / standing permission for this repo only>
- Remote: <name only; e.g. private GitHub repo `org/name`>

## File map

<!-- Where the important parts live, so agents read line ranges instead of
whole files (AGENT-RULES section 9). One line each; update it when code moves.
Works for any stack: app screens, website routes, mobile screens, design files.
- `src/App.jsx` — state, save/open, crash copy (~lines 1-900 state, 1800-2600 save)
- `src/components/PersonFormModal.jsx` — Add/Edit person form
- `scripts/test/cases.cjs` — all end-to-end tests; run one with --only=<name>
-->

## Domain notes

<!-- The local knowledge that makes a change right or wrong. Examples of what belongs here: -->
- Users and roles: <e.g. admin in the office; field users with a restricted role>
- Hard rules: <e.g. "field users may only add; enforced where data is written, not by hiding buttons">
- File format and compatibility: <format name and version, legacy versions still read, "older app must not drop unknown fields">
- Engineering references: <standard and edition, reference workbooks and where they are, units, agreed tolerances>
- Decisions already taken: <e.g. "min towline floor removed to match the workbook; do not re-add">

## Docs

- Developer docs: <README.md, architecture notes>
- User guide: <path, build command, screenshot capture script>
- Release notes: <path>
- Specs and mockups: <where spec-writer and ui-designer should write, or "scratchpad">
