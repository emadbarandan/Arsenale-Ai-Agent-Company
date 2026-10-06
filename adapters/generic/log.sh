# Arsenale shell helpers. Source this file: . <arsenale>/adapters/generic/log.sh
# The JSON is built by Node from the arguments, so quotes, $ and backticks in
# a task text cannot break the command. Needs `arsenale` on the PATH, or set
# ARSENALE_BIN to the launcher (for example "node /path/to/arsenale/bin/arsenale.cjs").

_arsenale() { ${ARSENALE_BIN:-arsenale} "$@"; }
_arsenale_json() { node -e 'const k=process.argv[1].split(",");const v=process.argv.slice(2);const o={};k.forEach((x,i)=>{if(v[i]!==undefined&&v[i]!=="")o[x]=v[i]});process.stdout.write(JSON.stringify(o))' "$@"; }

# arsenale_start <agent> <task> [project] [model]   prints the run id
arsenale_start() { _arsenale_json agent,task,project,model "$@" | _arsenale start --stdin; }

# arsenale_step <run id> <text>
arsenale_step() { _arsenale_json id,doing "$@" | _arsenale progress --stdin >/dev/null; }

# arsenale_finish <run id> <agent> <task> <ok|findings|failed|stopped> [summary]
arsenale_finish() { _arsenale_json id,agent,task,status,summary "$@" | _arsenale finish --stdin >/dev/null; }
