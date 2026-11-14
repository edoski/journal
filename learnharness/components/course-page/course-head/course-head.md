# Course head

The course page's head is Pace (Edo picked it on 14 Nov 2026 over Brief and Road): the course's name and the page's press (Resume, Review, Continue or Start), Context in place of Add material (`../../course-context/course-context.md`), then whether the course is on track for its exam, then the exam and when he last studied. It drops the progress words ("Some topics on your own") and the next-lesson line that repeated the Needs you rows (Edo, 14 Nov 2026).

Under the title: the topics the plan has no room for before the exam, in the warning ink; inside the run-up the ones not yet solid; else "Every topic fits before the exam" or "Every topic started"; "No exam day set" without one. Once the engine has arcs, "In <arc>" leads the standing line.

Shared parts (`head-parts.tsx`): `ContextButton`; `ExamFact`, "Exam in 11 days" pressed opens the exam's run-up (the day, whether every topic fits, each week's new topics, the final review, Open the calendar); `StudiedFact`, "Studied 2 days ago" links to his latest session in the course, its title in the hint; `CourseLessonError`, the course frame's word when the press could not start a lesson. Facts come from the engine only (`head-facts.ts`, pure, tested): its daily plan and run-up as the calendar reads them (`/api/calendar`), its map, the sessions.

Every line is words and icons: no counts, levels or percentages. The lead keeps its 20px row while the plan is read, so nothing below moves.
