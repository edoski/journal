# Road in rows

Road laid out in two rows of one column (`roadrows-course.tsx`; `../candidates.md`), Edo's ask on 17 Nov 2026: "maybe instead of one row and two columns, we should have two rows and one column, with the road underneath… the overall road trajectory, maybe that should be from left to right." Head: Road's (`../road/road-course.tsx`, `RoadHead`). Body: `SplitBody` with `rows`, the course map with its list of arcs across the top, unchanged (`ArcMap`), and under it the road (`road-track.tsx`) across the column's width.

## The road

- One hairline track left to right; each arc shown is a stop on it (`road-stop`): its ring on the track, its name (two lines at most, the dot of where he is after it) as a press that shows the arc on the map as the map's list does, and under it its one fact: "Needs you" when Today takes up one of its topics, Check it (a press) on an arc ready for its check, "Check passed", or "Starts 20 Nov" for an arc not started; nothing otherwise. An arc past the exam is muted.
- The exam is a stop (`road-exam`, its run-up on press) at its place on the whole road (`examStop`).
- The arc the map shows is open, 320px wide, its topics hanging under its stop as the course page's 32px rows; the others share the rest and fold to their stop. The row is as tall as the course's longest arc, so the map above never moves.
- Before he asks for the whole road, only the stretch near him shows (`roadWindow`: the arc he is in, the next and any arc Today asks about). Each run of arcs folded away is a quiet press on the track where it would be (`trackItems`): "Earlier" at the left end, "Later" at the right, an ellipsis between ("Show every arc" in its hint); any shows the whole road, and "Only what's near" at the right end folds it back. Picked over one press in the road's top right corner beside Whole course (17 Nov 2026): on the track it says where arcs are folded, and the corner hid the gap between two shown arcs.
- Whole, Linear Algebra's seven arcs and the exam fit the 1208px column with no scroll: names wrap to two lines.

## The links

Pointing at a topic row lights its card on the map; pointing at the open arc's stop lights where he is in it. Pressing a stop shows its arc on the map, and a stop the map shows opens. Left and Right walk the stops and folds, Home and End jump, Down enters the open arc's topics (opening the arc first), Up leaves them for their stop and, from a stop, for the head's press; Right on a topic steps onto its card on the map, and Escape on a card hands the walk back to its row.

## The topic page

Unchanged beside it (the one-line twin head, `../shared/topic-twin.tsx`): its left column is the topic's history (Now, Scheduled, Earlier), a list read top to bottom, not a road; under the map it would be cut to a strip.
