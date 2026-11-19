# TaskContinueLine

`<TaskContinueLine title="Problem sheet 4: rank and nullity" step="Part (c): show $\dim \ker A = 2$ …" />`: his Continue on a task in the lesson column, `data-slot="task-continue"`.

| Slot | Notes |
|---|---|
| break | the task's title as a `SectionBreak` label, the counterpart of the Done for today break that closed it |
| passage | `task-continue-passage`; the part's text from his material, read where the task's ref points (`src/server/task-passage.ts`: the section its heading names, the paragraph holding the step's label), in body text; absent when no ref reaches a text source |
| step | `task-continue-step`; the step he left the task at, as the engine's task record names it, in body text; absent when the record names none |

It is drawn the moment he presses Continue (the page's own map read), and again from the record's `task-continue` marker after a reload, so the part he left, with its text, is on screen before the tutor's turn writes it out (round 17, M8; round 18, M6). The model reads the marker's content, which carries the same passage, so its turn reads no file to find it.
