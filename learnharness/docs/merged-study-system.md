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
- The multiple-choice graded question path (section 4): the `quiz`/`probe` tools, multiple-choice grading and shuffling in `question-core`, the dock's option UI, and the settings switch between multiple choice and free recall. `ask_user_question` stays: it is a preference question, not evidence.
- The 0–100 confidence slider and its percentage reading (`confidence-rail.tsx`, the percentage doctrine in `prompts/shared/25-confidence.md`), replaced by three discrete states (section 4).
- The unlinked session path (section 2).
- The prober's habit of inferring what he already holds from the statement graph (the former step 1 of `prober/10-probe-doctrine.md` read `list_sessions`/`list_propositions` for that). What he holds is the engine's answer; the graph tools stay as a way to read content, never standing.
- The model retyping a practice outcome into `course_save`: `conclude` becomes the single write for a practice attempt (section 4).
- Stale comments that still describe "understanding observations" (`app/api/graph/route.ts`, `core/coverage.ts`, `core/settings.ts`).

The app keeps, as lesson mechanics: the plan tree and its derived statuses, `probe_done` and its assessment (the handoff artifact inside one lesson), `conclude` with `outcome`, `rung`, `missClass` and `retest` (the inputs the agent maps to an attempt), compaction's in-session summary, and the session markdown export.

The teaching doctrine is one host-neutral text in the engine's tutor references, which the tutor skill and the app both compose (section 5). No engine code is removed.

## 2. No dual mode

Every session is created with a course. The composer's course picker has no "No course" entry, and `POST /api/chats` refuses a session without a registered course. "Start fresh" is the picker's **New course** entry: a title and a study root. The server creates `<root>/<slug>` (refusing a folder that already exists, because `init` silently reopens an existing course and the title save would then rename it), runs the engine's `init` there, which also configures Codex for the course as `study init` always does, and saves the title so the course is listed at once.

The study roots come from the engine. Until the engine exposes them (request E1), the app offers the parent folders of the registered courses, which on this Mac are `the-vault/university/msc` and `the-vault/learn`.

Sessions created before this change have no course. They stay readable. Opening one shows a banner in place of the composer and question dock, asking for its course; once linked, it continues like any other session. The learner-turn route refuses an unlinked session with `409 course_required` as the backstop. A session whose course was later unregistered gets the same banner and can be re-linked.

**When the engine cannot run** (not installed, or a `courses` call fails), the picker is replaced by one line naming the reason and the fix, and no session can start, because no lesson exists outside a course. Open sessions stay readable. Mid-lesson, a save that fails with `io` does not stop the lesson: the agent keeps teaching, mentions it only if it changes what it can teach, and re-sends the identical patch on its next turn (the engine skips an identical observation within 30 minutes). A `validation` failure saved nothing and is repaired in the same turn.

## 3. One knowledge model at two levels

Engine topics are the unit of review and scheduling: 10 to 40 per course, with `needs`, `contrasts` and source refs. The app's statements are the content inside a topic: the true propositions and the reasoning chains among them, extracted from what the teacher said.

- **Where the graph lives:** in the app's data dir, one graph per course: `data/courses/<course key>/graph/*.jsonl`, where the key is a hash of the workspace directory. The engine's `.study/` directory has one writer, the engine, and the vault syncs through iCloud, which is the wrong place for append-heavy ledgers. A course's content never mixes with another's: the graph view, the chain table and practice picks all show the current course.
- **How statements tie to topics:** each proposition carries `topics: string[]`, the engine handles it belongs to. The extractor receives the course's topic list (handles and titles) and tags each proposition it mints. The merger stays the only graph writer: when the auditor links a finding to an existing node, the node's tags become the union of every sighting's tags. Tags are validated against the topic list, and an unknown handle is dropped rather than guessed. A tag whose topic later disappears from the course (an engine rename is a removal plus a creation) reads as untagged until the next extraction re-tags it.
- **The course key** is a stable id the engine mints in the workspace manifest (request E6), not the folder path, so moving or renaming the folder neither orphans the graph nor breaks linked sessions. Until E6, the key is the workspace path, and a moved course is re-linked from the banner in section 2.
- **Notes import** asks for the course its files belong to, like a session.
- **The existing global graph** is not migrated or deleted. It stays in place, read by nothing, until Edoardo says which course it belongs to. A one-off script can then move it.

## 4. One evidence rule set

The engine's rules apply to every answer, as the tutor skill states them:

- Graded questions in probing, checks and practice are free response with reasoning (the app's `explain`/`recall` mechanic). No multiple-choice answer counts as evidence, so the graded multiple-choice path is deleted rather than kept beside free response.
- Each free-response answer carries one of three confidence states, chosen with one tap and defaulting to neutral: **guessing**, **neutral**, **confident**. There is no slider and no percentage (Edoardo, 7 Nov: "so that I don't need to waste time and focus trying to establish an arbitrary % value"). The prober reads them as its doctrine already does: a confident correct answer jumps up, a guessed or hesitant one steps gently.
- The engine records it as the attempt's `sure` field (journal PR #6): guessing becomes `guess`, neutral `neutral` (the app asks all three, so it is sent), confident `confident`. A guess is never an unaided correct, so a right guess grades as helped and returns for review in two days; a confident wrong answer counts as a confident error in the topic's standing and marks it weak until its next solid result. One adapter function (`engineConfidence` in `src/core/engine-confidence.ts`) holds the mapping. The answer itself is graded as it stands: a right guess is `correct` with `sure: "guess"`, not `partial`.
- **Practice writes once.** `conclude` is the single record of a practice attempt. It gains `result` (`correct`, `partial`, `incorrect`: the model's judgement, which must agree with the outcome), `response`, `chose` (a topic handle, for a discrimination miss) and `firstTry` (the result of his first unaided answer, when the problem took more than one). One pure, tested function turns the pose and the conclusion into engine observations: the pose's `topics` and statement, the hint rung as `help` in words (`none` only when no hint was given), the confidence of his last submission, and a separate unaided first attempt when `firstTry` is given and differs from the final attempt (a hint was given, or the result changed), so the first-try-on-a-due-day rule sees it. `conclude` saves them itself and returns the receipt. `dismissed` saves nothing. The vocabulary map is the only engine knowledge in TypeScript.
- **Questions write through `course_save`.** A free-response check or probe is graded by the agent in prose, so the agent saves it, with the same fields.
- The engine judges which attempts count (the first try on a due day; retries are relearning), skips duplicates, and schedules. The app re-implements none of it.

The agent saves each question's attempt with `course_save` in the turn the answer arrives, before any call that ends the turn, because in the app a question ends the turn. The tutor saves once per turn after its teaching text, or once at the end of a review. The observations are the same; only the timing differs.

A question call whose arguments cannot be displayed (a truncated or invalid call in the record) never takes the dock and is never an attempt. The transcript shows it with **Retry question**; the retry resolves only the unusable calls, with an error result telling the agent to save no attempt for them and to pose the question again, and it replays no earlier tool, so an answer `course_save` already recorded is neither lost nor saved twice. An answer to a valid sibling waits in the record until that retry, or the learner's next message, runs the turn that saves it. A retry interrupted after its results were written stays paused: reopening the session or a finished background job never restarts it, only the learner's next message does.

## 5. One teaching doctrine

The pedagogy used to be written twice: the app's prompts (`prober/10-probe-doctrine.md`, `teacher/05-method.md`, `20-teaching.md`, `28-predictions.md`, `practice/10-doctrine.md`) and the tutor skill (`SKILL.md` and its former `references/practice.md`). The app lives in the journal repository as its own top-level folder, `learnharness/` (Edoardo, 7 Nov; a git subtree that keeps the app's history and AGPL license), so the doctrine is one set of files there.

- **Single source:** the tutor skill's references, host-neutral files that name no tools (engine request E3, done 8 Nov): `learning/skills/tutor/references/evidence.md` (what an attempt is and how it is graded and recorded), `teaching.md` (finding the edge, predict-teach-check, procedures, hints, practice problems, difficulty, mixing, transfer) and `reviews.md` (today's review, review prompts, lapses, the close, the week, the exam run-up and mocks), plus the sections of `records.md` (tasks, preferences) and `course.md` (exam facts) the app composes. Each host adds only a short adapter that maps the doctrine to its own tools: the tutor skill's tool table, and the app's `prompts/course/` fragment for `course_*`, `explain`, `problem` and `conclude`.
- **How the app reads them (in place):** each agent's course prompt is the adapter `prompts/course/10-record.md` followed by that agent's parts of the references, listed in `ENGINE_DOCTRINE` (`src/agent/prompt-segments.ts`) and read from `config.ts`'s `PATHS.tutorReferences`, the repository-relative `../learning/skills/tutor/references/`. A part is a whole file, or a file's opening and its listed `##` sections, so each agent reads only what its job uses:

  | Agent | `evidence.md` | `teaching.md` | `reviews.md` |
  | --- | --- | --- | --- |
  | Prober | whole | finding the edge, without the file's opening | today's review, review prompts, missed reviews and lapses |
  | Teacher | whole | the opening, the chain, hints, corrections and diagrams | today's review, review prompts, missed reviews and lapses, the close |
  | Practice | whole | the opening, hints, practice problems, mixing, transfer, corrections and diagrams | today's review, review prompts, missed reviews and lapses, the close |

  Every agent also reads `records.md`'s *Path and tasks* and *Preferences* and `course.md`'s *Exam facts*, without the files' openings: what keeps the record coherent from one session to the next (which task to continue and when to ask, `focus`, the `preferences` field, the exam facts).

  Left out on purpose, and checked by the doctrine test so a new section cannot go unread by accident: the week and the exam run-up, which read figures (`plan`'s `week` and `runup`) that the app's course brief does not carry yet, and *Difficulty*, which practice states more specifically in its own doctrine. The prober skips `teaching.md`'s opening (honour requests for a direct explanation, skip on request), which is the teacher's job. `scripts/build-server.mjs` copies the references beside the standalone server (`.next/learning/...`, shipped by electron-builder), so the same relative path holds in the desktop payload. `tests/engine-doctrine.test.ts` fails when a listed file or section is missing, so a rename in the engine breaks the build rather than a lesson.
- **What the app's prompts keep:** what is specific to the app. The adapter keeps reading the brief, the opening, the confidence mapping (and that the picker replaces the doctrine's invitation to say "guess" or "sure"), saving in the turn the answer arrives, `conclude`, keeping the rest current and refused saves. The prober keeps its goal question, `recall`, `probe_done`, its calibration lines (enter near the top, strands inform each other, escalate until a strand breaks) and that its probe maps every strand of the goal however many questions that takes, since the lesson is planned from it. The teacher keeps the method's two principles, step presentation, Socratic or expository, the question principles and how the `predict` and `check` types reach the learner (`28-predictions.md` is gone). Practice keeps its theory, modes, selection rules, interleaving, difficulty steps, progression and arc; it poses a due topic's review as a `problem` and runs it like any other, and it points to the engine for hints, verdicts, problem checks and miss classes. The app's approved practice rules moved into `teaching.md` word for word (another nudge when one does not land, never revealing or concluding after a failed attempt, unbounded surgical repair of a structural miss), with a bare "I'm stuck" starting at R0, and `tests/engine-doctrine.test.ts` pins them there.
- **Where the two differed, the more specific, code-enforced text won:** commit-before-pose, the R0 to R5 hint ladder, the miss classes and the probe's floor-and-ceiling bracketing come from the app, written as practices rather than tool calls. Evidence, free response, what counts, scheduling, reviews and the close come from the engine. The probe keeps the app's floor-and-ceiling bracketing and skips what the record already places.
- **The app's dedupe (done, 8 Nov):** the overlapping parts of the prober, teacher and practice prompts and the adapter's review-prompt rule are deleted; what the agents gain is the review procedure and review-prompt rules, and for the teacher the hint ladder, which they lacked.

## 6. One interface to the engine

The app runs the engine's agent CLI, `python -m learning [--workspace DIR] VERB`, one child process per verb, through the `CourseRecords` port (`src/core/ports.ts`) and its adapter (`src/store/course-records.ts`). The CLI fits better than the MCP server: every turn rebuilds its agent from the record, so a stateless child per verb needs no long-lived process or reconnect logic, and the CLI prints the same error JSON the MCP server wraps. Each verb takes about 0.1 s.

TypeScript only spawns the engine, maps exit codes onto a result union, and projects fields of the engine's JSON for display and context. Grading, verdicts, levels and scheduling exist only in Python.

The engine is the sibling `learning` folder in the same repository. The default engine root is the repository root (the app folder's parent) and the interpreter its `.venv/bin/python`, so no machine-specific path remains; `LH_LEARNING_ENGINE` and `LH_LEARNING_PYTHON` stay as overrides. A packaged desktop app sits outside the repository, so it needs `LH_LEARNING_ENGINE` (and `LH_LEARNING_PYTHON` when the interpreter is elsewhere).

## 7. Context budget

The course state reaches the agent as a **course brief**: a `course-context` marker in the transcript, the same idiom as the graph-context marker. At the start of each turn the server computes the brief and appends a new marker only when its key changed since the last marker the agent can see. The key is the study day, the due topics and backlog, the open tasks (with their steps when none is in focus) and the current path topic. So the cached prefix holds turn after turn. A new day, a review that cleared a due topic, compaction (which cuts old markers) and a moved task step each bring a fresh brief. Level changes between briefs reach the agent through the save receipts.

The brief is a field projection of `resume`, not a rule. `resume` writes a topic's gap, review keys and error counts once, under `topics`, for the current and task topics, so the brief reads them from there for those topics' due and weak lines. The target is an engine verb, `brief --role` (request E5), so that the engine owns the selection.

| Role | In the brief | On demand |
| --- | --- | --- |
| Prober | the study day with its weekday, exam countdown, the path with each topic's level, due topics with level and days overdue, and past the first five the total and the most overdue, weak topics with their gap and confident misses, the focused task's title, goal and step (the other open tasks by key), or with no focus every open task's title and step, preferences, pinned knowledge | a topic's needs, history and review points (`course_show`) |
| Teacher | the prober's brief: both run in one transcript, so one teach projection serves them | the plan topic's gap, note and points, and its needs' levels (`course_show`). An injected teacher brief needs the probed topics' handles, which `probe_done` does not carry yet; E5 with `--topics` covers it |
| Practice | the same, plus each due topic's review prompt, points and gap and its recurring wrong-method pairs | everything else |

The full `resume` stays a tool for another task. Its evidence log (6.2 KB in SMM, the largest part) is never injected.

Measured sizes, from copies of the real SMM and AIKR records and the app's composed prompts (`scripts/measure-course-context.ts` reproduces them). Tokens come from the provider's own counts in the live run, recorded in the run's notes. Bytes alone undercount the cost of JSON and Italian text.

| Per turn, bytes | Prober | Teacher | Practice |
| --- | --- | --- | --- |
| App system prompt | 12,292 | 33,120 | 22,592 |
| App tool schemas | 9,228 | 11,900 | 7,420 |
| Course doctrine (the app's adapter and the agent's parts of the engine's references) | 11,178 | 13,899 | 14,334 |
| `course_*` tool schemas | 2,202 | 2,202 | 2,202 |
| Course brief, SMM / AIKR | 2,322 / 1,411 | 2,322 / 1,411 | 2,322 / 1,411 |

The course adds about 16 to 19 KB per turn on SMM (doctrine, tools and brief), against 20 KB for the first bridge, which carried the full `resume`. The dedupe moved the shared doctrine out of the app's system prompts (0.9 to 3.0 KB smaller each) into the course doctrine, and prompt and doctrine together grew from 20,630 to 23,470 bytes for the prober, 43,367 to 47,019 for the teacher and 33,049 to 36,926 for practice (measured with `scripts/measure-course-context.ts`). The growth is the review procedure and review-prompt rules every agent lacked and the teacher's hint ladder, not duplicate text. The practice brief equals the teach brief on these records, because their `resume` lists due topics without review prompts; the practice agent reads them with `course_show`. In the live run on a throwaway course before the move (8 Nov, Claude Opus 5.5 through the Claude subscription), the prober's first call carried 11,277 prompt tokens by the provider's count, and later calls in the turn read about 10,600 of them from the cache.

## Delivery

1. **This branch:** the CLI adapter, course required for every session, the New course flow, linking older sessions, free response everywhere with the multiple-choice and confidence code deleted, `target` replaced by `topics`, the role briefs, and the slimmer doctrine. Proven on a throwaway course in the real app, with measured token counts.
2. **Next branch:** the per-course graph and statement topic tags. It touches extraction, the snapshot, the chain table, the home view and practice picks.
3. **The move into the journal repository (done):** the engine root defaults to the repository root, and the course prompt composes the engine's doctrine from the same repository.
4. **E3 (done):** the host-neutral `evidence.md`, `teaching.md` and `reviews.md`; each agent composes its parts of them, and the app's duplicate doctrine is deleted. **Next:** the week and the exam run-up in the app, once the course brief carries `plan`'s `week` and `runup` figures.

## Engine changes requested from the lead thread

- **E1:** a CLI verb `courses`, the same data as the MCP `courses` tool plus `study_roots` from `install.json`. It must list registered workspaces that have no `course.json` yet. Today `plan --all` lists a course only after its first save, and the study roots are readable only from an internal file.
- **E1 detail:** `courses` must not read the Journal. Today the only listing (`plan --all`) imports the Journal context, so a Journal or iCloud failure hides every course, and the app validates each new session against it.
- **E2:** `init --title T --create`: create the folder, refuse one that already holds a course, and title it, in one call.
- **E3 (done, 8 Nov):** the tutor skill's references are split into host-neutral `evidence.md`, `teaching.md` and `reviews.md` that name no tools (`practice.md` and the `## Observations` section of `records.md` are gone), `SKILL.md` keeps the host's tool mapping, and the app's code-enforced practices named in section 5 are merged in. Each app agent composes its parts of them through `ENGINE_DOCTRINE`, and the app's duplicate doctrine is deleted.
- **E5:** `brief --role prober|teacher|practice [--topics T...]`: the role projection of `resume` (section 7), with the teacher's topics joined to their needs' levels, so no selection logic lives in TypeScript.
- **E6:** a stable course id minted in the workspace manifest and returned by `courses`, so the app keys graphs and links on it instead of the folder path.
- **E4:** done (journal PR #6, `sure`).

## Decisions taken by default, which Edoardo can change

- Practice attempts count as evidence. This overturns the 29 Sep 2026 ruling that practice is "strengthening, not assessment" and that grading writes nothing; the merged system follows the lead thread's mapping of practice answers to engine attempts.
- A prediction before a plot, simulation or run of code on what was taught is saved as an attempt; a prediction before a step not yet taught is not (8 Nov: recording it would let a guess about untaught material mark a topic lapsed on a later day).

- Graph per course, in the app's data dir. The alternative is next to the course record in the vault, where the tutor could read it too.
- Multiple-choice graded questions are deleted, not kept for practice-only drills.
- Older unlinked sessions are linked on their next message, not frozen.
- The existing global graph is left untouched until he assigns it to a course.
