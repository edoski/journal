# TodayWaiting

What is waiting, under Today's composer. Explore mode: three ship-ready candidates behind the dev overlay's **Today** group (`proposed-a`, `proposed-b`, `proposed-c`; Alt+3, Alt+4, Alt+5), A by default. Current Today (the graph home) never shows any of them; production resolves to Current. The draft at `/chat/new` shows none.

| Candidate | Folder | Thesis |
|---|---|---|
| A | `today-a/` (next-step.md) | Name the one next step in words, with one Continue; other courses one click away. |
| B | `today-b/` (course-lines.md) | One quiet line per course saying what is next, as a sentence. |
| C | `today-c/` (suggestions.md) | Only the composer: what is waiting becomes up to three requests to send or edit. |

## States, shared

| State | Shows |
|---|---|
| engine asked / unavailable | nothing here: the screen's own line names the reason and the fix |
| no courses | "Add your first course" (plus, `link` colour, 32px quiet button), which opens New course |
| courses | the candidate |

## Data

Only `plan --all` fields, through `CourseSummary`: `reviews` (title, `overdue`, `gap`), `due`, `task`, `step`, `currentTitle`, `exam`, `lastActiveDaysAgo`. `course-facts.ts` turns one course into `Waiting`: its steps in the order an open-ended start takes them (SKILL.md: today's reviews, then the open task at its step, else `path.current`). Topics are named, at most two ("Span, Rank and more"), never counted. No levels, percentages, streaks or badges.

**The one ordering rule** (`byPriority`): the nearest exam first, then the most recent activity, then the engine's order. It is the app's only cross-course priority and is **temporary**: it moves into the engine as soon as the brief names the day's course.

## Opening

A and B start a session through `SessionStarter` with `CONTINUE_OPENING` ("Let's continue"). It is open-ended on purpose: the doctrine answers it with today's reviews first, then the open task, else the current topic, which is the very order the candidates word, so what Today names is what the tutor takes up, and a backlog is still offered as one review block. The prober routes the opening to teaching or practice; Today names no mode. C puts its request in the composer with its course chosen and sends nothing.
