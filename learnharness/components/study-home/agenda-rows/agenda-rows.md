# Agenda rows

Three candidates for how a line of agenda's Today reads, behind the Rows switch (`design-variant.ts`, group `rows`, which wears Home's `agenda`). Current is the line after Edo's cuts of 12 Nov 2026: course and lesson only (today.md). `today.tsx` branches once on the switch; each candidate is one folder with its spec. Edo picks one; the others are deleted with their folders.

| Option | Thesis | The signal on a row | Delineation | Spec |
|---|---|---|---|---|
| `reason` | every row says why it is there now | "Waiting for your reply", "You missed Chain rule last time", "Starting to fade", "Left off at part (c)…", "Next on your map" | one quiet panel, hairlines inset to the text | reason/reason.md |
| `recency` | a row is a thread, as in Mail and T3 Code | when he last studied the course: "Studied 2 days ago" (a waiting session says "Waiting for your reply") | two lines, hairlines between rows, no container | recency/recency.md |

## Shared

`row-facts.ts` holds what the candidates read, engine fields only, each pure and tested (`tests/study-home.test.tsx`): `whyNow` (a session's age from its `updatedAt`; a review's lapse from `signals.lapsed`, else its most overdue `review.overdue`; an open task's `step`; the current topic), `lastStudied` (`lastActiveDaysAgo`), `courseProgress` (topics past `new`, of the map's topics), `foldLines` (past five courses, "Also today"). `line-target.tsx` makes a whole line one control (a link to a waiting session, or Continue); `today-also.tsx` is the overflow line.

## The signal test

Every word on a row must read at a glance to someone back after several days who remembers none of the system's internals, and help him choose what to study now. "Exam in N days", "Then …" and "Steps 2–3 of 5" failed it (Edo, 12 Nov 2026) and stay off every candidate. What the engine has no field for (how long a lesson takes, the question he was last asked in a course) is left out, not guessed.

## Sources

The ranked facts and the three directions come from the lesson-list research of 12 Nov 2026: T3 Code's thread row (`SidebarThreadRow`, two lines, a trailing time), Apple's inset grouped lists and SwiftUI separator insets, shadcn `Item` and `Separator`, Raycast's list accessories, Duolingo's "Review previous mistakes", Mochi's "how likely you are to forget", and Things' project progress pie.
