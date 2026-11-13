# NavRow

The sidebar's one row: navigation (New lesson, Home, Settings), sessions under their course (`NavGroup`, nav-group.md) and, while one runs, background agents alike; the Settings sheet's section list uses it too. `data-slot="nav-row"`, set after the caller's props so a wrapping trigger (the session's context menu) cannot replace it.

## Anatomy

| Slot | Element | Notes |
|---|---|---|
| root | `NavRow` (`button`, or the child with `asChild`) | 32px high, radius 8, padding 0 8, gap 8; `inset` pads the start to 32 so the label sits on a `NavGroup` name's edge |
| icon | a lucide icon as a direct child | 16px, one stroke (lucide 2 at 24 = 1.33px); an inset row has none |
| label | `NavRowLabel` | 13/18, weight 400, truncates |
| trailing | `NavRowTrailing` | one item in a column at least 32px wide and 24px high, right-aligned: 12/16, weight 400, tabular figures, `muted-foreground` whatever the row's state |

The trailing column holds exactly one thing, so every row's last character ends on the same edge (239px in the 256px sidebar). A session's item, by priority: the spinner while the tutor writes, "Your turn" in `link` at 12/500 while the tutor waits on the learner, or how long ago (`now`, `40m`, `3h`, `2d`, `3w`, `4mo`, `1y`). A background agent's item is its elapsed time.

A row may also carry an absolutely placed 24px action (`Button size="icon-inline"`) at its right edge, as a background agent's row does for Stop; the row then pads its label clear of it. A background agent's row shows the session it works for and its elapsed time; a click opens its detail (what it is doing, cost, context, model, steps) under the row in 12px muted text on the label's edge.

## States

| State | Fill | Ink |
|---|---|---|
| rest | none | `muted-foreground` (#a1a1a1, 7.2:1 on #121212) |
| attention (`attention`: the session waits on the learner) | none | `foreground`, weight 500 |
| hover | `fill-hover` (white 4%) | `foreground` |
| active (`active`) | `fill-selected` (white 7%) | `foreground` |
| keyboard walk (`highlighted`) | `fill-hover` | `foreground` |
| focus-visible | 2px `ring` | unchanged |

Hover, selection and the walk never change weight. Attention is the one weight change, and it follows the session's state, not the pointer: a working or finished session stays muted at 400. Colour transitions 150ms, off under reduced motion. Pointer clicks blur the row (`blurAfterPointerClick`), so a later key press never lights its focus ring.

## Sources

Row 32, radius 8, padding 8, icon 16, gap 8: shadcn sidebar, Primer ActionList, T3 Code (h-8, radius 8). Label 13: Apple macOS body, T3 Code. One trailing item in a `min-w-8 h-6 justify-end` column, status in the time's slot, time as `5m`/`2h`/`3d`: T3 Code's thread row (research/design-directions.md 1.2). Weight and full ink for "needs you", muted for working and settled: T3 Code's `Mu` rule (same section). Muted until hover, fill steps not weight: Linear 2024, Geist steps, Rauno. See `~/.claude/skills/polish/references/targets.md` (navigation sidebar).
