# Map-first home

The `map` option of Home's switch: the course map near the top with the course tabs, then today's lessons. Thesis: keep the map as the page's picture, but bound it, frame it and tie it to the lessons. `map-first-home.tsx`; `data-slot` `study-home` (page), `home-map` (the card), `home-map-tabs`, `home-map-enlarge`, `home-map-frame`, `lesson-list`, `lesson-row` (`data-picked`), `lesson-open`. Lessons and the page frame: lessons.md.

## What shows, and why

| Element | Shows | Why it earns its place |
|---|---|---|
| Title | "Today" and the study day, top left | the page's anchor, which the agenda home lacked |
| Map card | one card: the course tabs, "You are at <topic>", the Enlarge control, and the picked course's map with its camera on "You are here" | tabs, map and control read as one instrument instead of three loose parts; a chart gets a one-line summary (Apple HIG charts) |
| Lessons | one per course, in Today's order (lessons.md) | the same lessons as the other homes, as list rows instead of table columns |
| The picked course's lesson | a selected fill and the page's only primary button | the tabs are the page's one selection: map and marked lesson move together |

## What is cut, and why

| Cut | Why |
|---|---|
| The map's two thirds of the window | the card is 416px tall at most and gives way first when lessons need room |
| The place column with its marks, "Steps 2–3 of 5" | the place is words on the course line |
| "Your turn" in the accent colour | "Waiting for your reply" as the lesson's detail; the button stays the only blue |

## Anatomy

| Part | Notes |
|---|---|
| column | 960px, 32px sides, 52px above, 24px below; 20px between title, card and lessons; the page never scrolls |
| card | 1px `border`, radius 12, as wide as a lesson row's fill (12px past the text edge on each side); between 224 and 416px tall |
| card line | 48px: shadcn `Tabs` (tabs.md), one tab per course in Today's order, opening on the first lesson's course; at the end "You are at <topic>" 12 muted (it truncates before the tabs do) and the quiet 32px Enlarge control |
| map | the course's map (`CourseMapDrawing`, home-map.md) as it is, edges faded 48px across and 24px down, a short drawing at the card's middle |
| lessons | rows 2px apart, radius 12, padding 10 12, hover `fill-hover`; `LessonText`; the whole row opens the lesson. Past the room left, the list scrolls inside itself |
| picked row | the lesson of the tab's course: `fill-selected` and the primary button's look at its end (part of the row, not a second control) |
| enlarged | `HomeMap` enlarged takes the page (home-map.md) |

## Scenarios checked (seeded demo, 12 Nov 2026)

| Scenario | Result |
|---|---|
| A turn waiting | Linear Algebra's map; its waiting session marked with Open |
| Second course tab | Probability's map, its review marked with Review; the title and the list stay still |
| Six courses at 1280×800 | six tabs and six lessons; the card at its 224px floor |
| One course, no courses, loading, engine unavailable | the frame's states (lessons.md) |
| 1280×800, 1218×856 with the sidebar closed, 1440×900, 1728×1000 | no page scroll; nothing past the window's edge |

## Trade-off

The action still sits under the map. Apple's macOS guidance argues for the other order ("avoid placing controls or critical information at the bottom of a window"), which is the split home's case.

## Sources

Apple HIG charts (summarise a chart in a sentence), layout and progressive disclosure; Nielsen Norman Group on dashboards (glanceable, not exploratory) and visual hierarchy (three sizes, two big things at most); shadcn `tabs.tsx`.
