# Changelog

All notable changes are listed here. Versions follow
[Semantic Versioning](https://semver.org).

## 1.2.2 (2026-11-18, unreleased until the owner tags it)

- **A guard against pushing to the public repository.** `npm run setup-hooks` installs a git pre-push hook. It refuses any branch push to the public release repository and lets `v*` tags through. Pushes to any other remote are not touched.
- **One set of numbers.** The README, the reference, `package.json` and the repository links now agree: 25 agents (an office lead, three heads and 21 specialists) and 17 office packs. A test fails if the README or the reference drift from the folders.
- The contributing guide asks for Node.js 22, as the engine field does.

## 1.2.1 (2026-10-22)

- **Windows: the phone settings folder is closed to other users.** On a folder whose access entries were its own, earlier versions left the Users group able to read it. Arsenale now removes every other entry.
- **The Windows installer works when started from PowerShell 7.** It no longer depends on Get-FileHash.
- **A folder that cannot be written now fails at once** instead of after 35 seconds of retries.
- **Node.js 22 or newer** (Node.js 20 is past its end of life).
- The tests now pass on Linux, macOS and Windows with Node.js 22 and 24.

## 1.2.0 (2026-10-21)

- **A new look, "Stage".** One light theme, made stronger: a tinted ground, white cards with soft shadows, bolder office colours and larger text (nothing you must read is under 13 px). The top bar shows five screens (Campus, Office, Live, Decisions, Team) and puts the rest under More. Legends and help notes wait behind the **?** button. The waiting rail is now a small "Waiting for you" card in plain words, and the full list names each gate in words (Questions, Design pick, Commit, Merge, Release) instead of letters. Team opens as tiles of people. In the office, the labels are lighter: one small line (a dot and the name) only for people who work, wait or need a look, close ones folded into a counter such as "3 working", and no "0 reports handed in" (the tray shows a count only above zero). The coloured bars on the left of waiting task cards and of quiet and stalled Live rows are gone; the row tint and the status pill show the state.
- **Animated people.** The office, the campus and every list show the KayKit characters by Kay Lousberg (CC0): they sit, type, walk, stand at the supervisor and idle. Their shirts take the office colour. The campus, the flat office and the lists use pictures rendered from the same models (`node tools/characters/build-sprites.cjs`). Every shipped file is listed in `tools/characters/manifest.json` with its source page, date, hashes and changes, and a test checks them. Your own `.glb` per person works as before, and the pixel people come back when the pictures are missing.
- **Offices you make.** **New office** (on the campus, next to Build, or Add an office on Team) asks for a name, a colour, a building and the kinds of work the office does, and writes nothing until you press Create office. Edit office changes them later. Only you can create, edit or archive an office; agents and the supervisor are refused.
- **Work goes to the right office.** There is a fixed list of 16 kinds of work (Testing, Code review, Writing docs and so on). A run's office is decided once, when it starts: an office named at the start, then the office that does that kind of work, then the project's office, then the person's home office. It is written into the run, so changing an office's kinds later never moves past runs or past budgets. `arsenale start` and MCP `start_job` take an optional `kind`. With no kinds set, everything works as in 1.1.
- **Marketplace.** Office packs have a page of their own (More, Marketplace). Besides the packs that ship with Arsenale, you can install a pack someone gave you, from a folder or a `.zip`. Arsenale checks that it holds only text, shows you all of it with warnings for anything risky, and installs its members with read-only tools unless you keep theirs. That tools line is honoured by Claude Code subagents; other assistants may ignore it. Such a pack is marked "From a folder: not checked by Arsenale". There is no online catalogue, and no command-line or MCP way to install one.
- **A logo and a slogan.** The arched gate "A" is in the header, the favicon and the README, and the slogan is "Hire agents. Watch them work. Stay in charge." `docs/brand/` holds the logo files, PNGs from 16 to 1080 px, the Instagram profile picture and a 1080 x 1920 reel cover.
- **For recordings.** A narrow layout (360 to 480 px wide) gives each screen one column for 9:16 video. `arsenale demo --showcase` hides the waiting card, the legends and the notes; the real app refuses it.
- **Wording.** Phone buttons say Approve and Reject, as on the page (the stored answer is still `decline`). The Team page's packs line is one link, "N more offices in the Marketplace".
- **Older versions.** No file format changed. Arsenale 1.1 ignores the new fields (an office's kinds, a run's office stamp, a local pack's source) and keeps them when it writes. A pack installed from a folder does not show on 1.1's pages, but its members keep working there.

## 1.1.0 (2026-10-21)

- **Live.** A new Live page (it takes the place of the Version run tab, whose header now sits on top of Live) lists every run that is working now: who, the task, the step, a percent, files changed, last activity, time so far and an estimate of the time left. The percent is the one the agent reports; when it reports none, Arsenale estimates it from files and tests against the plan, or from how long the same agent usually takes, and marks it "est.". Agents can send a plan and the step they are on (`arsenale progress <run> "<step>" <pct>`, or `plan`, `step`, `files`, `tests` on a progress line).
- **Stalled and dead runs.** A run that has been quiet for the stall limit (20 minutes by default, set in Settings) is flagged once, on the dashboard, in the browser and on the phone channels that are on. A run whose process has ended, or with no process and quiet past the dead limit (4 hours), is closed by Arsenale as "stopped"; its steps and its line in Activity stay. The office marks quiet, stalled and dead people with a small pill, and its "Needs a look" box and the side panel offer **Nudge** (asks the supervisor, through its inbox, to check the run) and **Clean** (hides a closed run; its log stays). Arsenale itself never stops or starts a process.
- **One test suite at a time.** `arsenale testq run --run <id> -- <command>` waits its turn and runs a full suite only when no other run on the machine is running one; `testq status` and `testq leave` show and leave the queue. A run waiting in the queue is not counted as quiet. Live shows who holds the suite and who waits.
- **Unfinished work.** `arsenale resume-scan` finds runs that ended without finishing and left changes in their worktree; Live lists them with Resume and Dismiss. Resume sends the stored brief to the supervisor's inbox; it starts nothing. `arsenale start` takes an optional `brief` and `worktree`.
- **Decisions.** Approvals is now the Decisions inbox, in three columns: needs your answer, approve to continue, always waits for you. A merge or a next phase can carry what it would do; Details shows the evidence. Every answer from the page carries the question it was given for, and one that changed since is refused. The old timeline under More is now called **Gate history**.
- **Approved actions can run by themselves (off by default).** Settings, Decisions has one switch, with a switch each for merges and for starting the next phase. When it is on, an approved merge or next phase is marked for the supervisor to go ahead without asking again, and "Done without you" on the Decisions page lists it with Undo for 10 minutes, once. Building, tagging, publishing or uploading a release always waits for you and never gets a phone button.
- **Notifications that work end to end.** Settings, Notifications has desktop, ntfy, Telegram and Pushover, each with Save, Send test, a result line and an on/off switch that stays off until a test arrived. Tokens are typed on the page and saved in a file only you can read (an environment variable of the same name still wins); the page shows only whether each one is set and whether the file is private. Changing a server, topic or token switches the channel off until a new test arrived. Each channel has its own list of events.
- **Team.** The Team page is a table of everyone, grouped by office, with a status dot, the current task, runs today and last active, a search box and filters; a row opens the profile.
- **Buildings.** The campus buildings are offices again: glass and block buildings with windows, an entrance and the office name on a sign, in shapes chosen by the size of the office. Shop awnings are gone.
- **Wording.** Persian text and the right-to-left code are gone; the interface is English only. A new test, `tools/test/wording.test.cjs`, fails on Arabic-script text and on lines that claim an assistant wrote the file (co-author trailers, tool footers and the like). Supported tools keep their names: `adapters/claude-code`, and the installer options `claude-code`, `-ClaudeDir` and `--claude-dir`, are as in 1.0.

- **The Friday look is back (owner decision, 2026-10-19).** The campus is light isometric buildings on plain white ground with an office card above each, the office is the bright 3D room with desks, furniture and people, the Team page is the directory table (see Team above) with the pixel-art people in its rows, and Tasks, Decisions and the rest show the pixel-art people again; the left accent bars on selected rows and waiting cards are back. The campus builder stays and is drawn in the same style: the 12 building types are four building shapes that differ in height and in what stands on the roof, the ghost, the lot outlines and the hotbar use the same drawings, and a campus of an older company starts as a block three lots wide. The Kenney models, their portraits and icons, `tools/assets.cjs` and its manifest are removed (nothing used them any more); the default character is again `tools/characters/default.glb`, made by our own script. README and `docs/` pictures are re-recorded from `arsenale demo` in this look.
- **Security hardening.** CLI actions that claim `"by":"board"` (campus, budgets, approvals, gate answers) need the owner's launch key in `ARSENALE_BOARD_TOKEN` (or `--board-token`); without it they act as an agent and board-only actions are refused. Supervisor campus edits need an active version run whose process is alive or that was updated in the last 30 minutes. `arsenale init` skips a symbolic link at a destination instead of writing through it.
- **Autonomous version runs.** `arsenale init` sets up agents, skills, PROJECT.md and the autonomous files; `arsenale autonomous start|status|resume <version>` keeps the state file and its mirror; a Version run page shows phases, token budget, agents, owner gates and review reports (a run selector when more than two runs are active). Run records carry optional `versionRun`, `phase`, `pid` and `tier`; a 4th heavy-tier run at once is refused, and `resume` closes runs whose process is gone. `arsenale awake` holds a Mac or Linux machine awake. The essential rules ship as `autonomous/RULES.md`. A version must look like `1.2` or `1.2.3-beta.1`.
- **Header.** The top bar fits at 1366 wide ("Live" with the interval as a tooltip).
- **Dry-run fixes.** `arsenale init --dry-run` shows the whole plan and a declined `init` writes nothing (not even `docs/specs`); `arsenale campus --help` (and the other short modes) print the help; `--version-run` takes a `reviews` list for the Version run page; a gate or decision can name its run with `versionRun`; a supervisor campus change needs a reason and is listed under its run; the round cap and the slow-suite note are in the autonomous rules; waiting-question and phone callouts lose the thick left stripe.
- **Campus builder.** The campus is a board of lots: 12 building types, a Build mode with a hotbar (keys 1 to 9),
  move, rotate and archive tools, a ghost building and a "Lot taken" refusal. The layout is `company/campus.json`;
  an older company is laid out in a block three lots wide and nothing is written until the first change. `arsenale campus` lets the
  supervisor place and move buildings in an autonomous run (each change is a decision). In the office, two runs of
  one agent are two people at two desks, each keeping its desk while it runs.
- **One light theme everywhere**: the header, the panels, the waiting rail,
  the org chart, activity, archive, dialogs and the 1.0 screens.
- **English only.** The language switch, all other-language strings, data and
  files, and the `?lang=` and `dash-lang` cookie handling are gone; every page
  is English.
- three.js r184 is pinned in `tools/vendor/three/` and inlined into the page.
  The page's Content-Security-Policy now allows `blob:` images and fetches,
  which GLTFLoader uses for the textures of an asset model.
- Every font is Arial, in weights 400 and 700.

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
