# Topic page candidate `hybrid`

Option `hybrid` of the Topic switch (`../topic-page.md`). Thesis: Steps and Trail in one page that fits the window, each with one job. The history says when and what happened; the map says where one lesson stands and what comes next. A Pick up option replaces the history pane with one sorted by relevance that holds the action (`../pickup/pickup.md`).

Files: `hybrid-topic.tsx` (`HybridTopic`, takes `TopicPageProps`; `HYBRID_COLUMN`), `history.tsx` (`History`), `lesson-map.tsx` (`LessonMap`), `hybrid-facts.ts` (pure). Tests: `tests/topic-page-hybrid.test.tsx`.

## Roles

| Pane | Its job | What it does not do |
|---|---|---|
| History | The dated index of the topic: every session and scored attempt, newest first. A session row opens the lesson; the map button beside a lesson that planned puts its steps on the map | List a lesson's steps |
| Lesson map | Where the lesson on the map stands: the step it stopped on ringed, the steps asked about before dotted, the steps right after it marked Next. Every step opens the lesson | Date anything, or list the other lessons |
| Composer foot | A new lesson | |

## Anatomy

Column `max-w-[60rem]` (`HYBRID_COLUMN`, which the composer foot shares), `px-6 pt-6 pb-4`, blocks `gap-5`, root `data-testid="unit-page"` `data-topic-candidate="hybrid"`, `flex-1 min-h-0`: nothing on the page scrolls.

| Block | Shown when | Size |
|---|---|---|
| `TopicHead` (shared), no button: the composer foot holds the action | always | its own height |
| `data-slot="topic-panes"`: a column, the history (or the Pick up pane) on top, as tall as it needs up to 40% of the room (`max-h-[40%] shrink-0`), then the map filling the rest, 16px apart. Sized for Edo's 14-inch MacBook Pro window (1512×982), the only screen it is fitted to (his ruling of 13 Nov 2026) | a session of the topic planned | fills |
| `History` alone, the column's width | no session planned | fills |

Measured at 1440x900 and 1280x720 with the sidebar open: the document is the window's height, and only the two panes scroll.

## History (`history.tsx`)

- Trail's line restated: day headings (`dayWords`), sessions then attempts per day, the 1px spine in the map's edge ink, attempts as plain entries (`attemptMark`). No "Earlier" fold: the pane scrolls instead.
- Bounded: `HistoryPane`, which the Pick up options draw in too: `ScrollArea bar={false}` (`data-slot="topic-history"`), a flex column whose viewport shrinks to the pane. The pane reaches 12px past the column on each side (`-mx-3`) and its list pads them back (`px-3`), so a row's 12px bleed (`../row-classes.ts`, Home's row) keeps its rounded fill and the icon's inset inside the clip, and the titles stay on the head's edge. An edge fades 32px only while more of the history lies past it, so at rest the first day is never dimmed.
- A session row (`data-slot="topic-history-session"`, link `data-testid="unit-page-session"`): kind icon, title, `WhyMark` ("Your turn", or the spinner), then for a lesson that planned the map button (`data-slot="topic-map-toggle"`, `WaypointsIcon`, the lesson page's Plan icon, `size="icon-inline"`, `aria-pressed`, hint "Show its steps on the map"). The lesson on the map has its row filled `bg-fill-selected` and its button in ink (`data-shown`).

## Lesson map (`lesson-map.tsx`)

- Home's course map frame: the pane keeps its size, `mapFade(64, 40)` on every edge, room around the drawing as much as the fade (plus 20 for a tag), wheel and trackpad pan inside (`panOnScroll`), drag pans, pinch zooms between `MIN_ZOOM` and full size, no bars, no controls.
- Opens on the whole plan when it fits at 75% or more, else full size on the step the lesson stopped on (`openingCamera`). Fades in once placed (180ms); a new lesson mounts a new map with the same fade.
- Steps are `StepNode` (`../steps/step-node.tsx`) on `stepsLayout`, marked by `hybridMarks`: the steps tab's marks, plus "Next" over each step that rests on the one it stopped on and no question was about yet. "Left off here" over the step a lesson that waits on nobody stopped on. Keyboard, hover chain and caption as the steps map.

## Facts (`hybrid-facts.ts`)

| Function | Out |
|---|---|
| `mapLessonAtFirst(sessions, action)` | The session the action opens when it planned, else the newest that planned, else null |
| `nextSteps(plan)` | The steps resting on `plan.current` that no question was about |
| `hybridMarks(plan, waits)` | `stepMarks` with "Next" on `nextSteps` |

The lesson on the map is kept while its session is listed; a lesson the history no longer lists falls back to `mapLessonAtFirst`.

## Shared parts it needs

It reads, and changes none of: `TopicHead` (whose button is absent without `onAct`, the one change it declares), `WhyMark`, `trailDays` (`../trail/trail-facts.ts`), `lessonWords`, `stepsLayout`, `stepMarks` (`../steps/steps-facts.ts`) and `StepNode` (`../steps/step-node.tsx`). If hybrid ships, those three files move into this folder before steps and trail are deleted.

## Layouts tried (13 Nov 2026, throwaway sketches)

| Layout | 1440x900 | 1280x720 | Kept |
|---|---|---|---|
| History on top (40% at most), map below | map about 330px tall | map about 190px tall: the step after the current one falls under the fade | yes, from 13 Nov: Edo fits the page to his 14-inch MacBook Pro (1512×982) only, where the map keeps its current step, parents and Next, and the page reads top to bottom: what to pick up, where the lesson stands, the composer |
| Map on top, history below | as above, reversed | as above | no |
| Side by side | both panes the full height under the head | both about 400px tall: current step, its parents and Next in view | first pick, replaced on 13 Nov |

## Signal test

As the other candidates (`../topic-page.md`). The map says nothing is done; Next is the plan's own order, not a verdict.
