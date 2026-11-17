# Split course page

The course page (course-page.md): the list and the map side by side in the app's linked columns (`../../linked-columns/linked-columns.md`), with no line between them (Edo picked Current, 14 Nov 2026). Thesis: the list says what to do, the map says where it sits, and pointing at one shows it in the other. `split-course.tsx` (the page), `split-list.tsx` (left pane), `split-map.tsx` (right pane), `split-tie.ts` (what ties them and where the map opens, pure; tests in `tests/course-page-split.test.tsx`). `data-slot` `course-split` (the linked columns), `course-split-list` and `course-split-list-scroller`, `course-split-map`; the rows, groups and header keep their shared slots.

## Layout

| Part | Notes |
|---|---|
| column | the shared page frame (`../../page-frame/page-frame.md`): centred, up to 80rem, 24px sides, 24px under the 52px band and below; fits the window, never scrolls as a page |
| header | `CourseHead` (../course-head/course-head.md), the frame's head, its press at the far right |
| panes | 20px under the head, filling the rest: the linked columns, the list up to 20rem and the map in the rest (at 1512x982: 320px and 864px), 24px apart, nothing around them |
| list | the groups in their order (Needs you, Learning, Not started, On your own), an empty group left out, 16px apart; each a 28px `CourseGroup` header over 32px `CourseTopicRow`s, each ending in its reason's icon and words flush right (the title truncates first). The groups and the facts are the sidebar's (course-page.md, "The groups"): a topic a session waits on him for is in Needs you because Today takes it up. Each group is a shadcn Collapsible: Needs you and Learning open, Not started and On your own folded to their header with its chevron pointing right (Edo, 14 Nov 2026: what needs him leads); a click on a header opens or folds it, held for the visit only, never stored (`OPEN_AT_FIRST`). No Show more. Linear Algebra fits whole at 1512x982; a longer list scrolls inside its pane (wheel, trackpad) with no bar showing, its bottom edge fading 40px while more is below and its top while more is above |
| arcs | a course with arcs (course-page.md, "Arcs"): What next, then its `CourseArc` lines in place of the groups, where he is open; opening an arc shows it on the map; R6: on the course with the most arcs at 1512x982 every line and the open arc's head show without scrolling, the heaviest arc open too |
| map | in a course with arcs, the course's arcs listed left of the map exactly as on Home (`ArcMap`, topic-map.md, Arcs: the hairline track, the sliding bar, the You are here dot, ⌘J and ⇧↑/⇧↓), Whole course in the pane's top right corner; an arc shown there opens in the list. The map draws the shown arc (`TopicMap`'s `arc`); Whole course shows every topic of the course and always shows. Otherwise Home's `TopicMap` (topic-map.md), unchanged: no outline, no header copy (Edo, 12 Nov 2026), edges faded 48px across and 32px down (`mapFade`) |
| no topics | one line in place of both panes: "Topics appear as you study this course." (Home's map words) |

## The map

The map is Home's map (`TopicMap`, topic-map.md) with Home's camera: the course page adds no camera of its own (Edo, 17 Nov 2026: ⇧↑/⇧↓ jumped here while Home glided, "two diff versions of graph UI"). So it opens, pans, zooms, follows and glides between arcs exactly as Home's does:

- It opens as every course map does (`framedCamera`, topic-map.md): the whole course when it fits at 80% or more, else framed on where he is ("You are here", the map's current topic), else the first topic the header's button takes up that is on the map, else the list's first row (`aimOf`, `TopicMap`'s `opensOn`), with the fewest topics cut (none wherever the course allows), then the topics it leads to whole, at full size or down to 80% (Probability at Edo's 1512x982: 80% on Random variables, with all four topics it leads to whole, Binomial, Poisson, Geometric and Expectation; the 696px pane of a 24rem list cut Poisson; round 3 found it aimed at the header's review and "You are here" off the pane). A drawing shorter than the pane sits at its top, beside the list (`fitsDown`), where Home's sits in its middle. It returns there when the window grows or shrinks.
- A row he points at comes into view through the map's `framed` (Pointing, below).
- Drag, wheel and trackpad pan; a pinch zooms; held still while it fits (topic-map.md, Behaviour).
- ⇧↑, ⇧↓, a press on the arc list, ⌘J and a card's "From" line glide to the arc (topic-map.md, The glide).
- Whole course: in a course with arcs always, else when the course opens on less than all of it (`onOpensWhole`), the pane's top right corner, outside the fade, holds the maps' Whole course control (topic-map.md). Pressed, the map shows every topic (`TopicMap`'s `whole`), gliding out, and the control reads "Back to where you are"; pressed again, or `-`, it glides back to its opening view. Showing another arc leaves it. The choice lasts the visit: leaving the page or opening another course starts from the opening view.

## Pointing

| He does | The page answers |
|---|---|
| points at or focuses a row | its card glows at once (the map's `marked`: a ring and a soft glow in the accent that blooms in and settles, held while he points), and the map lights that topic with its whole prerequisite chain, the other topics at 80% opacity, the lowest that still passes contrast (the map's `highlight`); once he rests on it for 120ms, when the topic is not already clear of the fade, the camera glides it into view in 200ms (at once under reduced motion; the map's `framed`) |
| points at or focuses a node | the map lights its chain itself; the topic's row holds the hover fill (`highlighted`) and comes into view in the list if it is out of it, moving the pane as little as it can |
| clicks either | the topic's page opens |
| leaves a pane | only that pane's pointing clears. Once he points at nothing in either pane for 400ms, a map a row moved glides back to its opening view in 200ms (at once under reduced motion), so "You are here" is never left cut; 400ms outlasts the pointer crossing from one row to the next, so a sweep down the list never sends it home and back. A map he panned or zoomed himself, or walked with the keys, stays where he left it until the next row he points at |

## Keyboard

Tab is dead app-wide (owner, 17 Sep 2026), so the page walks with arrows, as the sidebar and the map do.

- The walk's stops are each group's header and the rows of the open groups; a folded group's rows are skipped (`walkStops`).
- With nothing focused, Down or Home steps onto the first stop, Up or End onto the last.
- Anywhere in the list: Up and Down step, Home and End jump, Escape leaves the walk. Up on the first stop steps onto the head's button; Down from the button steps back onto the first stop, and Escape leaves it.
- On a header: Enter or Space opens or folds the group, Right opens it, Left folds it.
- On a row: Enter or Space opens it, Right steps onto its topic on the map.
- On the map: its own walk (Up to a prerequisite, Down to a topic that needs it, Left and Right along the layer), the camera bringing each topic it reaches into view; Escape hands the walk back to that topic's row, opening its group when it is folded.
- Every row and the header's button have the shared 2px focus ring. A map node's ring is the map's (canvas/canvas-node.tsx).

## States

The shared frame's (course-page.md): loading shows the header's skeleton, and the engine not answering, a failed or unreadable read and an unknown course each give one plain sentence. No exam leaves it out of the facts line; everything learned puts the topics under On your own with the day each comes back; a long course or topic title truncates on one line.

## Sources

The course page research's `split` direction and targets (13 Nov 2026) and its review (S1 to S12); the split home's pane arrangement (`../../study-home/split/split-home.md`: a primary pane whose selection drives the secondary, Apple HIG split views); the lit prerequisite chain of dbt and GitLab (topic-map.md); T3 Code's sidebar for a pane with no visible scrollbar; Home's hybrid rows for a row-end fact as an icon and a few words.
