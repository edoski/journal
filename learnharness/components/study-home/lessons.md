# Lessons

Today's lines as lessons in plain words, which the study home, the course page and the sidebar read, and the pieces that draw one: `lesson-facts.ts` (`lessonOf`, `arcPlace`), `lesson-button.tsx`, `day-heading.tsx` (`day-heading`), and the page frame `home-frame.tsx`. The lines and their order are Today's (today.md, `todayRows`).

## A lesson

| Field | Says | From |
|---|---|---|
| course | the course's title; "No course" for a session without one | the engine's map, the session's record |
| exam | "Exam in 11 days", only inside the exam run-up | `plan`'s run-up, the map's exam |
| place | the arc the lesson sits in, when every one of its topics lies in that arc (`arcPlace`); none when its topics span arcs (a review mixes arcs by design) and in a course without arcs. Never drawn on the row: pointing at the row picks this arc on Home's map (`HomeMap`'s `arc`), as the course tab slides to its course | the lesson's topics' `arc` on the course map, the arc from `map.arcs` |
| title | the session's title, "Review A, B, C", "Continue <task or topic>", "Start a lesson" | `stepWords` |
| detail | "Waiting for your reply"; "Then <task or topic>" after reviews, left out when it only repeats a review; the open task's step | the session's state, the map's tasks |
| action | the press's one word (`pressWord`, `../study-words.ts`): Resume (a session), Review, Continue, Start. Home's row never shows it; the course page's Now and the sidebar's hover action do | the lesson's kind |

A waiting session sits at the course topics its transcript worked on (`ChatListItem.topics`), so it has a place too. Reviews are named, never counted. The place replaced "topic 5–7 of 24" when arcs landed (design v2, 5.4). Edo turned down the arc as row text (14 Nov 2026): it shows on Home's map, in its arc list, while he points at the row.

## The page frame

`HomeFrame` holds what every study home shares: the 52px drag strip and the sidebar toggle, the read of the courses (`useStudyHome`) with its states, the lesson start with its guards (`useLessonStart`) and its error line. A home gives its column's classes and draws the ready state from `HomeReady` (the lines, the lessons, the courses in Today's order, `onContinue`).

| State | Shows |
|---|---|
| loading | "Reading your courses…" (`PageReading`, `../page-frame/page-frame.md`, "Notices", as every page says it), only before this window has read Home once; a later visit shows the last Home read until its own read lands (round 12, 1 m8). The sessions and the courses land each on their own, so Today lists the live lesson and drops a line a session finished since the courses were read, without waiting on the engine (round 13, 3 N3, 1 n1) |
| engine unavailable | `CoursesUnavailable` with its fix, in the page's notice (`PageNotice`), as every page |
| read failed | "Couldn't read your courses." with Try again |
| no courses | "No courses yet. Start a lesson from New lesson and pick a course there." |
| one course unreadable | the others, then one line per unreadable course under Today: its name (the title a linked session carries, else its folder's), then "Couldn't read this course's record." and why in plain words: "Its file is damaged.", "macOS won't let the app open its files: Get Info on the course folder in Finder shows who can read it." or "Its file can't be opened." (`unreadable-course.tsx`); with no readable course, only those lines |
| a start failed | "Couldn't open the session. Try again." under the home |

`DayHeading` is a home's title: one question in 20 at 500, "What are we studying this morning?" ("this afternoon" by the learner's clock, "today" from 6 pm, never "this evening" or "tonight"; `dayQuestion`); never the date (Edo, 13 Nov 2026: one line, dynamic, not about the date).

## Sources

Research of 12 Nov 2026 (second pass): Brilliant's home ("Pick up where you left off": course, lesson, position, Continue), Math Academy's task list (the task's type leads the row) and Andy Matuschak's notes on it (a queue cut off from the course's structure reads as a black box), Nielsen Norman Group on progress ("3 of 50" over a percentage) and on homepages (clear starting points for the main one to four tasks), Apple HIG lists and tables (succinct rows, detail on selection) and typography (macOS body 13, callout 12), shadcn `item.tsx` (title 14 at 500, 4px to the description), T3 Code's "Awaiting input" wording for a session that waits.
