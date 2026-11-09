# CourseLines

Today's courses under the composer. `data-slot="course-lines"`, each entry `data-slot="course-line"`, actions `data-slot="course-action"`.

## Anatomy

| Slot | Notes |
|---|---|
| entry | at least 56px high, padding left 16 (the composer text's inset), right 8; entries 4px apart |
| first line | the course title 13/500 `foreground`, then 13/400 `muted-foreground`: exam countdown and reviews due ("Exam in 21 days · 6 reviews due, most overdue: Linear independence"), truncating |
| second line | the open task's step (or its title), 13 `muted-foreground`, only with a task |
| actions | Review (when reviews are due) and Continue (task or current topic): quiet 32px buttons, 13px, radius 8; Continue's tooltip names the task and step |
| empty | "No courses yet." and a quiet New course button |

Every fact is a field of `plan --all` (`CourseSummary`: `exam`, `due`, `mostOverdue`, `task`, `step`, `current`); `courseLine` only words them. No levels, percentages or streaks.

## Sources

learning-first.md screen 2 (one row per course: exam countdown, due count and most overdue topic, the open task and step); T3 Code's quiet text under the composer; Button `quiet` (nav-row.md states).
