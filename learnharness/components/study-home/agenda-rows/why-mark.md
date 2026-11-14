# Why mark

Why a line is on Today, as an icon and a few words. `why-mark.tsx` (`WhyMark`, `WHY_ICON`). Drawn by Home's hybrid rows (`agenda-rows/hybrid`), and by the sidebar's status slot (`unit-inbox/now-card.tsx`); the course page's header takes its icons from `WHY_ICON`.

## Anatomy

| Part | Notes |
|---|---|
| icon | one per kind of reason (`WHY_ICON`): a turn that waits, the question bubble; a miss, a crossed circle; a review, History; an open task, a bookmark; the next topic, an arrow |
| words | `whyOf`'s `short` ("Your turn", "3d overdue", "Missed Chain rule", "At part (c)", "Next up"), or the caller's `words` (the sidebar's `NowLine.slot`: "Missed last time" on the lead topic itself, a task's step up to its first colon); one line, truncated |

## Sizes

| Size | Where | Icon | Gap | Width | `data-slot` |
|---|---|---|---|---|---|
| `row` (default) | Home's hybrid row, the lesson line's end | 14px | 6px | up to 224, flush right in its grid cell | `today-why` |
| `slot` | a sidebar card's status slot | 12px (T3 Code's `size-3` status icon) | 4px | its slot's width; the words truncate, the icon stays | `why-mark` |

## Tokens and states

- 12px text (`text-label`). A turn that waits ("Your turn") is `link` at 500; every other reason is `muted-foreground` at 400.
- No reason (`why` null): an empty span, so a grid keeps its cell.
- `slot` puts a screen-reader comma before its words, so a card reads "Linear Algebra, Your turn, Eigenvalues".

Sources: T3 Code's sidebar status label (`size-3` icon, 12px); hybrid.md (Edo, 13 Nov 2026: reasons as icons and a few literal words, never sentences).
