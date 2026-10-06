# Arsenale with Claude Code

Claude Code is the tool Arsenale was first built around, so it gets the most:
the bundled agent team, two cycle commands, token counts from transcripts, and
an optional pair of hooks.

## What the installer does here (each step asks first)

| Step | What changes | Undo |
|---|---|---|
| Agent team | copies `agents/*.md` into `~/.claude/agents/`, file by file, next to your own agents. A file with the same name and different content is overwritten only if you say yes, and it is backed up first to `~/.arsenale/backups/<time>/` | delete the files listed in `~/.arsenale/installed.txt`; restore from the backup |
| Skills | copies `skills/feature` and `skills/fix` into `~/.claude/skills/` the same way | the same |
| Instructions | adds the block from `adapters/instructions.md` to `~/.claude/CLAUDE.md`, between `<!-- arsenale:begin -->` and `<!-- arsenale:end -->`, after backing the file up | `install.ps1 -Uninstall` / `install.sh --uninstall` removes exactly that block |
| Dashboard settings | writes `~/.arsenale/config.json` so the dashboard reads `~/.claude/agents` and `~/.claude/projects` (transcripts) | edit or delete the file |

`CLAUDE_CONFIG_DIR` is honoured: when it is set, its folder is used instead of
`~/.claude`.

Nothing is moved, and no settings file of Claude Code is edited by the
installer. The hooks below are a manual, opt-in step.

## Model tiers

The bundled definitions use Claude Code's aliases: heavy tier `opus`, standard
tier `sonnet`, light tier `haiku` (rule 3 of `agents/AGENT-RULES.md`). Change
the `model:` line of an agent to pin a version.

## Token counts from transcripts

Claude Code keeps each sub-agent's conversation as
`~/.claude/projects/<project>/<session>/subagents/agent-<id>.jsonl`. With
`~/.claude/projects` listed in `transcriptRoots` (the installer does this), the
dashboard finds the transcript of a run by the `Run id <id>` line in the
sub-agent's prompt, and counts its tool calls, the files it touched (names only;
secret-looking paths are counted, never shown) and its tokens. It reads
nothing outside the configured roots. This depends on Claude Code's file
layout, which may change; when no transcript is found the run simply shows
"not recorded", and the `usage` block of the finish record is used instead.

## Optional: hooks instead of instructions (experimental)

`hooks/arsenale-hook.cjs` logs every sub-agent automatically: PreToolUse starts
a run, PostToolUse finishes it. To use it, merge the `hooks` block of
`hooks/settings.example.json` into `~/.claude/settings.json` with the path of
your clone filled in. Then remove the Arsenale block from `CLAUDE.md` (or keep
only its gates and answers parts), or every sub-agent is logged twice.

Limits: it cannot see progress lines (only the agent can write those), it reads
hook fields whose names may change between Claude Code versions, and it never
blocks a tool call: on any problem it logs less, or nothing.
