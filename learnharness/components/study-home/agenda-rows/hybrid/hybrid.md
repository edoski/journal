# Agenda rows: hybrid

`hybrid-rows.tsx`, `data-slot` `hybrid-rows`; lines `today-line`, the pie `today-progress`, the recency `today-when`, the reason `today-why`.

Thesis: Edo liked progress, recency and reason (13 Nov 2026) and asked for one row that holds all three, each sharpened to mean something to him. Each fact sits beside the thing it is about: the pie and the recency belong to the course, the reason to the lesson.

| Part | Notes |
|---|---|
| row | 64px, radius 8 bleeding 12 past the column, hover `fill-hover`; no surface; a 1px `border` at 50% hairline above every row but the first, the column's width |
| pie | 16, centred on both lines, muted ink: how much of the course he can do on his own; on hover a shadcn tooltip gives the count, "20 of 24 topics you can do on your own" |
| course line | 12 muted: the course; at its end, flush right, how long since he studied it, "2d ago" (`studiedAgo`: "Today", "Yesterday", "3d ago", "2w ago", "3mo ago"; nothing for a course never studied) |
| lesson line | 13 at 500 in ink: the lesson; at its end, flush right, the reason as a 14px icon and a few words, 12 muted (`whyOf`'s `short`), up to 224 wide |
| reason icons | `WhyMark` at size `row` (`../why-mark.md`), one per kind (`WHY_ICON`): a turn that waits, the sidebar's question bubble and "Your turn" in `link` at 500; a review, the sidebar's History icon and "Due today", "3d overdue" or "2w overdue"; a miss, a crossed circle and "Missed Chain rule"; an open task, a bookmark and "At part (c)" or "Unfinished"; the next topic, an arrow and "Next up" |
| right edge | both ends sit flush right, so recency and reason each line up down the list (Edo, 13 Nov 2026: "aligned across the rows") |

## What each fact means

- **Progress** (`courseProgress`): the topics he can do on his own, of all the course's topics. "On his own" is the engine's level `independent` or better (`retained`, `transferred`), and not marked weak by the engine. It is what he could do in the exam today. Topics only taught, tried or done with help do not count; a topic he could do but now slips (weak) leaves the pie until he wins it back. The pie drew "topics past new" before; that counted a topic he had only been shown as progress.
- **Recency** (`studiedAgo`, the engine's `lastActiveDaysAgo`): how long since he last studied the course, any topic in it. It tells him a course has gone quiet. It changes nothing else: forgetting is the reviews' job, and the reason says when one is overdue. It is the last tie-break in Today's order (`byUrgency`), as before.
- **Reason** (`whyOf`): why the line is on Today now, by kind, as a full sentence (reason/reason.md draws it) and as the few words drawn here. Edo found the sentences "too much text" (13 Nov 2026) and asked for icons.

## Order

Unchanged (today.md): a reply waiting on him first, then courses in the exam run-up, nearest exam first, then the most recently studied.

Trade-offs: the richest row of the four, at 64px against 52; four courses still fit 1024×700 with no page scroll. The pie has no number: its words are for a screen reader, and the definition lives here.
