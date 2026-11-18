# Course page

One course at `/unit/<course>`, the parent of each topic's address (`courseHref` in `../unit-inbox/unit-href.ts`): every topic of the course once, sorted by what he would do about it, with the exam as the frame and one button for the next lesson. `data-slot="course-page"` on the scroller. Home answers "what now, across courses"; the topic page answers "this topic"; this page answers "this course".

The page is the list and the map side by side in the app's linked columns (`split/`, split-course.md; `../linked-columns/linked-columns.md`, which the topic page shares), which Edo picked on 13 Nov 2026 over a list alone, the map alone and a brief of three answers over the map, deleted with the Course switch.

## Shared parts

| File | What it is |
|---|---|
| `course-page.tsx` | the page: `CourseFrame` around `SplitBody` |
| `course-frame.tsx` | what the page wraps itself in, as Home wraps itself in `HomeFrame`: the chrome, the read with its states, each in the shared page frame (`../page-frame/page-frame.md`), the lesson start behind the head's press (its failure shows in the head, course-head/course-head.md). The page fits the window with no bar showing (the app draws no scrollbar, `app/globals.css`) |
| `course-chrome.tsx` | the page under the window's 52px band (`WindowPage`, `../page-frame/page-frame.md`; the folded sidebar's rail holds the open button) |
| `use-course.ts` | the read: `useStudyHome` (Home's read of `/api/study` and `/api/chats`, once per visit) with the sessions started on a topic's page linked to it, as the sidebar does |
| `course-model.ts` | the pure model: `courseGroups` (the sidebar's model, read for one course), `courseNext`, `courseFacts`, `courseRead` and the types the page uses (`CourseView`, `CourseGroup`, `CourseTopic`, `TopicFact`) |
| `course-head/` | the head, the shared `PageHead`: readiness as one fact with its whole answer, when he last studied, Mistakes, Context, then Now with the press (course-head/course-head.md) |
| `road/` | the left column: the course's arcs in study order on one track, the exam a stop on it (road/road.md) |
| `course-composer.tsx` | New lesson's composer at the page's foot, this course chosen (course-composer.md) |
| `course-topic-row.tsx` | one topic as a row (course-topic-row.md) |
| `course-group.tsx` | a group's header over its rows, with folding and Show more (course-group.md) |
| `standing/` | the readiness words and the open mistakes, from the engine's `standing` (standing/standing.md) |

The split page draws `TopicMap` (`../course-map/topic-map/topic-map.md`) directly, with its `highlight` prop to light a group's topics.

## The groups

`courseGroups(course, chats, courses)` sorts every topic once, always into the same four groups in this order, an empty one included. It reads what the sidebar says for each topic (`sidebarSays`, `../unit-inbox/sidebar-says.ts`, over `../unit-inbox/now-inbox.ts` and `../unit-inbox/today/today-top.ts`), the same source the map's cards read, so a topic sits in the group the sidebar puts it in and ends in the words the sidebar says for it (Edo's brief, 14 Nov 2026: one fact per topic across surfaces; round 4 found Kernel under Learning in the sidebar and Needs you here, and Basis and dimension "Left off 6 Nov" there and "Due 29 Oct" here).

| Group | Holds | Order | Row's fact |
|---|---|---|---|
| Needs you | what Home's Today takes up in this course: the sidebar's top (`todayTop` over every course, each line's claimed topics, `claimedKeys`) | Today's | Today's reason for it, as the sidebar's card says it (`slotWords`): "Your turn", "Due 1 Nov", "Left off 6 Nov", "Planned today" |
| Learning | taught and not solid, or solid but weak (`restTopics`' working and learning) | the tutor writing first, then a turn that waits, then the latest studied | its fact (`shelfStatus`): a slip ("Sure, but wrong"), a review in today's plan, where an open task was left, when it comes back, else how long since he studied it |
| Not started | what the sidebar leaves out | the order the plan starts them (the engine's `starts`, the day each first lesson is planned), so it reads as the plan does; those the plan has no day for last, in the engine's path order (round 4: the list ran Poisson, Geometric, Expectation while the plan starts Expectation first) | nothing, except "You are here" on the current topic |
| On your own | solid and not weak (`restTopics`' known), the topics Home's pie counts | the due ones first, then the soonest back | its fact: "Due 5 Nov", "Left off 6 Nov", "Back in 5d", "Due 21 Oct" |

The current topic says "You are here" in place of when it comes back or when he last studied it, never in place of a reason that needs him. Which reason a topic says when it has several is the app's one order (`../study-words.md`, "Which one a topic says"): unfinished work before a review the plan dates later.

"Needs you" means one thing in the app: what Today puts in front of him. A slip Today does not take up stays in Learning with its slip's words; the map card and the pie's warning ink still show it.

## Arcs

A course with two or more arcs he can see (`shownArcs`; design-v2.md 5.2) leads with them in place of the four groups; one with none, or one, shows exactly as before. `courseArcs(course, chats, courses)` gives one section per arc in study order: its topics in path order as the groups' rows (the same `sidebarSays` words and facts), `needsYou` when Today takes up one of its topics, its exam words when the next exam leaves some arc out (`examCovers`, `ARC_EXAM_WORDS`), and `current`, the arc of You are here (`currentArc`). Each section is a line on the road (`RoadArc`, road/road.md). Where he is is open on arrival; `?arc=<handle>` opens and shows another (the topic page's arc link, the readiness fact's arcs), and the address follows the arc he shows.

"Needs you" on an arc's line means only that Today takes up one of its topics. A slip Today does not take up stays a slip in its arc's rows.

## Now

Under the head, across the page, the step to take up with its press (course-head/course-head.md, `CourseNow`): what Home's Today puts first for the course (`pickUpLine`), else its next lesson. A hairline closes it off from the road.

## States

| State | Shows |
|---|---|
| loading | "Reading your courses…" in the page's notice (`PageReading`, `../page-frame/page-frame.md`, "Notices", as every page) until both the course and where he stands for the exam (`use-course-standing.ts`) are read |
| engine not answering | `CoursesUnavailable` with its fix, in the page's notice, as every page |
| read failed | "Couldn't read this course." and Try again (Home's words) |
| a record the engine could not read | Home's line for it ("Couldn't read this course's record." and why) and Try again |
| a course not among his courses | "This course is not here." and Go to Home |
| no exam | the facts line leaves the exam out |
| no topics | the facts line leaves the count out; every group is empty; the button reads Start a lesson's word |
| an unreadable address | `notFound()` in `app/unit/[course]/page.tsx`, as the topic route does |

The window's title is the course's name, "Course not found" for an address no listed course has, and "Course" while the engine cannot say: the route's `generateMetadata` (`app/unit/[course]/page.tsx`) sets it, since a client `<title>` comes after the root layout's.

## Entry points

- The lesson's top bar: the first crumb links to the course page (lesson-top-bar.md).
- The topic page: the course and its arc on the line under the title link to the course page (`../unit-inbox/topic-page/topic-head.tsx`).
- Sidebar search: matching courses come first, under Courses (unit-inbox.md, Search).

Left alone: Home's course tabs (a tab that sometimes navigates breaks what tabs mean), the sidebar's topic cards, and the course name on Today's rows (decided for him: not a link for now).

## Refused

From the research (13 Nov 2026): a progress bar or percentage of topics touched, an exam-readiness figure or grade (the engine has no model for one), engine level names, streaks and minutes, a list of every session, any form or anything he must maintain, a second composer, a calibration score, a forgetting curve, a review forecast.

## Sources

The course page research (`audit/course-page`, 13 Nov 2026): the questions it answers, the four directions (Edo kept split), the targets and the rules. Anki's overview (counts and one Study Now button); shadcn table and item (a 36px row); T3 Code's inbox (the sidebar this page agrees with).
