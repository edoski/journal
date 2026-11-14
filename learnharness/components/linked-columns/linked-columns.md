# Linked columns

One layout for the two pages that put a list beside a map: the course page (its topics beside the course map, `../course-page/split/split-course.md`) and the topic page (its history beside the lesson's step map, `../unit-inbox/topic-page/hybrid/hybrid.md`). `linked-columns.tsx` (`LinkedColumns`, `LINKED_GRID`). Tests: `tests/linked-columns.test.tsx`.

Edo, 13 Nov 2026: "i hate on both the card outline bg in overall container". So: no frame and no fills. On 14 Nov 2026 he picked Current over Connected: no line between a row and its card. The tie, its routing and the Link switch are deleted; each page shows which card a row means on the map itself (the course page's glow, `../course-map/topic-map/topic-map.md`; the topic page's ringed step).

## Layout

| Part | Notes |
|---|---|
| grid | the list up to 24rem, the map the rest, 24px apart, both the full height under the page's head (`grid-cols-[minmax(0,24rem)_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] gap-6`). The root keeps the page's slot: `course-split` on the course page, `topic-panes` on the topic page |
| columns | a flex column each; the list and the map fill them. No outline, no surface, no fill: the left column takes plain rows (a row's own hover and selection fills stay the row's) |

## Sources

Edo's spec (13 Nov 2026) and his pick of Current (14 Nov 2026).
