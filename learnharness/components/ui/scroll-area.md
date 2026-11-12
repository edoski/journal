# Scroll area

An overlay scrollbar for a pane: the Settings content pane. `scroll-area.tsx`, shadcn's Radix scroll area; `data-slot` `scroll-area`, `scroll-area-viewport`, `scroll-area-scrollbar`, `scroll-area-thumb`. `viewportRef` reaches the scroller for code that locks or measures it. The transcript and the docks keep native scrolling (their wheel routing reads `overflow-y`).

| Part | Notes |
|---|---|
| bar | 10px, 1px padding, over the content; `bar={false}` draws none (the Proposed sidebar, as T3 Code's) and the area still scrolls by wheel, trackpad and keyboard |
| thumb | full radius, white 15%, 25% on hover |

Sources: shadcn scroll-area, macOS overlay scrollbars.
