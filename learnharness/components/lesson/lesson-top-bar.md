# LessonTopBar

The session's top bar, rendered in the shared `TopBar` at `size="slim"` (52px, padding 0 16). It names no phase and holds no details menu: Edo, 14 Nov 2026, called the "Teaching" label pointless and the session-details popover (tutor, room left, cost) totally pointless.

## Anatomy, left to right

| Slot | Notes |
|---|---|
| sidebar toggle | `TopBar`'s own, only while the sidebar is closed |
| trail | the app's one trail (`Crumbs`, `../nav/crumbs.md`), the topic page's head's, ending on the title |
| course | the first crumb: 14 `muted-foreground`, as wide as its words, truncating only when the bar is full and before the title does, then a 14px chevron at 60%. A link to the course's page, where its map is (`courseHref`, components/course-page/course-page.md); with no course page to open it stays plain text |
| topic | the next crumb, a link to the topic's page (`unitHref`). When the title reads the same (`topicCrumbShown`), the topic crumb ends the trail and the title is not drawn twice, so a lesson named after its topic still links to its topic's page (round 8: "Linear Algebra › Eigenvalues and eigenvectors" ended on plain text); F2 still renames it. The topic comes from the course map when the page opens (`lessonPlace`, src/server/lesson-place.ts) |
| title | 14 at 500 (`text-control font-medium`), after the crumbs as T3 Code's breadcrumb does (project › thread); truncates; a click (or F2) renames it in place, the input in the same style |
| roadmap | where the lesson is in its plan (`LessonRoadmap`, lesson-roadmap.md), right-aligned |
| done for today | outlined 32px pill with a circle-check icon and "Done for today" at 13/400 (`LESSON_WORDS.doneTonight`), its tooltip "Stop here for today" with ⌘⇧D; stops the session whatever is open: a waiting check is left unanswered with its answer hidden, an open problem is dropped, and the tutor closes (done-tonight.tsx). While the tutor is writing it stops that reply, keeping what it wrote, and closes, and the server does the same for a turn it started itself, such as the switch from practice to teaching (round 7: Done was refused there and the lesson went on); once the session stopped for the day it is unseen and out of reach but keeps its room, so the roadmap beside it never moves (round 6: the strip jumped 146px under the pointer) |

The trail names no arc: the roadmap beside it already names the lesson's arc by its label (lesson-roadmap.md), and Edo's place for an arc is that label, never words after the course (14 Nov 2026), so naming it twice in one 52px bar would only crowd the title (audit 17 Nov 2026, finding 14).

The agent's machinery (tutor, room left before the tutor sums up, cost) is not in the lesson. Compaction has no line of its own: Claude Code compacts inside a turn, so the turn's "Thinking…" covers it, and the cut draws nothing in the transcript (round 8).

## Sources

T3 Code's 52px top bar and 13px secondary text; shadcn's breadcrumb; Edo's rulings of 14 Nov 2026.
