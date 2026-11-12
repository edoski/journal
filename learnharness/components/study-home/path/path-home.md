# Path home

The `path` option of Home's switch: today's lessons in one calm column, each drawing its own place in its course's path, with the course map one press away. Thesis: each lesson line carries where it sits, so Home at rest is only what he acts on. `path-home.tsx`, `path-track.tsx`; `data-slot` `study-home` (page), `lesson-list`, `lesson-row` (the first `data-primary`), `lesson-open`, `path-track`, `home-map-open`. Lessons and the page frame: lessons.md.

## What shows, and why

| Element | Shows | Why it earns its place |
|---|---|---|
| Title | "Today" and the study day | the page's anchor |
| Lessons | one per course, in Today's order (lessons.md); the first holds the page's only primary button | the next action leads and nothing competes with it (T3 Code's lane; Things' Today) |
| Path track | under each lesson: one dot per topic of the course in path order, today's in ink, the ones started before in mid grey, the ones ahead faint; then "Topic 13 of 16" | where the lesson sits and how far along the course is, in one quiet figure with no count of reviews (Nielsen Norman Group: steps over percentages) |
| Course map | a quiet button at the title's end | the map lives on Home and opens over it; at rest it draws nothing |

## What is cut, and why

| Cut | Why |
|---|---|
| The map at rest, the course tabs | the track answers "where" for every lesson at once; the full map is for looking around, one press away (progressive disclosure) |
| The place on the course line | the track's own words say it |

## Anatomy

| Part | Notes |
|---|---|
| column | 736px (T3 Code's lane), 32px sides; it starts 12% down the window, at least 52px, and 24px above the foot; 24px between the title row and the lessons |
| title row | 32px: `DayHeading`, and at the end the quiet "Course map" button (32px, 13, the Network icon) |
| row | radius 12, padding 12, hover `fill-hover`, 2px apart; the whole row opens the lesson; `LessonText` without the place, then the track 8px under it |
| track | dots 6px, 4px apart (4px and 2px apart past 40 topics), in a 16px line; `role="img"` named "10 of 16 topics started"; then the place 12 muted, 12px after |
| first row | the primary button's look at its end (32px) |
| map open | `HomeMap` enlarged takes the page (home-map.md), opening on the first lesson's course: tabs and Esc back, nothing more |

## Scenarios checked (seeded demo, 12 Nov 2026)

| Scenario | Result |
|---|---|
| A turn waiting | Eigenvalues and eigenvectors first, with Open; its track lights topic 13 of 16 |
| Reviews due | the review's topics lit across the started part of the track |
| Six courses at 1280×800 | six lessons; more would scroll inside the list |
| Course map | the map takes Home; Esc brings the lessons back |
| One course, no courses, loading, engine unavailable | the frame's states (lessons.md) |
| 1280×800, 1218×856 with the sidebar closed, 1440×900, 1728×1000 | no page scroll; nothing past the window's edge |

## Trade-off

A line of dots flattens the prerequisites into an order, and the map is not visible until asked for. Whether that still counts as "the map lives on Home" is Edo's call.

## Sources

T3 Code's chat lane (46rem) and its one-block empty state; Apple HIG layout (progressive disclosure) and progress indicators (one consistent place); Nielsen Norman Group and Tahanan on steps ("3 of 5"); Execute Program's and Math Academy's one quiet progress figure; iOS page controls for the dots.
