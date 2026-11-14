# Agenda rows: hybrid

`hybrid-rows.tsx`, `data-slot` `hybrid-rows`; lines `today-line`, the ring `today-progress`, the recency `today-when`, the reason `today-why`.

Thesis: Edo liked progress, recency and reason (13 Nov 2026) and asked for one row that holds all three, each sharpened to mean something to him. Each fact sits beside the thing it is about: the pie and the recency belong to the course, the reason to the lesson. He picked it the same day over the other row candidates and the course-and-lesson line, so it is Today's only row (agenda-rows.md).

| Part | Notes |
|---|---|
| row | 64px, radius 8 bleeding 12 past the column, hover `fill-hover` (and the line Home's map follows, only while he points at it); no surface at rest; a 1px `border` at 50% hairline above every row but the first, the column's width |
| ring | the app's progress ring (`../../../ui/pie.md`), hollow where the topic map's cards draw a filled pie, so a course's share never reads as a topic's standing; 16, centred on both lines, muted ink: how much of the course he can do on his own; on hover a shadcn tooltip gives the count, "20 of 24 topics on your own" (`courseShareWords`) |
| course line | 12 muted: the course alone, never its arc (Edo, 14 Nov 2026: the arc after the course name "just looks bad"; the arc a row sits in shows on Home's map instead); at its end, flush right, how long since he studied it, "2d ago" (`studiedAgo`: "Today", "Yesterday", "3d ago", "40d ago", always days; nothing for a course never studied) |
| lesson line | 13 at 500 in ink: the lesson; at its end, flush right, the reason as a 14px icon and a few words, 12 muted (`whyOf`'s `short`), up to 224 wide |
| reason icons | `WhyMark` at size `row` (`../why-mark.md`), one per kind (`WHY_ICON`): a turn that waits, the sidebar's question bubble and "Your turn" in `link` at 500; the tutor writing, a pen and "Tutor writing"; a turn cut off mid-reply (a restart or his stop), a pause mark and "Reply cut off"; a review, the sidebar's History icon and "Due today", "3d overdue" or "16d overdue"; a miss, a crossed circle and "Not right last time: Chain rule"; an open task, a bookmark and "At part (c)" or "Unfinished"; the next topic, an arrow and "Next up"; a new topic, why the plan starts it now, cut to fit (`startsWhyShort`): an arrow and "Next in Matrices", a turn-down arrow and "After Expectation", a fast-forward and "Early, from Orthogonality" (`STARTS_ICON`), only while it fits on one line; cut, the row says "Planned today" or "Next up" with the arrow as before, and the topic page keeps the whole sentence. Never on the course line |
| right edge | both ends sit flush right, so recency and reason each line up down the list (Edo, 13 Nov 2026: "aligned across the rows") |

## What each fact means

- **Progress** (`courseProgress`): the topics he can do on his own, of all the course's topics. "On his own" is the engine's level `independent` or better (`retained`, `transferred`), and not marked weak by the engine. It is what he could do in the exam today. Topics only taught, tried or done with help do not count; a topic he could do but now slips (weak) leaves the pie until he wins it back. The pie drew "topics past new" before; that counted a topic he had only been shown as progress.
- **Recency** (`studiedAgo`): one clock per row. A course's line says how long since he last studied the course, any topic in it (`lastActiveDaysAgo`: the engine's last study or a session he wrote in, whichever is later, so a course studied minutes ago reads Today). A session's line says when he last wrote in that session. An open task's line leaves it empty, since its reason already dates it ("Left off 2d ago"): a row never shows "Today" above "Left off 2d ago". It tells him a course has gone quiet. It changes nothing else: forgetting is the reviews' job, and the reason says when one is overdue. It is the last tie-break in Today's order (`byUrgency`), as before.
- **Reason** (`whyOf`): why the line is on Today now, by kind, as the few words drawn here. The reason candidate's full sentences were "too much text" (Edo, 13 Nov 2026), so they went for icons.

## Order

Unchanged (today.md): a reply waiting on him first, then courses in the exam run-up, nearest exam first, then the most recently studied.

Trade-offs: the richest row of the candidates, at 64px against the old line's 52; four courses still fit 1024×700 with no page scroll. The pie has no number: its words are for a screen reader, and the definition lives here.
