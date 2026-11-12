# Agenda (home B)

Time-first. `data-slot="agenda"`, sections 40px apart.

| Part | Notes |
|---|---|
| Now | `agenda-now`: the one step worth doing now (`nextUp`: a session waiting on you, else the most urgent course's next step) in a 12-radius card, padding 20: its words 14 at 600, the gap or step 13 muted, the course and exam 12 muted, and the page's only primary button (Open or Continue) |
| Today | the other waiting sessions (`waiting-row`), then each other course's next step as a 40px `agenda-step` row that opens a lesson: the step in words ("Review Span and Rank"), the course at the trailing edge |
| This week | `agenda-day` rows: the day in a 96px column ("Tomorrow", "Fri 13 Nov", 12 muted, tabular), then each review the engine scheduled that day, with its course at the trailing edge |
| Exams | `agenda-exam` rows, nearest first: the date, the course name, the countdown at the trailing edge, and the course's `topic-strip` under them |

Sections with nothing in them are left out.
