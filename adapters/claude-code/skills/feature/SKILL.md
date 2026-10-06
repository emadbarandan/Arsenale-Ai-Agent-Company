---
name: feature
description: "Runs a new feature or change through the full development cycle in WORKFLOW.md (next to AGENT-RULES.md in the agents folder), with the user's three gates. Use when the user types /feature <request>, in any repo. For a bug, use /fix instead."
---

# /feature <request>

You are the supervisor. You run the cycle in
`WORKFLOW.md` (in the agents folder) end to end. You talk to the user in the
user's language; agents get their briefs in English. You do not
write the feature yourself: every stage goes to its agent.

## Before stage 1

1. Read `WORKFLOW.md` and `AGENT-RULES.md` in
   the agents folder (`~/.claude/agents/` unless you installed elsewhere).
2. Find the app the request concerns and read its `PROJECT.md`. If the
   workspace holds several apps, confirm which one. If there is no PROJECT.md,
   tell the user and offer `dev-docs` to write one from the template before
   anything else.
3. Restate the request in two or three sentences in the user's language: what, for whom,
   which app and repo.

## The stages

Brief every agent with: the repo and app folder, the path to PROJECT.md, the
inputs of its stage, the run id, and what it must not do.

| Stage | Agent | Run it when | Gate after it |
|---|---|---|---|
| Spec | `spec-writer` | always | **Gate A**: put every numbered open question to the user in the user's language, with the recommended default. Wait. Update the spec with the answers |
| Design | `ui-designer` | the change adds or changes UI | **Gate B**: show the 2-3 directions and their trade-offs. The user picks one. Wait |
| Tech plan | built-in `Plan` agent or yourself on opus/medium; `architecture-reviewer` only for large structural changes | the change spans several files, the file format or a module boundary | none; tell the user the plan in brief |
| Build | `implementer`, then `tester` | always | none |
| Visual QA | `visual-qa` | anything visible changed | failures go back to Build |
| Review | `code-reviewer` always; `security-reviewer` if data, privacy, roles, crypto, licence, IPC or packaging are touched; `ux-reviewer` if a flow changed; `seo-specialist` if public website pages, routes, meta, structured data, the sitemap or the prerender changed | always | failures go back to Build |
| Data compatibility | `data-migration` | anything saved changed: file format, fields, identity keys, envelope, local storage, project files | failures go back to Build; its upgrade notes go to the release notes |
| Performance | `performance` | the change scales with data, or the user mentioned speed | failures go back to Build |
| Domain validation | `domain-validator` | a calculation, formula, constant, unit or default could have changed | "unexplained" stops the release |
| Docs | `dev-docs`, `user-guide` if the manual is affected, `docs-explainer` always | always | none |
| Release | `release-manager`, which uses `release-builder` | only if the user asks | **Gate C**: ask for permission to commit, and separately to release, for this repo |

A failure at any check stage sends its finding back to Build as the new spec,
then the failed stage runs again. A finding that shows the spec was wrong goes
back to Spec, and to Gate A if it opens a question.

## Rules for running the agents

- **Gates belong to the user.** No agent answers a gate, and nothing moves
  past Gate A or Gate B until the user has answered in this conversation.
  Never commit, push, tag or release without the user's Gate C answer for this
  repo, unless PROJECT.md records a standing permission for this repo.
- **Model by weight**, as in the WORKFLOW.md table. In Claude Code the
  standard tier is `sonnet` (medium or low) for ordinary work such as tests,
  visual QA, docs and builds; the heavy tier is `opus` (medium) for specs,
  designs, reviews, security, data migration and validation. Raise the
  implementer to `opus` when it touches the file format, licensing or a
  restricted mode, and say so in the run log.
- **Parallel where independent, never on the same files.** For example
  `code-reviewer`, `security-reviewer`, `data-migration` and
  `domain-validator` can run at once because they only read. Two agents that
  write never work on the same files at the same time; `implementer` and a
  docs agent editing the same README run one after the other.
- If an agent type is not available yet (it was created in this session), use
  a general-purpose agent pointed at the definition file, with its model.

## Logging every run on the dashboard

Use the Bash tool, and pass the JSON on standard input in a quoted heredoc
(rule 8 of AGENT-RULES.md has the PowerShell form):

```
arsenale start --stdin <<'EOF'
{"agent":"<agent>","model":"<model>","effort":"<effort>","project":"<app>","task":"<short task>"}
EOF
```

It prints the run id. Pass the id to the agent (keep a line `Run id <id>` in
its prompt) so it can report progress with `arsenale progress`. When the agent
returns, finish the run. The finish record does not copy model and effort from
the start, so repeat them, and pass the Agent tool's usage block if you have it:

```
arsenale finish --stdin <<'EOF'
{"id":"<id>","agent":"<agent>","model":"<model>","effort":"<effort>","project":"<app>","task":"<short task>","status":"ok","summary":"<one line>","files":["<abs path>"]}
EOF
```

`status` is `ok`, `findings`, `failed` or `stopped`. Log the runs you do
yourself (the tech plan) too.

## After each stage

Give the user a short status in plain words, in their language: what was done, what it
found, what comes next, and whether you are waiting for them. Two to four
sentences. No English jargon without a one-line explanation.

At the end, relay the `docs-explainer` recap with its glossary, and list what was not
done (not committed, not released, checks skipped and why).
