# Road

The course page as a road to its exam (`road-course.tsx`; `../candidates.md`), in one row of two columns: the road on the left, the map on the right. Head (`compact`): the title with Mistakes, Context and the press, then readiness (`ReadyFact`) and Studied.

The road is the course's one list of arcs. The map beside it lists none (`SplitBody`'s `mapIndex={false}`, `ArcMap`'s `index`), so the arcs are never listed twice side by side (Edo, 17 Nov 2026: the two lists beside each other made the layout feel "not really laid out correctly"; he liked the map's arc list, so the road takes its look).

- Every arc in study order, drawn as the map's arc list draws its rows (`road-arc.tsx`, `ArcIndex`'s anatomy): its number and whole name (`ArcLabel`), the dot of "You are here" on the arc he is in, all hanging off one hairline track; a bar on the track marks the arc the map shows.
- Each row ends in the one fact the road needs: "Needs you" when Today takes up one of its topics, Check it on an arc ready for its check, "Check passed", or "Starts 20 Nov" for an arc not started (`arcStarts`); nothing otherwise. An arc past the exam is muted.
- The exam is a row on the track (`road-exam`, its run-up on press), after the last arc it examines and the plan fits (`examStop`).
- Opening an arc shows it on the map; its topics hang under it, on the track. Hovering a topic row lights its card on the map, as the linked columns do on every course page.

No folds and no Whole road press: every arc shows (Edo, 17 Nov 2026, on the folds: "Scrap all of that").

Removed from Current: the arc pills and Pick up/Then (the press and the rows' facts say what is next), "In progress" and "Not started" on the lines, the exam in the head (it is on the road).
