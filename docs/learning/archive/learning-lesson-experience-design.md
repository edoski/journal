# Study note and response delivery

> Historical investigation: implementation descriptions and proposals below reflect an earlier snapshot and are not the current runtime contract. See the [current learning README](../../../learning/README.md) and [behavioral acceptance cases](../behavioral-acceptance.md). Research claims retain their stated dates and limitations.

Proposed core behavior, 18 September 2026. This document is design work; the installed mirror still includes user prompts and You/Tutor headings until implementation changes it.

## Learner experience

The Obsidian session note is a readable lesson, not a transcript or an internal memory dump. Pi remains the input surface. Native conversation history retains the user's exact messages; the learning record retains relevant evidence from their answers.

Display the tutor's teaching content in its original Markdown. Exclude copied user prompts, role headings, repeated turn titles, timestamps between replies, tool output, progress narration and internal reasoning. Use a meaningful lesson title when available and content headings only when they help navigation. Equations, short examples and native Mermaid belong directly in the explanation; no fixed template or automatic end-of-turn recap.

The tutor's text should remain understandable in the note: briefly identify the mathematical claim or step being explained when needed. Do not solve this with a second model that rewrites the transcript. An observation such as "The missing step is checking consistency" is useful teaching; reproducing the learner's whole preceding prompt is not.

The shared skill should steer a continuous sequence of scoped learning steps across every interface. Let the structure emerge from the current task, the subject and the learner's responses. Do not prescribe a fixed explanation/example/check/summary template, a heading on every turn, or a hard length limit. A proof, debugging exercise and conceptual introduction legitimately need different shapes. Continue the developing explanation rather than restarting a miniature article each turn; give detail where it helps understanding. This is model-authored teaching, not a document-layout engine.

The agent may quote a small part of the learner's reasoning when the correction depends on it. This is a deliberate teaching choice within the answer, not an automatic transcript entry. Ordinary user prompts are never copied by the mirror.

Example of the intended reading surface, after a learner confuses singularity with inconsistency:

```markdown
# SMM — Singular systems

A zero determinant means the matrix is not invertible. It does not by itself tell us whether the system is consistent.

For example,

$$
\begin{cases}
x+y=2\\
2x+2y=4
\end{cases}
$$

contains the same equation twice. Every point on the line $x+y=2$ solves both equations, so there are infinitely many solutions.

What changes if the second right-hand side becomes $5$?
```

This is an illustrative fixture, not a real study observation or a required response template.

## Questions and feedback

Show a posed exercise or quiz as study content before the learner answers. A Pi widget may capture the answer, but the note need not replay the interaction. Afterward, show the relevant feedback or worked reasoning; include the chosen answer only when necessary to interpret it. Do not expose an answer key in collapsed Markdown before the attempt.

The full question/result still belongs to native session events so the lesson can be reconstructed and the tutor can record actual learning evidence. The readable projection and the evidence store have different purposes. Neither needs the other one's presentation format.

## One authored response

The shared skill should direct the agent to gather context, prepare its answer, perform necessary persistence, and publish one teaching response. Replace ambiguous wording that implies teaching must be printed before saving. If text has already been shown before a tool call, do not repeat it as a closing response. This is a core behavior rule, not a Claude-specific exception.

Persist learner observations as observations. A prepared explanation or next question is not proof that the learner has seen, understood, or answered it. Keep the continuation resumable without granting exposure or mastery from a planned response. Native conversation history is authoritative about delivered messages when available.

A skill can govern authored output but cannot create an atomic transaction across a vault write and every provider's chat UI. Interrupted delivery needs recovery, not a distributed delivery service. Do not claim that a successful save proves a message appeared on screen.

## Projection implementation

Adapt the existing `learning/pi.ts` projection and shared teaching guidance. Keep the current file ownership, queued writes, atomic publication and branch reconstruction. Select the assistant's study text; remove automatic user and role wrappers. Add only the specific public question/feedback events if the optional quiz tool is introduced.

Use native event identity to avoid replaying the same event during reconstruction. Do not deduplicate arbitrary equal strings: repeated formulas and deliberately revisited explanations can be legitimate. The duplicate-Claude-answer fix belongs in authoring behavior, not a text filter in the Pi mirror.

No extra summarisation pass, conversion server, stylesheet package, or provider-specific memory format is required. Formatting comes from readable Markdown and Obsidian's existing renderer. Keep automatic creation/opening and per-session files. Existing historical lessons remain preserved; avoid rewriting user material as part of changing the default projection.

## Verification

Use a temporary synthetic session to verify that a user prompt is absent, teaching appears once, Markdown/math/Mermaid survive unchanged, and reconstruction does not duplicate events. For a widget, check question-before-input and feedback-after-answer. Visually inspect the Obsidian reading surface. A small native Claude check is necessary to assess the reported repeated-answer behavior; Python tests alone cannot prove it resolved. Remove temporary data afterward.
