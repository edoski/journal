/** The app rules every portalled overlay primitive carries (spec: overlay.md). */

/** One stack for the app: dialogs at 50, menus, selects and popovers at 70
 *  so one opened inside a dialog draws on top, tooltips at 80 (tooltip.tsx,
 *  Proposed) so a hint inside a popover stays visible. `lh-no-drag` keeps portalled content clickable where
 *  it overlaps an Electron drag band; portals leave the band's auto carve-out,
 *  which only covers native controls. */
export const OVERLAY_LAYER = "z-70 lh-no-drag"

/** The dialog tier: the same drag carve-out, under the overlay tier. */
export const DIALOG_LAYER = "z-50 lh-no-drag"

/** 150ms fade and 95% zoom from the trigger's side; none under reduced motion. */
export const OVERLAY_MOTION =
  "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 motion-reduce:animate-none"

/** Marks a layer as inside for the hand-rolled outside-click guards that
 *  still check `[data-lh-menu]` (the setup dialog, enter-submits, session find). */
export const OVERLAY_ATTRS = { "data-lh-menu": "" } as const

/** One Esc closes one layer. Radix hears Esc on document in the capture phase
 *  and lets it run on, so without this the window shortcut would also abort
 *  the turn or dismiss the pending question. */
export function claimEscape(handler?: (event: KeyboardEvent) => void) {
  return (event: KeyboardEvent) => {
    event.stopPropagation()
    handler?.(event)
  }
}

/** Where his next key belongs once a layer closes (focus-home.ts): the
 *  composer's field. */
const WHERE_HE_TYPES = '[data-testid="composer"] textarea'

/** Puts focus in the composer if nothing holds it: the page itself, or an
 *  element that has left it. */
export function focusWhereHeTypes(doc: Document | undefined, onlyIfLost = true): void {
  if (!doc) return
  const active = doc.activeElement
  if (onlyIfLost && active != null && active !== doc.body && active.isConnected) return
  doc.querySelector<HTMLElement>(WHERE_HE_TYPES)?.focus({ preventScroll: true })
}

/** A dialog's close focus (round 5, 14 Nov 2026). Radix gives focus back to
 *  what held it before the dialog opened, or to the page when that is gone
 *  (a dialog a shortcut opened, a course deleted with its menu). Radix
 *  focuses after this event, so once it has, focus left on the page goes to
 *  the composer. A caller that places focus itself prevents the default. */
export function landFocusAfterClose(handler?: (event: Event) => void, doc: () => Document | undefined = () => globalThis.document) {
  return (event: Event) => {
    handler?.(event)
    if (event.defaultPrevented) return
    setTimeout(() => focusWhereHeTypes(doc()), 0)
  }
}
