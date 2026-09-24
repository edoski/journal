# Generic learning memory: implementation plan

20 September 2026. Ready for implementation against production baseline `b57b5fe`. This integrates the [investigation](learning-generic-memory-investigation-2026-09-20.md), [research](learning-generic-memory-research-2026-09-20.md), the user's rejection of a course-specific memory model, and the subsequent discussion of token cost and correction. It supersedes the investigation's recommendation to run more comparisons before deciding. Implement the complete design below; validation happens during delivery and is not a prerequisite research phase.

## Objective and decision

Let agents retain useful, evolving understanding through ordinary study, discover it later, and correct it without requiring the learner to manage memory. Meaning and organization remain agent-authored. Persistence, selection limits and revision checks are deterministic.

Keep the existing JSON store, Python owners, two Pi memory tools, native clients, source identities and learner-evidence contracts. Add **one optional `knowledge` map to an existing course/interest record**, containing independently editable prose entries. Integrate it with the existing save, context and planning interfaces. No separate files/database/service, curriculum ontology, required module fields, confidence scores, progress engine, automatic graph construction or recurring reflection model.

This is the concrete implementation of the earlier two-part proposal: general memory guidance plus reliable retrieval. A single map is preferable to endorsing arbitrary notes separately at scope, topic and source level: it provides one address/update/search rule, small independent units, and a lifetime independent of immutable evidence-topic identities. Its keys are addresses chosen by the agent, not predefined categories. A single growing course essay would be simpler to serialize but harder to retrieve and revise selectively.

The existing schema-5 observation/assessment fixes and Pi delivery behavior remain intact. General knowledge never substitutes for actual learner attempts, preferences or current-task state.

## 1. Representation and publication

Use this optional additive field within schema 5:

```json
{
  "knowledge": {
    "notation-and-resources": {
      "text": "The learner reports that the lecturer uses g for impulse response and Atlas uses h. Current labs use discrete time; older continuous-time sheets should not set current conventions. Lumen supplies current conventions; Atlas helps with derivations.",
      "topics": ["linear-systems"],
      "refs": [{"source": "overview", "locator": "Available resources"}]
    }
  }
}
```

Only nonempty `text` is required. The example's names are illustrative; no fields for course modules, fact types, certainty or mandatory dates are introduced. Attribution, qualifications and unresolved contradictions belong naturally in the text. `topics` is an optional routing hint to existing topics; omit it when no useful association exists. `refs` uses the current source-reference contract, including an optional locator and helper-captured source version. A reference must support the relevant claim; do not cite a resource list as proof of a later learner-reported lecturer correction.

Entry keys follow the existing short lowercase handle convention, maximum 64 characters. Validate the entry envelope (`text`, optional `topics`, optional `refs`), while leaving the prose unrestricted. Missing `knowledge` means an empty map. This additive field does not require rewriting existing records or increasing the schema version. Do not implement legacy aliases for `note`, `notes`, `understanding` or similar arbitrary fields.

Extend ordinary `save` semantics:

- An omitted entry survives unchanged; a supplied object replaces that entry completely; `null` removes that entry. A top-level `knowledge: null` is invalid, preventing accidental whole-store clearing.
- Creating, renaming, splitting or merging entries uses additions/replacements/removals in one normal patch. No special operations or tools are needed.
- Existing revision checks, locking, atomic publication and no-op revision behavior cover the whole patch. Source creation, task completion, a real observation correction and a knowledge update may be grouped together.
- Validate references against the completed patch, so new sources/topics and knowledge can be created atomically. Capture referenced source versions on new/replaced entries; callers do not manufacture helper metadata. Existing recursive citation checks must recognize knowledge references when protecting source editions.
- Removing a referenced topic/source requires clearing or replacing its knowledge references in the same patch. Removing a task never deletes knowledge. Knowledge has no required task links or note-to-note dependency graph.
- Keep current interpretation only in this map. Remove obsolete entries from current retrieval; retain the source or actual observation when it matters. Do not add an append-only knowledge archive, tombstone model or per-sentence history service.

Provenance is not truth certification. A valid source handle proves only that the reference exists; captured versions do not detect silent changes to file bytes. The agent must inspect material when warranted.

## 2. Retrieval and explicit cost boundaries

Extend `context` and `learning_context`; do not create new tools or top-level commands. Add `knowledge`, `candidate_offset`, and `knowledge_budget` parameters, with CLI spellings `--knowledge`, `--candidate-offset`, `--knowledge-budget`. The latter is measured in **UTF-8 bytes**, never labeled tokens. Pi maps the parameter names explicitly to the CLI flags and retains argument-array execution.

Initial bounds are engineering defaults, not empirically optimal tokenizer settings:

| Operation | Default bound | Behavior |
| --- | --- | --- |
| Additional knowledge in ordinary study or a single-course plan | 4,096 serialized UTF-8 bytes | Whole entries only; includes envelope, reference metadata and any newly included source-location metadata |
| Query candidate page | 8 candidates and 4,096 serialized UTF-8 bytes | Discovery descriptors only, with short explicitly incomplete excerpts |
| Knowledge index page | 20 descriptors and 4,096 serialized UTF-8 bytes | Handles and entry sizes; no prose bodies |
| Explicit exact knowledge read | 8,192 serialized UTF-8 bytes | Return the entire requested set or a clear size error; explicit budget override available |

These limits bound this feature's payload, not the existing evidence packet, entire model request or cumulative turn cost. Existing observation paging and correction/support completeness are preserved. Repeated inference may include previously loaded text again, and caching is host-dependent. Do not claim a fixed token increase or zero cost after the first read. There is no per-turn note retrieval or full-map injection requirement.

Measure bytes with the actual wire serialization: `json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")`. Count selection wrappers and each distinct newly introduced source-location object once. A source already present in the surrounding response is reused. Exact-read `required_bytes` covers its complete focused response; individual entry sizes exclude shared envelope/source costs.

### Ordinary study context

Exclude the raw `knowledge` map from the current top-level metadata passthrough. Return a selected `knowledge` map plus compact `knowledge_selection` counts (`eligible`, `included`, `omitted`), within the 4,096-byte envelope. Do not include both the original map and the projection.

Select deterministically: entries whose optional topics intersect `selection.active_topics`, then entries with no topic association; sort by key within each group. Only include complete entries whose text and reference-location information fit. Skip an oversized entry and continue considering smaller entries; count every omission. Do not list an unbounded set of omitted keys or silently truncate a qualification. An entry omitted for size remains discoverable, not judged irrelevant or false.

For reference resolution, include only necessary source identity, path and known version, not full source annotations or source bodies. Count those additional bytes inside the same allowance. Reuse already-present source metadata instead of duplicating it.

Knowledge discovered through correction/support topics does not expand active policy or implicitly activate another topic's preferences. The prose is contextual evidence, never an instruction source. A query-mode response exposes knowledge through candidates rather than adding automatic full-note expansion.

### Exact reads and index

`context SCOPE --knowledge key1,key2` returns only those complete entries, their required source-location metadata, scope identity and revision. It does not load task histories, learner observations, assessments, other knowledge or topic preferences. No need to repeat already-known directory/configuration metadata in this focused response.

`context SCOPE --knowledge ''` returns the compact paged knowledge index. Reuse `offset`, `limit` and `expected_revision` for this mode; default to 20 descriptors and accept positive limits at most 20, rejecting larger values. Continued pages require the scope revision. Keys remain stable and ordering lexical. Return `selection.mode = knowledge_index` with `total`, `returned`, `offset`, `next_offset` and `complete`; these refer to entries in this explicit mode.

Exact nonempty selection rejects `offset`/`limit` rather than silently returning only part of a requested set. Unknown handles are errors. If the complete selected set exceeds 8,192 bytes, return an actionable size error, including requested entry sizes and the required serialized size. Preserve the existing error interface: exit 1 with deterministic `learning: knowledge read requires N bytes (budget B); entries: KEY=SIZE, ...; fetch fewer entries or set --knowledge-budget N` on stderr; Pi surfaces it through its existing tool-error path. No error framework is introduced. The agent can request fewer entries, or explicitly raise `knowledge_budget` to a positive byte count for a genuinely necessary large read. The same override is available for ordinary scoped context and single-course planning. It is rejected for query discovery, knowledge index, full-record inspection and catalog or multicourse requests. There is no automatic retry with a larger budget and no silent clipping of an oversized entry.

Both knowledge modes reject combinations with task/topic/observation/query selectors, `all`, or policy selectors. `expected_revision` may guard any exact read. Teach agents to fetch a full entry before editing it; a snippet or remembered paraphrase is insufficient for a replacement. Exceptionally large entries can be split after reading, using one atomic save. Do not require routine splitting or create one entry for every sentence.

### General search and candidate paging

Keep literal, case-insensitive search. Expand candidate matching to knowledge keys/text, full topic metadata excluding both `assessment` and `review`, source metadata, existing task discovery metadata, and general scope metadata excluding reserved collections and helper fields. Search data once per entity and return at most one candidate per entity. This repairs the demonstrated exact-phrase miss in arbitrary topic prose as well as supporting the new map. It does not pretend to provide embedding-based paraphrase matching; agents may reformulate a query or inspect the small index.

Replace the current unpaged candidates map with a paged mixed descriptor list:

```json
{
  "candidates": {
    "items": [{"kind": "knowledge", "key": "notation-and-resources", "excerpt": "…", "discovery_only": true}],
    "offset": 0,
    "total": 17,
    "next_offset": 8,
    "complete": false
  }
}
```

Use deterministic kind/key ordering. Excerpts contain at most 256 UTF-8 bytes at valid text boundaries and are visibly discovery-only. Preserve exact handles; do not cut them into invalid addresses. If even a single descriptor cannot fit, return an explicit size error rather than an empty page with a nonadvancing cursor. Do not treat snippets as complete support for a claim or as editable originals.

`candidate_offset` is query-only and has its own cursor. A nonzero candidate cursor requires `expected_revision`, just like existing observation pagination. Keep observation `offset`, `limit`, `total`, `complete`, support expansion and `next_offset` unchanged. Candidate completeness never implies evidence completeness or vice versa. Remove duplicate observation candidates: returned observations already identify the matched evidence. No candidate hit automatically loads a whole note, topic history, file body or unrelated preference.

On revision-pinned query continuations, permit each cursor to equal its stream's total, producing an empty completed stream. While advancing candidate pages, set observation `offset` to the known observation total; while advancing evidence, set `candidate_offset` to the known candidate total. An explicitly exhausted evidence stream omits its observation payload and associated interpretations/support expansion, so it cannot resend a large supporting history or expose an unsupported assessment. This continuation behavior must not suppress assessments/support in ordinary study context merely because an initial evidence selection is empty. A page stopped by its byte allowance advances by the actual number returned, never the configured maximum. Scope revision changes invalidate both cursors.

All maintained CLI/Pi consumers and references adopt the new candidates shape together, without a compatibility alias. Advanced raw inspection through `--all` remains explicit and outside ordinary retrieval budgets; it must not become the fallback for every missed query.

## 3. Correction, uncertainty and revision

Add a short general lifecycle to the canonical skill, with detailed mechanics in its references:

1. Retain local understanding when it will help future assistance or be costly to reconstruct. Avoid copying ordinary textbook material, entire lessons or unchanged conversation summaries.
2. Keep useful attribution and uncertainty in the prose: inspected source, learner report or tentative interpretation. Do not manufacture certainty to fit a field, and do not request a course intake merely to populate memory.
3. When a user correction, changed source, new example or contradiction matters, retrieve the complete relevant entries and inspect the basis needed for the present decision.
4. Reconcile authority and applicability; newest is not automatically truest. A learner's correction of what they meant is different from a disputed external requirement. If the conflict cannot be resolved, retain the disagreement and its practical consequence instead of choosing silently.
5. Replace the mistaken understanding while preserving unrelated useful facts and caveats. Consolidate or split only when it improves clarity. Search for a duplicated consequential claim when there is reason to believe it was stored elsewhere; do not audit all memory routinely.
6. Update known affected task assumptions or interpretations in the same normal patch when necessary. If actual learner evidence was misattributed, append the existing linked observation correction separately. Do not encode a course fact as a fake learner attempt or automatically change assessment coverage/mastery when knowledge changes.
7. Use the successful receipt; do not reread just to confirm a deterministic save. On stale revision, reread the affected current entries and reconcile before retrying. If completion was uncertain, check actual state before resubmission.

Consequential corrections should be explained naturally when they change the teaching. Routine bookkeeping remains hidden. Current knowledge supersedes older conversational summaries; fresh sessions, actual context loss, changed activity, explicit contradictions and consequential decisions justify a refresh. Unchanged turns do not. Simultaneous already-running clients can still retain stale context until they refresh; no per-turn polling or transcript-rewriting mechanism is introduced.

Verification is proportional to the decision. Skipping exam material based on an uncertain claim merits checking the relevant source; repeating an established notation correspondence does not require rereading every resource. The system cannot guarantee discovery of a false belief that is never challenged. Retrieval labels, citations and revisions must not be presented as proof of truth.

## 4. Planning and teaching behavior

For `plan SCOPE`, use the same bounded knowledge selector as study context. The relevant topics come from unfinished tasks, their active task-context parts and the scope focus. They are retrieval hints, not a request to activate all their preferences. Include up to 4,096 bytes of whole knowledge entries, with omission counts, alongside the existing evidence/source-aware plan.

For a multi-course plan, include per-course knowledge counts only, then let the tutor fetch the relevant course's index/entries before making a decision that depends on them. Do not multiply a per-course prose allowance across the entire catalog or add a round-robin scheduler just for note allocation. Planning continues using the read-only Journal interface. It does not maintain a second knowledge store or compute module mastery.

Revise the lesson-orientation instruction: enduring reusable understanding belongs in knowledge; task-specific goals, routes, purpose, assistance and continuation details remain in tasks. A request for a rough picture does not automatically require a formal route or a persistent orientation task. A useful course map may be drawn from current understanding when asked, but is a provisional view, not a compulsory structure.

If the user explicitly asks to keep a standalone course map or other document, publication may produce that artifact and register its source reference. Automatic Pi lesson mirroring remains a reading surface, not the canonical general-memory mechanism. Do not index every generated lesson or create automatic dashboards.

For scope discovery, tool descriptions state clearly that a catalog call omits evidence selectors/limits. Keep exact keys agent-internal; do not ask the learner to supply slugs or IDs. Make changed-path validation errors identify the offending field and allowed action, including helper-owned metadata and unknown references. Do not add fuzzy title aliases, retries that guess semantics or a new wrapper for every command.

## 5. Ownership and implementation order

| Slice | Files/owner | Complete outcome |
| --- | --- | --- |
| 1. Durable prose contract | `learning/records.py`, focused record tests | Optional map validation, atomic entry replacement/removal, reference/version handling, no-op/conflict behavior, task-independent lifetime |
| 2. Selective retrieval and search | `learning/retrieval.py`, retrieval tests | Bounded whole-entry projection, exact reads, paged index, searchable prose, separately paged candidates, unchanged evidence/policy guarantees |
| 3. Native interfaces and planning | `learning/__main__.py`, `learning/pi.ts`, `learning/planning.py`, CLI/Pi/planning tests | Matching parameter semantics, focused output, planning knowledge access, precise errors, no extra tool or service |
| 4. Teaching contract | canonical skill, records/retrieval/course/lesson references, README and architecture docs | Natural retention/revision, no compulsory task/map, context reuse, source/uncertainty discipline and ownership explained consistently |
| 5. Integrated delivery | behavioral acceptance documentation and implementation report | Synthetic native continuity/correction checks, quality gates, independent review and checked installation |

Keep validation/publication owned by `records.py` and context selection by `retrieval.py`. Reuse small pure helpers where behavior is genuinely shared with planning; do not introduce a generic memory framework or pluggable backends. Python owns semantics; adapters only expose them. Existing Pi publication, opening-failure fallback, quiz behavior and corrections are unaffected except where context/save interface tests need updating.

## 6. Acceptance and completion criteria

Write focused behavior tests at the changed interfaces, not structural transition tests. Required cases:

- Related knowledge survives task deletion and an unrelated active topic; a literal phrase in its prose is discoverable and exact retrieval returns the original complete entry.
- A correction preserves an unrelated notation fact; separate entries omitted from a patch survive; rename/split/merge is atomic; null removes only the selected entry.
- Learner reports and tentative prose persist without fabricated observations, assessment support or mandatory topics.
- Same-patch source creation works; unknown/dangling refs fail; cited edition protection and source-path relocation retain existing semantics.
- Concurrent saves fail by revision rather than overwriting; unchanged replacements retain the revision; uncertain receipts can be reconciled without duplicate state.
- Ordinary knowledge projection stays within its serialized byte allowance, counting references; no excerpt silently removes a negation or caveat. An oversized exact entry has an explicit retrieval path.
- Candidate and knowledge-index pagination are bounded, deterministic and revision-checked, including Unicode text and nonadvancing-page prevention. Candidate and observation completeness remain distinct.
- Knowledge links/search hits do not activate incidental topic preferences. Existing observation correction closure, support retrieval and considered-evidence semantics keep their current behavior.
- Single-course planning uses relevant notes under one bound; multi-course planning does not load all course prose.
- CLI and Pi expose the same selection/errors/receipts. Ordinary grounded follow-ups require neither a save nor a memory reload.

Run the existing learning gate during implementation and the appropriate final repository gate. Perform independent Standards and Spec review of a fixed implementation range. Validate with a small synthetic native dialogue: form a tentative understanding, correct one part, complete the task, restart with a different activity, then ask a paraphrased question needing both the revision and unaffected information. Include a case where notes should remain unused and an unresolved-source conflict that must remain uncertain. Use existing authenticated hosts, never real learner data or new account configuration merely to pass acceptance.

Record actual tool rounds, errors and token usage when available, but do not postpone implementation for comparative benchmarking or claim these samples prove general performance. A discovered correctness failure is repaired before completion. An unavailable native host or GUI is reported explicitly rather than used to claim all-client coverage. No benchmark platform, standing evaluator agent or recurring paid sweep is added.

## 7. Rollout and boundaries

This is additive to schema 5; missing knowledge remains empty and existing records need no migration. Before delivery, inspect whether the real store already contains a conflicting `knowledge` field; if it does, preserve exact bytes and reconcile that concrete collision explicitly rather than guessing a conversion. Do not mine historical conversations or reinterpret assessments/tasks into knowledge during deployment. Future study populates it naturally.

Do not import the synthetic experiment's notes into the real vault. Other existing arbitrary metadata remains stored and searchable; it is not maintained as a second automatically synchronized knowledge representation. No legacy adapters or fallback state formats are introduced.

Verify installed skill/launcher links and the CLI/Pi tool contract against the final source. Fresh sessions load the revised skill/tool definitions; an already-running Pi session may need reload/restart. Keep this as a one-time deployment note, not a recurring study ritual. Publish a concise implementation record with tested behavior, bounded-cost semantics and remaining model limitations.

The completed system is not a truth oracle and does not learn by updating model weights. It gives the agent a small, editable, discoverable record of useful understanding, while keeping token exposure deliberate and corrections part of ordinary study. No additional design decision or pre-implementation measurement is required to begin this plan.

### Implementation budget decision

The automatic default is 4,096 bytes, adjustable through the same `knowledge_budget` argument used for exact reads. This is an engineering default, not a proven optimum or token guarantee. The native probe’s three revised notes use 1,515 bytes including their selection envelope, before source locations. Both the original 2,048-byte proposal and the revised default fit them; the larger allowance leaves room for Unicode, provenance and ordinary growth. Only actual selected material is returned, so raising a ceiling alone does not increase payload size. This bounds additional knowledge, not the entire context or model request.
