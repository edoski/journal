# Pie and ring

`pie.tsx`. `Pie`: the app's one pie, where he stands on one topic, on the map, the course page's rows, the topic page and the sidebar. `Ring`: how far along a whole course is, on Home's rows and the course page's head. They share the 16px box and the muted ink, so they read as one family (Edo, 13 Nov 2026: the map's cards should be "consistent like same pie chart style as the rows"), but a course is hollow and a topic is filled, so the course's share on a Today row is never read as the topic's standing on the map above it (the round-2 evaluation: the Eigenvalues row showed a third while its card showed three quarters).

| Part | Notes |
|---|---|
| box | 16×16, `shrink-0` |
| ring | r 7.25, stroke 1.5, `currentColor` |
| wedge | r 5, from twelve o'clock clockwise for a share under one; a full disc at one; none at zero |
| tone | `muted` (muted ink), `warning` (a topic that slips), `empty` (60% muted, the ring dashed 2.85 and no wedge: a topic not started) |

## Ring

| Part | Notes |
|---|---|
| box | 16×16, `shrink-0` |
| track | r 6.25, stroke 2.5, `currentColor` at 40%: firm, so a part-way ring never reads as a spinner |
| arc | the same circle in full ink from twelve o'clock clockwise for the share, square ends; closed at one; none at zero |

Callers: `ProgressRing` (`../study-home/agenda-rows/progress-ring.tsx`: a course, the share of topics he can do on his own, with "5 of 16 topics on your own" on hover, `data-slot` `today-progress`) and `TopicGlyph` (`../course-map/topic-map/topic-glyph.tsx`: a topic's standing, `data-slot` `topic-glyph`). Decorative unless the caller names it (`role="img"` and an `aria-label`).

Source: Things' project pie; Harvey balls; Apple's Activity rings for a whole's progress.
