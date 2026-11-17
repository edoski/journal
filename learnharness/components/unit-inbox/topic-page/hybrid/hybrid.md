# Topic page body (`hybrid`)

The topic page's body (`../topic-page.md`), which Edo picked. Thesis: Steps and Trail in one page that fits the window, each with one job. The history, sorted by relevance into Pick up's sections, says what to pick up and what happened, and holds the page's action (`../pickup/pickup.md`); the map says where one lesson stands and what comes next.

Files: `hybrid-topic.tsx` (`HybridTopic`, takes `TopicPageProps`), `history.tsx` (`HistoryPane` and its rows), `lesson-map.tsx` (`LessonMap`), `builds-on-map.tsx` (`BuildsOnMap`, a topic not started), `hybrid-facts.ts` (pure). Tests: `tests/topic-page-hybrid.test.tsx`.

## Roles

| Pane | Its job | What it does not do |
|---|---|---|
| History | The topic's sessions and scored attempts in Now, Next, Scheduled and Earlier. A session row opens the lesson; pointing at a lesson that planned puts its steps on the map | List a lesson's steps |
| Lesson map | Where the lesson on the map stands: the step it stopped on ringed, the steps asked about before dotted, the steps right after it marked Next. Every step opens the lesson | Date anything, or list the other lessons |

## Anatomy

The shared page frame (`PageFrame`, `../../../page-frame/page-frame.md`), the course page's: centred up to 80rem, `px-6 pt-6 pb-6`, blocks `gap-5`, root `data-testid="unit-page"` `data-topic-candidate="hybrid"`, `flex-1 min-h-0`: nothing on the page scrolls. Its starts go through the page's one start (`StartScope`, in `TopicPage`): one that fails says so under the head (`StartFailure`, `data-slot="start-failure"`), where the course page says it. At the foot, the course page's composer with the topic chosen (`CourseComposer`, `../../../course-page/course-composer.md`).

| Block | Shown when | Size |
|---|---|---|
| `TopicHead` (the shared `PageHead`), no button: Now holds the action | always | its own height |
| `data-slot="topic-panes"`: the app's linked columns (`../../../linked-columns/linked-columns.md`, which the course page shares), the full height under the head, the history on the left up to 24rem, the course page's road's width, the map filling the rest on the right, 24px apart, nothing around them and no line between them (Edo picked Current, 14 Nov 2026): the lesson on the map's row is filled and its step ringed, and while he points at or focuses that row the step glows as the course map's marked card does (`lh-card-mark`'s rule in `app/globals.css`). Sized for Edo's 14-inch MacBook Pro window (1512×982), the only screen it is fitted to (his ruling of 13 Nov 2026) | a session of the topic planned | fills |
| `data-slot="topic-panes"` with the history beside the map of what the topic builds on (`builds-on-map.tsx`, below) | a topic not started that builds on something, while Now starts it | fills |
| The history alone, the column's width | no session planned, and not a topic not started that builds on something | fills |

Measured at 1440x900 and 1280x720 with the sidebar open: the document is the window's height, and only the two panes scroll.

## History (`history.tsx`)

- Earlier restates Trail's line, by day: the attempts of no session it lists, then each session followed by the attempts it saved (`trailDays`), the 1px spine in the map's edge ink, attempts as plain entries: the result icon (`attemptMark`'s result) and the tutor's sentence, and under it, only when the answer was not his own plain work, how it counted in the answer card's words (With help), or Gave up, Prediction, not counted, Sure, but wrong, Mixed up with a method. "With a hint" told him nothing on 13 Nov, when nearly every lesson answer was saved helped; round 4 found a helped ✓ indistinguishable from an unaided one once the marks were true. Every row is one grid, the icon column, the text in its own column, an attempt's sentence wrapping whole (round 13, 1 n11: two lines cut "…4, n…" beside an empty half-pane), and in Pick up's Earlier the date flush right in one column; an attempt's sentence and date share a baseline. No "Earlier" fold: the pane scrolls instead.
- Bounded: `HistoryPane`: a plain scroller with no bar (`data-slot="topic-history"`), a flex column whose viewport shrinks to the pane. The pane reaches 12px past the column on each side (`-mx-3`) and its list pads them back (`px-3`), so a row's 12px bleed (`../row-classes.ts`, Home's row) keeps its rounded fill and the icon's inset inside the clip; the section labels stay on the head's edge, and the rows' icons sit past the shared gutter (`GUTTER`, `../pickup/pickup.md`). An edge fades 32px only while more of the history lies past it, so at rest the first day is never dimmed.
- A session row (`data-slot="topic-history-session"`, link `data-testid="unit-page-session"`): kind icon, title, `StatusMark` (`../../status-mark.md`: "Your turn", or the spinner and "Tutor writing"), and a lesson that planned puts its steps on the map when he points at it, by pointer or focus (`data-on-map="point"`), as Home's map follows the row he points at; Now's row does the same for its lesson. The lesson on the map has its row filled `bg-fill-selected` (`data-shown`). Round 10, 1 m8: a map button did this, a glyph with no words beside Resume and on every lesson row.

## Keys

The history walks as every page's list does (`useListWalk`, `../../../list-walk/list-walk.md`): its stops are each row's press, Now's first, then Builds on, Next, Earlier and Show the rest. ↑ ↓ step and stop at the ends, Home and End jump, Esc leaves the walk; ↑ on Now steps onto the head's trail, its last link (the arc, else the course), and ↓ from there comes back to Now. With nothing focused, ↓ or Home enters at Now and ↑ or End at the last row.

## Lesson map (`lesson-map.tsx`)

One map on all three pages (Edo, 17 Nov 2026: "the individual lesson/graph also needs updating and be standardised; ideally it should reuse our same graph components and UI/UX as course/home pages"): the lesson's steps are drawn by the course map's own drawing (`CardMap`, `../../../course-map/topic-map/topic-map.md`), its card, lines, tags, focus, dot grid, camera and keys, not by a copy.

- The pane's frame: the map pane's fade on its edges (`MAP_FADE.pane`, 24 at the sides and 40 at the top and bottom, `../../../course-map/map-fade.ts`, the one table of every map's fade; Home's 64 at the sides is too much for this narrower column), which the map of what a topic builds on shares. Pan, zoom and the hold while the plan fits are the course map's (topic-map.md, Behaviour).
- Each step is the course map's card less what a step lacks (canvas.md, Node, "a lesson's step"): no header strip, since a step has no standing and no sidebar fact; the lesson panel's mark in the pie's place; its title whole; the tutor's summary on hover. The lines are the canvas's (`layoutCanvas` over `stepsLayout`'s needs): right-angled, one entry and one exit per card, the needs a longer chain implies left out.
- Steps take their width from the measured pane (`stepCard`, round 14, m34: fixed cards cut "One-to-one against onto for square…"): its clear middle, inside the fade, split into the plan's widest row, at most four (`PLAN_MAP_CAP.across`), so that row fits at full size; no wider than the longest title needs on one line, and 184×64 (`STEP_SIZE`) at least while the pane allows. Every card is as tall as the tallest title needs at that width, so every title shows whole. Measured in a hidden copy of the card's body (`CardContent`), again once web fonts load; the map shows once sized.
- Opens as the course map opens (`framedCamera`): the whole plan when it fits at 80% or more, centred across and at the top of the pane, by the list's first row (round 14, m39: Kernel's two sheet parts floated mid-page); else framed on the ringed step with the step after it whole. At 1512×982 a chain as deep as `PLAN_MAP_CAP` opens whole (`tests/plan-map-cap.test.ts`).
- A plan of one step draws no map (`isPlanned`: two steps or more): the card would only repeat Now, alone in an empty pane (round 15, 2 n6: "Part (c) of sheet 4" at the top right of Kernel's page), so the history takes the width, as it does with no lesson planned.
- Marks (`hybridMarks`): the ringed step (`ringedStep`) wears the course map's ring and, above it, "Your turn" while the lesson waits on him (on the step his open question asks about, a check back on a step done included; round 14, m40), else "Left off here" while a step is still ahead; "Next" over the step after it that no question was about yet. Hover or focus lights a step with what it rests on and what rests on it (canvas.md, Focus); the arrows walk the steps as they walk the course map; the caption names the lesson, its steps and where it stands.

## A topic not started

Round 4 (14 Nov 2026) found the unstarted page one wide row with Start at the far edge, no map and nothing on why the topic comes now. While Now starts the topic, or a lesson he began has not introduced it yet (round 13, 1 n6), the page keeps the linked columns: the history (Now with the day the plan starts it, Builds on, In your material; `../pickup/pickup.md`) and, in the map's place, `BuildsOnMap` (`builds-on-map.tsx`, `data-slot="topic-builds-map"`): the course map (`TopicMap`, `../../../course-map/topic-map/topic-map.md`) cut to the topic and every topic it builds on, near or far (`buildsMapOf` in `../topic-facts.ts`), each card with its pie and where he stands, under the lesson map's fade. The topic's own card glows (`marked`); pointing at a Builds on row ties it to the map as a row does on every page (`useMapTie`, `../../../course-map/map-tie.md`): its topic lit alone, its card glowing instead, brought into view once he rests there. "You are here" shows only when the current topic is among them. A topic that builds on nothing has no map column. Every word is the engine's: the edges, the levels, the record's refs and the plan's `starts`; the engine gives no reason for a topic's place in the plan beyond the courses that come first (`startsAfter`), so the page gives none.

## Math

A step title, a session's title and an attempt's sentence may hold TeX; each is drawn through the shared `MathText` (`../../../ui/math-text.md`) in the map's cards (`CardContent`) and the history's rows, and `mathPlain` gives a node's label and the map's caption plain words. A title with no formula stays plain text. KaTeX's fonts have no medium face, so a step's title strokes its math by a hairline (0.015em) to sit at the title's medium weight. Tested in `tests/topic-page-math.test.tsx`.

## Facts (`hybrid-facts.ts`)

| Function | Out |
|---|---|
| `mapLessonAtFirst(sessions, action)` | The session the action opens when it planned, else the topic's newest own session (`SessionEntry.own`) that planned, else null: a session that only touched the topic shows its map only when he picks it |
| `nextSteps(plan)` | The steps resting on `plan.current` that no question was about |
| `hybridMarks(plan, waits)` | `stepMarks` with "Next" on `nextSteps` |

The lesson on the map is kept while its session is listed; a lesson the history no longer lists falls back to `mapLessonAtFirst`.

## Shared parts it needs

It reads `TopicHead`, `StatusMark`, `trailDays` (`../trail/trail-facts.ts`), `lessonWords`, `stepsLayout`, `stepMarks` (`../steps/steps-facts.ts`), the parts of the deleted steps and trail candidates it kept, and the course map's `CardMap`.

## Layouts tried (13 Nov 2026, throwaway sketches)

| Layout | 1440x900 | 1280x720 | Kept |
|---|---|---|---|
| History on top (40% at most), map below | map about 330px tall | map about 190px tall: the step after the current one falls under the fade | from 13 Nov until Edo went back to side by side the same day |
| Map on top, history below | as above, reversed | as above | no |
| Side by side | both panes the full height under the head | both about 400px tall: current step, its parents and Next in view | yes: Edo's favourite (13 Nov), since a single lesson's steps run down with little branching, so a tall narrow map fits beside the list. At 1512×982 the eigen lesson's whole plan fits |

## Signal test

As the topic page (`../topic-page.md`). The map says nothing is done; Next is the plan's own order, not a verdict.
