# Current learning preferences: research and design

Checked 2026-09-18. Narrow followup to [retrieval research](learning-retrieval-frontier-2026.md). Two new sources; two previously verified 2026 studies reused. Research only: no code, vault, configuration or model-test changes.

## Verdict

Use one mutable, scoped statement of the learner's **current preferences**, shared across hosts. Explicit durable feedback should replace or refine the applicable preference; agents should not have to resolve a chronological list of contradictory preferences on every read. This is a practical design supported by limited research and current documentation, not a proven optimal personalization architecture.

## Findings

1. **Feedback can update explicit preference memory.** *Learning Personalized Agents from Human Feedback* (PAHF), arXiv v1 **2026-02-18**, studies initial personalization and preference shifts in manipulation and shopping. Its memory interface supports updating existing notes in place, and its examples distinguish global preferences from contextual exceptions. Feedback plus memory outperforms the tested restricted-feedback baselines. Limitations matter: users are simulated, principal agent models are GPT-4o/4.1, and the authors explicitly leave inconsistent or mistaken feedback unresolved. Their implementation includes embeddings and an extra feedback-detector call; the results do not isolate whether those components are necessary. **Inference:** adopt feedback-driven updates, without copying the additional model loop or claiming proven tutoring gains. [Full paper, §§3.2–3.4 and Appendix B](https://arxiv.org/html/2602.16173v1); [submission date](https://arxiv.org/abs/2602.16173).

2. **Retrieving a prior preference is not resolving which preference applies now.** *Can Agent Memory Systems Track Evolving State?*, arXiv v1 **2026-08-20**, explicitly handles supersession and dependent conclusions. Its findings support treating current state as a separate concern from historical recall. Synthetic scenarios, short histories, single runs and untested frontier answerers limit generalization; its full state-extraction pipeline is far too call-heavy to import by default. **Inference:** retain one applicable current rule per preference and scope. Date order is supporting evidence, not a substitute for understanding whether feedback changes a default or adds an exception. [Full paper and limitations](https://arxiv.org/html/2608.19652v1); [submission date](https://arxiv.org/abs/2608.19652).

3. **Current official guidance separates maintained instructions from learned memory.** Claude Code's memory documentation is **undated**, inspected **2026-09-18**. It distinguishes user-written instructions from agent-written preferences and corrections, makes memory editable, and warns that contradictory instructions may be followed arbitrarily. It also distinguishes asking Claude to remember something from explicitly asking it to modify `CLAUDE.md`. These are documented product behaviors, not experiments or a universal rule across hosts. **Inference:** the canonical learning skill can define stable teaching and update behavior while the learner's changing preferences live in a separate shared record. This separation does not require forbidding deliberate user-requested skill changes. [Current official documentation](https://code.claude.com/docs/en/memory).

4. **Repeated rewriting cannot recover omitted evidence.** *Does Your Agent's Memory Survive a Model Upgrade?*, arXiv v1 **2026-09-04**, finds construction loss in compressed notes and direction-dependent repair benefits from retained source history. It tests two similarly sized models and scripted histories, not ongoing tutoring or autonomous prompt evolution. **Inference:** preserve a lightweight link to the actual feedback supporting a current rule, when that source already exists. Do not use the previous agent's speculation or rewritten summary as fresh user endorsement. This does not require loading old preference versions into normal context. [Full paper, §§4.4–4.6](https://arxiv.org/html/2609.05339v1); [submission date](https://arxiv.org/abs/2609.05339).

## Proposed behavior

The shared record should say how to teach **now**. Use concise rules with their relevant scope, update date and provenance where useful; keep the policy readable without replaying the conversation. Claude, Codex and Pi read this same current state through the existing local core. They update it while handling feedback in their ordinary turn, without a separate reflection agent, embedding index or model pass.

| Signal | Example | Treatment |
| --- | --- | --- |
| Explicit durable preference | “When teaching me, explain the intuition before the formula.” | Add or replace the applicable shared preference. |
| Explicit correction to a durable preference | “I no longer want a quiz after every explanation.” | Remove or revise the old rule; do not leave both active. |
| Scoped durable exception | “For oral-exam practice, ask me questions before explaining.” | Store that scope; keep the general default for other study. |
| Transient task instruction | “For this exercise, give me the answer directly.” | Follow it here; leave the durable preference unchanged. |
| Inferred habit | The learner often requests examples. | Treat as tentative context, not an authoritative permanent rule. |
| Ambiguous feedback | “That's too much.” | Adapt the present answer; seek scope clarification only when it materially affects a later durable update. |
| Silence or generic approval | “Thanks.” | Do not infer a new durable teaching policy. |

Prefer the learner's current explicit request for this task over a stored default, subject to the host's instruction hierarchy. A new explicit durable correction supersedes the old preference only within the same scope; a task-specific exception does not erase it. Inferences must not override explicit preferences. Resolve genuine unresolved scope conflicts rather than choosing by timestamp or retaining contradictory active rules.

If a concise preference needs an example or rationale to prevent overgeneralization, retain that detail with the rule. “No quizzes” and “Do not interrupt explanations with unsolicited quizzes; questions are welcome during requested exam practice” encode different policies. Crystallization should remove contradiction, not erase meaning.

Keep only the current policy in ordinary context. Existing source artifacts and revision handling can support diagnosis or correction without turning preferences into a mandatory chronological event log. Updates from concurrent agents should use the shared core's revision checks and merge against fresh state, so one correction does not overwrite an unrelated newer correction.

## Self-modification boundary

Personalization changes the learner record; it does not automatically rewrite the canonical skill, tool contract or generic pedagogy. Otherwise a temporary complaint, mistaken inference or narrow success could become a permanent rule for every future lesson. Those failure modes are **design risks inferred from scope and evidence loss**, not measured failure rates established by these sources.

Reflection may identify a possible preference, but is not evidence that the user holds it. Do not let agents recursively validate their own summaries or accumulate “lessons learned” as new authority. A deliberate request to change the shared teaching method remains ordinary reviewable maintenance, separate from routine preference learning.

## Confidence

High confidence in the dates, documented instruction/memory distinction and the studies' stated limitations. Moderate confidence that mutable scoped preferences and explicit supersession fit this requirement. No inspected evidence proves the proposed admission rules, representation or zero-extra-call implementation optimal.

## Gaps

The sources do not demonstrate reliable automatic separation of durable feedback from temporary requests, robust handling of contradictory user feedback, or improved learning outcomes across Claude/Codex/Pi. Nor do they establish the safety or benefit of autonomous canonical-skill rewriting. Actual corrections and cross-host reuse can reveal whether the current policy preserves scope; introducing a reflective subsystem would require separate evidence.
