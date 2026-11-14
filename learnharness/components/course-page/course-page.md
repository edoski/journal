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
| `course-model.ts` | the pure model: `courseGroups`, `courseNext`, `courseFacts`, `courseRead` and the types the page uses (`CourseView`, `CourseGroup`, `CourseTopic`, `TopicFact`) |
| `course-head/pace-head.tsx` | the head, the shared `PageHead` (course-head/course-head.md) |
| `course-topic-row.tsx` | one topic as a row (course-topic-row.md) |
| `course-group.tsx` | a group's header over its rows, with folding and Show more (course-group.md) |

The split page draws `TopicMap` (`../course-map/topic-map/topic-map.md`) directly, with its `highlight` prop to light a group's topics.

## The groups

`courseGroups(course, chats)` sorts every topic once, always into the same four groups in this order, an empty one included. It is built on the sidebar's classifier (`buildInbox`, `shelfOf`) and the topic map's words (`standingOf`, `needOf`, in `components/study-words.ts`), so the sidebar, the map and the page cannot disagree.

| Group | Holds | Order | Row's fact |
|---|---|---|---|
| Needs you | every topic the map gives a reason (`needOf`): a slip, or a topic he can do on his own whose review is due | slips first, a wrong answer he was sure of on top (Butterfield and Metcalfe 2001: confident errors are the most corrected), then the longest overdue | the map's reason: "Not right last time", "Mistake to fix", "Mixed up with …", "Sure, but wrong", "3d overdue" |
| Learning | the sidebar's Learning shelf less those | the sidebar's: a turn that waits first, then the latest studied | "You are here" on the current topic, else where an open task holding it was left ("At part (c): …"), else nothing. A topic still being learned never says its review is due (the sidebar's rule) |
| Not started | what the sidebar leaves out | the engine's path order | "You are here" if it is the current topic, else nothing |
| On your own | the sidebar's Known shelf | the soonest back first | when it comes back, as the sidebar and the topic page say it (`reviewWords`): "Back in 5d", or "Due since 21 Oct" for a review held past its day |

A session on the topic that waits on him says "Your turn" (in the accent) and one the tutor writes in says "Working", whatever the group, as the sidebar's rows do.

The head's progress words ("Some topics on your own", `courseShareWords`) follow Home's progress ring, which also takes in the topics he can do on his own whose review is due; those sit in Needs you, so the words can run ahead of the On your own group (decided for him: the words follow the ring, as Home does).

## States

| State | Shows |
|---|---|
| loading | the header's skeleton, the head's three rows at their heights (course-head/course-head.md), so nothing moves when the course arrives |
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
