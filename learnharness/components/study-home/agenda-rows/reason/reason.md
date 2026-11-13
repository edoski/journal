# Agenda rows: reason

`reason-rows.tsx`, `data-slot` `reason-rows`; lines `today-line`, the reason `today-why`.

Thesis: the one thing a row lacked was why it is there today. Each row now says it, in words that need no memory of the system.

| Part | Notes |
|---|---|
| panel | one surface for the list: `card` (one lightness step above the page), radius 12, padding 4; no border |
| row | 52px, radius 8 (12 minus the 4 inset), hover `fill-hover`; columns: course 144, lesson (fills, truncates), reason (its own width, up to 240, right-aligned); 24 between |
| hairline | 1px `border` at 50% above every row but the first, inset 12 to the text's edges (Apple's separator inset) |
| course | 13 in ink |
| lesson | 13 at 500 in ink |
| reason | 13 muted; a waiting session in `link` (the app's colour for "your turn") |

What the reason says (`whyNow`): "Waiting for your reply" or "Waiting since yesterday"; for a review, "You missed <topic> last time" when the engine marks a lapse, else "Due today", "Overdue by N days" (1 to 6) or "Overdue by a week" / "by N weeks" ("Fading for a week" meant nothing to Edo, 13 Nov 2026); "Left off at <the open task's step>"; "Next on your map".

Trade-offs: the strongest single signal, but the reason column takes width from the lesson, so long reviews truncate sooner; the panel adds a second surface under the map.

Sources: Duolingo ("Review previous mistakes, so they won't trip you up"), Mochi (reviews "based on how likely you are to forget"), Apple inset grouped lists, shadcn `ItemGroup` and `ItemSeparator`.
