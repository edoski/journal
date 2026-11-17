# Course composer

`<CourseComposer course={…} />`: the lesson's composer (`../lesson/lesson-composer.md`) at the foot of a course page, centred, 46rem wide as on New lesson, with the course already chosen, so a lesson in this course starts where he is looking at it (Edo, 17 Nov 2026: "a clean chat composer that we can reuse to start a new chat easily within a given course").

- Compact at rest (`compact`, `../lesson/lesson-composer.md`, Compact): one row, the field and send; it opens to the lesson's full composer, attach included, while focused or holding words or photos. Photos attach, paste and drop as in a lesson and go with the opening; words and photos survive a reload, per course (`course:<workspace>`).
- No course control: the page is the course. The placeholder is New lesson's, naming the course ("… in Linear Algebra").
- Sending opens the lesson through the one start path (`useLessonStart`, `SessionStarter`), with the course and no mode, so the prober reads the opening and routes it to teaching or practice as it does from New lesson. A signed-out Claude account opens sign-in first (`SetupDialog`); nothing is created until it passes.
- Used by the course page (`split/split-course.tsx`, `SplitBody`, at its foot).
