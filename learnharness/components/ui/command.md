# Command

The searchable list inside a picker popover: models, providers. `command.tsx`, shadcn's cmdk command; `data-slot` `command`, `command-input-wrapper`, `command-input`, `command-list`, `command-empty`, `command-group`, `command-item`, `command-separator`, `command-shortcut`. Focus stays in the search; ↑/↓ walk the rows and Enter picks. A list with its own ranking passes `shouldFilter={false}` and orders its items itself.

## Anatomy

| Slot | Notes |
|---|---|
| input | a 32px borderless line, 14px muted glass, 13px text, over a hairline, 4 below |
| list | up to 288 tall, scrolls |
| item | 32px row; `size="tall"` grows it to name over details (6 8 padding, 2 apart) |
| empty | 12/16 muted line |
| shortcut | trailing 12/16 muted tabular figures |

## States

| State | Fill |
|---|---|
| walked (`data-selected`) | `fill-hover` |
| current value (`checked`) | `fill-selected`, held under the walk |
| disabled | 50% opacity |

## Sources

shadcn command and combobox (Popover + Command), cmdk, Raycast and Spotlight (a hairline search line), `menu.md`.
