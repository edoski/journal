# Sheet

`components/ui/sheet.tsx`: shadcn's Radix sheet (a Dialog that slides in from the window's right edge) on the dialog's tokens, for work done beside the page: the course page's Context first. `data-slot` per shadcn (`sheet-overlay`, `sheet-content`, `sheet-header`, `sheet-title`, `sheet-description`, `sheet-close`).

| Slot | Notes |
|---|---|
| overlay | black 40%, lighter than a dialog's 50% so the page stays readable; z 50 with `lh-no-drag` |
| content | full height at the right edge, max width 448 unless set, the `popover` fill, a hairline on its left, `shadow-2xl`; 200ms slide in, none under reduced motion |
| header | padding 24, 56 clear at the right for the close; title 18/24 at 600, description 14/20 muted |
| close | the quiet 32px ✕ at top 16, right 16 |

Radix owns the focus trap, the scroll lock, Esc (one Esc closes one layer, `claimEscape`) and the click outside.

## Sources

shadcn sheet (side right, `sm:max-w-sm` and up), Apple HIG panels and sheets (supplementary content beside the main task), NN/g modal and nonmodal dialogs.
