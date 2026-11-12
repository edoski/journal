# Agenda rows: recency

`recency-rows.tsx`, `data-slot` `recency-rows`; lines `today-line` (the first `data-primary`), the trailing fact `today-when`.

Thesis: a course is like a conversation he keeps picking up; how long since he last touched it is what Mail and T3 Code put on every row.

| Part | Notes |
|---|---|
| row | 64px, two lines 4 apart, radius 8 bleeding 12 past the column, hover `fill-hover`; columns: the two lines (fill), action 88; hairlines (`border` at 50%) between rows, full width; no container |
| line 1 | the course 12 muted; at its right end, 12 muted and tabular, "Studied 2 days ago", "Studied yesterday", "Studied 2 weeks ago", "Not studied yet"; a waiting session says "Waiting for your reply" (or "since yesterday") in `link` at 500 instead |
| line 2 | the lesson 14 at 500 in ink, one line |
| action | the first row only, "Open" or "Continue" |

Trade-offs: the tallest rows (five courses take 320px), and the fact is about the course, not this lesson: it tells him what he has neglected (Real Analysis, 11 days), not why the lesson matters.

Sources: T3 Code `SidebarThreadRow` (two lines, compact trailing time), Apple Mail, Raycast list accessories; relative dates read faster than absolute ones (Cloudscape timestamps).
