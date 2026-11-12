# CourseTable (home C)

One dense table in a 960px column. `data-slot="course-table"`.

| Part | Notes |
|---|---|
| Now | `course-table-now`: the section head, then one line: a waiting session as a `link` to it ("Answer Eigen lesson in Linear Algebra") and how many more wait in words, else the most urgent course's step |
| table | a real `table`, fixed layout; head 12 at 600 muted over a hairline; one `course-table-row` per course in `byUrgency` order, hairline between rows |
| Course | a 6px `link` dot when the course has a waiting session or a weak topic due, the name 14 at 600, when it was last studied 12 muted |
| Exam | right-aligned, tabular: "in 11 days", "None" |
| Topics | the course's `topic-strip` |
| Next | the step in words, truncated; "Also due:" and the further reviews by name, 12 muted |
| action | Continue, `secondary` `sm` |
