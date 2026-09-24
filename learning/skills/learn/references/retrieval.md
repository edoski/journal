# Retrieval

Five read verbs, each with its own small option set. In Pi they are the `action` values of `learning_context`; on the command line they are subcommands of `scripts/learn`. Option names match: `--expect` is `expected_revision`, `--candidate-offset` is `candidate_offset`, `--knowledge-budget` is `knowledge_budget`, `--evidence-budget` is `evidence_budget`, and knowledge keys are positional (`keys`).

| Verb | Returns | Options |
| --- | --- | --- |
| `resume [SCOPE] [--task KEY]` | task (frame, plan), `briefing`, task index, linked and recent evidence, relevant knowledge, preferences | `--knowledge-budget`, `--evidence-budget`, `--concepts`, `--domains`, `--activity` |
| `catalog [SCOPE]` | no scope: scope list with paths and workspace preferences; scope: `topic_index`, all `sources`, `task_index`, `knowledge_keys`, route position, counts | none |
| `search SCOPE QUERY` | matching evidence plus `candidates` (knowledge, topic, source, task, scope handles with excerpts) | `--topics`, `--limit`, `--offset`, `--candidate-offset`, `--expect`, `--evidence-budget`, policy selectors |
| `knowledge SCOPE [KEY...]` | whole entries with their source locations; no keys: paged index of keys and sizes | `--budget` (exact reads), `--limit`, `--offset`, `--expect` (index) |
| `evidence SCOPE --topics a,b` or `--observations o1,o2` | topic histories, or exact observations with their complete correction groups | `--limit`, `--offset`, `--expect`, `--evidence-budget`, policy selectors |

A scope argument may be the handle or, once, the course title or alias. `resume` with no scope selects the most recently updated scope and includes `scopes` so you can switch. Selectors accept JSON arrays or comma-separated handles; arrays preserve labels containing commas.

## What resume selects

The selected task is the requested `--task`, else `current_task`, else the only task. Its topics, the topics of its frame and current plan node, and the plan node's direct prerequisites define the activity. `resume` seeds at most 24 observations, task-linked first and then newest, and expands each to its complete correction group. Interpretations (`assessment`, `review`) are included only with their whole support group. Everything fits a 12,288-byte evidence allowance; groups that do not fit are omitted whole and listed in `selection.evidence.omissions` with their sizes.

Knowledge entries associated with the active topics, the current route node, and their direct prerequisites are included whole, entries carrying `attribution`, `uncertainty` or `conflicts` first, within 4,096 bytes; omitted keys appear in `selection.knowledge.omissions`. The `briefing` projects `goal`, `exam`, `coverage`, `course_context`, the route position, active topics and source handles within 4,096 bytes and names any omitted field. Prerequisite and route topics supply knowledge but do not activate their preferences; only the active topics, explicit `--topics`, and explicit `--concepts`/`--domains`/`--activity` select policy.

All budgets are serialized UTF-8 bytes, not tokens. Nothing is clipped: an item either appears whole or is listed as omitted. Omitted does not mean irrelevant. `selection.evidence.scope_complete` says whether every saved observation is present; `complete` refers to the selected stream only.

## Reading more

- Older history for a topic: `evidence SCOPE --topics KEY --limit N`, chronological, continued with `--offset N --expect REV`. Without `--limit` it returns the newest 24.
- One event and its corrections: `evidence SCOPE --observations o7`. Exact reads are unbounded unless you pass a budget.
- A fact you intend to change: `knowledge SCOPE KEY`. Exact reads default to 8,192 bytes and fail with the required size rather than clipping; pass `--budget N` deliberately.
- Something you half-remember: `search SCOPE "terms"`. Matching is phrase or accent-insensitive token set, including stored aliases. Candidates are discovery handles with excerpts, never complete entries; read the match whole before relying on it. Evidence and candidate cursors advance independently under the same `--expect`.
- Another course: `discover "terms"` returns handles across scopes. It transfers nothing; compare notation and assumptions before drawing an analogy.
- Everything: `inspect SCOPE` returns the full record. Use it for memory questions, not routine teaching.

Retrieve for a fresh session, a changed activity, a relevant contradiction, or a consequential decision such as declaring independence or skipping material. Short follow-ups reuse what is already loaded. Loaded text stays in later model requests until the host compacts; fewer calls does not mean zero repeated cost.
