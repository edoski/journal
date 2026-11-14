# Calendar

`/calendar`: when and what is scheduled, across every course, by day. Reached from the sidebar's Calendar row, under Home. `data-slot="calendar"`.

## Data

The engine owns every date; the page invents none (`calendar-facts.ts`, pure, tested in `tests/calendar-facts.test.ts`).

| Entry | Day | From |
|---|---|---|
| Exam | the record's exam date | `map`'s `exam`; its panel says, from the same daily plan the calendar draws (read up to the exam however far off), the topics it has no room to start (`plan.does_not_fit`) or that every topic is started, then the road to it: each week's new topics before the exam, and the day the final review starts (`plan.final_review_days` before the exam), or that it is under way |
| Overdue, Review | today for the reviews `plan` makes today (Overdue when past their date); a later day's reviews as the engine's daily plan proposes them | `plan`'s `due`; `plan.plan.days`' `reviews` |
| New topic | the day the daily plan proposes to start it, today included | `plan.plan.days`' `new` |
| Unfinished | today, since the engine dates no task (an open task) | `map`'s `tasks` |
| Lesson, Practice | the day of the session's last message (a day after the engine's counts as today) | the session store: practice, else a lesson, whatever step it reached (a lesson still asking its opening questions is not a quiz, round 3) |

A week's day head says Day off on a weekday the engine has learned he does not study (`plan`'s `capacity.study_days`), else the Journal's study windows for that day (`journal.upcoming_schedule`, read by `src/server/calendar.ts`). The one clock is the engine's study day.

The daily plan is the engine's projection (`learning/agenda.py`): every course together, each day holding what he gets through on that weekday as his record shows, nothing on a day off, paced to each exam, assuming each planned review succeeds. A stored review date the plan does not propose that day (one that did not fit) is not drawn. Not in the engine, so not on the page: a date for an open task, and practice on a date.

## Anatomy

| Slot | Element | Notes |
|---|---|---|
| toolbar | `data-slot="calendar-toolbar"` | 52 tall, the window's drag band: Today, back and forward (`Button quiet`), the range (`calendar-range`, 20/500 as Home's and the topic page's titles: "2 to 8 Nov 2026", "November 2026"), then at the right the course filter (`CourseScope`, the sidebar's) and Week or Month (`Tabs` `line`). The view picked lasts across visits (`lh:calendar-view`) |
| grid | `EventCalendarViews` (`components/ui/event-calendar-views.md`) | FullCalendar's day grid, Monday first, filling the window; hairlines `border/60`; what does not fit a day folds under More, whose hint is the app's Tooltip ("Show everything on this day"), never the browser's `title`; a day number that opens its week takes the focus ring |
| day head | `data-slot="calendar-day-head"` (Week) | the weekday 12 muted, the date 14 (today's in a filled 24 circle, 500), then "Study 18:30 to 22:00" 12 muted with a clock, or Day off with a moon |
| entry | `data-slot="calendar-entry"`, `data-look` | `calendar-entry.tsx`. Week: the title 13 in ink across the column's width, two lines at most, then the course mark (`CourseMark`, the sidebar's monogram), the look's icon and word 12 muted (an exam says how far off it is; an overdue review's icon is in danger), or Your turn in link in the word's place when a session waits. Month: the mark and the look's icon on the first line beside the title, two lines at most. Titles and every panel line go through `MathText`. No fill at rest, the hover fill, the selected fill while its panel is open, radius 8 |
| entry panel | `data-slot="calendar-entry-detail"` | `Popover`, 288 wide, 12 clear of the window's edges (`collisionPadding`): the course, the title 13/500, the look, when in words (a review today says "Due today", the app's one wording in `components/study-words.ts`; an overdue one the day it was due; a review the plan held back for a nearer exam's reviews, why, as the topic page's Scheduled says it: "Waits for your exams"), then the topic page's action (`topicAction`: Review, Continue, Start, Study, or Resume and Open for a session already running) and Open topic. An unfinished task offers Continue. An exam has no action |
| quiet | `data-slot="calendar-quiet"` | "Nothing scheduled this week" (or month), centred, muted, when the range holds no entry |

Order within a day: the exam, a session that waits on him, overdue reviews, new topics (the day's lesson, so a busy month day never folds it under More), reviews, open tasks, then sessions. A new topic's panel says when it is planned and offers the topic page's Start.

## Actions

A session opens `/chat/<id>`. A review or open task opens its panel: the action starts the session the topic page would start (its first message, linked to the topic), Open topic opens `/unit/<course>/<topic>`. A month's date opens its week. The course filter keeps one course and drops sessions outside a course.

## Sources

FullCalendar v7's shadcn registry (`@fullcalendar/monarch-event-calendar`, MIT): the day grid, its class-name hooks, the controller the toolbar drives. Google Calendar and Apple Calendar: Today then back and forward then the range on the left, the view switch on the right, the week as day columns, the month's "More". Edo's rulings (13 Nov 2026): his 1512 by 982 window with no page scroll, course monograms as the sidebar draws them, an icon with a few literal words, no counts on rows, no card fills on plain rows.
