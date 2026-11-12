# Today

The home's list of what to study today: one line per course, each its one next lesson. `today.tsx`, `data-slot` `today`, lines `today-line` (the first `data-primary`), places `today-place`, overflow `today-also`. Facts in `study-facts.ts` (`todayRows`, `nextStepOf`, `pathPlace`).

## Anatomy

| Part | Notes |
|---|---|
| heading | "Today" 12 at 600 in ink, then the study day 12 at 400 muted ("Sunday 8 November") |
| line | 52px, radius 8, hover `fill-hover`; four columns, the same on every line: course 144px, lesson (fills), place 144px, action 88px; 24px between. The whole line opens the lesson |
| course | the course 13 in ink; inside the exam run-up, "Exam in 11 days" under it, 12 muted |
| lesson | 13 at 500: "Review A, B and more" (today's review), the open task's title, "Continue <topic>", the waiting session's title, or "Start a lesson"; under it, 12 muted, "Then <task or topic>" after reviews, or the open task's step |
| place | one 4×12 mark per step of the course's map, the lesson's steps in ink and the rest at 15%, then "Step 5 of 7" or "Steps 2–5 of 7" (12 muted, tabular). A waiting session shows "Your turn" (12 at 600, `link`) instead: a session names no topic |
| action | the first line only: the primary button's look, "Continue" or "Open" (32px); it is part of the line, not a second control |
| also | past five courses the fifth line reads "Also today:" and each further course as a quiet button that opens its lesson |

A step is a layer of the map drawn above (`course-map-layout.ts`), so "Step 3" is the third row of the drawing. The engine's path index is not used: it can contradict the drawing.

## Order

A session waiting on the learner since yesterday takes its course's line, most recent first (one with no course gets its own line). Then every other course, most urgent first (`byUrgency`: in the exam run-up, nearest exam, most recent activity). An older waiting session stays in the sidebar.

## Words

Reviews are named, never counted: two titles, then "and more" (`titleList`). Today's review is the engine's (`plan`'s `due`, in its order); without a plan, every topic due today.
