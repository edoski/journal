# Agenda rows: hybrid

`hybrid-rows.tsx`, `data-slot` `hybrid-rows`; lines `today-line`, the pie `today-progress`, the recency `today-when`, the reason `today-why`.

Thesis: Edo liked progress, recency and reason (13 Nov 2026) and asked for one row that holds all three, each sharpened to mean something to him. Each fact sits beside the thing it is about: the pie and the recency belong to the course, the reason to the lesson.

| Part | Notes |
|---|---|
| row | 64px, radius 8 bleeding 12 past the column, hover `fill-hover`; no surface; a 1px `border` at 50% hairline above every row but the first, the column's width |
| pie | 16, centred on both lines, muted ink: how much of the course he can do on his own |
| course line | 12 muted: the course, then " · Studied 2 days ago" |
| lesson line | 13 at 500 in ink: the lesson; at its end, on its baseline, the reason, 13 muted (a waiting session in `link`), up to 256 wide |

## What each fact means

- **Progress** (`courseProgress`): the topics he can do on his own, of all the course's topics. "On his own" is the engine's level `independent` or better (`retained`, `transferred`), and not marked weak by the engine. It is what he could do in the exam today. Topics only taught, tried or done with help do not count; a topic he could do but now slips (weak) leaves the pie until he wins it back. The pie drew "topics past new" before; that counted a topic he had only been shown as progress.
- **Recency** (`lastStudied`, the engine's `lastActiveDaysAgo`): how long since he last studied the course, any topic in it. It tells him a course has gone quiet. It changes nothing else: forgetting is the reviews' job, and the reason says when one is fading. It is the last tie-break in Today's order (`byUrgency`), as before.
- **Reason** (`whyNow`): why the line is on Today now (reason/reason.md).

## Order

Unchanged (today.md): a reply waiting on him first, then courses in the exam run-up, nearest exam first, then the most recently studied.

Trade-offs: the richest row of the four, at 64px against 52; four courses still fit 1024×700 with no page scroll. The pie has no number: its words are for a screen reader, and the definition lives here.
