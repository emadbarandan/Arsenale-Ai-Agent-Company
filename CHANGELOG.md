# Changelog

All notable changes are listed here. Versions follow
[Semantic Versioning](https://semver.org).

## 1.0.0 (2026-10-06)

First public release.

### For everyone
- **Redesigned 1.0 screens.** Tasks as a board (To do, Working on it,
  Waiting for you, Done this week) or a list, a new-task page and a task page;
  Approvals as one letter at a time (the question in plain words, what would
  happen, why it matters, if you say no, whether it leaves your computer);
  Finished work as a searchable gallery; Settings with Assistants, Phone
  alerts, Safety rules, Office packs and Privacy; the first-start wizard in
  four steps beside a campus that builds itself; Team as an office room with
  the profile and the new-desk form at its side; and a new org chart.
- People are shown by name: a member may have a name, things they are good
  at and a picked look (all optional, in employees.json); a title made from an
  id spells acronyms ("SEO specialist"). File ids, task numbers and tokens
  only under Details.
- `arsenale demo --shop`: the invented company as a small shop with four
  office packs and no developers.
- **MCP server** (`arsenale mcp`), with no dependencies: tools to say hello,
  start a job, log a step, finish with a plain summary, ask the owner, read
  answers and the inbox, read, create and move tasks, comment, register a
  deliverable, record a decision, check an action, check a budget, read the
  team and a member's brief, and propose a hire. Answers are read per client,
  so two assistants never take each other's answers. Optional MCP over HTTP on
  the dashboard (`/mcp`), off unless `ARSENALE_MCP_TOKEN` is set.
- **Connect your assistant** (Settings): per client the exact command, link or
  snippet (Claude Desktop, Claude Code; Cursor, VS Code, Codex CLI and Gemini
  CLI marked experimental), a Test button, and, only after you saw the change,
  the edit of that client's settings file with a backup. ChatGPT is not
  connectable (it needs a public server).
- **Tasks**: write a task on the dashboard (who it is for, due date, links,
  "I want to check it before it is done"); the assistant reads it in its inbox,
  moves it and comments. A job started for a task moves it to In progress.
- **Approvals** screen: questions, choices, hire proposals with the full
  instructions, and approvals for actions that leave the computer.
- **Team**: hire and edit team members with a 4-step form that shows the
  generated file before writing it; profile with allowed actions,
  instructions and history; every edit keeps a backup; retire and restore.
- **Office packs**: Content & Marketing, Research, Operations & Admin, HR,
  Finance, Customer support and Design (33 members), installed into
  `~/.arsenale/agents`, removed without touching files you changed.
- **Safety rules** (`policy.json`): each outside action (send, post, pay,
  delete, share, change accounts, other) is Allowed, Ask me first (the default)
  or Never, per member; `check_action` / `arsenale check-action`. Advisory, and
  the screens say so.
- **Deliverables** gallery: links, text, images and files registered by the
  team, copied into Arsenale's own store (only from the folders you allow,
  never a protected file), with previews.
- **First-start wizard** in the dashboard: company, offices from packs, how
  you pay for your assistant, budget, assistants, notifications, a review of
  every file it will create, then Connect.
- **Plain words**: a Today strip on the campus ("your team finished 7 jobs in
  2 h 05 min · 3 deliverables · 1 question waiting"); a finished job shows its
  summary and what was done first, then the time, then money only when it is
  real ("Included in your plan" on a monthly plan, never "$0").
- **Notifications**: browser notifications for a new question, a task waiting
  for you and budget alerts. Phone channels, **experimental**: ntfy and
  Telegram with signed, single-use, 30-minute Approve / Decline buttons
  (details mode only; never for payments), Pushover notify-only; secrets only
  from environment variables.
- New CLI modes `--task`, `--comment`, `--deliverable`, `--check-action`
  (aliases `task`, `comment`, `deliverable`, `check-action`).
- Not in 1.0 (help wanted, see CONTRIBUTING.md): a desktop app, update checks,
  email notifications, clients that need a public server.

### The product
- One name, Arsenale, for the command, the page and the package.
- Works with any coding agent: a neutral run log (`arsenale log`, with short
  aliases `start`, `progress`, `finish`, `gate`, `decision`, `answers`, …) and
  adapters for Claude Code, OpenAI Codex CLI, Gemini CLI, Cursor, Aider and
  plain scripts (`adapters/`).
- Data lives in one folder, `~/.arsenale` (or `ARSENALE_HOME`), never next to
  the code. Agent folders and transcript folders are configurable
  (`config.json`, or `ARSENALE_AGENT_DIRS` / `ARSENALE_TRANSCRIPT_ROOTS`).
- `arsenale demo`: the dashboard on an invented company, in a temporary
  folder, without reading or writing your data.
- `arsenale serve --port N --no-open`; complete `--help` and documented exit
  codes for the launcher and the run log.
- Activity screen: company log lines and the history derived from runs,
  questions and decisions, grouped by day, with filters.
- Desks are generated for any list of agents (by a `zone:` line or the
  agent's name) instead of a fixed list of names.
- Bundled team: 20 specialists, an office lead and three heads
  (`engineering-lead`, `product-lead`, `research-lead`); rules and workflow in
  English, with "the user's language" instead of a fixed one; model tiers
  (heavy, standard, light) instead of fixed model names.
- Model prices ship empty; "heavy" models for the usage split are configurable
  (`heavyModels`).

### Security
- Every response forbids framing (`X-Frame-Options: DENY`,
  `frame-ancestors 'none'`); the HTML has a Content-Security-Policy whose only
  allowed script is the page's own, by a nonce made per response.
- `esc()` in the pages also escapes `'`.
- The finish record's file name is built from a parsed date and a cleaned
  agent name: no path traversal, no NTFS streams.
- JSON input by `--stdin`, `--file` or `@file`, documented everywhere instead
  of inline JSON in single quotes (which a quote in the text could break out of).
- Bad JSON gives one sentence and exit 1, never a stack trace.
- Transcript paths are read only inside the configured transcript roots.
- Ids from files and requests are matched as own keys only (`constructor`,
  `__proto__` and the like are not employees).
- One write library (`tools/runlog.cjs`) behind the three doors, with the
  actor fixed by the door: the page writes as the owner, MCP as the assistant,
  the CLI as its JSON says (unchanged). Owner-only work is refused in the
  library for every other actor. The CLI's output is byte-for-byte what it was.
- MCP over HTTP: Host, Origin and bearer-token checks, 20 calls a second,
  64 KB bodies (7 MB for a deliverable), sessions that expire after an hour.
- The hire form generates the frontmatter itself (typed text cannot add a
  key), refuses ids that change when cleaned and names Windows reserves, and
  writes only into Arsenale's own agent folder unless you confirm another
  tool's file.
- Deliverables: realpath inside the allowed folders, secret-path patterns,
  size and type limits, first-byte checks for images, no SVG or HTML; stored
  copies served with `nosniff` and `Content-Security-Policy: sandbox`; the
  page's `img-src` allows only that path.
- Phone buttons: HMAC-SHA256 over the gate, decision, expiry, a 128-bit nonce
  and a hash of the question; single use; "Sign out all phones" invalidates
  every button sent.

- **The owner's key.** The dashboard opens only with a random key kept in a
  file only your account can read (`launch-key` in the data folder, mode 0600;
  on Windows the launcher limits it to your user with `icacls`). `serve`,
  `demo` and the new `arsenale open` open `/?k=<key>`, which is exchanged for
  an HttpOnly, SameSite=Strict cookie required on every request; `/api/token`
  is gone. SECURITY.md has the threat model.
- Telegram pairs through a one-time `/start <token>` link (128 bits, 10
  minutes, 5 wrong tries), only from a private chat, and checks the sender.
- Phone buttons only for actions whose rule allows phone approval (never a
  payment) and for choices; never for hires or plain approvals.
- Connect keeps the settings file's mode, follows a symlink to the real file,
  and shows only the arsenale entry (other servers' secrets never reach the page).
- Deliverables give one reason for a file outside or missing, resolve Windows
  short names, refuse hard links, and stop at 5 GB.
- MCP: at most 32 HTTP sessions, batch items counted toward the rate limit
  (batches over 20 refused), refused-tool lines rate-limited, 50 open jobs per client.

### Performance
- `/api/state` and `/api/company` are cached until something they are made of
  changes on disk, carry an ETag, answer `304` with no body while nothing
  changed, and are gzip-compressed when the browser accepts it. Measured with
  350 invented runs: an idle tab went from about 1.1 MB per poll every 1.5 s
  (about 2.7 GB an hour, 0.7 s of server time per poll) to empty 304s
  (about 5 ms each); the first load went from 1.1 MB to 39 KB on the wire.

### Installer
- Windows PowerShell 5.1 safe (`install.ps1`) and POSIX (`install.sh`), same
  steps: asks before every change outside the data folder (`-Yes`/`--yes`
  accepts, `-DryRun`/`--dry-run` only prints); adds files next to yours instead
  of moving folders; backs up anything it overwrites; never edits a tool's
  settings file (the dashboard's "Connect your assistant" does, only after
  showing you the change and keeping a backup); `-Uninstall`/`--uninstall`
  removes what it added and puts back what it replaced.
