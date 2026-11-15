# CourseGroup

A group of topics on a course page (course-page.md): its header over its rows. `course-group.tsx`; `data-slot` `course-group` (the section, labelled by its header), `course-group-header`, `course-group-more`.

The header is the sidebar's `NavSection` anatomy (nav-section.md: a 28px band, 12/16 at 500, sentence case, muted; no count, since a bare number told him nothing, 13 Nov 2026). It is its own component because NavSection's label sits 8px in, on a sidebar row's label edge, while a course page's rows start their glyph on the column's edge, and because a group can fold, which NavSection cannot.

## Anatomy

| Slot | Notes |
|---|---|
| header | 28px; the name, then, on a foldable group, a 14px chevron 4 after it (pointing right while folded) |
| rows | `CourseTopicRow`s in a `ul`, right under the header |
| more | with `limit`, after the first rows: a 36px row with a 16px chevron and "Show the rest" (`moreWords`) at 13/18 muted, full ink and the hover fill on hover; it shows the rest |

## Props and states

- `foldable`: the group is a shadcn Collapsible whose header is its trigger, a button (`aria-expanded`) that folds the rows away, like the sidebar's Known shelf; hover lifts it to full ink; 2px focus ring. `defaultFolded` starts it folded; `open` and `onOpenChange` let a page hold it (the course page does, for its arrow walk), and `headerRef` and `onHeaderKeyDown` give that page the header's button and keys.
- `limit`: rows shown before Show more.
- Neither is stored: each visit starts as the page draws it, so there is nothing for him to keep tidy. A folded group's rows are not drawn.
- An empty group still draws its header with 0; the page may leave it out.

## Sources

nav-section.md (header type and band); the sidebar's shelf (unit-shelf.tsx: fold, chevron, Show more); the course page research's targets 7 and 14.
