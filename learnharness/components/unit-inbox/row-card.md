# Row card

The sidebar's card shell, `row-card.tsx` (`RowCard`), with the row parts every sidebar row shares: `rowSurface`, `ROW_ITEM`, `ROW_FRAME`, `rowTitle`, `ROW_BODY`, `STATUS_LINE`, `TRAILING_SLOT`, `STATUS_SLOT`, `ROW_ACTION` and `CARD_ACTION_PLACE`.

## The one row rule

Every sidebar row, card or shelf row, is its title, two lines at most, and one 20px line that holds its status, inside the same 8 × 10 padding (`ROW_FRAME`), 2px above and below (`ROW_ITEM`). Its height follows from its title alone: 60px, or 80px for a title on two lines, with a 4px pitch between rows. A card's status line is its course line; a shelf row's is its own, under the title, right-aligned, never beside it. Round 5 found rows of 36, 60, 80 and 100px, as a status dropped under a title whenever the two did not fit side by side; the status no longer moves with the title's length. `TopicCard` (`unit-row.tsx`, search's topic rows) and `NowCard` (`now-card.tsx`, Today's cards) are this shell with their own slots, so the two never drift.

## Anatomy

| Part | Element | Notes |
|---|---|---|
| item | `li`, `data-slot="unit-card"` | `ROW_ITEM`: 2px above and below |
| card | the link, `data-testid="unit-row"` | `ROW_FRAME`: 60px, or 80px with a two-line title; padding 8 × 10, radius 8, no surface; `data-sidebar-row` (`rowKey`) and `data-sidebar-parent` (`parent`) for the keyboard walk (`sidebar-tree.ts`) |
| line 1 | `mark`, course name, status slot | 20px: the 16px mark, the course name 12/400 muted (`data-slot="unit-card-course"`), then `data-slot="unit-status-slot"`, right-aligned, 12px tabular muted (`STATUS_SLOT`). The line never wraps: the name gives way first, whole, when the two do not fit, never cut to "Linear Alg…" (round 10, 1 m8; the mark still names the course); only words longer than the whole line then end in an ellipsis (`SLOT_WORDS`), the icon kept, never cut at the card's edge (round 14, 1 n7) |
| line 2 | title, `data-slot="unit-row-title"` | T3 Code's thread title, 14/500 on 20 in full ink (`rowTitle(true)`, `text-sidebar-title`), 4px below line 1, two lines at most: it wraps onto a second line and ends in an ellipsis only past it |
| action | `action`, over the slot | `ROW_ACTION` placed by `CARD_ACTION_PLACE`; the slot fades while the row is hovered or the action has keyboard focus |

## Props

| Prop | Notes |
|---|---|
| `recede` | 70% until its row is hovered or anything in it has keyboard focus (`group-hover`, `group-has-[:focus-visible]`), so it stays lit while the pointer or focus moves onto its action: the tutor writes in it |
| `active` | the open page: `fill-selected` and `aria-current="page"` |

## States

Rest (no fill), hover (`fill-hover`, the action shows), keyboard focus (a 2px inset ring), open page (`fill-selected`), receding (70%). Long titles wrap to two lines; the course name stays on one line and gives way first, whole; the status keeps its right edge on line 1 and its words, ending in an ellipsis only when they are longer than the line. Session rows (`unit-row.tsx`, `SessionSlimRow`) put the course mark and the title on their first line (`ROW_BODY`) and the status on a 20px line of its own under it. Their title is T3 Code's quiet row at rest, 14/400 on 20 at 75% ink, full ink on hover or keyboard focus (`text-sidebar-title-quiet`), and the card's 14/500 in full ink while open, highlighted by search's walk, or a session waiting on him (`rowTitle`), as T3 Code's row is quiet only when nothing needs him there. Never bold: Edo, 16 Nov 2026.

Sources: T3 Code's sidebar thread row; unit-inbox.md, "Anatomy".
