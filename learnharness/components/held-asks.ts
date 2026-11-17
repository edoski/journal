/**
 * A shortcut pressed for a page that is still on its way, wired in
 * keyboard-shortcuts.tsx and the course picker. ⌘N asks for the new
 * lesson page, which the server renders, so a ⌘O pressed right after it
 * reached no course picker and did nothing (round 15, 4 free). The page a
 * shortcut navigated to is noted (`navigatingTo`); a surface's key that no
 * mounted surface took while that page is on its way waits for it, and the
 * surface takes it as it mounts (`takeHeld`). It is dropped once another
 * page shows, so it never fires somewhere he did not ask for it.
 */
import { kbdEventForAction, type KeyAction } from "@/src/core";

let target: string | null = null;
let held: { action: KeyAction; path: string } | null = null;

/** A shortcut asked for `path`: keys for its surfaces wait for it. */
export function navigatingTo(path: string): void {
	target = path;
	held = null;
}

/** The page now showing: a key waiting for another page is dropped, and
 *  the page on its way has come. */
export function pageShown(path: string): void {
	if (held && held.path !== path) held = null;
	if (target !== null) target = null;
}

/** Hands a surface's key to the mounted surface, which claims it
 *  (`preventDefault` on the event); unclaimed while a page is on its way,
 *  it waits for that page. */
export function askSurface(action: KeyAction): void {
	const claimed = !window.dispatchEvent(new CustomEvent(kbdEventForAction(action), { cancelable: true }));
	if (!claimed && target !== null) held = { action, path: target };
}

/** The page showing now; none outside a browser. */
const shownPath = () => (typeof location === "undefined" ? null : (location?.pathname ?? null));

/** Whether the key `action` waits for this page's surface; taken once. */
export function takeHeld(action: KeyAction, path: string | null = shownPath()): boolean {
	if (held?.action !== action || held.path !== path) return false;
	held = null;
	return true;
}
