# Agenda rows: progress

`progress-rows.tsx`, `data-slot` `progress-rows`; lines `today-line`, the pie `today-progress`.

Thesis: each row is a course he is working through, so it is its own object, and the one fact is how far along it he is, drawn, not counted.

| Part | Notes |
|---|---|
| tile | each row its own surface: `card`, radius 8, 56px, padding 16 across, 6 between tiles; hover `accent` |
| columns | pie 16, course 144, lesson (fills); 16 between |
| pie | a 16px circle (1.5 stroke, muted ink) that fills clockwise from twelve o'clock with the share of the course's topics he can do on his own (`courseProgress`, hybrid/hybrid.md); a screen reader hears "2 of 5 topics you can do on your own" |
| course | 13 in ink |
| lesson | 13 at 500 in ink |

Trade-offs: calm and scannable, but progress is the weakest reason to pick a lesson today; a full pie (Calculus I) says nothing about the reviews it still needs. Tiles add the most surfaces of the three.

Sources: Things 3's project progress pie; Linear's project progress icon; Apple's grouped cells.
