# Dialog

One anatomy for every modal under the Proposed design: Settings (its own two-pane frame on the same surface), setup, New course, delete session, delete notes, abort turn, the subscription connection dialogs and the keyboard cheat sheet. `components/ui/dialog.tsx`; `data-slot` per shadcn (`dialog-overlay`, `dialog-content`, `dialog-header`, `dialog-title`, `dialog-description`, `dialog-footer`, `dialog-close`).

Presentational only: shadcn's slots and classes without Radix Dialog's behaviour. Each dialog keeps its portal, `useBackdropDismiss` and its Esc listener, because Radix's outside-click layer would treat the app's portalled menus (MenuShell) as outside the dialog and close it, and its Esc would break the one-Esc rule (one press, one action).

## Anatomy

| Slot | Notes |
|---|---|
| overlay | fixed, black 50%, centres the panel, padding 16 |
| content | `popover` fill (the raised surface), 1px `border` (white 8%), radius 12, padding 24, slots 16 apart, `shadow-2xl`, max width 512 unless the dialog sets its own; 150ms fade-in (`settings-dialog-pop`), none under reduced motion |
| header | title over description, 8 apart; leaves 32 at the right for the close button |
| title | 18/24 at 600, sentence case |
| description | 14/20, `muted-foreground` |
| body | the dialog's own fields: `Input`, `select` and rows at 13–14px |
| footer | right-aligned, 8 apart: quiet secondary actions, then one primary (`Button` default, the accent) or, for a destructive confirmation, one `destructive` button |
| close | optional quiet 32px ✕ at top 16, right 16 |

## Sources

shadcn dialog (padding 24, gap 16, title 18 semibold, description 14 muted, footer right-aligned), Apple HIG alerts (one default action, destructive actions named by what they do), the polish plan's "one dialog anatomy" (plan.md, surfaces 5).
