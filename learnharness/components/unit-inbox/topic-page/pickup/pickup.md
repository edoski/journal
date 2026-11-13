# Pick up (hybrid topic page)

The Pick up switch (`design-variant.ts`, group `pickup`, Current or `sections`, which wears Design's Proposed and Topic's `hybrid`). Current keeps the hybrid's dated history. Sections replaces the history pane (`HybridTopic`'s `pane` prop, `PICKUP_PANES` in `pickup-options.ts`, given by `TopicPage`'s `pickup` prop) and holds the page's action, so the head has no button, and the page has no composer: resuming the lesson is the established path, Now holds the action that applies when nothing waits (Start, Review, Continue a task), and a deliberate new lesson starts from the sidebar's New lesson, as everywhere else (Edo's ruling, 13 Nov 2026).

Edo's ask (13 Nov 2026): resuming is resuming his study, tracked across lessons, within a lesson and across its steps, so it belongs in the page, inside the list of sessions, not on the composer. The sessions sorted by relevance, with quiet dividers saying what to pick up now, what is scheduled, what comes next and what is past.

Edo picked `sections` on 13 Nov 2026 over `block` (a bordered block on top) and `nowline` (a calendar's now-line), which are deleted with the Resume switch's composer options. Thesis: the history sorted by relevance, as an inbox: Now, Next, Scheduled, Earlier. Now is the first row, larger words, an accent rule down its left edge, the press word in the accent (`sections.tsx`).

## Sections (`pickup-facts.ts`, pure)

| Section | Holds | Shown when |
|---|---|---|
| Now | The page's action (`topicAction`, all seven rows): what to pick up, where it stands in a few words, the press, and the session it opens | always |
| Next | Every other place that waits on him, most pressing first: another session whose turn is his, one the tutor is writing in, a due review the action does not already start (only for a topic he can do on his own, as the head), each open task the action does not continue | not empty |
| Scheduled | The engine's next review when dated ahead: Review, its day ("Fri 13 Nov") in the date column. A date, not a control | dated |
| Earlier | Every session neither Now nor Next holds, and every scored attempt, newest first on the history's line (`trailDays`), each day's words ("Yesterday", "Tue 3 Nov") in a trailing date column on its first row | not empty |

Now's words per row (Edo's copy ruling, 13 Nov 2026: literal words, icons with a few words, no sentences), what on top and where under it:

| Row | Words | Under them |
|---|---|---|
| Resume | the step the lesson stopped on, else its title | Your turn |
| Open | the same | Tutor writing |
| Review | "Review overdue by 2 days", the head's mark | |
| Continue a task | the task's title | its step, "Part (c)" |
| Start | Not started | |
| Continue | the step the newest lesson that planned stopped on, which the new session continues from; "Next lesson" when none planned | Left off yesterday |
| Study | Nothing due (Scheduled holds the date) | |

The press is the head button's word. The step after it is the map's Next, beside the list, so Now does not repeat it. Under Pick up the head drops its review mark and "Studied yesterday" (`HybridTopic`), which Now, Scheduled and Earlier say. A step or session title may hold TeX (`MathText`).

Dates in Earlier: tried on 13 Nov as a trailing column aligned with the rows (kept) and in a gutter on the spine's left (dropped: it pushed Earlier's icons off the column's left edge and wrapped "Tue 3 Nov" onto two lines).

"Earlier", not "Done": nothing records a lesson as done (`../topic-page.md`, the signal test), so the label says only when.

## Shared parts (`pickup-parts.tsx`)

- `Divider`, `Section`: a 32px label in `text-label` with a hairline to the column's end.
- `NowPress`: the press stretched over its container (`after:absolute inset-0`), so the whole row is the press; a link to the session it opens, else a button that starts one. The press word in the accent with a 16px arrow that moves 2px on hover. Its focus ring is inset, inside the pane's clip.
- `NowRow`: 1rem icon column, the words in `text-control` medium wrapping to two lines at most, the press flush right, then the note in `text-label` muted. Bleeds 12px as Home's row; `marked` draws a 2px accent rule down its left edge. The lesson on the map fills it `bg-fill-selected`.
- `NextList`: a session is the history's own row (`SessionItem`) with its map button; a review is Home's one-line row (`../row-classes.ts`), a button that starts the session; an unfinished task is the two-line row, its title over the step it stopped on, so the step (often a formula) gets the row's width.
- `ScheduledEntry`, `EarlierDays` (the history's `SessionItem` and `AttemptEntry` with their `date` column, 4.5rem, the day on each day's first row), `MapToggle` (the history's map button over a stretched press). A session row says "Tutor writing" while the tutor writes.
- Every pane is the history's `HistoryPane`: `-mx-3` with `px-3` inside, so a row's bleed keeps its room inside the clip.

## What it changed in shared parts

- `../hybrid/history.tsx`: `HistoryPane` (the bounded pane with its edge fade) split out of `History`; `SessionItem`, `DayItem` and `Ends` exported. `History` draws as before.
- `../hybrid/hybrid-topic.tsx`: `HybridPaneProps` and the optional `pane`, which takes the history's place and the head's button.
- `../topic-page.tsx`: the `pickup` prop and the new-lesson placeholder.
- `resumeLine` (now in `pickup-facts.ts`) and `NowIconMark` (now in `pickup-parts.tsx`) moved here from the deleted Resume options.

Tests: `tests/topic-page-pickup.test.tsx` (every action row as Now, the sections' order on the page, the lesson on the map).
