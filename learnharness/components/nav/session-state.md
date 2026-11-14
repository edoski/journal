# Session state

The one model of where a session stands. Home, the topic page, the calendar and the sidebar read it, and nothing else decides whether a session waits on Edo. `session-state.ts`, pure, tested in `tests/session-state-surfaces.test.ts` (every surface against stored sessions), `tests/session-end.test.ts` and `tests/resume-in-place.test.ts`.

## States (`SessionState`, `sessionState(chat)`)

| State | When | What a surface says |
|---|---|---|
| `working` | a turn or a compaction runs (`busy`, `compacting`) | sidebar: Working; Home: "Tutor writing", the line stays where it was; topic page: Open |
| `your-turn` | a question or problem the tutor posed is unanswered (`pendingQuestion`, `pendingProblem`), or `ended` is `mid-lesson`: the plan waits for his go-ahead, he dismissed its question, a lesson it picked up reached no step yet, its last words ask him something (end in a question mark) while plan steps remain, or a lesson moved to practice waits on Next problem with plan steps left | "Your turn"; topic page: Resume |
| `paused` | the tutor's turn stopped before it finished (`ended` `cut`): it owes the next word | Home: "Stopped mid-reply"; topic page: Resume |
| `finished` | anything else: the lesson closed, a practice round concluded with no plan steps left, a one-off answer, and a sign-off in words such as "Good place to stop" even with plan steps left | nothing waits; no Your turn, no Home line, never resumed |

`ended` is the record's fold (`sessionEndOf`, `src/core/session-end.ts`).

## Which session belongs to a topic

A session is on a topic when the engine's records tie it there or it was started there: a problem posed on the topic, an attempt saved on it (a save sent as JSON text counts, as the engine reads it), the topic's introduction, or `topics` on the record, set at creation by `POST /api/chats` (a topic's page, Home's review, the calendar, the sidebar's Study). Never a plan step's name, and never a task covering the topic: a task links its sessions to the task (`taskSessions`), which its own row continues. Chats carry these as `topics` in `/api/chats`.

## Exports other modules read

- `session-state.ts`: `SessionState`, `sessionState`, `resumableSession` (your turn, then working, then paused, newest first within each), `continueMove` and `ContinueMove` (pick up the resumable one, else reopen the newest finished lesson, a finished practice round never), `FINISHED_LESSON`.
- `unit-inbox/units.ts`: `topicSessions(chats, workspace, handle)`, `taskSessions(chats, workspace, key)`, `buildInbox`, whose `Unit.now` is `your-turn` or `working` from the topic's own sessions only.
- `unit-inbox/topic-page/topic-facts.ts`: `topicAction(topic, map, chats)` and `topicFacts({ course, topic, chats, read })`, both over every session; `pickupsOf(topic, map, entries, chats, record, today)`. The action, first match: resume or open a session of the topic to pick up, Review when the engine has its review due (at any level, a new review session), Continue the open task, Start a topic not started, Continue one being learned with no review set, else Study.
- `study-home/study-facts.ts`: `openSessions` (your turn, working or paused, newest first), `todayRows(courses, open, today)`, `courseMove(course, chats)` and `CourseMove`.
