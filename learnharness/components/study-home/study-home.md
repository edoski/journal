# StudyHome

The Proposed design's study home at `/`: what to study now, at the start of a day or a session, in one window. `data-slot="study-home"`. It sits behind the `home` group in the Logbook guide (Current, Proposed; Proposed wears Design's Proposed): on Proposed `/` is the home, on Current `/` is the composer, the surface as it was. Production resolves to Current. Shipping deletes the `home` group and `useHomeVariant`, and `/` becomes the home.

Explore mode (12 Nov 2026) built three candidates (course cards, an agenda, one table); Edo picked the agenda and asked for only what picking the next lesson needs. This spec is that pass's conclusion.

## What shows, and why

| Element | Shows | Data | Why it earns its place |
|---|---|---|---|
| Course map | the selected course's map, faded at its edges, centred on "You are here" (home-map.md) | the course's `map`, already in `/api/study` | where he is and what is not started yet, in one picture; it also carries what the Exams section said (dashed topics are what's left before the exam) |
| Course tabs | every course, in Today's order; opens on Today's first line's course | the same | a handful of courses; one click compares paths without leaving Home |
| Today | one line per course: its one next lesson (today.md) | `map` + `plan`'s `due` and run-up, waiting sessions | the next action, not a to-do list (GTD's next action; Things' Today holds only what you'll do today) |
| First line's button | the page's only primary action, Continue or Open | the first line | one decision at session start (choice overload grows with harder decisions) |
| The study day | "Today Sunday 8 November", on Today's heading | the engine's `today` | freshness without a title row |

## What is cut, and why

| Cut | Why |
|---|---|
| Now card | it repeated the first line; the first line holds the primary action instead |
| "Home" title | the sidebar and the day say where he is; the row goes to the map |
| This week | future reviews can't be done now (Things: Today holds only what you'll work on today) |
| Exams | the countdown moves onto a course's line inside its run-up; readiness is the map's dashed topics |
| Topic strips and bands | the map draws the same, and better |
| Gap sentence, weak marks, last studied | they don't change what he picks; weakness stays in the map's topic detail |
| A second waiting session in a course, reviews past the plan's five | the sidebar lists every session waiting on him; the tutor brings the rest back on later days |

## Anatomy

| Part | Notes |
|---|---|
| chrome | the 52px drag strip and the sidebar toggle, as the composer's |
| column | 960px, 32px sides, 52px above, 24px below; the page never scrolls: the map takes what Today leaves |
| map | `home-map` (home-map.md), at least what remains above Today |
| Today | `today` (today.md), 20px under the map |

Type: 13/18 at 400 and 500 for lines, 12/16 for meta, the tabs' 13; two weights in the body (400, 500) plus 600 on the heading and "Your turn". One accent (`link`) for "Your turn"; the primary button is the only fill.

## States

| State | Shows |
|---|---|
| loading | "Reading your courses…" |
| engine unavailable | `CoursesUnavailable` with its fix |
| read failed | "Couldn't read your courses." with Try again |
| no courses | "No courses yet. Start a lesson from New lesson and pick a course there." |
| one course unreadable | the others, then "Couldn't read one course: <folder>" |
| map enlarged | the tabs and the map fill Home; Today is hidden until Esc or the same control |

## Scenarios checked (seeded demo, 12 Nov 2026)

| Scenario | First line | Result |
|---|---|---|
| Start of day, reviews due | Review Random variables…, Probability, Exam in 11 days, Steps 2–3 of 5, Continue | acts in one look |
| A turn waiting | Eigenvalues and eigenvectors, Linear Algebra, Your turn, Open | the session first; its course's reviews return once it's done |
| Exam two days away | Probability's review, Exam in 2 days | the map opens on Probability with its not-started topics dashed |
| Nothing due | Continue Bayes' rule, Step 3 of 5 | lines never go empty while a course has a current topic |
| Five courses | five lines, no page scroll, map about 376px tall at 1280×800 | a sixth course folds into "Also today" |

Not available from the engine: how long a lesson takes (no line shows time), and which topic a session is about (a waiting line shows "Your turn", not a step). The order across courses (`byUrgency`) is the app's own until the engine names the day's order.

## Sources

Research of 12 Nov 2026: Anki's studying and deck options docs (what a deck overview leads with), RemNote's daily learning goal, Duolingo's home path redesign (progress down the path, a button back to your spot), Linear My Issues (an explicit focus order), Things Today, Sunsama's daily planning, GTD's next-action list, Apple's WWDC20 widgets session (the most useful piece of content, few facts), Kellogg on choice overload, the implementation-intentions meta-analysis (helping people start). Earlier: Few's dashboard and bullet-graph writing, shadcn dashboard and Card.
