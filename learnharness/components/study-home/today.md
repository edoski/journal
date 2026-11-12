# Today

The home's list of what to study today: one line per course, each its one next lesson. `today.tsx`, `data-slot` `today`, title `day-heading`, lines `today-line` (the first `data-primary`), overflow `today-also`. Facts in `study-facts.ts` (`todayRows`, `nextStepOf`).

## Anatomy

| Part | Notes |
|---|---|
| heading | `DayHeading`, the page's title: "Today" 20 at 500, then the study day 13 muted ("Sunday 8 November"). It stays above the rows it names, under the map (Edo, 12 Nov 2026: "where it's at, but bigger"); above the map it would sit beside the course tabs and away from its list |
| line | 52px, radius 8, hover `fill-hover`; three columns, the same on every line: course 144px, lesson (fills), action 88px; 24px between. The whole line opens the lesson |
| course | the course 13 in ink, one line |
| lesson | 13 at 500, one line: "Review A, B and more" (today's review), "Continue <task or topic>", the waiting session's title, or "Start a lesson" |
| action | the first line only: the primary button's look, "Continue" or "Open" (32px); it is part of the line, not a second control |
| also | past five courses the fifth line reads "Also today:" and each further course as a quiet button that opens its lesson |

Not on a line (Edo, 12 Nov 2026): the exam run-up ("Exam in 11 days"), what follows a review ("Then Bayes' rule"), the open task's step, and the place on the map ("Steps 2–3 of 5" with its marks). Each was a second line or a column that told him nothing when he came back after days away. The row candidates (`agenda-rows/`) try what a line should say instead.

## Order

A session waiting on the learner since yesterday takes its course's line, most recent first (one with no course gets its own line). Then every other course, most urgent first (`byUrgency`: in the exam run-up, nearest exam, most recent activity). An older waiting session stays in the sidebar.

## Words

Reviews are named, never counted: two titles, then "and more" (`titleList`). Today's review is the engine's (`plan`'s `due`, in its order); without a plan, every topic due today.
