# Lessons

Today's lines as lessons in plain words, which the study home, the course page and the sidebar read, and the pieces that draw one: `lesson-facts.ts` (`lessonOf`, `topicSpan`), `lesson-button.tsx`, `day-heading.tsx` (`day-heading`), `map-frame.ts`, and the page frame `home-frame.tsx`. The lines and their order are Today's (today.md, `todayRows`).

## A lesson

| Field | Says | From |
|---|---|---|
| course | the course's title; "No course" for a session without one | the engine's map, the session's record |
| exam | "Exam in 11 days", only inside the exam run-up | `plan`'s run-up, the map's exam |
| place | the lesson's first and last topic in the course's path, of how many (`topicSpan`) | the lesson's topics among the course's topics in the engine's path order (prerequisites first) |
| title | the session's title, "Review A, B, C", "Continue <task or topic>", "Start a lesson" | `stepWords` |
| detail | "Waiting for your reply"; "Then <task or topic>" after reviews, left out when it only repeats a review; the open task's step | the session's state, the map's tasks |
| action | Open (a session), Review, Continue, Start | the lesson's kind |

A waiting session sits at the course topics its transcript worked on (`ChatListItem.topics`), so it has a place too. Reviews are named, never counted. The place counts topics, not the map's rows: the drawing's layers ("steps") stay the study home's map's.

## The page frame

`HomeFrame` holds what every study home shares: the 52px drag strip and the sidebar toggle, the read of the courses (`useStudyHome`) with its states, the lesson start with its guards (`useLessonStart`) and its error line. A home gives its column's classes and draws the ready state from `HomeReady` (the lines, the lessons, the courses in Today's order, the study day, `onStart`, `onContinue`).

| State | Shows |
|---|---|
| loading | "Reading your courses…" |
| engine unavailable | `CoursesUnavailable` with its fix |
| read failed | "Couldn't read your courses." with Try again |
| no courses | "No courses yet. Start a lesson from New lesson and pick a course there." |
| one course unreadable | the others, then "Couldn't read one course: <folder>" |
| a start failed | "Couldn't open the session. Try again." under the home |

`DayHeading` is a home's title: one question in 20 at 500, "What are we studying this morning?" ("this afternoon", "this evening", "tonight" by the learner's clock, `studyQuestion`); never the date (Edo, 13 Nov 2026: one line, dynamic, not about the date). `LessonButton` opens a lesson: a link to the session that waits, or a button that takes up the course's next step; it takes the shadcn button's props for its look. `mapFade` and `MAP_BOX` frame an embedded course map: faded edges, no scrollbars, and a drawing shorter than its frame sits at the frame's middle.

## Sources

Research of 12 Nov 2026 (second pass): Brilliant's home ("Pick up where you left off": course, lesson, position, Continue), Math Academy's task list (the task's type leads the row) and Andy Matuschak's notes on it (a queue cut off from the course's structure reads as a black box), Nielsen Norman Group on progress ("3 of 50" over a percentage) and on homepages (clear starting points for the main one to four tasks), Apple HIG lists and tables (succinct rows, detail on selection) and typography (macOS body 13, callout 12), shadcn `item.tsx` (title 14 at 500, 4px to the description), T3 Code's "Awaiting input" wording for a session that waits.
