# Pie and ring

`pie.tsx`, the app's one progress glyph (`Progress`), in two forms. `Pie`: where he stands on one topic, on the map, the course page's rows, the topic page and the sidebar. `Ring`: how far along a whole course or arc is, on Home's rows, the course page's head and the arc pills. They share the 16px box and the same full outline, so they read as one family (Edo, 13 Nov 2026: the map's cards should be "consistent like same pie chart style as the rows"), but a course's centre is hollow and a topic's share is filled from the centre, so the course's share on a Today row is never read as the topic's standing on the map above it (the round-2 evaluation: the Eigenvalues row showed a third while its card showed three quarters).

An amount at rest, never a spinner: the whole is always a full, solid outline in the glyph's own ink, and the share sits inside it. Round 3 found a heavy track under an arc read as a loading spinner; round 5 found a partial arc on a faint hairline track, and a dashed empty ring, read as spinners too: a part-way arc with no visible whole, or a broken circle, is the spinner's own glyph.

| Part | Notes |
|---|---|
| box | 16×16, `shrink-0` |
| outline | r 7.25, stroke 1.5, `currentColor` at full strength, never dashed or faint (`data-part="outline"`) |
| share | from twelve o'clock clockwise, `data-part="share"`; none at zero, so nothing started is the outline alone |
| topic (`Pie`) | a wedge from the centre, r 5; a full disc at one |
| course (`Ring`) | a band inside the outline, r 4.25, stroke 2.5 (a 1px gap to the outline, a hollow centre of r 3), square ends; closed at one |
| ink | `Pie`: `muted` (muted ink), `warning` (a topic that slips), `empty` (60% muted, the outline alone: a topic not started). `Ring`: `foreground` at 80% |

Never animated.

Callers: `ProgressRing` (`../study-home/agenda-rows/progress-ring.tsx`: a course, the share of topics he can do on his own, with "Some topics on your own" on hover, `data-slot` `today-progress`), the arc pills and the course page's arcs (a `Ring` each), and `TopicGlyph` (`../course-map/topic-map/topic-glyph.tsx`: a topic's standing, `data-slot` `topic-glyph`). Decorative unless the caller names it (`role="img"` and an `aria-label`). Tested in `tests/pie.test.tsx`.

Source: Things' project pie; Harvey balls; Apple's Activity rings for a whole's progress.
