# Pick-up rows

`PickupRows` (`data-slot="topic-pickups"`), where to pick the topic back up. Props: `{ pickups, busy, onTask }`. Renders nothing for an empty list.

One 64px row per pick-up (`data-slot="topic-pickup"`, `data-kind`), Home's Hybrid row restated (`row-classes.ts`): grid `[1rem minmax(0,1fr) auto]`, `gap-x-4 gap-y-1`, no surface, hover `fill-hover`, bleeding 12px past the column, a `bg-border/50` hairline above every row but the first.

| Slot | Session | Task |
|---|---|---|
| Icon, both lines | `MessageSquareIcon` lesson, `DumbbellIcon` practice, 16px muted | `BookmarkIcon` |
| Line 1 | the session's title, `text-label` muted | the task's title |
| Line 1, right | "Today", "3d ago" (`agoWords`), `tabular-nums` | when the task was last touched, or nothing |
| Line 2 | the step its newest tagged question is about, else, while the tutor writes, "The tutor is writing", else "Problem waiting", else "Question waiting". `text-control font-medium` ink | the task's step, else "Unfinished" |
| Line 2, right | `WhyMark`: "Your turn", or the spinner and "The tutor is writing" (the spinner alone when line 2 already says it) | nothing |
| Press | opens `/chat/<id>` (a link); does nothing while `busy` | `onTask(opening)`: starts a session whose first message is "Continue <task>"; disabled while `busy` |
