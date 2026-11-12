# StudyHome

The Proposed design's study home at `/`: where studying stands across every course, separate from the composer (New lesson, `/chat/new`). `data-slot="study-home"`. It sits behind the `home` group in the Logbook guide (Current, Proposed; Proposed wears Design's Proposed): on Proposed `/` is the home, on Current `/` is the composer, the surface as it was. Production resolves to Current. Shipping deletes the `home` group and `useHomeVariant`, and `/` becomes the home.

The body is the agenda (`agenda.tsx`, agenda.md): time-first, one list from now to the last exam, courses as labels rather than containers. Explore mode (12 Nov 2026) also built a course-cards and a one-table candidate; Edo picked the agenda and the others were deleted.

## Anatomy

| Part | Notes |
|---|---|
| chrome | the 52px drag strip and the sidebar toggle, as the composer's |
| column | 736px, 32px sides, 64px above, scrolls under the toggle |
| heading | `study-home-heading`: the engine's study day ("Sunday 8 November", 12/16 muted) over "Home" (20/26 at 600), 32px above the body |
| section head | 12/16 at 600, muted, sentence case |
| row text | 13/18 at 400; meta 12/16 at 400 muted; course names 14/20 at 600 |
| waiting row | `waiting-row`: 40px, a 6px accent dot, the session's title, its course in meta, "Your turn" 12 at 600 in `link`; opens the session |
| topic strip | `topic-strip` (topic-strip.md) |
| Continue | shadcn `Button`, `secondary` `sm` 32px on a course, primary 36px for Now, label 13 at 400; opens a lesson in the course with "Let's continue" through `useLessonStart` (setup when models or keys are missing, the model picker when the model is unavailable) |

Five type styles and two weights (400, 600), radii 8 and 12, one raised tone (`card`), one accent (`link`) for "needs you" and amber (`warning`) only under a weak topic.

## States

| State | Shows |
|---|---|
| loading | "Reading your courses…" |
| engine unavailable | `CoursesUnavailable` with its fix |
| read failed | "Couldn't read your courses." with Try again |
| no courses | "No courses yet. Start a lesson from New lesson and pick a course there." |
| one course unreadable | the others, then "Couldn't read one course: <folder>" |
| ready | the heading and the agenda |

## Data

`GET /api/study` (`src/server/study.ts`): every listed course's `map` (levels, reviews, weak verdicts and gaps, exam, current topic, tasks) joined with its `plan` (`runup.unready`, `last_activity`), plus `GET /api/chats` for the sessions whose turn is the learner's (`sessionState`). The app judges no standing: bands group the engine's levels (`study-facts.ts`), every other word is an engine field. Reviews are named by topic and never counted. The one cross-course order (`byUrgency`: in the exam run-up first, nearest exam first, then the most recent activity) is temporary until the engine names the day's course.

Not available from the engine: how long the due reviews would take. The home shows no time.

## Sources

`research` brief of 12 Nov 2026: Few, *Why Most Dashboards Fail* and the bullet graph spec (context for every number, three qualitative bands, greyscale plus one accent); Apple HIG Charts, Gauges, Widgets and Typography (a sentence states the message, discrete segments for small ranges, show freshness, 11pt floor); Linear My Issues and Pulse (one best next step by an explicit rule); Things Today and Upcoming (today short, the week day by day); shadcn dashboard and Card (16px gaps, 12px card radius).
