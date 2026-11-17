# Road in rows

Road laid out in two rows of one column (`roadrows-course.tsx`; `../candidates.md`), Edo's ask on 17 Nov 2026: "maybe instead of one row and two columns, we should have two rows and one column, with the road underneath… the overall road trajectory, maybe that should be from left to right", then: "too wide a gap of empty space between the rows… it should be moved up… When I hover over them I expect the same UI/UX that we have on the home page", and "This whole bottom row with the road should feel more like a carousel." Head: Road's (`../road/road-course.tsx`, `RoadHead`). Body: `SplitBody` with `rows`, its `map` slot holding `FollowMap` and its `list` slot the road (`road-track.tsx`).

## The map

`follow-map.tsx`: the course map exactly as Home draws it, `ArcMap` with its list of arcs around `TopicMap` in Home's vignette (`HOME_MAP_FADE`, `HOME_MAP_VIGNETTE`), with Whole course in its top right corner. Its row is as tall as the course's tallest arc needs at full size and gives way on a shorter window; a drawing shorter than the row sits at its bottom, clear of the fade (`TopicMap`'s `fitsDown="bottom"`, `framedCamera`), so the cards end right above the road. At 1512×982 the lowest card ends 56px above the road's track on Linear Algebra (near and whole) and Probability, 62px on Calculus.

It follows the road's topic rows the way Home's map follows Today (`road-follow.ts`, over Home's own path): a topic row lights its topic, rings its card (`marked`) and brings it into view through Home's camera (`framed`, `litCamera` and `litFollow` in lit-camera.ts), in the arc it lies in (Home's `litArc`), the cards it does not light dimmed (`highlight`, which keeps "You are here" and the topics after it, as on Home). A pointer waits Home's dwell (`FOLLOW_DWELL_MS`) before the map follows, focus follows at once, and pointing at nothing returns to the page's arc after the map's return dwell.

## The road

- Every arc of the course on one track, left to right, the exam a stop where the plan reaches it (`trackItems`, `road-exam`). No folds, no Earlier, Later, More or "Only what's near" presses (Edo, 17 Nov 2026: "Scrap all of that").
- A fixed window that never scrolls (`road-window`, overflow hidden). The strip inside it slides (a transform, 300ms ease-out, none under reduced motion) so the selected arc sits in the window's centre, held at the strip's ends so it never leaves the window (`stripOffset`). Its sides fade only where the strip runs on beyond them.
- The selected arc is the one the page shows. It is open and 352px wide, its topics under it as Home's Today rows at their compact size (`hybridRow({ size: "compact" })`). Every other arc is 224px, its ring, its whole name and its one fact: "Needs you", "Ready for its check", "Check passed" or "Starts 20 Nov". Widths are fixed numbers, so the strip's place is worked out, never measured mid-glide.
- A wheel or swipe moves the strip with it, an arc's width of travel for an arc, momentum included, the arc nearest the centre brightening as it passes; when the gesture rests 140ms the strip glides onto that arc and selects it, so a gentle swipe moves one arc and a flick several. It never runs past the first or last arc. It is listened to directly, so the page never scrolls or swipes back (Edo, 17 Nov 2026: one arc per gesture was "too rigid"). Pressing a stop selects it. Pointing at a stop only brightens its words; pointing at a topic row lights its card on the map, as Home does.
- The track runs through the items and stops `MARK_GAP` (6px) short of every marker on either side, the exam's included. The row keeps the height of the course's longest arc, so the map never moves.

## Keys

← and → select the arc before or after (from a topic row too), gliding it to the centre; Down enters the open arc's topics (opening the arc first); Up leaves them for their stop and, from a stop, for the head's press; Enter or Space opens a topic's page.

## The topic page

Unchanged beside it (the one-line twin head, `../shared/topic-twin.tsx`): its left column is the topic's history (Now, Scheduled, Earlier), a list read top to bottom, not a road; under the map it would be cut to a strip.
