# Retrieval and context audit — 19 September 2026

Scope: read-only inspection of `learning/memory.py`, `task_context.py`, `preferences.py`, CLI context assembly, retrieval instructions, and relevant tests. Reproductions used temporary directories, never live learner records. This report is the only file changed by this audit branch. Existing repository changes belong to other work.

## Verdict

The retrieval core is coherent for the reported live size: one scope, six topics, thirteen observations, one task, roughly 15 KB of state. Exact identities, inspectable JSON, task purpose, correction links, and revision-bound paging are valuable foundations. A vector database, automated memory agent, or universal knowledge graph would currently add machinery without demonstrated benefit.

There is one reproduced consistency defect worth fixing now. The deeper opportunity is to distinguish the current learning activity from the historical evidence loaded to support it, then evaluate retrieval on realistic continuations. Token budgeting becomes valuable as records grow; it is not a present outage. Code inspection and deterministic tests cannot establish state-of-the-art teaching or retrieval quality.

## Confirmed defect: preferences can use a different scope revision

Priority P2. CLI assembly first reads the scope through `memory.context` (`learning/__main__.py:125–139`), then passes returned topic handles into `preferences.context` (`learning/__main__.py:152–160`). That function reads the scope again to derive concept/domain labels (`learning/preferences.py:134–141`). A concurrent save between those reads can change topic metadata. The returned context says scope revision R and contains R's topic concepts, while its applicable preference rules were selected using revision R+1. Preference revision identifies the policy file, not the revision of the scope used to match rules.

A temporary fixture reproduced the interleaving with a single topic. Revision 1 had concept `algebra`; a preference matched `geometry`. After `memory.context`, saving revision 2 changed the concept to `geometry`; the subsequent `preferences.context` returned the geometry instruction beside the still-returned revision-1 algebra topic. Without that intervening save the rule was absent.

Fix: derive concept/domain labels from the already-read scope snapshot, using a pure preference selector over supplied labels and the independently read preference policy. Keep both scope and preference revisions explicit. Do not solve this with a distributed lock or retries across the entire vault. Validation: one controlled interleaving test demonstrating that returned scope metadata and the labels used to select policy remain consistent; verify ordinary concept/domain selection still works.

## Reproduced design risk: historical evidence expands teaching policy

`memory.context` adds every returned observation's topics to the topic result (`learning/memory.py:420–426`). Correction closure can introduce observations from topics outside the requested selection (`learning/memory.py:295–306,417–419`). CLI then treats every returned topic as a preference selector (`learning/__main__.py:152–159`).

Synthetic example: explicit selection of topic A returns its observation o1 plus correction o2, which belongs to B and explains that the previous record concerned another exercise. Topic B carries concept `geometry`, so a geometry-specific teaching instruction becomes applicable while continuing A. A second page containing only o3 from A loses that instruction, although scope revision, requested topic and activity have not changed. The temporary fixture reproduced both pages.

This is not an unconditional wrong-answer bug: evidence from a prerequisite can legitimately make its preference relevant, and the tutor is explicitly responsible for semantic interpretation. The defect in the abstraction is that “topic mentioned in loaded evidence” and “current teaching context” have only one representation. The model cannot tell whether a rule was activated by requested work, a prerequisite, a correction, or an incidental multi-topic observation. Exact conjunction matching also operates over unions of all selected labels, rather than preserving which topic contributed which concept (`learning/preferences.py:125–146`).

Worthwhile improvement: separate requested/activity topics from evidence topics; expose policy selection provenance. Use the current task/request for default instructional policy, and expose evidence-related scoped rules as candidates when relevant. Do not hard-code a total priority between course, domain and concept, and do not suppress explicit user instructions. Validation: same-task policy stability across evidence pages; cross-topic correction and prerequisite cases; an explicit topic switch must still select the new rule. Resolve expected semantics before implementation.

## Context size: the current page limit is not a response budget

The limit slices seed observations before correction expansion (`learning/memory.py:413–419`). It does not bound a correction-connected component. A fixture with 150 linked 1,000-character observations returned all 150, approximately 160,444 JSON bytes, when asked for one observation with `limit=1`. `complete=true` is accurate for that selected history; it does not mean the response fits a host transport or model context.

The entire task checkpoint and task index are also returned, and sources from every plan node are included even when only current/direct-prerequisite histories are loaded (`learning/memory.py:430–446`). Topic/source candidates from literal queries are not paginated (`learning/memory.py:476–501`). Thus reducing the observation limit cannot always repair transport truncation, despite the retrieval reference recommending smaller pages or exact handles as the recovery route.

This is a documented completeness-versus-size tradeoff, not evidence that live records are currently too large. Preserve full correction semantics. If growth warrants it, add an explicit response-size budget and a compact correction component manifest with handles for subsequent retrieval; never silently truncate corrective evidence. Return separate fields for selection exhaustion, omitted sections and correction completeness. Include a deterministic oversized-component fixture and ensure ordinary small records remain simple.

The repeated scan in `_corrections` can also become quadratic for a long chain requested from its newest end. An adjacency map and traversal would make it linear, but thirteen observations do not justify optimization work by themselves.

## Strengths and deliberate limits

- Stable observation handles and append-only correction relationships preserve old evidence. Retrieving either an original or a correction returns the connected correction component; this is stronger than retrieving only semantically similar statements.
- Pagination is sorted deterministically and requires an expected scope revision after the first page (`learning/memory.py:329–349`). Tests cover mixed-revision rejection and retention of older observations (`tests/learning/test_memory.py:222–280`).
- Task frames preserve the goal, source and completion condition. Routine resumption loads current work, frame evidence and direct plan prerequisites while excluding future histories (`learning/task_context.py:64–75`; `tests/learning/test_memory.py:480–564`). More distant prerequisites are intentionally agent-selected, not accidentally missing.
- The result exposes its selection, seed count, returned count and expanded correction handles. Instructions explicitly distinguish selected-history completeness from whole-course knowledge. There is no evidence of the code silently claiming curriculum completeness.
- Literal search is honest and inspectable. Topic aliases are discovery candidates, not semantic expansion of observations. “No literal match” cannot establish that an experience never occurred; the skill correctly says missing evidence is unknown.
- Search requires a scope (`learning/memory.py:333–342`); the unscoped call returns a catalog. Cross-course transfer currently requires deliberate reads of additional scopes. At one scope this is reasonable. If repeated real failures appear, add catalog discovery over established concepts/domains before considering embeddings.
- Current task selection is a fallback, not an authoritative interpretation of the user's request. The skill tells the tutor to use task candidates and explicit intent. That policy still requires behavioral evaluation.

## 2026 primary evidence and what it supports

Anthropic's [Harness design for long-running application development](https://www.anthropic.com/engineering/harness-design-long-running-apps), published **24 March 2026**, reports structured handoffs and task decomposition, while showing that useful orchestration changes with model capability. This supports the existing durable task frame and explicit completion condition. It does not prescribe a tutoring schema or prove this implementation's quality.

Anthropic's [The new rules of context engineering for Claude 5 generation models](https://claude.com/blog/the-new-rules-of-context-engineering-for-claude-5-generation-models), published **24 July 2026**, recommends progressive disclosure, expressive interfaces, lightweight skills, and removing redundant constraints when evaluation permits. The current focused-context tool and reference files fit that direction. My recommendation is to improve retrieval semantics and measurement, not lengthen the skill to compensate for ambiguous output.

[Grounding Agent Memory in Contextual Intent (STITCH)](https://arxiv.org/abs/2601.10702), first submitted **15 January 2026**, revised **30 April 2026**, studies retrieval conditioned on goals/action/entity context rather than similarity alone. The paper's affiliations are UIUC and Stanford; it is **not major-lab research**. Its findings motivate evaluating context-mismatched retrieval and preserving task identity. It also reports additional ingestion calls and taxonomy-management tradeoffs. Its generated workflow benchmarks do not establish benefit for this learner's six-topic store, so adopting its entire pipeline would be unjustified.

Only 2026-origin sources above inform these comparisons. Anthropic's often-cited *Contextual Retrieval* is dated 2024 and *Effective context engineering for AI agents* is dated 2025; neither is treated as eligible 2026 evidence. Major-lab engineering advice is guidance, not a certification standard. This retrieval sub-audit does not independently assess OpenAI or DeepMind compliance; companion research audits cover those labs.

## Recommended order

1. Fix mixed scope revisions in preference selection. Small, deterministic correctness improvement.
2. Define a current-activity versus historical-evidence boundary and expose selection reasons. Evaluate before deciding which historical preference candidates should be automatically applicable.
3. Create a small evidence-based retrieval evaluation set: resumed detour, same terminology in two exercises, old independent success followed by assisted attempts, corrected assessment, missing history, task switch, cross-topic prerequisite, and paraphrased discovery. Score required-evidence recall, irrelevant-evidence inclusion, wrong task/claim rate, correction handling, calls and bytes. Include answer behavior, not only JSON shape.
4. Add bounded context responses only if measured growth or host truncation makes them useful. Preserve raw history and exact-handle inspection.
5. Consider lexical ranking, semantic retrieval or cross-scope indexing only after the evaluation demonstrates concrete recall failures that cheaper identity/alias/provenance improvements cannot fix.

No code or learner state was changed. Existing focused test coverage was inspected; the parent audit independently ran the full learning test suite. The reported failure cases above were executed directly against the current code in temporary stores.
