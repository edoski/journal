# Road in rows

Road laid out in two rows of one column (`roadrows-course.tsx`; `../candidates.md`), Edo's ask on 17 Nov 2026: "maybe instead of one row and two columns, we should have two rows and one column, with the road underneath… the overall road trajectory, maybe that should be from left to right", then: "too wide a gap of empty space between the rows… it should be moved up… When I hover over them I expect the same UI/UX that we have on the home page", and "This whole bottom row with the road should feel more like a carousel." Head: Road's (`../road/road-course.tsx`, `RoadHead`). Body: `SplitBody` with `rows`, its `map` slot holding `FollowMap` and its `list` slot the road (`road-track.tsx`).

## The map

`follow-map.tsx`: the course map exactly as Home draws it, `ArcMap` with its list of arcs around `TopicMap` in Home's vignette (`HOME_MAP_FADE`, `HOME_MAP_VIGNETTE`), with Whole course in its top right corner. Its row is as tall as the course's tallest arc needs at full size and gives way on a shorter window; a drawing shorter than the row sits at its bottom, clear of the fade (`TopicMap`'s `fitsDown="bottom"`, `framedCamera`), so the cards end right above the road. At 1512×982 the lowest card ends 56px above the road's track on Linear Algebra (near and whole) and Probability, 62px on Calculus.

It follows the road's topic rows the way Home's map follows Today (`road-follow.ts`, over Home's own path): a topic row lights its topic, rings its card (`marked`) and brings it into view through Home's camera (`framed`, `litCamera` and `litFollow` in lit-camera.ts), in the arc it lies in (Home's `litArc`), the cards it does not light dimmed (`highlight`, which keeps "You are here" and the topics after it, as on Home). A pointer waits Home's dwell (`FOLLOW_DWELL_MS`) before the map follows, focus follows at once, and pointing at nothing returns to the page's arc after the map's return dwell.

## The road

- A row that scrolls natively sideways (a trackpad swipe glides with momentum, a wheel turned up or down moves it sideways; no scrollbar, no snap), one item per arc shown, items edge to edge: a folded arc's slot 14rem, the open arc's 22rem for its rows: its ring, its whole name (wrapping, never cut), and its one fact: "Needs you" when Today takes up one of its topics, "Ready for its check", "Check passed", or "Starts 20 Nov" for an arc not started; nothing otherwise. Its press shows the arc on the map and opens it. Pointing at a stop only brightens its words (no fill, no map change; Edo, 17 Nov: hovering an arc that swapped the map "looks so bad"); the focus ring stays for keys. An arc past the exam is muted.
- The track runs through the items and stops `MARK_GAP` (6px) short of every marker on either side, the exam's included.
- The exam is an item (`road-exam`, its run-up on press) at its place on the whole road (`examStop`).
- The arc the page shows is open, its topics under it as Home's Today rows at their compact size (`hybridRow({ size: "compact" })`, `../../../study-home/agenda-rows/hybrid/hybrid.md`): the pie beside where he stands, then the topic and its fact flush right; Check it heads them on an arc ready for its check. The row keeps the height of the course's longest arc, so the map never moves when another opens; the room under the open arc's topics is that reserve (117px to the window's bottom on Linear Algebra, 182px on Calculus and Probability).
- Only the stretch near him shows first (`roadWindow`); the arcs folded away are the carousel's ends, "Earlier" and "Later" ("More" between two shown arcs), any of which shows the whole road, which ends in "Only what's near" (`trackItems`).
- The arc the page shows is centred on arrival and whenever another is shown; focusing an item glides it to the centre with a gentle snap (at once under reduced motion); items beyond fade at the row's sides. No scrollbar and no arrows over the items.

## Keys

← and → step one item and glide it to the centre; Home and End jump to the ends; Down enters the open arc's topics (opening the arc first); Up leaves them for their stop and, from a stop, for the head's press; Enter or Space opens a topic's page.

## The topic page

Unchanged beside it (the one-line twin head, `../shared/topic-twin.tsx`): its left column is the topic's history (Now, Scheduled, Earlier), a list read top to bottom, not a road; under the map it would be cut to a strip.
