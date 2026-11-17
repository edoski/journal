# Road in rows

Road laid out in two rows of one column (`roadrows-course.tsx`; `../candidates.md`), Edo's ask on 17 Nov 2026: "maybe instead of one row and two columns, we should have two rows and one column, with the road underneath… the overall road trajectory, maybe that should be from left to right", then: "too wide a gap of empty space between the rows… it should be moved up… When I hover over them I expect the same UI/UX that we have on the home page", and "This whole bottom row with the road should feel more like a carousel." Head: Road's (`../road/road-course.tsx`, `RoadHead`). Body: `SplitBody` with `rows`, its `map` slot holding `FollowMap` and its `list` slot the road (`road-track.tsx`).

## The map

`follow-map.tsx`: the course map exactly as Home draws it, `ArcMap` with its list of arcs around `TopicMap` in Home's vignette (`HOME_MAP_FADE`, `HOME_MAP_VIGNETTE`), with Whole course in its top right corner. Its row is as tall as the course's tallest arc needs at full size and gives way on a shorter window; a drawing shorter than the row sits at its bottom, clear of the fade (`TopicMap`'s `fitsDown="bottom"`, `framedCamera`), so the cards end right above the road. At 1512×982 the lowest card ends 56px above the road's track on Linear Algebra (near and whole) and Probability, 62px on Calculus.

It follows the road's topic rows the way Home's map follows Today (`road-follow.ts`, over Home's own path): a topic row lights its topic, rings its card (`marked`) and brings it into view through Home's camera (`framed`, `litCamera` and `litFollow` in lit-camera.ts), in the arc it lies in (Home's `litArc`), the cards it does not light dimmed (`highlight`, which keeps "You are here" and the topics after it, as on Home). A pointer waits Home's dwell (`FOLLOW_DWELL_MS`) before the map follows, focus follows at once, and pointing at nothing returns to the page's arc after the map's return dwell.

## The road

- Every arc of the course as a card in one row under the map, left to right in study order, the exam a dashed card where the plan reaches it (`trackItems`, `road-exam`). A card is drawn as the map's cards are (`base-node.tsx`, a hairline border on the card surface): its ring and its one fact on top ("Needs you", "Ready for its check", "Check passed", "Starts 20 Nov", or "You are here"), then its whole name on up to two lines. The cards share the row equally and all fit at 1512×982 (Linear Algebra's seven arcs and the exam, 153px each); a course with more arcs than fit scrolls natively, snapping to a card's edge, with no custom wheel or swipe handling (Edo, 17 Nov 2026: the hand-made swipe "is just broken UI/UX… each arc should have a card there around them in minimalist style").
- Pressing a card selects its arc: it wears the map's "You are here" ring, the map shows the arc, and its topics fill the panel under the cards as Home's Today rows at their compact size (`hybridRow({ size: "compact" })`), three to a line; Check it heads them on an arc ready for its check. Pointing at a card only brightens its name and border; pointing at a topic row lights its card on the map, as Home does.
- The panel keeps the height of the course's longest arc, so the map never moves.

## Keys

← and → select the arc before or after (from a topic row too); Down enters the open arc's topics (opening the arc first); Up leaves them for their stop and, from a stop, for the head's press; Enter or Space opens a topic's page.

## The topic page

Unchanged beside it (the one-line twin head, `../shared/topic-twin.tsx`): its left column is the topic's history (Now, Scheduled, Earlier), a list read top to bottom, not a road; under the map it would be cut to a strip.
