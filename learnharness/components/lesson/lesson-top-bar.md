# LessonTopBar and LessonDetails

The session's top bar, rendered in the shared `TopBar` at `size="slim"` (52px, padding 0 16).

## Anatomy, left to right

| Slot | Notes |
|---|---|
| sidebar toggle | `TopBar`'s own, only while the sidebar is closed |
| course | 14 `muted-foreground`, first, at most 160px, truncates before the title does (`shrink-[2]`), then a 14px chevron at 60%. It is a link to the course's page (`courseHref`, components/course-page/course-page.md), lifting to full ink on hover as shadcn's breadcrumb link does, with a 2px focus ring; with no course page to open it stays plain text |
| title | 14 at 500 (`text-control font-medium`), after the course as T3 Code's breadcrumb does (project › thread); truncates; a click (or F2) renames it in place, the input in the same style |
| phase | 13/18 `muted-foreground`, sentence case ("Probing", "Planning", "Teaching", "Practice"); not interactive |
| plan toggle | quiet button, 32px, 16px waypoints icon and "Plan" at 13/400; `data-slot="plan-toggle"`; the trigger of the plan popover (plan-map.md, popover.md), right-aligned under it |
| details | quiet 32px icon button (ellipsis), the trigger of the details popover |

## Details panel

A `Popover` (components/ui/popover.md), 352px, padding 12, right-aligned under its button. A two-column list at 13/18: Model (plain text, "Claude Opus 5.5": every agent runs it at high effort and nothing chooses it, owner 2026-11-14), Context ("19.4k / 1M", the denominator the model's window from GET /api/models), Cost, and in teaching sessions Notes extracted (the coverage ring, whose numbers open in a nested popover). The content is force-mounted and hidden while closed; a closed panel never takes Esc. ⌘K opens the panel. Esc or a click outside closes the topmost layer only (components/ui/overlay.md).

## Sources

T3 Code's 52px top bar and 13px secondary text; the owner's decision to take tokens, cost, model and thinking level out of the lesson into "one small details disclosure" (findings, binding decisions; findings 16).
