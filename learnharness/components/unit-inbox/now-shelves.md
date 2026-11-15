# Now shelves

The shelves at the sidebar's foot, under Today (`unit-inbox.md`, "Today on top"). `now-shelves.tsx` (`NowShelves`) draws `restShelves` (`now-inbox.ts`) on `UnitShelf`; `now-skeleton.tsx` (`NowSkeleton`) holds the top's place while the courses are read; `sidebar-note.tsx` (`SidebarNote`) is the list's quiet one-line note.

## Shelves

In this order, after a spacer (`mt-auto`) that rests them at the bottom of a short list. Every shelf starts folded (`lh:topic-sidebar-folded`, Learning added), shows 10 rows open, then "Show 25 more", and keeps the open page's row in view while folded.

| Shelf | Holds | Order | Row | Status |
|---|---|---|---|---|
| Tutor writing | topics the tutor writes in, not on top; only while one runs | the latest first | card (`TopicCard`) | the spinner and Tutor writing |
| Learning | taught and not solid, or solid but weak (a lapse, a mistake to fix), not on top; the course page's Learning holds the same topics | one waiting on him first, then the latest studied | one line (`TopicSlimRow`) | when it comes back (`shelfStatus`): Review (history) while today's review takes it up (`plannedKeys`, Home's `todaysReview`), "in 5d" when the engine has set its date, else how long since he studied it (the newest session, else the day it was first taught, "2w"); a 6px accent dot on the folded header while a hidden topic waits on him |
| On your own | solid and not weak, the topics Home's pie counts (`courseProgress`): the due ones not on top, then the rest | due first (the longest overdue first) with how overdue; then the soonest back, "Back in 5d" | one line | the row's own fact (`shelfStatus`, unit-inbox.md's status slot): "Due since 5 Nov" (history), "Back in 5d" (calendar-clock) |
| Other sessions | sessions on no listed topic and not on top as their own card | newest first | one line, a session | Your turn, the spinner or how long ago in Home's words; a repeated title carries its day; the dot as on Learning |

"On your own" is the course page's group and Home's "N of M on your own", and holds the same topics; the top is the course page's Needs you, and each row says what that page's row says (course-page.md, "The groups") (`tests/now-inbox.test.ts`; the words are `NOW_SHELF_WORDS`).

## States

| State | List |
|---|---|
| loading | `NowSkeleton`: three 60px skeleton cards on the card pitch, `aria-busy`, an sr-only "Loading" |
| nothing needs him | `SidebarNote` "Nothing needs you today", then the shelves |
| no courses | "No courses yet" |
| engine down | the waiting sessions as session cards, then "Couldn’t read your courses", then Other sessions |

`SidebarNote`: `data-slot="sidebar-note"`, 12px muted, centred, 24px above and below.

Sources: T3 Code's sidebar (Working, Snoozed, Settled shelves at the foot, folded; its 12px header); the research for the sidebar's Today (fold with a plan: every shelf row says when it comes back, else when it was studied).
