# EventCalendarViews

FullCalendar v7 as shadcn installs it (`npx shadcn@latest add @fullcalendar/monarch-event-calendar`, the monarch flavour): `event-calendar-views.tsx` sets every class-name hook of the day grid, time grid, list and multi-month views on the shadcn tokens, and `event-calendar-icons.tsx` gives the popover's close icon. Kept as the registry wrote them, so a re-add updates them; callers pass their own hooks as props, which win over these. The registry's toolbar wrapper and demo were removed: the calendar page draws its own toolbar (`components/calendar/calendar.md`).

Its structural stylesheet is imported once by `app/globals.css` in the base layer, so Tailwind utilities win over it (the registry's own advice).

| Prop | Notes |
|---|---|
| `controller` | `useCalendarController()`: today, prev, next, changeView, and the view's range for a toolbar |
| `plugins` | the views to load; the calendar page loads the day grid only |
| `views.dayGrid` | per-view hooks, merged over the registry's row classes |
| `popoverCloseContent` | required: the More popover's close icon |

Sources: fullcalendar.io/docs/shadcn, fullcalendar.io/docs/react.
