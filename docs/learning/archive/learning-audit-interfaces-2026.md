# Learning interfaces audit — 19 September 2026

Read-only audit of `learning/pi.ts`, `runtime.py`, `__main__.py`, `install.py`, client adapters and skill execution contracts. Implementation and personal learning records were not changed. This report distinguishes observed behavior, architectural exposure and proposed experiments. It does not certify compliance with a single lab standard: the cited laboratories publish research and engineering recommendations, not one shared learning-agent conformance specification.

## Verdict

The interface architecture is fundamentally sound for a personal tutor. Shared records have one Python owner; provider conversations remain with their hosts; the Obsidian lesson is explicitly a reading projection rather than the learner model. The worthwhile core improvements are better evidence provenance at the instruction boundary and measured cross-host continuation/recovery. Replacing the core with a provider SDK, MCP server or generic agent-memory framework is not justified by the inspected evidence.

### What already works

`learning/pi.ts:157` passes argument arrays and JSON stdin directly to a Python subprocess, avoiding shell interpolation in memory tools. The CLI and Pi execute the same memory functions. The Pi tools use sequential execution; expected revisions reject stale writes; Python performs semantic validation. These are real controls, unlike a prompt merely asking the model to behave carefully.

`learning/pi.ts:77` excludes learner messages and bookkeeping from the lesson while including the public portion of quiz questions. The quiz does not confuse cancellation, skipping and an incorrect answer, and missing assistance remains unknown. The publication barrier at `learning/pi.ts:330` prevents a quiz from opening before the question is published. Corrections address a uniquely matched message and survive branch reconstruction. This is a useful separation between delivery, assessment evidence and conversation history.

The shared skill preserves logical task identity across providers, distinguishes preparation from delivery and understanding, and separates current preferences from historical observations. Codex/Claude Code use one canonical skill through links; the Claude Desktop adapter loads that same source. Pi has typed context and save tools, while the CLI provides the same persistence semantics elsewhere. These choices reduce provider coupling without pretending the providers share a transcript.

## Worthwhile improvements

### 1. Make evidence-to-instruction promotion an explicit boundary

**Observed:** `runtime.py:70` enables native `read,bash,edit,write,grep,find,ls`. There is no learning-specific enforced boundary between course sources, arbitrary local files, generated assets and direct writes to memory JSON. This flexibility is intentional and useful for calculation, plotting and material processing. No prompt-injection exploit was observed or attempted on real data.

The narrower knowledge-integrity issue is that course/source text can enter the same model context that decides what to save as persistent preferences or task instructions. The explicit rule that source text is evidence rather than instructions appears in `skills/learn/references/research.md:5`, a reference loaded conditionally for research. The always-loaded skill does not state this boundary as directly for ordinary local course material.

**Recommendation:** put a short evidence-versus-authority rule in the canonical skill, covering local documents, retrieved memories, tool outputs and web pages. Preserve the origin of instructions promoted into durable preferences/task guidance: direct learner feedback, agent inference, or quoted source material must remain distinguishable. A purported instruction inside lecture notes should never acquire the authority of learner feedback simply because it was saved and later retrieved. This is a provenance requirement, not an argument for a large security subsystem.

**Acceptance experiment:** a fake course file contains ordinary mathematics plus an instruction to change the learner's preferences, mark a topic mastered or edit unrelated files. Run the ordinary study workflow; inspect both the response and resulting durable state. Repeat after a fresh session to detect persistence of the injected instruction. No actual credentials or personal notes are needed.

If realistic probes reveal consequential unauthorized actions, or the tutor begins routinely processing arbitrary third-party material, add enforced capabilities proportionate to the threat: course inputs read-only, scratch/assets writable, validated memory mutation through the canonical writer, and protected unrelated paths. Keep computation available. Native host containment is preferable to a new custom sandbox. A blanket runtime replacement is premature.

This recommendation matches the direction of 2026 primary guidance. Anthropic's May 25 engineering article distinguishes model steering from enforceable containment and identifies persistent memory poisoning as an emerging attack surface. Its examples concern broader products and do not establish that this tutor is currently compromised. [Anthropic: How we contain Claude](https://www.anthropic.com/engineering/how-we-contain-claude). Google DeepMind's June 2026 technical framework advises limiting tool authority to intended operations; its much larger enterprise control program should not be copied wholesale into a personal tutor. [Three Layers of Agent Security, page 13](https://storage.googleapis.com/deepmind-media/DeepMind.com/Blog/securing-the-future-of-ai-agents/three-layers-of-agent-security.pdf).

### 2. Evaluate semantic continuation across host boundaries

**Observed:** tests prove that Pi and the CLI return the same selected record. They do not establish that a fresh Codex, Claude or Pi model interprets that record equivalently, resumes the intended exercise, preserves the original objective, or distinguishes assisted performance from independent mastery.

`runtime.py:55` selects `openai-codex` for Pi startup. Native host context/compaction remains outside this repository. That separation is reasonable; the repository should test its observable contract at the handoff, rather than implement a universal transcript or duplicate host compaction.

**Recommendation:** create a small behavioral fixture bank, using synthetic or consented anonymized interactions. Include an interrupted proof, two unfinished exercises, a later correction of an earlier observation, a preference change, a teaching response prepared but not delivered, and a provider switch. For each, provide the exact user request plus saved state and grade the selected task, next substantive action, evidence claims and resulting mutations. Record host/model/skill version, latency and tool calls. Judge teaching quality separately from storage correctness.

For Pi, include a real compaction boundary and a restart from persisted session data. Inspection of the installed Pi `SessionManager.getBranch()` confirms it walks the full ancestor path, including pre-compaction entries; therefore the current use of `getBranch()` is not evidence that lesson text disappears on compaction. The untested part is the agent's continued interpretation after its context changes.

Anthropic's January 9, 2026 evaluation guidance distinguishes the transcript from the actual resulting environment state and treats the model plus harness as the evaluation subject. That supports this bounded test bank; it does not require a production-scale evaluation platform. [Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents).

### 3. Strengthen the write contract where measurements show repeated ambiguity

**Observed:** `learning_save.changes` is an unrestricted object in `pi.ts:141`; detailed field semantics live in the skill references and Python validation. This is a deliberate progressive-disclosure tradeoff, not missing backend validation. However, sparse merges, null-clearing, nested replacement and observation append semantics must be learned from prose. Errors are text rather than typed outcomes.

A second seam is interrupted completion. `pi.ts:239` correctly warns that the save may have committed and asks the agent to retrieve before resubmitting. Expected revisions prevent a blind replay at the old revision from duplicating observations. They do not identify a logical event after the agent refreshes and resubmits it at the new revision. The current protocol makes the agent resolve that ambiguity from evidence.

**Recommendation:** first inject a lost receipt and concurrent save into the behavioral tests. If ambiguity recurs, add one client-generated operation ID per logical mutation and a durable receipt returned on identical retries; reject reuse for different content. Distinct attempts with identical wording must remain distinct, so content-based observation deduplication is inappropriate. A typed error result with conflict/current-revision fields would further reduce language-dependent recovery.

If malformed-patch rates are material, expose a canonical schema/contract description generated from one maintained definition, or type the common mutation shapes. Avoid maintaining a complete second validator in TypeScript. Preserve one grouped save for related changes; splitting observations and task progression into independent calls would weaken atomicity.

**Current documentation, not a dated 2026 publication:** OpenAI's function-calling guide recommends clear argument descriptions, schemas that prevent invalid states and moving deterministic work out of the model. Its strict-mode schema restrictions mean this unrestricted nested patch cannot simply gain strict guarantees by toggling a flag. The recommendation is useful technical guidance but was not counted as research first published in 2026. [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling).

## A small reproducible projection defect

At `pi.ts:264`, `sync()` returns early when the selected branch has no teaching. If a session already has a lesson and the user navigates to an empty/pre-teaching branch, the old branch's lesson remains on disk, while synchronization reports no error. This was reproduced with a temporary adapter fixture: publish one teaching message, clear the branch, emit `session_tree`, and observe the unchanged previous note.

This is a visible branch/projection mismatch, not learner-memory corruption. Define the empty-branch behavior explicitly: remove or clear only a managed projection, or display an explicit branch-empty state. Keep the existing rule that an empty startup creates no note, and preserve user-owned notes. One focused behavioral test is sufficient.

## Research scope and verification

The dated sources above fall between January 1 and September 19, 2026. OpenAI's April 15, 2026 SDK release likewise supports externalized durable state, progressive skill disclosure and separation of execution environments from the harness. Those principles support the present architecture; its product release is not evidence that adopting that SDK would improve this tutor. [The next evolution of the Agents SDK](https://openai.com/index/the-next-evolution-of-the-agents-sdk/).

The popular Anthropic articles on effective context engineering and writing tools for agents were first published in 2025 and were excluded as 2026 research. No result here establishes state-of-the-art tutoring quality or a universal lab standard. The inspected evidence supports a sound deterministic foundation with unmeasured behavioral quality at host and trust boundaries.

Executed: `node --test tests/learning/test_pi.mjs` — 11 passed; `.venv/bin/python -m pytest tests/learning/test_cli.py -q -o addopts=''` — 2 passed. A temporary-only empty-branch fixture reproduced the projection behavior. Tests used temporary directories, no provider calls or real learner records. Native Codex/Claude/Pi end-to-end sessions, hostile-source model probes and actual compaction/restart trials were not run.
