# NextStepToday (candidate A)

`data-slot="today-next"`. Today names the single next thing to do, with one action. Everything else is one click away.

## Anatomy

Left-aligned in the 736px column, text inset 16 like the composer's.

| Slot | Notes |
|---|---|
| caption | 13/400 `muted-foreground`: "Linear Algebra · Exam in 21 days" (no exam: the course alone) |
| title | 16/500 `foreground`, 4px below: the step's subject, a topic or the task by its title |
| detail | 13/400 muted, max 576px: review "Due for review, with Span and more." then the engine's `gap` as a sentence; task its `step`; topic "Next on your path." |
| Continue | 16px below: the primary pill (32px, accent, 13/500, as the dock's Submit), `data-slot="today-continue"` |
| Other courses | quiet pill beside it with a 14px chevron that turns when open (Collapsible); only when another course exists |
| other rows | 32px quiet rows, `data-slot="today-other"`: course in `foreground`, then " · Review Conditional probability" (or "Nothing waiting") |
| nothing waiting | one muted line: "Nothing is waiting today." |

## Choice

The lead is the first course by `byPriority` (today-waiting.md) that has anything waiting, at its first step. That rule is the only choice the app makes and is temporary.

## Behaviour

Continue and each other row start a session in their course with "Let's continue" (today-waiting.md, Opening).

## Sources

Duolingo's path and Brilliant's "Pick up where you left off" (one Continue); Apple HIG Launching and Widgets (one simple idea, deep link); HIG badging (no mimicked badges); SuperMemo on backlogs driving learners away. research/design-directions.md, section 2, direction A.
