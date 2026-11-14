# Study words

`study-words.ts`: the app's one wording for where he stands on a topic and why it needs him (Edo, 14 Nov 2026). The map, Home's rows, the sidebar, the course page, the topic page and the calendar read it, so no two surfaces say the same thing differently. Pure; tested in `tests/study-words.test.ts`.

## Where he stands

One phrase per step of the topic's pie (`topic-standing.ts` sets the fill from the engine's level and weak verdict). The words follow the pie, never the level: a weak topic he could do on his own draws a 3/4 pie and says "Right with help".

| Pie | Words |
|---|---|
| empty | Not started |
| 1/4 | Taught, not tried |
| 1/2 | Tried, not right yet |
| 3/4 | Right with help |
| full | On your own |

## Why it needs him

One form each, wherever it shows.

| Reason | Words |
|---|---|
| a slip, the first signal that holds, each with its own icon (`slip-icons.ts`) | Fixed, check again later (`repaired` on his own, a check); Missed last time (`lapsed`, a crossed circle); Mistake to fix (`gap`, an alert); Mixed up with Cramer's rule (`choiceErrors`, the method's title, two arrows); Sure, but wrong (`confidentErrors`, a warning); else Look again (a magnifier). A repair made only with help (`repairedWithHelp`) is not "Fixed": the next signal shows. |
| a review come due | Due today, 3d overdue (under a week), 1w overdue, 2w overdue |
| a review dated ahead | Back in 5d, Back in 3w, Back in 2mo |
| unfinished work holds it | Left off today, Left off yesterday, Left off 3d ago, Left off 2w ago; Unfinished when no day is known. Never the tutor's step text. |

Home's line names the lapsed topic when the line is about another one ("Missed Chain rule", `row-facts.ts`). An attempt's result in a topic's history (Right, Partly right, Missed) is not a reason and keeps its own words.

## In a lesson

`LESSON_WORDS`: what happened to his work, said the same way everywhere.

| Moment | Words |
|---|---|
| a reply arrived below what he can see | New reply (the cue above the dock) |
| the tutor's turn ended with no reply (a restart, a stop before any words) | The tutor stopped before replying. Try again |
| another window answered the question he was typing in | Answered in another window. What you typed here is in the box below. |
| he stops for the day | Done for today; a question he left reads Left for next time |
| a course's record can't be read | Couldn't read this course's record, then why (`UNREADABLE_WORDS`): The app isn't allowed to open its files. / Its file is damaged. / Its file can't be opened. |

## Counts

| Where | Words |
|---|---|
| a course's progress (Home's ring, the course page's standing line) | No topics on your own yet; Some topics on your own; Most topics on your own (more than half); Every topic on your own (`courseShareWords`). No count: the ring draws the share |
| a folded list's last row (the sidebar's shelves, the course page's groups) | Show the rest, when one press shows every hidden row; else Show more (`moreWords`). No number: a bare count told him nothing |
