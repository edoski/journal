# HomeMap

The selected course's map on Home. `home-map.tsx`, `data-slot` `home-map` (`data-enlarged` while enlarged), tabs `home-map-tabs`, control `home-map-enlarge`, frame `home-map-frame`. It embeds the course's topic map (`components/course-map/topic-map/topic-map.md`) as it is, with room around it as deep as the fade (`margin`), so a topic at the edge scrolls clear of it; Edo picked the topic map over the old drawing and its popover on 13 Nov 2026. Rendering, hover, what a click opens and the keyboard are the map's own.

| Part | Notes |
|---|---|
| tabs | shadcn `Tabs`, its `line` variant (tabs.md): plain course names with the chosen one underlined, no track or pill (Edo, 12 Nov 2026: the pill track looked bolted on), one tab per course in Today's order; opens on Today's first line's course; a pick lasts the visit |
| enlarge | quiet 32px icon button at the top right (Maximize 2, Minimize 2 while enlarged), its icon on the column's edge; tooltip "Enlarge map", "Back to Home (Esc)" |
| frame | fills what Today leaves; the edges fade on every side, 64px across and 40px down, as a mask (a vignette); no scrollbars, the map still scrolls and drags inside |
| camera | the current topic ("You are here") at the frame's centre, and again whenever the frame grows or shrinks; the topic map shows the whole course instead when it fits the frame (topic-map.md) |
| enlarged | the tabs and the map take Home's full width and height; Today hides. Esc or the same control returns |
| empty | "Topics appear as you study this course." |

Nowhere in the Proposed design: the old Map page's List view, Import notes… and Statements… (Edo, 12 Nov 2026: he would never use them, and the engine should grow from his studying with nothing for him to manage). They went with that page on 13 Nov 2026.

## The map follows Today

Edo, 13 Nov 2026: Home felt disjointed, its map showing one course behind tabs and always opening on Linear Algebra rather than giving an overview. Of three sketched answers (small multiples, course tiles, the map following Today) he chose the map following Today, then asked to keep the tabs, with the tab moving smoothly to the course of the line he points at; he kept it over tabs alone, deleted with the Overview switch.

- The tabs follow Today: pointing at a line (hover after a 150ms rest, so crossing lines on the way to the map does not flip it; focus at once) moves the tab to that line's course and lights that line's topics, the rest dimmed (TopicMap's `highlight`). At rest it follows Today's first line with a course. A tab pressed by hand holds until he points at a line again. The followed line keeps a quiet `fill-hover`, so the tie reads both ways.
- Every course's map stays drawn, one per course stacked in the frame, and the chosen one shows (200ms crossfade). A change of course never draws a map afresh, so its nodes do not replay their entrance (Edo saw that as a glitch).
- The tabs' underline is one bar that slides to the chosen tab (200ms), in place of each tab's own underline fading.
- The page's arrows (`components/spatial-arrows.ts`) walk Today's lines by where they sit; a line the arrows reach takes focus, so the map follows it at once. Enter opens the line.

`followedRow` and `pointProps` (`agenda-rows/row-facts.ts`) are the pure parts, tested in `tests/home-follow.test.ts`.
