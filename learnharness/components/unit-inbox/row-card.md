# Row card

The sidebar's two-line card shell, `row-card.tsx` (`RowCard`), with the row parts every sidebar row shares: `rowSurface`, `TRAILING_SLOT`, `STATUS_SLOT`, `ROW_BODY`, `ROW_TITLE`, `ROW_ACTION` and `CARD_ACTION_PLACE`. `TopicCard` (`unit-row.tsx`, search's topic rows) and `NowCard` (`now-card.tsx`, Today's cards) are this shell with their own slots, so the two never drift.

## Anatomy

| Part | Element | Notes |
|---|---|---|
| item | `li`, `data-slot="unit-card"` | 2px above and below (`py-0.5`): a 65px pitch |
| card | the link, `data-testid="unit-row"` | 60px at least, padding 8 × 10, radius 8, no surface; `data-sidebar-row` (`rowKey`) and `data-sidebar-parent` (`parent`) for the keyboard walk (`sidebar-tree.ts`) |
| line 1 | `mark`, course name, status slot | 20px: the 16px mark, the course name 12/400 muted (`data-slot="unit-card-course"`), then `data-slot="unit-status-slot"`, right-aligned, 12px tabular muted (`STATUS_SLOT`). The name never wraps and the status keeps every word: when the two do not fit side by side, the status gives way by dropping to a line of its own under the name, right-aligned, and the card grows by that 20px line. Only a name wider than the whole line ends in an ellipsis |
| line 2 | title | 14/500, full ink, 4px below line 1, wrapping onto a second line rather than cut |
| action | `action`, over the slot | `ROW_ACTION` placed by `CARD_ACTION_PLACE`; the slot fades while the row is hovered or the action has keyboard focus |

## Props

| Prop | Notes |
|---|---|
| `recede` | 70% until its row is hovered or anything in it has keyboard focus (`group-hover`, `group-has-[:focus-visible]`), so it stays lit while the pointer or focus moves onto its action: the tutor writes in it |
| `active` | the open page: `fill-selected` and `aria-current="page"` |

## States

Rest (no fill), hover (`fill-hover`, the action shows), keyboard focus (a 2px inset ring), open page (`fill-selected`), receding (70%). Long titles wrap; the course name stays on one line; the status keeps its words and its right edge, under the name when it does not fit beside it. Shelf rows (`unit-row.tsx`) put the title and status in `ROW_BODY`: one line when both fit, else the status drops under the title.

Sources: T3 Code's sidebar thread row; unit-inbox.md, "Anatomy".
