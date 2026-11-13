# Pick up (hybrid topic page)

The Pick up switch (`design-variant.ts`, group `pickup`, Current or `sections`, which wears Design's Proposed and Topic's `hybrid`). Current keeps the hybrid's dated history. Sections replaces the history pane (`HybridTopic`'s `pane` prop, `PICKUP_PANES` in `pickup-options.ts`, given by `TopicPage`'s `pickup` prop) and holds the page's action, so the head has no button and the composer foot is the plain composer: a typed message starts a new lesson, and its field says so ("Ask about <topic> to start a new lesson").

Edo's ask (13 Nov 2026): resuming is resuming his study, tracked across lessons, within a lesson and across its steps, so it belongs in the page, inside the list of sessions, not on the composer. The sessions sorted by relevance, with quiet dividers saying what to pick up now, what is scheduled, what comes next and what is past.

Edo picked `sections` on 13 Nov 2026 over `block` (a bordered block on top) and `nowline` (a calendar's now-line), which are deleted with the Resume switch's composer options. Thesis: the history sorted by relevance, as an inbox: Now, Next, Scheduled, Earlier. Now is the first row, larger words, an accent rule down its left edge, the press word in the accent (`sections.tsx`).

## Sections (`pickup-facts.ts`, pure)

| Section | Holds | Shown when |
|---|---|---|
| Now | The page's action (`topicAction`, all seven rows): what waits, the press, the session it opens with its title, the step it stopped on and the step after (`nextSteps`, the first in plan order), else what waits ("Problem waiting") or the task's step | always |
| Next | Every other place that waits on him, most pressing first: another session whose turn is his, one the tutor is writing in, a due review the action does not already start (only for a topic he can do on his own, as the head), each open task the action does not continue | not empty |
| Scheduled | The engine's next review when dated ahead: "Next review Fri 13 Nov". A date, not a control | dated |
| Earlier | Every session neither Now nor Next holds, and every scored attempt, by day on the history's line (`trailDays`) | not empty |

Now's words per row: Resume "Your turn in today's lesson", Open "The tutor is writing in today's lesson", Review "Review overdue by 2 days", Continue a task the task's title with its step, Start "Not started", Continue "Keep learning" with where the newest lesson that planned stopped ("Yesterday's lesson stopped on det(AB) = det A · det B"), Study "Nothing due" (Scheduled holds the date). The press is the head button's word.

"Earlier", not "Done": nothing records a lesson as done (`../topic-page.md`, the signal test), so the label says only when.

## Shared parts (`pickup-parts.tsx`)

- `Divider`, `Section`: a 32px label in `text-label` with a hairline to the column's end.
- `NowPress`: the press stretched over its container (`after:absolute inset-0`), so the whole row is the press; a link to the session it opens, else a button that starts one. The press word in the accent with a 16px arrow that moves 2px on hover. Its focus ring is inset, inside the pane's clip.
- `NowRow`: 1rem icon column, the words in `text-control` medium, the press flush right, then the title, the step ("Stopped on" muted, the step in ink) and "Then" the step after, each wrapping to two lines at most. Bleeds 12px as Home's row; `marked` draws a 2px accent rule down its left edge. The lesson on the map fills it `bg-fill-selected`.
- `NextList`: a session is the history's own row (`SessionItem`) with its map button; a review or a task is Home's one-line row (`../row-classes.ts`), a button that starts the session.
- `ScheduledEntry`, `EarlierDays` (the history's `DayItem`s), `MapToggle` (the history's map button over a stretched press).
- Every pane is the history's `HistoryPane`: `-mx-3` with `px-3` inside, so a row's bleed keeps its room inside the clip.

## What it changed in shared parts

- `../hybrid/history.tsx`: `HistoryPane` (the bounded pane with its edge fade) split out of `History`; `SessionItem`, `DayItem` and `Ends` exported. `History` draws as before.
- `../hybrid/hybrid-topic.tsx`: `HybridPaneProps` and the optional `pane`, which takes the history's place and the head's button.
- `../topic-page.tsx`: the `pickup` prop and the new-lesson placeholder.
- `resumeLine` (now in `pickup-facts.ts`) and `ResumeIconMark` (now in `pickup-parts.tsx`) moved here from the deleted Resume options.

Tests: `tests/topic-page-pickup.test.tsx` (every action row as Now, the sections' order on the page, the lesson on the map).
