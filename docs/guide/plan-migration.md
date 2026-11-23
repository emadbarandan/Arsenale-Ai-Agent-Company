# Moving a plan from another planner into Arsenale (M2 and M3)

Examples use invented names (project `tide-app`). Arsenale never reads or writes your other planner: its only input is a copy of an export file (schema v1) that you made there. It opens no network connection. Everything below is the owner's (set `ARSENALE_BOARD_TOKEN`, or use the key file).

## Check a file first

    arsenale plan-check hq.json

## M2: shadow (the other planner stays the master)

1. In the other planner, make the export for the project and copy the file to the Arsenale machine.
2. `arsenale import-plan hq.json --project tide-app --phases-as versions --shadow`
   Writes only `<home>/shadow/tide-app/` (a small data folder of its own: plan, tasks, decisions, worklog, base). Your live company folder is not touched. The shadow is read-only in the Dock.
3. Daily, after a fresh export: `arsenale plan-parity hq.json --project tide-app --phases-as versions --shadow --write`
   It prints `Parity: clean` or `Parity: N differences` with each one listed (exit 0 or 1). Totals (per phase and overall) are listed only when every task, decision and run matches, so one wrong size is one difference. Arsenale adds no scheduler: run it by hand or from your own cron.
4. Exit: 14 consecutive daily reports with `Parity: clean`, and your yes.

Rollback: `arsenale shadow drop --project tide-app` deletes `<home>/shadow/tide-app/` and nothing else.

## M3: move the project (Arsenale becomes the master)

1. Check: M2 clean, and `plan-parity` clean on today's export.
2. In the other planner: freeze planning of the project (its own setting) and take the final export.
3. `arsenale import-plan final.json --project tide-app --phases-as versions --promote`
   - Before any write it copies the company folder, the decisions folder and the shadow into `<home>/backups/plan-m3-<stamp>/files/`, with `manifest.json` (every path relative to its folder, SHA-256 and size of each).
   - It imports into the live company, sets `master` to `arsenale`, drops the shadow.
   - It runs the parity check (only imported items). A difference undoes everything at once from the backup, prints the differences, and exits 1. The company folder is then as it was.
   - On success it prints the backup name and records the files it created in the manifest.
4. Work from the Dock. If the other planner wants a read-only mirror: `arsenale export-plan --project tide-app --phases-as versions --out mirror.json`.

Rollback: `arsenale plan restore plan-m3-<stamp>` puts back every copied file, removes every file the manifest says was created, and checks every hash. It refuses a manifest path outside the data folder or an unknown folder name and changes nothing in that case. If files in the company or decisions folders changed after the promote, the restore refuses, names how many and the first one, and changes nothing; export what you need first, then run it again with `--force` to restore anyway and lose that work. Then lift the freeze in the other planner: its data was never changed by Arsenale, so it is current as of step 2.

`--dry-run` with `--promote` only shows what the import would do and writes nothing. `--shadow` cannot be combined with `--dry-run` or `--promote`.
