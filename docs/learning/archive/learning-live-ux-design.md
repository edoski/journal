# Live learning UX: six focused changes

Research and implementation map, 18 September 2026. The readable Obsidian note is a live teaching surface. Durable understanding and unfinished work live in learning state; users should not browse old notes to recover continuity. No new navigation product, benchmark, grading model or per-turn reflection pass is required.

## Evidence and scope

Current [Anthropic skill guidance](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) recommends concise instructions, progressive disclosure and greater freedom where decisions depend on context. That supports short teaching guidance for points 1–4 and deterministic code for persistence in points 5–6. It does not establish that any wording guarantees good tutoring.

The local implementation already separates `learning/pi.ts` projection, `learning/lessons.py` publication, shared teaching instructions, and `learning/memory.py` evidence. Extend those owners rather than adding another service. Pi 0.85.1's installed documentation was checked alongside [upstream session documentation](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/session-format.md).

## 1. Natural structure within a turn

**Evidence.** W3C recommends headings that reflect content relationships through logical nesting. Obsidian supports six heading levels and native horizontal rules. [W3C headings](https://www.w3.org/WAI/tutorials/page-structure/headings/), [Obsidian syntax](https://help.obsidian.md/syntax).

**Change.** Keep one main learning move per response; use headings only when useful, with examples and derivations nested under the concept they explain. Add no session title; preserve the tutor's meaningful topic headings. Keep automatic turn dividers in the projector. Short responses may remain a paragraph or equation.

**Pitfalls.** A divider marks a turn boundary, not a conceptual hierarchy. Do not force numbered sections, identical templates or a new title for every message. Do not regex-rewrite headings inside code fences. The shared skill should express the intended structure; rendering code should preserve authored mathematics and diagrams.

## 2. Local explanation anchors

**Evidence.** Obsidian renders the Markdown it receives; the current projector deliberately excludes user messages. The need for a local anchor follows from this implementation and the user's live-only requirement, not from a claimed experimental result.

**Change.** Give enough local subject context to understand an answer without seeing the Pi prompt: “Applying the permutation twice…” instead of a bare “Yes, again.” Avoid copying the question, recapping the whole session or making each reply into an archival article. This belongs in the shared skill and benefits desktop chat too.

**Pitfalls.** Anchoring must not become a mandatory introductory sentence. If the calculation already identifies the object, no extra prose is needed. Keep the learner's wording only when its exact form matters to feedback.

## 3. Mathematical reasoning and native visuals

**Evidence.** Obsidian natively renders MathJax mathematics and Mermaid blocks, and accepts SVG images. MathJax's AMS support includes `aligned`. [Obsidian advanced syntax](https://help.obsidian.md/advanced-syntax), [accepted formats](https://help.obsidian.md/file-formats), [MathJax AMS](https://docs.mathjax.org/en/latest/input/tex/extensions/ams.html).

**Change.** Define unfamiliar notation near use; align related mathematical steps; explain the decisive transition beside the derivation. Select examples, Mermaid or existing SVG support when they clarify the specific difficulty. Keep this as compact teaching guidance, with the existing conditional visual reference.

**Pitfalls.** Do not equate a correct render with a correct argument. Avoid long equations designed for a wide desktop pane, decorative diagrams, external rendering dependencies and mandatory visual generation. Native desktop chat renderers differ; adapt presentation to the actual client while retaining the same teaching intent.

## 4. Match the kind of help to the moment

**Evidence.** Anthropic's current education description explicitly presents learning mode as questions that help students reach answers. This establishes a first-party tutoring pattern, not comparative proof that Socratic interaction is always best. [Claude education](https://claude.com/solutions/education).

**Change.** Distinguish conceptual confusion, an attempted solution and independent practice. Explain the concept when needed; diagnose the consequential step in an attempt; provide a useful hint when the learner is trying to solve it. Respect requests for a direct explanation or solution. Reuse observed understanding and assistance instead of probing from scratch.

**Pitfalls.** Avoid withholding information after a clear explanation request, premature full solutions during practice, praise without diagnosis, or a quiz at every turn. Persist actual learner evidence, not the fact that the tutor presented material. The policy needs no new model calls or mode-selection tool.

## 5. Corrections that survive reconstruction

**Evidence.** Pi sessions form a tree using entry IDs and parent IDs. Custom entries persist extension data but do not participate in model context. `getBranch()` returns the current branch; the compacted context API is a different projection. The extension docs also demonstrate branch-aware state stored in tool-result details. [Pi session format](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/session-format.md), [extension API](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md).

**Change.** Add one narrow correction operation targeting an earlier assistant passage. Resolve a unique exact passage to its source entry, validate the target, and append a branch-local correction event. Store the authoritative patch once; reconstruct the note by replaying current-branch events. Replace the incorrect passage and place a short visible correction indication nearby. Subsequent corrections must apply to the current corrected text in order.

The tutor also states the substantive correction once in its ordinary response and updates learning evidence if the mistake affected saved conclusions. A silent custom entry cannot inform future model reasoning by itself.

**Alternatives.** Directly editing the Markdown loses corrections at the next mirror. Rewriting provider transcripts risks damaging their structure. A separate patch database creates another lifecycle and identity boundary. A custom Pi entry is a thin UI adapter; conceptual correction guidance and learning-state correction remain provider-neutral. Tool-result details are also viable, but avoid duplicating a full patch in both stores. An appended custom event can commit the correction before attempting note publication.

**Pitfalls.** Never replace every matching string. Reject ambiguous targets and invalid replacements. Do not apply sibling-branch corrections. A branch rewind before the correction correctly restores that earlier branch's version; resuming the corrected branch restores the fix. Keep durable evidence separate from the live-note overlay. Publication failure must leave a replayable correction and report the failure accurately. Do not silently claim a correction was saved when it was not.

## 6. Several unfinished tasks in one course

**Evidence.** Two 2026 papers distinguish situational episodic evidence from current actionable state: [REMem](https://arxiv.org/html/2602.13530v1) models event context and retrieval; [ATMem](https://arxiv.org/html/2606.31612v1) tracks task-relevant values, roles and status. Neither validates this tutoring schema. Their relevant lesson is to retain explicit context and unfinished work rather than repeatedly infer it from a transcript. Their graphs, trained policies and benchmark infrastructure are unnecessary here.

**Change.** Replace the singleton `active` with a `tasks` map and optional `current_task` pointer. Each stable logical task ID represents an exercise or coherent objective, independent of provider/chat ID. Keep a concise label, source locator, pending question, assistance and relevant topic/evidence references as needed. A sparse patch changes only named tasks; task fields patch independently, supplied nested objects replace as units, and null removes a completed task. Existing observations retain the learning history.

Retrieve a compact task index and the selected checkpoint. Explicit `--task` selects that task's evidence and source context; explicit topics/query should not silently expand the globally current task. Prefer the learner's stated exercise and the current conversation's known task over the course pointer. Ask a brief content question only when multiple plausible unfinished tasks remain. An explicit current pointer is a convenience, not proof of intent.

**Pitfalls.** Course-wide optimistic concurrency still matters: reconcile conflicts while preserving other tasks. Removing the pointed task should clear the pointer; invalid explicit pointers should fail. Do not silently pick another task when the requested task is missing. Schema migration must preserve the existing checkpoint exactly, along with evidence and source references. Avoid storing every chat as a task or reloading all task histories each turn.

## Implementation boundary and confidence

Remove generated lesson-index maintenance and routine naming/association calls that exist only for browsing. Keep automatic live titles, ownership markers, atomic publication and a stable resumed-session path. Do not delete real session teaching: live-only purpose is not permission to discard historical material automatically.

Formatting and Pi persistence APIs are directly documented. The proposed adaptive teaching phrasing and task schema are reasoned design choices, not proven learning-outcome improvements. Focused deterministic checks should cover correction replay/branching, task isolation/conflicts/selection and preservation during migration. Quality and pacing are judged through the user's real study sessions, as requested.

## Pi display refinement

Current [Pi extension documentation](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md#piregistermarkdowntransformertransformer) provides a display-only Markdown transformer for streaming, complete and restored messages. Use it to suppress assistant teaching in the terminal by default while preserving session/model contents and the independent Obsidian projection. Input, tools, quiz UI and framework errors render separately. If publication fails, surface the pending answer and stop suppression until recovery. The renderer can leave spacing and separate thinking/tool output; this is not a fully replaced terminal interface. No startup flag is needed under the user's chosen default.
