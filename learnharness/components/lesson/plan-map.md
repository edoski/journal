# PlanMap and PlanPanel

The plan under the Proposed design: a small, calm map instead of the node diagram. `data-slot="plan-map"`; each step `data-testid="plan-step-<id>"` with `data-status`.

## PlanMap

| Slot | Notes |
|---|---|
| step | 28px row, 13/18 (`text-row`), title truncates |
| marker | 8px circle: `primary` fill for the current step, `muted-foreground` fill for visited, a 1px `muted-foreground` ring for upcoming |
| title | `foreground` for the current step, `muted-foreground` otherwise |
| Now / Next | quiet trailing words in `muted-foreground`: "Now" on the current step (or `currentWord`, for a lesson shown when nobody is in it, such as the topic page's trail saying "Left off here"), "Next" on the first upcoming step after it |

Steps run in teaching order: each after the steps it rests on (`topoFor` in `plan-facts.ts`). No node numbers, no colours beyond the one accent dot.

## Where it shows

- **In the transcript** (`PlanBlock` variant proposed): a `LessonCard` labelled "Plan" with the step count, the map of the snapshot statuses; the card opens the panel.
- **The panel** (`PlanPanel`, the body of the top bar's plan popover, lesson-top-bar.md): 320px, padding 8, right-aligned under the plan toggle, live statuses. The toggle and the transcript's plan card open it; Esc, a click outside or the close button dismisses it.

Sources: research/learning-first.md ("Plan: coarse map in a collapsible side panel: where you are, what's next; no Node N labels"); findings 16.
