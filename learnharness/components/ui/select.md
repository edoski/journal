# Select

One value from a short fixed list, shown in a field: the connection dialogs' account and prompt choices. `select.tsx`, shadcn's Radix select; `data-slot` `select`, `select-trigger`, `select-value`, `select-content`, `select-item`, `select-item-indicator`, `select-label`, `select-separator`. Overlay rules: `overlay.md`. A choice with actions in it ("New course…") is a dropdown menu instead.

## Anatomy

| Slot | Notes |
|---|---|
| trigger `default` | 36px, radius 8, 1px `input` edge, padding 0 12, 14/20; muted 14px chevron |
| trigger `sm` | 28px, padding 0 6 0 8, 13/18: the settings rows' field |
| content | the menu surface (`menu.md`), below the trigger and at least as wide (`position="popper"`), capped at the space Radix measures |
| item | 32px row, the chosen one on `fill-selected` with a 14px check at the right |

## States

Trigger: hover `fill-hover`, 2px `ring` on keyboard focus, placeholder muted, disabled 50%. Items as in `dropdown-menu.md`.

## Sources

shadcn select (sizes `sm` and `default`), the settings kit's 28px field (`settings.md`), Apple HIG pop-up buttons.
