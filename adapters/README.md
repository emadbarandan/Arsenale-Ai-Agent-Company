# Adapters: Arsenale with your coding tool

The core of Arsenale knows nothing about any one tool: a command that writes
JSON files (`arsenale log …`) and a local page that reads them. An adapter is
just the text and settings that make a given tool call that command.

| Tool | Where the instructions go | Agent team | Token counts | Installer |
|---|---|---|---|---|
| [Claude Code](claude-code/) | `~/.claude/CLAUDE.md` | native sub-agents (`agents/*.md`), `/feature` and `/fix` skills | from transcripts, or the usage block | asks, then installs |
| [OpenAI Codex CLI](codex/) | `~/.codex/AGENTS.md` | role briefs | usage block, if reported | asks, then installs |
| [Gemini CLI](gemini/) | `~/.gemini/GEMINI.md` | role briefs | usage block, if reported | asks, then installs |
| [Cursor](cursor/) | `.cursor/rules/arsenale.mdc` per repo | role briefs | usage block, if reported | copy step |
| [Aider](aider/) | your shell, around the session | role briefs | usage block, if reported | none needed |
| [Anything else](generic/) | shell functions, or the JSON files | role briefs | usage block | none needed |

`instructions.md` is the one block of instructions every adapter uses. The
installer copies it between `<!-- arsenale:begin -->` and
`<!-- arsenale:end -->` markers, so it can be updated or removed later without
touching the rest of your file.
