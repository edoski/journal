# Learning audit: pedagogical validity and learner evidence

Checked 19 September 2026. Read-only inspection of code, skill instructions and synthetic temporary state; no learner records or application code changed. Research below was published between 1 January and 19 September 2026. Publication date governs eligibility; some studies collected their data earlier.

The subsystem has a credible pedagogical design, but no evidence yet establishes that its tutors consistently implement that design or improve durable learning. Its strongest feature is the explicit separation of intended teaching, observed performance and assisted performance. Its weakest boundary is the conversion of those observations into durable summaries and future study decisions. That conversion remains largely unconstrained model judgment.

## What is already sound

The [canonical skill](../../../learning/skills/learn/SKILL.md:10) adapts help to the actual request and permits direct explanations. It requires task-bounded calibration and meaningful retrieval/transfer checks, without constant quizzes (line 18). It distinguishes a successful answer after a hint from independent performance, and prepared teaching from delivered teaching or understanding (line 30). It also prohibits recording the tutor's error as the learner's misconception (line 14). These are substantive safeguards, not merely presentation preferences.

The [task route contract](../../../learning/skills/learn/references/lessons.md:37) makes prerequisite links local to a teaching plan; it explicitly says that a plan is not mastery (line 41). [Validation](../../../learning/task_context.py:24) checks the route's status, references and acyclicity. A plan's `agreed` status still depends on the tutor correctly interpreting learner intent, as it should; graph structure cannot establish agreement or comprehension.

The [course contract](../../../learning/skills/learn/references/course.md:5) distinguishes sourced assessment requirements from patterns inferred from past papers. Its check date is not an automatic freshness guarantee. [Planning](../../../learning/planning.py:46) keeps unmapped, unavailable and unrecorded study activity distinct; the skill expressly says that time spent is not mastery. Preserve these distinctions.

## Findings and worthwhile changes

### P1: Preserve the evidence behind study decisions

`plan()` projects each topic down to `title`, `summary`, `gap` and `status`, discarding observation handles, observation dates and assistance conditions ([planning.py:69](../../../learning/planning.py:69)). The test deliberately asserts that observations are absent ([test_planning.py:62](../../../tests/learning/test_planning.py:62)). This is efficient, but it means a tutor responding to “what should I study?” can see an independent-understanding claim without seeing the assisted attempt that should qualify it.

A synthetic run reproduced this boundary: a topic summary claiming independent understanding and an observation describing repetition after a full worked example were accepted together. Planning returned only the independent-understanding summary. This does **not** prove that a live tutor has made that mistake; it proves that the planning surface cannot expose the contradiction on its own.

Keep the compact planning surface. Carry supporting observation handles and an explicit indication of whether the claim is evidence-linked; before substantially changing priorities or extending a review interval, retrieve the relevant attempts and corrections. Existing topic `observations` links can support a lean first iteration. A larger learner-model database is unnecessary. Treat the topic summary as a revisable interpretation, with observations as its basis, rather than letting the summary become self-validating evidence on successive handoffs.

Acceptance: a planning decision based on an assisted success remains assisted after a fresh provider resumes; a corrected observation cannot silently leave the original independent-success claim driving future reviews.

### P1: Evaluate the learner-state decisions, not only persistence

Current tests establish storage/projection behavior; they do not establish that a tutor chooses an appropriate next step or records help accurately. The top-level skill contains good policy, but its effectiveness across models and hosts remains unmeasured.

Use a small fixed set of transcript cases with human-written expected evidence distinctions: independent answer, successful answer after a hint, answer copied from a worked example, same-example repetition, fresh transfer, conflicting later evidence, and a tutor-originated mistake. Inspect both the next teaching action and saved patch. Include a fresh-provider resumption. The critical failure is unsupported promotion of ability or misattributed error, not a mismatch in prose style.

For actual learning value, a successful conversation or polished lesson is insufficient. A few naturally timed, unassisted delayed or novel problems can reveal whether useful knowledge survived the interaction. These observations can use the same ordinary observation system. This is a design proposal, not a claim that an informal single-user evaluation estimates a causal treatment effect.

### P2: Make diagnostic attempt conditions consistently recoverable

[Records](../../../learning/skills/learn/references/records.md:28) deliberately make date, task, response, assistance, uncertainty and references optional. [Validation](../../../learning/memory.py:176) requires nonempty text and valid topic links, but does not enforce the semantics of diagnostic evidence. [Save](../../../learning/memory.py:551) assigns observation handles without assigning observation dates. The record-level update time changes with later edits and is not the time of each attempt.

This permissiveness is useful for ordinary notes. It is weaker for claims such as “retained this after a week” or “solved independently”: these require attempt conditions. An observation without a date or assistance history should remain unknown on those dimensions; never recover a precise date from the scope's latest save time.

Start with a narrow diagnostic-attempt convention: preserve the actual task/prompt, learner response when diagnostic, help already available and attempt time when known. Distinguish a storage-assigned `recorded_at` from learner-event time. An explicit unknown assistance condition is better than silently assuming none. If the proposed evaluations show repeated inconsistency, promote a small attempt contract into validation. Do not force every teaching event into a long form, and do not introduce a global mastery percentage without calibrated measurements.

### P2: Give review changes an inspectable basis

The [review helper](../../../learning/memory.py:27) computes dates and caps newly requested intervals before an upcoming exam. It does not estimate forgetting or mastery, and should not be described as an adaptive spacing model. A review with only a due date is accepted even though the [record instructions](../../../learning/skills/learn/references/records.md:34) request a reason and retrieval task. The synthetic run confirmed this.

The useful addition is an evidence-linked review decision: the relevant attempt, what the next review should test, and why its timing changed. Require a usable retrieval task/reason when creating a review; an imported or unknown rationale must remain explicit. Record a meaningful review result before replacing its current scheduling state. Preserve the existing rule that unchanged intervals are not resent.

No reviewed 2026 source validates a particular interval formula for this system. A large spaced-repetition scheduler, fitted knowledge-tracing model or prerequisite ontology would exceed the available evidence and current data. Revisit only after actual repeated-review data reveals a scheduling problem.

## Knowledge representation: what the graph should mean

Keep three concepts distinct: curriculum relationships, a task's proposed teaching route, and claims about this learner. A prerequisite edge says that one concept helps another; a plan node says that the tutor intends to teach it; neither says the learner can use it independently. The code already supports topic links and local plan dependencies, and the skill already states this separation.

For misconceptions, save the actual observed error and uncertainty about its cause. One wrong response may reflect arithmetic, notation, ambiguity or a conceptual misunderstanding. A lasting label should be supported by diagnostic evidence, and later successful transfer should be a new event rather than deletion of history. The current correction mechanism correctly distinguishes correcting a bad record from genuine improvement ([records.md:30](../../../learning/skills/learn/references/records.md:30)). Preserve that distinction when summarizing.

Completing/removing a task does not establish mastery: the user may have finished reading a supplied solution. Store a meaningful final attempt if one occurred; otherwise completion should remain a workflow fact. A full archival task graph is unnecessary for that purpose.

## What 2026 major-lab evidence actually supports

**Anthropic, 29 January 2026.** The coding skill-formation experiment found worse immediate comprehension with AI assistance on an unfamiliar library: quiz means were 50% with AI and 67% without it. Conceptual inquiry and explanation-seeking appeared in stronger-performing interaction patterns, but that qualitative comparison was not causal. The study measured short-term coding comprehension, not long-term tutoring efficacy. It supports treating task completion and learner competence separately; it does not prove that a mandatory Socratic template works. [Research article](https://www.anthropic.com/research/AI-assistance-coding-skills), [paper, first posted 28 January](https://arxiv.org/abs/2601.20245).

**OpenAI, 4 March 2026.** Its Learning Outcomes Measurement Suite separates model behavior, learner response and longitudinal outcomes, including recall and metacognitive behavior. The announcement describes validation still underway. It supports measuring the learning interaction and later outcomes separately; it is not a published compliance standard or proof that adding its labels makes this subsystem effective. [Official announcement](https://openai.com/index/understanding-ai-and-learning-outcomes/).

**Google LearnLM team and Fab AI, 15 May 2026.** The Sierra Leone classroom RCT reported an intent-to-treat mathematics gain of 0.258 standard deviations across 1,763 students in 48 classrooms. It evaluated a teacher-led package with paired student use and curriculum-aligned assessment, not an isolated tutor-memory architecture. Data were collected in October–December 2025; the report was published in 2026. Positive results cannot be transferred directly to independent university study or used to justify a particular memory graph. [Technical report](https://storage.googleapis.com/deepmind-media/LearnLM/learnLM_sierraleone_may26.pdf).

**Google LearnLM/Fab AI, 9 June 2026.** The follow-up playbook separates intervention delivery from outcome measurement, discusses comparable assessment difficulty, and samples both instructed content and broader skills to address transfer. It explicitly limits external validity and acknowledges that the two-arm design estimates the intervention package, rather than isolating individual mechanisms. The practical lesson here is to evaluate meaningful unassisted performance separately from a tutor's own judgment. [RCT playbook](https://storage.googleapis.com/deepmind-media/LearnLM/learnLM_sierraleone_playbook_jun26.pdf).

These are current research findings and methodological recommendations, not a common set of lab standards. None compares JSON versus graph storage, proves a universal review interval, validates a numeric mastery score from chat, or establishes that this particular implementation improves retention. Undated living documentation and the older LearnLM reports were excluded from the 2026 research evidence.

## Investigation limits

No private learner transcripts were inspected, no paid model evaluations ran, and no changes were made to live memory. The synthetic check used a temporary directory and actual `save`, `read` and `plan` functions. It confirmed information loss and permissive acceptance, not the frequency of real pedagogical failure. Existing design notes were consulted for intent but contain obsolete schema examples; current code and canonical instructions were the implementation authority.

The lean next step is an evidence-linked decision path plus a few realistic decision evaluations. The design already contains the core pedagogical distinctions; strengthening their survival through summaries and handoffs has a clearer benefit than replacing the subsystem with a general knowledge graph or automated mastery estimator.
