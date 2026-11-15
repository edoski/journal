# CourseTopicRow

One topic on a course page (course-page.md), drawn by the split page's list. `course-topic-row.tsx`; `data-slot` `course-topic` (the list item), `course-topic-row` (the link, with `data-group` naming its group), `course-topic-title`, `course-topic-fact` (with `data-kind`). Rows sit in a `ul`, usually a `CourseGroup`'s (course-group.md).

## Anatomy, left to right

| Slot | Notes |
|---|---|
| pie | the topic map's 16px `TopicGlyph` (topic-map.md): dashed and empty for a topic not started, a quarter more for each step towards doing it on his own, full once he can, the warning ink on a slip; 16 before the title |
| title | 13/18 at 500, one line, truncates; muted ink for a topic not started. His standing in the map's words follows for a screen reader only ("Kernel, Learning") |
| fact | flush right on one edge for every row, at most 224px, 12/16 at 400 muted with a 14px icon 6 before the words; "Your turn" in the accent at 500. Icons: the sidebar's and Today's for the same fact (`WHY_ICON`): a turn that waits (message-circle-question), the tutor stopped (pause), a slip (circle-x), a review (history), an open task (bookmark), today's new topic (arrow-right); a topic coming back (calendar-clock; the calendar's alarm clock means overdue); the tutor writing (the braille spinner); map-pin for "You are here". How long since he studied it has no icon, as on the sidebar, and keeps its words on a compact row. No fact, no slot |

## Sizes and states

| Prop | Notes |
|---|---|
| default | 36px, one line |
| `compact` | 32px; the fact shows as its icon alone, its words in a hint (left) and for a screen reader |
| `detail` | a second line under the title, 13/18 muted, two lines at most; the row grows to fit (8 above and below) and the pie aligns with the title |
| `highlighted` | holds the hover fill, for a page that ties the row to something else he points at |

- Rest: no surface (Edo, 13 Nov 2026: no card background on rows); a 1px hairline at 50% `border` above every row but the first, across the column.
- Hover: `fill-hover`, radius 8, reaching 12px past the column on both sides (Home's hybrid row), 150ms on colour only.
- Focus: a 2px `ring`.
- Current topic: `aria-current="location"`.
- A click opens the topic's page (`unitHref`); every other link prop (pointer and focus handlers) reaches the link.

## Sources

Home's hybrid row (hybrid.md: no surface, hairline, bleed, facts flush right); the sidebar's one-line shelf row and its status icons (unit-inbox.md); shadcn table (`p-2` on `text-sm`, a 36px row); the course page research's targets 8 to 13.
