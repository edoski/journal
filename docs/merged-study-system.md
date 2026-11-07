# One study system: target architecture

Status: proposal, 7 Nov 2026. It replaces the "bridge between two systems" plan. Edoardo asked for one study system with one source of truth per concern, deduplicated, without bloating the agent's context.

## The model in one paragraph

The `learning` engine (journal repo) is the learner's memory: every attempt, the verdicts and levels derived from them, the review schedule, the course path, exams, tasks, knowledge and preferences. LearnHarness is the classroom: it runs one lesson with its prober, predict-teach-check, practice, hint ladder, visuals, demos, PDFs and research, and it keeps the course's statement graph as the content inside the engine's topics. Every lesson belongs to one engine course. The app holds no learner state across sessions, and the engine holds no lesson mechanics.

## 1. One owner per concern

| Concern | Owner | The other side |
| --- | --- | --- |
| Attempts, verdicts, levels, lapses, choice errors | engine | the app saves attempts through `save` and never computes a level |
| Review schedule, due topics, exam run-up | engine | the app reads `due`; it schedules nothing |
| Course path, topics and their `needs` | engine | plan nodes reuse topic handles; a lesson plan is a view inside one topic |
| Cross-session memory (tasks, focus, knowledge) | engine | the app starts each session from the engine, never from its own notes |
| Teaching preferences | engine | the app reads them; it has no preference store |
| Courses and their creation | engine (`init`, registry) | the app lists courses and asks the engine to create one |
| The lesson: probe, plan tree, teach, check, practice, hints | app | the engine has no lesson mechanics |
| Visuals, demos, PDF reading, research | app | none in the engine |
| Statements and reasoning chains (course content) | app | tied to engine topics by handle (section 3) |

The app deletes, because the engine owns it:

- The practice "mastery trace": the problem tool's `target` field, its name-to-id normalization (`resolveTargetId`), its whole-graph validation, the "ids first" lines in the session-context marker, and the target row of the practice popover. Nothing reads it. The pose's `topics` (engine handles) replaces it.
- The multiple-choice graded question path and the confidence slider (section 4): the `quiz`/`probe` tools, multiple-choice grading and shuffling in `question-core`, the dock's option and confidence UI, `confidence-rail.tsx`, `prompts/shared/25-confidence.md`, and the settings switch between multiple choice and free recall. `ask_user_question` stays: it is a preference question, not evidence.
- The unlinked session path (section 2).
- Stale comments that still describe "understanding observations" (`app/api/graph/route.ts`, `core/coverage.ts`, `core/settings.ts`).

The app keeps, as lesson mechanics: the plan tree and its derived statuses, `probe_done` and its assessment (the handoff artifact inside one lesson), `conclude` with `outcome`, `rung`, `missClass` and `retest` (the inputs the agent maps to an attempt), compaction's in-session summary, and the session markdown export.

The engine deletes, because the app owns it: the lesson-conduct text in the tutor skill that restates the app's doctrine (section 5). No engine code is removed.

## 2. No dual mode

Every session is created with a course. The composer's course picker has no "No course" entry, and `POST /api/chats` refuses a session without a registered course. "Start fresh" is the picker's **New course** entry: a title and a study root, after which the server runs the engine's `init` for `<root>/<slug>` and saves the title, so the course is registered and listed at once.

The study roots come from the engine. Until the engine exposes them (request E1), the app offers the parent folders of the registered courses, which on this Mac are `the-vault/university/msc` and `the-vault/learn`.

Sessions created before this change have no course. They stay readable. Sending a message in one first asks for its course; once linked, it continues like any other session. The turn handler refuses an unlinked turn with `409 course_required`, so no path runs without a course.

## 3. One knowledge model at two levels

Engine topics are the unit of review and scheduling: 10 to 40 per course, with `needs`, `contrasts` and source refs. The app's statements are the content inside a topic: the true propositions and the reasoning chains among them, extracted from what the teacher said.

- **Where the graph lives:** in the app's data dir, one graph per course: `data/courses/<course key>/graph/*.jsonl`, where the key is a hash of the workspace directory. The engine's `.study/` directory has one writer, the engine, and the vault syncs through iCloud, which is the wrong place for append-heavy ledgers. A course's content never mixes with another's: the graph view, the chain table and practice picks all show the current course.
- **How statements tie to topics:** each proposition carries `topics: string[]`, the engine handles it belongs to. The extractor receives the course's topic list (handles and titles) and tags each proposition it mints. Tags are validated against that list, and an unknown handle is dropped rather than guessed. A tag whose topic later disappears from the course reads as untagged.
- **The existing global graph** is not migrated or deleted. It stays in place, read by nothing, until Edoardo says which course it belongs to. A one-off script can then move it.

## 4. One evidence rule set

The engine's rules apply to every answer, as the tutor skill states them:

- Graded questions in probing, checks and practice are free response with reasoning (the app's `explain`/`recall` mechanic). No multiple-choice answer counts as evidence, so the graded multiple-choice path is deleted rather than kept beside free response.
- Stated confidence is not stored. "How sure are you?" is asked in words, on lapsed topics only.
- Help is `none` only when unaided. The practice hint rung becomes `help`, in words. `solved` maps to `correct`, `solvedWithHints` to `correct` with that help, and `surrendered` to `incorrect`. A guess or broken reasoning is `partial`. A discrimination miss becomes `chose`.
- The engine judges which attempts count (the first try on a due day; retries are relearning), skips duplicates, and schedules. The app re-implements none of it.

The agent writes each attempt with `course_save`, in the turn the answer arrives, before any call that ends the turn. The tutor in Claude Code works the same way, so both hosts produce the same records.

## 5. One teaching doctrine

Today the pedagogy is written twice: the app's prompts (`prober/10-probe-doctrine.md`, `teacher/05-method.md`, `20-teaching.md`, `28-predictions.md`, `practice/10-doctrine.md`) and the tutor skill (`SKILL.md`, `references/practice.md`). They should be one host-neutral text, kept in the engine's skill so that every host reads it.

- **Single source:** the tutor skill's references, split into host-neutral parts that name no tools: `evidence.md` (what an attempt is and how it is graded and recorded), `teaching.md` (finding the edge, predict-teach-check, hints, practice, mixing, transfer) and `reviews.md` (today's review, close, the week). Each host adds only a short adapter that maps the doctrine to its own tools: the tutor skill's tool table, and the app's `prompts/course/` fragment for `course_*`, `explain`, `problem` and `conclude`.
- **Where the two differ, the more specific, code-enforced text wins:** commit-before-pose, the R0 to R5 hint ladder, the miss classes and the probe's floor-and-ceiling bracketing come from the app. Evidence, free response, what counts, scheduling, reviews and the close come from the engine. The probe stops once the edge is found, usually within three free-response questions, and skips what the record already shows.
- **Until the engine ships the split (request E3),** the app keeps its own doctrine, and `prompts/course/10-record.md` carries the evidence rules. The rest of the duplication stays until E3 lands.

## 6. One interface to the engine

The app runs the engine's agent CLI, `python -m learning [--workspace DIR] VERB`, one child process per verb, through the `CourseRecords` port (`src/core/ports.ts`) and its adapter (`src/store/course-records.ts`). The CLI fits better than the MCP server: every turn rebuilds its agent from the record, so a stateless child per verb needs no long-lived process or reconnect logic, and the CLI prints the same error JSON the MCP server wraps. Each verb takes about 0.1 s.

TypeScript only spawns the engine, maps exit codes onto a result union, and projects fields of the engine's JSON for display and context. Grading, verdicts, levels and scheduling exist only in Python.

## 7. Context budget

Measured on copies of the real SMM and AIKR records (13.5 KB and 6.3 KB of `resume` JSON) and on the app's composed prompts. Bytes are measured; tokens are estimated at 4 bytes per token until the live run reports provider token counts.

| Per turn, course-linked session | Today's bridge | Target |
| --- | --- | --- |
| Course doctrine in the system prompt | 4.4 KB, about 1,100 tokens | about 2.5 KB, about 650 tokens |
| `course_*` tool schemas | 2.2 KB, about 550 tokens | the same |
| Course state in the transcript | the full `resume`: 13.5 KB SMM, 6.3 KB AIKR, about 3,400 and 1,600 tokens | a role brief: about 2.8 KB SMM, 1.5 KB AIKR, about 700 and 370 tokens |

The role brief is a `course-context` marker written into the transcript when the session is created, the same idiom as the graph-context marker. It stays fixed, so the cached prefix holds. It is a projection of `resume` fields; no rule is computed in TypeScript.

| Role | Injected | Fetched on demand |
| --- | --- | --- |
| Prober | the path with each topic's level, due topics with level and days overdue, weak topics with their gap, the open task's title, goal and step, preferences, pinned knowledge | a topic's needs, history and gap (`course_show`) |
| Teacher | the prober's brief (same transcript) plus, at the handoff, the probed topics' gap, note, review prompt and points, and their needs' levels, appended to the handoff steer | evidence, knowledge entries (`course_show`, `course_search`) |
| Practice | the prober's brief with each due topic's review prompt and points, and its recurring wrong-method pairs (`choice_errors`) | everything else, as above |

`course_resume` stays as a tool for a new day or another task. The evidence log (6.2 KB in SMM, the largest part of `resume`) is never injected.

## Delivery

1. **This branch:** the CLI adapter, course required for every session, the New course flow, linking older sessions, free response everywhere with the multiple-choice and confidence code deleted, `target` replaced by `topics`, the role briefs, and the slimmer doctrine. Proven on a throwaway course in the real app, with measured token counts.
2. **Next branch:** the per-course graph and statement topic tags. It touches extraction, the snapshot, the chain table, the home view and practice picks.
3. **After request E3:** the app composes the engine's host-neutral doctrine and deletes its duplicate text.

## Engine changes requested from the lead thread

- **E1:** a CLI verb `courses`, the same data as the MCP `courses` tool plus `study_roots` from `install.json`. It must list registered workspaces that have no `course.json` yet. Today `plan --all` lists a course only after its first save, and the study roots are readable only from an internal file.
- **E2 (small):** `init --title T`, so a new course is listed and titled in one call instead of `init` followed by `save`.
- **E3:** split the tutor skill's references into host-neutral `evidence.md`, `teaching.md` and `reviews.md` that name no tools, keep the host's tool mapping in `SKILL.md`, and merge in the app's code-enforced practices named in section 5. The app reads these files from the engine's directory at runtime.

## Decisions taken by default, which Edoardo can change

- Graph per course, in the app's data dir. The alternative is next to the course record in the vault, where the tutor could read it too.
- Multiple-choice graded questions are deleted, not kept for practice-only drills.
- Older unlinked sessions are linked on their next message, not frozen.
- The existing global graph is left untouched until he assigns it to a course.
