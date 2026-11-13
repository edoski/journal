# Split course page

The `split` option of the Course switch (course-page.md): the list and the map side by side, tied together. Thesis: the list says what to do, the map says where it sits, and pointing at one shows it in the other. `split-course.tsx` (the page), `split-list.tsx` (left pane), `split-map.tsx` (right pane), `split-tie.ts` (what ties them and where the map scrolls, pure; tests in `tests/course-page-split.test.tsx`). `data-slot` `course-split` (the two panes), `course-split-list` and `course-split-list-scroller`, `course-split-map` and `course-split-map-scroller`; the rows, groups and header keep their shared slots.

## Layout

| Part | Notes |
|---|---|
| column | the page's full width less 32px sides, 20px under the 52px band, 24px below; fits the window, never scrolls as a page |
| header | the shared `CourseHeader` (course-header.md), full width, its button at the far right |
| panes | 24px under the header, filling the rest; a grid of the list (400px at 1440 wide, 320px at the least, 36% between) and the map in the rest, 24px apart. At 1440x900 the list is 400x692 and the map 696x692; at 1100x700, 320x492 and 436x492 |
| list | the groups in their order (Needs you, Learning, Not started, On your own), an empty group left out, 16px apart; each a 28px `CourseGroup` header over 32px `CourseTopicRow`s, each ending in its reason's icon and words flush right (the title truncates first). A topic a session waits on him for ("Your turn") sits at the top of Needs you, never under Learning, so Learning holds only topics he is learning. Every topic shows, none folded and no Show more, so each node on the map has its row. Linear Algebra fits whole at 1440x900; a longer list scrolls inside its pane (wheel, trackpad) with no bar showing, its bottom edge fading 40px while more is below and its top while more is above |
| map | the shared `TopicMap` (topic-map.md), unchanged: no outline, no header copy (Edo, 12 Nov 2026), edges faded 48px across and 32px down (`mapFade`), wider across a pane too narrow for two topics side by side (`fadeAcross`: 82px at 1100x700), so the topics beside the one in view hide in the fade instead of being cut |
| no topics | one line in place of both panes: "Topics appear as you study this course." (Home's map words) |

## The map's surface

The map sits on a surface the pane scrolls (`surfaceOf`), sized so `TopicMap` fits it whole and never moves its own camera:

- A course that fits the pane whole at the map's own floor for a whole course (75%) or more draws whole, from the pane's top, with nothing to scroll (Real Analysis at 1440x900, 83%).
- Any other course draws at 100%. On an axis it overflows, the surface is the course, its room, and one topic and gap of empty room on each side (`slackOf`), so the pane can always scroll a topic at the course's edge wholly out of view. On an axis it fits, the course sits in the pane's middle across, or from its top down.
- Wherever the pane scrolls to (`scrollOn`), it keeps the topic it shows clear of the fade, then cuts as few other topics at its edges as it can (a topic cut where it shows reads as overflow), then, for the opening view, shows as many whole topics as it can near that topic, or, for a topic he points at, moves as little as it can.
- It opens on the first topic the header's button takes up that is on the map (Calculus I: Chain rule), else the list's first row (`aimOf`), and returns there when the window grows or shrinks.
- Wheel and trackpad scroll the pane; a drag on the background scrolls it too; a pinch stays the map's (its zoom is fixed at the surface's scale).

## The tie

| He does | The page answers |
|---|---|
| rests on or focuses a row (120ms) | the map lights that topic with its whole prerequisite chain, the rest at 35% (the map's `highlight`), and, when the topic is not already clear of the fade, the pane glides it into view in 200ms (at once under reduced motion) |
| points at or focuses a node | the map lights its chain itself; the topic's row holds the hover fill (`highlighted`) and comes into view in the list if it is out of it, moving the pane as little as it can |
| clicks either | the topic's page opens |
| leaves a pane | only that pane's pointing clears; the map stays where it is |

## Keyboard

Tab is dead app-wide (owner, 17 Sep 2026), so the page walks with arrows, as the sidebar and the map do.

- With nothing focused, Down or Home steps onto the first row, Up or End onto the last.
- On a row: Up and Down step, Home and End jump, Enter or Space opens it, Right steps onto its topic on the map, Escape leaves the walk. Up on the first row steps onto the header's button; Down from the button steps back onto the first row, and Escape leaves it.
- On the map: its own walk (Up to a prerequisite, Down to a topic that needs it, Left and Right along the layer), the pane bringing each topic it reaches into view; Escape hands the walk back to that topic's row.
- Every row and the header's button have the shared 2px focus ring. A map node's ring is the map's (topic-node.tsx).

## States

The shared frame's (course-page.md): loading shows the header's skeleton, and the engine not answering, a failed or unreadable read and an unknown course each give one plain sentence. No exam leaves it out of the facts line; everything learned puts the topics under On your own with the day each comes back (a topic a session waits on stays at the top of Needs you); a long course or topic title truncates on one line.

## Sources

The course page research's `split` direction and targets (13 Nov 2026) and its review (S1 to S12); the split home's pane arrangement (`../../study-home/split/split-home.md`: a primary pane whose selection drives the secondary, Apple HIG split views); the lit prerequisite chain of dbt and GitLab (topic-map.md); T3 Code's sidebar for a pane with no visible scrollbar; Home's hybrid rows for a row-end fact as an icon and a few words.
