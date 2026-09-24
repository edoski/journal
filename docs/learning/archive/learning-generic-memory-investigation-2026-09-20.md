# Can understanding emerge naturally in the learning system?

20 September 2026. Read-only investigation of production baseline `b57b5fe`. The user rejected a dedicated course-mapping workflow and asked whether the existing system can retain useful, evolving understanding beyond assessments and task checkpoints. Four independent investigations covered storage, retrieval, external research and competing designs. Synthetic persistence probes and native fresh-session dialogues supplement source inspection. Production code, installed instructions and real learner data were not changed.

The subsequent [implementation plan](learning-generic-memory-implementation-plan-2026-09-20.md) integrates the token/correction discussion and the user's decision to proceed broadly without a further measurement prerequisite. It supersedes the pre-implementation experiment recommendation at the end of this historical investigation.

## Finding

The system does not need a predefined curriculum ontology to express the requested knowledge. Its JSON contract already preserves arbitrary prose at course, topic and source level. The actual gap is that the agent is primarily taught to remember learner evidence and unfinished work, while retrieval does not consistently discover the more general knowledge it could save.

The previous proposal for a dedicated course-map, resource-mapping and module-progress subsystem was too specific. The relevant capability is general: retain useful contextual understanding, revise it without losing unaffected details, and find it again when the activity changes. A course map is one possible agent-authored interpretation, not a required data model or intake.

This finding also qualifies the earlier implementation report. Schema 5 repaired evidence coverage, supporting-context assembly and Pi delivery. Those checks did not establish general semantic-memory retention or discovery. Passing those tests never proved this broader capability.

## What the code actually permits

[Record normalization](../../../learning/records.py) preserves unknown top-level fields; topic/source metadata also permits arbitrary additional fields. Normal revision-checked saves can replace scope prose or merge a changed topic field without a migration. The Pi save tool accepts open changes. JSON is therefore a container here, not a requirement to encode every idea as predefined fields.

Some named structures intentionally impose stronger meanings. `course_context` is a six-field assessment-context object, despite its broad name. A topic's `assessment` concerns the learner, and flat topic `summary`, `gap` and `status` are rejected outside it. Observations require topics and evidence origins and are append-only. Those constraints protect real attempt history, but they make these structures awkward substitutes for an evolving account of the material itself.

An agent can already retain “these resources seem to present two recurring perspectives” in ordinary prose. It need not turn this into a prerequisite edge, module object, percentage, assessment of the learner, or temporary task. The current documentation does not make that freedom clear enough to constitute a dependable shared convention.

The [teaching skill](../../../learning/skills/learn/SKILL.md) tells agents to save orientation with tasks and emphasizes attempts, assistance, judgments and checkpoints. This biases representation without making other content impossible. General knowledge also has different lifetimes: a task can finish while a notation correspondence or resource caveat remains useful.

## Persistence is not discoverability

Independent temporary-store probes confirmed these behaviors in [retrieval](../../../learning/retrieval.py) and [planning](../../../learning/planning.py):

| Saved content | Retrieval behavior | Consequence |
| --- | --- | --- |
| Arbitrary scope-level prose | Returned on every scoped context call | Easy to recover, but an accumulating course essay would consume context even when irrelevant |
| Arbitrary topic prose | Returned when that topic is selected | Useful content can be fetched if the agent already knows where it lives |
| The same topic prose in literal search | Not searched: topic candidates use a metadata whitelist | Even an exact phrase can fail to discover a stored note |
| Arbitrary source annotations | Full source objects are searched and returned as candidates | Resource knowledge is more discoverable than equivalent topic knowledge |
| General scope/topic prose in planning | Omitted by the planning projection | A tutor needs prior context or another retrieval before relying on it |
| Freeform Markdown published as a note | No automatic source registration or learning-context indexing | A readable artifact alone does not establish future memory access |

Topic `parent` and `prerequisites` are exposed as links, not automatically traversed. This is not inherently a defect: automatically loading all ancestor histories could be expensive. The issue is whether an agent can discover and inspect the relevant knowledge deliberately.

The storage audit also found an important qualification on reorganization. Topic labels and relationships can change, but historical observations retain their original topic handles; ordinary saves cannot retag or delete them. Deleting a topic still cited by evidence is rejected. This preserves history, but means agents should not crystallize every provisional grouping into an immutable evidence category. A loose interpretation can remain prose until a stable identity is useful. Topic prerequisite references validate existence, not curriculum truth or acyclicity.

## Native comparison

The retained [probe evidence](learning-generic-memory-probe-2026-09-20.json) records a baseline trajectory and an instructions-only comparison. Each uses a separate synthetic vault and three fresh native Pi processes with the current extension and canonical skill. The same source list and learner messages introduce a tentative course interpretation and a notation correspondence, correct the interpretation/resource advice, then ask for the accumulated picture in a new conversation. The facts in the dialogue are not all present in the source fixture, so rereading that fixture cannot recover omitted details.

The comparison adds four generic sentences to the evaluator prefix in the temporary user message. They allow useful revisable prose in existing scope/topic metadata, separate it from learner judgments and disposable tasks, preserve unaffected details and uncertainty, and avoid routine reflection/unchanged writes. No field name, module taxonomy, example answer, new tool or production edit is supplied. The prefix is not an installed system instruction. The comparison follows an observed baseline failure; it is an exploratory feasibility test, not a preregistered benchmark or independent validation set. All responses identify `gpt-5.5`; Pi reports version `0.85.1`.

**Baseline:** the tutor stored course organization/resource advice in an orientation task and in a learner assessment that correctly said mathematical understanding remained unknown. It did not retain independent generic course/topic prose. In turn two it revised the course picture and resource advice, but replacing the task plan and assessment also lost the unrelated notation correspondence: lecturer `g`, textbook `h`. In the third fresh conversation it failed to recover that correspondence, instead presenting continuous/discrete-time notation as the mismatch previously noticed. This is an observed retention/revision failure, not evidence that its general mathematical explanation was wrong.

**Generic guidance:** the tutor independently chose three topic objects with freeform `note` strings. No such field or grouping was supplied by the evaluator. It saved tentative relationships and learner-reported resource/notation information outside learner assessments, revised the mistaken resource advice while preserving `g` versus `h`, and recovered both in the third fresh conversation. It used the compact topic index and selected the relevant topics. No learner-performance observations or assessments were invented. Both arms left the final clarification's state unchanged. The candidate still created an orientation task and plan; the intervention did not demonstrate elimination of planning ceremony or duplication.

| Native turn | Baseline seconds / tools / errors | Generic guidance seconds / tools / errors |
| --- | --- | --- |
| Initial orientation | 61.86 / 11 / 3 | 46.42 / 8 / 0 |
| Correct earlier understanding | 60.80 / 9 / 3 | 36.43 / 7 / 1 |
| Fresh-session reuse | 47.68 / 5 / 1 | 28.35 / 7 / 1 |

The public tool traces include all failures. Baseline mistakes included unscoped evidence queries, a human title used as a scope key, malformed task placement, resubmitting helper-owned assessment metadata and an invented source reference. Candidate turns two and three still attempted unscoped queries and recovered. These are not invisible successes merely because the final answer was useful. One sample per arm, caching and stochastic tool/response choices prevent attributing the timing differences to the guidance. Actual provider usage is retained in the evidence file, with uncached input and cache reads separate; no general efficiency claim follows.

**Task-independence check:** after the native turns, normal saves removed the orientation tasks from disposable copies of each arm's state. This was an evaluator intervention, not an autonomous tutor action. Baseline state then lost all mention of Atlas and Lumen; only the narrower course-structure interpretation remained inside its learner assessment. Candidate topic notes survived and were returned under the existing focus. This establishes storage-level independence, not native recovery after an agent closes a task.

**Discovery check:** in the candidate copy, the evaluator then selected an unrelated topic and queried the exact phrase `impulse response`. The saved notes contained that phrase, yet the query returned no topic, task, source or observation candidate. Selecting `notation-resources` explicitly recovered the full note. Thus the instructions-only improvement does not solve the independently confirmed search gap. The successful fresh-session answer had a discoverable active topic index; it is not proof of robust retrieval after arbitrary context changes.

Attribution remained readable but imperfectly structured: candidate notes named learner reports and the overview document in prose, while the validated overview source link was on the task. Reported lecturer confirmation was not independently checked. No actual textbook, lecture notes or lab sheets existed in this synthetic fixture. This test does not certify source-version handling or factual authority beyond those limits.

## What the external evidence changes

The [primary-source research note](learning-generic-memory-research-2026-09-20.md) supports expressive, agent-authored text with revision and discoverability. Anthropic reports agents developing their own maps and strategy notes; Letta's memory filesystem demonstrates ordinary text files with selective reads. These are engineering evidence, not proof of reliable tutoring. [Anthropic context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents), [Letta MemFS](https://docs.letta.com/concepts/memfs).

A-MEM, Mem0 and more recent maintained-document approaches still have memory operations and some structural envelope. Their freedom concerns the content and evolving relationships. They do not show that unspecified file access makes useful retention automatic, or that Markdown, vectors or an external service would outperform this system. The reviewed benchmarks also do not measure this learner's educational outcomes. [A-MEM](https://arxiv.org/html/2502.12110v11), [Mem0](https://arxiv.org/html/2504.19413v1), [Infini Memory](https://arxiv.org/html/2606.10677v1).

## Revised recommendation

Keep agent-authored meaning open-ended. Preserve the existing mechanical guarantees for publication, revision conflicts, references, learner evidence and instruction authority. The software need not decide what a course consists of or demand that uncertain information be resolved during an introductory conversation.

The smallest coherent direction is to clarify that useful understanding of material and context may be retained as concise, revisable prose in the existing state, and make that supported content discoverable through the existing retrieval interface. A stable place to find prose is an interface convention, not a curriculum ontology. The native comparison tests whether guidance alone can unlock existing expressiveness; the deterministic retrieval findings show why that alone cannot establish reliable discovery across changing activities.

Retain useful local distinctions rather than transcribing textbook knowledge: resource roles, source-specific notation, tentative connections, assumptions behind an explanation, and unresolved contradictions when they matter to future assistance. This is illustrative, not an inventory the agent must populate. Do not ask the learner to complete fields. Do not create a reflection phase after every turn. Consequential claims should keep enough attribution to distinguish source evidence, learner reports and agent hypotheses; uncertainty can be ordinary prose.

When updating that understanding, preserve relevant unaffected information and supersede the mistaken interpretation. The newest statement is not automatically the most authoritative. The agent should inspect source evidence when a decision warrants it. A concise synthesis must not replace diagnostic learner attempts or silently become policy. Completing an activity must not destroy its only copy of reusable understanding.

Search should be able to discover the prose that the memory contract permits. Fixing the topic-metadata blind spot is narrower than introducing semantic search. Broader matches should remain bounded and inspectable; current observation pagination does not bound topic/source candidates. Planning should obtain relevant general understanding through the same retrieval mechanism rather than create a second account of the course. Whether to include a compact view directly or retrieve it on demand should be settled with realistic requests, not by automatically copying all knowledge into every response.

No dedicated course-map workflow, module-progress schema, numeric mastery roll-up, graph database, vector service, extra critic agent, background consolidation daemon or new curriculum intake is warranted by this investigation. Agent-maintained Markdown is a credible alternative if evolving knowledge outgrows the current scope/topic views; it is not a free simplification because discovery, revision, provenance and concurrent writes still require clear ownership.

## Decision limits

The code probes establish actual persistence and retrieval behavior. The native trajectories demonstrate particular choices by one configured model on one synthetic course, with real tool errors included. They do not establish a general success rate, cross-provider consistency, long-term maintenance, scalable discovery or learning efficacy. The candidate can benefit from the deliberately small active context; sustained accumulation and unrelated-task retrieval remain separate questions.

Before production changes, use the proposed general behavior across additional ordinary study trajectories, including an unrelated active topic, task completion, a source correction, and a paraphrased question. If guidance suffices for retention, keep the change at that level; if a saved fact cannot be found, repair that retrieval path. Do not redesign storage merely because an agent occasionally chooses a poor summary. This report recommends a direction; it does not authorize or implement a new memory subsystem.
