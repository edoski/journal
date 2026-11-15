# SwatchGrid

A grid of colour swatches to pick one from: the colour fields in Settings → Appearance (`components/settings/controls.tsx`, `ColorField`), inside a `Popover`. `swatch-grid.tsx`, on Radix's single `ToggleGroup` (shadcn ships no colour picker; the toggle group is its primitive for picking one of a set). `data-slot="swatch-grid"`, items `data-slot="swatch"`.

| Slot | Notes |
|---|---|
| grid | `columns` across (`data-columns`), items 4 apart |
| swatch | a 32 round target holding a 20 round chip of the colour with a 1px white 15% edge, named by `aria-label` (the colour's name) |

| State | Look |
|---|---|
| rest | the chip alone |
| hover | `fill-hover` behind the chip |
| picked | a 14px check in black 80% on the chip |
| focus-visible | 2px `ring` round the target |

## Keys

One swatch is the tab stop (Radix roving focus). ← → walk the row (no wrap); ↑ ↓ move a row by `columns`. Enter, Space or a click picks. Moving never picks, so a caller that saves on pick saves once. A press on the picked swatch keeps it picked. A `value` matching no swatch shows none picked.

Sources: Apple's colour wells and the macOS menu-bar colour swatches (named, round, a check on the picked one), WAI-ARIA's grid pattern for ↑ ↓ by row, shadcn toggle group (Radix roving focus).
