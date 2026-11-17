# Arc selector

`ArcSelector` in `arc-selector.tsx` (`data-slot="arc-selector"`): which arc the course page's map pane shows. Home lists its arcs beside its map instead (`arc-index.tsx`, topic-map/topic-map.md, Arcs).

Edo, 16 Nov 2026, on the pill strip: "the UI/UX of this is terrible it is too 'in the way' how can we better integrate arcs selectors… while being a bit more minimalist". The research (round 14's map pass) picked a title-style menu button: navigation recedes and content leads (Linear's 2026 refresh: chrome dimmed, tabs compact), and Apple's tab views give way to a pop-up "where there are too many panes" (seven arc names at 13pt need about 1,030px before padding, so a row of names does not reliably fit). The rail keeps the course's shape at a glance, which the menu alone would hide.

## Anatomy

| Part | Slot | Notes |
|---|---|---|
| row | `arc-selector` | one line, 28 tall, 8 between the name and the rail; its left edge on the course tabs' text |
| name | `arc-selector-menu` | the shown arc's whole name (13/18 Body, foreground, never cut), a 14px muted chevron; hover and open `fill-hover`, radius 8; opens the list |
| list | `arc-selector-list` | the app's dropdown menu: every arc in study order, its ring (`Ring`, 14px) and its whole name, "You are here" (12/16 muted) beside the arc he is in, the shown arc checked; as wide as its longest name |
| rail | `arc-rail` | one dot per arc in study order, each a 16×28 press target (`data-arc`, `data-state` on or off, `data-here` on the arc he is in) |
| dot | | 6px: the shown arc foreground, the others muted at 45% (full muted under the pointer); the arc he is in ringed 2px out; named under the pointer, with ", you are here" on his |

## Behaviour

- A press on a dot, or a choice in the list, shows that arc on the map.
- ← → on a focused dot step to the arc before or after and keep focus on its dot.
- No counts, no "3 of 7": the dots and the list say where the arc sits.
