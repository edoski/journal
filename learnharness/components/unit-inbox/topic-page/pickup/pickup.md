# Pick up (hybrid topic page)

The hybrid topic page's history pane (`SectionsPane`, which `HybridTopic` always draws; the Pick up switch is gone since Edo picked `sections`). It holds the page's action, so the head has no button, and the page has no composer: resuming the lesson is the established path, Now holds the action that applies when nothing waits (Start, Review, Continue a task), and a deliberate new lesson starts from the sidebar's New lesson, as everywhere else (Edo's ruling, 13 Nov 2026).

Edo's ask (13 Nov 2026): resuming is resuming his study, tracked across lessons, within a lesson and across its steps, so it belongs in the page, inside the list of sessions, not on the composer. The sessions sorted by relevance, with quiet dividers saying what to pick up now, what is scheduled, what comes next and what is past.

Edo picked `sections` on 13 Nov 2026 over `block` (a bordered block on top) and `nowline` (a calendar's now-line), which are deleted with the Resume switch's composer options. Thesis: the history sorted by relevance, as an inbox: Now, Next, Scheduled, Earlier. Now is the first row, larger words, an accent rule on the Now label's left edge, the press word in the accent (`sections.tsx`).

## Sections (`pickup-facts.ts`, pure)

| Section | Holds | Shown when |
|---|---|---|
| Now | The page's action (`topicAction`, all seven rows): what to pick up, where it stands in a few words, the press, and the session it opens | always |
| Next | Every other place that waits on him, most pressing first: another of the topic's own sessions (a session that only touched it stays in Earlier) whose turn is his, one the tutor is writing in, a due review the action does not already start, each open task the action does not continue | not empty |
| Builds on | While Now starts the topic: each topic it builds on (the course map's `needs` edges into it, `buildsOn`), in path order, as a one-line row: its pie, its title, what its card on the map says (`cardLine`, "Your turn", "Not right last time"), else where he stands on it in the pie's words, one word for one topic on the page (round 8), opening its page; pointing at a row makes its card glow on the map beside | Now is Start and it builds on something |
| In your material | While Now starts the topic: each place his material covers it, from the engine's record (`refs`, through the topic read): the place ("Section 4.7") over the source's title, a book icon. Words, not a control | Now is Start and the record points somewhere |
| Scheduled | The engine's next review when dated ahead: Review, then why it waits that long when the plan held it back (`heldWords` in `components/study-words.ts`, from the engine's `held`: "Waits for your Probability exam" when another course's final review came first, "Earlier days are full" otherwise, after "Due since 21 Oct" once memory's day has passed, `waitsWords` in topic-facts.ts; `data-slot="pickup-scheduled-waits"`, 12 muted, on its own line under Review so it never cuts), its day ("Fri 13 Nov") in the date column. A date, not a control. A topic's first lesson shows here only when Now does not start it (a topic not started with a session on it); while Now starts it, Now says the day | dated |
| Earlier | Every session neither Now nor Next holds, and every scored attempt, newest first on the history's line (`trailDays`): each session followed by the attempts it saved (the topic read's `session`), and first in each day the attempts of a session not listed here (Now or Next holds it, or the read could not tell), so no attempt reads as the session's above it (round 7: the Eigen lesson's answers sat under "Rank practice"); each day's words ("Yesterday", "Tue 3 Nov") in a trailing date column on its first row | not empty |

Now's words per row (Edo's copy ruling, 13 Nov 2026: literal words, icons with a few words, no sentences), what on top and where under it:

| Row | Words | Under them |
|---|---|---|
| Resume | the step the lesson stopped on, else its title | Your turn |
| Open | the same | Tutor writing |
| Review | "2d overdue", the head's mark | |
| Continue a task | the task's title | its step, "Part (c)" |
| Start | First lesson (the head already says Not started) | the day the plan starts it (`plannedWords`): Planned today, Planned Wed 11 Nov, then the courses whose new topics come first ("Planned Wed 11 Nov, after Probability's new topics"); nothing when the plan has no day for it. A line under it says why it comes then, whole, in every course (but plain next in a course without arcs, which only names the course) (`facts.startsWhy`, `startsWhyWords`, `data-slot="topic-starts-why"`): its `STARTS_ICON` and "After Expectation and linearity, which it needs"; Scheduled's first lesson carries the same line |
| Continue | the step the newest lesson that planned stopped on, which the new session continues from; "Next lesson" when none planned | Left off yesterday |
| Study | Nothing due (Scheduled holds the date); since when it is due ("Due since 6 Nov"), as the sidebar and the map's card say it, when the plan holds a review memory asked for already | |

The press is the head button's word. The step after it is the map's Next, beside the list, so Now does not repeat it. The hybrid's head drops its review mark and "Studied yesterday" (`HybridTopic`), which Now, Scheduled and Earlier say. A step may hold TeX (`MathText`); a session or task title may hold markdown and TeX, drawn on one line (`LineText`, components/line-text.md).

Dates in Earlier: tried on 13 Nov as a trailing column aligned with the rows (kept) and in a gutter on the spine's left (dropped: it pushed Earlier's icons off the column's left edge and wrapped "Tue 3 Nov" onto two lines).

"Earlier", not "Done": nothing records a lesson as done (`../topic-page.md`, the signal test), so the label says only when.

## Shared parts (`pickup-parts.tsx`)

- `Divider`, `Section`: a 32px label in `text-label` with a hairline to the column's end.
- `NowPress`: the press stretched over its container (`after:absolute inset-0`), so the whole row is the press; a link to the session it opens, else a button that starts one. The press word in the accent with a 16px arrow that moves 2px on hover. Its focus ring is inset, inside the pane's clip.
- `NowRow`: 1rem icon column, the words in `text-control` medium wrapping to two lines at most, the press flush right, then the note in `text-label` muted. Bleeds 12px as Home's row; `marked` draws a 2px accent rule (`NOW_RULE`) in the rows' gutter, on the x where the section labels' text starts. A plain row like the list's other rows, no fill or ring at rest even when its lesson is on the map (Edo, 13 Nov 2026): its weight is its type and the accent rule.
- `NextList`: a session is the history's own row (`SessionItem`) with its map button; a review is Home's one-line row (`../row-classes.ts`), a button that starts the session; an unfinished task is the two-line row, its title over the step it stopped on, so the step (often a formula) gets the row's width.
- `ScheduledEntry`, `EarlierDays` (the history's `SessionItem` and `AttemptEntry` with their `date` column, 4.5rem, the day on each day's first row), `MapToggle` (the history's map button over a stretched press). A session row says "Tutor writing" while the tutor writes.
- Every pane is the history's `HistoryPane`: `-mx-3` with `px-3` inside, so a row's bleed keeps its room inside the clip.
- The gutter (`../row-classes.ts`, Edo, 14 Nov 2026: the rule should sit on the Now text, without misaligning the icons): every row of the pane, Now, Next, Scheduled, Builds on, In your material, sessions and attempts, starts with one 18px leading inset (`GUTTER`), the rule's 2px and the 16px the rows put between their columns, ruled or not. So the rule starts on the labels' x, every icon sits 18px past it on one shared x, and no row moves when it gains or loses the rule. A bleeding row (`BLEED`) keeps its 12px fill past the column on both sides; the spine runs down the icons' middle past the gutter. Home's rows draw no accent rule, so nothing there changes. Measured in Chromium at 1512×982 (rule = Now text x, icons on one x, fills 12px each side) and held by `tests/topic-page-pickup.test.tsx`.

## Moved here

`resumeLine` (now in `pickup-facts.ts`) and `NowIconMark` (now in `pickup-parts.tsx`) moved here from the deleted Resume options.

Round 4 (14 Nov 2026) found the unstarted page saying "First lesson" twice (Now and Scheduled) in one wide row with nothing on why the topic comes now: Now carries the day, and Builds on and In your material give the reason, in engine facts only.

- `BuildsOnList` and `MaterialList` (`pickup-parts.tsx`): Builds on's rows (`data-slot="pickup-builds-on"`, the standing `pickup-builds-on-standing`) in Home's one-line row with a hairline between, and In your material's rows (`pickup-material`), two lines when the record names the place.

Tests: `tests/topic-page-pickup.test.tsx` (every action row as Now, the sections' order on the page, the lesson on the map, a topic not started).
