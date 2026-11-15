# Session state

The one model of where a session stands. Home, the topic page, the calendar and the sidebar read it, and nothing else decides whether a session waits on Edo. `session-state.ts`, pure, tested in `tests/session-state-surfaces.test.ts` (every surface against stored sessions), `tests/session-end.test.ts` and `tests/resume-in-place.test.ts`.

## States (`SessionState`, `sessionState(chat)`)

| State | When | What a surface says |
|---|---|---|
| `working` | a turn runs (`busy`); a compaction (`compacting`) is not writing: he can answer during one, so a question waiting then is still `your-turn`, and a lesson closed for today stays closed | sidebar, Home, the topic and course pages: "Tutor writing" (`TUTOR_WRITING`, round 4: the sidebar said Working), the line stays where it was; topic page: Open |
| `your-turn` | a question or problem the tutor posed is unanswered (`pendingQuestion`, `pendingProblem`), or `ended` is `mid-lesson`: it wrote the plan but taught no step, he dismissed its question, a lesson it picked up reached no step yet, its last words ask him something (end in a question mark) while plan steps remain, or practice waits on Next problem with its work unfinished (below) | "Your turn"; topic page: Resume |
| `paused` | the tutor's turn stopped before it finished (`ended` `cut`): it owes the next word | Home: "Reply cut off", true whether he stopped it or the app restarted; topic page: Resume |
| `left` | his Done for today stopped work still open (`ended` `left`): it set aside a question or a problem, the lesson's plan has a step still to teach, or the session waited on him or owed him a reply just before he pressed it | "Left for next time" (bookmark) on Home, the sidebar and the topic page, however long ago, until he picks it up; topic page: Resume |
| `finished` | anything else: the lesson closed, a practice round with its work done, a one-off answer, and a sign-off in words such as "Good place to stop" even with plan steps left | nothing waits; no Your turn, no Home line, never resumed |

A practice session waits on Next problem (`mid-lesson`) while its work is unfinished: a lesson moved to practice with plan steps left, or a session opened on topics (a review, a topic's practice) one of which he has not solved without a hint in it, unless the tutor wrapped the round (its reply to his last Next problem posed nothing). A round he opened on no topics is his to end, so an old drill never waits on him.

`ended` is the record's fold (`sessionEndOf`, `src/core/session-end.ts`).

## Which session belongs to a topic

A session has one identity, fixed once, never moved by the step its lesson is on: its title and the topic it belongs to (`ownTopics`, the record's `topics`). A session started on topics (a topic's page, Home's review, the calendar, the sidebar's Study, `POST /api/chats` with `topics`) belongs to them and keeps the title it was opened with. A session started from a free message is named in its tutor's first reply (`name_session`, `src/agent/tools/name-session.ts`): a short literal title and the topic it is about, so a focused question answered directly, with no plan, never keeps his raw message as its name. Its first plan's goal (`plan_init`'s `goal`) gives it a topic only when it still has none. When a first reply did not name it, the turn settling names it after the course topic that turn looked up (`src/server/session-naming.ts`, `firstTurnTopics`). Naming happens once (`ChatStore.nameSession`, the record's `named`): nothing renames it after, and a session he renamed keeps his name. Home's line, the sidebar's card and the header all show that one title.

Only a session's own topic says Your turn for it (`nowOf`); a session with none sits on Other sessions. A session is on a topic's history when the engine's records tie it there or it was started there: a problem posed on the topic, an attempt saved on it (a save sent as JSON text counts, as the engine reads it), the topic's introduction, or its own topics. Never a plan step's name, and never a task covering the topic: a task links its sessions to the task (`taskSessions`), which its own row continues. Chats carry these as `topics` in `/api/chats`.

## Exports other modules read

- `session-state.ts`: `SessionState`, `sessionState`, `resumableSession` (your turn, then working, then paused, then left, newest first within each), `continueMove` and `ContinueMove` (pick up the resumable one, else reopen the newest finished lesson, a finished practice round never), `FINISHED_LESSON`.
- `unit-inbox/units.ts`: `topicSessions(chats, workspace, handle)`, `taskSessions(chats, workspace, key)`, `buildInbox`, whose `Unit.now` is `your-turn` or `working` from the topic's own sessions only.
- `unit-inbox/topic-page/topic-facts.ts`: `topicAction(topic, map, chats)` and `topicFacts({ course, topic, chats, read })`, both over every session; `pickupsOf(topic, map, entries, chats, record, today)`. The action, first match: resume or open a session of the topic to pick up, Review when the engine has its review due (at any level, a new review session), Continue the open task, Start a topic not started, Continue one being learned with no review set, else Study.
- `study-home/study-facts.ts`: `openSessions` (your turn, working or paused, newest first), `todayRows(courses, open, today)`, `courseMove(course, chats)` and `CourseMove`.
