## Arsenale: log agent work so the user can watch it

The user watches your work on the Arsenale dashboard (`arsenale serve`). It
only shows what you log. Arsenale never starts or controls agents; logging is
how the work becomes visible. Command: `arsenale` (full path, if it is not on
the PATH: `{{ARSENALE}}`).

Always pass JSON on standard input inside a quoted heredoc, never as an inline
argument when the text came from a task, a file or the user:

```
arsenale start --stdin <<'EOF'
{"agent":"tester","model":"<model>","project":"<repo or app name>","task":"<one line>"}
EOF
```

(Windows PowerShell: write the JSON to a file with
`Set-Content -Encoding UTF8` and run `arsenale start --file <that file>`.)

1. **Before you hand work to a sub-agent** (or start a distinct piece of work
   yourself): `arsenale start --stdin` with `agent`, `model`, `project`,
   `task`. It prints a run id. Put the line `Run id <id>` in the sub-agent's
   prompt.
2. **While working**, the agent with the run id logs one short line per real
   step: `arsenale progress --stdin` with `{"id":"<id>","doing":"<step>"}`.
3. **When it is done**: `arsenale finish --stdin` with `id`, `agent`, `task`,
   `status` (`ok`, `findings`, `failed` or `stopped`), a one-line `summary`,
   and, if your tool reports it, `"usage":{"tokens":…,"toolUses":…,"durationMs":…}`.
4. **Questions for the user** (approvals, choices): `arsenale gate --stdin`
   with `project`, `question`, `kind` (`A` open question, `B` design choice,
   `C` commit or release, `approval`) and optional `choices`. At the start of
   every turn run `arsenale answers`: it prints what the user answered on the
   dashboard. Close a gate the user answered in the chat with
   `{"id":"<gate id>","status":"answered","answer":"…","by":"user"}`.
5. **Decisions** you take that the user did not specify:
   `arsenale decision --stdin` with `by` (`agent` or `supervisor`), `text` and
   `reason`.
6. **If a company is set up**: run `arsenale inbox` at the start of every turn,
   and `arsenale budget-check --stdin` with `{"agent":"…","project":"…"}`
   before starting an agent. Exit code 2 means stop: ask the user first. The
   inbox also holds the tasks the user wrote on the dashboard: move them with
   `arsenale task --stdin` (`{"id":"<task>","status":"in_progress"}`, or
   `in_review` when the user must check it) and comment with
   `arsenale comment --stdin` (`{"task":"<task>","text":"…"}`).
7. **Before any action that leaves this computer** (sending a message,
   posting, paying, deleting, sharing, changing an account):
   `arsenale check-action --stdin` with `agent`, `category` (`message.send`,
   `post.public`, `payment`, `delete`, `share.external`, `account.change`,
   `other.external`), `summary` and `target`. Exit 0: go ahead. Exit 3: an
   approval is waiting; act only after `arsenale answers` says approve.
   Exit 2: do not do it, and tell the user.

If your tool speaks MCP, connect it instead (Settings → Connect your assistant
on the dashboard, or `arsenale mcp`): the same steps become tools, and you do
not need this block. Do not use both, or every job is logged twice.

Logging must never block the work: if a command fails, carry on and mention it
once. `arsenale --help` and `arsenale log --help` list everything.
