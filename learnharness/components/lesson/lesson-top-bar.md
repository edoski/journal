# LessonTopBar

The session's top bar, rendered in the shared `TopBar` at `size="slim"` (52px, padding 0 16). It names no phase and holds no details menu: Edo, 14 Nov 2026, called the "Teaching" label pointless and the session-details popover (tutor, room left, cost) totally pointless.

## Anatomy, left to right

| Slot | Notes |
|---|---|
| sidebar toggle | `TopBar`'s own, only while the sidebar is closed |
| course | 14 `muted-foreground`, first, at most 160px, truncates before the title does (`shrink-[2]`), then a 14px chevron at 60%. A link to the course's page, where its map is (`courseHref`, components/course-page/course-page.md), lifting to full ink on hover as shadcn's breadcrumb link does, with a 2px focus ring; with no course page to open it stays plain text |
| topic | the same crumb, a link to the topic's page (`unitHref`), shown only when the topic's words are not the title's (`topicCrumbShown`): a lesson named after its topic would say the same thing twice. The topic comes from the course map when the page opens (`lessonPlace`, src/server/lesson-place.ts) |
| title | 14 at 500 (`text-control font-medium`), after the crumbs as T3 Code's breadcrumb does (project › thread); truncates; a click (or F2) renames it in place, the input in the same style |
| roadmap | where the lesson is in its plan (`LessonRoadmap`, lesson-roadmap.md), right-aligned |
| done for today | outlined 32px pill with a circle-check icon and "Done for today" at 13/400 (`LESSON_WORDS.doneTonight`), its tooltip "Stop here for today" with ⌘⇧D; stops the session whatever is open: a waiting check is left unanswered with its answer hidden, an open problem is dropped, and the tutor closes (done-tonight.tsx). Waits while a turn runs; gone once the session stopped for the day |

The agent's machinery (tutor, room left before the tutor sums up, cost) is not in the lesson. Compaction still announces itself where it happens: a line under the transcript says "Compacting the conversation…" while it runs (he can still answer, and the reply waits for it), and the cut leaves a hairline in the transcript.

## Sources

T3 Code's 52px top bar and 13px secondary text; shadcn's breadcrumb; Edo's rulings of 14 Nov 2026.
