# LessonRoadmap

Where this lesson is, in the top bar (`lesson-roadmap.tsx`, facts in `roadmap-facts.ts`). Edo, 14 Nov 2026, on the plan popover it replaces: "pointless in its current state … it's just totally flat and static. There's no linking to this", while he liked its minimalism. So: a compact strip with a click detail, live from the transcript, every row that can lead somewhere a link.

## The strip (the trigger)

A quiet 32px button (`data-slot="lesson-roadmap-trigger"`, `data-testid="roadmap"`), as wide as its words, giving way only when the bar is full, in proportion with the crumbs (round 8: "The counting factor for large slot numb…" cut at a fixed 352px with room to spare): one mark per plan step in teaching order (`data-slot="roadmap-strip"`, 4px apart), then the step he is on at 13/18 muted, truncating, math typeset.

| Mark | Step |
|---|---|
| 12×6 bar, `primary` | the step he is on (the newest tagged question's) |
| 6px dot, `muted-foreground` | a step behind him: asked about, or marked done |
| 6px dot, `muted-foreground` at 35% | a step ahead |

Its words: the current step's title (its spoken name reads the maths as words, never TeX); between steps "Next: <title>"; past the last "Every step taught". A lesson with no plan draws no strip, and ⌘K there opens the panel with its topic page and course map alone. The tooltip is "Where this lesson is" with ⌘K; ⌘K opens the panel from anywhere in the lesson (the `open-model-picker` id, kept for saved rebinds).

## The panel

A `Popover` 320px wide, padding 4, right-aligned under the strip (`data-testid="roadmap-panel"`).

- **Steps** (`data-slot="roadmap-steps"`): one 32px row each at 13/18 (`data-testid="roadmap-step-<id>"`, `data-status`, `data-done`): the plan list's 8px circle centred in a 16px slot, the width of the links' icons, so step titles and link labels start on one column (primary for now, filled muted behind, a ring ahead, the topic page's step map wears the same; a step before Now he never reached is behind him too, `passed`, filled and wordless, never a ring like the next one: round 6), the title (full ink for now), and a trailing literal word: "Now", "Next", or "Done" for a step the tutor's `lesson_progress` named done. A step that was taught is a button: it closes the panel and scrolls the transcript to where the step was first taught, flashing it as a passage link does (`lh-source-highlight`). A step ahead is plain text.
- **The way up**, under a hairline: the topic's page (book icon and the topic's name, `data-testid="roadmap-topic"`), then "Course map" (map icon, the course page, `data-testid="roadmap-course"`) with the topic's arc as a bubble (`data-slot="arc-pill"`, the arc tabs' pill: rounded, `fill-hover`, 12px muted) in a course with arcs. Each a 32px row with the hover fill.

Hover fills are rounded 8px rows inside the panel's padding, so nothing clips them. Esc or a click outside closes it, and Esc never reaches the turn (the lesson's Esc chain checks it first).

**Keys** (round 5; Tab is dead): the page's arrows leave an open popover alone, so the panel takes its own. ↑ ↓ move between its stops (the taught steps, then the topic's page and Course map; a step not yet taught is no stop), Home and End go to its ends, Enter opens one. However it closes (Esc, a jump, a link), focus goes to the lesson's box, not back to the strip.

## Where a step was taught (`stepAnchors`)

The first question tagged with the step (`nodeId` on `explain`, or `quiz` in older lessons), and in that question's provider step the first text the tutor wrote, since the teaching comes before its question; the question itself when its step has no text, or when an earlier step already starts at that text. The transcript marks the part with `data-step-anchor`.

## Data

The steps and statuses come from the transcript, live (`latestTree`, `derivePlanStatuses`, whose `done` is the `lesson_progress` set). The topic and arc come from the course map once, when the page opens (`lessonPlaceOf` over the session's candidate topics, as the session list reads them), bounded at 1.5s so a slow engine never holds the lesson.

## Sources

Linear's and GitHub's breadcrumb with a disclosure, Apple's step indicators; the plan list's marks (topic page, `steps/step-node.tsx`); Edo's ruling above.
