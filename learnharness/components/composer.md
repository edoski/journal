# Composer (proposed variant)

`<Composer variant="proposed" toolbar={…} />`: the message field as one rounded surface, shared by Today, the draft at `/chat/new` and (phase 3) the lesson dock. `data-slot="composer"`; the toolbar row `data-slot="composer-toolbar"`, the send button `data-slot="composer-send"`. The host draws no shell around it. Without `variant`, the current composer renders unchanged.

## Anatomy

| Slot | Element | Notes |
|---|---|---|
| root | `form` | radius 20, 1px border (white 8%), `card` fill, `shadow-xs` |
| field | `textarea` | 14/20 (`text-control`), padding 14 top, 16 sides, 8 bottom, grows to 192px, placeholder in sentence case in `muted-foreground` |
| toolbar | `div` | padding 8; left: the host's controls (`toolbar`), each a 32px pill (`data-slot="composer-chip"`), 4px apart; right: send |
| send | `button` | 32px circle, `primary` fill, 16px arrow; disabled at 40% while empty; a 16px square on `fill-selected` while a turn runs and the field is empty (Stop) |
| next problem | `button` | replaces send in the practice pause: 32px pill, `primary`, "Next problem" 13/500 and a 16px arrow |

## States

| State | Treatment |
|---|---|
| field focused | a 1px outline in `ring` at 50% over the border (an outline, because the global `* { border-color }` rule outranks border-colour utilities) |
| control focus-visible | 2px `ring` (send and next problem offset 2px from the surface) |
| hover (toolbar pills) | `fill-hover`, ink to `foreground` |

Enter sends, Shift+Enter is a newline, ⌘/Ctrl+Enter sends; the stop and next-problem rules are `enterAction`'s, shared with the current composer.

## Sources

Radius 20, muted controls inside, one 32px round send, 14px text, padding 16 × 14/8, toolbar padding 8: T3 Code and Claude desktop composers (research/agent-apps.md). Model, thinking level and cost leave the composer: the owner's "agent chrome out" decision; they stay in Settings.
