# Kbd

A key or chord: the keyboard cheat sheet, Settings › Keyboard, tooltips. `components/ui/kbd.tsx`, `data-slot="kbd"`; the text is `formatBinding()`'s output (⌘, ⌥, ⇧, ↵, Esc, F2 …).

| Slot | Notes |
|---|---|
| root | `kbd`, the system font (SF Pro has the ⌘⌥⇧ glyphs), 12/16, tabular figures, `muted-foreground`; no border, fill or radius |

Inside a tooltip it follows the label 6px later, in the same muted ink; in a list it sits in the right column.

## Sources

macOS menus and System Settings › Keyboard draw shortcuts as plain glyphs in secondary ink, never as keycaps; T3 Code and Linear do the same in tooltips. shadcn's `kbd` is the slot this refines.
