# Contributing to Arsenale

Thank you for helping. Arsenale is small on purpose: no dependencies, plain
Node.js, data in plain JSON files. Please keep it that way.

## How a change gets in

Nobody pushes to `main` directly, the maintainer included. Every change goes
through a pull request that the maintainer reviews and merges.

1. **Fork** the repository on GitHub.
2. **Branch** in your fork from `main`, named for the change
   (`fix/answer-double-click`, `feat/costs-page`).
3. **Change, with tests.** A bug fix comes with a test that fails without the
   fix. Run the whole suite:
   ```
   npm run test:all
   ```
   It needs only Node.js 22 or newer. When several agents share one machine,
   run the full suite through `arsenale testq run --run <id> -- npm run test:all`
   so only one suite runs at a time. `npm test` is the fast tier (no browser);
   `npm run test:ui` runs the page tests, at most two Chromes at once, when
   Chrome or Edge is installed (set `CHROME_BIN` to point at one) and skips
   them otherwise.
4. **Open a pull request** against `main`. Fill in the template: what changed,
   why, how you tested it, and what it does to saved data.
5. **Review.** The maintainer (see `.github/CODEOWNERS`) reviews every pull
   request. CI must pass on Windows, macOS and Linux.
6. **Merge.** Only the maintainer merges, once the review is approved.

For anything larger than a fix, open an issue first so we can agree on the
shape before you build it.

## Pre-push guard

Run `npm run setup-hooks` once after cloning. It sets `core.hooksPath` to
`tools/hooks`, so git runs the `pre-push` hook (plain Node.js, so it works the
same on Windows, macOS and Linux). When the remote is the public release repo,
`github.com/emadbarandan/Arsenale-Ai-Agent-Company`, the hook refuses every
branch push and lets only `v*` tags through; those are pushed by the owner at
release time. Pushes to any other remote pass.

The hook needs `node` on PATH; without it the push fails (it fails closed). If
`core.hooksPath` is already set, `setup-hooks` leaves it and warns; add
`-- --force` to replace it.

## Rules the code keeps

- **The server never starts or ends a process** and never runs anything
  because of a request. Buttons that sound like actions (Nudge, Stop, Resume,
  Undo) write a line for the supervisor to act on. It stays bound to
  `127.0.0.1`, with the Host, Origin and token checks. A change that touches
  them needs a test for the refusal.
- **Run records are never rewritten.** Anything derived (project, office,
  cost) is worked out on read. Saved files stay readable by older versions; a
  new field is optional.
- **Everything shown is escaped.** Use `esc()` for any text from a file.
- **No real data** in tests, fixtures or screenshots: invented names only.
- **English only.** New interface text goes through `T('…')`, which returns
  the English key; the language tests check no other script appears.
- **No authorship marks.** `tools/test/wording.test.cjs` fails on a line in
  any file that claims an assistant wrote it (a co-author trailer, a
  tool footer and the like). Naming the tools Arsenale works with is fine.
- Match the style around your change; comments say why, not what.

- **One write path.** Every write goes through `tools/runlog.cjs` and the
  libraries next to it; a door (CLI, MCP, page) only fixes the actor. Owner-only
  work is refused in the library, never just hidden in the UI.
- **Safe writes.** Data files are written with `writeAtomic` and changed under
  `withLock` (`tools/store.cjs`), never with a bare `fs.writeFileSync`.

## Help wanted

Arsenale 1.0 runs in your browser from `arsenale serve`, and deliberately
leaves these open. Each is a good first issue to discuss before you build;
open an issue with the label `help wanted` and the area's name.

- **A desktop app** (Windows, macOS): a tray icon with the waiting count,
  start at sign-in, the OS keychain for secrets, no Node.js for end users, a
  bundled CLI binary for MCP stdio, signed installers with checksums and an
  install-help page for unsigned ones. The spec's preferred shell is Electron,
  with the dashboard server in the main process.
- **ChatGPT and other clients that need a public server.** ChatGPT connectors
  reach only MCP servers on the public internet. A safe way needs real
  authentication and must not open the owner's data to the internet by
  default (for example an opt-in tunnel the user runs, with its own login).
- **A Claude Desktop Extension** (`.mcpb`) for one double-click install.
- **The client matrix.** Check, on current releases, that each card in
  Settings → Connect your assistant works: the Cursor and VS Code install
  links, `codex mcp add`, Gemini CLI's settings file, whether each client
  honours the server's instructions, and record the result in the release
  notes.
- **Email notifications** without a dependency (an SMTP client with TLS), notify
  only, password from an environment variable or the keychain.
- **Phone channels on real phones**: ntfy action buttons from the iOS and
  Android apps, Telegram callbacks; today they are tested against their
  protocol only.
- **Signed or reviewed third-party office packs**, and new bundled packs for
  other trades (HR and Finance texts need a qualified reviewer).
- **Claude Code hook enforcement** of the safety rules (block a known sending
  or paying tool unless approved), as an opt-in.
- **Update checks** (opt-in, GitHub Releases only) once there is a desktop app.
- **A Linux desktop package.**

## Commits

Write commit messages in the imperative ("Fix the answer double-click"). Do
not add co-author or "generated by" lines for tools or assistants; the person
who opens the pull request is the author and answers for it.

## Reporting security problems

Not in a public issue: see [SECURITY.md](SECURITY.md).
