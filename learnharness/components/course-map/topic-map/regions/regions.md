# Regions

The `regions` option of the Course map switch (shared parts: `../arcs/arcs.md`).

Thesis: each arc is a softly tinted, numbered region holding its topics, and the arcs connect by one line each, from one region's bottom centre to the next region's top centre. At a glance the course is a handful of boxes in order; inside each box, its own tree.

- Region: radius 16, fill white 2.5%, border white 8% (16% while it holds the topic in focus); its number and pill top left, 16 in; 24 between its cards and its sides and foot, 72 above its first cards (pill, then room for "You are here").
- 48 between regions side by side (twice the padding), so the gap reads as a boundary too; the canvas's lanes between layers of regions.
- The line between two arcs stands for every need between them (the needs' own ink and width, `../canvas/canvas.md`, Lines; the lit ink when a topic in focus needs across it). A need between topics of two arcs has no line of its own: in focus its cards light.
- Measured on the demo courses (lever: the pass's `lever/metrics.mts`): 0 crossings and 0 lines crossing an arc's edge on all four; Linear Algebra 936×1708, Calculus 1632×1612 (Canvas tree: 942×1112, 2164×672).

Trade-offs: the drawing grows tall, since a course's arcs mostly follow one another; which topic of an earlier arc a topic builds on shows only in focus.
