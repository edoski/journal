# Inbox: Today

The sidebar's list (`unit-inbox.md`, "Today on top"), which Edo picked over Topics on 13 Nov 2026. `today/today-top.ts` (`todayTop`, `steadyTop`, `itemKey`, `NowItem`; `tests/inbox-today.test.ts`) and `today/today-list.tsx` (`TodayList`).

Thesis: the sidebar's top is exactly Home's Today. One card per line, in the same order with the same reason and under the same name: a session's line as the session, a course's line on the topic it leads with, or on its course when it has none; under it one folded Sessions list, every session newest first (`now-shelves.md`). The system picks; he never sorts.

## What is on top

| Rule | Source |
|---|---|
| Today's lines (`needsYouNow(...).lines`, under the course filter `nowFor`), in Home's order, at most five; Home's "Also today" lines are not drawn | `../study-home/needs-you.ts` |
| A session's line is its session card (`now-card.md`, "The session card"), one per session however many topics its lesson touched; it stands for every topic it worked on (`claimedKeys`), and is not repeated under Sessions | `todayTop`, `claimedKeys`, `restSessions` |
| A course's line with a lead topic is that topic's card (`NowCard`): the inbox's unit, else `unitFor` (a lead not started yet, resting on Learning). The lead is the topic the line's reason is about, so title and reason agree: a lapse's lapsed topic ("Not right last time"), an open task's current topic ("At part (c)" on Rank and the column space, the sheet's topic), else the line's first | `topicUnit` in `now-inbox.ts`; `leadOf` in `../study-home/needs-you.ts` |
| A course's line with no lead (an open task that holds no topic, on a course with no current topic) is its course's card (`now-card.md`, "The course card"), so every line Home draws has a card; every card is under the line's one name, Home's (`NowLine.title`) | `todayTop` |
| A topic is listed once, at the first line that leads with it | `todayTop` with `itemKey` |
| A card, pressed, does what its line does on Home: the session that waits or holds the step opens, else the lesson on it starts; a card on a topic never opens the topic's page (Edo, 17 Nov 2026: one Today line, one press) | `cardPress` over Home's `linePress` (`now-card.md`, press) |

| The lesson he is in keeps its place through a turn: while the tutor writes, its card stays in its slot with the spinner and Tutor writing (70% unless it is the open page), its course's own line stays out, and the count holds; session cards drawn before keep their order among themselves, so answering the second does not swap it to the top. A new card comes in where Today puts it; a fresh draw is Today's order | `steadyTop`, with the top as last drawn kept in `TodayList` |

No header, no count and no total on top: cards leave as the day's plan empties, and none moves under his eyes.

## Layout (256px sidebar, the demo)

| Window | Top | Sessions (folded, 32px) | Scroll |
|---|---|---|---|
| 1440×900 | five cards from y 81, 60px on a 65px pitch, ending at 405 | its header at the list's foot; a running session Today does not show stays under it with Tutor writing | none |
| 1100×700 | the same | the same | none |
| 1512×982 | the same | the same | none |

The demo's cards: Linear Algebra, Your turn, Eigenvalues and eigenvectors (the lesson); Linear Algebra, Your turn, Rank practice; Probability, Due since 5 Nov, Review Random variables and distributions; Real Analysis, Due since 5 Nov, Review Convergent sequences; Calculus I, Not right last time, Review Chain rule. Home's Today shows the same five lines in that order with the same reasons.

The card is `NowCard` (`now-card.md`); Sessions, the skeleton and the notes are `SessionsShelf`, `NowSkeleton` and `SidebarNote` (`now-shelves.md`).

## States

| State | List |
|---|---|
| loading | three 60px skeleton cards, `aria-busy`, sr-only "Loading"; no Sessions |
| a quiet day | one card per line: "Left off 6 Nov" (bookmark) under "Continue Problem sheet 4", opening the topic the task is about (the course's current topic when the task holds it), else the course's page, since the record does not say which of its topics the task is at; "Next up" (arrow) for a current topic |
| nothing needs him | "Nothing needs you today", then Sessions |
| everything due | still one card per course line (the engine plans at most five reviews a course, Today at most five lines), a lapse's card titled by the lapsed topic with "Not right last time"; every other due topic waits on its course page, Home's map and its topic page |
| a lesson running | a card whose topic the tutor writes in shows the spinner and Tutor writing at 70%, in its place through every turn (`steadyTop`); a session running off the top stays in view under folded Sessions with the spinner and Tutor writing |
| a session waiting since yesterday | its own card, first, with Your turn |
| an older waiting session | its Sessions row, and the accent dot on the folded header |
| no courses | the waiting sessions' cards, "No courses yet", Sessions |
| engine down | the waiting sessions as session cards, "Couldn’t read your courses", Sessions |
| one course unreadable | after Today's cards, a quiet note per unreadable course (under every course, not under the filter), as Home says it under Today: "Couldn't read Real Analysis's record", opening its course page, which says why; never a card, which would read as a session (round 14, 4 free); its sessions stay under Sessions; "No courses yet" only when no course is listed at all |
| long titles | the course name gives way first, whole, never cut (the mark names the course), the reason past 60% of the line, the title on its own line; the slot keeps its right edge |
| 208px to the widest sidebar | the same anatomy |
| open page | the topic's card (its page or one of its sessions) holds `fill-selected` and `aria-current` |

Keyboard: the app keeps Tab dead (`keyboard-shortcuts.tsx`, the owner's ruling of 17 Sep 2026); Down from the search enters the list, the arrows walk cards and shelf headers (`sidebar-tree.ts`), Right on a card moves to its action (Resume, Review, Continue) with its ring and Left goes back, Right and Left open and fold a shelf, Enter opens. The course filter's menu closes on Escape.

## Why this shape

- The system picks: the top is `needsYouNow`, with no sort control (the owner's "taking care of the selection process").
- A short top and a little choice: at most five cards, row 1 next, rows 2 to 5 in any order.
- The plan leads, open loops next: each course's review and new topics for today first, then each session waiting on him since yesterday as its own card (round 10, 1 m2: only opening Problem sheet 4 put it above the exam's review). A session folded past the fifth line stays under Sessions, its dot on the folded header.
- Due but bounded: the top follows the engine's day plan, never every topic whose review is due.
- Interleave: Review on a course card starts that course's mixed review, as Home's line does (`useLessonStart`'s `take`, `../start/lesson-start.md`).
- Two things only: what to do today, then his chats, folded (16 Nov 2026); a topic returns to the top by itself when the engine plans it, and its standing lives on its course page, Home's map and its page.
- Recede, don't move: a card the tutor writes in dims in place; nothing reshuffles while he works.
- One rule drawn twice: the keys and reasons are tested equal to Home's (`tests/inbox-today.test.ts`, `tests/needs-you.test.ts`).

Sources: T3 Code's inbox sidebar (`unit-inbox.md`, "Sources"); `../study-home/today.md`, "Needs you now".
