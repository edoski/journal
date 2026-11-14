# Linked columns

One layout for the two pages that put a list beside a map: the course page (its topics beside the course map, `../course-page/split/split-course.md`) and the topic page (its history beside the lesson's step map, `../unit-inbox/topic-page/hybrid/hybrid.md`). `linked-columns.tsx` (`LinkedColumns`, `LINKED_GRID`, `useTieAnchor`), `tie-route.ts` (the line's route, pure: `routeTie`, `detourTie`, `clearShift`). The path carries `data-clear` and `data-around`. Tests: `tests/linked-columns.test.tsx`.

Edo, 13 Nov 2026: "i hate on both the card outline bg in overall container, and the connected version i like it but it needs to be polished like the connection UI looks broken". So: no frame, no fills, and Connected as the tie, drawn properly. Split (one outlined surface with a hairline) and its panes code are deleted.

## Layout

| Part | Notes |
|---|---|
| grid | the list up to 24rem, the map the rest, 24px apart, both the full height under the page's head (`grid-cols-[minmax(0,24rem)_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] gap-6`). The root keeps the page's slot: `course-split` on the course page, `topic-panes` on the topic page |
| columns | a flex column each; the list and the map fill them. No outline, no surface, no fill: the left column takes plain rows (a row's own hover and selection fills stay the row's) |

## The connector

Drawn while a row is tied to a node (`tie`: a selector for each end, and a key) and the Link switch is on (`connected`). The topic page ties the lesson on the map's row to the step it stopped on, always; the course page ties the topic he points at or focuses, in either column, to its card.

| Rule | How |
|---|---|
| leaves the row's vertical centre | the curve starts at the row's right edge (the row's 12px bleed puts it in the gutter's middle), at its middle, heading right |
| one smooth curve to the node's near edge | one cubic, arriving square to the edge it meets: the left edge's middle (an S across the gutter), or, where a neighbour sits between, the top edge from above or the bottom edge from below, a quarter or a third in from a corner (never at the corner itself), clear of the middle where the map's own lines meet the node |
| never along a column edge | while it is in the gutter, or within 16px of the list or 32px of the map past it, it climbs or falls 12px at most (`GUTTER_RUN`) |
| never across another node | it keeps 6px from every other node in view and from the map's tags ("You are here", "Left off here", "Next"), and never passes through its own node before it arrives. Of every curve that keeps the rules, the shortest wins, the left edge unless the top or bottom is 48px shorter (`routeTie`) |
| the map makes room | when no curve keeps the rules where the node sits, the map moves the node beside the row: the least move up or down that gives one (`tieShifts`, `clearShift`): level with the row, or with the row in the channel just above or below it. The topic page's lesson map opens there (the plan above may then sit past the frame's top, a pan away); the course page's map pane glides there as it brings a pointed topic into view, its surface keeping the pane's height of room above and below while the switch is on (`besideRow`). Where the map cannot move far enough (the topic page keeps the lesson in view), the line goes around |
| around | when no one curve keeps the rules where the node sits, the line goes around the node in its way (`detourTie`): out of the row as before, across the gutter, into a vertical lane 16px left of that node, along it, and out into the node's left edge, square to it; two cubics that meet in the lane, tangent to it, so it reads as one stroke. Its turn into the lane comes only past the gutter, so it never runs down the gutter; it keeps 6px from every node, as the curve does. The Eigenvalues lesson's step, under a sibling step that overhangs it, is reached this way (Edo, 14 Nov 2026: route around the card rather than end at its edge, which would read as tied to the wrong card). Moving the map is still tried first (`clearShift` takes only one clear curve). A route that still breaks a rule is drawn under the map's nodes, which paint over it |
| ink | the map's own edge ink and weight: 1px `white/33`; `white/70` while either end is pointed at or focused, as a lit prerequisite line |
| follows | every pan, zoom, scroll and resize, in the same frame: React Flow's restyled viewport, a selected row and a resize are observed and the line is redrawn straight into the DOM, outside React; a burst redraws once more on the next frame. It leaves while the row's middle or the node is out of its column's view |
| draws in | once per new pair, 180ms from the row to the node (`lh-tie-draw`, a dash run out along the path); none under reduced motion |
| two-way hover | pointing at or focusing either end sets `data-lit` on the columns: the line lights, the topic page's row gets an inset ring and its step a stronger glow (`in-data-[lit]:`); the course page's row holds its hover fill and the map lights the chain, as before |

Measured 14 Nov 2026 at 1512×982: every row of the four seeded courses (56) gets a clear route; the Eigenvalues topic page's Now row reaches its step in one S into its left edge. Across a wheel pan of the lesson map, the line's end sat on the step's edge in 83 of 86 frames (3.4px at most in the rest); across the course pane's glide and a scroll of the list, in every frame.

## The Link switch

`link` in `../design-variant.ts`: Current (the two columns, no line) and Connected, which anyone who has not picked sees, and production draws. Both pages use the layout either way; the switch only chooses whether the line is drawn.

## Sources

Edo's spec (13 Nov 2026) and its correction. Bézier connectors that leave and arrive square to their ends: Figma's prototype connections, Apple's Xcode storyboard segues; edges never crossing a node: Gansner, Koutsofios, North and Vo; clipping a segment against a box: Liang–Barsky.
