# Split home

The `split` option of Home's switch: today's lessons on the left, the map of the picked lesson's course beside them. Thesis: the list is the page, and the map explains whichever lesson is picked. `split-home.tsx`; `data-slot` `study-home` (page), `lesson-list`, `lesson-row` (`data-picked`), `lesson-open`, `split-map`, `home-map-enlarge`, `home-map-frame`. Lessons and the page frame: lessons.md.

## What shows, and why

| Element | Shows | Why it earns its place |
|---|---|---|
| Title | "Today" and the study day, top left | the page's anchor; reading starts there (Apple HIG layout: the most important content top-leading) |
| Lessons | one per course, in Today's order (lessons.md) | what he acts on leads, and holds the leading 5/12 of the width |
| The picked lesson | the first one at rest; a selected fill and the page's only primary button | one decision at session start; another lesson is one press away |
| Map pane | the picked lesson's course map, its camera on "You are here", with no frame and no header line | the map answers "where does this lesson sit" for the lesson he is looking at (Apple HIG split views: selecting in the primary pane shows its content in the secondary) |

## What is cut, and why

| Cut | Why |
|---|---|
| Course tabs | picking a lesson picks its course, so the page has one selection instead of two |
| The place column with its marks | the place is words on the course line ("Topic 13 of 16"), and the map beside the list draws the rest |
| The map's two thirds of the window | the map is context: 7/12 of the width beside the list, never above it |

## Anatomy

| Part | Notes |
|---|---|
| column | 1152px at most, 32px sides, 52px above, 24px below; 20px between the title and the body; the page never scrolls |
| body | two columns 5fr and 7fr, 32px apart, 672px tall at most so a large window is not filled |
| list | rows 2px apart; past the pane's height the list scrolls inside itself |
| row | radius 12, padding 12, hover `fill-hover`; `LessonText`; 96px kept free at the end for the button, picked or not, so nothing reflows when the pick moves. Pressing a row picks it |
| picked row | `fill-selected`; the primary button (32px, "Open", "Review", "Continue" or "Start") at its end, centred |
| map pane | no border and no header line (Edo, 12 Nov 2026: the outline and "You are at …" said nothing the map doesn't); the course's map (`CourseMapDrawing`, home-map.md) as it is, edges faded 32px across and 24px down, a short drawing at the pane's middle; the quiet 32px Enlarge control at its top right, over the map |
| a lesson with no course | the pane says "This lesson has no course, so it has no map." |
| enlarged | `HomeMap` enlarged takes the page (home-map.md): tabs and Esc back, nothing more; its tabs move the pick |

## Scenarios checked (seeded demo, 12 Nov 2026)

| Scenario | Result |
|---|---|
| A turn waiting | Eigenvalues and eigenvectors is picked with Open; Linear Algebra's map beside it |
| Reviews due, no turn | Probability's review leads with Review; its map beside it |
| Nothing due | "Continue Bayes' rule", Topic 3 of 11 |
| Pick the second lesson | its course's map and the button move to it; the title and the list stay still |
| Five and six courses | every lesson shows at 1280×800; more would scroll inside the list |
| One course, no courses, loading, engine unavailable | the frame's states (lessons.md) |
| 1280×800, 1218×856 with the sidebar closed, 1440×900, 1728×1000 | no page scroll; nothing past the window's edge |

## Sources

Apple HIG split views (a primary pane whose selection drives the secondary; one third to one half for the primary), layout (top-leading importance, never the bottom of a window) and lists; Matuschak on Math Academy (a task queue needs its link to the course's structure); Nielsen Norman Group on the F-pattern; T3 Code's wide lane (72rem); Primer's page layout widths.
