# CourseTopicRow

One topic on a course page (course-page.md), drawn by the split page's list. `course-topic-row.tsx`; `data-slot` `course-topic` (the list item), `course-topic-row` (the link, with `data-group` naming its group), `course-topic-title`, `course-topic-fact` (with `data-kind`). Rows sit in a `ul`, usually a `CourseGroup`'s (course-group.md).

## Anatomy, left to right

| Slot | Notes |
|---|---|
| pie | the topic map's 16px `TopicGlyph` (topic-map.md): dashed and empty for a topic not started, a quarter more for each step towards doing it on his own, full once he can, the warning ink on a slip; 16 before the title |
| title | 13/18 at 500, whole, wrapping to a second line before the fact gives way (round 11, 1 N8), never cut (round 15, 1 m8: "Random variables and distribu…" beside an empty map half); muted ink for a topic not started. His standing in the map's words follows for a screen reader only ("Kernel, Learning") |
| fact | flush right on one edge for every row, its words always shown and whole, never cut and never an icon alone (round 11, 1 N8: a bare arrow, bookmark or check-circle sat beside rows with words): the title gives way first, onto a second line. The row says the fact in the sidebar's and the map card's words (`factWords`): "Due since 6 Nov", "Due since 6 Nov, back 20 Nov" (round 15, m10: "Due 6 Nov" and "Back 20 Nov" disagreed with the Now row and the card); a planned start by its date, "Planned 18 Nov"; a start the exam ahead puts after it, "Not before the exam" for an exam topic with no room, "Not on the exam" for one it leaves out (round 15, M7); a mixed-up method as "Mixed up". The hover hint always says the sidebar's whole sentence, 12/16 at 400 muted with a 14px icon 6 before the words; "Your turn" in the accent at 500. Drawn as `StatusMark` (`../unit-inbox/status-mark.md`), `whole`. Icons: the one every surface wears for the same fact (`FACT_ICON`): a turn that waits (message-circle-question), the tutor stopped (pause), a slip (circle-x), a review (history), an open task (bookmark), today's new topic (arrow-right); a topic coming back (calendar-clock; the calendar's alarm clock means overdue); the tutor writing (the braille spinner); map-pin for "You are here". How long since he studied it has no icon, as on the sidebar. No fact, no slot |

## Sizes and states

| Prop | Notes |
|---|---|
| default | 36px at least, growing with a title on two lines |
| `compact` | 32px at least; the fact's words show as on every row |
| `detail` | a second line under the title, 13/18 muted, two lines at most; the row grows to fit (8 above and below) and the pie aligns with the title |
| `highlighted` | holds the hover fill, for a page that ties the row to something else he points at |

- Rest: no surface (Edo, 13 Nov 2026: no card background on rows); a 1px hairline at 50% `border` above every row but the first, across the column.
- Hover: `fill-hover`, radius 8, reaching 12px past the column on both sides (Home's hybrid row), 150ms on colour only.
- Focus: a 2px `ring`.
- Current topic: `aria-current="location"`.
- A click opens the topic's page (`unitHref`); every other link prop (pointer and focus handlers) reaches the link.

## Sources

Home's hybrid row (hybrid.md: no surface, hairline, bleed, facts flush right); the sidebar's one-line shelf row and its status icons (unit-inbox.md); shadcn table (`p-2` on `text-sm`, a 36px row); the course page research's targets 8 to 13.
