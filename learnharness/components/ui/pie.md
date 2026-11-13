# Pie

`pie.tsx`, `Pie`: the app's one progress pie, so a course on Home and a topic on the map, the course page and the topic page read alike and cannot drift (Edo, 13 Nov 2026: the map's cards should be "consistent like same pie chart style as the rows").

| Part | Notes |
|---|---|
| box | 16×16, `shrink-0` |
| ring | r 7.25, stroke 1.5, `currentColor` |
| wedge | r 5, from twelve o'clock clockwise for a share under one; a full disc at one; none at zero |
| tone | `muted` (muted ink), `warning` (a topic that slips), `empty` (60% muted, the ring dashed 2.85 and no wedge: a topic not started) |

Callers: `ProgressPie` (`../study-home/agenda-rows/progress-pie.tsx`: a course, the share of topics he can do on his own, with its count on hover, `data-slot` `today-progress`) and `TopicGlyph` (`../course-map/topic-map/topic-glyph.tsx`: a topic's standing, `data-slot` `topic-glyph`). Decorative unless the caller names it (`role="img"` and an `aria-label`).

Source: Things' project pie; Harvey balls.
