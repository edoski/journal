# The sidebar as a study inbox

Design note for the Proposed sidebar's Explore pass (12 Nov 2026). The Sidebar switch in the Logbook guide offers Current (today's Proposed sidebar) and three candidates: Outline, Page and Resume. The code is in `components/unit-inbox/` (shared ground in `unit-inbox.md`, one folder and spec per candidate).

## The goal

Today a row is one chat session under its course, and it says little: a title and a time. Edo wants the sidebar to work like T3 Code's, an inbox, with a row being a learning unit (a node of the course's knowledge graph) that holds its sessions. The sidebar's rows and the map's nodes then become the same things.

## What the research found

**T3 Code** (`pingdotgg/t3code` at `4fd40e1a`). One pure classifier puts every thread in one section, and Working, Snoozed and Settled are shelves at the foot with counts and chevrons, folded by default. A folded shelf still shows the open thread. Settled shows 10 rows, then more. Inbox rows are 78px cards and shelf rows are 36px single lines. Each row has one status slot (Working, Input, Failed, Woke, a time) that gives way to its actions on hover without moving. A snoozed thread wakes at its time and shows "Woke" until visited.

**The engine.** Each topic has a level (`new`, `introduced`, `attempted`, `assisted`, `independent`, `retained`, `transferred`), a review date (due when it is today or earlier) and a weak verdict with its signals. Nothing stored links a session to a topic. The links live in each transcript: the topics of every problem posed, the topics of every observation saved, the topics a save introduced, and plan nodes named after a topic. Every taught topic is due the next day, so in the seed 9 of 10 started Linear Algebra topics are due.

**Study apps and learning science.**
- RemNote's Currently studying and Maintaining is the closest model.
- Every app shows a count or a queue, and none makes the learner sort a pile.
- Learners choose badly. In Kornell and Bjork's 2008 study, 78% did better with spaced study while 78% judged massing as good or better.
- In Hartwig and Dunlosky's 2012 survey, 59% of students study whatever is due soonest.
- Same-session success predicts retention poorly (Rohrer and Taylor 2007, Karpicke 2009).
- A learned item is never done: its recall falls every day (FSRS), so a learned unit is T3's Snoozed, on a timer the scheduler sets, not its Settled.
- Recommended names: Learning, Review, Known.

## The row model

A row is a course topic, the engine's map node. It holds every session whose transcript worked on it, newest first. A session on two topics is under both, so interleaved practice links from each topic it covers. Sessions on no topic (a general question, or one older than the course rule) are listed under Other sessions. Topics not started are left out: the tutor routes to them, and listing them would invite picking nodes by hand.

## The shelves

| Shelf | Rule | Order | Row's one fact |
|---|---|---|---|
| Learning | taught and not yet solid, or a session on it waits on him or runs | waiting first, then the latest studied | Your turn, the spinner, else when it was last studied in the app |
| Review | solid and its review is due | weak first, then the longest past due | none |
| Known | solid and not due | the soonest back first | when it comes back, `in 5d` |
| Other sessions | sessions on no listed topic | newest first | the session's own |

These choices follow the research:
- No overdue counts, and no "Due" on Learning rows: almost all of them are due, so the word carried no signal.
- Known rows always show when they come back, because nothing learned is terminal.
- Known and Other start folded and show 10 rows before Show all.
- A course scope lists every course or one, with each exam's countdown.
- Study this starts a session on the topic, opened on its title as the course map's Study this does. The tutor still routes it, so a due topic is tried before anything is taught.

## The candidates

| | Outline | Page | Resume |
|---|---|---|---|
| Thesis | the sidebar is the course's outline | a topic is a place | a topic is a way back in |
| Row | one 32px line: chevron, title, one fact | a 52px card: title and fact, then why it slips or its standing and session count | a 50px row: title and fact, then the session a click resumes |
| Click | folds its sessions open in place, with Study this last | opens the topic's page: standing, where it slips, Study this, sessions, the topics it builds on and leads to | reopens the waiting session, else the newest; with none, starts one |
| Other sessions | inline | on the page | in a menu on the row's count, on hover |
| Known rows | one line with its return | one line | one line |

## The scenarios, on the seeded demo (8 Nov)

| Scenario | Outline | Page | Resume |
|---|---|---|---|
| A day with reviews due (8 across four courses) | Review lists them by risk, titles only | each card says why it slips | each row names its last session |
| A session waiting on his turn (eigenvalues, rank) | top of Learning; two clicks | top of Learning; two clicks, via the page | top of Learning; one click |
| A topic taken three times (rank: two lessons and a practice) | all three inline under it | all three on its page, lesson or practice marked | in the count's menu, marked |
| Practice tied to a topic (rank, independence) | under the topic, not marked as practice | marked on the page | marked in the menu |
| A general question ("Why are vectors written as columns?") | Other sessions, folded | the same | the same |
| Several courses | the row does not name its course | the course leads the second line | the course leads the second line |
| A long course of known topics (Calculus I, 22 known) | Known folded, then 10 and Show all | the same | the same |

The polish gate passes for every candidate at rest (with keyboard focus), folded, unfolded with the full Known list, and on hover. Current is unchanged.

## Recommendation

**Page.** Its cards say the most per row, including why a topic slips, the engine's own words, which the other two hide. Its page makes the sidebar and the map one model, since a topic's prerequisites and successors are links to their own pages. Its cost is a second click to resume a waiting session. A graft from Resume removes that: a card whose session waits on him opens that session directly.

**Later, with the map on Home.** Selecting a topic, in the sidebar or on its page, could focus its node on Home's map. A map node could open the topic's page.

**Engine, not built.** `map` could return each topic's attempt count and last attempt date, so a row shows when a topic was last practised even when it was studied outside the app. Today a row knows only the app's own sessions.
