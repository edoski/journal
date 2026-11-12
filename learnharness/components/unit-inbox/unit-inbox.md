# Unit inbox

The Proposed sidebar as a study inbox (`unit-sidebar.tsx`): every course topic the learner has started, on one of three shelves, holding the sessions that worked on it. The three Explore candidates (`outline/`, `page/`, `resume/`) share everything here and differ only in the unit row: how it holds its sessions and what a click does.

## Shelves

| Shelf | A topic is on it when | Order | Row's trailing fact |
|---|---|---|---|
| Learning | taught and not yet solid (`introduced`, `attempted`, `assisted`), or one of its sessions waits on the learner or runs | waiting first, then the most recently studied | Your turn, the spinner, else how long ago it was studied in the app |
| Review | solid (`independent` and up) and its spaced review is due today | weak first, then the longest past due | none: the shelf says it |
| Known | solid and not due | the soonest back first | when it comes back (`in 5d`, `in 3w`) |
| Other sessions | sessions tied to no listed topic: a general question, or older than the course rule | newest first | the session row's own |

A topic not started (`new`) is not listed: the tutor routes there. The engine owns every level and date (`units.ts` names them; it judges nothing). Learning and Review start open; Known and Other start folded, and long ones show 10 rows, then "Show all". A folded shelf keeps the open row in view and shows a 6px accent dot when a hidden row waits on the learner. Folding and the course scope persist (`lh:unit-inbox-folded`, `lh:unit-inbox-scope`).

## Sessions to topics

A session's topics come from its own transcript (`sessionTopicsOf` in `src/core/native-messages.ts`): the topics of each problem it posed and observation it saved, the topics a save introduced, and plan nodes named after a topic. Only topics the course map lists count. A session on two topics is under both.

## Anatomy

| Part | Notes |
|---|---|
| top rows | New lesson, Home, Search (the Proposed sidebar's, without Map) |
| course scope | `course-scope.tsx`: All courses or one, as a 32px row-shaped dropdown; each course shows its exam countdown |
| shelf header | `unit-shelf.tsx`, `data-slot="unit-section-header"`: 32px button, 12/16 at 500 muted, the count in tabular figures, a chevron that shows on hover and turns -90° folded |
| search | topics and sessions whose titles match, under Topics and Sessions; ↑/↓ and Enter walk the sessions |
| Study this | `start-unit.ts`: a new session in the topic's course opened on its title, as the course map's Study this |

## Sources

T3 Code's sidebar (`apps/web/src/components/Sidebar.tsx`, `Sidebar.logic.ts`): one classifier for every section, shelves with counts and chevrons, the open row kept in view when folded, the settled tail of 10, one status slot per row. Shelf names and rules: RemNote's Currently studying and Maintaining, Anki's Learn and Due, FSRS (a known item is on a timer, never done), Hartwig and Dunlosky 2012 (learners pick by deadline, so no overdue counts), Kornell and Bjork 2008 (the system picks). The research synthesis is in the thread's design note.
