# Learning system: research and revised direction

18 September 2026. Research gathered before implementation. The deployed design and verification are recorded in [learning-system-implementation.md](learning-system-implementation.md); this document preserves the evidence and earlier proposal.

## What the design optimizes

The learner should begin naturally: “Let's work on exercise 5 for SMM.” The agent locates the material, understands the relevant progress, teaches, captures useful evidence and maintains an exam-aware review plan. It should continue correctly the next day with a different provider.

Only the learner-facing study experience needs readable Markdown. Internal records may use any representation that improves agent success and efficiency. Existing folders, skills and session formats impose no constraints. Optimize useful decisions per total model work: context, writes, maintenance, retries and latency. Storage size alone is a different concern.

Pi is the preferred first interface to try. The upstream experience is terminal input with an automatically updated lesson visible in Obsidian. A new Obsidian chat frontend is unnecessary for that experiment. The core records should also remain usable outside Pi.

## Memory at different levels

Use more detail where the agent is actively reasoning, and less in routine cross-session context. These are logical levels, not a requirement for separate databases or services.

| Level | Information | When the agent uses it |
| --- | --- | --- |
| Active work | Exact problem, current derivation or code, recent attempts and hints, pending question and relevant source passages | During the current exercise and when resuming unfinished work |
| Persistent learning state | Goals, material references, relevant demonstrated abilities, unresolved difficulties, review timing and a useful resume point | On starting or changing tasks; only the relevant portion is loaded |
| Recoverable detail | Existing course sources, meaningful original attempts and contextual evidence, retained lesson history | When a question needs more detail, an assessment is challenged, or a summary proves insufficient |

The rich active representation can largely reuse Pi's conversation and the current work artifact. Preserve a portable resume point for unfinished work. Reuse the lesson or original source for detail rather than manufacturing a second complete transcript archive. The persistent state can retain compact evidence alongside its interpretation; it need not become an append-only event system. A compact course view and a richer active-task view can be assembled from the same records. They do not require separate stores or automatic migration through memory tiers.

A record such as “inverse: done” removes distinctions that affect teaching. A compact record should still distinguish an explanation from independent application, preserve relevant assistance and dates, and identify an unresolved gap. Keep meaningful reasoning in selected evidence or an accessible artifact. Repetitive tutor prose and superseded next-step suggestions need not inflate long-term context.

For a new SMM request, retrieve the exercise anchor, the current task state, the few relevant learning observations and necessary source passages. During the ongoing exercise, reuse that loaded context. When work shifts or more evidence is needed, retrieve another portion. A semester-planning request instead uses a small cross-course view before inspecting particular gaps. One fixed compressed summary cannot serve all these requests equally well.

Start by comparing compact per-topic/course structured files with the current Markdown approach. JSON is a practical candidate because generic agent tools and Python can handle it; this is not a claim that JSON is universally optimal. A query can present repeated rows compactly and irregular evidence as short semantic statements. Internal storage and model-facing output need not share a format. SQLite remains an option if its queries and transactions simplify an actual problem; it is not required merely because the data is agent-owned.

Human readability is not the reason to preserve semantic labels. Current models can use meaningful terms with less ambiguity than arbitrary codes, and any codebook consumes context too. Learned latent or KV-cache representations require access to model internals or trained interfaces. They are not interchangeable memory files for ordinary Claude and Codex sessions. [Anthropic tool design](https://www.anthropic.com/engineering/writing-tools-for-agents), [xRAG](https://arxiv.org/html/2405.13792v2), [AutoCompressors](https://arxiv.org/abs/2305.14788).

## Compaction and provider continuity

Native conversation compaction and persistent learner memory have different jobs. Compaction keeps a running conversation usable as its context grows. Learner memory lets a newly started conversation choose the right work and teaching approach, even in another provider or harness.

Use Pi's existing compaction for the first job. Preserve meaningful learner evidence during ordinary work rather than waiting for compaction or a graceful goodbye. A summary should point back to relevant sources and evidence; repeatedly summarizing summaries must not turn uncertain or assisted performance into a confident claim of understanding.

Installed Pi 0.85.1 already appends compaction summaries while retaining the original session history and recent context. A genuinely new session still needs explicit retrieval of relevant learning state. Its lifecycle hooks permit customization, but no second conversation summarizer is justified initially. [Pinned compaction documentation](https://github.com/earendil-works/pi/blob/d981de1229ef899957bbe968bc8dcda02a21f477/packages/coding-agent/docs/compaction.md).

Both providers should read and update the same canonical learning records. On a fresh start, retrieve the current relevant state. There is no need to synchronize separate Claude and Codex copies. Native session histories and provider compaction artifacts may help resume their own conversations, but they are not the interchange format for the core.

Within Pi, existing provider-message conversion already handles supported differences; building another translator adds no value. That replay is not lossless across private model state. OpenAI's Responses compaction includes encrypted continuation items; Claude exposes summary text, but native block semantics remain provider-specific. Ordinary shared learning records avoid making either representation part of the core contract. [Pi conversion source](https://github.com/earendil-works/pi/blob/d981de1229ef899957bbe968bc8dcda02a21f477/packages/ai/src/api/transform-messages.ts), [OpenAI compaction](https://developers.openai.com/api/docs/guides/compaction), [Claude compaction](https://platform.claude.com/docs/en/build-with-claude/compaction).

The initial operating case is sequential study on this Mac: finish or interrupt work with one provider, then continue with another. A confirmed save and fresh read establish the handoff. Concurrent writers or independent devices introduce a different problem; iCloud synchronization alone does not make conflicting assessments consistent. Avoid building distributed coordination before that use case exists.

Provider independence and harness independence are separate. Pi supplies a common interface to several model providers. Keeping ordinary external records and simple access operations also makes later use from Claude Code, Codex or another capable local agent feasible. Each supported host still needs verified file access and a real save/read cycle; a shared skill file cannot grant those capabilities.

## What the research supports

The papers below evaluate memory retrieval or agent tasks, not this user's learning outcomes. Their architectures are useful evidence; their benchmark rankings are not interchangeable across models and workloads.

| Source | Useful finding | Consequence here |
| --- | --- | --- |
| [HiAgent](https://aclanthology.org/2025.acl-long.1575.pdf) | Keeps current subgoal detail, summarizes completed work and retrieves earlier trajectories when needed. | Closest researched pattern for rich active exercises and compact past work; evaluated on planning/game tasks. |
| [MemGPT](https://arxiv.org/html/2310.08560v2) | Pages relevant history into a limited working context while retaining recoverable detail. | Borrow selective retrieval, without importing a memory operating-system framework. |
| [LongMemEval](https://arxiv.org/html/2410.10813v2) | Isolated fact compression lost information; compact search keys backed by original context worked better. Temporal information matters. | Keep selective evidence behind compact state; preserve dates and changes. |
| [SimpleMem](https://arxiv.org/html/2601.02553v1) | Self-contained semantic units and bounded retrieval reduced answering context. | Resolve vague references and retrieve by the current question; count construction costs too. |
| [Mem0](https://arxiv.org/html/2504.19413v1) | Fact extraction and reconciliation traded some full-context answer quality for reduced context and latency. | A smaller memory is not automatically a more correct one. |
| [Hindsight](https://aclanthology.org/2026.acl-demo.27.pdf) | Grounded, dated records and budgeted recall are useful; the implementation includes substantial retrieval machinery. | Borrow the principles without adopting its database/service stack. |
| [LeanMem](https://arxiv.org/html/2608.03463v1) | Recent work separates stable profile information, evolving events and detail-sensitive records. | Update affected state selectively; this remains early preprint evidence. |
| [Letta's filesystem experiment](https://www.letta.com/blog/benchmarking-ai-agent-memory/) | Familiar tools can work well, but the reported setup also used embeddings and semantic search. | Native tools deserve a comparison; the result does not prove grep alone solves all retrieval. |
| [LLMLingua-2](https://aclanthology.org/2024.findings-acl.57.pdf) | Learned text filtering compresses prompts for black-box models. | It adds a model dependency and lossy processing; there is no demonstrated need for it over already short study records. |

[MemoryOS](https://aclanthology.org/2025.emnlp-main.1318.pdf) offers a fuller short/mid/long-term hierarchy with promotion and eviction rules. Its access-frequency and recency machinery is not automatically appropriate for an infrequently used but exam-critical concept. The simpler hierarchy above is our design synthesis, not a claim that three layers are universally optimal.

Published token-saving headlines often measure answering context, excluding extraction and memory maintenance. Measure the whole study interaction before claiming savings. TOON's own results also vary by data shape: flat CSV can be smaller, while nested data can favor compact JSON. That supports trying compact output where appropriate, rather than adopting another mandatory language. [TOON benchmarks](https://toonformat.dev/guide/benchmarks).

Official lab guidance broadly supports concise skills, selective context and simple tools whose behavior is clear. A small root skill can guide the learning loop; course content, current progress and detailed references should load when relevant. Add guidance for observed failures, rather than spelling out every possible teaching branch. [OpenAI](https://learn.chatgpt.com/docs/build-skills), [Anthropic](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices), [Gemini CLI](https://geminicli.com/docs/cli/skills-best-practices/).

## What to reuse from Pi and learn

The inspected upstream revision is [`7cfd8942f82ab9476e63572387e1fe9bcea5082c`](https://github.com/amosblomqvist/learn/tree/7cfd8942f82ab9476e63572387e1fe9bcea5082c). Pi is a TypeScript/Node harness, not Python. Pi 0.85.1 is already installed locally and configured for the Codex provider. Its terminal renderer supports Markdown and limited LaTeX-to-Unicode conversion; Obsidian supplies richer note rendering.

Reuse the existing conversational runtime and the logger's basic mechanism. `md-log.ts` captures completed user/assistant messages and question results, so the readable lesson can update without a second model pass rewriting the same response. `quiz.ts` and `ask-user-question.ts` already provide structured terminal interactions and can remain optional. The teaching skill is a starting reference, with mandatory research subagents and approval rituals removed for this learner's workflow.

The repository is not turnkey as a whole. Its optional researcher and visual agents fix particular models and rely on external tooling; visual tooling includes a developer-specific local path. Its logger requires an existing linked file, replaces that file during backfill and swallows some write failures. A lean adaptation should automatically prepare a dedicated lesson note and make publication reliable. The learner should not manage `/md-log` commands or risk linking an existing course note. These changes are proposed, not performed. [Logger implementation](https://github.com/amosblomqvist/learn/blob/7cfd8942f82ab9476e63572387e1fe9bcea5082c/extensions/md-log.ts), [upstream setup](https://github.com/amosblomqvist/learn/blob/7cfd8942f82ab9476e63572387e1fe9bcea5082c/README.md).

Input stays in Pi; the upstream logger has no send-back path from Obsidian. It updates at message completion rather than streaming each token. That is the concrete interaction to try first. An embedded terminal or a custom RPC frontend would add maintenance and should follow a demonstrated UX need. Rich interactive visualizations remain a later feature; upstream visual helpers generate static images.

Subscription support is a separate constraint from memory portability. Pi currently documents ChatGPT Plus/Pro access, while direct Claude Pro/Max use through Pi consumes metered extra usage. Anthropic's subscription-backed Agent SDK route is different. Pi with the current Codex setup is the smallest first trial; Claude support under the user's existing-plan constraint needs its own supported route. [Pi providers](https://pi.dev/docs/latest/providers), [Anthropic plan notice](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan).

A concrete community option, [pi-claude-code-provider](https://github.com/chem/pi-claude-code-provider/tree/d1da33523edfd6a5fe43930acdfd3ba35fbf3dcd), runs the installed `claude -p` with normal subscription authentication and keeps Pi as the frontend. Source inspection found material compatibility coupling, including an undocumented Claude setting and cache-marker assumptions. Its [maintenance notes](https://github.com/chem/pi-claude-code-provider/blob/d1da33523edfd6a5fe43930acdfd3ba35fbf3dcd/DEVELOPING.md#prompt-caching) make it a candidate for a limited trial rather than a dependable foundation already established here. Using official Claude Code as another client of the same learning records has lower integration coupling, but changes the interaction host. A single Pi interface with both existing subscriptions remains an unresolved product tradeoff; no local compatibility or billing trial was performed.

## Where Python earns its place

| Approach | Good use | Cost to avoid |
| --- | --- | --- |
| Native read/search/edit | Discover course files, inspect passages, read small current records | Repeated full-history reads or rewriting several copies of progress |
| Small Python helper | Save a meaningful change consistently; calculate review dates and Journal aggregates | Wrapping competent native reads or imposing a large command/schema surface |
| Thin Pi extension | Automatically mirror the lesson and connect lifecycle events to existing operations | Owning the only recoverable learner state or hiding extra model calls in every hook |

Python is convenient because Journal already uses it; it is not inherently more agent-friendly than another language. A native batched read may already be one tool round. A helper improves efficiency only if it reduces model work or failures. Its strongest initial case is reliable persistence and repeated arithmetic. Let the tutor decide what an attempt means and submit a small change while that context is fresh; avoid a second memory agent for every answer.

A tiny save operation can validate a change, avoid duplicate retries and prevent silently replacing newer state. Relevant read queries can be added where they remove repeated scanning. Keep ordinary source exploration available through the agent's familiar tools. The live lesson should usually require neither a memory reload nor a Journal query on every turn.

Journal remains authoritative for recorded time. Reuse its [daily parser](../../../sync/readers/daily.py) and [aggregate interface](../../../sync/ports/daily_aggregates.py) for bounded, read-only queries with explicit missing-data handling. Learning owns goals and qualitative evidence. If shared Python code is justified, place it beside `sync`, while Pi-specific UI hooks remain thin TypeScript. Journal sync should not depend on a model.

Review should serve the selected exam's date, coverage and format, with important foundations continuing afterward. Current exercises can supply review evidence; unknown material must compete for study time too. A useful review plan depends on demonstrated performance and assistance, not just recorded hours. The exact scheduling policy remains provisional. [Spacing and retention-horizon research](https://labs.biology.ucsd.edu/rifkin/courses/bieb100/f14/Cepeda_et_al_2008_Psychological_Science_Spacing_Effects_in_Learning_A_Temporal_Ridgeline_of_Optimal_Retention.pdf).

The installed system and subsequent multi-domain, cross-provider checks are described in [the implementation record](learning-system-implementation.md). The proposal above is research history, not an additional runtime contract.
