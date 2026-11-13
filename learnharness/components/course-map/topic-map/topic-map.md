# Topic map

One course as a map on a study home: its topics in layers, prerequisites above the topics that need them, each topic saying where he stands and whether it needs him, and opening its page. Every study home draws it (`home-map.tsx`, the split pane and the map-first card): Edo picked it over the old drawing and its popover on 13 Nov 2026, so it has no switch. The old drawing lives on only as the Proposed `/knowledge` page while Home is Current (`../course-map.md`). `topic-map.tsx` (`data-slot` `course-map-graph`), `topic-node.tsx` (`course-map-node`, `course-map-current-tag`, `topic-need`), `topic-glyph.tsx` (`topic-glyph`), `need-edge.tsx` (`course-map-need`), `topic-map-layout.ts` (geometry, camera, keyboard walk) and `topic-standing.ts` (what a node says). Data: the engine's `CourseMap` (`src/core/contracts/course-map.ts`).

Every word and mark on a node must pass one test: would he understand it at a glance after several days away, without remembering the system's internals, and does it help him see where he stands or what to study? Engine level names (assisted, retained), "due" on its own, "weak" and counts of reviews fail it.

## Renderer and layout

| Part | Notes |
|---|---|
| renderer | React Flow (`@xyflow/react` 12, MIT): nodes are the app's own components, the camera pans, zooms and is bounded, and there is no scrollbar to hide. Read-only: nothing drags, connects, selects or deletes. Its stylesheet is `@xyflow/react/dist/base.css`, imported in `app/layout.tsx`; no `colorMode`, since a `dark` class on its wrapper would restate the old theme's tokens inside the map |
| layout | d3-dag 1.3.0, Sugiyama: simplex layering, optimal decrossing up to 25 topics and two-layer above, simplex coordinates. It tied ELK on crossings on the seeded courses and is a tenth of its weight; dagre crossed more (`research/packages.md`, the bake-off) |
| attribution | hidden (`proOptions.hideAttribution`). The MIT licence does not ask for the badge; the maintainers ask organisations that hide it to subscribe to React Flow Pro. Edo decides before this ships to anyone else |
| node | 224×64, radius 12, padding 0 12; 24 between topics in a layer, 56 between layers |
| room | 48 across and 32 down around the drawing unless the frame gives its own (`margin`: Home's fade, 64 and 40), plus 20 above and below for the current topic's tag. The camera never looks past it |

## Node

| Part | Notes |
|---|---|
| pie | 16px, the geometry of Today's course pie (`progress-pie.tsx`), left of the title on its first line: a dashed empty ring for a topic not started; a quarter, a half, three quarters as the engine's level rises through introduced, attempted and assisted; full once he can do it on his own (independent, retained, transferred). A full pie is exactly a topic the course pie counts, so the map and the pie agree by eye. A weak topic's pie wears the warning ink, and one he could do on his own draws three quarters, as the course pie leaves it out |
| title | 13/18 at 500, up to two lines; muted ink for a topic not started |
| line | 11/14 muted, only when the topic needs him, led by a 12px icon (Today's and the sidebar's: circle-x for a slip, history for a review). A weak topic gives the first of: "Missed last time" (he had it and then missed), "A mistake to fix" (the engine diagnosed one; its sentence is on the topic's page), "Mixed up with Cramer's rule" (he chose that method in its place), "Sure, but wrong", "Worth another look". Else a topic he can do on his own whose review is due: "Review due today", "Review overdue by 3 days", "by a week", "by 2 weeks". A topic still being learned says nothing about its review, since nearly every one is due (the sidebar's rule) |
| surface | started: `card` on the page with a 1px `border`. Not started: no fill, a 1px white 6% border. Hover: border white 20% |
| current | 1px `ring` border and a 3px `ring` halo at 16%, the only blue on the map, with "You are here" (11/14 at 500) 20px above the node's left edge |
| need | a 1px white 33% line (3:1 on the page, WCAG 1.4.11) from the prerequisite's bottom centre to the topic's top centre: one S-curve between layers that leaves and arrives vertically, and straight down between a layer's topics where it skips that layer, so it never crosses a topic. No arrowheads: down is the direction |

Not on a node: the open task (on the topic's page), "Needs" (the lines say it, and a screen reader hears it as the node's description), "Contrasts with" (said only when he mixed the two up) and the engine's stale flag.

## Behaviour

- A click, or Enter on the focused node, opens the topic's page (`/unit/<course>/<topic>`, `unit-inbox.md`). No popover and no double-click. A drag that starts on a node pans and opens nothing.
- The map opens on the whole course, centred, when it fits the frame at 75% or more (below that the titles drop under 10px); else at full size with the current topic at the frame's centre, as near as the drawing's edges allow. It returns to that view whenever the frame grows or shrinks, so enlarging the map on Home shows the whole course when the window has room.
- Drag or scroll pans; a pinch (or Ctrl and scroll) zooms between the whole course (40% at the least) and full size.
- Hover or focus lights a topic with its whole prerequisite chain: their lines rise to white 70% and everything else drops to 35% (120ms).
- Keyboard: one tab stop, the current topic. Up goes to the nearest prerequisite, Down to the nearest topic that needs it, Left and Right along the layer; a topic reached out of view is brought into it (200ms). The drawing is a `figure` whose caption names the course, its topic count and where he is; each node is a link named by its title, "You are here", its standing in words and its line, and described by its prerequisites.
- Motion: the map fades in once its camera is placed (180ms), nodes rise 4px over 180ms, 15ms later per layer and at most 110ms. Under reduced motion nothing animates and the camera moves at once.

## Sources

`research/packages.md` (renderer and layout, with the layout bake-off's numbers) and `research/node-design.md` (what one node says) in the pass's scratchpad, 13 Nov 2026. Glyph and name with no status caption: GitHub Actions, GitLab pipelines, dbt lineage. A ladder of fills: Harvey balls, Things' project pie. Never colour alone: WCAG 1.4.1, Carbon's status indicators. A click opens the page: Obsidian, GitHub Actions, roadmap.sh. The lit chain: dbt, GitLab. Direction by position, few crossings, short edges: Gansner, Koutsofios, North and Vo, "A technique for drawing directed graphs".
