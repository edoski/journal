# Dialog

One anatomy for every modal: Settings (its own two-pane frame in the same content), setup, the subscription connection dialogs and the keyboard cheat sheet; the confirmations (delete session, delete notes, abort turn) use the same anatomy on `AlertDialog` (alert-dialog.md). `components/ui/dialog.tsx` is shadcn's Radix Dialog; `data-slot` per shadcn (`dialog-overlay`, `dialog-content`, `dialog-header`, `dialog-title`, `dialog-description`, `dialog-footer`, `dialog-close`).

Radix owns the portal, the focus trap, the scroll lock, Esc and the click on the dimmed layer. The menus, selects and popovers inside a dialog are Radix layers too, so a click in one counts as inside and the first Esc closes only it (overlay.md). On close, focus goes back to what held it when the dialog opened, a button or menu that opened it, since Radix returns focus only to its own `DialogTrigger` and the app's dialogs open from buttons, menus and shortcuts (`openerReturn`, overlay.ts; round 6: Settings and the cheat sheet left focus on the page); with nothing to go back to, it lands in the composer. A dialog stays rendered and closes through Radix's `open`, so Radix keeps the content through its exit animation; a dialog about something (a lesson to delete, a course to rename) takes it or null, and `useDialogSubject` (overlay.ts) keeps showing the last one while it fades and gives each opening fresh state. A dialog without a visible title still renders a `DialogTitle` (`sr-only`); one without a description passes `aria-describedby={undefined}`.

## Anatomy

| Slot | Notes |
|---|---|
| overlay | fixed, black 50%, centres the panel, padding 16 |
| content | centred, `popover` fill (the raised surface), 1px `border` (white 8%), radius 12, padding 24, slots 16 apart, `shadow-2xl`, max width 512 unless the dialog sets its own; 150ms fade and zoom in, none under reduced motion; z 50 with `lh-no-drag` |
| header | title over description, 8 apart; leaves 32 at the right for the close button |
| title | 18/24 at 600, sentence case |
| description | 14/20, `muted-foreground` |
| body | the dialog's own fields: `Input`, `Select` and rows at 13–14px |
| footer | right-aligned, 8 apart: quiet secondary actions, then one primary (`Button` default, the accent) or, for a destructive confirmation, one `destructive` button |
| close | optional quiet 32px ✕ at top 16, right 16 (`DialogClose`, a Radix Close) |

## Sources

shadcn dialog (padding 24, gap 16, title 18 semibold, description 14 muted, footer right-aligned), Apple HIG alerts (one default action, destructive actions named by what they do), the polish plan's "one dialog anatomy" (plan.md, surfaces 5).
