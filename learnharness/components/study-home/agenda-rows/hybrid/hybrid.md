# Agenda rows: hybrid

`hybrid-rows.tsx`, `data-slot` `hybrid-rows`; lines `today-line`, the ring `today-progress`, the row's one status as `today-standing` (where he stands) or `today-why` (why the row is there).

Thesis: Edo liked progress, recency and reason (13 Nov 2026) and asked for one row that holds all three, each sharpened to mean something to him. Each fact sits beside the thing it is about: the pie and the recency belong to the course, the reason to the lesson. He picked it the same day over the other row candidates and the course-and-lesson line, so it is Today's only row (agenda-rows.md).

| Part | Notes |
|---|---|
| row | 64px, radius 8 (as every other row with a hover fill: the sidebar's, the course page's, Settings'), bleeding 12 past the column, hover `fill-hover` (and the line Home's map follows, only while he points at it); no surface at rest; a 1px `border` at 50% hairline above every row but the first, the column's width |
| ring | the app's progress ring (`../../../ui/pie.md`), hollow where the topic map's cards draw a filled pie, so a course's share never reads as a topic's standing; 16, centred on both lines, muted ink: how much of the course he can do on his own; on hover a shadcn tooltip gives the count, "20 of 24 topics on your own" (`courseShareWords`). On the Visual system's Proposed the course's badge takes its place (`CourseBadge`): the course's two letters (Title 3, 15px, at 600) on a 40px rounded square spanning both lines, its left edge on the page's, with the course's share as a 2px line running round its edge from twelve o'clock over a faint full track, count on hover. A cold reader took the lone ring for a checkbox; Edo asked for the badge to fill both lines and to keep the progress (15 Nov 2026) |
| course line | 12 muted: the course alone, never its arc (Edo, 14 Nov 2026: the arc after the course name "just looks bad"; the arc a row sits in shows on Home's map instead); nothing at its end: when he last studied a session is no status (round 11, 1 N9 and 1 N12: "Studied today · Mistake to fix · Your turn" on one row, and "Studied today" on a session only opened); the line under Home's heading names what he studied today |
| lesson line | 14 at 500 in ink (`text-control`, the sidebar card's title): the lesson, cut before the status; at its end, flush right, the row's one status (`rowStatus`, "One status" below) as a 14px icon and a few words, 12 muted, whole: its column is as wide as its words (round 11, 1 N14: "Not right last time: Matrix multipli…" cut with half the row empty) |
| reason icons | `WhyMark` at size `row` (`../why-mark.md`), one per kind (`WHY_ICON`): a turn that waits, the sidebar's question bubble and "Your turn" in `link` at 500; the tutor writing, a pen and "Tutor writing"; a turn cut off mid-reply, a pause mark and "Reply cut off" after a restart, "You stopped the tutor" after his stop; a review, the sidebar's History icon and "Due today" or "Due since 5 Nov"; a miss, a crossed circle and "Not right last time: Chain rule"; an open task, a bookmark and "At part (c)" or "Unfinished"; the next topic, an arrow and "Next up"; a new topic, why the plan starts it now, cut to fit (`startsWhyShort`): an arrow and "Next in Matrices", a turn-down arrow and "After Expectation", a fast-forward and "Early, from Orthogonality" (`STARTS_ICON`) only off today's plan, since on the plan's own start it read as a warning (round 9: "Planned today" instead), only while it fits on one line; cut, the row says "Planned today" or "Next up" with the arrow as before, and the topic page keeps the whole sentence. Never on the course line |
| right edge | the status sits flush right, so the statuses line up down the list (Edo, 13 Nov 2026: "aligned across the rows") |

## One status

Edo, 15 Nov 2026, on the first Standing column (its words alone): "feels a bit barebones, needs maybe a standard icon set for it … a bit more detailed somehow but without too much verbosity". Round 11 (1 N9) found rows saying three statuses at once ("Studied today · Mistake to fix · Your turn"), so a row says one (`rowStatus`, `row-standing.ts`), the first that holds, and the sidebar's card for the line says the same (`NowLine.status`; round 12, 1 m3 and 2 n2: Home said "Mistake to fix" where the sidebar said "Your turn" for one session, and "Check again another day" beside "Due today" for one review):

1. why the row is on Today, since that is what its press opens on: the tutor's own state in a session ("Your turn", "Tutor writing", "Reply cut off"), a miss as the review's reason ("Not right last time: Chain rule"), "Due since 6 Nov", "Planned today", "Left off 6 Nov", "At part (c)"; except a plain "Next up", which says only that the row is on Today;
2. the slip he would act on, its one topic's ("Check on your own", "Mistake to fix", "Mixed up with Gaussian elimination", from `slipBeside`, the rule the sidebar and the topic page's head read); the pie keeps a slip's warning ink under a reason too;
3. where he stands on its one topic (`standingOf`), exactly what the map card and the topic page's head say beside the same pie.

| Part | Notes |
|---|---|
| standing (`today-standing`) | the topic map's pie (`TopicGlyph`, the same fill and warning ink as the topic's card) at 14, 6px, then its words (`rowWords`). Only on a row of one topic he has started: a row of several topics (a problem sheet) has no one standing, and a topic not started reads "Start …" (a cold read took "Not started" beside it for one fact said twice). The warning ink says the topic slips, so the row never adds "Slipping" beside its slip (round 10, 1 m4) |
| reason (`today-why`) | `WhyMark` at size `row`, `whole` (`../why-mark.md`) |

What was left off, by the signal test: the review's day (the reason says "Due since" when it is due today; a later day changes nothing he picks now), the day it was first taught, counts of answers, and anything the engine does not record. The research behind it (15 Nov 2026): Linear's issue rows (a status icon set, trailing properties as icons with colour only beside words), Things' project pie, Anki's deck columns, Math Academy's topic states, Primer's ActionList grid, Apple's lists and SF Symbols guidance.

## What each fact means

- **Progress** (`courseProgress`): the topics he can do on his own, of all the course's topics. "On his own" is the engine's level `independent` or better (`retained`, `transferred`), and not marked weak by the engine. It is what he could do in the exam today. Topics only taught, tried or done with help do not count; a topic he could do but now slips (weak) leaves the pie until he wins it back. The pie drew "topics past new" before; that counted a topic he had only been shown as progress.
- **Recency**: no row says when he last studied it (round 11, 1 N9). Home's "Studied today" line names what he studied today, a lesson left on an earlier day says it in its reason ("Left off 6 Nov"), and the course's last study stays the last tie-break in Today's order (`byUrgency`) and the course page's "Studied" line.
- **Reason** (`whyOf`): why the line is on Today now, by kind, as the few words drawn here. The reason candidate's full sentences were "too much text" (Edo, 13 Nov 2026), so they went for icons.

## Order

As today.md says: the plan first (each course's review and new topics for today), courses in the exam run-up first, nearest exam first, then the most recently studied; then the sessions waiting on him, then open tasks and lessons left for next time.

Trade-offs: the richest row of the candidates, at 64px against the old line's 52; four courses still fit 1024×700 with no page scroll. The pie has no number: its words are for a screen reader, and the definition lives here.
