# SuggestionsToday (candidate C)

`data-slot="today-suggestions"`, each row `data-slot="today-suggestion"`. Today is the question and the composer; what is waiting shows as up to three requests under it.

## Anatomy

| Slot | Notes |
|---|---|
| row | 32px quiet row, text inset 16, 4% fill on hover |
| icon | `CornerDownRight`, 14px, muted |
| request | 13/400 muted, `foreground` on hover: "Review Linear independence, Span and more", "Continue Problem sheet 4", "Continue Rank and the column space" |
| course | trailing 12/400 label, only when the suggestions span more than one course |

No exam countdown here: it lives on the course's header in the sidebar. Nothing waiting: nothing renders, the composer alone.

## Choice and behaviour

Each course's first step in `byPriority` order (today-waiting.md), then each one's second step, at most three. A click puts the request in the composer, chooses its course, and focuses the field; nothing is sent until Enter, so the learner can edit it ("…, but only proofs").

## Sources

Claude's starter prompts under the composer; NN/g on prompt suggestions (contextual, specific, placed by the input); T3 Code's composer-first new chat; HIG Widgets (deep link to the action). research/design-directions.md, section 2, direction C.
