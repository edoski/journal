# Learning retrieval: query and source design

> Historical investigation: implementation descriptions and proposals below reflect an earlier snapshot and are not the current runtime contract. See the [current learning README](../../../learning/README.md) and [behavioral acceptance cases](../behavioral-acceptance.md). Research claims retain their stated dates and limitations.

Research/design only, 2026-09-18. Current official documentation below is undated and was accessed today; it is implementation guidance, not 2026 experimental research. No model experiments, runtime changes, configuration changes, or vault edits were performed.

## Verdict

Keep the existing JSON learning records, native file discovery/read tools, and one canonical learning skill. Replace the three-observation truncation with complete focused histories; use a compact, derived catalog to resolve scope and select topics, then expand sources and history only where the task needs them. The workflow below is a design inference, not a demonstrated optimal retrieval algorithm.

## Findings

1. **The current limitation is concrete.** `memory.context` selects `focus` or explicit keys, silently skips missing keys, omits coverage, and retains only the latest three observations per selected topic. `--all` reads the entire scope; there is no complete-history selected-topic mode. The catalog exposes scope/title/revision/date/count, and `topic_index` contains only keys. [Memory implementation](../../../learning/memory.py), [CLI](../../../learning/__main__.py).

2. **Native search and progressive loading already fit agent tools.** Claude documents regex/file discovery and file reads as built-in capabilities. Anthropic Skills and OpenAI Skills document metadata-first loading followed by instructions/resources when needed. These establish supported mechanisms, not proof that lexical retrieval always beats semantic retrieval. [Claude tools](https://code.claude.com/docs/en/how-claude-code-works), [Anthropic Skills](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview), [OpenAI Skills](https://learn.chatgpt.com/docs/build-skills).

3. **Search hits must lead back to original content.** ripgrep supports scoped paths, globs and literal/regex matches; its default filtering can omit ignored, hidden or binary files. Search PDF text through an available extractor or the host's document tools, then inspect the source page when notation, tables or diagrams matter. Do not interpret “no text hit” as “no material exists.” [ripgrep guide](https://github.com/BurntSushi/ripgrep/blob/master/GUIDE.md).

4. **Compaction is a transport concern, not the learning authority.** Claude documents removal of older tool outputs and conversation summarization, including potential loss of early instructions. Therefore, preserving active work and source/evidence locators in the existing records is a reasoned continuity measure; no separate summarizing model or cross-provider conversation import is required. [Claude context management](https://code.claude.com/docs/en/how-claude-code-works#the-context-window), [current architecture](../../../learning/README.md).

## Complete lookup flow

For “exercise 5 SMM,” the tutor resolves the request; the learner never supplies commands or record keys.

1. **Resolve the course.** Read the compact scope catalog. Match the supplied scope ID, title or known alias; use current conversation/course context to disambiguate. If absent, search vault folder names and course index notes. Do not expand “SMM” from general knowledge. Reuse a matching scope; lack of a learning record does not imply lack of source material.

2. **Resolve the exact task source.** Within the resolved course roots, inspect filenames and headings for task aliases such as `exercise 5`, `esercizio 5`, `es5`, or `exercise5`. These are candidate query variants, not assertions that files are equivalent. Read enough of each candidate to distinguish exercise number, sheet number, edition and subpart. An exact user-provided path wins; saved active-task references help only when they match this request. Distinct plausible assignments require one concrete clarification, not an arbitrary first match.

3. **Read the task and current work.** Retrieve the complete statement, definitions, constraints, figures, referenced data/code, and the learner's saved attempt if any. Load scope goal, teaching preferences and active work, including the exact unanswered question and help already given. A request for another exercise overrides stale focus; “continue” resumes a matching pending question without another hint.

4. **Select concepts and prerequisites.** Inspect the scope's compact topic index and the source statement. Select the exercise's concepts, recorded prerequisite links, and only additional prerequisites needed for its next reasoning step. Match aliases/tags and follow source references; do not recursively load every prerequisite of the course. The tutor identifies unrecorded conceptual dependencies from the actual material and labels this as inference. No separate classifier/model is involved.

5. **Read learner evidence.** Return complete histories for those selected topics when manageable: errors, explanations, actual learner responses, relevant assistance, independent attempts, dates, uncertainty and corrections. Include older independent performance and unresolved misconceptions, not merely recent successes. If records refer to an ambiguous episode, read the linked session/artifact excerpt. Source notes show covered material; they do not establish independent competence.

6. **Read supporting source excerpts.** Follow topic/source links and search the course for the necessary definitions, theorem assumptions and worked examples. Start with task-provided references and current course material; use external primary sources only for remaining factual gaps. Preserve an equation with its assumptions and a code call with its relevant definition. Read adjacent sections or the whole short document when excerpts would omit necessary context.

7. **Teach once sufficient.** Proceed when the task is identified, its data/notation are understood, relevant prior work and assistance are recovered, and the next explanation has source support. Unknown learner history is permissible and must remain unknown; uncertainty about the task statement or a necessary source is not. Expand again when the learner's next step introduces another concept or conflicts with retrieved evidence.

## Small agent-facing interface

Extend existing `scripts/learn context`; keep `save` and native search/read. All signatures below are proposed, not available commands. A single implementation owns the output contract; host adapters do not implement alternate retrieval policies.

| Operation | Exact proposed behavior |
| --- | --- |
| `context` | Existing roots and compact scope catalog, plus optional recorded aliases and source roots. Stable scope ordering; no topic histories. |
| `context SCOPE --index` | Scope metadata/active work plus topic entries: key, title, optional aliases/tags/source references/prerequisite keys, evidence count and serialized evidence byte size. No evidence payloads. Derive on read; no persistent index or background indexing job. |
| `context SCOPE [--topics K1,K2]` | Metadata/active work plus **all** evidence for focus or explicitly selected topics. Return stable topic keys, revision and explicit missing keys. No top-three rule, recency weighting or hidden filtering. |
| `context SCOPE --topics KEY --offset N --limit N --expect REV` | Explicit, single-topic evidence pagination in stored append order. Return total, range, next offset, revision and `complete`; repeat metadata/current summary/gap so a page is interpretable. Reject revision mismatch and reread the index. |
| `context SCOPE --all` | Complete raw scope, including coverage, for whole-course work or reconciliation. Mutually exclusive with selective/index/pagination flags. |
| Native search/read | Discover current files and fetch exact line/page/section ranges. Scope paths first; use literal searches for known names and deliberate variants for uncertain labels. Return locators, not untraceable paraphrases. |
| `save SCOPE --expect REV` | Existing revision-checked patch/append. Save new evidence, corrected summaries, source references, focus and active work; never reappend retrieved observations. |

The index supplies navigation, not a second memory. Optional aliases/tags/prerequisite references live beside their scope/topic in the existing JSON; add only useful, observed names and relationships. Scope `sources` remains a list of strings. Relative source paths resolve against the returned vault root, so another host can mount the same vault elsewhere. Existing optional-field flexibility does not establish validation: validate any new metadata fields the retrieval implementation consumes.

No natural-language search parser is needed in Python. The tutor turns the request into exact scope/topic/path selections, using source evidence. Matching order is explicit: supplied identifier/path, exact known alias/title, then scoped lexical candidates. Within a candidate tier, use stable path/key order and expose the match reason; ordering never resolves genuine semantic ambiguity.

Tags and task identifiers help navigation when present; they are not prerequisites for retrieving older observations. Full selected history is the default, so an untagged old error remains available. For a genuinely large record, filter its parsed observation objects by an explicit task/topic/date request using a small local read-only query, retaining source indexes and counts. Do not add a general query language or scoring system. Do not apply date filtering by default, and mark observations with absent dates/task IDs as unknown rather than silently treating them as nonmatches.

## Large histories, provenance and corrections

Use the index's size information to choose full retrieval or explicit pages according to the host's actual available context. Page size is an operational setting, not a universal token optimum or maximum evidence allowance. Never split an observation mid-object. An oversized observation must be read through its exact source/artifact in explicit ranges; report incomplete coverage until finished.

For paginated work, fetch current summary/gap and active work, then the needed evidence pages; before asserting a comprehensive learning history, read all pages in the selected scope of that claim. A recent page alone cannot establish absence of older independent work. A transport-truncated result is incomplete, even if the underlying command returned successfully; repeat with smaller explicit pages. Do not silently substitute summaries for missing evidence.

Each evidence item needs a recoverable locator: scope, topic, append position and record revision; include its date and source/session link when recorded. Each source excerpt needs its vault-relative path, heading and line/page range; retain the file version or content hash when saving an exact dependency on its contents. Recheck current content before reusing a saved range because lines move. A source hash detects change; it does not establish authority.

Append corrections with an explicit reference to the earlier observation and a reason; update the current summary/gap. Return both the prior claim and correction in focused history. When a selected page or task/date filter includes one side of a correction relation, fetch the linked counterpart too and disclose the expansion. An arbitrary later success does not erase an earlier error, and recent prose does not automatically supersede contrary evidence. If disagreement is unresolved, expose it instead of inventing a mastery conclusion.

Before native compaction or a host handoff, persist the exact pending task/question, learner attempt, assistance, topic keys and source locators using existing `active`/evidence fields. After compaction, reread focused context and re-fetch any source excerpt needed to justify the next teaching step. Summaries remain navigation/current interpretation; original observations remain recoverable.

## Engine choice

| Candidate | Benefits and costs | Decision |
| --- | --- | --- |
| Native `rg`/file discovery + compact derived index | Direct current-file access, exact identifier matches, visible path/line provenance, no synchronization layer; terminology mismatch needs aliases/query variants and agent judgment. | Default. `find` or native file search is an acceptable discovery fallback when `rg` is absent. |
| SQLite FTS5/BM25 | Local lexical indexing and built-in ranking; requires extraction, index maintenance and source mapping. FTS5 documents consistency hazards for external-content indexes. | Add only if measured scan latency or repeated lexical discovery failures justify it. Use documented BM25 defaults and stable tie-breaks, without invented recency/topic weights. |
| Embeddings/hybrid search | Can retrieve semantic matches with few shared words; introduces an embedding model, index refresh/chunking decisions and an additional relevance/provenance layer. | Not justified for this bounded workflow without observed lexical misses and comparative evidence. Semantic similarity cannot identify the authoritative exercise edition or assess independence. |

The SQLite and embedding descriptions follow [FTS5 documentation](https://sqlite.org/fts5.html) and [OpenAI Retrieval documentation](https://developers.openai.com/api/docs/guides/retrieval). Their suitability decisions are local design inferences. No comparative benchmark was run, and embeddings are not inherently incompatible with local storage or provider neutrality.

## Failure behavior and acceptance

Missing scope: return `found: false` and continue source discovery; never initialize a record merely because reading failed. Unknown explicit topic keys: report each missing key with valid candidates; broken default focus also produces a diagnostic. A corrupt/unreadable record is an error, not empty history. Missing `rg`: use native tools or simple filesystem traversal. Missing PDF extraction/vision: report the unreadable material and use another available reader; do not invent its text. Missing repository/helper: use accessible source documents for teaching without claiming saved continuity, and report the persistence limitation when relevant. Do not install tooling or add an MCP server as retrieval's implicit fallback.

Stale paths: verify existence, search within the established course roots, and update only after confirming the replacement. Multiple editions remain ambiguous unless content/user context settles them. Broken prerequisite references are explicit gaps; inspect sources and retrieve another existing topic if appropriate. Unexpected file/record revisions require rereading, not silently mixing incompatible snapshots. Preserve the existing local locking/revision boundary; this design does not claim to solve concurrent edits across separate iCloud devices.

Before implementation acceptance, use small static fixtures to verify: an old independent success beyond three newer assisted attempts remains visible; exercise/sheet ambiguities are surfaced; a matching alias resolves without guessing; correction pairs survive paging/filtering; missing/corrupt records differ from unknown history; pagination revision changes fail explicitly; PDF-only task content is never fabricated. These are proposed deterministic checks, not completed model trials.

## Confidence

High for inspected current code and documented tool mechanisms. Moderate for the proposed minimal architecture; it follows the existing storage and integration boundaries. No measured learning improvement, universal context budget, cross-host acceptance result or retrieval superiority is claimed.

## Gaps

Actual course aliases, document topology, history sizes and extraction availability were not inspected in the private vault. Those facts determine initial metadata and page sizes. Real task fixtures would establish whether lexical lookup misses needed material often enough to justify FTS or embeddings; current official docs alone cannot settle that comparison.
