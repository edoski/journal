# Today

The home's list of what to study today: each session to pick up, then each course's one next lesson. `today.tsx`, `data-slot` `today`, title `day-heading`, lines `today-line`, overflow `today-also`. Facts in `study-facts.ts` (`todayRows`, `nextStepOf`). The lines are the hybrid rows (`agenda-rows/hybrid/hybrid.md`), Edo's pick of 13 Nov 2026: their anatomy, words and marks are specified there.

## Anatomy

| Part | Notes |
|---|---|
| heading | `DayHeading`, the page's title: one question in 20 at 500, "What are we studying this morning?" ("this afternoon", "this evening", else "today", by the learner's clock, `dayQuestion`; never "tonight", since he studies in the daytime), "What else are we studying this morning?" once he has finished something today; never the date (Edo, 13 Nov 2026: one line, dynamic, not about the date). It stays above the rows it names, under the map (Edo, 12 Nov 2026: "where it's at, but bigger"); above the map it would sit beside the course tabs and away from its list |
| done | once he has finished something today, one quiet line under the heading: a 14px circle-check and "Done today: Eigenvalues and eigenvectors, Rank practice" in 12 muted (`doneWords`), each session by its title, oldest first, ending on a whole title or word when long (`MathLine`); nothing before he finishes anything |
| line | a hybrid row (hybrid.md); the whole line opens the lesson; no fill at rest, only while he points at it |
| lesson | "Review A, B, C" (today's review, every topic), "Continue <task or topic>", the waiting session's title; on a course with every topic his own and nothing due, the review the plan dates next, "Review Improper integrals", its reason when it comes back ("Back in 3w"); "Start a lesson" only for a course with no topic to name (round 3: "Calculus I · Start a lesson" named no topic and no reason) |
| also | past five courses the fifth line reads "Also today:" and each further course as a quiet button that opens its lesson, its tooltip naming the lesson and why ("Review Improper integrals. Back in 3w"); the label sits as far from the first course as the courses from each other |

No line has a button: the first row's blue Open looked ugly and every line already opens its lesson (Edo, 13 Nov 2026). Not on a line (Edo, 12 Nov 2026): the exam run-up ("Exam in 11 days"), what follows a review ("Then Bayes' rule"), the open task's step, and the place on the map ("Steps 2–3 of 5" with its marks). Each was a second line or a column that told him nothing when he came back after days away. What a line says instead is the hybrid row's pie, recency and reason (`agenda-rows/agenda-rows.md`).

## Order

Each session to pick up since yesterday (it waits on the learner, the tutor writes in it, or it stopped mid-reply), and each one left for next time however long ago, has its own line, most recent first, and keeps it while the tutor writes, its reason saying so. Then each course's next step for today, most urgent first (`byUrgency`: in the exam run-up, nearest exam, most recent activity), unless a session shown works on that step. A course with nothing today (nothing to take up, or a next item the plan dates on a later day, `laterOnly`) has no line on Today, in its fold or on the sidebar's top; the course page still names its next item with the plan's day ("Review Cauchy sequences", "Planned Sun 15 Nov"), and Home's tabs still list it (`todayCourses`) (it holds the task, or was started on or worked on every topic of the step); a lesson waiting on another topic never hides a due review. A finished session, a sign-off included, has no line. An older session to pick up stays in the sidebar. Home reads again whenever a turn starts or settles, a record or the session list changes.

A course's line, pressed (`courseMove`): a review opens a session on those topics that is still to pick up, else starts a review of them, titled and opened "Review A and B" and created on those topics; never an older lesson. An open task or the current topic continues the lesson that holds it (`continueMove`), else starts one; a topic not started reads "Start <title>".

## Words

Reviews are named, never counted: every title, joined by commas only (`titleList`), since a title may hold its own "and" ("Random variables and distributions") and "and more" hid which topics the review takes up (13 Nov 2026). Today's review is the engine's (`plan`'s `due`, in its order); without a plan, every topic due today.

## A day of study

Home says when he has studied today (the round-3 evaluation: after two closed sessions it still asked "What are we studying this morning?"). `day-record.ts`, tested in `tests/day-record.test.ts`:

- `doneToday(chats, now)`: each session the tutor closed (`ended` "closed", not waiting on him, not stopped, not empty) whose last turn fell on today's date by the learner's clock (`localDay`, `components/day-change.ts`), by title, oldest first. The day ends at midnight: Home rereads then (`useDayChange`) and the line empties.
- The heading asks what else, and the done line names what he did. Never a count, a streak or a share: "Two lessons done" was rejected as a tally, so the words name the lessons.

## Needs you now

What needs the learner now is exactly Today's lines: `needs-you.ts` (`needsYouNow(courses, chats, today)`), tested in `tests/needs-you.test.ts`. Home draws its `rows` (`home-frame.tsx`); the sidebar's top draws its `lines` (`unit-inbox/unit-inbox.md`, "Today on top"), so both answer "what next?" with the same lines, in the same order, with the same reasons.

| Field | Notes |
|---|---|
| `rows` | `todayRows(courses, openSessions(chats), today)` without the lines that hold nothing today (`laterOnly`): what Today draws |
| `NowLine.title` | the line's one name, Home's lesson (`lessonTitle`), for every surface that draws the line |
| `lines`, `also` | `foldLines(rows)`'s shown and folded lines, each a `NowLine` |
| `NowLine.why` | Home's reason, `whyOf(row)` |
| `NowLine.topics` | `lineTopics(row)` on the line's course map: a waiting session's topics on its course's map, in map order (none with no course); a course's step topics (a review in the plan's order, at most five; a task's held topics, else the current topic; the topic step's topic; none for "none") |
| `NowLine.lead` | the topic the line's reason is about (`leadOf`), moved first in `topics`, the topic the sidebar draws the line as: a lapse's lapsed topic (so the card reads "Missed last time" under its own title), an open task's current topic when the task holds it, else the first of them; null with none |
| `NowLine.slot` | the reason's words for a 12px status slot: `why.short`, except a lapse on the lead itself reads "Missed last time" (the slip's words, `components/study-words.ts`) and a task's words stop at the first colon ("At part (c)") |
