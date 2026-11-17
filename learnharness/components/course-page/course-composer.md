# Course composer

`<CourseComposer course={…} />`: New lesson's composer (`../composer.md`) at the foot of a course page, centred, 46rem wide as on New lesson, with the course already chosen, so a lesson in this course starts where he is looking at it (Edo, 17 Nov 2026: "a clean chat composer that we can reuse to start a new chat easily within a given course").

- No course control: the page is the course. The placeholder is New lesson's, naming the course ("… in Linear Algebra").
- Sending opens the lesson through the one start path (`useLessonStart`, `SessionStarter`), with the course and no mode, so the prober reads the opening and routes it to teaching or practice as it does from New lesson. A signed-out Claude account opens sign-in first (`SetupDialog`); nothing is created until it passes.
- Used by Road (`candidates/road/road-course.tsx`, `SplitBody`'s `foot`).
