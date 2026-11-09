# Menu

The anatomy every dropdown, context menu and picker draws under the Proposed design: the sidebar's session menu, the knowledge graph's node menu, the model, thinking, provider and font pickers in Settings, setup and the lesson's details. `MenuShell` (components/menu-shell.tsx) owns placement, focus and the arrow-key walk; these class strings (components/ui/menu.ts) own the look.

## Anatomy

| Slot | Constant | Notes |
|---|---|---|
| surface | `MENU_SURFACE` | `popover` fill (#1c1c1c), 1px `border` (white 8%), radius 12, padding 4, 13/18 text, `shadow-lg`; width set by the caller |
| item | `MENU_ITEM` | 32px, radius 8 (12 minus the 4 inset), padding 0 8, gap 8, 16px leading icon |
| two-line item | `MENU_ITEM` + `MENU_ITEM_TALL` | name 13/18 over details 12/16 (`MENU_DETAIL`), padding 6 8 |
| search | `MENU_SEARCH` | borderless 32px field over a hairline, 13px, muted placeholder |
| separator | `MENU_SEPARATOR` | hairline to the surface's edges, 4 above and below |
| note | `MENU_NOTE` | 12/16 muted: a footer line or an empty state |

## States

| State | Fill | Notes |
|---|---|---|
| rest | none | `popover-foreground` |
| hover, keyboard focus | `fill-hover` (white 4%) | `MENU_ITEM_WALKED` for the search's ↑/↓ walk |
| chosen | `fill-selected` (white 7%) | `MENU_ITEM_SELECTED`, plus a 14px check at the right where the list has no other trailing text |
| disabled | none | 50% opacity |

No weight change in any state. Colour transitions 150ms, off under reduced motion. A destructive item uses `text-danger`.

## Sources

Item 32 and radius 8 inside a 12 surface with a 4 inset: shadcn dropdown-menu, Radix Themes, T3 Code's menus (research/agent-apps.md). Fill steps rather than rings for the walked item: Linear, macOS menus. Hairline search line: Raycast, macOS Spotlight.
