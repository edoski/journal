# Course composer

`<CourseComposer course={…} />`: the lesson's composer (`../lesson/lesson-composer.md`) at the foot of a course page, centred, 46rem wide as on New lesson, with the course already chosen, so a lesson in this course starts where he is looking at it (Edo, 17 Nov 2026: "a clean chat composer that we can reuse to start a new chat easily within a given course").

- One quiet line at rest (`collapsible`: the field with attach and send beside it, 42px), opening to the full composer while focused or holding words or photos (Edo, 17 Nov 2026: "too tall and barren… like the cleaner chat composer we have in chat with all its functionalities and by default it should be in collapsed state"). Photos attach, paste and drop as in a lesson and go with the opening; words and photos survive a reload, per course (`course:<workspace>`).
- No course control: the page is the course. The placeholder is New lesson's, naming the course ("… in Linear Algebra").
- Sending opens the lesson through the one start path (`useLessonStart`, `SessionStarter`), with the course and no mode, so the prober reads the opening and routes it to teaching or practice as it does from New lesson. A signed-out Claude account opens sign-in first (`SetupDialog`); nothing is created until it passes.
- Used by Road (`candidates/road/road-course.tsx`, `SplitBody`'s `foot`).
