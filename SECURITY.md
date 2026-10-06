# Security policy

## Supported versions

The latest release on `main` gets security fixes.

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's private vulnerability
reporting: the repository's **Security** tab, then **Report a vulnerability**.
Include what an attacker needs (another web page in the same browser, another
program on the machine, a crafted run log …), the steps, and what they gain.
You will get an answer within a week.

## What Arsenale defends against

Arsenale runs on your own machine. Its model, in short (details in the README,
"Security model"):

- **Other web pages** in your browser must not read your runs or post answers,
  dismissals or budgets: localhost-only binding, Host check, Origin check,
  the key cookie and a page token, no CORS, no framing, a nonce-based CSP.
- **Other accounts on the same machine** must not read the dashboard or act
  as you through it: every request needs a cookie that only the launch key
  (`<data>/launch-key`, readable only by you) can get.
- **Text inside run logs** (task names, findings, answers) must never run as
  script in the page: everything is escaped, and the CSP allows only the
  page's own script.
- **A crafted log line** must not make Arsenale write outside its data folder
  or read files outside the configured transcript folders.
- **An assistant connected over MCP**, including one manipulated by a web page
  or document it read, must not act as the owner: it cannot answer or approve
  questions, change budgets, pause, hire, install packs, change the safety
  rules or notification settings, or read files by path. Those are refused in
  the write library, whatever the arguments say. It can write misleading logs,
  ask questions, register deliverables (within the limits below) and propose a
  hire, which the owner sees in full first.
- **MCP over HTTP** (off unless `ARSENALE_MCP_TOKEN` is set): other web pages
  and DNS rebinding must not reach it (127.0.0.1, Host and Origin checks, a
  bearer token compared in constant time, no CORS, a rate limit).
- **Deliverables** must not become a way to read any file: a path is copied
  only from the folders the owner allowed, after links are resolved, never a
  protected file (keys, `.env`, licences, `.ssh`), within type and size
  limits. Stored copies are served with `nosniff` and a sandbox CSP; SVG and
  HTML are refused.
- **The hire form and office packs** write text a model will obey: only the
  owner's page can write it, the frontmatter is generated, the safety block is
  always appended, every edit is backed up, and only bundled packs install.
- **Phone approvals** (experimental): a button is accepted only with a valid
  HMAC signature under a key that never leaves the machine, before its expiry,
  once, while the question is still waiting and unchanged. No port is opened.
  Buttons come only with choice questions and with action approvals whose
  category the safety rules let a phone approve; never with a payment, a
  hire or a plain yes/no question. Telegram pairs through a one-time link
  from a private chat, and afterwards listens only to that person in that
  chat.
- **Connecting an assistant** edits only that client's fixed settings file,
  after the owner saw the change, never a file with comments, with a backup.
  The file keeps its permissions, and the preview shows only the Arsenale
  entry, never the other servers' settings.

## Threat model

Trusted: your operating-system account, and everything that runs as it. That
includes the command line, which believes `"by":"board"`: a program running
as you can act as you, through the CLI or by editing the files directly.

The launch key protects against:
- other accounts on a shared machine (a terminal server, a shared Linux box,
  a CI runner) that can reach `127.0.0.1` but cannot read your home folder;
- other web sites open in your browser;
- DNS rebinding (the Host check comes first).

It does not protect against:
- malware or any program running as your account (it can read the key file);
- an administrator or root user on the machine;
- anyone who can read your home folder, or your browser profile.

Phone channels: in details mode the outside service (ntfy, Telegram,
Pushover) sees the text of each question. The default, minimal mode sends
only "1 question waiting".

Out of scope: a program that already runs as your user (it can edit the JSON
files, call the CLI with `"by":"board"`, start `arsenale mcp`, read the
launch key, or read the MCP token from your assistant's settings), and other
users of a shared machine with access to your home folder. The safety rules
(`policy.json`) are advisory: Arsenale cannot block a tool inside another
program, and says so on every screen that shows them. What an outside service
you turned on (ntfy, Telegram, Pushover) sees is the message you chose to
send it: by default only "1 question waiting".
