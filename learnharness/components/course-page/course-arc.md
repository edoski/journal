# CourseArc

One arc of a course page (course-page.md, "Arcs"): its line over its topics. `course-arc.tsx`; `data-slot` `course-arc` (the section, `data-arc`, `data-current`), `course-arc-header`, `course-arc-title`, `course-arc-exam`, `course-arc-state` (`data-kind`), `course-arc-check`.

## Anatomy

| Slot | Notes |
|---|---|
| line | 36px, a shadcn Collapsible's trigger reaching 12px past the column with the hover fill: the arc's ring (`Ring`), its name at 13/500, a 14px chevron (right while folded), its exam words when the exam leaves some arc out, then flush right the status |
| status | "Needs you" in the warning ink with a circle-alert mark when Today takes up one of its topics, else where it stands (`ARC_STATE_WORDS`) with its mark: dashed circle, dotted circle, list-checks, circle-check, book-check. It is the line's last item, so every line's status ends on one right edge |
| Check it | a `ready` arc's action, the sidebar row's (`ROW_ACTION`, row-card.md): over the status, which fades while the line is hovered or has keyboard focus, so nothing moves. While the arc is open it stays shown in the status's place. It starts the arc's check (`useStartArcCheck`, `../unit-inbox/start-unit.ts`): practice on the arc's live topics whose brief carries the check (`arcs_ready`). Never on an arc that is not ready, so never in a course that takes no questions |
| rows | open, its topics as `CourseTopicRow`s hanging 32px in, under its name |

No count anywhere. The page holds which arcs are open (more than one may be), for the visit; arrows walk each line, a ready arc's Check it, then the open arcs' rows (`walkStops`).

## Sources

design-v2.md 5.2 and 4.8; Edo, 14 Nov 2026: statuses on one edge, Check it as the row's action.
