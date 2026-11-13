# List course page

The `list` option of the Course switch (`../course-page.md`): every topic of one course once, sorted by what he would do about it. No map on the page; Home's map tab and each topic's page show where a topic sits. `list-course.tsx`; `data-slot` `course-list` (the column's content, which owns the keyboard walk), `course-list-top` (the header and where he was), `course-list-here`, `course-list-task`, `course-list-groups`, `course-list-empty`. Groups carry `data-group` with their id.

## Anatomy, top to bottom

| Part | Notes |
|---|---|
| column | 736px wide with 24px sides (`max-w-[46rem] px-6`), centred, 20px under the 52px band, 24px foot. Its text edge (x=504 and 1192 at 1440 wide) is the topic page's: its course line, title and Sessions header sit on the same x, so nothing jumps when he moves between the course and a topic |
| header | the shared `CourseHeader` (course-header.md): name and its one button, the facts line, the next lesson and why |
| where he was | `ListWhere` (`list-where.tsx`), 8px under the header in its next line's anatomy (16px muted mark, the thing in full ink, a few muted words): MapPin, the topic he is at, "You are here"; Bookmark, the open task, its step in Today's words ("At part (c): …"). A line is left out where the header's next line already names it (a Continue on the task, a Start on the topic) |
| groups | 24px below, 24px apart, each a `CourseGroup` (course-group.md) of `CourseTopicRow`s (course-topic-row.md): 36px, or 54px with a second line |

The page scrolls by wheel, trackpad and keyboard from anywhere over it, with no bar showing (see Scrolling). Linear Algebra, the fullest demo course, is 900px in an 848px page at 1440x900.

## The groups as the list draws them (`listPlan`, `list-plan.ts`)

| Group | Drawn |
|---|---|
| Needs you | every topic, the slips first ("Sure, but wrong" on top), then the overdue reviews, longest first |
| Learning | every topic started, in the sidebar's order |
| Not started | in path order, a topic with a session but an empty pie included (so the group and the pie agree); the next three, then "Show N more". Never "Show 1 more" (the button would take the room of the row it hides), and never hiding the topic he is at or one a session holds |
| Known | the sidebar's name for its shelf, so the header's "3 of 16 on your own" (Home's pie, which counts due topics too) is the only "on your own" on the page. Folded, like the sidebar's shelf; open when a session on one of its topics waits on him or is being written, or when nothing waits under Needs you or Not started (everything learned) |

- A group with no topics is left out, as the sidebar leaves out an empty shelf.
- A course with no topics says "No topics yet. They appear as you study this course." (the course map's words) in a 36px line under the header.
- Nothing is stored: each visit opens as drawn here, so there is nothing for him to keep tidy.

## What a row says (`listRow`)

- Its end: the model's fact (course-topic-row.md), except a topic still being learned that today's review takes up, which says "3d overdue" (Home's and the map's words), so the rows name every topic the header's "Review A, B, C" covers.
- Its second line (`detail`, muted, up to two lines): the engine's sentence for a diagnosed mistake ("Counts nonzero entries instead of pivots; …"), so "A mistake to fix" says which; else, where a session's "Your turn" takes the row's end, why the topic needs him ("Sure, but wrong", "Review overdue by a week"). No other row has one.

## Scrolling

The frame's scroll area shows no bar (`bar={false}`) and still scrolls by wheel and trackpad (scroll-area.md). Opening Known or pressing Show more scrolls the group into view, as much of it as fits with its header kept on screen (`scrollToShow`), smoothly unless he asks for less motion.

## Keyboard (`list-keys.ts`, `use-list-entry.ts`)

Tab is dead app-wide (owner, 17 Sep 2026), so the list walks with the arrows, as the sidebar does (`sidebar-tree.ts`).

- With nothing focused, Down or Home steps into the first stop and Up or End into the last; not while a field, the sidebar or a dialog has focus.
- Stops, in order: the header's button, a group header that folds, every topic, Show more.
- Up and Down step; Home and End jump to the ends; on Known's header Right opens it or steps into it and Left folds it; on one of its rows Left goes back to the header.
- Enter opens a topic's page or presses a button; Space opens a topic too. Show more hands focus to the first row it shows.
- Escape leaves the walk, as a click on empty space does.
- Each stop wears its 2px ring; the page scrolls to keep 24px between a focused stop and the window's edge, so the ring is never cut.
- A pointer click on Known's header gives its focus back, as the rows do (`blurAfterPointerClick`).

## States

Loading, the engine not answering, a read that failed, a course the engine could not read and a course not among his are the frame's (course-page.md). No exam leaves it out of the facts line. A very long course name truncates in the header; a long topic title truncates on its row with the fact still flush right, and in the where lines. At 1100x700 the column keeps its width and the page scrolls.

## Sources

The course page research (`audit/course-page`, 13 Nov 2026): the list direction, its layout, targets 1 to 14 and the questions the page answers ("You are here" and the open task at its step; the engine's sentence for the mistake). Its review (13 Nov 2026): B1, M1 to M4, m2, m4 to m6. The sidebar's shelf (unit-shelf.tsx: fold, Show more, its keyboard walk, the name Known); T3 Code's inbox (empty sections hidden); Anki's overview (one list, one button).
