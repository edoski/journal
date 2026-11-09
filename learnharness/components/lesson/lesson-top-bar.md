# LessonTopBar and LessonDetails

The session's top bar under the Proposed design, rendered in the shared `TopBar` at `size="slim"` (52px, padding 0 16).

## Anatomy, left to right

| Slot | Notes |
|---|---|
| sidebar toggle | `TopBar`'s own, only while the sidebar is closed |
| title | 16/26 at 600 (`text-prose font-semibold`), truncates first; a click (or F2) renames it in place, the input in the same style |
| course | 13/18 `muted-foreground`, baseline-aligned after the title, truncates before the title does (`shrink-[2]`) |
| phase | 13/18 `muted-foreground`, sentence case ("Probing", "Planning", "Teaching", "Practice"); not interactive |
| plan toggle | quiet button, 32px, 16px waypoints icon and "Plan" at 13/400; `data-slot="plan-toggle"`; opens the plan panel (plan-map.md) |
| details | quiet 32px icon button (ellipsis) opening the details panel |

## Details panel

352px, `popover` fill, radius 12, padding 12, opening under its button at the right edge. A two-column list at 13/18: Model (the session's `ModelControl` at `variant="proposed"`: two 28px field-style triggers for the model and thinking level, opening menus in the shared anatomy, components/ui/menu.md), Context ("19.4k / 1M"), Cost, and in teaching sessions Notes extracted (the coverage ring). It stays mounted while closed (`hidden`), so the model control keeps reporting the session's model to the send gate. Esc or a click outside closes it; the model menus' own portals count as inside.

## Sources

T3 Code's 52px top bar and 13px secondary text; the owner's decision to take tokens, cost, model and thinking level out of the lesson into "one small details disclosure" (findings, binding decisions; findings 16).
