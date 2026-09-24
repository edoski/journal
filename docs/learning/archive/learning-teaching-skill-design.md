# Continuous teaching through one shared skill

Research checked 18 September 2026. No implementation, installed settings, or vault records changed.

## Verdict

Steer the existing canonical skill toward a continuous lesson built from short, coherent teaching steps. Keep purpose, calibration, continuity, and delivery rules explicit; let the model choose the explanation and emerging structure. The same authored Markdown should serve native conversations and the Obsidian lesson, without a second rewriting model or host-specific teaching patches.

## Findings

1. **Current Anthropic guidance supports judgment where context matters.** Its live, undated authoring guide advises adding only information the model needs and matching specificity to task fragility. It recommends natural-language guidance with more freedom when several approaches are valid and decisions depend on context; exact procedures suit fragile operations. Applied here, adaptive teaching deserves concise direction while revision-checked persistence retains its precise contract. This application is an inference, not a tutoring experiment. [Anthropic authoring guide](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices).

2. **Current OpenAI guidance favors focused instructions before extra machinery.** Its live, undated skill guide recommends one job per skill and instructions instead of scripts unless deterministic behavior or external tooling is needed. Skill metadata loads before the selected body. That supports one teaching workflow using the existing storage helper; it does not establish that any particular prompt guarantees consistent lesson quality. [OpenAI skill guide](https://learn.chatgpt.com/docs/build-skills).

3. **Progressive disclosure is conditional retrieval, not mandatory fragmentation.** The live, undated Agent Skills specification separates startup metadata, the activated body, and resources loaded as needed. It recommends direct relative references and focused reference files. The lesson-writing rule is needed throughout teaching, so keeping it inline is a design inference consistent with that structure. The specification's size guidance is a ceiling recommendation, not a reason to expand this approximately 502-word skill. [Agent Skills specification](https://agentskills.io/specification).

4. **Matt Pocock's current writing guidance distinguishes predictable behavior from identical output.** At the inspected repository HEAD, `c55ee460` (commit dated 18 September 2026), `writing-for-agents` recommends keeping common material inline, disclosing branch-specific material, colocating related rules, and pruning duplication and instructions that change no behavior. It accepts reference-oriented guidance without a step sequence. These are practitioner heuristics, not measured universal laws about models. [Pinned published skill](https://github.com/mattpocock/skills/blob/c55ee46073ed923f86ce59a5eb3b6d895095d1b7/skills/productivity/writing-for-agents/SKILL.md).

5. **Pocock's teaching example supplies useful scope, not an architecture to transplant.** The same current snapshot describes a lesson as one tightly scoped thing connected to the learner's purpose and advocates short lessons that build on one another. Its implementation also requires HTML lessons, workspace files, reusable components, and repeated follow-up invitations. Borrow the purposeful scope and continuity; those additional mechanisms conflict with this project's desired native, quiet delivery. These are the author's design choices, not evidence that short lessons always outperform alternatives. [Pinned published teaching skill](https://github.com/mattpocock/skills/blob/c55ee46073ed923f86ce59a5eb3b6d895095d1b7/skills/productivity/teach/SKILL.md).

The installed `/Users/edo/.agents/skills/writing-great-skills/SKILL.md` and its glossary were inspected as requested. That path is absent from the current upstream tree; the live `writing-for-agents` source above is the current reference. The installation's age and exact migration history were not established. All three official guides above were accessed live in 2026 but show no publication date establishing a 2026 release; the pinned examples are a verified 2026 repository snapshot.

## Minimal synthesis

**Make “continuous lesson” the organizing idea.** A reply advances a coherent part of the current subject, retaining enough context to read naturally beside earlier teaching. The broader course or topic gives direction; it need not become a visible outline every turn. A clarification may be brief, a derivation may need several connected paragraphs, and a useful question may be the whole next step. “Bite-sized” describes meaningful scope, not a fixed word count or one-paragraph limit.

**Separate stable obligations from discretionary form.** Stable obligations are the learner's goal, evidence-based starting point, bounded calibration, scientific accuracy, continuity, and one delivery of teaching. Explanations, examples, questions, headings, equations, and diagrams are choices serving the current understanding. A repeated introduction/objective/example/quiz/recap skeleton would constrain those choices without evidence that the constraint helps.

**Keep one canonical owner.** The teaching rule belongs in `learning/skills/learn/SKILL.md`; the existing live Claude adapter and Codex/Pi wiring should select it. Obsidian should preserve the teaching as authored. Projection code may select public teaching events and preserve Markdown; rewriting pedagogy or inventing chapter structure is not its role. This is a project design recommendation, not a cross-host platform guarantee.

**Use references only for a demonstrated branch.** No new reference or skill is warranted for this short presentation rule. If later failures require several contrasting teaching examples, a single conditional examples reference may earn its retrieval cost. Keep the main outcome and essential calibration safeguards inline. Do not make every lesson load this research report or a style manual.

## Candidate canonical wording

Replace the existing presentation restrictions with this compact direction, reconciling adjacent sentences rather than appending it as another layer:

> Teach as a continuous lesson, advancing one coherent, bite-sized step toward the learner's goal. Build on the established understanding and current question, with enough context for the teaching to read naturally on its own. Let the session's structure emerge from the subject and learner; use headings, examples, questions, and visuals when they clarify that structure. Match the depth to the task and the learner's response. Complete necessary internal work quietly, then deliver the teaching once in native Markdown that also reads cleanly in the saved lesson. Resume from the unfinished learning step.

This is proposed wording, not a complete replacement skill. Keep proactive task-bounded calibration beside it, including the stopping condition of a credible foundation and actionable gap **or** sufficient task competence, and the direct-explanation override. Keep independent versus assisted evidence, source references, uncertainty, and storage safety intact.

## Replace conflicts instead of accumulating rules

| Existing instruction | Reconciliation |
|---|---|
| “Answer only the learner's current question or reasoning step” | Preserve scope while permitting a coherent teaching step and necessary connecting context. |
| “Diagnose difficulties without turning every explanation into an assessment” | Replace with the already proposed proactive, bounded calibration rule; preserve direct explanation when requested. |
| “Be concise” plus a long omission list | Express the positive target once: coherent, bite-sized teaching with detail justified by understanding. Retain only hard exceptions still needed. |
| “Save meaningful changes after teaching” | Clarify the delivery sequence so saving does not cause the same explanation before and after a tool call. Prepared content is not evidence of delivery or learner understanding. |
| “Resume the saved unanswered question” | Preserve that pending question when relevant, within the broader unfinished learning step; do not restart the lesson's introduction. |

The single-authored-response rule belongs to the shared core. It should resolve repeated teaching across hosts rather than adding a Claude exception. If a response has already been delivered, bookkeeping does not justify delivering it again. This does not prohibit an intentional question followed by later feedback after the learner answers.

## Confidence

High for the live sources' documented guidance and the pinned examples' actual content. Moderate for the proposed synthesis: it fits the requested experience and current architecture, but no model runs established its reliability. Concise guidance preserves discretion; it does not prove that every host will produce equivalent teaching.

## Gaps

No source establishes an optimal prompt length, lesson size, heading frequency, or universally best tutoring template. Practical validation should inspect a small consecutive exchange: does each response advance learning, does the sequence read continuously, and does the saved lesson contain teaching once? Those are acceptance questions, not instructions to add another fixed response format. Existing presentation work owns the illustrative lesson; this research adds no competing prototype.
