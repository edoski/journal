# Learning records

One scope is one course or coherent learning interest. Schema 5 keeps observations separate from current assessments, reviews, unfinished tasks and optional reusable knowledge. The helper owns versions, observation handles, the observation sequence, revisions, timestamps and freshness fields. Forward returned snapshot digests unchanged; do not recompute them from context projections or freshness-normalized records. Use `learning_save` with `scope`, `expected_revision`, the returned `expected_digest`, and a `changes` patch, or pipe the same patch to `scripts/learn save SCOPE --expect REV --expect-digest DIGEST`. Revision 0 creates a scope; read existing state before patching. The digest detects a changed snapshot even if another machine kept the same revision; it does not provide distributed locking.

```json
{
  "title": "Course title",
  "sources": {"worksheet": {"path": "university/course/worksheet.md", "version": "2026-09 edition"}},
  "refs": [{"source": "worksheet"}],
  "topics": {
    "linear-systems": {
      "assessment": {
        "summary": "Recognized coincident equations after a hint",
        "gap": "Independent classification remains untested",
        "observations": ["$attempt"],
        "considered_observations": ["$attempt"]
      },
      "review": {
        "in_days": 2,
        "reason": "Check independent use after assisted success",
        "task": "Classify a new singular system and justify its solution count",
        "observations": ["$attempt"],
        "considered_observations": ["$attempt"]
      }
    }
  },
  "focus": ["linear-systems"],
  "observations": [{
    "as": "attempt",
    "topics": ["linear-systems"],
    "text": "Recognized infinitely many solutions after the hint",
    "origin": "direct_attempt",
    "response": "The two equations describe the same line",
    "assistance": "Pointed out that the equations coincide",
    "refs": [{"source": "worksheet", "locator": "Exercise 5(b)"}]
  }],
  "tasks": {"exercise-5b": {"task": "Exercise 5(b)", "topics": ["linear-systems"], "question": "Justify the solution count for a new system", "assistance": "Coincident equations already explained"}},
  "current_task": "exercise-5b"
}
```

Send changed fields only. Scope metadata survives omission. `sources` and `topics` merge by handle; topic metadata merges. A topic's `assessment` and `review` replace as complete objects (`null` clears one). Store learner interpretations under `assessment`, never flat topic `summary`, `gap` or `status`. Assessment prose fields are `summary`, `gap`, `status` and `uncertainty`; `observations` identifies the supporting evidence. An explicitly uncertain assessment may have no support and remains pending. No numeric mastery score is inferred or validated.

Every replacement assessment/review declares `considered_observations`: the exact distinct evidence handles you reviewed, including contrary evidence, with all supporting `observations` included. Same-patch aliases work in both lists. The helper assigns `assessed_at` and computes `pending`; do not submit either field. An interpretation remains pending when consideration is unknown, its timestamp is historical/unknown, support is absent, or the declaration omits any topic observation or correction connected to that topic evidence or cited support. Cross-topic support does not require unrelated history from the other topic.

Before relying on a pending interpretation for a consequential decision, retrieve the relevant evidence and corrections, then replace it with your supported interpretation and actual considered handles. Partial interpretations may be saved and remain pending. This declaration does not prove attention, understanding or a sound judgment. Ordinary attempts and task checkpoints need no assessment update; unrelated activity does not require reassessment.

Schema-4 migration preserves existing evidence and interpretations, removes the old watermark, and marks historical consideration as `null`. Unknown coverage remains pending until explicit reassessment; never infer consideration from old support or the stored snapshot, and never submit `null` as new consideration.

`observations` appends new events on save and is keyed by handles on read. Submit each event once. Optional `as` names a local alias for that addition; `$attempt` can appear in reference lists in the same patch and is resolved to its assigned handle. Aliases do not persist. Preserve the actual response, assistance, task and uncertainty when diagnostic, without repeating the same prose across fields. Shared observations may name several topics.

Observation `origin` is `direct_attempt`, `self_report`, `tutor_inference`, `external_assessment` or `unknown`; omission means unknown. These labels describe where the evidence came from, not its reliability. Optional `provenance` preserves additional source context as text. The helper assigns UTC `recorded_at`; optional `date` is the known event date, not an invented date copied from the save time. Do not submit `recorded_at`. Missing assistance means unknown, never independent performance. Dates, task, response, assistance and uncertainty must use their canonical date/string types when present.

A real improvement is a new observation. Correct an incorrectly recorded event with a new observation containing `corrects: ["o1"]`, explaining the supported correction. Later learning does not erase an earlier genuine mistake. A tutor's factual error must not become a learner misconception: correct affected assessments, reviews and task assumptions too. A removed task is a completed workflow checkpoint, not evidence of mastery.

Source handles identify cited content. Optional `version` is an established edition/revision label, or null/omitted when unknown. Once cited, the handle's version cannot change; use a new handle for changed content. A path relocation may update the existing handle. References use `source`, optional `locator` and optional short `excerpt`; the helper captures `source_version` and any known `source_fingerprint`. Omit helper-owned fields in new references. Exact values from a retrieved reference can round-trip; invented or mismatched values are rejected. Do not invent versions or copy whole sources into memory. Unknown handles are errors; repair the patch without dropping its evidence.

## Reusable understanding

Optional `knowledge` stores the agent's useful current understanding independently of exercises and learner judgments. Each agent-chosen key is 1–64 lowercase letters, digits, underscores or hyphens, beginning with a letter or digit. An entry requires nonempty `text` in its resulting state. Optional fields are existing `topics`, source `refs`, nonempty `attribution` and `uncertainty` strings, and unique nonempty-string arrays `conflicts` and `aliases`. Aliases capture established alternative terms, including another language, for discovery; they are not a new taxonomy. Missing knowledge means none; no migration or initial course survey is needed.

```json
{
  "knowledge": {
    "notation": {"text": "The lecturer uses g where the textbook uses h.", "attribution": "Learner report", "uncertainty": "The correspondence has not yet been checked in the slides", "aliases": ["notation correspondence"]},
    "resource-context": {"text": "The inspected sample uses continuous time. Whether it reflects the current lab remains unresolved.", "topics": ["linear-systems"], "refs": [{"source": "worksheet", "locator": "Introduction"}]}
  }
}
```

Retain attribution and qualifications; use their explicit fields for consequential qualifications that must survive unrelated edits. They can also remain in prose when that preserves the meaning clearly. Read all fields together; `text` alone is not the complete claim. A source handle establishes a reference, not truth; cite only what actually supports the claim. A resource list cannot certify a later report about what a lecturer said. Source versions are captured on new references, including unknown versions. Use on-demand fingerprint inspection from [lifecycle.md](lifecycle.md) when source freshness matters. A byte fingerprint establishes identity, not authority, and older unverified references remain unknown. Read the relevant material when the decision warrants it.

An omitted entry survives; an object patches only supplied fields; `"key": null` removes that entry. Optional fields accept null to clear them; `text: null` and top-level `"knowledge": null` are invalid. For example, `{"knowledge":{"notation":{"text":"Revised correspondence"}}}` preserves existing attribution, uncertainty and links. Explicitly resolve or clear a qualification only when the evidence supports doing so. Fetch the complete entry before revising its meaning; a search excerpt or remembered paraphrase is insufficient. Rename, split or merge through field patches/additions/removals in one patch. Clear or replace links in the same patch when removing referenced topics or sources. New sources/topics and knowledge can be saved together. Completing a task preserves knowledge.

When contrary evidence matters, inspect the relevant basis and adjudicate its authority and applicability. Newer information is not automatically truer: the learner can clarify their own intent, while a disputed exam requirement may need the current official source. Preserve unresolved disagreement and its practical consequence. Replace the affected understanding without discarding unrelated facts or caveats; remove obsolete duplicate entries when known. Search for a duplicated consequential claim when there is reason to suspect one, not as a routine memory audit. Update affected task assumptions in the same patch when needed. If a real learner observation was misrecorded, append its linked correction separately; changing knowledge must not manufacture attempts or automatically revise mastery/considered evidence.

Keep useful local understanding, not whole lessons or textbook material that is easy to reconstruct. There is no mandatory taxonomy, course map, background reflection or knowledge archive. Current knowledge supersedes older conversational summaries after retrieval; already-running clients can retain stale context until a meaningful refresh. Use the receipt after a successful save. On stale revision, fetch the affected current entries and reconcile before retrying; uncertain completion requires checking actual state before resubmission.

Use `context SCOPE --knowledge '["key1","key2"]'` for whole entries, or `--knowledge '[]'` for a compact paged index. General `--query` searches knowledge and other metadata, returning discovery-only candidates. Automatic context is bounded and may omit relevant entries for size; omission does not imply irrelevance or absence. Exact reads return complete entries or a size error, never clipped qualifications. See [retrieval.md](retrieval.md) for budgets and independent pagination.

## Tasks, reviews and publication

Tasks use stable logical keys across providers. Fields patch independently: omitted fields survive, null clears a field, and a null task removes it. Nested `frame` and `plan` replace as units. Other tasks survive; removing the current one clears its pointer. `current_task` is the default continuation, never an override of the learner's request. Keep the enduring task label, original purpose, current question and actual assistance clear. See [lessons.md](lessons.md) for frames and routes. Temporary handoff instructions belong in that task's `instructions`.

New reviews require `due: "YYYY-MM-DD"` or `in_days`, nonempty `reason` and retrieval `task`, at least one supporting observation, and the exact `considered_observations`. Optional `retain: true` keeps lasting fundamentals in view. The tutor chooses pacing; the helper computes dates and caps a new interval before an upcoming exam. Use the resolved date from the receipt; do not resend an unchanged interval. Record meaningful review performance as an observation before revising its schedule. Migrated reviews with missing support or rationale remain pending.

`journal_activity` uses the exact established Journal label; an unmapped course is not zero study. `plan [SCOPE] --days N --horizon N` combines assessments, evidence, reviews, assessment context and recorded effort with scheduled study windows. Planning also bounds observation support (adjust with `--evidence-budget`), reports `evidence_selection`, and marks reviews with `support_in_context`; expand omitted evidence before relying on a recommendation. Windows are not confirmed availability; hours are not mastery.

Use the receipt's revision and digest for the next patch. Validation rejection means the patch was not published: repair the identified shape or reference without dropping evidence. A revision/digest conflict requires retrieving the affected state and reconciling concurrent changes. Interrupted execution or a missing receipt has uncertain completion: inspect whether the event committed before resubmitting it. Do not retry every error as though nothing happened. A successful receipt needs no confirming read. For a requested standalone artifact outside Pi's automatic lesson, pipe Markdown to `scripts/learn note --title 'Title'` and link its path; do not duplicate the mirrored lesson.
