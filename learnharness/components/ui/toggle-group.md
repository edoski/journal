# ToggleGroup, segmented variant

shadcn's toggle group (`components/ui/toggle-group.tsx`, `toggle.tsx`, Radix ToggleGroup) with a `segmented` variant and a `segment` size: the Teach / Practice switch in the composer toolbar. `data-slot="toggle-group"`, items `data-slot="toggle-group-item"`.

| Slot | Notes |
|---|---|
| track | a pill: 1px border (white 8%), padding 2, items 2px apart |
| item | 28px pill, padding 0 12, 13px (`text-row`), weight 400 in every state |

| State | Fill | Ink |
|---|---|---|
| rest | none | `muted-foreground` |
| hover | none | `foreground` |
| on | `fill-selected` | `foreground` |
| focus-visible | 2px `ring` | unchanged |

## Pill variant

`variant="pill"`: the arc strip above a course map (`../course-map/arc-strip.tsx`). Separate bubbles 6px apart with no track, so it never reads as the underline tabs of Home's courses above it (Edo, 14 Nov 2026: arcs as bubbles, courses as underline tabs). Sizes `segment` (28px, 13px, the course page) and `segment-sm` (24px, 12px, Home, under its course tabs), and `segment-xs` (20px, 12px) for one arc named in a line of facts (`ArcPill`: the course head, the course page's What next, the topic head), so a line keeps its height. An arc is never named as text ("Course · Arc"): always this pill, or not at all (Edo, 14 Nov 2026).

| State | Fill | Border | Ink |
|---|---|---|---|
| rest | none | 1px `border` | `muted-foreground` |
| hover | `fill-hover` | 1px `border` | `foreground` |
| on | `fill-selected` | none | `foreground` |
| focus-visible | 2px `ring` | unchanged | unchanged |

One item is a tab stop (Radix roving focus); arrows move between items. Use `type="single"` and ignore the empty value, so one item is always on.

Sources: Apple segmented control (sentence case, the selected segment on a raised fill), T3 Code's muted 12–13px toolbar controls (research/agent-apps.md).

The chosen item reads from `aria-checked` and `aria-pressed` as well as `data-state`: a tooltip trigger wrapping an item (the composer's Answer or Ask toggle) writes its own `data-state` over the item's.
