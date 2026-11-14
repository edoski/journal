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
| ink | `foreground` at 80% |
| track | r 6, stroke 1.25, the ink at 30%: a full faint hairline ring, the whole the share is of |
| arc | on the same circle, stroke 3 in the ink, from twelve o'clock clockwise for the share, square ends; closed at one; none at zero; never animated |

A 2.5 track at 40% under an arc as heavy read as a loading spinner (the round-3 evaluation, 14 Nov 2026): a part-way ring looked like a ring with a gap, and a faint track under a short arc of the same weight is the spinner's own glyph. A hairline whole with a heavier share on it reads as a gauge at rest.

Callers: `ProgressRing` (`../study-home/agenda-rows/progress-ring.tsx`: a course, the share of topics he can do on his own, with "Some topics on your own" on hover, `data-slot` `today-progress`) and `TopicGlyph` (`../course-map/topic-map/topic-glyph.tsx`: a topic's standing, `data-slot` `topic-glyph`). Decorative unless the caller names it (`role="img"` and an `aria-label`).

Source: Things' project pie; Harvey balls; Apple's Activity rings for a whole's progress.
