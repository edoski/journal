# Minimal calibration memory

> Historical investigation: implementation descriptions and proposals below reflect an earlier snapshot and are not the current runtime contract. See the [current learning README](../../../learning/README.md) and [behavioral acceptance cases](../behavioral-acceptance.md). Research claims retain their stated dates and limitations.

Existing fields suffice. No schema migration, graph, database, mastery score, or provider-specific record is needed. This is a writing/retrieval convention for the canonical learn skill, not a new storage subsystem. Static inspection only; no model runs or real-vault changes.

## Representation

| Existing field | Minimal responsibility |
| --- | --- |
| Topic `summary` | Last independently demonstrated foundation relevant to this task, with date and narrow scope; explicitly unknown when absent. Preserve this across assisted successes. |
| Topic `gap` | Current observed breakdown and uncertainty about its cause; distinguish learner evidence from the tutor's hypothesis. |
| Topic `evidence` | Append only new meaningful observations: date, task, response, assistance, uncertainty, and source when relevant. Short prose is sufficient; objects are already allowed. |
| Scope `active` | Exact unfinished task, question actually asked and awaiting an answer, and relevant assistance already supplied. Clear when resolved. |
| Scope `focus` | Existing topic keys needed for this task; controls default topic retrieval. |
| Scope `teaching` | Stated lasting course preferences, not an inferred ability level or session diagnosis. |

The skill already requests most of this in [SKILL.md](/Users/edo/dev/python/journal/learning/skills/learn/SKILL.md:8). The useful addition is making `summary` preserve the independent foundation explicitly and keeping observed breakdown separate from inferred causes. Do not force a new probe into every explanation or invent a pending question that was never asked.

Example patch after teaching and asking the displayed pending question; dates and content are illustrative:

```json
{
  "focus": ["linear-systems"],
  "topics": {
    "linear-systems": {
      "summary": "2026-09-18: independently interpreted Ax=b and solved a nonsingular 2x2 system; singular-case reasoning not yet demonstrated independently.",
      "gap": "Said det(A)=0 means no solution. Whether the gap is rank or consistency is untested.",
      "evidence": [
        "2026-09-18; classify x+y=2, 2x+2y=4: initially said no solution without help; after a hint that the equations coincide, said infinitely many. Assisted correction; transfer untested. Source: exercise 3."
      ]
    }
  },
  "active": {
    "task": "Distinguish singular consistent and inconsistent systems.",
    "question": "For x+y=2 and 2x+2y=5, how many solutions are possible, and why?",
    "assistance": "Already explained coincident equations in the previous example; this follow-up is not evidence of delayed independent recall."
  }
}
```

Supply only changed fields. Existing `teaching` survives omission. The example's foundation must already be evidenced; never manufacture it to fill the field. If missing, write "No independent foundation demonstrated yet" at the relevant scope.

## Retrieval and persistence constraints

[memory.context](/Users/edo/dev/python/journal/learning/memory.py:146) returns full scope metadata, including `active` and `teaching`, plus selected topics and the complete topic-key index. It omits coverage and truncates each selected topic's evidence to the last three observations. It does not truncate `summary` or `gap`. Missing focus topics are silently skipped; keep focus aligned when saving.

The concrete failure to avoid: storing independent evidence only in the history. Three later assisted observations hide it from routine context. `earlier_evidence_count` signals omitted history but says nothing about its meaning. Preserve decisive independent evidence and unresolved misconceptions in the compact summary/gap. This is a necessary skill convention, not a backend defect requiring a migration. Old records without that summary may require one exceptional full read.

`context SCOPE --topics key1,key2` changes selection but still returns only three observations per topic. `context SCOPE --all` exposes full history for exceptional reconciliation ([CLI](/Users/edo/dev/python/journal/learning/__main__.py:65)); there is no full-history single-topic CLI option. Do not add one without an observed need.

[memory.save](/Users/edo/dev/python/journal/learning/memory.py:195) merges topic fields but appends supplied evidence; never resend observations copied from context. Scope `active` replaces its entire object, so supply its complete current contents when updating it. Omit it to preserve it, or use null to clear it. Revision checks and locking reject concurrent stale writes; reread and reconcile rather than replaying stale conclusions.

[planning.plan](/Users/edo/dev/python/journal/learning/planning.py:13) returns unfinished `active` work and reviews, but not topic summaries/gaps/evidence. A plan is insufficient evidence for a teaching decision: fetch context for the selected topic before continuing. No plan expansion is needed because the skill already requires that lookup.

The loose JSON shape accepts this representation today ([validation](/Users/edo/dev/python/journal/learning/memory.py:48)). It cannot enforce truthful independence labels or useful uncertainty: those remain tutor decisions. Adding mandatory subfields would cost tokens and migration work without establishing truth.

Codex/Claude installation shares the canonical skill through symlinks ([installer](/Users/edo/dev/python/journal/learning/install.py:49)); Pi loads that same skill ([runtime](/Users/edo/dev/python/journal/learning/runtime.py:64)). Mounted Claude usage reads it from the repository ([instructions](/Users/edo/dev/python/journal/learning/clients/claude/teach/SKILL.md:6)). Provider transfer depends on access to the same record root and current skill, not on native conversation history. These code paths are inspected, not cross-provider runtime verification.

## Minimal acceptance scenarios

1. **Assisted correction:** retain the narrower independent foundation; record the hint and resulting response; do not mark the current task independently understood.
2. **History rollover:** after three newer observations, routine context still exposes the dated independent foundation and unresolved breakdown through summary/gap.
3. **Provider handoff:** a fresh tutor with only focused context can identify what is demonstrated, what remains uncertain, the exact pending question, and prior assistance. It resumes without inventing a new question or revealing another hint.
4. **Resolution/conflict:** successful resolution explicitly clears active; a stale writer cannot restore an obsolete pending question. Unrelated topics and preferences remain intact.

Existing tests cover merge/append/replacement, focus retrieval, history truncation, and stale concurrent writes ([tests](/Users/edo/dev/python/journal/tests/learning/test_memory.py:11)). They do not establish pedagogical quality. Check these scenarios against concise transcript fixtures during skill validation; no storage tests are necessary unless storage behavior changes.

Token cost stays bounded by a compact summary/gap and current active work, plus three observations per selected topic. Preserve minimal intentional overlap between the durable summary and append-only evidence to survive truncation. Avoid transcripts, prerequisite inventories, duplicated teaching preferences, and routine full reads. Exact token savings are unmeasured and tokenizer-dependent; the full topic index and unrestricted prose still grow, so topic reuse and concise writing matter.
