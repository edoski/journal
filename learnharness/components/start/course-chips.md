# CourseChips

Today's courses under the composer. `data-slot="course-chips"`, each chip `data-slot="course-chip"`.

## Anatomy

| Slot | Notes |
|---|---|
| row | centred under the composer, wrapping, chips 8px apart |
| chip | pill (radius full), 32px high, padding 12, 8% border, 13/400 `muted-foreground`, `foreground` and 4% fill on hover: the course title, then " · 6 due" in tabular figures when reviews are due |
| tooltip | what the session takes up: "6 reviews due, then Problem sheet 4: Part (c)"; none when nothing is due and no task is open |
| empty | one "New course" chip with a plus |

A chip starts a teaching session in its course with the opening "Let's continue". The doctrine answers that with today's review first, then the open task at its step, else the current path topic, so the learner never chooses the order. The exam countdown lives on the course's header in the sidebar.

Every fact is a field of `plan --all` (`CourseSummary`: `due`, `task`, `step`); `courseChip` only words them. No levels, percentages or streaks.

## Sources

T3 Code and Claude's quiet suggestion row under the new-chat composer; the tutor skill's open-ended start (SKILL.md, "today's review first"); Button `quiet` (nav-row.md states).
