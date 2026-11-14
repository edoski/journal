# Inbox: Today

The sidebar's list (`unit-inbox.md`, "Today on top"), which Edo picked over Topics on 13 Nov 2026. `today/today-top.ts` (`todayTop`, `steadyTop`, `itemKey`, `NowItem`; `tests/inbox-today.test.ts`) and `today/today-list.tsx` (`TodayList`).

Thesis: the sidebar's top is exactly Home's Today. One card per line, in the same order with the same reason: a session's line as the session under the title Home and its header give it, a course's line as the topic it leads with; everything else folds onto the shelves at the foot. The system picks; he never sorts.

## What is on top

| Rule | Source |
|---|---|
| Today's lines (`needsYouNow(...).lines`, under the course filter `nowFor`), in Home's order, at most five; Home's "Also today" lines are not drawn and their topics stay on the shelves | `../study-home/needs-you.ts` |
| A session's line is its session card (`now-card.md`, "The session card"), one per session however many topics its lesson touched; it takes every topic it stands for (its own and those it worked on) off the shelves, so a review of two topics never leaves a second row under Working or Learning (`claimedKeys`) | `todayTop`, `claimedKeys` |
| A course's line with a lead topic is that topic's card (`NowCard`): the inbox's unit, else `unitFor` (a lead not started yet, resting on Learning). The lead is the topic the line's reason is about, so title and reason agree: a lapse's lapsed topic ("Missed last time"), an open task's current topic ("At part (c)" on Rank and the column space, the sheet's topic), else the line's first | `topicUnit` in `now-inbox.ts`; `leadOf` in `../study-home/needs-you.ts` |
| A course line with nothing to take up (step `none`, Home's "Start a lesson") has no card | `todayTop` |
| A topic is listed once, at the first line that leads with it; a topic on top is on no shelf | `restShelves(inbox, keys)` with `itemKey` |

| The lesson he is in keeps its place through a turn: while the tutor writes, its card stays in its slot with the spinner and Working (70% unless it is the open page), its course's own line stays out, and the count holds; session cards drawn before keep their order among themselves, so answering the second does not swap it to the top. A new card comes in where Today puts it; a fresh draw is Today's order | `steadyTop`, with the top as last drawn kept in `TodayList` |

No header, no count and no total on top: cards leave as the day's plan empties, and none moves under his eyes.

## Layout (256px sidebar, the demo)

| Window | Top | Shelves (folded, 32px on a 33px pitch) | Scroll |
|---|---|---|---|
| 1440×900 | five cards from y 81, 60px on a 65px pitch, ending at 405 | Learning 10 at 754, On your own 26 at 787, Other sessions 4 at 820; Working N first while the tutor writes in a topic not on top | none |
| 1100×700 | the same | 554 to 652 | none |
| 1512×982 | the same | 836 to 934 | none |

The demo's cards: Linear Algebra, Your turn, Eigenvalues and eigenvectors (the lesson); Linear Algebra, Your turn, Rank practice; Probability, 3d overdue, Random variables and distributions; Real Analysis, 1w overdue, Convergent sequences; Calculus I, Missed last time, Chain rule. Home's Today shows the same five lines in that order with the same reasons.

The card is `NowCard` (`now-card.md`); the shelves, skeleton and notes are `NowShelves`, `NowSkeleton` and `SidebarNote` (`now-shelves.md`).

## States

| State | List |
|---|---|
| loading | three 60px skeleton cards, `aria-busy`, sr-only "Loading"; no shelves |
| a quiet day | one card per line with a lead: "At part (c)" (bookmark) on the topic the task is about (the course's current topic), "Next up" (arrow) for a current topic; a course with nothing to start has none (Home still shows its "Start a lesson") |
| nothing needs him | "Nothing needs you today", then the shelves |
| everything due | still one card per course line (the engine plans at most five reviews a course, Today at most five lines), a lapse's card titled by the lapsed topic with "Missed last time"; every other due topic sits on On your own with Review, or on Learning when the engine calls it weak |
| a lesson running | a card whose topic the tutor writes in shows the spinner and Working at 70%, in its place through every turn (`steadyTop`); a topic not on top (or one already running when the sidebar first draws) sits on Working, whose open row stays in view while folded |
| a session waiting since yesterday | its own card, first, with Your turn |
| an older waiting session | the accent dot on Learning's (or Other sessions') folded header |
| no courses | the waiting sessions' cards, "No courses yet", Other sessions |
| engine down | the waiting sessions as session cards, "Couldn’t read your courses", Other sessions |
| one course unreadable | after Today's cards, a card per unreadable course (under every course, not under the filter): its mark and name on line 1, "Couldn't read this course's record" on line 2, opening its course page, which says why; its sessions stay on Other sessions; "No courses yet" only when no course is listed at all |
| long titles | the course name truncates first, the reason past 60% of the line, the title on its own line; the slot keeps its right edge |
| 208px to the widest sidebar | the same anatomy |
| open page | the topic's card (its page or one of its sessions) holds `fill-selected` and `aria-current` |

Keyboard: the app keeps Tab dead (`keyboard-shortcuts.tsx`, the owner's ruling of 17 Sep 2026); Down from the search enters the list, the arrows walk cards and shelf headers (`sidebar-tree.ts`), Right on a card moves to its action (Resume, Review, Continue) with its ring and Left goes back, Right and Left open and fold a shelf, Enter opens. The course filter's menu closes on Escape.

## Why this shape

- The system picks: the top is `needsYouNow`, with no sort control (the owner's "taking care of the selection process").
- A short top and a little choice: at most five cards, row 1 next, rows 2 to 5 in any order.
- Open loops lead: each session waiting on him since yesterday is its own card, first.
- Due but bounded: the top follows the engine's day plan, never every topic whose review is due.
- Interleave: Review on a course card starts that course's mixed review, as Home's line does (`useContinueCourse`).
- Fold with a plan: shelves fold by default, and every shelf row says when it comes back (how overdue for a topic in today's plan, "Back in 5d"), else when he last studied it; a topic returns to the top by itself when the engine plans it.
- Recede, don't move: a card the tutor writes in dims in place; nothing reshuffles while he works.
- One rule drawn twice: the keys and reasons are tested equal to Home's (`tests/inbox-today.test.ts`, `tests/needs-you.test.ts`).

Sources: T3 Code's inbox sidebar (`unit-inbox.md`, "Sources"); `../study-home/today.md`, "Needs you now".
