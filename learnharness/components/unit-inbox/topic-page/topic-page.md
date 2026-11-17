# Topic page

The topic page (`/unit/<course>/<topic>`): `UnitPage` in `../unit-page.tsx` draws `TopicPage` (`topic-page.tsx`) around the hybrid body (`hybrid/hybrid.md`): the head over the history, sorted into Pick up's sections (`pickup/pickup.md`), beside the map of the lesson picked in it. Edo picked `hybrid` on 13 Nov 2026 over `brief` (today for one topic, Home's rows and nothing else), `steps` (a map of one lesson's steps over the rows, a tab per lesson) and `trail` (one dated line from now back, each lesson's steps inside it), which are deleted with the Topic switch and the page as it was (the topic's sessions as a list over a composer).

## The three answers

| His question | Where it is answered |
|---|---|
| What is the one thing to do now? | Now in the history pane (`pickup/pickup.md`): Resume, Review, Continue, Start, or Study (`pressWord`), on the page's press (`PagePress`) |
| Is there anything to review, and when? | The head line, in the app's one wording (`components/study-words.ts`): "Due today", "Due since 5 Nov" (at any level, as the action), or "Back in 5d" |
| Where do I pick this up? | Now and Next in the history pane: the session that waits or is being written, at the step it is on, and each open task that holds the topic, at its step. Else Earlier dates the last study |

## The one action, first match wins (`topicAction`)

| # | When | Button | What it does |
|---|---|---|---|
| 1 | a session of the topic waits on him or the tutor stopped in it mid-reply (`sessionState`: your turn, paused) | Resume | opens `/chat/<id>` |
| 2 | else the tutor is writing in one (`busy`; a compaction is not writing) | Open | opens `/chat/<id>` |
| 3 | else its review is due, whatever its level (as Home and the calendar say) | Review | starts a review session on the topic whose first message is "Review <title>"; never an older lesson |
| 4 | else an open task holds it (the focused one first) | Continue | `continueMove` over the sessions holding the task: reopens the finished lesson that holds it (or, with `FINISHED_LESSON` on `fresh`, starts a session from it that skips the probe and keeps its plan); with none, first message "Continue <task title>" |
| 5 | else not started | Start | first message "<title>" |
| 6 | else still being learned, no review set | Continue | as row 4 over the topic's sessions; with none, first message "Continue <title>" |
| 7 | else (the next review is dated) | Study, outline | first message "<title>" |

A session's state is one model (`components/nav/session-state.ts`): working, your turn (a question or a problem it posed, a plan it wrote but taught no step of, or its last words asking him something partway through a lesson), paused (its turn stopped before it finished) or finished (a sign-off such as "Good place to stop" included). A session is tied to a topic when the engine's records tie it there (a problem posed on it, an attempt saved on it, its introduction) or it was started on it (`topicSessions`); never by a plan step's name, and never because it holds a task covering the topic: that task is continued through its own row. Of those, it belongs to the topic (`ownsTopic`, the record's `topics`, else its first problem's or save's topics) when it was started on it or named after it; one that only touched it on the way (the Eigen lesson that saved one kernel answer) does not. Only the topic's own sessions are its Now, Next and the map shown at first (rows 1, 2 and 6 above, as the sidebar's `nowOf`); Earlier lists every session tied to it, and its map button still shows a touched lesson's map (round 7: Kernel's page resumed and mapped the Eigen lesson).

The app's one lever on the tutor is the session's first message; the tutor's own rule takes an unaided first try on any due topic it touches.

## Shared

- `topic-facts.ts`: every fact the page reads, pure, engine fields and session facts only, the one clock the engine's study day (`map.today`), a session dated by its local day and never after the engine's; tested in `tests/topic-facts.test.ts`. `topicFacts` folds them into `TopicFacts`. The page's short words for time are the app's one form (`agoWords`); where he stands and why the topic needs him are the app's one wording (`components/study-words.ts`): the standing follows the pie, so a weak topic he could do on his own says "Right with help" beside its 3/4 pie.
- `use-topic-read.ts`: `useTopicRead` over `GET /api/topic` (`src/server/topic.ts`, contract `src/core/contracts/topic.ts`, tested in `tests/topic-read.test.ts`): the engine's scored attempts on the topic, each with the session that saved it (`session`, from each named session's `markLinks`: its save receipts and practice concludes; a re-mark takes the session of the attempt it corrects), where its record says it is in his material (`refs`, each source by its title, with its place) and when each open task was last touched (`show`), and the plan of each of its 20 newest sessions with the step its newest tagged question is about. Nothing else of a transcript leaves the server. Read again on `turn-settled`, `chats-changed` and `record-changed`; a failed read keeps the last good one.
- `topic-page.tsx`: `TopicPage` (the page's one start, `StartScope`, around the hybrid body in the shared page frame: the action, a task's press and the composer at its foot, the course page's `CourseComposer` with the topic chosen, share one sign-in and one failure line under the head, as on the course page) `TopicPageProps` (what the body takes: `facts`, `busy`, `onAct`, `onTask`); while the page reads, or when the engine is down or the topic is not in the record, the page's notice (`PageNotice`, `PageReading`, `../../page-frame/page-frame.md`, "Notices").
- `topic-head.tsx` (`topic-head.md`) and `row-classes.ts` (Home's Hybrid row classes restated).

## The signal test

Every word and mark traces to a named engine field or session fact; what the engine lacks is left out, not drawn. Refused: engine level names, "weak", "stale", "due" on its own; counts of reviews, attempts or sessions; exam lines; streaks, time spent, percentages; a done tick or "step 6 of 7" on a lesson (no done ledger exists); the day-by-day verdicts and the next interval (the engine returns neither); tokens, cost, model; rename, delete or export on a session row.

## Sources

The design pass of 13 Nov 2026 (its state matrix, the per-state words and the research behind them): Anki's deck overview, Math Academy's task, Khan Academy's mastery ladder, Things' project pie, Linear's issue page and GitHub's pull request timeline; retrieval practice and successive relearning (Roediger and Karpicke 2006; Dunlosky 2013).
