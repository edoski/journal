# Map tie

`useMapTie` (`use-map-tie.ts`) ties a list to the map beside it, the same way on every page that has one: Home's Today and its map (`../study-home/home-map.md`), the course page's road and its map (`../course-page/split/split-course.md`, Pointing) and the topic page's Builds on and its map (`../unit-inbox/topic-page/hybrid/hybrid.md`). Before it, each page tied its own way: the course page lit a chain, made the card glow and brought it into view; Home lit and brought into view but never glowed; the topic page only glowed (audit 17 Nov 2026, finding 11). Tests: `tests/one-map-tie.test.tsx` (each page), `tests/course-page-split.test.tsx` (`lightsOf`).

| He does | The tie |
|---|---|
| points at or focuses a row | the map lights the row's topics (`lights.lit`, `TopicMap`'s `highlight`), the other topics receding except "You are here" and the topics it leads to; the row's first topic's card glows (`lights.glow`, `marked`); the camera brings its topics into view once it rests there (`lights.framed`, `framed`) |
| points at or focuses a card | the map lights the card's chain itself; the tie marks the card's row (`row`) |
| leaves a pane | only that pane's pointing clears |

- **Chain, one flag.** `chain` is the map's edges when a row lights its topics with their whole prerequisite chains, null when it lights the row's topics alone. Each page kept its own choice: the course page lights the chain (its road lists a course whose order is the chain); Home lights a line's topics alone (Edo's Follow, 13 Nov 2026: "row topics lit"); the topic page lights the row's topic alone, since its map is already the chain the topic builds on.
- **One dwell.** The pointer moves the other pane once it rests 150ms on a row or a card (`POINT_DWELL_MS`), arriving or leaving, so a sweep across rows lights only where it stops and crossing Today's lines on the way to Home's map does not flip its course; a focus moves it at once. The camera then waits on its own (`framed`, `topic-map/topic-map.md`).
- **Held.** `onHold` hears what he points at once it holds: Home moves its map to the line's course, and stays on that line after he leaves it.
- **The cards say it.** Each card marks what the tie gives it: `data-lit` (lit), `data-marked` (glowing), `data-framed` (brought into view).
