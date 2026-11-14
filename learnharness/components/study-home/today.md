# Today

The home's list of what to study today: each session to pick up, then each course's one next lesson. `today.tsx`, `data-slot` `today`, title `day-heading`, lines `today-line`, overflow `today-also`. Facts in `study-facts.ts` (`todayRows`, `nextStepOf`). The lines are the hybrid rows (`agenda-rows/hybrid/hybrid.md`), Edo's pick of 13 Nov 2026: their anatomy, words and marks are specified there.

## Anatomy

| Part | Notes |
|---|---|
| heading | `DayHeading`, the page's title: one question in 20 at 500, "What are we studying this morning?" ("this afternoon", "this evening", "tonight" by the learner's clock, `studyQuestion`); never the date (Edo, 13 Nov 2026: one line, dynamic, not about the date). It stays above the rows it names, under the map (Edo, 12 Nov 2026: "where it's at, but bigger"); above the map it would sit beside the course tabs and away from its list |
| line | a hybrid row (hybrid.md); the whole line opens the lesson |
| lesson | "Review A, B, C" (today's review, every topic), "Continue <task or topic>", the waiting session's title, or "Start a lesson" |
| also | past five courses the fifth line reads "Also today:" and each further course as a quiet button that opens its lesson |

No line has a button: the first row's blue Open looked ugly and every line already opens its lesson (Edo, 13 Nov 2026). Not on a line (Edo, 12 Nov 2026): the exam run-up ("Exam in 11 days"), what follows a review ("Then Bayes' rule"), the open task's step, and the place on the map ("Steps 2–3 of 5" with its marks). Each was a second line or a column that told him nothing when he came back after days away. What a line says instead is the hybrid row's pie, recency and reason (`agenda-rows/agenda-rows.md`).

## Order

Each session to pick up since yesterday (it waits on the learner, the tutor writes in it, or it stopped mid-reply) has its own line, most recent first, and keeps it while the tutor writes, its reason saying so. Then each course's next step, most urgent first (`byUrgency`: in the exam run-up, nearest exam, most recent activity), unless a session shown works on that step (it holds the task, or was started on or worked on every topic of the step); a lesson waiting on another topic never hides a due review. A finished session, a sign-off included, has no line. An older session to pick up stays in the sidebar. Home reads again whenever a turn starts or settles, a record or the session list changes.

A course's line, pressed (`courseMove`): a review opens a session on those topics that is still to pick up, else starts a review of them, titled and opened "Review A and B" and created on those topics; never an older lesson. An open task or the current topic continues the lesson that holds it (`continueMove`), else starts one; a topic not started reads "Start <title>".

## Words

Reviews are named, never counted: every title, joined by commas only (`titleList`), since a title may hold its own "and" ("Random variables and distributions") and "and more" hid which topics the review takes up (13 Nov 2026). Today's review is the engine's (`plan`'s `due`, in its order); without a plan, every topic due today.

## Needs you now

What needs the learner now is exactly Today's lines: `needs-you.ts` (`needsYouNow(courses, chats, today)`), tested in `tests/needs-you.test.ts`. Home draws its `rows` (`home-frame.tsx`); the sidebar's top draws its `lines` (`unit-inbox/unit-inbox.md`, "Today on top"), so both answer "what next?" with the same lines, in the same order, with the same reasons.

| Field | Notes |
|---|---|
| `rows` | `todayRows(courses, openSessions(chats), today)`: what Today draws |
| `lines`, `also` | `foldLines(rows)`'s shown and folded lines, each a `NowLine` |
| `NowLine.why` | Home's reason, `whyOf(row)` |
| `NowLine.topics` | `lineTopics(row)` on the line's course map: a waiting session's topics on its course's map, in map order (none with no course); a course's step topics (a review in the plan's order, at most five; a task's held topics, else the current topic; the topic step's topic; none for "none") |
| `NowLine.lead` | the topic the line's reason is about (`leadOf`), moved first in `topics`, the topic the sidebar draws the line as: a lapse's lapsed topic (so the card reads "Not right last time" under its own title), an open task's current topic when the task holds it, else the first of them; null with none |
| `NowLine.slot` | the reason's words for a 12px status slot: `why.short`, except a lapse on the lead itself reads "Not right last time" (the slip's words, `components/study-words.ts`) and a task's words stop at the first colon ("At part (c)") |
