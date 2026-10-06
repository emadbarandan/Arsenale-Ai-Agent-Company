# House rules for every agent

Every agent in this folder follows these rules in every repository. Read this
file before you create another agent. The cycle the agents work in, and who does
which stage, is in `WORKFLOW.md` next to this file.

These are user-level rules: they live in the user's agent folder (for Claude
Code, `~/.claude/agents/`; other tools: see `adapters/` in the Arsenale repo).
A repository may also have its own agent folder. When both exist, follow both,
and where they disagree follow the stricter one. A project agent with the same
name as a user agent replaces the user agent inside that repo.

"The supervisor" below is the main session the user talks to: the one that
starts agents, logs their runs and takes questions to the user.

## 0. Read PROJECT.md in the repo root first

`PROJECT.md` holds the facts every agent needs about a project: the stack, the
install, run, test and build commands, the dev port, where the installer goes,
which files carry the version, which paths you must not touch, the git policy,
the domain notes and where the docs live. The template is `PROJECT.template.md`
in this folder.

- Read it before anything else. When it and your own instructions disagree,
  PROJECT.md wins on project facts and these rules win on safety.
- A repo may hold several apps, each with its own git repo and its own
  PROJECT.md. Use the PROJECT.md of the app you were pointed at, and run git
  inside that app's folder.
- If there is no PROJECT.md, say so at the top of your report. Work out only
  the facts you need from `package.json` and the README, and list them as
  "read from package.json, not from PROJECT.md". Do not guess a command, a
  port or a forbidden path. Do not write the PROJECT.md yourself unless the
  supervisor asks you to.

## 1. Git: never rewind the tree, never commit unless told

**Never rewind the working tree.** Do not use `git checkout -- …`,
`git checkout <branch>`, `git switch`, `git restore`, `git stash`, `git reset`,
`git clean`, and do not copy files back over the tree. Someone else may be
editing the same folder while you work, and these commands silently throw
their changes away.

**Never commit unless the supervisor says so for this run.** When you are told
to commit, commit only if PROJECT.md's git policy allows it, and only on the
branch it names. Never push, merge, tag, rebase, create or edit a remote, or
change git config unless the supervisor tells you to do that specific thing.
Work that looks finished with a clean diff is still not a reason to commit. You
report, and the supervisor asks the user.

**A regression test must fail on the old code first.** Prove it in a temporary
worktree, never in the real tree:

```
git worktree add "<scratchpad>/old-<topic>" HEAD
# copy in only the new test file(s), install if needed, run the test, see it fail
git worktree remove --force "<scratchpad>/old-<topic>"
```

Do not copy secrets, licence files, `.env` files or user documents into the
worktree. The worktree only has tracked files, and that is intended. If the old
code cannot run without a secret, use a key or licence the test generates for
itself. If that is not possible, stop and say so. Report the failing line from
the old code and the passing line from the new code.

## 2. Nothing secret leaves this machine

Repositories can hold licence keys, signing keys and personal records. Never
open, copy, print, quote or summarise:
- anything under `secrets/`
- `*.pem`, `*.key`, `*.lic`, `*.pfx`, `*.p12`, `.env*`, `id_*` key files
- the project's own document or licence files that PROJECT.md lists as
  forbidden (for example `*.myappdoc`)
- the licence folder PROJECT.md names

You may name such a file and say it exists. You may not read it to find out what
is in it. Never put a key, a licence, a PIN or a passcode into code, a test, a
log line, a screenshot or a report. If a task seems to need one of these, stop
and say why.

**Use invented test data only.** Every person, company, device, project, email
address and number in a fixture, a screenshot or a demo file is made up. Never
copy a real record into a test, even a shortened one. Engineering reference
inputs from a workbook or a standard are allowed in a scratchpad harness. They
may go into the repo only if the supervisor confirms that the client allows
it.

## 3. Choose the model by the weight of the task

Three tiers. Each coding tool names its own models; the user maps the tiers to
them once (the Arsenale adapter for your tool shows an example).

| Task | tier | effort |
|---|---|---|
| Expensive to get wrong: specs, designs, security, data and file-format compatibility, calculation results, whole-app review, and any change to licensing, crypto, a file format or a restricted/privacy view | heavy | `medium` |
| Ordinary work: building and fixing features, code review of an ordinary diff, tests, visual checks, UX walk-throughs, SEO audits, documentation and guides, installers, release bookkeeping | standard | `medium` or `low` |
| Trivial lookups: finding where something is defined, collecting a list, reading a log | light | `low` |

The model in each agent's definition is its default. The supervisor raises it
to the heavy tier for a single run when that run touches one of the expensive
areas above (for example a code review of a crypto or file-format diff, or an
implementer change to the licence core), and says so in the run log. A more
expensive model is not a safer default. `architecture-reviewer` runs at `high`
on purpose, because it reads a whole app, and it is used rarely.

## 4. Take the smallest set of tools that does the job

An agent that reviews needs no `Write`. An agent that writes documents needs no
`Bash`. Fewer tools means fewer ways to do damage by accident. An agent that
needs `Write` only for helper scripts writes them to the scratchpad and nowhere
else.

## 5. Processes: only your own

Never kill every `electron.exe`, `node.exe` or browser process. Other sessions
and the user's own copies of the app are running. For example, do not use
`taskkill /IM node.exe`, `Stop-Process -Name electron` or `pkill node`.

Record the PID of every process you start: the dev server, the app, headless
Chrome. When you finish, stop only those, with their child processes
(`taskkill /PID <pid> /T /F` on Windows, `kill <pid>` elsewhere). Do not leave
a dev server or a browser running. If a port is already in use, find out which
process holds it and report it. Do not kill it.

## 6. Look at what you produce

When you take a screenshot, render a page or build a PDF, open the image and
look at it before you describe it. A screenshot you did not look at proves
nothing. It may be blank, stale, taken at the wrong scale, or show an error
dialog. If you could not look, write "not checked visually". Never write
"looks fine".

## 7. Say what happened, plainly

Report what you did, the exact command you ran and its real output, and what
you did NOT do. A test you did not run is "not run", never "should pass". If you
are unsure, say you are unsure.

**Report every decision the spec left open.** For each one, say what you chose
and why, so the supervisor can take it to the user. Do not bury it in the
change.

Reports go to the supervisor in English. **The user's language** is whatever
the user writes in, unless they or PROJECT.md set one; the supervisor talks to
the user and writes everything user-facing (gate questions, recaps, progress
lines) in it.

## 8. Say what you are doing while you do it

If the supervisor gave you a run id, report each step as you reach it with the
Arsenale run log. Pass the JSON on standard input, inside a quoted heredoc, so
no quote, `$` or backtick in your text can break the command:

```
arsenale progress --stdin <<'EOF'
{"id":"<run id>","doing":"reading src/app.ts"}
EOF
```

In Windows PowerShell, write the JSON to a file and pass the file (PowerShell
5.1 strips double quotes from arguments to programs, and pipes non-ASCII text
to them as `?`):

```
Set-Content -Encoding UTF8 -Path "$env:TEMP\arsenale-step.json" -Value '{"id":"<run id>","doing":"reading src/app.ts"}'
arsenale progress --file "$env:TEMP\arsenale-step.json"
```

If `arsenale` is not on the PATH, use the full path the installer printed.
Never paste text that came from a task, a file or an issue into inline JSON.

When you register an agent you start yourself (see "Calling another agent"
below), pass your own run id as `"parent"` on `arsenale start`. The dashboard
then draws the hand-over from your desk to theirs. A task that ends in
`(under <your run id>)` is read the same way.

Log a decision the spec left open (rule 7) as you take it, so it shows on the
dashboard's decision timeline next to your run: `arsenale decision --stdin`
with
`{"by":"agent","agent":"<your name>","run":"<run id>","project":"…","text":"<what you chose>","reason":"<why>"}`.
Add `"state":"open"` for a question you leave to the supervisor. Gates
(`arsenale gate`) belong to the supervisor, because only the supervisor asks
the user. The supervisor also runs `arsenale answers` before it asks again (it
prints the answers and dismissals the user gave on the dashboard since the last
run, and marks them read), and the dashboard itself never runs anything. When
the user answers in the chat, close that gate with `arsenale gate` and
`"status":"answered"` instead of leaving it waiting. Keep the `Run id <id>`
line of your prompt as it is; with Claude Code the dashboard finds your
transcript by it and counts your tools, files and tokens from it.

**When a company is set up** (`arsenale log --company-init`), the supervisor
also:
- runs `arsenale inbox` at the start of every turn, next to `arsenale answers`.
  It prints what the owner changed on the dashboard (budgets, the budget
  switch) since the last read, and marks it read.
- runs `arsenale budget-check` with `{"agent":"<name>","project":"<project>"}`
  before it starts an agent. On exit 2 (`stop`) it does not start the agent: it
  opens an approval gate asking the owner for a budget override and tells the
  user. With budgets switched off, only a paused employee or project stops it.
- may give `"projectId"`, `"officeId"` (to override the project's office),
  `"session"` and `"issue"` on `arsenale start`.

Budgets, the budget switch, pauses and the org chart (`--budget`, `--budgets`,
`--employee`) change only on the owner's word, with `"by":"board"`. Gates
settled in the chat are closed with `arsenale dismiss <gate id>` or
`arsenale log --dismiss-older-than 24h`.

**Before any action that leaves this computer** (sending a message, posting or
publishing, paying or buying, deleting or overwriting, sharing outside,
changing an account), call `check_action` through MCP or
`arsenale check-action` with `{"agent","category","summary","target"}`, and
follow its verdict: `allow` go ahead and log it; `ask` (exit 3) wait for the
owner's answer with `--answers` before acting; `never` (exit 2) do not do it
and say it is not allowed. Tasks the owner wrote on the dashboard arrive in
`arsenale inbox`; move them with `arsenale task` and comment with
`arsenale comment`.

Through MCP the same rules hold: call `hello` and `get_inbox` at the start of a
conversation, `start_job` / `log_step` / `finish_job` around distinct work,
`ask_you` and `get_answers` for questions. Use MCP or the CLI in one session,
not both: both log every job twice.

Write one short line in the user's language, in the present tense. For example:
"reading App.jsx", "running the tests", "the third test was broken on purpose
and the failure was seen". The lines build up into a log that the user watches
like a terminal while they wait.

Report every real step:
- each file you start reading or editing
- each command you run, and its result
- each finding, as you reach it
- anything that surprises you

Say what you are doing right now. Not a plan and not a summary. Do not report
the same thing twice, and do not narrate your thinking between steps. If
the run log is missing or fails, carry on with the task and mention it once in
your report.

## Calling another agent in the middle of a task

You may hand part of your task to an existing agent, within these limits:

1. **One level only.** An agent you start must not start agents of its own.
   Say so in the prompt you give it.
2. **Separate files.** Start one only for work that touches files nobody
   else is editing right now. Two agents never edit the same file at once.
3. **Same or lighter tier.** The agent you start uses the same model tier as
   you or a lighter one, never a heavier one.
4. **It shows on the dashboard.** Before it starts, register it with
   `arsenale start`, giving your own run id as `"parent"`. Close it when it
   finishes.
5. **No user decisions below the supervisor.** An agent you start cannot ask
   the user anything. It never decides an open question, picks a mockup,
   commits, pushes, tags or publishes. Those come back up to the supervisor.
6. **Report what you delegated** in your final report: which agent, for what,
   and the result.

## Creating another agent

Agents do not create agents on their own. If you think a specialist is
missing, **propose** it in your report: the name, what it would do, and why no
existing agent fits. The supervisor decides, and `agent-builder` writes it
only after the supervisor or the user approves. In most tools a definition
written in the middle of a task does not load until the session restarts, so
it would not help that task anyway.

When `agent-builder` has been asked to create one:

1. Decide where it goes. An agent that works in any repo goes in this folder.
   An agent that only makes sense in one project goes in that repo's own agent
   folder. Its name is lowercase with hyphens.
2. Frontmatter: `name`, `description`, `model`, `effort`, `tools`, `color`, and
   optionally `zone` (the dashboard desk: build, review, docs or design).
   The `description` says in which situation to use the agent, and that is what
   makes it get picked. Keep to the tiers in rule 3.
3. The body holds the agent's standing instructions:
   - what it does
   - what it must never do
   - how it does its job well
   - what its report must contain
   Project facts belong in PROJECT.md, not in the agent. Write down the traps,
   not the obvious.
4. Every new agent inherits these rules. Say so in its body:
   "Follow `AGENT-RULES.md` (in the same folder as this file) and the repo's
   `PROJECT.md`."
5. If the user keeps translated dashboard labels (`labels.fa.json`), add an
   entry for it there.
6. A definition written now may not be available as an agent type until the
   session restarts. Until then, use it by pointing a general-purpose agent at
   the file with the right model.
7. Tell the supervisor what you created and why, so it reaches the user and
   gets logged on the dashboard.

## 9. Spend tokens where they pay

These rules hold in every kind of project (desktop app, website, mobile app,
design work, documents). They keep the quality and the speed while cutting
waste.

1. **Short report, full detail in a file.** Your final report to the
   supervisor is at most about 250 words: the outcome, whether anything
   blocks, the decisions left open, and the paths of what you produced. Put
   long material (full findings, matrices, logs, per-item tables) in a report
   file in the scratchpad (for example `<scratchpad>/reports/<run id>.md`) and
   give its path. The supervisor opens it only when needed.
2. **Read only what you need.** Use the file map in PROJECT.md, search, and
   read line ranges of large files instead of whole files. Do not re-read a
   file you already read in this run unless it changed.
3. **Tests: targeted while working, the full suite once.** While building or
   fixing, run only the tests that cover your change. Run the full suite once,
   at the end. Reviewers do not re-run the full suite when the builder has
   reported it green; they spot-run what they doubt. If a full run fails only
   on time-outs while the machine is busy, re-run just those tests before
   calling it a failure.
4. **Screenshots: few and small.** Builders take the one or two shots that
   prove the change. Full visual comparison with the mockup is visual-qa's
   job, once, at the end. Prefer scaled screenshots and text checks (DOM,
   accessibility tree) where a picture adds nothing.
5. **Follow-ups go to the same agent.** When review findings come back on
   work an agent just built, the supervisor sends them to that same agent
   (it already knows the code) instead of starting a new one.
6. **Review only what changed.** A review after a fix round covers the new
   diff, not the whole feature again. Security and data-migration reviews run
   only when the diff touches their areas (see WORKFLOW stage 7).
7. **Few heavy runs at once.** At most two or three heavy-tier runs in
   parallel; standard and light runs may run alongside them. This avoids
   hitting a usage limit mid-task, which costs more than it saves.
