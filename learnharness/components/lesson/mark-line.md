# Mark line

`<MarkLine answerId />` (`mark-line.tsx`): how the record marked an answer, as one 13px line under his answer, for the reading candidates. `data-slot="mark-line"`, 32px tall.

| Part | Treatment |
|---|---|
| facts | `RowFacts` from `answer-mark.tsx`: result (in `foreground`), how it counted, the confidence recorded, each an icon and a few words; a practice problem's two tries are two groups on the line |
| disputed | Disputed, and the tutor's ruling with math rendered |
| Dispute | a quiet 32px button with a flag at the line's end, shown while the line is pointed at or focused, off while a turn runs; ⌘⇧M still opens the newest |

The mark is the engine's (`/api/chats/:id/marks` through `AnswerMarksProvider`), never the app's judgement; nothing renders until the engine holds one. Spec of the facts and the dialog: `components/answer-mark.md`.
