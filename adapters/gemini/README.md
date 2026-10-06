# Arsenale with Gemini CLI

Gemini CLI reads context files named `GEMINI.md`: a global one in
`~/.gemini/GEMINI.md` and one per project. Check the Gemini CLI documentation
for your version if the location has moved.

## Set up

1. Install Arsenale (README, "Quick start"). When the installer asks about
   Gemini CLI, say yes: it adds the block from `adapters/instructions.md` to
   `~/.gemini/GEMINI.md` between `<!-- arsenale:begin -->` and
   `<!-- arsenale:end -->`, after backing the file up. Or paste the block
   yourself, replacing `{{ARSENALE}}` with the launcher path the installer
   printed.
2. Run `arsenale serve` and keep the page open.

Token counts come from the `usage` block of the finish record when Gemini CLI
reports them; there is no transcript reading for Gemini CLI.

## The agent team

Use the files in `agents/` as role briefs: "act as the code-reviewer described
in `<arsenale>/agents/code-reviewer.md`", and log that run with
`"agent":"code-reviewer"`.
