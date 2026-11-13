# Topic page candidates

Four candidates for the topic page (`/unit/<course>/<topic>`) behind the Topic switch (`design-variant.ts`, group `topic`, which wears Design's Proposed). Current is the page as it is (`../unit-inbox.md`, "The topic page"). `UnitPage` in `../unit-page.tsx` branches once on the switch: Current draws `UnitBody`, an option draws `TopicPage` (`topic-page.tsx`) around that option's body. Each candidate is one folder with its spec. Edo picks one; the others are deleted with their folders, the switch and Current.

| Option | Thesis | How far it resembles Home | A graph of the lesson's steps | Tied to sessions | Spec |
|---|---|---|---|---|---|
| `brief` | today, for one topic: say what to do and stop | Home's rows and nothing else | none | n/a | brief/brief.md |
| `steps` | Home one level down: a map of one lesson's steps over the rows, switched by lesson | line tabs over a node-and-edge map over rows | nodes and edges, drawn as the topic map draws topics | one lesson's plan at a time, a tab per lesson that planned | steps/steps.md |
| `trail` | one dated line from now back: every session and attempt, each lesson's steps inside it | least: a timeline, as an issue reads | the lesson's own list, no drawing | each lesson carries its steps where it sits in time | trail/trail.md |
| `hybrid` | Steps and Trail with one job each, the page fitting the window: the history beside the map of the lesson picked in it, the action in the composer | Home's map frame for the map, the trail's line for the history | nodes and edges in a bounded frame, Next after the step it stopped on | one lesson on the map, picked from the history | hybrid/hybrid.md |

## The three answers, on every candidate

| His question | Where it is answered |
|---|---|
| What is the one thing to do now? | The one button at the title's right (`topic-head.md`): Resume, Open, Review, Continue, Start, or Study in outline. On `hybrid`, the head's button too, until a Resume option moves it to the composer foot |
| Is there anything to review, and when? | The head line: "Review due today", "Review overdue by a week" (only for a topic he can do on his own), or "Next review Fri 13 Nov" |
| Where do I pick this up? | The pick-up rows (`pickup-rows.md`): the session that waits or is being written, at the step it is on, and each open task that holds the topic, at its step. Else "Studied 3 days ago" in the head |

## The one action, first match wins (`topicAction`)

| # | When | Button | What it does |
|---|---|---|---|
| 1 | a session of the topic waits on him (`pendingQuestion`, `pendingProblem`) | Resume | opens `/chat/<id>` |
| 2 | else the tutor is writing in one (`busy`, `compacting`) | Open | opens `/chat/<id>` |
| 3 | else a topic he can do on his own whose review is due (`shelfOf` is `review`) | Review | starts a session whose first message is "Review <title>" |
| 4 | else an open task holds it (the focused one first) | Continue | first message "Continue <task title>" |
| 5 | else not started | Start | first message "<title>" |
| 6 | else still being learned, its review due or not set | Continue | first message "Continue <title>" |
| 7 | else (the next review is dated) | Study, outline | first message "<title>" |

The app's one lever on the tutor is the session's first message; the tutor's own rule takes an unaided first try on any due topic it touches.

## Shared

- `topic-facts.ts`: every fact a candidate reads, pure, engine fields and session facts only, the one clock the engine's study day (`map.today`), a session dated by its local day and never after the engine's; tested in `tests/topic-facts.test.ts`. `topicFacts` folds them into `TopicFacts`. The page's short words for time are Home's, pinned by test to `studiedAgo`.
- `use-topic-read.ts`: `useTopicRead` over `GET /api/topic` (`src/server/topic.ts`, contract `src/core/contracts/topic.ts`, tested in `tests/topic-read.test.ts`): the engine's scored attempts on the topic and when each open task was last touched (`show`), and the plan of each of its 20 newest sessions with the step its newest tagged question is about. Nothing else of a transcript leaves the server. Read again on `turn-settled`, `chats-changed` and `record-changed`; a failed read keeps the last good one.
- `topic-page.tsx`: `TopicPage` (the start, the composer foot as Current's with plain Tab reaching its field as on Home, the setup dialog), `TopicPageProps` (what every candidate takes: `facts`, `busy`, `onAct`, absent when the foot holds the action, `onTask`) and `TOPIC_CANDIDATES`.
- Shared parts, used by the candidates and changed by none: `topic-head.tsx`, `pickup-rows.tsx`, `session-rows.tsx`, `why-mark.tsx` (Home's why mark restated) and `row-classes.ts` (Home's Hybrid row classes restated). When one candidate ships, Home's row and why mark and these become one shared file.

Each candidate but `hybrid` (which fits the window and scrolls only inside its panes) draws inside `ScrollArea bar={false}` (no visible scrollbar), column `max-w-[46rem]`, `px-6 pt-6 pb-8`, blocks `gap-5`, root `data-testid="unit-page"` with `data-topic-candidate="<option>"`.

## The signal test

Every word and mark traces to a named engine field or session fact; what the engine lacks is left out, not drawn. Refused on every candidate: engine level names, "weak", "stale", "due" on its own; counts of reviews, attempts or sessions; exam lines; streaks, time spent, percentages; a done tick or "step 6 of 7" on a lesson (no done ledger exists); the day-by-day verdicts and the next interval (the engine returns neither); tokens, cost, model; rename, delete or export on a session row.

## Sources

The design pass of 13 Nov 2026 (its state matrix, the per-state words and the research behind them): Anki's deck overview, Math Academy's task, Khan Academy's mastery ladder, Things' project pie, Linear's issue page and GitHub's pull request timeline; retrieval practice and successive relearning (Roediger and Karpicke 2006; Dunlosky 2013).
