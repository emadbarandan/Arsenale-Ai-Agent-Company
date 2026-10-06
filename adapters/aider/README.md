# Arsenale with Aider

Aider does not run shell commands on its own initiative the way agentic tools
do, so the simplest way is to log around it from your shell: start a run before
a session, finish it after.

```bash
id=$(arsenale start --stdin <<'EOF'
{"agent":"aider","model":"<model>","project":"my-app","task":"Add pagination to /entries"}
EOF
)
aider --model <model> src/entries.py
arsenale finish --stdin <<EOF
{"id":"$id","agent":"aider","task":"Add pagination to /entries","status":"ok"}
EOF
```

(The second heredoc is unquoted on purpose, so `$id` is filled in; keep text
from elsewhere out of it.)

If you let Aider run commands, you can also load `adapters/instructions.md` as
a read-only conventions file (`aider --read <arsenale>/adapters/instructions.md`,
or `read:` in `.aider.conf.yml`) so it logs progress lines itself.
