# TaskContinueLine

`<TaskContinueLine title="Problem sheet 4: rank and nullity" step="Part (c): show $\dim \ker A = 2$ …" />`: his Continue on a task in the lesson column, `data-slot="task-continue"`.

| Slot | Notes |
|---|---|
| break | the task's title as a `SectionBreak` label, the counterpart of the Done for today break that closed it |
| passage | `task-continue-passage`; the part's text from his material, read where the task's ref points (`src/server/task-passage.ts`: the section its heading names, the paragraph holding the step's label), in body text; absent when no ref reaches a text source |
| step | `task-continue-step`; the step he left the task at, as the engine's task record names it, in body text; absent when the record names none |

The chat page writes the record's `task-continue` marker as it opens from Continue (`continueHeldTask`, src/server/chats.ts, as a left question is posed again with no turn), under the day's divider, and the page draws the line from it, so the part he left, with its text, is on screen at once (round 17, M8; round 18, M6). No turn runs: the tutor reads the marker's content, which carries the same passage, with his first message, his try at the step (round 21, m7: a turn posting part (c) again took 36.5 s). The marker is neutral, asks nothing and moves no session's day; a reload or a second Continue draws it once.
