# Mark line

`<MarkLine answerId />` (`mark-line.tsx`): how the record marked an answer, as one 13px line under his answer. `data-slot="mark-line"`, 32px tall for one answer.

| Part | Treatment |
|---|---|
| facts | `RowFacts` from `answer-mark.tsx`: result (in `foreground`), how it counted, the confidence recorded, each an icon and a few words; a practice problem's tries are one line each, First try over Then, each ending where his words end (round 6: two tries on one line read as a row of eight chips) |
| disputed | Disputed · the mark stands, or · the mark changed; the ruling's words are the tutor's reply (round 16, m20) |
| placement | the facts end on the bubble's right padding (16px), where his words end, so the line reads as the bubble's footnote whatever the answer's length |
| Dispute | a quiet 32px button with a flag just before the facts, shown while the line is pointed at or focused, off while a turn runs; drawn out of the line's flow, so while hidden it takes no room and never pushes the facts in; ⌘⇧M still opens the newest |

The mark is the engine's (`/api/chats/:id/marks` through `AnswerMarksProvider`), never the app's judgement; nothing renders until the engine holds one. Spec of the facts and the dialog: `components/answer-mark.md`.
