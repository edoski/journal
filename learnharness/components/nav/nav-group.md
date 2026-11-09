# NavGroup

A collapsible group of sidebar rows: one course and its sessions. shadcn `Collapsible` (Radix), `data-slot` `nav-group`, `nav-group-header`, `nav-group-trailing`, `nav-group-attention`, `nav-group-content`. The root is a `role="group"` labelled by the course name.

## Anatomy

| Slot | Element | Notes |
|---|---|---|
| header | `CollapsibleTrigger` button | a real row: 32px, radius 8, padding 0 8, gap 8, hover `fill-hover`, 2px `ring` on focus-visible; `aria-expanded` |
| glyph | `icon` | 16px lucide, `muted-foreground`: a book for a course, a dashed circle for No course |
| name | `span` | 14/20, weight 500, `foreground` at 90%, full on hover; starts 32px into the row |
| trailing | `span` | the same column as `NavRowTrailing`: at least 32px, 24px high, right-aligned, 12/16 tabular `muted-foreground` |
| items | `CollapsibleContent` | `NavRow inset` rows, labels on the name's edge (32px), no gap between them |

Groups sit 8px apart (the list's `gap-2`), none above the first.

## The trailing column

| Group | Shows |
|---|---|
| open, at rest | the group's fact: the exam countdown ("Exam in 21 days"), or nothing |
| open, on hover or keyboard focus | the 14px chevron, pointing down, in the fact's place (the fact fades out, so nothing moves) |
| folded | a 6px `link` dot when any hidden session waits on the learner (screen readers hear ", your turn"), then the chevron turned -90° |

The chevron turns and fades in 150ms, off under reduced motion. Folding is per course and persists (`lh:sidebar-collapsed-courses` in local storage, every course open by default). A search shows every match, so it opens folded courses while the query stands and does not change what is stored.

## Sources

Header as a real row (32px, glyph 16, name 14/500 at 90% foreground, chevron trailing, -90° folded, 8px between groups), items inset so their titles start on the name, the folded group's aggregate dot: T3 Code's folder sidebar (`xV` and `oV`, research/design-directions.md 1.2 and 1.4). Disclosure that appears on hover: Apple Mail ("Move your pointer over the name of a section to see a disclosure arrow"). Two levels at most, disclosure for groups: Apple HIG, Sidebars. One accent, so the dot only means "Your turn": findings.md, row 12. Rows 32 rather than T3's 36, so the sidebar keeps one row height: the polish budget (`course-rows` group, heights 1).
