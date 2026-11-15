# Bands

The `bands` option of the Course map switch (shared parts: `../arcs/arcs.md`).

Thesis: the course reads like a book's chapters. Each arc is a full-width band in study order, top to bottom; its number and pill sit in the margin on the line of its first cards; a hairline separates one chapter from the next. Within and across bands it is Canvas tree: one drawing, so a need from an earlier chapter runs straight down into a later one.

- Layers: each topic's layer is its chapter's first layer plus the longest chain of its own chapter's needs above it (`layoutBands`), so every chapter starts below the last one ends; d3-dag then orders and places them as Canvas tree does.
- Margin: wide enough for the widest pill with its name whole (7px a character at 12px, plus 60 for the number, ring and padding), and 32 before the cards.
- Between chapters: the lanes of the lines leaving the earlier one, then 32 more under a hairline (white 10%; 20% while the chapter holds the topic in focus).
- A course whose needs run from a later arc to an earlier one draws as Canvas tree.
- Measured on the demo courses: crossings 0 on Linear Algebra, 1 on Calculus (Canvas tree 0 and 4); 10 and 15 lines cross a chapter's hairline; Linear Algebra 1238×1884, Calculus 2121×1752.

Trade-offs: the tallest of the three, and the widest on Calculus; lines from early chapters run long through later ones.
