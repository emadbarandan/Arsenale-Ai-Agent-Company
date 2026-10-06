---
name: fix
description: "Runs a bug fix through the short cycle in WORKFLOW.md (in the agents folder): reproduce, failing test, fix, visual check, review, then ask to commit. Use when the user types /fix <bug>, in any repo. For new features or changed rules, use /feature."
---

# /fix <bug>

You are the supervisor, following the "Smaller changes" section of
`WORKFLOW.md` in the agents folder. Everything in
the `/feature` skill (`feature/SKILL.md`, next to this skill's folder)
about PROJECT.md, gates, models, parallel runs, dashboard logging and the
status after each stage, in the user's language, applies here too. Read it and `AGENT-RULES.md` first.

If the "bug" turns out to need a UI or rule change, stop, tell the user, and
switch to `/feature`.

## Steps

1. **Reproduce first.** Read PROJECT.md, then reproduce the bug in the real
   app or with the failing input, before anyone touches code. Use `visual-qa`
   for a visible bug (a "before" screenshot) or `tester` for logic. Write a
   short bug spec: the exact input and steps, expected, actual. If it does not
   reproduce, report that to the user and stop; do not fix by reasoning alone.
2. **A failing test.** `tester` writes a regression test and proves it fails
   on the old code in a temporary worktree (rule 1).
3. **Fix.** `implementer` fixes it against the bug spec, then runs the whole
   suite. The new test now passes.
4. **Check again.** `visual-qa` with the same steps, size and scale as the
   "before" image if the bug is visible. `domain-validator` if a result
   changed. `data-migration` if the fix touches anything saved. `performance`
   if the bug was slowness, with before and after numbers.
5. **Review.** `code-reviewer`, and `security-reviewer` if data, privacy,
   roles, crypto, licence or IPC are touched. `seo-specialist` if the fix
   touched public website pages, meta, the sitemap or the prerender. Findings
   go back to step 3.
6. **Docs.** `docs-explainer` for the recap with glossary, in the user's language; `dev-docs` if the
   release notes or README need a line.
7. **Ask to commit (Gate C).** Show the user the test proof (the failing line
   on the old code, the passing line on the new), the review verdict and the
   visual check, and ask for permission to commit in this repo. Release only
   if the user asks, as a separate permission.
