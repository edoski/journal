# Learning system implementation

> Historical investigation: implementation descriptions and proposals below reflect an earlier snapshot and are not the current runtime contract. See the [current learning README](../../../learning/README.md) and [behavioral acceptance cases](../behavioral-acceptance.md). Research claims retain their stated dates and limitations.

Updated 18 September 2026. The maintained implementation is [learning/](../../../learning/README.md), following the [integrated design](learning-context-retrieval-design.md) and [efficiency consensus](learning-efficiency-consensus.md). This revision is installed in the same repository and vault; there is no parallel prototype.

## Core and ownership

`learn/state/<scope>.json` uses schema 3: topic metadata and interpretations, source handles, addressable observations, exam/review information and a sparse logical-task checkpoint map. Observations append with helper-assigned IDs; corrections link to earlier observations without deleting historical evidence. Focused reads have no latest-three cutoff. Exact handles, literal discovery and revision-bound pages support deeper retrieval, with explicit selection/completeness. Primary source references and vault paths accompany focused context.

`learn/preferences.json` is the single current policy owner. Sparse selectors cover course, topic, concept, domain and activity. Updates replace the applicable current dimension; omitted values survive and explicit deletions remove them. Explicit/inferred origin is retained; mechanical selection preserves compatible overlapping rules for tutor interpretation. Applicable preferences accompany normal context. Temporary resumable instructions fit in the selected task checkpoint.

The shared skill steers continuous teaching, task-bounded calibration, context reuse, meaningful checkpoints and one authored response. It replaces ambiguous after-teaching-save guidance. Supporting references explain record mutation, exceptional retrieval and preference updates only when needed. No routine reflection agent, policy polling, source reread or review rescheduling is introduced.

The Python core owns local locks, expected revisions, no-op detection and atomic publication. Saves return revisions and assigned handles, avoiding confirmation reads. Journal remains read-only and loads only for planning/activity requests. Existing review-date arithmetic remains exam-oriented; retained foundations can continue beyond an exam. Current chat context is a snapshot until refreshed, and local locking does not guarantee simultaneous cross-device iCloud synchronization.

## Interfaces

| Client | Current integration |
| --- | --- |
| Codex | Existing `~/.agents/skills/learn` symlink reads the canonical skill. The installed study-specific communication override remains unchanged. |
| Claude Code | Existing `~/.claude/skills/learn` symlink reads the same source. Authentication remains owned by Claude Code. |
| Claude Desktop/Cowork | Existing uploaded `teach` adapter reads repository files live; no new upload or bundled runtime is required. Native folder permissions still apply. |
| Pi and Obsidian | `study` launches Pi inside the invoking terminal, including the Ghostty popup. The extension creates/opens the lesson and projects assistant teaching without automatic prompt copies or role headings. Native math and Mermaid remain Markdown. |

Pi skips ordinary user-event publication and repeated unchanged output. Native message identity and selected-branch reconstruction preserve deliberate repeated content while avoiding replay duplication. The optional sequential `quiz` tool uses Pi's existing UI and dependencies: public question publication completes before input opens, answer keys stay out of the lesson, and answered/unknown/skipped/cancelled/unavailable outcomes remain distinct. Tutor feedback is authored normally; no extra grading model is called. Non-TUI runs do not expose the interactive tool.

Repository references are packaged with the skill. Existing symlinks and the `study` command resolve the updated implementation directly. New sessions load the current policy and extension; already-running conversations retain their loaded instructions until refreshed. No MCP server or custom provider bridge is required. Pi additionally loads pinned `pi-web-search@1.6.0` for optional search with existing provider credentials; search consumes usage only when invoked. Desktop clients use their native web tools.

## Preservation and verification

The live SMM record was converted from revision 6 to revision 7. All eight observations, their exact text and assistance, topic interpretations, two scheduled reviews, coverage, source locations and the pending permutation-matrix question were preserved. Its existing course preference moved into the shared policy alongside the user's explicit general presentation preference. No mastery, dates or new learning outcomes were inferred.

Conversion first ran against a temporary copy. Reversing the representation changes reproduced the original record exactly, excluding service revision/timestamp. The complete pre-conversion `learn` directory and a preservation manifest are backed up under `~/Library/Application Support/Learning/backups/20260918-194200-current-core/`. All five existing Markdown files, including historical SMM lessons and continuations, were verified byte-for-byte unchanged. No source material, Journal record or real study session was deleted.

Correctness checks passed: the full Python suite, deterministic Pi adapter checks, Ruff, strict Mypy for the learning package, installed Pi API type checking, and skill validation. Installed-helper read-only checks verified actual SMM continuation, scoped preferences, older-evidence search and planning after migration. Temporary conversion/check data was removed.

No benchmark harness, model evaluation run or subscription-backed testing was added for this revision. Earlier live tests belong to the previous implementation and do not establish the new tutor's behavior. The single-response instruction and adaptive teaching changes are installed, but their real study quality and native-model adherence will be refined through the user's feedback. Actual interactive quiz rendering was not exercised in this revision.

## Integrated additions

Five coordinated implementation slices now provide combined learning/Journal planning, optional source-grounded course assessment context, motivated adaptive teaching, readable Pi lesson navigation, and static SVG publication. Planning retrieves compact topic summaries/gaps rather than every observation; exact scope avoids the all-course catalog. Future schedule windows respect canonical date/weekday overrides, OFF days and lunch, and remain distinct from confirmed availability. Course context source handles survive focused retrieval and dangling references fail before publication.

Substantial new chapters receive bounded calibration, a short plan and useful native Mermaid dependencies, with natural go-ahead unless already authorized. Retrieval/transfer quizzes fit meaningful milestones and wrap-up. Related exercises reuse orientation; focused answers avoid ceremony. Web research is conditional on uncertainty, niche/current information, missing context or a user request. The added references load only when needed.

Lesson names can be set explicitly and survive Pi reconstruction. Notes serve the current session; generated browsing indexes have been retired. Static SVG assets are content-addressed, atomically published within the vault and embedded natively; no raster conversion, render service or routine diagram agent was added.

Verification: 661 Python tests and four deterministic Pi checks pass, plus Ruff and strict learning-package typing. Temporary CLI checks exercised source retention, persistence, planning, lesson naming and SVG publication and were removed. This addition changed no existing vault learning records, preferences, lessons or Journal material. Stored presentation preferences were read and found compatible with the new defaults. No model benchmarks or tutor-quality evaluation runs were performed.

Pi search loading was verified with the installed Pi resource loader: both the learning extension and pinned search package loaded with zero errors. No hosted search/model request was made; actual provider search execution remains untested.

The terminal entrypoint is now `~/.local/bin/study`, generated from the canonical installer and forwarding arguments to `python -m learning start`. It uses the repository environment from any working directory. The former Study.app and Study.command are archived under the Learning support backups. No Ghostty keybindings or study data were changed.

## Live-session UX revision

The [six-point research map](learning-live-ux-design.md) preceded implementation. The shared skill now guides local subject anchors, nested content relationships, aligned mathematical reasoning and help appropriate to explanation, feedback or independent practice. No rigid template or additional grading model was added.

Schema 3 replaces singleton unfinished work with logical task checkpoints. Explicit task selection loads its relevant evidence and references; a compact index exposes alternatives without loading all checkpoint detail. Sparse replacement and revision checking preserve other activities. The live SMM conversion preserved all nine observations, topic state, source references, preferences and pending work, with a full backup before conversion. Generated lesson/course navigation was archived, while existing Markdown teaching was verified unchanged.

Pi's `correct_lesson` operation records a unique passage replacement against a specific message in a branch-local custom entry. Replay reconstructs the corrected live note with a visible reason. A rewind before the event restores that branch's earlier state; the corrected branch retains the correction. No native transcript mutation or separate patch database was introduced.

Terminal teaching is hidden by default through Pi's documented display-only Markdown transformer. This does not remove conversation context or Obsidian content. User input, quiz/tool UI and errors remain available; publication failure exposes the pending answer in a notification and disables hiding until recovery. The supported transformer may leave terminal spacing; this is not a custom input-only client. No `--quiet` flag is required or provided.


## Obsidian math publication fix

A real Pi session loaded the canonical skill but emitted TeX parenthesis/bracket math delimiters. The publisher preserved them literally, so Obsidian displayed plain text. Pi settings and the custom tutor prompt contained no conflicting formatting override; terminal suppression was display-only. Publication now normalizes paired TeX delimiters to dollar math while protecting code and existing dollar math. The Pi projector adds no session header and preserves authored headings; shared guidance calls for meaningful topic structure without repeated headings.

The reported note was backed up and repaired, then visually verified in Obsidian: inline and display math rendered and the generated session heading was absent. All 84 learning Python checks and eight deterministic Pi checks passed; Ruff and strict learning-package typing passed. No hosted model benchmark was run, and future teaching quality remains subject to real study feedback. Existing Pi processes need a reload or restart to pick up the changed extension.


## Enduring task context and sparse lesson planning

The research and design decisions are in [learning-task-context-research.md](learning-task-context-research.md). Tasks retain optional `frame` and `plan` objects alongside changing teaching checkpoints. Field-level task patches preserve omitted purpose and plan data; explicit nulls clear obsolete fields. Default context includes current-topic histories, pinned observations, the purpose anchors, and current plan-node/direct-prerequisite evidence. It preserves exact source locators, correction expansion and revision-bound paging. Explicit queries retain their narrower scope. Local plan references and cycles are validated before publication.

The shared skill establishes orientation at substantial learning transitions, suggests a route and useful dependency diagram, and asks a focused clarification only when unresolved intent materially changes teaching. It reuses that orientation across sessions. `proposed` versus `agreed` describes the route; learning evidence remains separately authoritative. The SMM task was backed up and enriched with its original Exercise 5 objective and a proposed reconstructed route; its pending question and all eleven observations were preserved. No lesson Markdown, course material or preferences were changed.

Verification: all 680 repository Python tests pass, including 91 learning checks; Ruff checks/formatting, strict learning typing and skill validation pass. The installed agent helper was read-only verified against SMM revision 13: the original uniqueness evidence, stable Exercise 5 objective, proposed route and unchanged pending collision question are returned together. No model benchmark or generated study data was added.
