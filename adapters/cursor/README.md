# Arsenale with Cursor

Cursor keeps project rules in `.cursor/rules/*.mdc` inside each repository
(user-wide rules are typed in Cursor's settings). The installer cannot know
your projects, so this one is a copy step.

## Set up

1. Install Arsenale (README, "Quick start") and note the launcher path it
   prints.
2. In each repository where you want Cursor's agent logged, copy
   `adapters/cursor/arsenale.mdc` to `.cursor/rules/arsenale.mdc` and replace
   `{{ARSENALE}}` with the launcher path. Or paste the text of
   `adapters/instructions.md` into Cursor's user rules.
3. Run `arsenale serve` and keep the page open.

The agent runs commands in Cursor's terminal; it needs the terminal tool
allowed for `arsenale`. Token counts come only from what the agent reports in
the finish record.
