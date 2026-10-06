<#
.SYNOPSIS
  Installs Arsenale for this Windows user: the `arsenale` command, its data
  folder, and (only after asking) the instructions and agents for your coding
  tools.

.DESCRIPTION
  What it does, in order. Every step that touches a file outside the data
  folder asks first; -Yes answers yes to all of them, -DryRun only prints.

    1. Checks Node.js 20 or newer.
    2. Creates the data folder (default $HOME\.arsenale) with:
         bin\arsenale.cmd and bin\arsenale   launchers for cmd/PowerShell and Git Bash
         config.json                          which agent and transcript folders to read
         model-prices.json                    empty, for your own prices
       An existing config.json or model-prices.json is never overwritten.
    3. Asks to add the data folder's bin to your user PATH.
    4. For each coding tool it finds (Claude Code, Codex CLI, Gemini CLI), asks
       whether to set it up:
         - adds the Arsenale block to the tool's instructions file, between
           <!-- arsenale:begin --> and <!-- arsenale:end --> markers;
         - Claude Code only: copies the agent team and the /feature and /fix
           skills next to your own, file by file.
       Nothing is moved and nothing of yours is deleted. A file is overwritten
       only when you agree, and is copied to <data>\backups\<time>\ first.
       Every file written is listed in <data>\installed.txt for -Uninstall.

    It never edits a tool's settings file (for example Claude Code's
    settings.json). The optional Claude Code hooks are a manual step:
    adapters\claude-code\README.md.

.PARAMETER DataDir
  The data folder. Default: $env:ARSENALE_HOME, else $HOME\.arsenale.

.PARAMETER Tools
  Which tools to offer, comma-separated: claude-code, codex, gemini. Default:
  every one whose folder exists.

.PARAMETER Yes
  Answer yes to every question (for scripts).

.PARAMETER DryRun
  Print what would happen and change nothing.

.PARAMETER Uninstall
  Remove the instruction blocks, the files this installer wrote that you have
  not changed since, the launchers and the PATH entry. Asks first. The data
  folder (your run logs) stays unless -Purge is given too.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\install.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\install.ps1 -DryRun
#>
[CmdletBinding()]
param(
  [string]$DataDir = '',
  [string]$Tools = '',
  [string]$ClaudeDir = '',
  [string]$CodexDir = '',
  [string]$GeminiDir = '',
  [switch]$Yes,
  [switch]$DryRun,
  [switch]$Uninstall,
  [switch]$Purge,
  [switch]$NoPath
)

$ErrorActionPreference = 'Stop'
$Repo = Split-Path -Parent $MyInvocation.MyCommand.Path
$Utf8 = New-Object System.Text.UTF8Encoding($false)
$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'

# $HOME, never "~": Windows PowerShell 5.1 does not expand "~" in arguments to programs
if (-not $DataDir) { if ($env:ARSENALE_HOME) { $DataDir = $env:ARSENALE_HOME } else { $DataDir = Join-Path $HOME '.arsenale' } }
if (-not $ClaudeDir) { if ($env:CLAUDE_CONFIG_DIR) { $ClaudeDir = $env:CLAUDE_CONFIG_DIR } else { $ClaudeDir = Join-Path $HOME '.claude' } }
if (-not $CodexDir) { if ($env:CODEX_HOME) { $CodexDir = $env:CODEX_HOME } else { $CodexDir = Join-Path $HOME '.codex' } }
if (-not $GeminiDir) { $GeminiDir = Join-Path $HOME '.gemini' }
$BinDir = Join-Path $DataDir 'bin'
$Manifest = Join-Path $DataDir 'installed.txt'
$BackupDir = Join-Path (Join-Path $DataDir 'backups') $Stamp
$Begin = '<!-- arsenale:begin -->'
$End = '<!-- arsenale:end -->'

function Say([string]$text) { Write-Host $text }
function Act([string]$text) { if ($DryRun) { Write-Host "  [dry-run] $text" } else { Write-Host "  $text" } }

function Ask([string]$question) {
  if ($Yes) { Write-Host "$question [y/N] y (-Yes)"; return $true }
  if ($DryRun) { Write-Host "$question [y/N] (dry-run: showing the yes path)"; return $true }
  try { $a = Read-Host "$question [y/N]" } catch { Write-Host '  no console to ask on: skipped (use -Yes to accept)'; return $false }
  return ($a -match '^(y|yes)$')
}

function Write-Text([string]$path, [string]$text) {
  if ($DryRun) { return }
  $dir = Split-Path -Parent $path
  if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  [System.IO.File]::WriteAllText($path, $text, $Utf8)
}

function Backup([string]$path) {
  if ($DryRun -or -not (Test-Path -LiteralPath $path)) { return }
  $rel = ($path -replace '^[A-Za-z]:', '') -replace '^[\\/]+', ''
  $dest = Join-Path $BackupDir $rel
  New-Item -ItemType Directory -Path (Split-Path -Parent $dest) -Force | Out-Null
  Copy-Item -LiteralPath $path -Destination $dest -Force
  Act "backed up $path -> $dest"
  return $dest
}

# One line per file written: its hash, its path, and the backup of what it
# replaced (if anything), so -Uninstall can put the original back.
function Note-Installed([string]$path, [string]$backup) {
  if ($DryRun) { return }
  $hash = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash
  [System.IO.File]::AppendAllText($Manifest, "$hash`t$path`t$backup`r`n", $Utf8)
}

function Same-File([string]$a, [string]$b) {
  return (Get-FileHash -LiteralPath $a -Algorithm SHA256).Hash -eq (Get-FileHash -LiteralPath $b -Algorithm SHA256).Hash
}

# Copies files side by side: new ones are added, identical ones skipped, and
# differing ones overwritten only after a yes, each backed up first.
function Copy-SideBySide([string[]]$sources, [string]$srcRoot, [string]$dstRoot, [string]$what) {
  $new = @(); $differ = @()
  foreach ($s in $sources) {
    $rel = $s.Substring($srcRoot.Length).TrimStart('\', '/')
    $d = Join-Path $dstRoot $rel
    if (-not (Test-Path -LiteralPath $d)) { $new += ,@($s, $d) }
    elseif (-not (Same-File $s $d)) { $differ += ,@($s, $d) }
  }
  foreach ($p in $new) {
    Act "add      $($p[1])"
    if (-not $DryRun) { New-Item -ItemType Directory -Path (Split-Path -Parent $p[1]) -Force | Out-Null; Copy-Item -LiteralPath $p[0] -Destination $p[1]; Note-Installed $p[1] }
  }
  if ($differ.Count -gt 0) {
    Say "  $($differ.Count) $what already exist with different content:"
    foreach ($p in $differ) { Say "    $($p[1])" }
    if (Ask "  Overwrite them with Arsenale's version (each is backed up first)?") {
      foreach ($p in $differ) { $b = Backup $p[1]; Act "replace  $($p[1])"; if (-not $DryRun) { Copy-Item -LiteralPath $p[0] -Destination $p[1] -Force; Note-Installed $p[1] $b } }
    } else { Say '  kept yours.' }
  }
  if ($new.Count -eq 0 -and $differ.Count -eq 0) { Say "  $what are already up to date." }
}

function Block-Text([string]$launcher) {
  $body = [System.IO.File]::ReadAllText((Join-Path $Repo 'adapters\instructions.md'), $Utf8)
  $body = $body.Replace('{{ARSENALE}}', $launcher)
  return "$Begin`n$body$End`n"
}

# Adds or refreshes the marked block; the rest of the file is left as it was.
function Set-Block([string]$file, [string]$launcher) {
  $block = Block-Text $launcher
  $old = ''
  if (Test-Path -LiteralPath $file) { $old = [System.IO.File]::ReadAllText($file, $Utf8) }
  $i = $old.IndexOf($Begin); $j = $old.IndexOf($End)
  if ($i -ge 0 -and $j -gt $i) { $new = $old.Substring(0, $i) + $block + $old.Substring($j + $End.Length).TrimStart("`r", "`n") }
  elseif ($old.Length -gt 0) { $new = $old.TrimEnd() + "`n`n" + $block }
  else { $new = $block }
  if ($new -eq $old) { Say "  $file already has the current block."; return }
  $null = Backup $file
  Act "write the Arsenale block into $file"
  Write-Text $file $new
}

function Remove-Block([string]$file) {
  if (-not (Test-Path -LiteralPath $file)) { return }
  $old = [System.IO.File]::ReadAllText($file, $Utf8)
  $i = $old.IndexOf($Begin); $j = $old.IndexOf($End)
  if ($i -lt 0 -or $j -le $i) { return }
  $new = ($old.Substring(0, $i).TrimEnd() + "`n" + $old.Substring($j + $End.Length).TrimStart("`r", "`n")).TrimStart("`n")
  $null = Backup $file
  Act "remove the Arsenale block from $file"
  Write-Text $file $new
}

function User-Path { return [Environment]::GetEnvironmentVariable('Path', 'User') }

# ---------------------------------------------------------------- uninstall
if ($Uninstall) {
  Say "Uninstalling Arsenale (data folder: $DataDir)"
  foreach ($f in @((Join-Path $ClaudeDir 'CLAUDE.md'), (Join-Path $CodexDir 'AGENTS.md'), (Join-Path $GeminiDir 'GEMINI.md'))) {
    if ((Test-Path -LiteralPath $f) -and ([System.IO.File]::ReadAllText($f, $Utf8).Contains($Begin))) {
      if (Ask "Remove the Arsenale block from $f ?") { Remove-Block $f }
    }
  }
  if (Test-Path -LiteralPath $Manifest) {
    $lines = [System.IO.File]::ReadAllLines($Manifest, $Utf8) | Where-Object { $_ -match "`t" }
    if ($lines.Count -gt 0 -and (Ask "Remove the $(@($lines).Count) agent and skill files the installer added (only those you have not edited), and put back the ones it replaced?")) {
      foreach ($l in $lines) {
        $parts = $l.Split("`t"); $hash = $parts[0]; $f = $parts[1]; $orig = ''
        if ($parts.Count -gt 2) { $orig = $parts[2] }
        if (-not (Test-Path -LiteralPath $f)) { continue }
        if ((Get-FileHash -LiteralPath $f -Algorithm SHA256).Hash -ne $hash) { Say "  kept $f (changed since install)"; continue }
        if ($orig -and (Test-Path -LiteralPath $orig)) {
          Act "restore $f from $orig"
          if (-not $DryRun) { Copy-Item -LiteralPath $orig -Destination $f -Force }
        } else {
          Act "delete $f"
          if (-not $DryRun) { Remove-Item -LiteralPath $f -Force }
        }
      }
      if (-not $DryRun) { Remove-Item -LiteralPath $Manifest -Force }
    }
  }
  $up = User-Path
  if ($up -and ($up.Split(';') -contains $BinDir) -and (Ask "Remove $BinDir from your user PATH?")) {
    Act "remove $BinDir from the user PATH"
    if (-not $DryRun) { [Environment]::SetEnvironmentVariable('Path', (($up.Split(';') | Where-Object { $_ -and $_ -ne $BinDir }) -join ';'), 'User') }
  }
  if (Test-Path -LiteralPath $BinDir) { Act "delete $BinDir"; if (-not $DryRun) { Remove-Item -LiteralPath $BinDir -Recurse -Force } }
  if ($Purge -and (Test-Path -LiteralPath $DataDir)) {
    if (Ask "Delete the whole data folder $DataDir, with every run log and the company? This cannot be undone.") {
      Act "delete $DataDir"
      if (-not $DryRun) { Remove-Item -LiteralPath $DataDir -Recurse -Force }
    }
  } else { Say "Your run logs stay in $DataDir (add -Purge to delete them)." }
  Say 'Done.'
  exit 0
}

# ---------------------------------------------------------------- install
Say "Arsenale installer$(if ($DryRun) { ' (dry run: nothing is changed)' })"
Say "  code:        $Repo"
Say "  data folder: $DataDir"

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { Write-Error 'Node.js was not found. Install Node.js 20 or newer from https://nodejs.org and run this again.'; exit 1 }
$ver = (& node --version) -replace '^v', ''
if ([int]($ver.Split('.')[0]) -lt 20) { Write-Error "Node.js $ver is too old: Arsenale needs 20 or newer."; exit 1 }
Say "  node:        $ver"

# 2. data folder, launchers, config
Act "create $BinDir"
if (-not $DryRun) { New-Item -ItemType Directory -Path $BinDir -Force | Out-Null }
$cli = Join-Path $Repo 'bin\arsenale.cjs'
Act "write $BinDir\arsenale.cmd"
Write-Text (Join-Path $BinDir 'arsenale.cmd') "@echo off`r`nnode `"$cli`" %*`r`n"
# Git Bash (which most coding agents use on Windows) runs this one
$cliPosix = $cli.Replace('\', '/')
Act "write $BinDir\arsenale (for Git Bash)"
Write-Text (Join-Path $BinDir 'arsenale') "#!/bin/sh`nexec node `"$cliPosix`" `"`$@`"`n"
$launcher = Join-Path $BinDir 'arsenale.cmd'

$wanted = @()
if ($Tools) { $wanted = $Tools.Split(',') | ForEach-Object { $_.Trim().ToLower() } | Where-Object { $_ } }
else {
  if (Test-Path -LiteralPath $ClaudeDir) { $wanted += 'claude-code' }
  if (Test-Path -LiteralPath $CodexDir) { $wanted += 'codex' }
  if (Test-Path -LiteralPath $GeminiDir) { $wanted += 'gemini' }
}

$config = Join-Path $DataDir 'config.json'
if (Test-Path -LiteralPath $config) { Say "  $config exists: kept as it is." }
else {
  $agentDirs = @(); $roots = @()
  if ($wanted -contains 'claude-code') { $agentDirs += (Join-Path $ClaudeDir 'agents'); $roots += (Join-Path $ClaudeDir 'projects') }
  else { $agentDirs += (Join-Path $Repo 'agents') }
  $json = '{' + "`n" + '  "agentDirs": [' + (($agentDirs | ForEach-Object { '"' + $_.Replace('\', '\\') + '"' }) -join ', ') + '],' + "`n" + '  "transcriptRoots": [' + (($roots | ForEach-Object { '"' + $_.Replace('\', '\\') + '"' }) -join ', ') + ']' + "`n" + '}' + "`n"
  Act "write $config"
  Write-Text $config $json
}
$prices = Join-Path $DataDir 'model-prices.json'
if (-not (Test-Path -LiteralPath $prices)) {
  Act "write $prices (empty: type in your own prices to see USD)"
  if (-not $DryRun) { Copy-Item -LiteralPath (Join-Path $Repo 'tools\model-prices.json') -Destination $prices }
}

# 3. PATH
$up = User-Path
if (-not $NoPath) {
  if ($up -and ($up.Split(';') -contains $BinDir)) { Say "  $BinDir is already on your PATH." }
  elseif (Ask "Add $BinDir to your user PATH, so 'arsenale' works in new terminals?") {
    Act "add $BinDir to the user PATH"
    if (-not $DryRun) { if ($up) { $newPath = "$up;$BinDir" } else { $newPath = $BinDir }; [Environment]::SetEnvironmentVariable('Path', $newPath, 'User') }
  } else { Say "  not added: call it as $launcher" }
}

# 4. tools
if ($wanted.Count -eq 0) { Say 'No coding tool folder found (Claude Code, Codex CLI, Gemini CLI). See adapters\README.md to set one up by hand.' }
foreach ($t in $wanted) {
  if ($t -eq 'claude-code') {
    if (-not (Ask "Set up Claude Code in $ClaudeDir (agent team, /feature and /fix skills, a block in CLAUDE.md)?")) { continue }
    $agentFiles = Get-ChildItem -LiteralPath (Join-Path $Repo 'agents') -File | Where-Object { $_.Name -like '*.md' -or $_.Name -eq 'labels.fa.json' } | ForEach-Object { $_.FullName }
    Copy-SideBySide $agentFiles (Join-Path $Repo 'agents') (Join-Path $ClaudeDir 'agents') 'agent files'
    $skillSrc = Join-Path $Repo 'adapters\claude-code\skills'
    $skillFiles = Get-ChildItem -LiteralPath $skillSrc -File -Recurse | ForEach-Object { $_.FullName }
    Copy-SideBySide $skillFiles $skillSrc (Join-Path $ClaudeDir 'skills') 'skill files'
    Set-Block (Join-Path $ClaudeDir 'CLAUDE.md') $launcher
  } elseif ($t -eq 'codex') {
    if (Ask "Add the Arsenale block to $CodexDir\AGENTS.md?") { Set-Block (Join-Path $CodexDir 'AGENTS.md') $launcher }
  } elseif ($t -eq 'gemini') {
    if (Ask "Add the Arsenale block to $GeminiDir\GEMINI.md?") { Set-Block (Join-Path $GeminiDir 'GEMINI.md') $launcher }
  } else { Say "  unknown tool '$t' (known: claude-code, codex, gemini; Cursor and others: adapters\README.md)" }
}

Say ''
Say 'Done. Next:'
Say "  $launcher demo     the dashboard on an invented company"
Say "  $launcher serve    your own dashboard"
Say "Uninstall: powershell -ExecutionPolicy Bypass -File `"$Repo\install.ps1`" -Uninstall"
