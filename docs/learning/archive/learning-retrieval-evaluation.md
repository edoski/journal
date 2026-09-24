# Retrieval and teaching acceptance

> Historical investigation: implementation descriptions and proposals below reflect an earlier snapshot and are not the current runtime contract. See the [current learning README](../../../learning/README.md) and [behavioral acceptance cases](../behavioral-acceptance.md). Research claims retain their stated dates and limitations.

Design only, 18 September 2026. Synthetic fixtures and proposed checks; no model runs, runtime changes, installed-client changes or real-vault access. This evaluates a replacement retrieval contract, not the current latest-three policy.

## Current evidence and limits

[memory.context](../../../learning/memory.py) selects focus or explicit topic keys, silently skips unknown keys, removes coverage, and returns each selected topic's last three observations. It includes the complete topic-key index and unrestricted metadata, so the observation cap does not bound the whole response. `--all` returns the complete scope; no relevance query, evidence pagination or source freshness check exists.

[Current tests](../../../tests/learning/test_memory.py) establish local conflicting-write protection, patch semantics, retained evidence, date arithmetic and lesson ownership. The rollover test expressly expects omission of the older misconception. It proves retention, not useful retrieval or correct learner assessment. Keep the meaningful storage checks; replace the cutoff assertion with retrieval behavior checks.

[Pi's projection](../../../learning/pi.ts) currently copies user and assistant text as `You`/`Tutor` sections. It cannot distinguish an accepted teaching answer from an assistant preamble. [The shared skill](../../../learning/skills/learn/SKILL.md) requests post-teaching saves and separate artifact publication; that instruction alone supplies no enforceable common answer transaction or delivery acknowledgment.

## Small synthetic acceptance set

Use temporary directories and a few human-readable records. Assertions identify the evidence needed for a particular teaching decision, not a numerical relevance score. Exercise identifiers, learner observations and source excerpts are synthetic.

| Case | Setup and request | Required outcome |
| --- | --- | --- |
| Portable continuation | Host A records worksheet A, exercise 5(b), the exact unanswered question, an earlier hint and a preference against extra quizzes. Host B begins with no native transcript and asks to continue. | Retrieve the same task, question, assistance and preference. The next answer continues that step without resetting assessment or inventing independent recall. |
| Exact exercise | Two worksheets each contain exercise 5; a second course also has exercise 5. Request names course and worksheet A, then repeat with only “exercise 5” and no active task. | Exact identity selects A even if B is more recent. The unresolved request returns real candidates or asks for the missing distinction; it never silently selects a recent match. |
| Important older evidence | An old independent derivation and an unresolved sign error precede many recent assisted arithmetic observations. Request concerns the derivation and sign convention. Increase unrelated observations without changing relevant facts. | Both older facts remain discoverable and are selected when needed; unrelated recency does not displace them. If the result is partial, the omission and continuation route remain explicit. No fixed observation count determines relevance. |
| Correction and uncertainty | Initial evidence says “zero determinant means no solution.” Later independent evidence distinguishes inconsistent and infinitely solvable cases; a separate example was solved only after a hint. | Current assessment reflects the demonstrated correction, preserves its scope and assistance, and retains the earlier error as history. A stale summary conflicting with evidence is exposed for reconciliation, not silently trusted. |
| Sources and edits | Saved exercise reference identifies a passage in worksheet A. Change that passage, move the file, and remove it in separate fixture variants. | Unchanged references resolve; changed content is detected or verified by a fresh read before reuse. A stale location never silently becomes another exercise. Missing or ambiguous sources are reported without erasing the saved attempt or pretending the old passage is current. |
| Partial context | Relevant history spans several pages; an individual observation exceeds the requested response budget. Change the underlying revision between page requests. | Return explicit completeness/omission information and an actionable continuation. Stable-revision traversal has no duplicate or missing observations. Revision changes require restart or a coherent snapshot. Oversized evidence has a detail route; it is not silently cut into a misleading claim. |
| Compactness | Hold the active exercise fixed while adding unrelated topics and long irrelevant histories. Also request a broad course review that genuinely needs multiple topics. | Narrow output avoids unrelated prose and an unbounded topic index. Broad work can retrieve more detail. Measure serialized size and reads alongside omissions; a smaller response that loses the exact task, assistance or decisive evidence fails. |
| No supporting model pipeline | Run retrieval, pagination, state commit and lesson projection with deterministic inputs and a recording adapter. | No classifier, summarizer, embedding-model or second answer-generation call occurs inside these operations. The native tutor may reason and use tools normally; storage and projection reuse its accepted content. |

Where relevance depends on meaning rather than explicit identifiers, deterministic tests establish available candidates, filtering, provenance and recoverability. They cannot prove that a tutor will recognize every paraphrase or choose the right teaching action. Do not encode an expected answer by giving the fixture an otherwise unavailable “important” flag.

## One answer and its lesson

Required acceptance is one shared policy: author the teaching response once, save meaningful evidence through the existing revision-checked atomic writer, and reuse teaching content for the lesson without a second model rewrite. Keep host-specific event translation thin. Native hosts retain their own response lifecycle; Pi projects completed assistant teaching events into its owned lesson.

The common workflow is retrieve and resolve context → formulate the teaching response and its meaningful evidence update → save against the current revision → present the single authored response. Pi's projection follows its actual completed-message events, including the event emitted before the message reaches native session history. This is a workflow policy, not an atomic transaction spanning evidence, lesson and native chat.

Use small failure-injection checks at the boundaries the code owns:

- A stale revision preserves the committed evidence and returns a conflict. The tutor rereads and reconciles instead of replaying a stale patch.
- A successful evidence save followed by lesson-publication failure preserves that evidence, reports the publication failure and never claims both operations succeeded atomically.
- Repeated Pi projection of the same completed message and selected branch is idempotent. Resume/branch reconstruction includes teaching content once and excludes abandoned branch content, without another model call.
- Retry lesson publication from native session events without resaving learner observations. Evidence saving and projection remain separate operations.
- Persisting a question does not prove the learner saw it. Resume must not interpret uncertain delivery or absence of a response as learner failure.

These checks establish atomic evidence writes and event-based projection behavior. Actual native-host checks must verify one teaching response and the absence of bookkeeping narration. They cannot guarantee exactly-once presentation across interruptions: persistence is not delivery. A durable answer journal, pending-publication store and delivery acknowledgment would be an optional stronger transaction design for a demonstrated need; none is required or proposed for this scope.

The lesson is an assistant-focused study artifact. Test that the authored explanation, public exercise/question, equations, source references and requested diagrams survive unchanged where fidelity matters. Exclude raw user prompts, role headings, tool chatter, save receipts, duplicate final answers and private quiz answer keys. Include a learner attempt only when deliberately selected as material for an explanation or worked correction; retain assessment evidence in the canonical record regardless.

A supplied quiz question must be published before its input UI opens. Cancellation, “I do not know” and an incorrect attempt remain distinct. Publication before input can be tested with ordered fake events; visible Obsidian repaint still requires a later manual check.

## Comparing lean alternatives

For the old-evidence fixture, latest-three retrieval loses the foundation; whole-scope retrieval preserves it but also returns unrelated history; summary-only retrieval depends on a maintained interpretation that may be stale. Relevant selection plus explicit expansion retains access to decisive evidence without routinely loading everything. These are fixture-level tradeoffs, not measured learning benefits.

Explicit exercise/source identity gives precise continuation cheaply but cannot resolve an unspecified worksheet. Text search helps discover candidates and paraphrases, but a lexical match is not proof of shared task identity or present understanding. Let the native tutor resolve meaning from bounded candidates and evidence; avoid arbitrary weighted scoring and a new classifier service.

Any new storage shape needs a one-time conversion rehearsal on copies of representative synthetic old records, including strings, object observations, unknown fields and old lesson notes. Verify preservation of content and provenance, explicit treatment of unconvertible entries, original files retained until validation, and restoration from the untouched copy. Do not describe a clean break as permission to discard current data or as inherently irreversible. Existing lessons need not be rewritten into the new projection.

## Later native-host check

After implementation, use temporary learning roots for one short exercise continuation transferred between the supported native hosts, then one fresh-source ambiguity/correction case. Inspect the actual saved evidence, assistance, next question and rendered lesson. Check that the host emits one teaching answer and no bookkeeping narration, and that recovery after a deliberately interrupted Pi projection does not duplicate content.

Record concrete observed behavior, source/context reads and output sizes. Run another case only to investigate an observed failure; no leaderboard, aggregate “retrieval quality” score or large benchmark framework. Native runs can show that those host versions followed the contract in those cases. They cannot establish universal provider compliance, pedagogical effectiveness or exact token savings. None of these proposed runs has been performed here.
