# Calendar

`/calendar`, the Proposed design's page (Current goes Home): when and what is scheduled, across every course, by day. Reached from the sidebar's Calendar row, under Home. `data-slot="calendar"`.

## Data

The engine owns every date; the page invents none (`calendar-facts.ts`, pure, tested in `tests/calendar-facts.test.ts`).

| Entry | Day | From |
|---|---|---|
| Exam | the record's exam date | `map`'s `exam`; its panel says, from the same daily plan the calendar draws, the days it starts new topics before the exam (when the exam is within the six weeks shown), the day the final review starts (`plan.final_review_days` before the exam), and the topics it has no room to start (`plan.does_not_fit`) |
| Overdue, Review | today for the reviews `plan` makes today (Overdue when past their date); a later day's reviews as the engine's daily plan proposes them | `plan`'s `due`; `plan.plan.days`' `reviews` |
| New topic | the day the daily plan proposes to start it, today included | `plan.plan.days`' `new` |
| Open task | today, since the engine dates no task | `map`'s `tasks` |
| Lesson, Practice, Plan, Check-in | the day of the session's last message (a day after the engine's counts as today) | the session store: practice, else the teaching session's phase (the prober's questions, the plan, the lesson) |

A week's day head says Day off on a weekday the engine has learned he does not study (`plan`'s `capacity.study_days`), else the Journal's study windows for that day (`journal.upcoming_schedule`, read by `src/server/calendar.ts`). The one clock is the engine's study day.

The daily plan is the engine's projection (`learning/agenda.py`): every course together, each day holding what he gets through on that weekday as his record shows, nothing on a day off, paced to each exam, assuming each planned review succeeds. A stored review date the plan does not propose that day (one that did not fit) is not drawn. Not in the engine, so not on the page: a date for an open task, and practice on a date.

## Anatomy

| Slot | Element | Notes |
|---|---|---|
| toolbar | `data-slot="calendar-toolbar"` | 52 tall, the window's drag band: the sidebar's toggle, Today, back and forward (`Button quiet`), the range (`calendar-range`, 18/600: "2 to 8 Nov 2026", "November 2026"), then at the right the course filter (`CourseScope`, the sidebar's) and Week or Month (`Tabs` `line`). The view picked lasts across visits (`lh:calendar-view`) |
| grid | `EventCalendarViews` (`components/ui/event-calendar-views.md`) | FullCalendar's day grid, Monday first, filling the window; hairlines `border/60`; what does not fit a day folds under More |
| day head | `data-slot="calendar-day-head"` (Week) | the weekday 12 muted, the date 14 (today's in a filled 24 circle), then the study time 12 muted with a clock, or Day off with a moon |
| entry | `data-slot="calendar-entry"`, `data-look` | `calendar-entry.tsx`. Week: the course mark (`CourseMark`, the sidebar's monogram) and the title 13 in ink, then the look's icon and word 12 muted (an exam says how far off it is; an overdue review's icon is in danger), and Your turn in link when a session waits. Month: one 24-tall line, mark, icon, title. No fill at rest, the hover fill, the selected fill while its panel is open, radius 8 |
| entry panel | `data-slot="calendar-entry-detail"` | `Popover`, 288 wide: the course, the title 13/600, the look, when in words, then the topic page's action (`topicAction`: Review, Continue, Start, Study, or Resume and Open for a session already running) and Open topic. An open task offers Continue. An exam has no action |
| quiet | `data-slot="calendar-quiet"` | "Nothing scheduled this week" (or month), centred, muted, when the range holds no entry |

Order within a day: the exam, a session that waits on him, overdue reviews, new topics (the day's lesson, so a busy month day never folds it under More), reviews, open tasks, then sessions. A new topic's panel says when it is planned and offers the topic page's Start.

## Actions

A session opens `/chat/<id>`. A review or open task opens its panel: the action starts the session the topic page would start (its first message, linked to the topic), Open topic opens `/unit/<course>/<topic>`. A month's date opens its week. The course filter keeps one course and drops sessions outside a course.

## Sources

FullCalendar v7's shadcn registry (`@fullcalendar/monarch-event-calendar`, MIT): the day grid, its class-name hooks, the controller the toolbar drives. Google Calendar and Apple Calendar: Today then back and forward then the range on the left, the view switch on the right, the week as day columns, the month's "More". Edo's rulings (13 Nov 2026): his 1512 by 982 window with no page scroll, course monograms as the sidebar draws them, an icon with a few literal words, no counts on rows, no card fills on plain rows.
