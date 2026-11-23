# ATB-1 lite: what the savings numbers in Arsenale are based on

Arsenale's Savings page and the tier rules R1 to R3 quote numbers from one
small benchmark, ATB-1 ("agent token benchmark", lite). This page says what
was measured, how, and what it does not show. Every number below was
measured; none is a forecast.

## Method

- **Ten fixed tasks and one chain**, each frozen (code at a fixed state, the
  prompt in a file, checks the agent never sees). The tasks are plain
  everyday ones in three small projects: a Node dashboard, a FastAPI app and
  a Python video tool.
- **Lite means one run per task per arm.** There are no repeats, so there are
  no error bars. Differences of about 25 % or less on a single task are
  inside the noise; the large differences are not.
- **Arm A (baseline):** the heavy model (Opus 5.5), the task prompt only, one
  continuous session for the chain.
- **Arm B (routing):** the model chosen per task (light model for the scan,
  heavy model for the review, standard model for the rest), a short code map
  of the project in the folder, and a few working rules (open only the line
  ranges you need, run targeted tests first and the full suite once, do not
  re-read files, keep the final reply to five lines). In the chain, each unrelated step starts a fresh
  agent with the map.
- **Arm C (a planning model as manager)** was run on two tasks only.
- **Quality gates:** for code, hidden tests plus the project's own test suite;
  for the review and the scan, an answer key; for the two documents, a blind
  scorer with a fixed 20-point rubric.
- **Cost** is the token usage in each run's transcript (counted once per
  message), times the published list prices of 2026-11-18. The runs were made
  on a subscription plan, so every dollar figure is API-equivalent: what the
  same tokens would cost on the API. The cost of making the code maps
  ($0.04 in total) is counted separately.

## Results per task

"Cost" is API-equivalent dollars. "Pass" is the quality gate of that task.

| Task | What it was | A cost | B cost | Change | A pass | B pass |
|---|---|---|---|---|---|---|
| T1 | Small bug fix in a Node dashboard | 0.45 | 0.57 | +28 % | yes | yes |
| T2 | New optional field, old files must still open (Node dashboard) | 0.89 | 0.43 | -52 % | yes | yes |
| T3 | Write a spec section from the code (Node dashboard) | 1.22 | 0.36 | -71 % | yes, 18/20 | no, 12/20 with 3 factual errors |
| T4 | Review a diff with 4 seeded defects (heavy model in both arms) | 0.55 | 0.55 | -1 % | yes, 4/4 | yes, 4/4 |
| T5 | Small bug fix in a FastAPI app | 0.63 | 0.44 | -29 % | yes | yes |
| T6 | New optional field plus a database migration (FastAPI app) | 0.91 | 0.39 | -57 % | yes | yes |
| T7 | Caption rules change in a Python video tool | 0.37 | 0.28 | -24 % | yes | yes |
| T8 | Importer change: lower-case, de-duplicate, cap, re-run changes nothing (Python) | 0.77 | 0.51 | -34 % | yes | yes |
| T9 | Research brief on an API's daily upload limits, with sources | 0.89 | 0.29 | -67 % | yes, 19/20 | no, 17/20 (below the baseline) |
| T10 | Status table over three repositories (12 facts) | 0.26 | 0.01 | -95 % | yes, 13/13 | yes, 13/13 |
| Sum | | 6.95 | 3.84 | -45 % | 10 of 10 | 8 of 10 |
| Cost per passed task | | 0.695 | 0.480 | -31 % | | |
| Chain (T1, T10, T2 in one session) | | 0.95 | 0.46 | -52 % | yes | yes |

Arm C (a planning model as manager, then the standard model implementing) was
run on T2 and T6. The planning step alone cost $1.18 and $1.15, more than the
whole baseline run, so it was stopped there.

The whole benchmark cost $14.56 (API-equivalent).

## What the tier rules take from it

| Rule | Based on | Measured |
|---|---|---|
| R1 light work on a heavy model | T10 | -95 % ($0.26 to $0.01), 13 of 13 facts in both arms |
| R2 code on a heavy model (not a small bug fix) | T2, T5, T6, T7, T8 | median -34 %, range -24 % to -57 %, every hidden test green |
| R2 exclusion: a small bug fix | T1 | +28 % (13 turns against 10) |
| R3 writing on a cheaper model: a warning, not a saving | T3, T9 | the cheaper runs lost quality (12/20 against 18/20, 17/20 against 19/20), so the saving does not count |
| Reviews are never routed down | T4 | same model, same cost (-1 %) |

## What else it showed

- Most of the cost of a run is the model re-reading its cached context on
  every turn (in one task, 1.4 million cache-read tokens against 4 thousand
  fresh ones). Fewer turns and a smaller starting context matter more than
  shorter answers.
- Starting a fresh session with a code map for each unrelated step roughly
  halved the cost of the chain (-52 %).
- Using a planning model as a per-task manager did not pay at these task sizes.

## Limits

- One run per task per arm. T1, T4 and T7 are inside the noise; T2, T6, T10
  and the chain are not.
- The runs used sub-agents inside a session, not a fresh headless process for
  each task, so each carried that session's system prompt.
- Each document was scored once by one blind scorer, using a rubric written
  before the runs.
- Three small projects and ten tasks do not cover every kind of work. Your own
  numbers will differ; that is why Arsenale shows your measured cost next to
  the estimate, and labels every suggested saving "est.".

## How Arsenale uses it

The Savings page applies the rules to your own finished runs and multiplies
each run's measured cost by the rule's saving. A run without a price shows
"n/a", never a made-up amount. The rules only suggest; nothing is changed for
you. You mark a suggestion "adopted" yourself, after changing the model line
by hand, and the page then measures the cost per done weight-point of that
work before and after.
