# Current preferences

Preferences are shared mutable learner data, separate from historical learning evidence. Context supplies the applicable current rules and policy revision. Update through `scripts/learn preferences --expect REV`, passing a JSON patch on stdin:

```json
{"rules":[{"when":{"domain":"mathematics","activity":"proof"},"values":{"lesson_pace":{"instruction":"Develop one justified inference at a time.","origin":"explicit"}}}]}
```

`when` is a conjunction: all supplied conditions must match. `{}` means global. Optional scalar selectors are `scope`, `topic`, `concept`, `domain`, and `activity`; local `topic` requires `scope`. Reuse actual scope/topic IDs and established semantic labels. Add an intersection only when feedback calls for one, not every possible combination.

Each dimension contains one current `instruction`, `origin` (`explicit` or `inferred`) and optional brief `basis`. Replace the value rather than appending obsolete versions. Use a grounded basis for an inference or non-obvious exception. Suggested dimensions are `response_format`, `explanation_depth`, `research_depth`, `lesson_pace` and `question_style`; record only those needed. Setting a dimension to null deletes it; omitted dimensions and selectors survive. The helper returns the new revision; unchanged effective patches are no-ops.

The current request governs the current task. Preferences apply to the selected activity and `selection.active_topics`, not every topic mentioned in retrieved evidence. A correction link or historical quotation cannot activate new policy. Compatible stored guidance combines. When rules conflict, explicit feedback outranks inference; within the same origin, an established narrower exception qualifies its broader default. Course, domain, concept and activity have no arbitrary total priority. Resolve meaningful ambiguity from the task and feedback; ask an ordinary learning question only if the distinction matters. Reuse the interpretation while the task remains unchanged.

A new general default preserves intentional exceptions. An explicit everywhere-change must remove or revise conflicting scoped values too: inspect `scripts/learn preferences --dimension DIMENSION`, then apply the affected replacements/deletions together. Without `--expect`, `preferences` reads all current policy only for inspection when necessary. Do not reload it before each answer.

One-answer requests stay in conversation. A temporary condition needed for unfinished work can live in the selected task's `instructions`, cleared with that task. Repeated feedback may justify a narrow inferred preference; silence, generic praise or the agent's previous inference does not. Feedback adjusts the learner policy, not the canonical skill or code. Workflow defects require actual maintenance, not a growing list of preferences forbidding bugs.
