# Bands

The `bands` option of the Course map switch (shared parts: `../arcs/arcs.md`).

Thesis: the course reads like a book's chapters. Each arc is a full-width band in study order, top to bottom; its number and name sit quietly in the margin on the line of its first cards (`../arcs/arc-label.tsx`); a hairline separates one chapter from the next. Within and across bands it is Canvas tree: one drawing.

Edo, 16 Nov 2026: "the band lines overlap with the edges visually and it just makes it confusing, also the edge paths between nodes here to accommodate this variant just looks weird. Overall tho I like the minimalist feel… full map being visible from the get-go". So:

- **Lines:** only the needs inside a chapter and from the chapter just before are drawn. A need from further back has no line (it ran down through every chapter between); in focus its prerequisite's card lights, and the card's words name it.
- **Rules clear of lines:** a chapter's hairline stops 12 short of every line crossing it, on each side (`ruleStretches`), and no line runs along a rule (lanes sit at least 16 from it).

- Layers: each topic's layer is its chapter's first layer plus the longest chain of its own chapter's needs above it (`layoutBands`), so every chapter starts below the last one ends; d3-dag then orders and places them as Canvas tree does.
- Label: while the margin is out of view (the camera frames "You are here"), a chapter's number and name stay 24 in from the frame's left edge, in its strip, as a sticky section header does, so every chapter on screen is named; the arc he is in reads in the foreground ink.
- Margin: wide enough for the widest name whole (7px a character at 12px, plus 60 for the number and padding), and 32 before the cards.
- Header strip: 56 above every chapter's first cards, under the lanes of the lines leaving the chapter before: the hairline at its top (white 10%; 20% while the chapter holds the topic in focus, none over the first), the number and name 8 under it, on the page's surface, over any line passing through. No card sits in the strip, so the name never covers one.
- A course whose needs run from a later arc to an earlier one draws as Canvas tree.
- Measured on the demo courses (16 Nov 2026, round 14): lines crossing a chapter's rule 5 on Linear Algebra and 9 on Calculus (22 and 25 before), each with the rule stopping short; Linear Algebra 958×2084, Calculus 1445×1880 (1238 and 2121 wide before).

Trade-offs: the tallest of the three, and the widest on Calculus; lines from early chapters run long through later ones.
