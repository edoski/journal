# Composer

`<Composer toolbar={…} />`: the message field as one rounded surface, shared by New lesson, the draft at `/chat/new` and the lesson dock. `data-slot="composer"`; the toolbar row `data-slot="composer-toolbar"`, the send button `data-slot="composer-send"`. The host draws no shell around it.

## Anatomy

| Slot | Element | Notes |
|---|---|---|
| root | `form` | radius 20, 1px border (white 8%), `card` fill, `shadow-xs` |
| field | `textarea` | 14/20 (`text-control`), padding 14 top, 16 sides, 8 bottom, grows to 192px, placeholder in sentence case in `muted-foreground` |
| toolbar | `div` | padding 8; left: the host's controls (`toolbar`), each a 32px pill (`data-slot="composer-chip"`), 4px apart; right: send |
| send | `button` | 32px circle, `primary` fill, 16px arrow; disabled at 40% while empty; a 16px square on `fill-selected` while a turn runs and the field is empty (Stop) |
| next problem | `button` | replaces send in the practice pause: 32px pill, `primary`, "Next problem" 13/500 and a 16px arrow |
| head | the host's (`head`) | a row docked inside the surface above the field (the hybrid topic page's resume line) |
| photos | `photos.md` | the lesson composer's: the attach button leads the toolbar's left, thumbnails wait above the field, paste and drop add photos; a photo alone can be sent |
| empty action | `button` (`data-testid="composer-action"`) | the host's `emptyAction`: as next problem, labelled with its `label`, while the field is empty; Enter on the empty field runs it |

## States

| State | Treatment |
|---|---|
| field focused | a 1px outline in `ring` at 50% over the border (an outline, because the global `* { border-color }` rule outranks border-colour utilities) |
| control focus-visible | 2px `ring` (send and next problem offset 2px from the surface) |
| hover (toolbar pills) | `fill-hover`, ink to `foreground` |

Enter sends, Shift+Enter is a newline, ⌘/Ctrl+Enter sends. Enter never stops a turn: the square stops by a click, through the host's confirm. On the empty idle field Enter runs the next problem or the host's `onEmptyEnter` (Try again); the rules are `enterAction`'s.

## Sources

Radius 20, muted controls inside, one 32px round send, 14px text, padding 16 × 14/8, toolbar padding 8: T3 Code and Claude desktop composers (research/agent-apps.md). Model, thinking level and cost leave the composer: the owner's "agent chrome out" decision. There is no model or thinking choice at all (every agent runs Claude Opus 5.5 at high effort, owner 2026-11-14); cost stays in the lesson's details.
