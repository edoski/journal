# Study home

The study home at `/`: what to study now, at the start of a day or a session, in one window. `data-slot="study-home"`. Edo picked it over the composer at `/` on 13 Nov 2026; the Home switch is gone, and the composer is the draft at `/chat/new`. On 18 Nov 2026 he added the compact course composer at its foot, so a lesson starts from Home without leaving it.

Explore mode ran twice on 12 Nov 2026 and built split, map-first and path homes beside the agenda; on 13 Nov Edo kept the agenda and those three were deleted. The page frame is `home-frame.tsx` (lessons.md).

## What shows, and why

| Element | Shows | Data | Why it earns its place |
|---|---|---|---|
| Course map | the selected course's map, faded at its edges, centred on "You are here" (home-map.md) | the course's `map`, already in `/api/study` | where he is and what is not started yet, in one picture; it also carries what the Exams section said (dashed topics are what's left before the exam) |
| Course tabs | every course, in Today's order; opens on Today's first line's course | the same | a handful of courses; one click compares paths without leaving Home |
| Today | each session to pick up, then every step each course's plan holds today (today.md) | `map` + `plan`'s `due` and run-up, sessions to pick up | the next action, not a to-do list (GTD's next action; Things' Today holds only what you'll do today) |
| Composer | the course composer, compact, with a course control that starts on the map's course (`../course-page/course-composer.md`, Home) | `/api/courses` | a question or a topic of his own starts from Home, in the course he is looking at (Edo, 18 Nov 2026) |

## What is cut, and why

| Cut | Why |
|---|---|
| Now card | it repeated the first line |
| First line's button | the blue Open looked ugly (Edo, 13 Nov 2026); every line opens its lesson |
| "Home" title | the sidebar and the day say where he is; the row goes to the map |
| This week | future reviews can't be done now (Things: Today holds only what you'll work on today) |
| Exams | readiness is the map's dashed topics; no line says "Exam in N days" (Edo, 12 Nov 2026) |
| Topic strips and bands | the map draws the same, and better |
| Gap sentence, weak marks, last studied | they don't change what he picks; weakness stays on the map's nodes and the topic page |
| A second waiting session in a course, reviews past the plan's five | the sidebar lists every session waiting on him; the tutor brings the rest back on later days |

## Anatomy

| Part | Notes |
|---|---|
| chrome | the 52px drag strip and the sidebar toggle, as the composer's |
| column | the pages' own column, `PAGE_COLUMN`: up to 80rem, 24px sides, 24px under the 52px band, so the tabs start where a course or topic page's head does, at x=280, y=76 in his window; the page never scrolls: the map takes half the column (it shrinks to 192px at least when Today needs more), Today the rest |
| map | `home-map` (home-map.md), half the column (Edo, 12 Nov 2026: smaller, so Today's rows lead); enlarged, the whole column |
| Today | `today` (today.md), 20px under the map |
| composer | `HomeComposer`, centred at 46rem, 44px at rest plus 16px above it, at the column's foot; it opens over the map's share while focused or holding words, so the page still never scrolls |

Type: 13/18 at 400 and 500 for lines, 12/16 for meta, the tabs' 13; two weights in the body (400, 500) plus 600 on the heading and "Your turn". One accent (`link`) for "Your turn"; no fills.

## Width

Edo's notes, 15 Nov 2026, N1: a wider Home gives the map more room, "but also the rows below would get wider … is there any super useful info at all that we could cleanly fit into it". Home's column is the course page's frame (`HOME_WIDTH`, 80rem, as `PageFrame`), and each Today row on one topic says where he stands on it (`agenda-rows/row-standing.ts`), in its own column before the row's ends (hybrid.md, "Standing"). He picked it over the old 960px Home and over a candidate with the course's exam day on its first row, the same day.

## Keys

Home owns its keys (`home-keys.ts`, `useHomeKeys`), window-wide while it is mounted and in the capture phase, so they run before the page's arrows (`spatial-arrows.ts`). Today walks as every page's list does (`useListWalk`, `../list-walk/list-walk.md`), with no head: the map above it stays out of the walk (N3). Letters type into the composer (Edo, 18 Nov 2026), so Home's own keys are arrows and ⌘ chords, the registry's bindings. None fires while a dialog, menu or popover is open, and only ⌘E while he types in a field. The ? sheet lists them under Home.

| Key | What it does |
|---|---|
| ← → | the map shows the course left or right of the chosen one, from anywhere on the page outside the map (the map's cards, tabs and arc list keep their own arrows); past the first or last tab the key is the page's again, so ← still reaches the sidebar (Edo's notes, 15 Nov 2026, N2) |
| ⌘E | presses the map's enlarge button: the map takes Home, and ⌘E again brings it back (N2; f until 18 Nov 2026), from the composer too |
| ↑ ↓ | walk only Today's lines, the lessons Also today folds in included, never the tabs or the map above them: with nothing focused ↓ takes the first and ↑ the last, and at either end focus stays, ↑ on the first line included (N3) |
| Home End | jump to Today's first or last line, as on every page's list |
| Esc | leaves the walk |
| ↵ | opens the focused line, as a click does, as on every page (o until 18 Nov 2026) |
| ⌘↵ | opens the focused line's course page (N3); with no line focused, the page of the course whose map shows (N4; c until 18 Nov 2026); in the composer it sends |

## States

| State | Shows |
|---|---|
| loading | "Reading your courses…" (`PageReading`, `../page-frame/page-frame.md`, "Notices", as every page says it), only before this window has read Home once; a later visit shows the last Home read until its own read lands (round 12, 1 m8). The sessions and the courses land each on their own, so Today lists the live lesson and drops a line a session finished since the courses were read, without waiting on the engine (round 13, 3 N3, 1 n1) |
| engine unavailable | `CoursesUnavailable` with its fix, in the page's notice (`PageNotice`), as every page |
| read failed | "Couldn't read your courses." with Try again |
| no courses | "No courses yet. Start a lesson from New lesson and pick a course there." |
| one course unreadable | the others, then one line per unreadable course under Today: its name (the title a linked session carries, else its folder's), then "Couldn't read this course's record." and why in plain words: "Its file is damaged.", "macOS won't let the app open its files: Get Info on the course folder in Finder shows who can read it." or "Its file can't be opened." (`unreadable-course.tsx`); with no readable course, only those lines |
| map enlarged | the tabs and the map fill Home; Today is hidden until Esc or the same control |

## Scenarios checked (seeded demo, 12 Nov 2026)

| Scenario | First line | Result |
|---|---|---|
| Start of day, reviews due | Review Random variables…, Probability, Exam in 11 days, Steps 2–3 of 5, Continue | acts in one look |
| A turn waiting | Eigenvalues and eigenvectors, Linear Algebra, Your turn, Open | the session first; its course's reviews return once it's done |
| Exam two days away | Probability's review, Exam in 2 days | the map opens on Probability with its not-started topics dashed |
| Nothing due | Continue Bayes' rule, Step 3 of 5 | lines never go empty while a course has a current topic |
| Five courses | five lines, no page scroll, map about 322px tall at 1280×800 | a sixth course folds into "Also today" |

Not available from the engine: how long a lesson takes (no line shows time), and which topic a session is about (a waiting line shows "Your turn", not a step). The order across courses (`byUrgency`) is the app's own until the engine names the day's order.

## Sources

Research of 12 Nov 2026: Anki's studying and deck options docs (what a deck overview leads with), RemNote's daily learning goal, Duolingo's home path redesign (progress down the path, a button back to your spot), Linear My Issues (an explicit focus order), Things Today, Sunsama's daily planning, GTD's next-action list, Apple's WWDC20 widgets session (the most useful piece of content, few facts), Kellogg on choice overload, the implementation-intentions meta-analysis (helping people start). Earlier: Few's dashboard and bullet-graph writing, shadcn dashboard and Card.
