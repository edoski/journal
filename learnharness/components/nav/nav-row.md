# NavRow

The sidebar's one row: navigation (Today, Knowledge, New lesson, Settings) and sessions alike. `data-slot="nav-row"`.

## Anatomy

| Slot | Element | Notes |
|---|---|---|
| root | `NavRow` (`button`, or the child with `asChild`) | 32px high, radius 8, padding 0 8, gap 8 |
| icon | a lucide icon as a direct child | 16px, one stroke (lucide 2 at 24 = 1.33px) |
| label | `NavRowLabel` | 13/18, weight 400, truncates |
| trailing | `NavRowTrailing` | 12/16, tabular figures, right column: a relative time, a status dot, a 16px glyph |

A row may also carry an absolutely placed 24px action (`Button size="icon-inline"`) at its right edge, as the New lesson row does for practice; the row then pads its label clear of it.

## States

| State | Fill | Ink |
|---|---|---|
| rest | none | `muted-foreground` (#a1a1a1, 7.2:1 on #121212) |
| hover | `fill-hover` (white 4%) | `foreground` |
| active (`active`) | `fill-selected` (white 7%) | `foreground` |
| keyboard walk (`highlighted`) | `fill-hover` | `foreground` |
| focus-visible | 2px `ring` | unchanged |

No weight change in any state. Colour transitions 150ms, off under reduced motion. Pointer clicks blur the row (`blurAfterPointerClick`), so a later key press never lights its focus ring.

## Sources

Row 32, radius 8, padding 8, icon 16, gap 8: shadcn sidebar, Primer ActionList, T3 Code (h-8, radius 8). Label 13: Apple macOS body, T3 Code. Trailing 12 tabular in its own column: shadcn badge, Primer trailing visual. Muted until hover, fill steps not weight: Linear 2024, Geist steps, Rauno. See `~/.claude/skills/polish/references/targets.md` (navigation sidebar).
