# Topic page candidate `steps`

Option `steps` of the Topic switch (`../topic-page.md`). Thesis: Home one level down. Where Home draws the course's topics as a map over Today's rows, this draws one lesson's steps as a map, switched by lesson, over the same rows. A topic with no planned lesson has no map, so the page is the shared head, pick-up rows and sessions.

## Anatomy, top to bottom

Inside `ScrollArea bar={false}` (root `data-testid="unit-page"`, `data-topic-candidate="steps"`), column `max-w-[46rem] px-6 pt-6 pb-8`, blocks `gap-5`.

| Block | File | Shown when |
|---|---|---|
| `TopicHead` (the one action) | shared | always |
| `PickupRows` (`facts.pickups`) | shared | a session waits or is written, or an open task holds the topic |
| The lesson's name (`section data-slot="topic-lessons"`, an `h2` as "Sessions" is: 28px, `text-label font-medium` muted) over its map, when one session has a plan; with several, shadcn `Tabs` (`data-slot="topic-lessons"`), `TabsList variant="line"` (32px, 13px, 20px apart, the chosen one in ink over a 2px underline), one `TabsTrigger` (`data-slot="topic-lesson-tab"`) per session with a plan, newest first | `steps-topic.tsx` | a session of the topic has a plan with steps |
| `StepsMap` under the name or in the chosen tab's panel: `figure data-slot="topic-steps"`, as tall as the plan at full size plus its room, the column's width, edges faded 48px across and 32px down (`mapFade`) | `steps-map.tsx` | with the name or the tabs |
| `SessionRows` (`facts.listed`) | shared | the topic has sessions not shown as a pick-up row |

## Tabs (`steps-facts.ts`, `planTabs`, `lessonWords`)

- Labels from the session's last day against the engine's: "Today's lesson", "Yesterday's lesson", "Lesson of Tue 3 Nov" (a practice session says "practice"). Two tabs with one label add the session's title: "Lesson of Tue 3 Nov, Rank, second pass".
- One planned lesson shows its label as a heading, not a tab with nothing to switch to, so the block still says whose steps these are.
- The tab that opens: the pick-up session when it has a plan, else the newest. The chosen tab is kept across refreshes while its session is still listed.
- The panel takes no tab stop of its own (`tabIndex={-1}`): the map inside holds one.

## The map (`steps-map.tsx`, `stepsLayout`)

- Geometry and edges are the topic map's: `layoutTopicMap` (d3-dag, Sugiyama), `NeedEdge` (1px, white 33%, no arrowheads), each step below the steps it rests on. `stepsLayout` is the one place a plan's ids become the map's handles. It reads the tutor's plan defensively: a repeated step, an edge to a missing step, a repeated edge and an edge that would close a loop are left out.
- Read-only React Flow, set up as `TopicMap` sets it up: no node drag, connect, select or delete; always full size (no zoom), so every title stays at the page's 13px and the tag at 11px; the figure is as tall as the plan plus room 32 and 20 for the tag above and 32 below, so every step shows and the page scrolls past it; the wheel scrolls the page (no pan or zoom on scroll); a plan wider than the column pans by drag inside `translateExtent` (room 48 across); attribution hidden; no controls, minimap, grid or `colorMode`.
- Centred across on the current step when the plan is wider than the column (`cameraAt` at full size). Fades in once the camera is placed (180ms); a tab switch mounts a new map with the same fade. None under reduced motion.
- Hover or focus lights a step and everything it rests on (`chainOf`, shared through `TopicMapContext` so `NeedEdge` brightens its edges). One tab stop, the current step, else the first; arrows walk edges and layers (`neighbourOf`); a step reached out of view is brought in (200ms, none under reduced motion). Enter opens the lesson.
- The figure's caption, for a screen reader: "Today's lesson: 7 steps, each below the steps it rests on. Your turn on Computing a 2×2 spectrum."
- `StepsMap` restates `TopicMap`'s private `Flow` (typed to a course). When one candidate ships, the two become one shared flow.

## A step (`step-node.tsx`, `StepNode`, `stepMarks`)

- 224x64 (the map's `NODE_WIDTH`, `NODE_HEIGHT`), radius 12 (`rounded-lg`, the topic map's node), `px-3`, `border-border bg-card` on every step (nothing says which are done, so no step looks "not reached"), hover `border-white/20`, focus `outline-2 outline-offset-2 outline-ring`.
- An 8px dot for what is known, the lesson Plan list's marks (`components/lesson/plan-map.tsx`): `bg-primary` for the current step, `bg-muted-foreground` for a step an earlier question was on. Any other step keeps the dot's room with no mark: an empty ring would say "not reached", which nothing says. 12px to the title, `text-row font-medium`, two lines at most.
- The current step: `border-ring` with the 3px halo. When the lesson does not wait on him, a tag 20px above its left edge in `text-caption font-medium` ink (`data-slot="topic-step-tag"`): "Left off here". A lesson that waits says "Your turn" once, on its pick-up row, so its step carries no tag (its name still says "Your turn" to a screen reader).
- A `next/link` to `/chat/<session id>` (`data-slot="topic-step"`, `data-status`). `aria-label`: the title, the tag, then "Opens <tab label>"; `aria-current="step"` on the current one; `aria-description`: "Rests on A, B".
- A step's `summary`, when the tutor wrote one, in a shadcn `Hint` on hover (the seed has none).

## What it cannot show

Steps for a session with no plan (every practice, and every session that stopped in the opening questions); one plan for the topic across lessons; which steps are finished or how he did on one; that a lesson is over; a place inside a lesson to jump to (every step opens the lesson as a whole). A step reads as passed only when the tutor tagged a question to it, so the finished Determinants lesson shows its last step as where it stopped and the others with no mark.

## Sources

The research behind it: GitHub Actions' run graph (state on the node, the node opens its record, one switcher swaps the whole graph to an earlier attempt), Duolingo's arrow back to the current circle, Linear's sub-issues over its feed. Tests: `tests/topic-page-steps.test.tsx`.
