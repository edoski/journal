# Relevant learning retrieval: representation decision

> Historical investigation: implementation descriptions and proposals below reflect an earlier snapshot and are not the current runtime contract. See the [current learning README](../../../learning/README.md) and [behavioral acceptance cases](../behavioral-acceptance.md). Research claims retain their stated dates and limitations.

Design only, 18 September 2026. Inspected `learning/memory.py`, `__main__.py`, `planning.py`, canonical learn skill, Pi projection, existing design notes and `tests/learning/test_memory.py`. No real learning records inspected or changed. The SMM preservation statement below comes from existing implementation notes, not fresh verification.

## Recommendation

Keep one atomic JSON document per learning scope. Replace unconstrained topic evidence with addressable observations and optional relationships. Add narrow scope/topic aliases and source references. Assemble context around the actual request, with full relevant evidence accessible directly. Remove the unconditional latest-three rule. This is a small versioned schema change with an explicit one-time conversion, not a new database, provider memory service, transcript archive or mandatory curriculum graph.

The objective is a tutor that recovers the right task and evidence on its first useful lookup. A slightly richer response that avoids guessing, repeated discovery or another assessment can be cheaper overall than a minimal prompt. Storage bytes and token counts alone do not establish subscription savings.

## What the current design supports and loses

`memory.save` merges scope fields, merges topic fields, appends arbitrary evidence values, replaces `active`, and protects publication through a local lock, expected revision, fsync and atomic rename. These are useful foundations. `sources` must contain strings; evidence elements themselves have no validated structure. There are no observation IDs, source links, topic aliases or session relationships.

`context` returns full scope metadata except coverage, topic keys, and focused or explicitly selected topics. It silently skips unknown keys and truncates each selected evidence list to three entries. An older misconception remains stored but cannot be selected by ID, assistance, date or task. `--all` exposes the entire scope. `planning.plan` supplies goals, coverage, active work and reviews, but no learning evidence; it must lead to topic retrieval before teaching.

Existing tests establish safe local writes and preserved append history; they explicitly codify the three-entry cutoff. They do not establish successful alias resolution, relevant historical retrieval, corrected-evidence handling or source/task recovery. Existing claims that a writing convention alone solves retrieval should be revised.

| Option | Concrete benefit | Recurring cost / limitation | Decision |
| --- | --- | --- | --- |
| Current JSON, stronger prose only | Almost no conversion or additional fields | Cannot reliably filter facts inside arbitrary strings; summaries must carry every decisive fact forever | Insufficient |
| Same scope JSON, observation objects and optional links | Addressable evidence, precise corrections, multi-topic retrieval, source/task matching | Small schema and conversion; tutor supplies only relationships it actually knows | Adopt |
| Scope snapshot plus append-only JSONL log | Small incremental writes; easy chronological streaming | Two-store transaction/recovery or replay rules, compaction and index ownership; append order still is not relevance | Defer until measured file size/write cost warrants it |

## Small complete representation

Scope metadata retains `title`, goals, teaching preferences, exam, focus and active work. Add `schema_version`; the existing revision still orders publication. Keep topic keys stable and meaningful. Optional scope aliases resolve course abbreviations; optional topic `aliases` resolve terminology within that scope. Normalize case/spacing for matching, but never merge ambiguous candidates silently.

A topic holds its title, optional parent topic, material references, current summary/gap and review. A parent is enough to express an actual syllabus hierarchy; do not infer prerequisite edges or populate an empty course tree. Coverage remains an explicitly sourced curriculum statement, not evidence of understanding. Preserve existing coverage during conversion; restructure it only from inspected material. Topic identity must survive a title change.

Sources become a keyed map of existing paths/URIs and optional titles. References pair `source` with a human-meaningful locator such as an exercise number, heading or PDF page. IDs pay for reuse and path repair: one file relocation updates one source record. No content hash, permanent external archive or duplicated source text is required. Store short exact task text when needed to resume despite a changed or unavailable source.

Observations become a keyed map. Each new observation requires `topics` and meaningful `text`; it can carry `date`, `task`, `response`, `assistance`, `uncertainty`, material references, optional session grouping and correction links. These fields are optional because teaching-only events, incomplete older records and ordinary attempts have different evidence. Missing assistance means unknown, never independent performance. A supplied `assistance` records both its status and the relevant help. Date is the observed event date; publication time is not a substitute.

Use additional structured fields only when they improve a real query. Topic/source/task links usually make free-form tags redundant. An optional `tags` list can name recurring concerns not represented by topics, such as a particular misconception, but no universal taxonomy is necessary. Do not demand numeric confidence, inferred mastery or a grade for each event.

An optional `session` string groups observations from the same learning episode. It is a portable local identifier, not a provider conversation ID. No session registry is necessary: observations already supply topics, dates and task text; a shared lesson artifact can be referenced through sources. Native history links may be optional convenience metadata, never the only evidence needed for another provider. Cross-provider continuation can retain the same learning episode.

`active` holds the exact current task/question, latest relevant response, assistance already given, topic/source references and optional session identifier. It is a complete mutable resume record, cleared when finished. A future suggested task is not an unanswered question. One scope-wide active record preserves the existing single-continuation model; concurrent publication conflicts remain explicit rather than silently creating competing current tasks.

Topic summaries/gaps remain interpretations. Optional observation references identify their support; an optional as-of date makes their age visible. Do not create a summary invalidation pipeline. Return matching observations alongside the interpretation, and reconcile contradictions before writing another conclusion. The absence of a support link in an imported summary means unverified attribution, not absence of evidence.

Illustrative fragment only; all content and dates are synthetic:

```json
{
  "schema_version": 2,
  "aliases": ["sample course"],
  "sources": {"sheet": {"path": "courses/example/exercises.pdf"}},
  "topics": {
    "singular-systems": {
      "aliases": ["sistemi singolari"],
      "summary": "Distinguished inconsistency from non-uniqueness after help.",
      "gap": "Independent transfer remains unobserved."
    }
  },
  "observations": {
    "o1": {
      "topics": ["singular-systems"], "date": "2030-02-01", "session": "lesson-a",
      "text": "Said zero determinant implies no solutions.",
      "task": "Classify the singular system in exercise 4.",
      "assistance": {"status": "unknown"},
      "refs": [{"source": "sheet", "locator": "exercise 4"}]
    },
    "o2": {
      "topics": ["singular-systems"], "date": "2030-02-03", "session": "lesson-b",
      "text": "Explained that a consistent singular system can have infinitely many solutions.",
      "assistance": {"status": "provided", "text": "Tutor showed coincident equations."},
      "uncertainty": "Immediate follow-up; retention is untested."
    }
  },
  "active": {
    "topics": ["singular-systems"], "session": "lesson-b",
    "question": "For x+y=2 and 2x+2y=4, how many solutions exist, and why?",
    "assistance": "The preceding explanation already showed coincident equations."
  }
}
```

IDs in the example are local handles, not content hashes. The helper can assign IDs to newly appended observations and return them; the agent need not manufacture UUIDs. An observation can refer to several existing topic keys without duplicating its text. Topic deletion must not orphan observations: explicitly reassign them or retain the historical topic.

## Retrieval and correction semantics

The first scope lookup should return compact course identity/aliases, curriculum/topic descriptions, source handles and exact active work. A request mentioning an exercise or concept should search the entire scope's topic names/aliases, source locators, tasks and observation text, including old observations. An unresolved or ambiguous name returns candidates rather than an empty success. The learner's current explicit request takes priority over stale focus.

Once topics are selected, return their relevant dated observations and current interpretation; do not impose a fixed number per topic. Small topic histories can be returned completely. A query narrows by known topic/source/session/date relationships and text matches; recency breaks ties rather than erasing old relevance. A cheap deterministic lexical search supplies candidates; the tutor uses the request and course material to disambiguate semantics. This is not a promise of embedding-level synonym recall. Aliases cover established alternate terms; native file search remains available when vocabulary or curriculum is not yet represented.

When an output truly needs pagination, expose matched/returned counts and explicit continuation, and preserve exact observation lookup. Do not silently label a partial result “complete context.” Include correction targets and corrections with any retrieved observation. No automatic LLM indexing, background retrieval agent, embedding service or re-summarization job is required. Keep already loaded evidence in the current conversation until the task shifts.

Historical misconceptions remain valid observations about the past. A later correct assisted answer changes the teaching interpretation without making the old observation false. A correction instead repairs the record itself: for example, an earlier answer was misquoted or relevant help was omitted. Append a new observation with `corrects: ["o1"]` and an explicit correction text; expose both and identify the earlier claim as corrected. Do not overwrite historical observations or treat every later success as a correction. Conflicting observations without an explicit correction remain uncertain evidence for the tutor to reconcile.

## Conversion and implementation boundary

Use an explicit offline conversion to the new version, followed by v2-only reads/writes. Keep a pre-conversion copy and compare preserved values before publication. No permanent dual reader or on-the-fly rewrite is needed. Existing strings become observations with their exact text and known enclosing topic. Unknown date, assistance, session and source relationships remain absent. For existing arbitrary objects, retain the original value in an `original` field and index its strings without pretending arbitrary keys already have canonical meaning. This is preserved historical payload, not a second accepted write schema.

Generate stable observation IDs in original topic/list order; convert source strings mechanically to source records without claiming which observation used them. Preserve summaries, gaps, teaching preferences, active work, coverage and reviews. Do not infer links from temporal adjacency. A repeated source path may share an ID only on exact verified equality; similarly worded observations must not be deduplicated automatically. Conversion must not assert a session association or independent performance from a migrated lesson note.

The existing implementation notes report two original SMM notes preserved byte-for-byte and a real continuation already migrated without invented mastery. A later authorized conversion should preserve those artifacts and every retained observation exactly. This design does not claim fresh knowledge of their contents. Deriving new semantic links requires reading the corresponding real material at that later stage; migration itself needs none.

Keep changes small: `memory.py` owns v2 validation, observation assignment, linked patching and existing safe publication; one pure `retrieval.py` can own resolution/search/context projections if that logic would crowd persistence. `__main__.py` exposes query plus optional topic/source/session/date/observation selectors through the existing context command. Keep one canonical parser path where possible rather than adding diverging flags to both entrypoints. `planning.py` adapts to topic/coverage shape and references evidence for chosen reviews; it should not dump all histories into planning output. The shared skill replaces latest-three instructions with request-led lookup, evidence/correction rules and exact continuation. Every provider calls this same core.

Validate bounded synthetic cases: old decisive evidence after many recent entries; ambiguous aliases; one observation covering multiple topics; assisted versus unknown conditions; exact active recovery; corrected versus merely historical misconceptions; explicit pagination; lossless conversion of strings/objects; and existing concurrent-write behavior. Do not add tests for the existence of module names or the retirement of the old architecture. Compare first useful retrieval, correct teaching decisions, tool calls and total context over representative tasks before claiming lower subscription overhead.

Keep the present one-file lock/revision/atomic-write boundary. An observation and its updated active task/summary can commit together. Shared source documents remain external and read through native tools; JSON and the CLI remain provider neutral. Local locks do not synchronize independently edited iCloud copies across devices. A split log would make that problem harder without solving it.
