# Inbox: Topics

The Inbox switch's candidate `topics` (`unit-inbox.md`, "Inbox switch"; pin it with `?polish-inbox=topics`). Home's Today at topic grain: each of Today's lines leads with its topic as a card, exactly as under `today`, and a course line's other topics (the ones the same lesson takes up) follow it as quiet one-line rows, each with its own reason as an icon. He sees every topic today touches, grouped the way Home groups it, and the shelves keep the rest.

Code: `topics/topics-top.ts` (pure: `topicsTop`, `topicWords`, `topKeys`; `tests/inbox-topics.test.ts`), `topics/topics-list.tsx` (`TopicsList`), `topics/companion-row.tsx` (`CompanionRow`), `topics/companion-tail.tsx` (`CompanionTail`).

## What is on top

For each line in `needs.lines` (`needsYouNow`, Home's order), in order:

1. The lead as a `NowCard` (`now-card.md`): the line's reason and the line's action. A waiting session on no topic is its own card.
2. Course lines only: the line's other topics (`line.topics` without the lead, in the plan's order) as companions. At most 2; with 4 or more, the first 2 then a tail, "Show N more", which opens that line's rest in place and becomes "Show less" (not remembered). With exactly 3 all show: never "Show 1 more".

- A session line has no companions: the session is one thing, and the other topics its transcript touched stay on their shelves.
- Each topic is listed once, the first occurrence winning by unit key. A line whose lead is already listed is left out with its companions.
- A companion with no reason of its own (planned, but neither due, weak, waiting nor held by the task) is not drawn and stays on its shelf. On the plan's own topics this does not happen: each is due.
- Everything not on top folds onto the shelves exactly as under `today` (`now-shelves.md`): Working, Learning, On your own, Other sessions. Companions, the tail's hidden ones included, are on no shelf (`topKeys`).

## Companion row

`CompanionRow` (`topics/companion-row.tsx`), `data-slot="companion"`. Not `TopicSlimRow`: a companion has neither the course mark nor an action, so it is its own row on the shared `rowSurface`.

| Part | Notes |
|---|---|
| row | 36px, padding 0 10 0 32, gap 10, no surface; hover `fill-hover`, the open page `fill-selected` with `aria-current` |
| title | `data-slot="companion-title"`, the topic's map title at 14/400 muted, full ink on hover; starts at 32px, the card's course-name edge, so it reads as under the card; truncates only past about 170px at the default 256px width |
| reason | `data-slot="companion-why"`, one 12px icon at the row's end, on the cards' status edge: `WHY_ICON` for the reason's kind (circle-x a slip, history a review, bookmark a task, the question bubble in the accent for a waiting turn), or the spinner while the tutor writes |
| words | `companionSays`: in a tooltip on hover (`Hint`, side right, the Proposed tooltip, after 500ms) and to a screen reader after the title |
| no course mark | the card above names the course |
| no action | the card's Review or Continue is the one way in: any topic leads into the course's one mixed lesson, so a second button per topic would repeat it |
| keyboard | `data-sidebar-row` the unit key, `data-sidebar-parent` the lead's key, so Left goes back to the card |

`topicWords(topic, now, titleOf)`, by priority, and what the tooltip says (`companionSays`):

1. A session on it waits on him: "Waiting for your reply" (question icon, accent); the tutor writes in one: the spinner, "Working".
2. The engine calls it weak: the map's own words (`statusOf`, `topic-standing.ts`), "Missed last time", "A mistake to fix", "Mixed up with …", "Sure, but wrong", "Worth another look"; circle-x. The card above and the map say the same.
3. Its review is due: Home's words, "Due today", "Overdue by 3 days", "Overdue by a week"; history. Whatever its level, since the plan holds it.
4. On a task line, the task's step in the card's few words: "At part (c)" (bookmark).

## Tail

`CompanionTail`, `data-slot="companion-more"`: a 36px row on the rows' surface, a 16px chevron and "Show N more" at 14/400 muted, full ink on hover, its words on the companions' title edge (padding-left 10, the chevron in the mark's place). `data-sidebar-row` is `more:<line key>`, its parent the lead, `aria-expanded` its state. Enter, a click or Right opens the rest in place above it and moves focus to the first row it revealed; it then reads "Show less" with the chevron turned up, and Enter, a click or Left folds the rest back, focus staying on it. Left on a folded tail goes back to the card.

## Layout (256px, demo world, 1440×900)

From y 80: Eigenvalues and eigenvectors (LA, Your turn); Rank and the column space (LA, Your turn); Random variables and distributions (P, 3d overdue) with Law of total probability (circle-x: A mistake to fix) and Bayes' rule (history: Overdue by a day); Convergent sequences (RA, 1w overdue) with Cauchy sequences (history); Chain rule (CI, Missed last time) with Riemann sums (circle-x: Missed last time), Improper integrals and Area between curves (history). Every companion title shows in full. 5 cards and 6 companions end at y 627; the shelves sit at the foot (Learning, On your own, Other sessions). It fits 1440×900 and 1512×982. At 1100×700 the list runs 75px past the window and scrolls by wheel with no bar, the shelves after it.

The worst case, every course planning five reviews and nothing waiting: 4 to 5 cards, 2 companions and a tail each, up to 20 rows; with the demo's four courses it is 16 and scrolls 32px at 1440×900. That is the cost of topic grain against `today`'s 5 cards: the companions recede (no mark, no action, one icon) but they are still rows.

## States

| State | Top |
|---|---|
| loading | `NowSkeleton` |
| nothing needs him | "Nothing needs you today", then the shelves |
| no courses | "No courses yet" |
| engine down | the waiting sessions as their own cards, "Couldn’t read your courses", Other sessions |
| a waiting turn on a companion | its icon is the accent question bubble |
| a lesson running on a companion | the spinner |
| course filter | that course's line and its companions |
| long titles | titles truncate before the icon, which keeps the cards' right edge |
| 208px wide | the longest titles truncate (about 120px of title) |

The app's Tab is dead by the owner's rule (`keyboard-shortcuts.tsx`); the arrows walk every row, the tail included.

Sources: T3 Code's sidebar (the 36px Show more / Show less tail row, child rows indented under their parent); today.md, "Needs you now"; the study-inbox research (the system picks, short top, interleave: every action starts the course's mixed review; successive relearning: every topic due today visible with its own reason).
