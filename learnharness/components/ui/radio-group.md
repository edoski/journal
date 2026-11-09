# Radio group

One choice from a visible set: a single-select question's options. `radio-group.tsx`, shadcn's Radix radio group; `data-slot` `radio-group`, `radio-group-item`, `radio-group-indicator`. The arrow keys move the choice.

| State | Look |
|---|---|
| clear | 16px circle, 1px inset `muted-foreground` ring |
| chosen | `primary` fill, white 6px dot |
| focus | 2px `ring`, offset 2 |
| disabled | 50% |

A choice row wraps the item and its `Label` in a 13–16px row on the row fills (`fill-hover`, `fill-selected` when chosen). Sources: shadcn radio-group, the question dock's markers.
