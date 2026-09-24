# Learning records

One scope is one course. Its record holds `sources`, `topics`, `observations` (learner evidence), `knowledge` (reusable understanding), `tasks` (unfinished work), an optional course `route`, and course facts (`title`, `goal`, `exam`, `coverage`, `course_context`, `focus`, `aliases`, `journal_activity`). The helper owns revisions, digests, timestamps, observation handles and freshness.

`save SCOPE --expect REV --expect-digest DIGEST` takes a JSON patch on stdin (Pi: `learning_save` with `expected_revision`, `expected_digest`, `changes`). Revision 0 creates a scope. Send changed fields only. A receipt returns `revision`, `digest`, `assigned_observations` and resolved `review_dates`; no confirming read is needed.

```json
{
  "title": "Course title",
  "sources": {"worksheet": {"path": "university/course/worksheet.md", "version": "2026-09 edition"}},
  "topics": {"linear-systems": {"title": "Linear systems"}},
  "focus": ["linear-systems"],
  "observations": [{
    "as": "attempt",
    "topics": ["linear-systems"],
    "text": "Recognized infinitely many solutions after the hint",
    "response": "The two equations describe the same line",
    "assistance": "Pointed out that the equations coincide",
    "refs": [{"source": "worksheet", "locator": "Exercise 5(b)"}]
  }],
  "tasks": {"exercise-5b": {"task": "Exercise 5(b)", "topics": ["linear-systems"], "question": "Justify the solution count for a new system", "assistance": "Coincident equations already explained"}},
  "current_task": "exercise-5b"
}
```

## Patch semantics

| Field | Patch rule |
| --- | --- |
| `sources`, `topics` | merge by handle; an object patches fields; `null` removes the entry |
| `tasks` | patch fields; `null` field clears it; `null` task removes it (and clears `current_task` if it pointed there); `frame` and `plan` replace as units |
| `knowledge` | patch fields; omitted fields survive; `null` optional field clears; `null` entry removes; `text` is required |
| `observations` | a list of new entries only; never edited in place |
| `route`, `course_context`, `topics[k].assessment`, `topics[k].review` | replace as whole objects; `null` clears |
| `title`, `goal`, `exam`, `coverage`, `focus`, `aliases`, `current_task` | replace |

Handles are 1–64 lowercase letters, digits, `-` or `_`, starting with a letter or digit. Use the handles the helper returned, not display titles.

## Observations

Append one entry when the learner actually attempts something or an external assessment happens. Give `text`, `topics`, and when diagnostic `response`, `assistance`, `uncertainty`, `task`, `date` (the known event date) and `refs` with a `locator`. `origin` defaults to `direct_attempt`; use `external_assessment` for graded work. What the learner tells you and what you infer belong in `knowledge` or the task's `assistance`, not in observations. Missing `assistance` means unknown, never independent.

`as` names an alias for this patch: `$attempt` may appear in any `observations`, `considered_observations` or `corrects` list of the same save. To correct a misrecorded event, append a new observation with `corrects: ["o1"]`; the original stays. Your own factual error never becomes a learner observation: fix the explanation, the knowledge and any assessment that relied on it.

## Sources

`sources SCOPE --scan` lists course files under the workspace with suggested handles; `sources SCOPE --add '["lectures/week3.pdf"]' --expect REV` registers them and returns their handles. You may also register `{"path": ..., "version": ...}` directly in a save. A reference is `{"source": handle, "locator": "...", "excerpt": "..."}`; the helper captures `source_version` and any fingerprint. Once cited, a handle's `version` is immutable: new content gets a new handle. A moved file keeps its handle by updating `path`.

## Knowledge

Keep understanding that is useful later and costly to rebuild: notation correspondences, which resource is authoritative for what, conventions the learner chose, unresolved conflicts between documents. Fields: `text` (required), `topics`, `refs`, `attribution`, `uncertainty`, `conflicts`, `aliases` (alternative terms, including other languages, for search).

```json
{"knowledge": {"notation": {"text": "The lecturer uses g where the textbook uses h.", "attribution": "Learner report", "uncertainty": "Not yet checked in the slides", "aliases": ["notation correspondence"]}}}
```

Read the whole entry (`knowledge SCOPE KEY`) before revising its meaning; a search excerpt is not enough. Add distinct facts as new entries rather than rewriting neighbours. Replacing or removing `attribution`, `uncertainty`, `conflicts`, `refs` or a whole entry returns `status: "needs_confirmation"` with the exact before/after and saves nothing. Then either repair the patch so the qualification survives, or resend it with `confirm_qualification_changes: ["key"]` and the current digest because the evidence really resolved it. Never acknowledge blindly. Text-only edits are not guarded; their fidelity is your judgement.

## Tasks and the route

A task is one unfinished activity: `task` (label), `topics`, `question` or `pending_question`, `assistance` given so far, `why` for a detour, optional `instructions` for a temporary handoff, `observations`, `refs`. `frame` holds the stable purpose (`within`, `goal`, `completion`, `topics`, `refs`, `observations`); `plan` is a small route inside the activity. `current_task` is the default continuation, never an override of what the learner asks. On completion set the task to `null` and keep the final attempt as an observation.

`route` is the course-level path, kept small (modules or milestones): `{"status": "proposed"|"agreed", "current": key, "basis": "...", "nodes": {key: {"label", "needs": [keys], "topics", "refs", "done": true}}}`. Dependencies must be acyclic. `resume` returns its position (current node, prerequisites, done nodes, topological order) in the briefing. Details in [lessons.md](lessons.md).

## Assessments and reviews

`topics[k].assessment` is your current interpretation of the learner's understanding of that topic: prose in `summary`, `gap`, `status` or `uncertainty`; `observations` lists the supporting evidence; `considered_observations` lists every observation you actually reviewed, including contrary evidence and corrections. Both replace as a unit. The helper stamps `assessed_at` and computes `pending`: an interpretation is pending when a related observation or correction was not in its considered set. Reconcile a pending interpretation before relying on it for a consequential decision.

`topics[k].review` schedules retrieval practice: `due` or `in_days`, `reason`, `task`, `observations`, `considered_observations`, optional `retain: true`. The helper caps a new interval before the exam and returns the resolved date; do not resend an unchanged interval.

## Failures

- **validation**: the patch was not published; the message names the field. Repair it without dropping evidence.
- **conflict**: the scope changed since you read it; `resume` again and reconcile.
- **needs_confirmation**: nothing was saved; review the listed changes.
- **interrupted / no receipt**: the save may have completed; read before resubmitting an observation.
- **no_save**: this session does not persist; keep teaching.
