# Topic page candidate `brief`

Option `brief` of the Topic switch (`../topic-page.md`). Thesis: Home's Today for one topic. The head says where he stands and the one thing to do, pick-up rows say where it was left, past sessions are a quiet dated list, and the page stops there. It resembles Home through its rows only; it draws no graph of steps.

`brief-topic.tsx` exports `BriefTopic`, which takes `TopicPageProps` and composes shared parts only. It owns no state and no words of its own.

## Anatomy, top to bottom

Inside `ScrollArea bar={false}` (no visible bar; it scrolls by wheel, trackpad and keyboard only when the content is taller than the window). Column `max-w-[46rem] px-6 pt-6 pb-8`, root `data-testid="unit-page"` with `data-topic-candidate="brief"`, blocks `gap-5` (20px). The composer foot below is the shell's.

| # | Block | Part | Shown when |
|---|---|---|---|
| 1 | The head: course, title with the one button at its right, the pie with where he stands, why it needs him as icons and a few words, "Studied…", the mistake | `TopicHead` (`../topic-head.md`) | always; the head line, "Studied…" and the mistake only when the facts have them |
| 2 | Pick-up rows: the session that waits on him or that the tutor is writing in, at the step it is on, then each open task that holds the topic, at its step | `PickupRows` over `facts.pickups` (`../pickup-rows.md`) | there is a place to pick up |
| 3 | "Sessions": the topic's other sessions, newest first, five then "Earlier sessions" | `SessionRows` over `facts.listed` (`../session-rows.md`) | the topic has a session that is not already a pick-up row |

A topic with nothing to say shows the head and the composer and nothing between: the page has no filler and no empty-state sentence (the composer's placeholder says how to start).

## What each state shows

| State | Head | Pick-up rows | Sessions |
|---|---|---|---|
| Not started | dashed pie, "Not started"; Start | none | none |
| Not started, a lesson waiting | no head line; Resume | the lesson, "Today", the step it is on, "Your turn" | none |
| Taught, not tried | "Just started", "Studied 3 days ago"; Continue | none | none |
| Learning, a past lesson | "Nearly on your own", "Studied yesterday"; Continue | none | the lesson, "Yesterday" |
| A problem waiting, an open task, a mistake | "Nearly on your own", a crossed circle and "A mistake to fix", "Studied today", the mistake; Resume | the practice, "Problem waiting", "Your turn"; the task at its step | the past lessons |
| An open task only | the head line and the last attempt; Continue | the task | none |
| Review overdue | "On your own", a clock and "Review overdue by a week"; Review | the task, when one holds it | the past lessons |
| Slipped | warning pie, "On your own", a crossed circle and "Missed last time", a clock and "Review overdue by 2 days", the missed attempt; Review | none | none |
| Nothing due | "On your own", a clock and "Next review Fri 13 Nov"; Study in outline | none | none |
| The tutor writing | Open | the session, the step it is on (else "The tutor is writing"), the spinner, and "The tutor is writing" beside it only when the row does not already say it | the rest |
| Two sessions waiting | Resume (the newest) | the newest | the other, "Your turn" |
| Many sessions | by its state | by its state | five, then "Earlier sessions" |

## Behaviour

- One action on the page, the head's button; at most one filled button (none when the action is Study). Pick-up and session rows are quiet whole-row targets: a session row opens the session, a task row starts a session that continues the task.
- Reading and tab order: the button, the pick-up rows, the sessions, then the composer.
- While a start is in flight the button and the task rows are disabled.
- Colour transitions only, 150ms, none under reduced motion.

## Tests

`tests/topic-page-brief.test.tsx`: each state above that the render can show (no pick-up place; a problem, a task and past lessons in reading order; a waiting lesson's step with no head line; the tutor writing; two waiting; twelve sessions folded with no count; Study in outline; one filled button at most; held while a start is in flight).

## Sources

The design pass of 13 Nov 2026: one start action per container (Anki's Study Now, Mochi, Duolingo, Math Academy), the system picks and he never schedules, standing as a short ladder drawn as a fill (Khan, WaniKani, Things), history below and quiet (Anki, RemNote, Things, Linear, GitHub), a date on the item read against today. Retrieval practice and successive relearning (Roediger and Karpicke 2006; Dunlosky 2013).
