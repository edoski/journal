# Today

The home's list of what to study today: one line per waiting session, then one per course, each its one next lesson. `today.tsx`, `data-slot` `today`, title `day-heading`, lines `today-line`, overflow `today-also`. Facts in `study-facts.ts` (`todayRows`, `nextStepOf`).

## Anatomy

| Part | Notes |
|---|---|
| heading | `DayHeading`, the page's title: one question in 20 at 500, "What are we studying this morning?" ("this afternoon", "this evening", "tonight" by the learner's clock, `studyQuestion`); never the date (Edo, 13 Nov 2026: one line, dynamic, not about the date). It stays above the rows it names, under the map (Edo, 12 Nov 2026: "where it's at, but bigger"); above the map it would sit beside the course tabs and away from its list |
| line | 52px, radius 8, hover `fill-hover`; two columns, the same on every line: course 144px, lesson (fills); 24px between. The whole line opens the lesson |
| course | the course 13 in ink, one line |
| lesson | 13 at 500, one line: "Review A, B, C" (today's review, every topic), "Continue <task or topic>", the waiting session's title, or "Start a lesson" |
| also | past five courses the fifth line reads "Also today:" and each further course as a quiet button that opens its lesson |

No line has a button: the first row's blue Open looked ugly and every line already opens its lesson (Edo, 13 Nov 2026). Not on a line (Edo, 12 Nov 2026): the exam run-up ("Exam in 11 days"), what follows a review ("Then Bayes' rule"), the open task's step, and the place on the map ("Steps 2–3 of 5" with its marks). Each was a second line or a column that told him nothing when he came back after days away. The Rows switch's Proposed, the hybrid row (`agenda-rows/agenda-rows.md`), says what a line should say instead; this page's anatomy is Rows' Current.

## Order

Every session waiting on the learner since yesterday is its own line, most recent first, a second one in the same course included (Rank practice beside Eigenvalues on the demo); it takes its course's line, so that course gets none. Then every other course, most urgent first (`byUrgency`: in the exam run-up, nearest exam, most recent activity). An older waiting session stays in the sidebar. At most five lines (`foldLines`).

## Words

Reviews are named, never counted: every title, joined by commas only (`titleList`), since a title may hold its own "and" ("Random variables and distributions") and "and more" hid which topics the review takes up (13 Nov 2026). Today's review is the engine's (`plan`'s `due`, in its order); without a plan, every topic due today.

## Needs you now

What needs the learner now is exactly Today's lines: `needs-you.ts` (`needsYouNow(courses, chats, today)`), tested in `tests/needs-you.test.ts`. Home draws its `rows` (`home-frame.tsx`); the Proposed sidebar's top under the Inbox switch draws its `lines` (`unit-inbox/unit-inbox.md`, "Inbox switch"), so both answer "what next?" with the same lines, in the same order, with the same reasons.

| Field | Notes |
|---|---|
| `rows` | `todayRows(courses, waitingSessions(chats), today)`: what Today draws |
| `lines`, `also` | `foldLines(rows)`'s shown and folded lines, each a `NowLine` |
| `NowLine.why` | Home's reason, `whyOf(row, today)` |
| `NowLine.topics` | `lineTopics(row)` on the line's course map: a waiting session's topics on its course's map, in map order (none with no course); a course's step topics (a review in the plan's order, at most five; a task's held topics, else the current topic; the topic step's topic; none for "none") |
| `NowLine.lead` | the topic the line's reason is about (`leadOf`), moved first in `topics`, the topic the sidebar draws the line as: a lapse's lapsed topic (so the card reads "Missed last time" under its own title), an open task's current topic when the task holds it, else the first of them; null with none |
| `NowLine.slot` | the reason's words for a 12px status slot: `why.short`, except a lapse on the lead itself reads "Missed last time" and a task's words stop at the first colon ("At part (c)") |
