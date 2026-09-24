# Agent memory and knowledge representation: 2026 source audit

Research checked on 2026-09-19. Window: 2026-01-01 through 2026-09-19. This note supplies external evidence for the learning-subsystem audit; it does not assess local implementation. Sources are first-party lab publications, dated technical guidance, or papers with verified author affiliations. Research findings, production examples, and product documentation have different evidential weight.

No universal agent-memory standard emerges from these sources. They support explicit state, recoverable evidence, selective context, temporal maintenance, and behavioral evaluation. None establishes that every application needs a vector database, knowledge graph, autonomous consolidation, or fine-tuning. Those choices require task-specific evidence.

## Dated primary evidence

### 1. OpenAI: memory quality is behavioral and temporal

[Dreaming: Better memory for a more helpful ChatGPT](https://openai.com/index/chatgpt-memory-dreaming/) — **2026-06-04**, OpenAI research/product release.

OpenAI describes background synthesis from conversation history and evaluates three objectives: carrying useful context forward, following preferences and constraints, and remaining correct as time passes. It exposes synthesized memory through a user-reviewable summary that supports corrections. This is evidence for evaluating downstream behavior and stale-state handling, beyond retrieval accuracy.

**Application:** Test whether a correction changes later answers, an expired plan stops influencing present recommendations, and relevant preferences survive session boundaries. Make stored interpretations inspectable and correctable.

**Limit:** Product-level report, not a complete reproducible implementation or proof that background synthesis will improve a small personal learning system. It does not disclose a universal schema or consolidation algorithm.

### 2. OpenAI: scoped correction memory and live validation

[Inside OpenAI’s in-house data agent](https://openai.com/index/inside-our-in-house-data-agent/) — **2026-01-29**, OpenAI engineering case study.

The agent separates metadata, human annotations, code-derived context, institutional knowledge, reusable corrections, and runtime inspection. Memory retains non-obvious filters and constraints, supports user edits, and has personal/global scopes. Live queries resolve missing or stale information. Evaluations compare executed query results with manually authored reference results.

**Application:** Give facts, learner observations, user preferences, and inferred teaching advice distinct meanings. Preserve scope. Recheck changeable sources. Test the consequences of retrieved knowledge, not just whether a relevant record appeared.

**Limit:** An internal analytics agent with a large data estate; its embedding pipeline is an implementation choice, not evidence that embeddings are necessary here.

### 3. OpenAI: small entry points into maintained knowledge

[Harness engineering: leveraging Codex in an agent-first world](https://openai.com/index/harness-engineering/) — **2026-02-11**, Ryan Lopopolo, OpenAI engineering.

The team reports replacing a large instruction manual with a short map into versioned repository knowledge. It indexes deeper documents, records verification status and decisions, checks structure and cross-links mechanically, and routinely repairs stale documentation.

**Application:** Keep the initial context small. Resolve source records and detailed evidence on demand. Validate references and generated indexes, and make their maintenance an explicit operation.

**Limit:** A production engineering experience report, not a controlled comparison proving a particular filesystem hierarchy superior. Its work began in 2025; the cited publication and guidance are from 2026.

### 4. Anthropic: persistent memory and active context solve different problems

[Context engineering: memory, compaction, and tool clearing](https://platform.claude.com/cookbook/tool-use-context-engineering-context-engineering-tools) — **2026-03-20**, Isabella He, Anthropic cookbook, explicitly dated on the page.

The guide distinguishes persistent external notes, conversation compaction, and clearing old tool results. Memory carries selected information across tasks/sessions; compaction maintains long conversations; clearing removes outputs that can be fetched again. The mechanisms can be composed.

**Application:** Separate durable learning records from a task's selected context. A retrieval packet should be a disposable view with routes to its sources, not the only surviving knowledge.

**Limit:** Technical guidance and examples, not a benchmark proving optimal retrieval or pedagogical memory. The guide references older research; those older works are not counted as 2026 evidence here.

### 5. Anthropic: preserve the recoverable event stream

[Scaling Managed Agents: Decoupling the brain from the hands](https://www.anthropic.com/engineering/managed-agents) — **2026-04-08**, Anthropic engineering.

Managed Agents stores session events durably outside the context window and exposes positional retrieval through `getEvents()`. The article explains that compaction loses information unless original events remain stored, and separates recoverable storage from model-dependent context transformations.

**Application:** Keep source evidence recoverable when producing summaries or current-state projections. A projection should retain enough identifiers to reopen the evidence and revise an earlier interpretation.

**Limit:** A hosted-agent architecture report. It does not require storing all raw content forever or prescribe a retention policy for personal educational records.

### 6. Anthropic: evaluate complete agent behavior

[Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) — **2026-01-09**, Anthropic engineering.

The guidance distinguishes transcripts from actual outcomes, recommends multiple trials, balanced cases where a behavior should and should not occur, isolated trial state, and deterministic grading where practical. It recommends beginning with 20–50 realistic cases rather than waiting for a large benchmark.

**Application:** Complement deterministic storage/retrieval tests with a small set of actual agent tasks: corrected preference, uncertain mastery, irrelevant historical failure, conflicting evidence, missing source, and stale retrieval. Record outcome quality, unnecessary recall, tokens, and latency. Calibrate subjective grading against human judgments.

**Limit:** Evaluation methodology does not itself establish learning effectiveness. Teaching quality and durable human learning need their own outcomes; a model's confident self-assessment is insufficient.

### 7. Google-affiliated research: explicit execution state has bounded applicability

[SKILL.state: Scalable Long-Horizon Agent Skills](https://arxiv.org/html/2608.26263v3) — **first submitted 2026-08-26**, inspected version **2026-09-02**; [submission history](https://arxiv.org/abs/2608.26263). Sanket Badhe, Priyanka Tiwari, Jonghyun Chung; paper lists **Google LLC and Purdue University** affiliations. Do not call this a Google DeepMind standard.

The paper studies immutable procedural instructions plus mutable structured execution state and the latest observation, with runtime validation of proposed state changes. It reports gains on procedural benchmarks. Its limitations explicitly include unknown schemas, earlier observations whose future relevance was missed, historical auditing, and concurrent multi-agent writes.

**Application:** Use validated current-state projections for well-defined state. Retain separate evidence when the system must explain or reconsider a learner judgment.

**Limit:** Research on procedural execution, not a general proof that conversation history or educational evidence should be discarded. Google affiliation does not make the proposal company-wide policy.

### 8. OpenAI: exploration may need retained reasoning and compaction

[How enabling two settings tripled our scores on the ARC-AGI-3 benchmark](https://openai.com/index/how-two-settings-tripled-our-arc-agi-3-scores/) — **2026-07-29**, OpenAI research report.

OpenAI reports that retaining reasoning through its supported API and using compaction improved public-set gameplay performance and reduced output tokens compared with a harness discarding reasoning and truncating old history. It recommends those API capabilities for its models.

**Application:** Evaluate the model and its real harness together. Do not assume that a compact local state representation can replace the model's supported conversation continuity during exploratory work.

**Limit:** Model- and benchmark-specific. This does not imply exposing private model reasoning, storing hidden reasoning in the learning database, or overriding the deployed runtime's context management.

### 9. Google Cloud: structured memory is a supported product pattern

[What’s new in Gemini Enterprise Agent Platform](https://cloud.google.com/blog/products/ai-machine-learning/whats-new-in-gemini-enterprise-agent-platform) — **2026-07-29**, Mike Clark, Google Cloud product management.

The announcement describes Agent Memory Bank using structured schemas to extract and maintain conversation context, including preferences, decisions, and account history. It also distinguishes evaluation from observability and describes monitoring behavioral drift.

**Application:** Explicit fields and maintained state are consistent with current major-provider practice. Instrument actual decisions separately from storage mechanics.

**Limit:** Product announcement, not a comparative research result or Google DeepMind memory standard. It offers no basis for requiring that service or architecture locally.

### 10. Google DeepMind researchers: memory is an attack surface

[AI Agent Traps](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6372438) — **written 2026-03-08**, **posted 2026-03-28**. Matija Franklin, Nenad Tomašev, Julian Jacobs, Joel Z. Leibo, Simon Osindero; the author page lists Google DeepMind affiliations. DeepMind's [2026-06-11 research announcement](https://deepmind.google/blog/investing-in-multi-agent-ai-safety-research/) links this paper as its work.

The paper's taxonomy includes attacks on long-term memory, knowledge bases, and learned behavioral policies. It frames open defense questions rather than supplying a validated universal memory architecture.

**Application:** Preserve source identity and trust level when external material is summarized into durable knowledge. A quoted instruction or model inference must not silently become a user preference or authoritative teaching policy.

**Limit:** The inspected abstract and official cross-reference support the taxonomy and affiliation. No attack-rate numbers or specific defense-effectiveness claims are drawn from it.

### 11. Anthropic: summarization must not raise source authority

[How we contain Claude across products](https://www.anthropic.com/engineering/how-we-contain-claude) — **2026-05-25**, Anthropic engineering.

The article identifies persistent memory poisoning and warns that treating a sub-agent's summary as more trustworthy than its underlying tool output can escalate trust. It argues for deterministic environmental boundaries alongside model-level safeguards.

**Application:** Preserve attribution through memory extraction and agent handoffs. Data may inform a recommendation; writing it into an internal store must not convert it into permission or instruction.

**Limit:** Security engineering guidance, not evidence that ordinary personal learning records need an enterprise security stack. Scale controls to actual write paths and external inputs.

## Current technical documentation: date qualification

[Set up Memory Bank](https://docs.cloud.google.com/gemini-enterprise-agent-platform/scale/memory-bank/setup) carries **last updated 2026-09-18**, but no first-publication date was verified. It documents configurable extraction topics, consolidation, revisions, and expiry. This is current technical corroboration, **not counted as newly published 2026 research**. The July 29 announcement above independently dates the structured-memory product pattern.

Undated living documentation cannot establish when a recommendation originated. A crawl date, search-engine freshness label, conference year, or arXiv revision date is insufficient to classify a paper as new in 2026.

## Explicit exclusions

| Work | Verified reason for exclusion from new 2026 research |
| --- | --- |
| [ReasoningBank](https://arxiv.org/abs/2509.25140) | First submitted 2025-09-29; revised 2026-03-16 and accepted at ICLR 2026. Google's [2026-04-21 blog](https://research.google/blog/reasoningbank-enabling-agents-to-learn-from-experience/) discusses that earlier work. |
| [Evo-Memory](https://arxiv.org/abs/2511.20857) | First submitted 2025-11-25; revised 2026-05-18. |
| [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) | Published 2025-09-29. The separately dated 2026 cookbook is eligible guidance. |

## Implications to test against the local system

The strongest candidate improvements are semantic, not a change of database: separate evidence from interpretation and current state; keep corrections and temporal scope explicit; preserve evidence references when consolidating; select context for the current decision; and evaluate whether the agent uses it appropriately.

A lean design can satisfy these principles with typed records and Markdown. Introduce semantic search only after measuring missed paraphrases; graph relationships only when required queries are relational; background consolidation only when repeated summaries or stale state are measurable problems. These are engineering inferences from the evidence, not lab-mandated standards.

The research does not justify claiming state-of-the-art performance without a relevant comparison. It supports saying that an architecture follows several current practices, while distinguishing verified implementation properties from unmeasured agent behavior and unmeasured human learning outcomes.
