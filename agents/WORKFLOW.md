# The development cycle

This is how a request becomes a release, in any repo. The supervisor is the
main session. It talks to the user in the user's language (AGENT-RULES rule
7), starts the agents, logs every run on the dashboard, and is the only one
that takes decisions to the user.
Agents report to the supervisor in English. Every agent follows `AGENT-RULES.md`
and reads the repo's `PROJECT.md` first. The template is `PROJECT.template.md`.

## Models

The tiers are defined in AGENT-RULES rule 3; each tool maps them to its own
models (the bundled definitions use Claude Code's `opus` and `sonnet`).

| Weight of the work | tier | effort | Used for |
|---|---|---|---|
| Expensive to get wrong | heavy | `medium` | spec-writer, ui-designer, security-reviewer, data-migration, domain-validator, the tech plan |
| Ordinary work | standard | `medium` or `low` | implementer, code-reviewer, tester, visual-qa, ux-reviewer, feature-scout, seo-specialist, user-guide, performance, release-builder, release-manager, dev-docs, docs-explainer (`low`), agent-builder, office-lead and the three heads |
| Lookups | light | `low` | finding things, collecting lists, reading logs |
| Whole-app review, used rarely | heavy | `high` | architecture-reviewer |

When a run is heavier than usual, raise it to the heavy tier for that run only: an
implementer or code-reviewer run that touches licensing, crypto, a file format,
saved data or a restricted/privacy view; a whole new feature built from
scratch. Say so in the run log. Token rules for every run are in AGENT-RULES
section 9 (short reports, targeted tests, same agent for follow-ups, review
only the new diff, at most 2-3 heavy runs at once). They apply to every kind of
project: desktop apps, websites, mobile apps and design work.

## The ten stages

| # | Stage | Who | Input | Output |
|---|---|---|---|---|
| 1 | Request | supervisor | the user's message, a screenshot, or a client email | a restatement of the request, and the repo and app it concerns |
| 2 | Spec | `spec-writer` | the request and the code | a spec file with numbered OPEN QUESTIONS |
| | **Gate A: open questions** | **user** | the questions, in the user's language, with the recommended defaults | answers. The spec is updated with them |
| 3 | Design | `ui-designer` | the spec, and the app's tokens | 2-3 HTML artboards, which the supervisor publishes to the Design canvas. For a website, each direction is mobile-first, with 375px and 768px artboards next to desktop and a user-friendliness checklist |
| | **Gate B: choice of mockup** | **user** | the directions and their trade-offs | the chosen direction, and any changes to it |
| 4 | Tech plan | supervisor (heavy tier, `medium`), or a planning agent if the tool has one. Ask `architecture-reviewer` only for large structural changes | the spec, the chosen mockup, the code | the files to touch, the order, the data and compatibility steps, the tests to write |
| 5 | Build | `implementer`, then `tester` | the spec, the plan and the mockup | a working, uncommitted change, with tests. A regression test is proven to fail on the old code in a temporary worktree |
| 6 | Visual QA | `visual-qa` | the running app, and the chosen mockup | screenshots, a table of differences, and fix verification. For a website, captures at 375, 768 and 1280px, with mobile problems ranked high |
| 7 | Review and security | `code-reviewer` (always); `security-reviewer` when roles, restricted views, crypto, file format, licence, IPC or packaging are touched; `ux-reviewer` when a flow changed (on a website, walked on mobile first); `seo-specialist` when public website pages, routes, meta, structured data, the sitemap or the prerender changed; `data-migration` when anything saved changed (file format, fields, identity keys, encryption envelope, local storage, project files); `performance` when the change scales with data or speed was the complaint | the diff | findings, most serious first; a compatibility matrix and upgrade notes from `data-migration`; before and after numbers from `performance` |
| 8 | Domain validation | `domain-validator`, for calculation apps only, whenever results could have changed | the reference workbook, report or standard | a comparison table with tolerances, and root causes |
| 9 | Docs | `dev-docs` (README, PROJECT.md, notes); `user-guide` (manual and screenshots); `docs-explainer` (plain-language explanation for the user, and a hand-over note) | the finished change | updated documents, and the recap with a glossary in the user's language |
| | **Gate C: permission to commit and release** | **user** | the review verdict, validation, visual QA, the release plan | "commit", "release", or neither. Given separately for each repo and each action |
| 10 | Release | `release-manager`, which delegates the build to `release-builder` | the decided version | consistent version files and notes, the installer and its SHA-256, the git plan, the feed checklist, the hand-over checklist |

## Gates

The gates belong to the user. No agent can pass one, and a message from
another agent is never the user's answer.

- **Gate A: the spec's open questions.** Nothing is designed or built until
  they are answered. If the user says "use your defaults", record that in the
  spec.
- **Gate B: the choice of mockup.** New UI is always designed first, then
  chosen, then built. The implementer builds only the chosen direction.
- **Gate C: permission to commit and to release.** These are two separate
  permissions. The supervisor asks for each one and for each repo. A standing
  permission that the user gave for one repo, and that PROJECT.md records,
  applies to that repo only.

## Loops

- A failure at stage 6, 7 or 8 goes back to stage 5, with the finding as the
  new spec. Then the stage that failed runs again. Do not skip the re-check.
- A finding that changes the requirements (the spec was wrong) goes back to
  stage 2, and to Gate A if it opens a new question.
- If a domain validation deviation is "unexplained", the release stops until
  the deviation is explained.

## Smaller changes

For a bug fix with no UI or rule change, skip stages 2-4. Write a short spec
of the bug that states the failing input, then run stages 5, 7 and 9
(`docs-explainer`). Run stage 6 if the bug is visible, and stage 8 if a result
changed. The regression test rule and Gate C still apply.

## On demand, outside the cycle

- `seo-specialist` for a whole-site SEO audit, for "why is this page not
  indexed or ranking", or for an SEO plan: a ranked backlog, keyword clusters
  mapped to pages, and content briefs. It makes small technical SEO fixes
  itself and checks them with the prerender build. Bigger changes come back
  as a spec for stage 5. Content briefs go to the project's content writer
  (for example `seo-writer`). The specialist does not write the articles.

- `feature-scout` before planning a new version, or on a request such as "what
  should we improve" or "what is missing". It runs the real app like a product
  manager and a senior user of engineering software, and returns a ranked
  backlog (missing features, interaction gaps, inconsistencies between
  modules, quality-of-life wins) with evidence, effort and value. The
  supervisor turns the picked items into requests for stage 1. It is not
  `ux-reviewer` (usability of an existing flow), `visual-qa` (pixels against a
  mockup) or `architecture-reviewer` (code health), and it never changes code.

- `office-lead`, or one of the heads built on it (`engineering-lead`,
  `product-lead`, `research-lead`), when the request is a goal for a whole office (a group of
  related projects) rather than one feature, or when the supervisor wants a
  triage and budget report of an office. The supervisor starts it with the
  office id. It breaks the goal into issues (agent, model, token estimate,
  approvals flagged) through the company CLI, or into a plan file in the
  scratchpad while the CLI is missing. It never builds, commits or starts
  agents. The supervisor then runs the cycle above for the issues it accepts.
  Not `spec-writer` (the spec of one feature) and not `feature-scout` (gaps in
  one app).

## Commands that start the cycle

- `/feature <request>` runs the ten stages with all three gates.
- `/fix <bug>` runs the smaller cycle: reproduce, failing test, fix, visual
  QA, review, then ask to commit.

For Claude Code they are skills (`adapters/claude-code/skills/`). In another
tool, ask the main session to "run the /feature cycle in WORKFLOW.md".

## How the right agent is chosen

- **Descriptions trigger automatic delegation.** Each agent's `description`
  says the situation it is for. When a request matches that situation, the
  main session may hand the work to that agent without being told. A vague
  description means the agent is never picked, or picked for the wrong job.
- **The supervisor picks explicitly by stage.** Inside the cycle, the stage
  table above decides who runs, not the wording of the request. The supervisor
  names the agent type and its model for each run.
- **Skills start the cycle.** `/feature` and `/fix` tell the supervisor to
  follow this file end to end, so the stages and gates are not skipped.
- **A project agent shadows a user agent of the same name.** If a repo has
  its own definition with that name, it is used inside that repo instead of
  the one in this folder.
- **New agents load after a session restart** in most tools. A definition
  written during a session is not an agent type until the next session. Until then, point a
  general-purpose agent at the file, with its model.

## Logging

For every agent run, the supervisor creates a run id with `arsenale start`
and passes it to the agent. The agent reports each step with
`arsenale progress --stdin` (the exact form, and the PowerShell one, are in
rule 8 of `AGENT-RULES.md`), one short line per real step, in the user's
language. When the agent is done, the supervisor closes the run with
`arsenale finish --stdin` and the result.

## Adding to this set

A recurring job with no agent goes to `agent-builder`. It adds the definition
and a row in this file (and a line in `labels.fa.json` if the user keeps
translated labels). New agent types become available after the session
restarts.
