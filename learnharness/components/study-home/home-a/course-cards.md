# CourseCards (home A)

Course-first. `data-slot="course-cards"`.

| Part | Notes |
|---|---|
| Waiting on you | only with a waiting session: one `waiting-row` each, most recent first |
| Courses | a stack of `course-card`s, 16px apart, in `byUrgency` order |
| card | radius 12, 1px `border`, `card` fill, padding 20, 16px between parts |
| card head | course name 14 at 600; the exam countdown at the trailing edge, 12 muted, tabular, else when it was last studied |
| standing | one or two sentences, 13: the weak topics due now by name ("Linear independence and Rank are slipping."), then in the run-up the topics not started ("Not started: Eigenvalues."); else the reviews due by name, else "Nothing due for review." |
| strip | `topic-strip` under the sentence, 12px |
| foot | over a hairline, 16px: what Continue takes up without repeating the reviews ("Reviews, then Problem sheet 4"), the open task's step or when it was last studied (12 muted), and Continue |

A card grows by one line when its standing needs two sentences; truncating would hide a topic.
