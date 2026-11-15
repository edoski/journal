# Now card

One of Today's lines as a sidebar card (`unit-inbox.md`, "Today on top"). `now-card.tsx` (`NowCard`, `NowAction`, `nowActionOf`), drawn on `RowCard` (`row-card.tsx`, the card shell `TopicCard` shares), `data-slot="unit-card"`.

## Anatomy

| Part | Notes |
|---|---|
| card | `RowCard`: 60px, padding 8 × 10, radius 8, no surface; hover `fill-hover`, the open page (the topic or one of its sessions) `fill-selected` with `aria-current` |
| line 1 | the course's mark (`CourseMark`, 16px) and name (12/400 muted, truncating first), then the status slot |
| status slot | `data-slot="unit-status-slot"`, right-aligned, up to 60% of the line: `WhyMark` at size `slot` (`../study-home/agenda-rows/why-mark.md`), a 12px icon and the line's `slot` words. Your turn is `link` at 500; every other reason muted at 400. While the tutor writes in the topic: the spinner and Tutor writing, and the card recedes to 70% until its row is hovered or anything in it has keyboard focus (its action included, so it never flickers on the way to the action) |
| line 2 | the line's one name, the same as Home's line (`NowLine.title`, Home's lesson: "Continue Problem sheet 4: rank and nullity", "Review Law of total probability, Binomial distribution", a session's title), 14/500, full ink, two lines at most (the one row rule, `row-card.md`); a click still opens the lead topic's page |
| action | `data-slot="row-action"`, over the status slot on hover or keyboard focus (the slot fades): a session line's Resume (play, a link to the session); a course line's Home word, Review, Continue or Start (play), which starts the course's lesson as Home's line does (`useContinueCourse`, Home's "Let's continue" opening) |

## The course card

A course's line with no topic to lead with (an open task that holds no topic of the map, on a course with no current topic): line 1 is its course's mark and name and the line's reason ("Left off today"); line 2 the line's name ("Continue Past exam paper 2024"); the action is the line's Home word, as on a topic card. A click takes the line up as Home's line does (`courseCardMove`, `courseMove`): it opens the session that holds the step, else starts the lesson on it; never the course page (round 8: "Continue Problem sheet 4" opened the course page). `data-sidebar-row` is `course:<workspace>`.

## The session card

A waiting session whose transcript holds no topic of its course's map, or that has no course: line 1 is its course's mark and name, or a dashed circle and "No course"; line 2 its title; the slot says Your turn, or the spinner and Tutor writing at 70% while the tutor writes in it (a card the list keeps in place through a turn). A click opens the session; it has no action. `data-sidebar-row` is `chat:<id>`.

## States

| State | Card |
|---|---|
| rest | as above |
| hover | `fill-hover`; the slot fades and the action shows |
| keyboard focus | a 2px inset ring; Right moves to the action (`sidebar-tree.ts`), which shows with its own ring, and Left goes back |
| open page | `fill-selected`, `aria-current="page"` |
| tutor writing | spinner and Tutor writing in the slot, 70% until its row is hovered or focused |
| long titles | the course name truncates and the title stops at two lines, ending in an ellipsis; the slot keeps its words and its right edge |

Sources: T3 Code's sidebar thread row (status label `size-3` at 12px, hover action over it); today.md, "Needs you now" (the line, its reason and its action are Home's).
