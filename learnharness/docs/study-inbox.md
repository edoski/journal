# The sidebar as T3 Code's, for topics

Design note for the Proposed sidebar (12 Nov 2026). The Sidebar switch in the Logbook guide is Current (the course-grouped session list) or Proposed (this design). The code is in `components/unit-inbox/`, its spec in `unit-inbox.md`.

## The goal

Edo turned down the three Explore candidates (Outline, Page, Resume): none looked like T3 Code's sidebar, and a topic holding its sessions made every session one more thing to click. He wants each row to be one click to somewhere relevant, and the sidebar to look and work like T3 Code's, refitted to the app's theme. A row is a topic (a node of the course's knowledge graph); a click opens the topic's page, which keeps its sessions, puts the active one first and has the composer at its foot.

## What the research found

**T3 Code** (`pingdotgg/t3code` at `4fd40e1a`, read again at `315b06c5`). One pure classifier puts every thread in one section, and Working, Snoozed and Settled are shelves at the foot with counts and chevrons, folded by default. A folded shelf still shows the open thread. Settled shows 10 rows, then more. Inbox rows are 78px cards and shelf rows are 36px single lines. Each row has one status slot (Working, Input, Failed, Woke, a time) that gives way to its actions on hover without moving. A snoozed thread wakes at its time and shows "Woke" until visited.

**The engine.** Each topic has a level (`new`, `introduced`, `attempted`, `assisted`, `independent`, `retained`, `transferred`), a review date (due when it is today or earlier) and a weak verdict with its signals. Nothing stored links a session to a topic. The links live in each transcript: the topics of every problem posed, the topics of every observation saved, the topics a save introduced, and plan nodes named after a topic. Every taught topic is due the next day, so in the seed 9 of 10 started Linear Algebra topics are due.

**Study apps and learning science.**
- RemNote's Currently studying and Maintaining is the closest model.
- Every app shows a count or a queue, and none makes the learner sort a pile.
- Learners choose badly. In Kornell and Bjork's 2008 study, 78% did better with spaced study while 78% judged massing as good or better.
- In Hartwig and Dunlosky's 2012 survey, 59% of students study whatever is due soonest.
- Same-session success predicts retention poorly (Rohrer and Taylor 2007, Karpicke 2009).
- A learned item is never done: its recall falls every day (FSRS), so a learned unit is T3's Snoozed, on a timer the scheduler sets, not its Settled.
- Recommended names: Learning, Review, Known.

## Why the inbox mode, and how the sections map

T3 Code has two layouts: the default inbox (one list with no header, then the Working, Snoozed and Settled shelves at the foot) and a Labs mode that groups threads into project folders. Edo's T3 runs the default (`boringSidebarEnabled: false` in his T3 settings), so the Proposed sidebar copies that one. Courses are T3's projects, so each card names its course on its first line, as each T3 card names its project, and the course filter is T3's project filter.

| T3 Code | Here | Why |
|---|---|---|
| Active, no header | the topics to act on: waiting on him, being learned, due reviews | the list is what to do; the status slot says which (Your turn, Review, or when it was last studied) |
| Working | topics the tutor is writing in | the same rule: running work leaves the list until it comes back to him |
| Snoozed | Known | a learned topic is on a timer the scheduler sets, and wakes onto the list when its review falls due (FSRS: nothing learned is done) |
| Settled | Other sessions | sessions on no topic still need a place; folded at the foot, where T3 keeps finished work |

The engine-backed classifier stays (`buildInbox`): the same Learning, Review and Known rules, now presented as one list and two shelves rather than three headed shelves.

## The row

A card is T3's: the course mark and name with the status slot, the title, then one quiet line. That line is where the engine says the topic slips, else its standing in words, the one fact T3's branch line has no equivalent for. The status slot gives way, on hover, to one action: Resume when a session waits on him or runs, else Study. A known topic is a one-line shelf row with its return.

## The topic page

T3's thread view: the topic, its course and its standing on top, the session to resume first, the other sessions as a quiet list, the composer at the foot. A prompt typed there starts a new session on the topic, its first message led by the topic's title so the tutor works on it, and the app links that session to the topic from its first turn. Its prerequisites and successors are left out: Edo wants only what he acts on.

## Not built

- **The map.** Selecting a topic could focus its node on Home's map, and a map node could open the topic's page.
- **Engine.** `map` could return each topic's attempt count and last attempt date, so a row knows when a topic was practised outside the app.
- **T3's global keys.** ⌘⇧[ and ⌘⇧] for the previous and next row, and ⌘1 to ⌘9.
