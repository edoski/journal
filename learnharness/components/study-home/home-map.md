# HomeMap

The selected course's map on Home. `home-map.tsx`, `data-slot` `home-map` (`data-enlarged` while enlarged), tabs `home-map-tabs`, control `home-map-enlarge`, frame `home-map-frame`. It embeds the course's map through `CourseMapDrawing` (`components/course-map/course-map-drawing.tsx`): the topic map (`components/course-map/topic-map/topic-map.md`) while the Map switch is on Proposed, else `CourseMapGraph` as it is (course-map.md). Rendering, hover, what a click opens and the keyboard are the map's own.

| Part | Notes |
|---|---|
| tabs | shadcn `Tabs`, its `line` variant (tabs.md): plain course names with the chosen one underlined, no track or pill (Edo, 12 Nov 2026: the pill track looked bolted on), one tab per course in Today's order; opens on Today's first line's course; a pick lasts the visit |
| enlarge | quiet 32px icon button at the top right (Maximize 2, Minimize 2 while enlarged), its icon on the column's edge; tooltip "Enlarge map", "Back to Home (Esc)" |
| frame | fills what Today leaves; the edges fade on every side, 64px across and 40px down, as a mask (a vignette); no scrollbars, the map still scrolls and drags inside |
| camera | the current topic ("You are here") at the frame's centre, and again whenever the frame grows or shrinks; the topic map shows the whole course instead when it fits the frame (topic-map.md) |
| enlarged | the tabs and the map take Home's full width and height; Today hides. Esc (unless the old map's popover takes it) or the same control returns |
| empty | "Topics appear as you study this course." |

Not on Home, enlarged or not: the Map page's List view, Import notes… and Statements… (Edo, 12 Nov 2026: he would never use them, and the engine should grow from his studying with nothing for him to manage). They stay on `/knowledge` only while Home is Current, and shipping Home deletes them with that page.

## Overview switch

Edo, 13 Nov 2026: Home felt disjointed, its map showing one course behind tabs and always opening on Linear Algebra rather than giving an overview. Of three sketched answers (small multiples, course tiles, the map following Today) he chose to try the map following Today, then asked to keep the tabs, with the tab moving smoothly to the course of the line he points at. `useOverviewVariant` in `design-variant.ts`, group `overview`, requires Home's Proposed.

| Option | What the map does |
|---|---|
| `current` | the tabs pick the course; it opens on Today's first course |
| `follow` | the tabs follow Today: pointing at a line (hover after a 150ms rest, so crossing lines on the way to the map does not flip it; focus at once) moves the tab to that line's course and lights that line's topics, the rest dimmed (TopicMap's `highlight`). At rest it follows Today's first line with a course. A tab pressed by hand holds until he points at a line again. The followed line keeps a quiet `fill-hover`, so the tie reads both ways |

Both options:
- Every course's map stays drawn, one per course stacked in the frame, and the chosen one shows (200ms crossfade). A change of course never draws a map afresh, so its nodes do not replay their entrance (Edo saw that as a glitch).
- The tabs' underline is one bar that slides to the chosen tab (200ms), in place of each tab's own underline fading.
- Up and Down walk Today's lines from anywhere on Home that is not a field, the map or the sidebar (Tab is off app-wide by his ruling); from nothing focused, Down takes the first line and Up the last. Enter opens the line.

`followedRow` and `pointProps` (`agenda-rows/row-facts.ts`) are the pure parts, tested in `tests/home-follow.test.ts`.
