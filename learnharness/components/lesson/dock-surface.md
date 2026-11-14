# Dock surface

`DOCK_SURFACE` (`components/lesson/dock-surface.ts`): the class string every dock occupant draws, with `data-slot="dock-surface"` on its root (the composer keeps its own `data-slot="composer"`).

| Property | Value |
|---|---|
| radius | 20 |
| edge | 1px `border` (white 8%) |
| fill | `card` |
| shadow | `shadow-xs` |
| field focused | 1px `ring` outline at 50% over the edge (`has-[textarea:focus]`) |

Inside: content padding 16 (question, problem), the answer field borderless on the same surface, a toolbar row with padding 8 (controls left, the primary action right). The occupants: the New lesson composer (`composer.tsx`) and the course-link banner (`course-link-banner.tsx`). The lesson's own composer is `lesson/lesson-composer.tsx`.

Sources: T3 Code and Claude desktop composers (radius 20, muted controls inside, one primary action), research/agent-apps.md; findings 17 ("one rounded surface, 12 to 20").
