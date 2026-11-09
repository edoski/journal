# Alert dialog

A confirmation: delete a session or notes, abort a turn, disconnect. `alert-dialog.tsx`, shadcn's Radix alert dialog on the dialog anatomy (`dialog.md`); `data-slot` `alert-dialog-*`. Only its buttons or Esc close it, never a click outside.

| Slot | Notes |
|---|---|
| overlay | fixed, black 50%, z 50 |
| content | centred, `popover` fill, 1px edge, radius 12, padding 24, slots 16 apart, `shadow-2xl`, max width 512 |
| title | 18/24 at 600 |
| description | 14/20 muted |
| footer | right-aligned, 8 apart: `AlertDialogCancel` (quiet) then `AlertDialogAction` (`default`, or `destructive` when it deletes) |

Esc closes it and stops there (`overlay.md`). Sources: shadcn alert-dialog, Apple HIG alerts (one default action, destructive actions named by what they do).
