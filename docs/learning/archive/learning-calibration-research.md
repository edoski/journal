# Learning calibration research

## Verdict

At the start of substantive or new-topic teaching, actively establish the relevant understanding boundary through an adaptive loop bounded by the learner's task. Find a credible foundation and the next gap, or sufficient competence for the requested task; neither exhaustive prerequisite mapping nor an eventual wrong answer should be mandatory.

## Findings

1. **The original imposes substantially more than calibration.** At the pinned commit it requires probing every relevant strand until both success and failure appear, then a visible plan, dependency graph, and approval before teaching. Its claim that understood facts do not decay is unsupported by the sources reviewed. Retain its attention to reasoning and foundations, not these universal rules. [Original skill, commit 7cfd894](https://github.com/amosblomqvist/learn/blob/7cfd8942f82ab9476e63572387e1fe9bcea5082c/skills/teach/SKILL.md)

2. **The local skill already has useful safeguards, but its calibration action is implicit.** It separates coverage from demonstrated understanding, records assistance and uncertainty, and asks only what changes the next step. Add an explicit small loop rather than another mandatory phase. [Current canonical skill](../../../learning/skills/learn/SKILL.md)

3. **Reasoning and transfer matter; prompt dependence is evidence too.** The National Research Council describes how understanding supports transfer, while prior knowledge can help or mislead. It also describes graduated prompting: the amount and kind of help needed reveal more than a single pass/fail outcome. This supports asking for a short explanation or application and recording the help actually given. It does not establish an optimal question count for conversational tutors. [How People Learn, chapter 3, especially pp. 55–60 and 65–71](https://www.nationalacademies.org/read/9853/chapter/6)

4. **Retrieval has stronger support than mandatory diagnostic pretesting.** The IES guide rates quizzes that re-expose students to content and deep explanatory questions as strongly supported, but introductory prequestions and quizzes for identifying learning needs as minimally supported in that 2007 review. It also recommends alternating worked examples with independent problems. These ratings support a flexible mix of explanation and attempts; they do not prove every exchange needs a question. [IES practice guide](https://ies.ed.gov/ncee/wwc/PracticeGuide/1)

5. **Immediate performance and confidence do not settle durable retention.** In two prose-learning experiments, repeated study outperformed testing on an immediate test, whereas prior testing produced better delayed retention; repeated study also increased confidence. This justifies retaining uncertainty about later recall. The experiment does not show that every kind of conceptual understanding decays at the same rate. [Roediger and Karpicke, 2006; publisher abstract](https://www.psychologicalscience.org/journals/psychological-science/j.1467-9280.2006.01693.x/)

## Recommended loop — design inference

At the start of substantive or new-topic teaching, actively establish where the learner can reason independently and where help becomes useful. Start with a short explanation, prediction, or attempt relevant to the requested task; an existing current attempt can already supply that evidence. Retrieve relevant saved evidence to aim the probe, considering its task, date, assistance, and scope; do not treat old notes as present mastery or discard useful evidence automatically.

Ask one short question at a time and wait. Choose the next question from the response, checking linked prerequisites until there is a credible starting foundation and a concrete gap, or sufficient demonstrated competence for the task. A direct-explanation request can override this intake, and an explicit lack of knowledge can justify beginning with a small foundation rather than administering an empty quiz.

Adapt to the response. If reasoning is sound at the requested level, proceed. If an error's cause matters but remains ambiguous, ask one targeted follow-up. If the missing step is clear, teach it. Move toward a prerequisite only when the current difficulty points there; do not survey every possible dependency.

Teach one coherent step, connecting it to what the learner has shown. Use an attempt or nearby application when independent use is the goal; narrate or work an example when that better serves the request. Calibration and teaching may interleave.

**Stop initial probing when a credible foundation and actionable gap are established, the requested level has been demonstrated, or the learner requests delivery.** Success at the task's level is a legitimate stopping point without finding a ceiling. During teaching, re-probe only when the next decision needs it. Continuing uncertainty is a reason to teach a small foundational step and observe its use, not prolong an intake quiz indefinitely. There is no research-backed universal threshold of one, two, or three questions here.

**Classify evidence narrowly.** A solution with a relevant hint or worked example available demonstrates assisted performance. A later answer without relevant help is stronger evidence of independence for that task, but an immediately repeated example can still reflect recent exposure. Prefer a fresh variation when testing application; use delayed retrieval when assessing retention. Record the actual conditions, rather than granting a global mastery label.

**Recheck selectively.** Recheck prior evidence when the new task demands transfer or deeper reasoning, earlier success depended on help, the learner contradicts the record or reports uncertainty, or elapsed time makes retention consequential for the next step. A date alone should not trigger a full retest; there is no defensible universal expiry period. A targeted attempt can serve both the current task and the check.

## Candidate compact skill paragraph

> At the start of substantive or new-topic teaching, actively locate the learner's relevant understanding boundary. Use saved evidence to aim short probes, not assume present mastery. Ask for one explanation, prediction, or attempt at a time; use the response to check linked prerequisites until a credible foundation and next gap are clear, or the requested competence is demonstrated. Current attempts can supply this evidence. Stay within the task; never escalate beyond it merely to obtain a wrong answer. Teach from that boundary and adapt as new evidence appears. Explain directly when requested. Distinguish assisted success from independent performance; recheck consequential prior knowledge when time, changed demands, or conflicting evidence makes it uncertain.

This should replace the existing calibration/diagnosis wording, not duplicate it. Keep the current evidence-recording sentence and remove the candidate's assistance sentence if that becomes redundant. No provider-specific tool or extra stored field is required.

## Confidence

Strong support for distinguishing prompted from unprompted performance, making reasoning visible, and separating immediate success from delayed retention. The precise conversational loop, stopping rule, and wording are design inferences aligned with the user's preferences, not a validated tutoring protocol. The IES evidence ratings are historical, not a fresh systematic review.

## Gaps

No source reviewed validates binary-search difficulty escalation, mandatory failure, a fixed calibration budget, or this exact paragraph across LLM providers. Local evaluation should compare whether different tutors choose an appropriate next step, preserve assistance distinctions, and respect direct-teaching requests across a few representative conversations. No model experiments were run; no application files were edited.
