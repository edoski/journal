# Pie

`pie.tsx`, `Pie`: where he stands on one topic, on the map, the course page's rows, the topic page and the sidebar. A whole course's progress is not a pie: it runs round the course's badge (`CourseBadge`, `../study-home/agenda-rows/course-badge.tsx`, hybrid.md), which replaced the course's lone ring, a cold reader having taken it for a checkbox (15 Nov 2026), so a course's share is never read as a topic's standing either (the round-2 evaluation: the Eigenvalues row showed a third while its card showed three quarters).

An amount at rest, never a spinner: the whole is always a full, solid outline in the pie's own ink, and the share sits inside it. Round 3 found a heavy track under an arc read as a loading spinner; round 5 found a partial arc on a faint hairline track, and a dashed empty ring, read as spinners too: a part-way arc with no visible whole, or a broken circle, is the spinner's own glyph.

| Part | Notes |
|---|---|
| box | 16×16, `shrink-0` |
| outline | r 7.25, stroke 1.5, `currentColor` at full strength, never dashed or faint (`data-part="outline"`) |
| share | a wedge from the centre, r 5, from twelve o'clock clockwise, `data-part="share"`; a full disc at one; none at zero, so nothing started is the outline alone |
| ink | `muted` (muted ink), `warning` (a topic that slips), `empty` (60% muted, the outline alone: a topic not started) |

Never animated.

Callers: `TopicGlyph` (`../course-map/topic-map/topic-glyph.tsx`: a topic's standing, `data-slot` `topic-glyph`; the map's cards should be "consistent like same pie chart style as the rows", Edo, 13 Nov 2026). Decorative unless the caller names it (`role="img"` and an `aria-label`). Tested in `tests/pie.test.tsx`.

Source: Things' project pie; Harvey balls.
