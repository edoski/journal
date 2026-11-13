# Map course page

The course page candidate `map` (../course-page.md): the whole course in one picture. Under the shared header, one line of the page's groups, each its map mark and its count, which lights those topics, then the topic map (../../course-map/topic-map/topic-map.md) given the rest of the window. `map-course.tsx`.

Closest of the candidates to the separate Map page Edo turned down on 12 Nov 2026, and the same picture as Home's enlarged map: he judges it beside the others. If he picks it, Home's enlarge should open this page.

## Anatomy, top to bottom

| Part | Slot | Notes |
|---|---|---|
| header | `course-header` | shared (../course-header.md), 32px sides, 20 from the band |
| legend | `course-legend` | 8 below the header; 28px (course-legend.md) |
| map | `course-map-pane` | 4 below the legend, to the window's foot; `data-plan` names how it is laid in. It keeps inside the page's column when the whole course fits there, and runs to the window's sides only when that shows more |
| scroll area | `course-map-scroller` | inside the pane; no bar; `data-more-above`, `-below`, `-left`, `-right` name the edges with more past them, and only those fade, 32px in |
| column | `course-map-column` | one per run of a wrapped path, else one |
| link | `course-map-path-link` | the need from a column's foot to the next column's head (`path-link.tsx`) |
| note | `course-map-note` | a few words under a lit topic (`topic-note.tsx`) |
| no topics | `course-map-empty` | in place of the legend and map, 8 below the header: "No topics yet. They appear as you study this course." 13/18 muted |

## How the map is laid in (`map-plan.ts`, `mapPlan`)

Every title stays at the app's 11px floor (`--text-caption`): the map is never drawn smaller than 11/13 of full size, unlike the topic map's own whole-course view, which goes down to 75%.

| Plan | When | What he sees |
|---|---|---|
| `whole` | the course fits at 11/13 or more | every topic, at the largest size that fits, up to full size; centred across, from the top; nothing scrolls |
| `scroll` | it does not | the course at the width's size, the area scrolling down, when its width fits; else at the floor, scrolling both ways. The wheel and trackpad scroll the area (React Flow's `nowheel`) |

A course that is one path (each layer of its drawing one topic: Calculus I's 24 topics, or a course with no prerequisites) may also wrap into columns, read top to bottom, then left to right. Of the ways that show every topic, the largest wins, at a tie the fewest columns; failing that, the one that fits the width with the least to scroll. Each column is the topic map of its run of the path (`columnMap`), and one link joins each column's last topic to the next column's first: down from the foot into the room below the columns, across to the gap, up the gap, across and down into the head, with 6px turns (`pathLinks`). Wrapped columns keep 12 above them and 24 below (`WRAP_ROOM`) for the links and the window's foot.

Where every card sits is computed, not read from the page (`topicBoxes`, the topic map's own opening view), so the area can open on a topic before the maps have drawn.

| Window | Linear Algebra | Calculus I | Probability | Real Analysis |
|---|---|---|---|---|
| 1440x900 | whole, 85% | whole, four columns of six | whole, 85%, into the sides | whole, 100% |
| 1100x700 | scroll both ways, 85% | scroll down, three columns of eight, 100% | scroll across, 85% | whole, 100% |

## Where the area opens and what it brings into view

- It opens on the header's topic (the first the header's lesson works on: Chain rule in Calculus I), so what the button takes up shows; a resize keeps it in view.
- A legend fact lit for 150ms (pointed, reached by keyboard or pressed) scrolls the area so its topics show: centred when they fit together, else the group's most pressing topic first (`scrollToShow`). Nothing moves when they already show.
- A topic the keyboard reaches scrolls into view, 32 off the edge.

## Behaviour

- Pointing at a legend fact, or reaching it by keyboard, lights its topics and dims the rest (the map's `highlight`); pressing it keeps them lit; pressing it again or Esc, from anywhere on the page, lets go of everything it lit (`legendLight`).
- While a group is lit, a note under each of its topics says what the row would and the node does not: "Back Fri 13 Nov" for a topic on his own, where an open task was left ("At part (c)"), "Your turn" for a session that waits (accent). Caption type, 12px icon, on the page's ground so a need line passes behind it, 4 below the card.
- Across wrapped columns, pointing at or focusing a topic lights its whole chain in every column, the links included.
- A click on a topic opens its page (the topic map's own).
- Keyboard (Tab is dead app-wide, so focus arrives by a click): arrows move along the legend; Down goes to the map's current topic; the map walks its own needs; past a column's foot or head, and Left and Right beside it, the arrows go on to the next column (`acrossColumns`); Up from a topic with nothing above it returns to the legend.

## Limits (the topic map's, not changed here)

- A topic reached by keyboard draws no ring: the shared node's `outline-none` cancels its focus outline (topic-node.tsx; one word to fix there).
- A wrapped column's topic says "Mixed up with …" by the other topic's handle when that topic sits in another column, since a column's map holds only its own topics.
- "You are here" is the engine's current topic, which can differ from the header's next lesson.
- In `scroll` both ways the area does not pan by drag, only by wheel and trackpad.

## Sources

The course page research (`audit/course-page`, the `map` direction, targets 17, 18 and 20, questions 1, 2 and 4); the topic map's spec (node, room, camera, highlight); the split candidate's edge fade (`mask-*-from`); the owner's decisions of 12 and 13 Nov 2026 (no scrollbars, fit the window, a click opens the topic's page, icons with a few literal words).
