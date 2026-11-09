# Course map

The Proposed design's Knowledge page (`/knowledge`): one course's topics and prerequisites as a map, where the learner is in it, and Study this on any topic. `course-map-view.tsx` (`data-slot` `course-map-view`, header `course-map-header`), `course-map-graph.tsx` (`course-map-graph`, `course-map-node`, `course-map-current-tag`, `course-map-contrast`), `course-map-list.tsx` (`course-map-list`, `course-map-row`), `topic-detail.tsx` (`topic-detail`), `course-map-layout.ts` (geometry) and `topic-words.ts` (captions). Data: `GET /api/courses/map?workspace=`, the engine's read-only `map` verb as a `CourseMap` (`src/core/contracts/course-map.ts`). The app computes no standing: every level, review, due and weak word is the engine's.

## Anatomy

| Part | Notes |
|---|---|
| header | 52px. Sidebar toggle; course `Select` (`sm`, 28px, select.md) and the exam countdown (12px muted, as Today says it); at the right Jump to current (quiet, 28px), the Map / List segmented control (toggle-group.md) and a 32px "More" menu (dropdown-menu.md) with Import notes… and Statements… (the old page's notes import and statement browser, `ChainTableOverlay` in browse mode with delete) |
| map | a layered top-to-bottom drawing of the `needs` edges (Sugiyama, d3-dag 1.3.0: simplex layering, optimal decrossing up to 25 topics and two-layer above, simplex coordinates), prerequisites above. 32px around the drawing; centred; scrolls both ways. A drawing up to 25% wider than the view scales down to fit; wider ones scroll sideways |
| node | 192×64, radius 8, padding 0 12. Title 13/18 at 500, up to two lines; caption 11/14 muted: the engine's level word, then `due`, then `weak` ("assisted · due · weak"); `not started` for level `new`. A 14px document glyph top-right when an open task holds the topic |
| current tag | "You are here", 11/14 at 500, 20px above the current node's left edge |
| needs edge | 1px white 16%, a vertical bump curve through the layout's bend points, no arrowheads (down is the direction) |
| contrast | a 1px dashed (3 3) arc in white 40% to each competing method, drawn only while one end is hovered or focused |
| detail | `Popover` (popover.md), 320px, beside the node or under the row: title 13 at 600, caption with "You are here", the review in words ("Review due since Thu 5 Nov (3 days)", "Next review Thu 13 Nov"), one line per weak signal (the gap sentence, lapsed, stale, chosen-instead methods by title, confident errors), Needs and Contrasts with by title, the open task's title and step, primary "Study this" |
| list | the same layers as "Step N" sections (12px muted headings) in a 736px column; rows radius 8, padding 8 12: title 13 at 500, caption 12 muted, "Needs A, B" 12 muted |
| notice | one centred block: "Reading the course…"; the engine-unavailable line with its fix (`CoursesUnavailable`); "No courses yet"; the read failure with Try again; "No map yet" (18 at 600) with "Topics appear as you study this course." and a primary Start a session |

## States

| Node | Treatment |
|---|---|
| not started (`new`) | 1px dashed white 12% on the page, title in muted ink |
| introduced to assisted | white 3% over the page, 1px `border` (white 8%) |
| independent, retained, transferred | white 5% over the page, 1px `input` (white 11%) |
| current | 1px `ring` border and a 3px `ring` halo at 16%: the only blue on the map |
| hover | border white 20% |
| hover or focus on any node | that node, its whole prerequisite chain and its contrasts stay at full opacity, their edges rise to white 40%; everything else drops to 35% (120ms opacity) |
| focus-visible | 2px `ring` outline, 2px out |

Every state is a word, so nothing relies on colour. Fills are opaque mixes, so edges never show through a node.

## Behaviour

- The page opens on the remembered course (the one Today and the composer use); picking another one remembers it.
- The map opens scrolled so the current topic sits at 40% of the view's height; Jump to current does the same, smoothly unless reduced motion is on.
- Keyboard: the map is one tab stop (the current topic). Up goes to the nearest prerequisite, Down to the nearest dependent, Left and Right along the layer; Enter or Space opens the detail, Esc closes it. The list is the screen-reader and keyboard equivalent; the drawing is a `figure` whose caption names the course, its topic count and where the learner is.
- Click opens the detail; double-click is Study this. Study this opens a teaching session in the course with the topic's title as the opening, through the same path and guards as Today (setup when models or keys are missing, the model picker when the model is unavailable); the tutor decides teach or practice.
- Motion: on open, nodes fade in with a 4px rise over 180ms (`lh-card-enter`, ease cubic-bezier(.19,1,.22,1)), 15ms later per layer and at most 110ms, and the edges fade in over 180ms; off under reduced motion. No pulse.
- No counts, percentages or progress bars.

## Sources

`research/design-directions.md` section 3 (layout, anatomy, edges, motion, list view), `research/course-map-data.md` (the `map` verb and `CourseMap`). Sugiyama layered drawing (Wikipedia, d3-dag docs); focus+context on hover (dbt Explorer); "avoid relying solely on color" and reduced repetitive motion (Apple HIG Charts and Accessibility); complex images as a `figure` with an equivalent (W3C WAI images tutorial). Node width 192 rather than the research's 168: at 168 most demo titles truncated to one line, at 192 with two lines every title reads in full.
