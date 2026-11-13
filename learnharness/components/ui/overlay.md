# Overlay rules

The three app rules every portalled shadcn primitive carries (`overlay.ts`). They live in the primitives, so a screen gets them by using one.

| Rule | How | Why |
|---|---|---|
| One Esc closes one layer | Every content's `onEscapeKeyDown` goes through `claimEscape`, which stops the event | Radix hears Esc on `document` in the capture phase and lets it run on; the window shortcut (`keyboard-shortcuts.tsx`) would then also abort the turn or dismiss the pending question |
| Clickable over a drag band | `lh-no-drag` on every portalled content | Portals leave `.lh-drag`'s automatic carve-out, which only covers native controls, so a menu row over the 52–60px top band could drag the window |
| One z stack | dialogs 50 (`DIALOG_LAYER`); MenuShell and the connection dialogs 60; menus, selects and popovers 70 (`OVERLAY_LAYER`); tooltips 80 | A list opened inside a dialog and a hint inside a popover always draw on top |

Portalled menus also carry `data-lh-menu`, so the hand-rolled outside-click guards that remain (MenuShell hosts, `enter-submits.ts`, session find) count them as inside.

Motion (`OVERLAY_MOTION`): 150ms fade with a 95% zoom from the trigger's side, none under reduced motion.

## Sources

Radix DismissableLayer (`@radix-ui/react-use-escape-keydown`: a capture listener on document that does not stop the event), shadcn's z-50 poppers, the one-Esc law in `keyboard-shortcuts.tsx`, the drag-band rules in `app/globals.css`.
