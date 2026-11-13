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
