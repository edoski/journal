# Topic page body (`hybrid`)

The topic page's body (`../topic-page.md`), which Edo picked. Thesis: Steps and Trail in one page that fits the window, each with one job. The history, sorted by relevance into Pick up's sections, says what to pick up and what happened, and holds the page's action (`../pickup/pickup.md`); the map says where one lesson stands and what comes next.

Files: `hybrid-topic.tsx` (`HybridTopic`, takes `TopicPageProps` and the start's `error`), `history.tsx` (`HistoryPane` and its rows), `lesson-map.tsx` (`LessonMap`), `builds-on-map.tsx` (`BuildsOnMap`, a topic not started), `hybrid-facts.ts` (pure). Tests: `tests/topic-page-hybrid.test.tsx`.

## Roles

| Pane | Its job | What it does not do |
|---|---|---|
| History | The topic's sessions and scored attempts in Now, Next, Scheduled and Earlier. A session row opens the lesson; the map button beside a lesson that planned puts its steps on the map | List a lesson's steps |
| Lesson map | Where the lesson on the map stands: the step it stopped on ringed, the steps asked about before dotted, the steps right after it marked Next. Every step opens the lesson | Date anything, or list the other lessons |

## Anatomy

The shared page frame (`PageFrame`, `../../../page-frame/page-frame.md`), the course page's: centred up to 80rem, `px-6 pt-6 pb-6`, blocks `gap-5`, root `data-testid="unit-page"` `data-topic-candidate="hybrid"`, `flex-1 min-h-0`: nothing on the page scrolls. A start that fails says so under the head (`data-slot="topic-lesson-error"`), where the course page says it.

| Block | Shown when | Size |
|---|---|---|
| `TopicHead` (the shared `PageHead`), no button: Now holds the action | always | its own height |
| `data-slot="topic-panes"`: the app's linked columns (`../../../linked-columns/linked-columns.md`, which the course page shares), the full height under the head, the history on the left up to 20rem, the map filling the rest on the right, 24px apart, nothing around them and no line between them (Edo picked Current, 14 Nov 2026): the lesson on the map's row is filled and its step ringed, and while he points at or focuses that row the step glows as the course map's marked card does (`lh-card-mark`'s rule in `app/globals.css`). Sized for Edo's 14-inch MacBook Pro window (1512×982), the only screen it is fitted to (his ruling of 13 Nov 2026) | a session of the topic planned | fills |
| `data-slot="topic-panes"` with the history beside the map of what the topic builds on (`builds-on-map.tsx`, below) | a topic not started that builds on something, while Now starts it | fills |
| The history alone, the column's width | no session planned, and not a topic not started that builds on something | fills |

Measured at 1440x900 and 1280x720 with the sidebar open: the document is the window's height, and only the two panes scroll.

## History (`history.tsx`)

- Earlier restates Trail's line, by day: the attempts of no session it lists, then each session followed by the attempts it saved (`trailDays`), the 1px spine in the map's edge ink, attempts as plain entries: the result icon (`attemptMark`'s result) and the tutor's sentence, and under it, only when the answer was not his own plain work, how it counted in the answer card's words (With help), or Gave up, Prediction, not counted, Sure, but wrong, Mixed up with a method. "With a hint" told him nothing on 13 Nov, when nearly every lesson answer was saved helped; round 4 found a helped ✓ indistinguishable from an unaided one once the marks were true. Every row is one grid, the icon column, the text in its own column wrapping to two lines, and in Pick up's Earlier the date flush right in one column; an attempt's sentence and date share a baseline. No "Earlier" fold: the pane scrolls instead.
- Bounded: `HistoryPane`: `ScrollArea bar={false}` (`data-slot="topic-history"`), a flex column whose viewport shrinks to the pane. The pane reaches 12px past the column on each side (`-mx-3`) and its list pads them back (`px-3`), so a row's 12px bleed (`../row-classes.ts`, Home's row) keeps its rounded fill and the icon's inset inside the clip; the section labels stay on the head's edge, and the rows' icons sit past the shared gutter (`GUTTER`, `../pickup/pickup.md`). An edge fades 32px only while more of the history lies past it, so at rest the first day is never dimmed.
- A session row (`data-slot="topic-history-session"`, link `data-testid="unit-page-session"`): kind icon, title, `WhyMark` ("Your turn", or the spinner), then for a lesson that planned the map button (`data-slot="topic-map-toggle"`, `WaypointsIcon`, the lesson page's Plan icon, `size="icon-inline"`, `aria-pressed`, hint "Show its steps on the map"). The lesson on the map has its row filled `bg-fill-selected` and its button in ink (`data-shown`).

## Lesson map (`lesson-map.tsx`)

- Home's course map frame: the pane keeps its size, `mapFade(24, 40)` on its edges (Home's 64 at the sides is too much for this narrower column), room around the drawing as much as the fade (plus 20 for a tag), wheel and trackpad pan inside (`panOnScroll`), drag pans, pinch zooms between `MIN_ZOOM` and full size, no bars, no controls.
- Steps are 184×64 (`STEP_SIZE`), narrower than a course topic's card, so a lesson three steps wide fits the column whole: at 1512×982 every seeded lesson opens whole at full size, and a real nine-step lesson three wide at 76%.
- Opens on the whole plan, its tags included, clear of the fade at the largest scale up to full size; below 75% it opens at 75% on the step the lesson stopped on, the plan's edges kept inside the clear middle, and the rest a pan away (`stepsCamera`). Fades in once placed (180ms); a new lesson mounts a new map with the same fade.
- Steps are `StepNode` (`../steps/step-node.tsx`) on `stepsLayout`, marked by `hybridMarks`: the steps tab's marks, plus "Next" over each step that rests on the one it stopped on and no question was about yet. "Left off here" over the step a lesson that waits on nobody stopped on. Keyboard, hover chain and caption as the steps map.

## A topic not started

Round 4 (14 Nov 2026) found the unstarted page one wide row with Start at the far edge, no map and nothing on why the topic comes now. While Now starts the topic, the page keeps the linked columns: the history (Now with the day the plan starts it, Builds on, In your material; `../pickup/pickup.md`) and, in the map's place, `BuildsOnMap` (`builds-on-map.tsx`, `data-slot="topic-builds-map"`): the course map (`TopicMap`, `../../../course-map/topic-map/topic-map.md`) cut to the topic and every topic it builds on, near or far (`buildsMapOf` in `../topic-facts.ts`), each card with its pie and where he stands, under the lesson map's fade. The topic's own card glows (`marked`); pointing at a Builds on row makes that topic's card glow instead. "You are here" shows only when the current topic is among them. A topic that builds on nothing has no map column. Every word is the engine's: the edges, the levels, the record's refs and the plan's `starts`; the engine gives no reason for a topic's place in the plan beyond the courses that come first (`startsAfter`), so the page gives none.

## Math

A step title, a session's title and an attempt's sentence may hold TeX; each is drawn through the shared `MathText` (`../../../ui/math-text.md`) in the map's nodes (`StepNode`) and the history's rows, and `mathPlain` gives a node's label and the map's caption plain words. A title with no formula stays plain text. KaTeX's fonts have no medium face, so a step's title strokes its math by a hairline (0.015em) to sit at the title's medium weight. Tested in `tests/topic-page-math.test.tsx`.

## Facts (`hybrid-facts.ts`)

| Function | Out |
|---|---|
| `mapLessonAtFirst(sessions, action)` | The session the action opens when it planned, else the topic's newest own session (`SessionEntry.own`) that planned, else null: a session that only touched the topic shows its map only when he picks it |
| `nextSteps(plan)` | The steps resting on `plan.current` that no question was about |
| `hybridMarks(plan, waits)` | `stepMarks` with "Next" on `nextSteps` |

The lesson on the map is kept while its session is listed; a lesson the history no longer lists falls back to `mapLessonAtFirst`.

## Shared parts it needs

It reads `TopicHead`, `WhyMark`, `trailDays` (`../trail/trail-facts.ts`), `lessonWords`, `stepsLayout`, `stepMarks` (`../steps/steps-facts.ts`) and `StepNode` (`../steps/step-node.tsx`), the parts of the deleted steps and trail candidates it kept.

## Layouts tried (13 Nov 2026, throwaway sketches)

| Layout | 1440x900 | 1280x720 | Kept |
|---|---|---|---|
| History on top (40% at most), map below | map about 330px tall | map about 190px tall: the step after the current one falls under the fade | from 13 Nov until Edo went back to side by side the same day |
| Map on top, history below | as above, reversed | as above | no |
| Side by side | both panes the full height under the head | both about 400px tall: current step, its parents and Next in view | yes: Edo's favourite (13 Nov), since a single lesson's steps run down with little branching, so a tall narrow map fits beside the list. At 1512×982 the eigen lesson's whole plan fits |

## Signal test

As the topic page (`../topic-page.md`). The map says nothing is done; Next is the plan's own order, not a verdict.
