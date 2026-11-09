# Chain table (Proposed)

The course's chains as a table: on Knowledge (Chains) and as the practice picker on Today and the draft. `chain-table.tsx`; the classes per design live in its `LOOK` map, the geometry (indents, the thread lines measured to the checkbox) is shared by both designs.

| Slot | Notes |
|---|---|
| surface | the page background at 80% with a blur (owner, 2026-09-29: the translucent surface is the overlay) |
| top bar | the shared `TopBar`: counts 13px muted tabular; search 32px, radius 8, `input` edge, 13px, 14px icon; quiet 32px ✕ |
| header | 32px band over a hairline, 12/16 at 500, muted, sentence case: Name, Statements, Created; the active column's 14px chevron 8px after its word |
| cluster row | 13/18 at 500, `fill-hover` on hover; "Notes" tag and "Unlabeled" in 12px or 13px muted, sentence case; counts and dates 12px tabular in fixed 80 and 96px columns |
| chain row | the premises and conclusion as chips (radius 8, `fill-selected`, 13px) joined by ∧ and ⟹ |
| statement row | 13/18 muted |
| controls | expand chevrons are 24px targets over the 14px slot; checkboxes draw a 2px ring on keyboard focus |
| selection bar | a pill on `popover`: summary 13px, Clear quiet, Done in the accent, Delete in `danger` ink, 32px each |

Sources: Linear and Finder list views (one hairline per group, tabular numbers in right-aligned columns), WCAG 2.5.8 (24px targets), the polish plan's "graph and chain table as course content".
