# CourseLinesToday (candidate B)

`data-slot="today-lines"`, each row `data-slot="today-line"`. One quiet entry per course, Things-style: no chips, topics named instead of counted.

## Anatomy

| Slot | Notes |
|---|---|
| row | full column width, at least 52px, padding 8/16, radius 8, 4% fill on hover (Button `quiet`); no separators |
| course | 14/500 `foreground` |
| exam | trailing, 13/400 muted, tabular: "Exam in 21 days"; absent without an exam |
| next | 13/400 muted, one sentence that wraps rather than truncates: "Review Linear independence, Span and more, then continue Problem sheet 4."; "Nothing waiting." |

## Order and behaviour

Rows follow `byPriority` (today-waiting.md). A row starts a session in its course with "Let's continue".

## Sources

Things Today (what is due, in one list); Linear My Issues (urgency order); RemNote's exam-first grouping without its counts; Anki's deck list without its three number columns. research/design-directions.md, section 2, direction B.
