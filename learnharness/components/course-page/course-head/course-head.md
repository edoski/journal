# Course head candidates

Candidates for the course page's head, options of the dev-only `course-head` switch (`components/design-variant.ts`; production draws Current until one ships). `CourseHead` branches once. Each keeps the course's name and the page's press (Resume, Review, Continue or Start), replaces Add material with Context (`../../course-context/course-context.md`), and drops the progress words ("Some topics on your own") and the next-lesson line that repeated the Needs you rows (Edo, 14 Nov 2026).

Shared parts (`head-parts.tsx`): `ContextButton`; `ExamFact`, "Exam in 11 days" pressed opens the exam's run-up (the day, whether every topic fits, each week's new topics, the final review, Open the calendar); `StudiedFact`, "Studied 2 days ago" links to his latest session in the course, its title in the hint. Facts come from the engine only (`head-facts.ts`, pure, tested): its daily plan and run-up as the calendar reads them (`/api/calendar`), its map, the sessions.

| Option | Thesis | Under the title | Arcs, once the engine has them |
|---|---|---|---|
| Pace | Will I be ready? (Linear's project health) | the topics the plan has no room for before the exam, in the warning ink; inside the run-up the ones not yet solid; else "Every topic fits before the exam" or "Every topic started"; "No exam day set" without one | "In <arc>" leads the standing line |

Every line is words and icons: no counts, levels or percentages. The lead keeps its 20px row while the plan is read, so nothing below moves.
