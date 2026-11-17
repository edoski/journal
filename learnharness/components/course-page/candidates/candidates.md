# Course page candidates

The `coursepage` switch (`../course-page-variant.ts`, registry in `../../design-variant.ts`) offers Current and three candidates for the course page's head and left column (Edo, 17 Nov 2026: the facts row is "unbearably messy", the left column "ridiculously messy"). The map on the right is the settled `ArcMap` on every candidate. Each candidate is `SplitBody` (`../split/split-course.tsx`) with its own `head` and `list`, so the linked columns, the hover tie to the map, the arrow walk and the course frame's states are one implementation. Production draws Current until one ships; shipping deletes Current, the other folders and the switch.

| Option | Thesis | Spec |
|---|---|---|
| `overview` | Linear's project overview: the head says what to do next and why, then three facts; the list is the course's arcs, quiet unless he has something to do there | `overview/overview.md` |
| `agenda` | Anki's deck overview and the topic page's Now: the list answers only "what now" (Now, Then, the arc the map shows) and leaves the arcs to the map's own list | `agenda/agenda.md` |
| `road` | Things' deadline and Duolingo's path: the arcs in study order on one track, each with the one fact the road needs, the exam a stop where the plan reaches it | `road/road.md` |

## Shared rules

- Readiness is one fact, an icon and a few words (`READY_FACT_WORDS`: "Not ready yet", "Ready for the exam", "Not all of it fits", "No exam"), the whole answer in its popover (`shared/ready-fact.tsx`): the readiness words, the arcs not ready as a list, and what the exam's plan leaves out with its way in (`ExamGapLine`). Never a pill per arc.
- The exam's run-up stays on "Exam 3 Dec"; Mistakes and Context stay quiet buttons in the head.
- A head with one line under its title is `compact` (`PageHead`), and the topic page's head beside it is too, so both pages keep one anatomy.
- No card backgrounds, no counts, no pills in a line.

## The topic page

Each candidate draws the topic page's head as its twin (`shared/topic-twin.tsx`, `TopicHead` branches on the switch): the course page's head with the topic's title in the same place, level with the rail's open button, and no line above it. Under the title, where the topic sits as linked words ("Linear Algebra › Diagonalization by change of basis", the course and its arc each opening its place on the course page; the arc pill goes) and where he stands (the pie and its words, then its marks). Overview puts the place on its own line over the standing, as its course head puts the next step over its facts; Agenda and Road run them on one line, compact, as their course heads do. The page's columns then start at the same height on both pages.

## Sources

The course page research (17 Nov 2026): Linear's project overview and milestones, Things' headings and deadlines, Anki's deck overview, Babbel's and Duolingo's course paths, Apple HIG layout and disclosure controls, NN/g on progressive disclosure, Refactoring UI on labels.
