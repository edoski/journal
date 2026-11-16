# Tree and neighbours

The `neighbours` option of the Course map switch (`../map-style.ts`; the guide reads it "Neighbours").

Edo, 16 Nov 2026, on Tree: "i really like in tree variant this compartmentalised/segmented approach… a hybrid variant between this tree one and the bands one where we keep philosophy of tree variant with only one arc shown at a time but we have minimalist bands on the left only showing the immediate before arc (above) and after arc (below) again with the whole faded style… if i click on the faded nodes… or on the bands that loads the next graph arc subset. Also I really like the current path structuring of nodes and edges for the graph subsets so if possible lets try to keep it like this".

Research (round 14's map pass): focus plus context, interest falling with distance (Furnas, via Cockburn et al. 2009); peeks at a carousel's edge tell people more lies beyond (NN/g); faded but clickable things keep their words legible (WCAG 1.4.3).

## What it draws

- **The arc:** exactly Canvas tree's drawing of it (`../canvas/canvas.md`): its places and lines, its cards, "You are here", focus and keys.
- **The arc before**, above, only when there is one: a faded band holding the cards of that arc this arc builds on, lifted out of Tree's top layer at the same column (their lines into this arc keep Tree's route, the first run down growing), and that arc's other leaves beside them with no line. Each shows its bottom, its title row, the cut edge fading into the band.
- **The arc after**, below, only when there is one: a faded band holding that arc's first cards (its topics that need nothing inside it), each under the cards here it needs, with a faded line from each such card that can drop to it clear of every card under it (lanes 24 apart). Each shows its top, what it says and its title, the cut edge fading into the band.
- **Bands:** a whisper of a surface (white 2%, 4% under the pointer), radius 12, the arc's number and whole name quiet on the left (`../arcs/arc-label.tsx`), above the cards for the arc before and below them for the arc after; held 64 in from the visible left edge, clear of the map's edge fade, on Home as the camera moves and on the course page as the pane scrolls (`../frame-left.ts`) while the band's start is out of view, so the name is always whole on screen.
- **Strength:** the neighbours' cards at 55%, their title in the muted ink; their lines in the context ink (`--lh-map-line-context`, white 18% over the page), one weight with every other line.

## Behaviour

- A press on a faded card or a band loads that arc (the page's own arc: Home's pick, the course page's arc), and the selector above the map follows. The drawing arrives from the side it was on, the arc after rising from below and the arc before dropping from above, in the map's own glide (200ms, fast out and settling in); nothing moves under reduced motion.
- A faded card is a pointer shortcut (no tab stop); the band and the selector are the keyboard's way.
- A course without arcs, or with one, draws as Canvas tree.

## Parts

| Part | File |
|---|---|
| The drawing with its bands (pure) | `neighbours-layout.ts` |
| A band, a neighbour's card | `neighbour-nodes.tsx` |
| The glide when another arc loads | `neighbours-frame.tsx` |
| The skin | `neighbours-skin.ts` |
