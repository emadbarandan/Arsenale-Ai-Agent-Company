# Arsenale from any tool, script or language

Anything that can run a program can log to Arsenale: the `arsenale` command
takes JSON on standard input (`--stdin`) or from a file (`--file <f>`), prints
an id or a path on standard output, and uses the exit codes in
`arsenale --help`.

## Shell

`log.sh` in this folder defines small functions you can `source`:

```bash
source <arsenale>/adapters/generic/log.sh
id=$(arsenale_start nightly-tests "Run the nightly suite" my-app)
arsenale_step "$id" "suite started"
npm test && arsenale_finish "$id" nightly-tests "Run the nightly suite" ok \
          || arsenale_finish "$id" nightly-tests "Run the nightly suite" failed
```

The functions build the JSON with Node, so any text is safe to pass.

## Windows PowerShell

```powershell
$f = Join-Path $env:TEMP 'arsenale-run.json'
@{ agent = 'nightly-tests'; task = 'Run the nightly suite'; project = 'my-app' } | ConvertTo-Json | Set-Content -Encoding UTF8 $f
$id = arsenale start --file $f
```

## Why there is no HTTP endpoint for logging

The dashboard server accepts writes only from its own page (Origin check plus a
per-start token), and only for answers, dismissals and budgets. Logging goes
through the command (or the files) on purpose: no other program on the machine,
and no web page, can post fake runs to it.

## Writing the files directly

The command is a thin layer over plain JSON files in the data folder
(`arsenale paths` prints it). A program that cannot run the command may write
them itself, one file per record, never rewriting another's:

| What | File | Required fields |
|---|---|---|
| Running now | `agent-runs/active/<id>.json` | `id`, `agent`, `task`, `startedAt` (ISO time); optional `model`, `project`, `doing`, `steps:[{at,text}]`, `parent` |
| Finished run | `agent-runs/<time>-<agent>-<rand>.json` | `agent`, `task`, `status` (`ok`/`findings`/`failed`/`stopped`), `finishedAt`; optional `id`, `startedAt`, `summary`, `findings[]`, `files[]`, `model`, `project`, `usage:{tokens,toolUses,durationMs,model}` |

Delete the active file when you write the finished one. Write to a temporary
name and rename, so the dashboard never reads half a file. The command does all
of this for you; prefer it.
