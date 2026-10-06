#!/usr/bin/env bash
# Installs Arsenale for this user on macOS, Linux or Git Bash: the `arsenale`
# command, its data folder, and (only after asking) the instructions and agents
# for your coding tools. Same steps as install.ps1; see its header for detail.
#
#   ./install.sh                  install, asking before each change outside the data folder
#   ./install.sh --dry-run        print what would happen, change nothing
#   ./install.sh --yes            answer yes to every question
#   ./install.sh --uninstall [--purge]
#
# Options: --data-dir DIR (default $ARSENALE_HOME or ~/.arsenale), --tools
# claude-code,codex,gemini (default: those whose folder exists), --claude-dir,
# --codex-dir, --gemini-dir, --no-path.
#
# Nothing is moved and nothing of yours is deleted: files are added next to
# yours, a file is overwritten only when you agree (backed up first to
# <data>/backups/<time>/), and every file written is listed in
# <data>/installed.txt so --uninstall can remove it or put the original back.
# No tool settings file (such as Claude Code's settings.json) is ever edited.

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA="${ARSENALE_HOME:-$HOME/.arsenale}"
CLAUDE="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
CODEX="${CODEX_HOME:-$HOME/.codex}"
GEMINI="$HOME/.gemini"
TOOLS=""
YES=0 DRY=0 UNINSTALL=0 PURGE=0 NOPATH=0

while [ $# -gt 0 ]; do
  case "$1" in
    --data-dir) DATA="$2"; shift 2 ;;
    --tools) TOOLS="$2"; shift 2 ;;
    --claude-dir) CLAUDE="$2"; shift 2 ;;
    --codex-dir) CODEX="$2"; shift 2 ;;
    --gemini-dir) GEMINI="$2"; shift 2 ;;
    --yes|-y) YES=1; shift ;;
    --dry-run) DRY=1; shift ;;
    --uninstall) UNINSTALL=1; shift ;;
    --purge) PURGE=1; shift ;;
    --no-path) NOPATH=1; shift ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "unknown option: $1 (see --help)" >&2; exit 1 ;;
  esac
done

BIN="$DATA/bin"
MANIFEST="$DATA/installed.txt"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUPS="$DATA/backups/$STAMP"
BEGIN='<!-- arsenale:begin -->'
END='<!-- arsenale:end -->'

act() { if [ "$DRY" -eq 1 ]; then echo "  [dry-run] $*"; else echo "  $*"; fi; }
ask() {
  if [ "$YES" -eq 1 ]; then echo "$1 [y/N] y (--yes)"; return 0; fi
  if [ "$DRY" -eq 1 ]; then echo "$1 [y/N] (dry-run: showing the yes path)"; return 0; fi
  local a=""
  if ! { printf '%s [y/N] ' "$1"; read -r a </dev/tty; } 2>/dev/null; then echo; echo "  no terminal to ask on: skipped (use --yes to accept)"; return 1; fi
  case "$a" in y|Y|yes|YES) return 0 ;; *) return 1 ;; esac
}
hash_of() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1
  elif command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | cut -d' ' -f1
  else cksum "$1" | cut -d' ' -f1-2 | tr ' ' '-'; fi
}
backup() { # prints the backup path
  [ "$DRY" -eq 1 ] && return 0
  [ -e "$1" ] || return 0
  local rel="${1#/}"; rel="${rel#?:/}"
  local dest="$BACKUPS/$rel"
  mkdir -p "$(dirname "$dest")"
  cp -p "$1" "$dest"
  echo "  backed up $1 -> $dest" >&2
  printf '%s' "$dest"
}
note() { [ "$DRY" -eq 1 ] || printf '%s\t%s\t%s\n' "$(hash_of "$1")" "$1" "${2:-}" >> "$MANIFEST"; }

# copy_side_by_side <src root> <dst root> <what> <file>...
copy_side_by_side() {
  local src="$1" dst="$2" what="$3"; shift 3
  local added=0 f rel d differ=()
  for f in "$@"; do
    rel="${f#$src/}"; d="$dst/$rel"
    if [ ! -e "$d" ]; then
      act "add      $d"; added=1
      if [ "$DRY" -eq 0 ]; then mkdir -p "$(dirname "$d")"; cp "$f" "$d"; note "$d"; fi
    elif ! cmp -s "$f" "$d"; then differ+=("$f"); fi
  done
  if [ "${#differ[@]}" -gt 0 ]; then
    echo "  ${#differ[@]} $what already exist with different content:"
    for f in "${differ[@]}"; do echo "    $dst/${f#$src/}"; done
    if ask "  Overwrite them with Arsenale's version (each is backed up first)?"; then
      for f in "${differ[@]}"; do
        d="$dst/${f#$src/}"; local b; b="$(backup "$d")"
        act "replace  $d"
        if [ "$DRY" -eq 0 ]; then cp "$f" "$d"; note "$d" "$b"; fi
      done
    else echo "  kept yours."; fi
  elif [ "$added" -eq 0 ]; then echo "  $what are already up to date."; fi
}

# set_block <file> <launcher>: adds or refreshes the marked block, leaves the rest
set_block() {
  local file="$1" launcher="$2" tmp
  tmp="$(mktemp)"
  node -e '
    const fs = require("fs"); const [file, inst, launcher, B, E, out] = process.argv.slice(1)
    const block = B + "\n" + fs.readFileSync(inst, "utf8").split("{{ARSENALE}}").join(launcher) + E + "\n"
    let old = ""; try { old = fs.readFileSync(file, "utf8") } catch {}
    const i = old.indexOf(B), j = old.indexOf(E)
    const next = i >= 0 && j > i ? old.slice(0, i) + block + old.slice(j + E.length).replace(/^[\r\n]+/, "") : old ? old.replace(/\s+$/, "") + "\n\n" + block : block
    fs.writeFileSync(out, next === old ? "" : next)
  ' "$file" "$REPO/adapters/instructions.md" "$launcher" "$BEGIN" "$END" "$tmp"
  if [ ! -s "$tmp" ]; then echo "  $file already has the current block."; rm -f "$tmp"; return; fi
  backup "$file" >/dev/null
  act "write the Arsenale block into $file"
  if [ "$DRY" -eq 0 ]; then mkdir -p "$(dirname "$file")"; mv "$tmp" "$file"; else rm -f "$tmp"; fi
}
remove_block() {
  local file="$1"
  [ -f "$file" ] && grep -qF "$BEGIN" "$file" || return 0
  ask "Remove the Arsenale block from $file ?" || return 0
  backup "$file" >/dev/null
  act "remove the Arsenale block from $file"
  [ "$DRY" -eq 1 ] && return 0
  node -e '
    const fs = require("fs"); const [file, B, E] = process.argv.slice(1)
    const old = fs.readFileSync(file, "utf8"); const i = old.indexOf(B), j = old.indexOf(E)
    fs.writeFileSync(file, (old.slice(0, i).replace(/\s+$/, "") + "\n" + old.slice(j + E.length).replace(/^[\r\n]+/, "")).replace(/^\n/, ""))
  ' "$file" "$BEGIN" "$END"
}
rc_file() { if [ -n "${ZSH_VERSION:-}" ] || [ "$(basename "${SHELL:-}")" = zsh ]; then echo "$HOME/.zshrc"; else echo "$HOME/.bashrc"; fi; }

# ------------------------------------------------------------------ uninstall
if [ "$UNINSTALL" -eq 1 ]; then
  echo "Uninstalling Arsenale (data folder: $DATA)"
  for f in "$CLAUDE/CLAUDE.md" "$CODEX/AGENTS.md" "$GEMINI/GEMINI.md"; do remove_block "$f"; done
  if [ -f "$MANIFEST" ] && ask "Remove the files the installer added (only those you have not edited), and put back the ones it replaced?"; then
    while IFS=$'\t' read -r h f orig; do
      [ -n "$f" ] && [ -e "$f" ] || continue
      if [ "$(hash_of "$f")" != "$h" ]; then echo "  kept $f (changed since install)"; continue; fi
      if [ -n "$orig" ] && [ -e "$orig" ]; then act "restore $f from $orig"; [ "$DRY" -eq 1 ] || cp "$orig" "$f"
      else act "delete $f"; [ "$DRY" -eq 1 ] || rm -f "$f"; fi
    done < "$MANIFEST"
    [ "$DRY" -eq 1 ] || rm -f "$MANIFEST"
  fi
  RC="$(rc_file)"
  if [ -f "$RC" ] && grep -q '# arsenale:begin' "$RC" && ask "Remove the Arsenale PATH line from $RC?"; then
    act "remove the PATH lines from $RC"
    [ "$DRY" -eq 1 ] || { sed '/# arsenale:begin/,/# arsenale:end/d' "$RC" > "$RC.arsenale-tmp" && mv "$RC.arsenale-tmp" "$RC"; }
  fi
  [ -d "$BIN" ] && { act "delete $BIN"; [ "$DRY" -eq 1 ] || rm -rf "$BIN"; }
  if [ "$PURGE" -eq 1 ] && [ -d "$DATA" ]; then
    if ask "Delete the whole data folder $DATA, with every run log and the company? This cannot be undone."; then act "delete $DATA"; [ "$DRY" -eq 1 ] || rm -rf "$DATA"; fi
  else echo "Your run logs stay in $DATA (add --purge to delete them)."; fi
  echo "Done."; exit 0
fi

# ------------------------------------------------------------------ install
echo "Arsenale installer$([ "$DRY" -eq 1 ] && echo ' (dry run: nothing is changed)' || true)"
echo "  code:        $REPO"
echo "  data folder: $DATA"
if ! command -v node >/dev/null 2>&1; then echo "Node.js was not found. Install Node.js 20 or newer from https://nodejs.org and run this again." >&2; exit 1; fi
NODEV="$(node --version | sed 's/^v//')"
if [ "${NODEV%%.*}" -lt 20 ]; then echo "Node.js $NODEV is too old: Arsenale needs 20 or newer." >&2; exit 1; fi
echo "  node:        $NODEV"

act "create $BIN"
act "write $BIN/arsenale"
if [ "$DRY" -eq 0 ]; then
  mkdir -p "$BIN"
  printf '#!/bin/sh\nexec node "%s" "$@"\n' "$REPO/bin/arsenale.cjs" > "$BIN/arsenale"
  chmod +x "$BIN/arsenale"
fi
LAUNCHER="$BIN/arsenale"

WANT=()
if [ -n "$TOOLS" ]; then IFS=',' read -r -a WANT <<< "$TOOLS"
else
  [ -d "$CLAUDE" ] && WANT+=(claude-code)
  [ -d "$CODEX" ] && WANT+=(codex)
  [ -d "$GEMINI" ] && WANT+=(gemini)
fi
has_tool() { local t; for t in "${WANT[@]+"${WANT[@]}"}"; do [ "$t" = "$1" ] && return 0; done; return 1; }

if [ -e "$DATA/config.json" ]; then echo "  $DATA/config.json exists: kept as it is."
else
  act "write $DATA/config.json"
  if [ "$DRY" -eq 0 ]; then
    if has_tool claude-code; then AG="$CLAUDE/agents"; TR="$CLAUDE/projects"; else AG="$REPO/agents"; TR=""; fi
    node -e 'const [f, a, t] = process.argv.slice(1); require("fs").writeFileSync(f, JSON.stringify({ agentDirs: [a], transcriptRoots: t ? [t] : [] }, null, 2) + "\n")' "$DATA/config.json" "$AG" "$TR"
  fi
fi
if [ ! -e "$DATA/model-prices.json" ]; then
  act "write $DATA/model-prices.json (empty: type in your own prices to see USD)"
  [ "$DRY" -eq 1 ] || cp "$REPO/tools/model-prices.json" "$DATA/model-prices.json"
fi

if [ "$NOPATH" -eq 0 ]; then
  RC="$(rc_file)"
  case ":$PATH:" in
    *":$BIN:"*) echo "  $BIN is already on your PATH." ;;
    *) if ask "Add $BIN to your PATH in $RC, so 'arsenale' works in new terminals?"; then
         act "add a PATH line to $RC"
         [ "$DRY" -eq 1 ] || printf '\n# arsenale:begin\nexport PATH="%s:$PATH"\n# arsenale:end\n' "$BIN" >> "$RC"
       else echo "  not added: call it as $LAUNCHER"; fi ;;
  esac
fi

[ "${#WANT[@]}" -eq 0 ] && echo "No coding tool folder found (Claude Code, Codex CLI, Gemini CLI). See adapters/README.md to set one up by hand."
for t in "${WANT[@]+"${WANT[@]}"}"; do
  case "$t" in
    claude-code)
      ask "Set up Claude Code in $CLAUDE (agent team, /feature and /fix skills, a block in CLAUDE.md)?" || continue
      files=(); for f in "$REPO"/agents/*.md "$REPO"/agents/labels.fa.json; do [ -e "$f" ] && files+=("$f"); done
      copy_side_by_side "$REPO/agents" "$CLAUDE/agents" "agent files" "${files[@]}"
      files=(); while IFS= read -r f; do files+=("$f"); done < <(find "$REPO/adapters/claude-code/skills" -type f | sort)
      copy_side_by_side "$REPO/adapters/claude-code/skills" "$CLAUDE/skills" "skill files" "${files[@]}"
      set_block "$CLAUDE/CLAUDE.md" "$LAUNCHER" ;;
    codex) ask "Add the Arsenale block to $CODEX/AGENTS.md?" && set_block "$CODEX/AGENTS.md" "$LAUNCHER" || true ;;
    gemini) ask "Add the Arsenale block to $GEMINI/GEMINI.md?" && set_block "$GEMINI/GEMINI.md" "$LAUNCHER" || true ;;
    *) echo "  unknown tool '$t' (known: claude-code, codex, gemini; Cursor and others: adapters/README.md)" ;;
  esac
done

echo
echo "Done. Next:"
echo "  $LAUNCHER demo     the dashboard on an invented company"
echo "  $LAUNCHER serve    your own dashboard"
echo "Uninstall: $REPO/install.sh --uninstall"
