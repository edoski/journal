# Agenda rows

How a line of agenda's Today reads: the hybrid rows (`hybrid/hybrid.md`), the pie by the course, "2d ago" at the end of the course line, the reason as an icon and a few words at the end of the lesson line, both flush right. `today.tsx` draws them with no switch.

Four candidates ran behind a Rows switch: `reason` (every row says why it is there now, as a sentence), `recency` (a row is a thread, "Studied 2 days ago"), `progress` (each course a tile with a pie that fills) and `hybrid`, against the course-and-lesson line of 12 Nov 2026. Edo picked hybrid on 13 Nov 2026, and the other three, the old line and the switch were deleted.

## Shared

`row-facts.ts` holds what the rows read, engine fields only, each pure and tested (`tests/study-home.test.tsx`): `whyOf` (a session waiting on him; a review's lapse from `signals.lapsed`, else its most overdue `review.overdue`; an open task's `step`; the current topic), `studiedAgo` (a session line's last turn; none on a course's line), `lastStudied` (`lastActiveDaysAgo`, the course page's), `courseProgress` (topics he can do on his own, `independent` or better and not weak, of the map's topics), `foldLines` (past five courses, "Also today"). `progress-ring.tsx` draws `courseProgress` as the course's ring (`../../ui/pie.md`), never a topic's pie. `line-target.tsx` makes a whole line one control (a link to a waiting session, or Continue); `today-also.tsx` is the overflow line.

## The signal test

Every word on a row must read at a glance to someone back after several days who remembers none of the system's internals, and help him choose what to study now. "Exam in N days", "Then …" and "Steps 2–3 of 5" failed it (Edo, 12 Nov 2026) and stay off the rows. What the engine has no field for (how long a lesson takes, the question he was last asked in a course) is left out, not guessed.

## Sources

The ranked facts come from the lesson-list research of 12 Nov 2026: T3 Code's thread row (`SidebarThreadRow`, two lines, a trailing time), Apple's inset grouped lists and SwiftUI separator insets, shadcn `Item` and `Separator`, Raycast's list accessories, Duolingo's "Review previous mistakes", Mochi's "how likely you are to forget", and Things' project progress pie.
