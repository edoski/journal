# Stacked arcs

The `stack` option of the Course map switch (`../map-style.ts`; the guide reads it "Stack"). It replaced Tree and neighbours (round 14, third pass).

Edo, 16 Nov 2026: "a hybrid between this current neighbours style and the bands style… the nodes-and-edges structure that we currently have here from the neighbours, minus the whole faded-in-and-out nodes and their connections… we keep them disconnected… instead of being able to freely scroll up and down, we have these fixed camera views… one clean simple up-down UI/UX in a very minimalist to-the-side kind of fashion… (and we can also have a keyboard shortcut for this) simply moves us up or down vertically with a fixed animation. It focuses the view and locks the view back to the current arc".

## What it draws

- **One arc at a time, exactly as Canvas tree draws it** (`../canvas/canvas.md`): its places, its lines, its cards, the entry cards from earlier arcs with their "From <arc>" line (a press opens that arc), "You are here", focus and keys. It is Tree's skin with `travel` on (`stack-skin.ts`), so Tree's line ink (one screen pixel, one opaque ink, a run drawn once) and its hold-still rule (no drag or scroll pan while the arc fits; a pinch zooms in to 150% and pans only then; zooming back out lands on the arc) come from Tree's own code.
- **The arcs stack top to bottom in study order, disconnected:** no line runs between two arcs. Only the shown arc is on the canvas at rest, so the frame never holds another arc's cards (Edo: "It just shows that arc cleanly").
- **The arc list** (`../../arc-index.tsx`, `data-slot` `arc-index`): every arc of the course top to bottom in study order, in a column of its own left of the map, each named as Bands names a chapter (`ArcLabel`: its number and whole name, quiet), the arc shown bright, each a press that glides there. Its rows never move, whichever arc shows (Edo, 16 Nov 2026: "copy the arc display just for the arcs of the bands variant"; on the selector it replaced, "plenty of layout shift… I'm not able to orient myself in it"). The map frames each arc in the room beside it. The course page keeps its selector.

## Behaviour

- **The camera glides one arc** when the arc shown changes, by the arc list, ⇧↑ or ⇧↓ (`ARC_UP`, `ARC_DOWN`; Home's own keys take plain arrows, f, o, c and -; the keys join the cheat sheet's Home rows when the style ships, since Current ignores them), a card's "From <arc>" line, or Home following a Today row: the arc it left stays drawn beside the new one, above it when it comes first and below when after, 160 apart on one vertical axis (`trailOf`, `ARC_GAP`), and React Flow's own `setViewport` glides from where the camera was to the new arc's opening view in 420ms, eased in and out. The arc it left then goes. A jump of several arcs glides as one. Under reduced motion the new arc shows at once.
- **The opening view** is Tree's: the whole arc when it fits at 80% or more, else framed on "You are here" with the topics it leads to whole. It starts on "You are here"'s arc.
- **Wheel and drag never leave the arc:** the camera's bounds are the arc's own (`wholeExtent`), opened wide only for the glide.
- The cards of the arc being left are drawn by Canvas tree's card out of the map's focus, keys and links (`trail-node.tsx`).

## Parts

| Part | File |
|---|---|
| The skin | `stack-skin.ts` |
| A card of the arc being left | `trail-node.tsx` |
| The arc being left, placed (pure) | `../map-skin.ts`, `trailOf` |
| The glide | `../topic-map.tsx`, `Flow` |
| ⇧↑ and ⇧↓ | `../../arc-keys.ts` |
