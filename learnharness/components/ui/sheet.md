# Sheet

`components/ui/sheet.tsx`: shadcn's Radix sheet (a Dialog that slides in from the window's right edge) on the dialog's tokens, for work done beside the page: the course page's Context first. `data-slot` per shadcn (`sheet-overlay`, `sheet-content`, `sheet-header`, `sheet-title`, `sheet-description`, `sheet-close`).

| Slot | Notes |
|---|---|
| overlay | black 40%, lighter than a dialog's 50% so the page stays readable; fades in 200ms and out 150ms with the panel; z 50 with `lh-no-drag` |
| content | full height at the right edge, max width 448 unless set, the `popover` fill, a hairline on its left, `shadow-2xl`; slides in from the right edge over 200ms (`cubic-bezier(0.32, 0.72, 0, 1)`) and out over 150ms, none under reduced motion |
| header | padding 24, 56 clear at the right for the close; title 18/24 at 600, description 14/20 muted |
| close | the quiet 32px ✕ at top 16, right 16 |

Radix owns the focus trap, the scroll lock, Esc (one Esc closes one layer, `claimEscape`) and the click outside. On close, by Esc, the ✕ or a click outside, focus goes back to what opened the sheet (`openerReturn`, overlay.ts), since its openers are plain buttons and Radix returns focus only to its own `SheetTrigger`.

## Motion

shadcn's own classes through `tw-animate-css` (`app/globals.css`): the panel `slide-in-from-right` and `slide-out-to-right`, its dimmed layer `fade-in-0` and `fade-out-0`, both at `duration-200` in and `duration-150` out. Reduced motion stops them with the app's one rule in `globals.css`, so the panel appears in place.

## Sources

shadcn sheet (side right, `sm:max-w-sm` and up; slide from the edge on open and close), Vaul's drawer curve, Apple HIG panels and sheets (supplementary content beside the main task), NN/g modal and nonmodal dialogs.
