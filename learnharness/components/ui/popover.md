# Popover

A non-modal floating panel anchored to a trigger: the lesson's details and plan, the coverage ring, and every searchable picker (with `Command` inside). `popover.tsx`, shadcn's Radix popover; `data-slot` `popover`, `popover-trigger`, `popover-content`, `popover-anchor`, `popover-header`, `popover-title`, `popover-description`. Overlay rules: `overlay.md`.

## Anatomy

| Slot | Notes |
|---|---|
| content | `popover` fill, 1px `border` (white 8%), radius 12, padding 16, 13/18 text, `shadow-lg`, width 288 unless the caller sets one; 4 from the trigger |
| picker content | the caller passes `p-1` and a width; a `Command` fills it |
| title | 13/18 at 600 |
| description | 12/16 muted |

## States

Opens and closes with a 150ms fade and zoom; Esc or a click outside closes it. A Popover does not lock scrolling; pass `modal` where the page behind must hold still.

## Sources

shadcn popover (radius, padding 16, `w-72`), the menu anatomy (`menu.md`) for the surface, T3 Code's floating panels (research/agent-apps.md).
