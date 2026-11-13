# Agenda rows

How a line of Today reads, behind the Rows switch (`design-variant.ts`, group `rows`, which wears Home's Proposed). Current is the line after Edo's cuts of 12 Nov 2026: course and lesson only (today.md). Proposed is the hybrid row: progress, recency and reason, each beside what it is about (hybrid/hybrid.md). On 13 Nov 2026 Edo picked hybrid; the reason, recency and progress rows were deleted.

## Shared

`row-facts.ts` holds what the rows read, engine fields only, each pure and tested (`tests/study-home.test.tsx`): `whyOf` and its sentence `whyNow` (a session's age from its `updatedAt`; a review's lapse from `signals.lapsed`, else its most overdue `review.overdue`; an open task's `step`; the current topic), `lastStudied` and the short `studiedAgo` (`lastActiveDaysAgo`), `courseProgress` (topics he can do on his own, `independent` or better and not weak, of the map's topics), `foldLines` (past five courses, "Also today"). `line-target.tsx` makes a whole line one control (a link to a waiting session, or Continue); `today-also.tsx` is the overflow line.

## The signal test

Every word on a row must read at a glance to someone back after several days who remembers none of the system's internals, and help him choose what to study now. "Exam in N days", "Then …" and "Steps 2–3 of 5" failed it (Edo, 12 Nov 2026) and stay off the rows. What the engine has no field for (how long a lesson takes, the question he was last asked in a course) is left out, not guessed.

## Sources

The ranked facts come from the lesson-list research of 12 Nov 2026: T3 Code's thread row (`SidebarThreadRow`, two lines, a trailing time), Apple's inset grouped lists and SwiftUI separator insets, shadcn `Item` and `Separator`, Raycast's list accessories, Duolingo's "Review previous mistakes", Mochi's "how likely you are to forget", and Things' project progress pie.
