# Course page

One course at `/unit/<course>`, the parent of each topic's address (`courseHref` in `../unit-inbox/unit-href.ts`): every topic of the course once, sorted by what he would do about it, with the exam as the frame and one button for the next lesson. `data-slot="course-page"` on the scroller. Home answers "what now, across courses"; the topic page answers "this topic"; this page answers "this course".

The page is the list and the map side by side in the app's linked columns (`split/`, split-course.md; `../linked-columns/linked-columns.md`, which the topic page shares), which Edo picked on 13 Nov 2026 over a list alone, the map alone and a brief of three answers over the map, deleted with the Course switch.

## Shared parts

| File | What it is |
|---|---|
| `course-page.tsx` | the page: `SplitCourse` |
| `course-frame.tsx` | what the page wraps itself in, as Home wraps itself in `HomeFrame`: the chrome, the read with its states, each in the shared page frame (`../page-frame/page-frame.md`), the lesson start behind the head's press (its failure shows in the head, course-head/course-head.md). The page fits the window with no bar showing (`ScrollArea bar={false}`) |
| `course-chrome.tsx` | the 52px band, the window's drag region (the folded sidebar's rail holds the open button) |
| `use-course.ts` | the read: `useStudyHome` (Home's read of `/api/study` and `/api/chats`, once per visit) with the sessions started on a topic's page linked to it, as the sidebar does |
| `course-model.ts` | the pure model: `courseGroups` (the sidebar's model, read for one course), `courseNext`, `courseFacts`, `courseRead` and the types the page uses (`CourseView`, `CourseGroup`, `CourseTopic`, `TopicFact`) |
| `course-head/course-head.tsx` | the head, the shared `PageHead`: exam readiness, what the exam's plan leaves out, the facts, Mistakes, Context and the press (course-head/course-head.md) |
| `course-topic-row.tsx` | one topic as a row (course-topic-row.md) |
| `course-group.tsx` | a group's header over its rows, with folding and Show more (course-group.md) |
| `course-arc.tsx` | an arc's folded line over its rows (course-arc.md) |
| `what-next.tsx` | Pick up and Then above the arcs ("What next") |
| `standing/` | the head's readiness line and the open mistakes, from the engine's `standing` (standing/standing.md) |

The split page draws `TopicMap` (`../course-map/topic-map/topic-map.md`) directly, with its `highlight` prop to light a group's topics.

## The groups

`courseGroups(course, chats, courses)` sorts every topic once, always into the same four groups in this order, an empty one included. It reads what the sidebar says for each topic (`sidebarSays`, `../unit-inbox/sidebar-says.ts`, over `../unit-inbox/now-inbox.ts` and `../unit-inbox/today/today-top.ts`), the same source the map's cards read, so a topic sits in the group the sidebar puts it in and ends in the words the sidebar says for it (Edo's brief, 14 Nov 2026: one fact per topic across surfaces; round 4 found Kernel under Learning in the sidebar and Needs you here, and Basis and dimension "Left off 2d ago" there and "Due since 29 Oct" here).

| Group | Holds | Order | Row's fact |
|---|---|---|---|
| Needs you | what Home's Today takes up in this course: the sidebar's top (`todayTop` over every course, each line's claimed topics, `claimedKeys`) | Today's | Today's reason for it, as the sidebar's card says it (`slotWords`): "Your turn", "1w overdue", "Left off 2d ago", "Planned today" |
| Learning | the sidebar's Working and Learning shelves: taught and not solid, or solid but weak | Working first, then the shelf's: a turn that waits, then the latest studied | the sidebar row's fact (`shelfStatus`): a slip ("Sure, but wrong"), a review in today's plan, where an open task was left, when it comes back, else how long since he studied it |
| Not started | what the sidebar leaves out | the order the plan starts them (the engine's `starts`, the day each first lesson is planned), so it reads as the plan does; those the plan has no day for last, in the engine's path order (round 4: the list ran Poisson, Geometric, Expectation while the plan starts Expectation first) | nothing, except "You are here" on the current topic |
| On your own | the sidebar's On your own shelf: solid and not weak | the shelf's: the due ones first, then the soonest back | the sidebar row's fact: "3d overdue", "Left off 2d ago", "Back in 5d", "Due since 21 Oct" |

The current topic says "You are here" in place of when it comes back or when he last studied it, never in place of a reason that needs him. Which reason a topic says when it has several is the app's one order (`../study-words.md`, "Which one a topic says"): unfinished work before a review the plan dates later.

"Needs you" means one thing in the app: what Today puts in front of him. A slip Today does not take up stays in Learning with its slip's words, as on the sidebar's Learning shelf; the map card and the pie's warning ink still show it.

## Arcs

A course with two or more arcs he can see (`shownArcs`; design-v2.md 5.2) leads with them in place of the four groups; one with none, or one, shows exactly as before. `courseArcs(course, chats, courses)` gives one section per arc in study order: its topics in path order as the groups' rows (the same `sidebarSays` words and facts), `needsYou` when Today takes up one of its topics, its ring (`arcShare`: the share of its live topics he can do on his own, as Home's ring counts a course), its exam words when the next exam leaves some arc out (`examCovers`, `ARC_EXAM_WORDS`), and `current`, the arc of You are here (`currentArc`). Each section is a `CourseArc` (course-arc.md). Where he is is open on arrival; `?arc=<handle>` opens and shows another (the head's pill), and the address follows the arc he shows.

"Needs you" on an arc's line means only that Today takes up one of its topics. A slip Today does not take up stays a slip in its arc's rows, and the line says where the arc stands (`ARC_STATE_WORDS`, never literals: Edo is still choosing the words).

## What next

Above the arcs, at most two rows in Today's row style (`what-next.tsx`, `whatNext`): **Pick up**, the course's first line on Home's Today, read through `todayTop` over every course (so a slip in another arc than where he is, when Today puts it first, is what he picks up), which opens as Today's line does (`LineTarget`); **Then**, the next new topic the plan starts (the earliest `starts`, not the one he picks up), with why then as Today's rows say it (`startsWhyShort`), which opens its page. Each row: the pie beside two lines, what it is and its reason's icon and words flush right, then the title and its arc's pill flush right (left out when the reason names the arc: "Next in Eigenvalues", "Back to Linear systems" when the plan's next start sits in an arc before the one the head names). No card background, no counts; nothing at all when Today has nothing here and the plan starts nothing. A hairline closes it off from the arcs.

## States

| State | Shows |
|---|---|
| loading | the header's skeleton until both the course and where he stands for the exam (`use-course-standing.ts`) are read, the page head's rows at their heights (the empty line above the title included, `../page-frame/page-frame.md`), so nothing moves when the course arrives |
| engine not answering | "The study engine is not answering, so this course can't show right now." |
| read failed | "Couldn't read this course." and Try again (Home's words) |
| a record the engine could not read | Home's line for it ("Couldn't read this course's record." and why) and Try again |
| a course not among his courses | "This course is not here." and Go to Home |
| no exam | the facts line leaves the exam out |
| no topics | the facts line leaves the count out; every group is empty; the button reads Start a lesson's word |
| an unreadable address | `notFound()` in `app/unit/[course]/page.tsx`, as the topic route does |

The window's title is the course's name, "Course not found" for an address no listed course has, and "Course" while the engine cannot say: the route's `generateMetadata` (`app/unit/[course]/page.tsx`) sets it, since a client `<title>` comes after the root layout's.

## Entry points

- The lesson's top bar: the first crumb links to the course page (lesson-top-bar.md).
- The topic page: the course line above the title links to the course page (`../unit-inbox/topic-page/topic-head.tsx`).
- Sidebar search: matching courses come first, under Courses (unit-inbox.md, Search).

Left alone: Home's course tabs (a tab that sometimes navigates breaks what tabs mean), the sidebar's topic cards, and the course name on Today's rows (decided for him: not a link for now).

## Refused

From the research (13 Nov 2026): a progress bar or percentage of topics touched, an exam-readiness figure or grade (the engine has no model for one), engine level names, streaks and minutes, a list of every session, any form or anything he must maintain, a second composer, a calibration score, a forgetting curve, a review forecast.

## Sources

The course page research (`audit/course-page`, 13 Nov 2026): the questions it answers, the four directions (Edo kept split), the targets and the rules. Anki's overview (counts and one Study Now button); shadcn table and item (a 36px row); T3 Code's inbox (the sidebar this page agrees with).
