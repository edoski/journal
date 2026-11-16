# Overview

The `overview` option of the Course map switch (shared parts: `../arcs/arcs.md`).

Thesis: overview first, details on demand (Shneiderman 1996). Each arc is one card (its number, ring and whole name; no counts), joined arc to arc; only the arc he is in is open in place to its topics, as a region, with "You are here" in it. A card opens its arc in place, beside his own; its name folds it back. On the course page a card opens the arc on the page (`arcHref`), and the arc the page shows is open.

- Card: 264×72, radius 12, the app's card surface, border white 10% (24% under the pointer).
- Open arcs are the regions of `regions`, and lines join arcs as there.
- Pointing at a card or a topic moves nothing; opening an arc is a press, and the drawing then lays out again, the camera bringing the arc into view.
- Measured on the demo courses: 0 crossings and 0 lines crossing an arc's edge; Linear Algebra 888×760, Calculus 848×756, the smallest of all options.

Trade-offs: what a folded arc holds takes a press to see; an arc a Today row points at opens on Home, so the map lays out again then (never on a hover of the map itself).
