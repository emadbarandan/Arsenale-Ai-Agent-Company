# Office packs

An office pack is a ready-made team for one office: a lead and a few members,
each an agent definition your assistant can follow. Arsenale installs packs
from this folder only (Settings → Office packs, or the first-start wizard).

| Pack | Office | Members |
|---|---|---|
| `content-marketing` | Content & Marketing | marketing-lead ★, copywriter, social-media-planner, seo-specialist, newsletter-editor |
| `research` | Research | research-lead ★, desk-researcher, market-analyst, fact-checker |
| `operations` | Operations & Admin | operations-lead ★, office-assistant, process-writer, supplier-coordinator |
| `hr` | HR | people-lead ★, job-ad-writer, interview-planner, onboarding-planner, policy-drafter |
| `finance` | Finance | finance-lead ★, bookkeeping-assistant, invoice-drafter, budget-analyst, expense-checker |
| `customer-support` | Customer support | support-lead ★, reply-drafter, faq-writer, ticket-triager, feedback-summariser |
| `design` | Design | design-lead ★, brand-designer, layout-designer, image-brief-writer, design-reviewer |

The engineering and product team stays in `agents/` at the top of the repo,
installed by `install.ps1` / `install.sh` as before.

## Format

```
packs/<id>/
  pack.json          the pack, below
  agents/<member>.md one definition per member
  labels.fa.json     Persian titles: { "<member>": { "title", "what", "dept" } }
  README.md          what the office does, the members, sample tasks, limits
```

`pack.json`:

| Field | Rule |
|---|---|
| `format` | `"arsenale-pack"` |
| `formatVersion` | `1`; a higher number is not installable by this Arsenale |
| `id` | `^[a-z][a-z0-9-]{1,30}$`, the folder name |
| `version` | semver, `"1.0.0"`; an update needs a higher version |
| `name`, `nameFa`, `description` (≤ 200), `descriptionFa` | shown on the pack card |
| `minArsenale` | semver; a newer value than the app shows "Needs a newer Arsenale" |
| `office` | `{ id, name, nameFa, theme, profile, lead }`; `theme` is one of teal, blue, violet, coral, amber, slate; `lead` is a member id |
| `members` | `[{ file: "agents/<id>.md", id, zone, title, titleFa, tier }]`, 1 to 12; `zone` is lead, build, review, docs or design; `tier` is light or standard |
| `sampleTasks` | 2 to 5 `{ title, description, assignee }`, invented, offered as one-click task templates |
| `policy` | `{ members: { <id>: { <category>: "ask" or "never" } } }`; only stricter than the defaults. A pack that says `"allow"` is refused: "A pack can only make the rules stricter." |

Each member file has exactly these frontmatter keys, in this order: `name`,
`description`, `model`, `effort`, `tools`, `color`, `zone`. `tools` and
`model` are read only by Claude Code. The body:

1. a role line;
2. `Follow \`AGENT-RULES.md\` (the house rules in the same folder as this file).`;
3. what the member does, how to do it well, what it never does;
4. the safety block (verbatim, see any member file);
5. for HR and Finance members, the advice limits block;
6. the report block: a one-line summary first, then "What I did".

Bodies are tool-agnostic: no tool names, model names or vendors. The test
`tools/test/everyone.test.cjs` checks every rule above on every bundled pack,
and that no e-mail address other than `@example.*` appears.

## Install, remove, update

- **Install** copies the member files into `~/.arsenale/agents`, records each
  file's SHA-256 in `~/.arsenale/packs/installed.json`, adds the office and
  the members, merges the Persian labels, and applies the stricter policy
  rows. A member id you already have is never overwritten: keep yours, or
  install the pack's member as `<id>-2`.
- **Remove** deletes only the files whose hash still matches (the ones you
  did not edit), archives the office (never deletes it) and marks the removed
  members retired. All history stays.
- **Update** replaces unedited files; for a file you edited it writes the
  new text to `<data>/pack-updates/<id>.md` for you to compare (not into the
  agent folder, where every `.md` file is a team member).

## Why only bundled packs

A pack is instructions a model will follow, so a pack from a stranger is a way
to plant instructions in your assistant. Until packs can be signed and
reviewed, Arsenale installs only the packs that ship with it. Contributions of
new packs are welcome as pull requests (see CONTRIBUTING.md); HR and Finance
texts need a review by someone qualified.
