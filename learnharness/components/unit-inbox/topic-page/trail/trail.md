# Topic page candidate `trail`

Option `trail` of the Topic switch (`../topic-page.md`). Thesis: one dated line from now back: every session and every scored attempt on the day it happened, each lesson carrying its own steps as the list the lesson shows. No node-and-edge drawing.

Files: `trail-topic.tsx` (`TrailTopic`, takes `TopicPageProps`), `trail.tsx` (`Trail`), `trail-facts.ts` (pure), tests in `tests/topic-page-trail.test.tsx`.

## Anatomy, top to bottom

Inside `ScrollArea bar={false}` (root `data-testid="unit-page"`, `data-topic-candidate="trail"`), column `max-w-[46rem] px-6 pt-6 pb-8`, blocks `gap-5`.

| Block | Shown when | From |
|---|---|---|
| `TopicHead` (shared) | always | `facts` |
| `PickupRows` (shared), the task rows only | an open task holds the topic | `facts.pickups` of kind `task` |
| `Trail` (`ol data-slot="topic-trail"`, `aria-label="History"`) | the topic has a session or an attempt | `trailDays(facts.sessions, facts.attempts, facts.today)` |

The session to resume is not a pick-up row here: it is the first entry of the line, on its day, with "Your turn" (or "The tutor is writing") and, when its lesson planned, its steps open.

## The line

| Part | Size | Tokens | Notes |
|---|---|---|---|
| Spine | 1px | `bg-white/33` (the topic map's edge ink) | Down the middle of the 16px icon column (7.5px in), from the first entry's icon to the last. Each entry draws its own piece (pseudo-elements), broken 4px above and below its icon, so a row's hover fill never hides it and no mask is needed |
| Day label (`h2`) | 28px | `text-label font-medium text-muted-foreground`, 32px in | `dayWords`: "Today", "Yesterday", "Tue 3 Nov". Days newest first |
| Session entry (`data-testid="unit-page-session"`) | 40px | kind icon 16px muted; title `text-row` ink, truncating | A `next/link` to `/chat/<id>` (shadcn `Button variant="quiet" asChild`), bleeding 12px for the hover fill. Trailing `WhyMark` or nothing (the day label dates it). The row's `li` is a grid and the link a subgrid, so a lesson that planned has its chevron (`Button variant="quiet" size="icon-inline"`, 24px, `data-slot="topic-steps-toggle"`, "Show this lesson's steps" / "Hide this lesson's steps") in its own column before the trailing fact, outside the link, keeping one right edge |
| A lesson's steps | 28px lines | `PlanMap`, 32px in | A shadcn `Collapsible` under the row: `lessonSteps(plan)`, "Now" on the step the newest tagged question was about ("Left off here" when nobody is in the lesson: it waits on nobody and the tutor is not writing), "Next" after it. Open at first for the session the head's button opens (`opensAtFirst`), closed for the rest |
| Attempt entry (`li data-slot="topic-attempt"`, `data-result`) | 40px, or 58px for two lines | icon 16px muted; sentence `text-row text-muted-foreground`, up to two lines; trailing `text-label` muted | Not a control. CheckIcon "Right", CircleDotIcon "Partly right", CircleXIcon "Missed" (`role="img"` with the word). No red, no green. Trailing words from `attemptMark`: "With a hint", "Sure, but wrong", "Mixed up with <method>". Icon and trailing words sit on the first line |
| Fold | 40px | as a session row, muted | Past five days, one more row, "Earlier" with a chevron that turns (a `Collapsible`), holds the rest. It sits on the spine like an entry |

Inside a day: sessions first, newest first by last message, then attempts, newest first by when the engine recorded them, then by id. No hairlines inside the line; the spine is the rule. Chevrons turn in 150ms, not under reduced motion.

## `trail-facts.ts`

| Function | Out |
|---|---|
| `trailDays(sessions, attempts, today): TrailDay[]` | One `{ day, label, sessions, attempts }` per day that has a session (`entry.day`) or an attempt (`attempt.date`), newest day first |
| `opensAtFirst(action): string \| null` | The session's id for `resume` and `open`, else null |
| `lessonSteps(plan): PlanMapStep[]` | `planMapSteps` over the plan's tree, `current` and `visited` |

## What it can and cannot show

| It can show | It cannot show |
|---|---|
| When he studied the topic and in which session | Which session an attempt came from: they are placed by date, no line joins them |
| Every scored attempt, newest first (the engine's 30) | The engine's verdict for a day, or anything worked out beyond the level |
| What went wrong, in the tutor's words | His own answer |
| A lesson's steps and where it stopped | Finished steps, or a plan's branches (read in teaching order) |

## Budgets (polish gate)

`typeStyles 6, fontWeights 2, radii 1, surfaces 1, iconSizes 2 (16 on the spine, 14 in a why mark and the steps chevron), iconStrokes 2`; groups `sessions` (one height, 40), `attempts` (two heights, 40 and 58), `plan` (one height, 28), `pickups` as the shared rows.

Sources: GitHub's pull request timeline (work and conversation on one line), Anki's card history and Linear's grouped activity (history below, grouped, collapsed), Linear's sub-issues (steps under what they belong to); successive relearning (Rawson and Dunlosky 2011), a miss drawn as information (Kornell, Hays and Bjork 2009). No streaks, no counts.
