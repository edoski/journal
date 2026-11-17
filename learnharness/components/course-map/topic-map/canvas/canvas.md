# Canvas

How the course map draws a course or one arc of it (`../topic-map.md`; Stacked arcs draws each arc this way): the course as a finished diagram canvas, after Linear's restraint and Figma's canvas, built on React Flow UI's shadcn registry. Edo picked it on 16 Nov 2026 ("the cleanest… the paths of the edges are a lot more structured"); plain Canvas and Brilliant are gone. Research: `research-components.md` and `research-leaders.md` in the 15 Nov pass's scratchpad.

Thesis: keep the graph, but make it read like a professional diagram tool: two-tier cards and quiet right-angled lines, drawing only the needs no longer chain implies. It reads top to bottom, as the map does (Edo, 15 Nov 2026: "I just don't like its left-to-right directionality, I'd rather see it visually oriented in the same way as Current").

## Reused

| Part | Source | Licence |
|---|---|---|
| `BaseNode`, `BaseNodeHeader`, `BaseNodeContent` (`base-node.tsx`) | React Flow UI, `https://ui.reactflow.dev/base-node`, copied and adapted (the app's card, no tab stop of its own) | MIT (xyflow) |
| `NodeAppendix` (`node-appendix.tsx`) | React Flow UI, `https://ui.reactflow.dev/node-appendix`, adapted to its words alone above the node, no tab | MIT (xyflow) |
| `Background` | `@xyflow/react` | MIT |
| Layout | d3-dag 1.3 Sugiyama (simplex layering, `decrossOpt`, `coordSimplex`), Canvas's own | MIT |
| Node anatomy and rounded orthogonal lines | ideas from kargulstudio/workflow-editor (two-tier node, rounded elbows); no code, since it has no licence | n/a |

## Layout and lines

Why it changed (15 Nov 2026, Edo: "a scattered mess … no standardisation at the ins and outs … multiple edges running super close to one another"): at a90cab68 each need landed on a port of its own (up to 4 entry points on one card), lanes ran 12 apart, and the needs a longer chain already implies (6 of Linear Algebra's 26) made most of the long lines. The diagnosis and its numbers are in the pass's `diagnosis.md`.

- **Places** (`layoutCanvas`): Canvas's own Sugiyama drawing on d3-dag, no longer Current's: simplex layering (an arc's entry topics held in the first layer), optimal decrossing up to 25 topics, simplex places, 24 between cards in a layer and between a line through a layer and its cards. Then one pass takes out short sideways steps (`straighten`): a card moves onto the column of a card it links to when that leaves fewer steps under 48 and turns, if it stays clear of everything in its layer, and never so that two prerequisites of the same two topics each sit straight over one (their lines would run down each other's).
- **One grammar for every line** (`orthogonalPath`): out of the prerequisite's bottom centre, straight down where its topic sits under it, else across on its prerequisite's bracket, and into the topic's top centre. One exit and one entry per card. Every corner at one 8px radius.
- **Brackets**: the needs leaving one prerequisite share one bracket in each gap, so they read as one line that branches. Two brackets that only meet where both drop into one card share a lane, so the needs arriving there read as one line into it. Every other bracket has a lane of its own, 24 from the next and from the cards, ordered to cross the fewest lines and never to drop a line onto another prerequisite's straight line; each gap is as deep as its lanes need (48 at the least).
- **Long lines** run down d3-dag's own dummy places, which the layout aligns, so they stay straight through the layers they skip.
- **One weight** (Edo, 16 Nov 2026: "multiple edges running in same path… makes that tract look thicker", then "there is still visually a difference in the edges when there's just one line versus two lines going through them, both in terms of thickness and colour"): every line is one screen pixel wide in an opaque ink (`--lh-map-line`, white 33% over the page, 3:1, WCAG 1.4.11), whatever the camera's zoom (its width is 1 over the zoom; `vector-effect: non-scaling-stroke` leaves the frame's CSS scale in). Each stretch of track is drawn once (`trackPieces`, `canvas-lines.tsx`): where several lines run along it, in the brightest of their inks, so a faded line never sits under a resting one. Every coordinate is snapped to the screen's device pixels from the drawing's own screen matrix (`snapTo`), so a line fills whole pixels instead of spreading over three at a lower grey. A lit line takes the lit ink (white 70%), the others the receded ink (white 10%), at the same width. Measured at 1512×982 on a 2x screen (round 14, second pass): a line alone, a shared track and each arm of a junction read 2.00 device pixels at exactly their ink, normal and faded alike; before, 0.8 to 2.0 pixels at greys 49 to 96 for an ink of 96 (zoom 0.85 drew a 0.85px stroke, and off the grid it blurred).

Measured on the demo courses (`lever/metrics.mts`): one entry and one exit per card everywhere; no two lines closer than 24 over any shared run (12 at a90cab68); crossings 2 on Linear Algebra, 5 on Calculus, 1 on Probability (2, 6, 1 at a90cab68).

## Implied needs

The canvas draws only the needs no longer chain implies (`transitiveReduction`): an implied need keeps its route with no points, so the camera still frames by it, and in focus its prerequisite lights with the chain that implies it. Linear Algebra draws 20 of its 26 needs, Calculus 30 of 34, Probability 10 of 11. Crossings 0, 3 and 1; the lines that skip layers drop from 8 to 2 on Linear Algebra and from 8 to 4 on Calculus (measured with every need drawn, 15 Nov 2026).

## Focus

Pointing at or focusing a topic, or a page marking one (a Today row he rests on), brings it into focus (`CanvasFrame`, `focusOf`): its card and the cards of what it needs and what it leads to stay bright, the lines between them rise, and every other card drops to 45%. Where implied needs are left out, a topic a lit line passes through between them recedes only to the map's 80%. Nothing moves: the camera stays where it is.

No card names them (Edo, 16 Nov 2026: the fixed focus card beside the enlarged map "feels like poor UI/UX"): the lit cards are the answer, and the card's own words and `aria-description` name its needs.

## Node

232×68 (`CANVAS_NODE`), radius 12, one surface.

| Part | Notes |
|---|---|
| header strip | 24 tall, a hairline under it: the card's line (`cardLine`, the sidebar's fact with its icon) or where he stands. Tinted by what it asks: the accent at 14% where a session waits on him, the warning ink at 10% for a slip, white 4% for a plan, a review or a task, none for where he stands |
| content | the app's pie (`TopicGlyph`) and the title on one 18px line (`MathLine`) |
| current | `ring` border and 3px halo; "You are here" (11/14 at 500, the foreground ink) just above the card, on the header's text line (`NodeAppendix`, its words alone: Edo, 15 Nov 2026, "the You are here label's bg looks terrible, get rid of it") |
| focus | a 2px `ring` ring inside the card |

## Chrome

A dot grid (24px, white 10%) under the cards everywhere, and nothing else: no minimap and no zoom bar (Edo, 16 Nov 2026: "get rid of this"). Scroll pans and a pinch zooms, as on every map, and a map that fits its frame holds still until a pinch zooms in (`../topic-map.md`, Held still while it fits); the enlarged map's own button shows the whole course.

## Behaviour

- A click or Enter opens the topic's page. An entry card's "From <arc>" line is a press of its own beside the card's link (`FromLink`): it shows that arc on the map, where the page can show one (Home, the course page), and reads in the foreground ink under the pointer (Edo, 16 Nov 2026: "make perhaps the From... header in cards clickable"). Pointer only; the keyboard reaches another arc by ⇧↑ and ⇧↓ on Home and by the arc selector on the course page. The arrows walk it as they walk the map (`neighbourOf`): Up to the nearest prerequisite, Down to the nearest topic that needs it, Left and Right along the layer.
- Camera, framing, follow, highlight and mark are the map's own (`../topic-map.md`). Scroll pans, pinch zooms, held still while it fits.
- Reduced motion: every hover change is at once.
