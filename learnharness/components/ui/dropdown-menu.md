# Dropdown menu

A menu of actions or one choice opened from a button: the course picker, the thinking level. `dropdown-menu.tsx`, shadcn's Radix dropdown menu drawing the menu anatomy (`menu.md`). It exports the shared class strings (`MENU_CONTENT`, `MENU_ROW`, `MENU_ROW_CHECKED`, `MENU_ROW_DESTRUCTIVE`, `MENU_LABEL`, `MENU_SEPARATOR`, `MENU_SHORTCUT`, `MENU_INDICATOR`) that `context-menu`, `select` and `command` reuse. Overlay rules: `overlay.md`.

## Anatomy

| Slot | `data-slot` | Notes |
|---|---|---|
| content | `dropdown-menu-content` | `popover` fill, 1px edge, radius 12, padding 4, 13/18, `shadow-lg`, min width 128, capped at the space Radix measures |
| item | `dropdown-menu-item` | 32px, radius 8, padding 0 8, gap 8, 16px muted icon; `variant="destructive"` reads `danger` |
| radio and checkbox item | `dropdown-menu-radio-item`, `dropdown-menu-checkbox-item` | the chosen row on `fill-selected` with a 14px check at the right; `indicator={false}` where trailing text already marks the row |
| label | `dropdown-menu-label` | 12/16 at 500, muted |
| separator | `dropdown-menu-separator` | hairline to the edges, 4 above and below |
| shortcut | `dropdown-menu-shortcut` | trailing 12/16 muted tabular figures: a count, a price, a key |

## States

| State | Fill |
|---|---|
| highlighted (pointer or arrow keys) | `fill-hover` (white 4%) |
| chosen | `fill-selected` (white 7%), held under the pointer |
| disabled | 50% opacity |

No weight change in any state; colour transitions 150ms, off under reduced motion.

## Sources

shadcn dropdown-menu (32px rows in v4, radius inside a 4 inset), Radix Themes, macOS menus (fill steps rather than rings, check at the trailing edge), `menu.md`.
