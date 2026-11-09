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

One item is a tab stop (Radix roving focus); arrows move between items. Use `type="single"` and ignore the empty value, so one item is always on.

Sources: Apple segmented control (sentence case, the selected segment on a raised fill), T3 Code's muted 12–13px toolbar controls (research/agent-apps.md).
