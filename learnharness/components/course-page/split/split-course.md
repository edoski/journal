# Split course page

The course page (course-page.md): the list and the map side by side in the app's linked columns (`../../linked-columns/linked-columns.md`), with no line between them (Edo picked Current, 14 Nov 2026). Thesis: the list says what to do, the map says where it sits, and pointing at one shows it in the other. `split-course.tsx` (the page), `split-list.tsx` (left pane), `split-map.tsx` (right pane), `split-tie.ts` (what ties them and where the map scrolls, pure; tests in `tests/course-page-split.test.tsx`). `data-slot` `course-split` (the linked columns), `course-split-list` and `course-split-list-scroller`, `course-split-map` and `course-split-map-scroller`; the rows, groups and header keep their shared slots.

## Layout

| Part | Notes |
|---|---|
| column | the shared page frame (`../../page-frame/page-frame.md`): centred, up to 72rem, 24px sides, 24px under the 52px band and below; fits the window, never scrolls as a page |
| header | `PaceHead` (../course-head/course-head.md), the frame's head, its press at the far right |
| panes | 20px under the head, filling the rest: the linked columns, the list up to 24rem and the map in the rest, 24px apart, nothing around them |
| list | the groups in their order (Needs you, Learning, Not started, On your own), an empty group left out, 16px apart; each a 28px `CourseGroup` header over 32px `CourseTopicRow`s, each ending in its reason's icon and words flush right (the title truncates first). A topic a session waits on him for ("Your turn") sits at the top of Needs you, never under Learning, so Learning holds only topics he is learning. Each group is a shadcn Collapsible: Needs you and Learning open, Not started and On your own folded to their header with its chevron pointing right (Edo, 14 Nov 2026: what needs him leads); a click on a header opens or folds it, held for the visit only, never stored (`OPEN_AT_FIRST`). No Show more. Linear Algebra fits whole at 1512x982; a longer list scrolls inside its pane (wheel, trackpad) with no bar showing, its bottom edge fading 40px while more is below and its top while more is above |
| map | the shared `TopicMap` (topic-map.md), unchanged: no outline, no header copy (Edo, 12 Nov 2026), edges faded 48px across and 32px down (`mapFade`), wider across a pane too narrow for two topics side by side (`fadeAcross`: 82px at 1100x700), so the topics beside the one in view hide in the fade instead of being cut |
| no topics | one line in place of both panes: "Topics appear as you study this course." (Home's map words) |

## The map's surface

The map sits on a surface the pane scrolls (`surfaceOf`), sized so `TopicMap` fits it whole at the scale it opens at and never moves its own camera:

- It opens as every course map does (`framedCamera`, topic-map.md): the whole course when it fits at 80% or more, else framed on where he is ("You are here", the map's current topic), else the first topic the header's button takes up that is on the map, else the list's first row (`aimOf`), with the topics it leads to whole and as few topics cut as it can, at full size or down to 80% (Probability at Edo's 1512x982: 80% on Random variables, with Binomial, Expectation, Poisson and Variance whole and nothing cut; round 3 found it aimed at the header's review and "You are here" off the pane). The pane scrolls to that view (`scrollOfCamera`) and returns there when the window grows or shrinks.
- On an axis the course fits at that scale, the surface is the pane's width (the course in its middle), or the course's height from the pane's top; on one it overflows, the course, its room and one topic and gap of empty room on each side (`slackOf`), so the pane can always scroll a topic at the course's edge wholly out of view.
- A topic he points at or reaches comes into view (`scrollOn`) clear of the fade, cutting as few other topics at the pane's edges as it can (a topic cut where it shows reads as overflow), moving as little as it can.
- Wheel and trackpad scroll the pane; a drag on the background scrolls it too; a pinch stays the map's (its zoom is fixed at the surface's scale).

## Pointing

| He does | The page answers |
|---|---|
| points at or focuses a row | its card glows at once (the map's `marked`: a ring and a soft glow in the accent that blooms in and settles, held while he points), and the map lights that topic with its whole prerequisite chain, the other topics at 50% (the map's `highlight`); once he rests on it for 120ms, when the topic is not already clear of the fade, the pane glides it into view in 200ms (at once under reduced motion) |
| points at or focuses a node | the map lights its chain itself; the topic's row holds the hover fill (`highlighted`) and comes into view in the list if it is out of it, moving the pane as little as it can |
| clicks either | the topic's page opens |
| leaves a pane | only that pane's pointing clears; the map stays where it is |

## Keyboard

Tab is dead app-wide (owner, 17 Sep 2026), so the page walks with arrows, as the sidebar and the map do.

- The walk's stops are each group's header and the rows of the open groups; a folded group's rows are skipped (`walkStops`).
- With nothing focused, Down or Home steps onto the first stop, Up or End onto the last.
- Anywhere in the list: Up and Down step, Home and End jump, Escape leaves the walk. Up on the first stop steps onto the head's button; Down from the button steps back onto the first stop, and Escape leaves it.
- On a header: Enter or Space opens or folds the group, Right opens it, Left folds it.
- On a row: Enter or Space opens it, Right steps onto its topic on the map.
- On the map: its own walk (Up to a prerequisite, Down to a topic that needs it, Left and Right along the layer), the pane bringing each topic it reaches into view; Escape hands the walk back to that topic's row, opening its group when it is folded.
- Every row and the header's button have the shared 2px focus ring. A map node's ring is the map's (topic-node.tsx).

## States

The shared frame's (course-page.md): loading shows the header's skeleton, and the engine not answering, a failed or unreadable read and an unknown course each give one plain sentence. No exam leaves it out of the facts line; everything learned puts the topics under On your own with the day each comes back (a topic a session waits on stays at the top of Needs you); a long course or topic title truncates on one line.

## Sources

The course page research's `split` direction and targets (13 Nov 2026) and its review (S1 to S12); the split home's pane arrangement (`../../study-home/split/split-home.md`: a primary pane whose selection drives the secondary, Apple HIG split views); the lit prerequisite chain of dbt and GitLab (topic-map.md); T3 Code's sidebar for a pane with no visible scrollbar; Home's hybrid rows for a row-end fact as an icon and a few words.
