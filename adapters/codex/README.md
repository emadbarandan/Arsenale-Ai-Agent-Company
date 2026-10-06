# Arsenale with OpenAI Codex CLI

Codex reads standing instructions from `AGENTS.md` files: a global one in its
home folder (`~/.codex/AGENTS.md`, or `$CODEX_HOME/AGENTS.md`) and one per
repository. Check the Codex documentation for your version if the location has
moved.

## Set up

1. Install Arsenale (README, "Quick start"). When the installer asks about
   Codex, say yes: it adds the block from `adapters/instructions.md` to
   `~/.codex/AGENTS.md` between `<!-- arsenale:begin -->` and
   `<!-- arsenale:end -->`, after backing the file up. Or paste the block
   yourself, replacing `{{ARSENALE}}` with the launcher path the installer
   printed.
2. Run `arsenale serve` and keep the page open.

Codex then logs a run when it starts a piece of work, a progress line per step,
and the result. Token counts come from the `usage` block of the finish record
when Codex reports them; there is no transcript reading for Codex.

## The agent team

Codex has no file format for named sub-agents like Claude Code's. The files in
`agents/` still work as role briefs: ask Codex to "act as the tester described
in `<arsenale>/agents/tester.md`, following `AGENT-RULES.md`", and log that run
with `"agent":"tester"`.

## Model tiers

Map the tiers of `agents/AGENT-RULES.md` rule 3 to the models your Codex
account offers (heavy, standard, light), and log the model you actually used.
