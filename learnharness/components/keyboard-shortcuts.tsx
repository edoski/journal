"use client";

/**
 * Keyboard shortcuts (shortcut wave A, 2026-09-17) — the single document-level
 * keydown listener. Owns the pieces that belong to no surface in particular:
 *
 * - Tab is DEAD: browser tab-focus navigation is abandoned by owner decision
 *   (2026-09-17). Tab is suppressed everywhere (preventDefault, no-op);
 *   plain Tab cycles the active surface's text fields.
 * - Esc is a layered dismiss: topmost popover first (popovers stopPropagation
 *   on their own Esc), then abort of an
 *   in-flight turn.
 * - Global actions dispatch lh:kbd-<action> window events; surfaces that are
 *   mounted listen (the lh:chat-renamed pattern). A surface that isn't
 *   mounted simply doesn't listen — an F2 on the study home is a no-op, not
 *   an error. Actions live in src/core/keyboard.ts (registry + persisted
 *   overrides), the ONE table the settings milestone will render as its
 *   editor.
 *
 * Listeners attach at the WINDOW level (bubble's last stop) so every
 * component-level handler — popovers' own Esc, the composer's Esc — gets the
 * event first and can claim it with stopPropagation.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Hint } from "@/components/ui/hint";
import { Kbd } from "@/components/ui/kbd";
import {
	actionForBinding,
	bindingForAction,
	eventBinding,
	formatBinding,
	isTypingSurface,
	kbdEventForAction,
	KEY_SCOPES,
	KEYBOARD_ACTIONS,
	type KeyActionDef,
	type KeyGroup,
	type KeyScope,
} from "@/src/core";
import { useSettingsDialog } from "@/components/settings/settings-dialog.tsx";
import { useSpatialArrows } from "@/components/spatial-arrows";

// Re-exported for the contract pin (tests/keyboard-toggle-sidebar.test.ts):
// the dispatcher composes event names through the ONE helper — a second
// spelling here is how the ⌘B bug happened.
export { kbdEventForAction };

export function KeyboardShortcuts() {
	const router = useRouter();
	const [cheatOpen, setCheatOpen] = useState(false);
	const { open: openSettings } = useSettingsDialog();
	useSpatialArrows();

	// Router + cheat + settings state inside a ref so the keydown listener
	// (attached once) never goes stale.
	const handlersRef = useRef<{
		router: ReturnType<typeof useRouter>;
		setCheatOpen: (v: boolean) => void;
		openSettings: () => void;
	}>({ router, setCheatOpen, openSettings });
	handlersRef.current = { router, setCheatOpen, openSettings };

	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			// ── Tab is dead (owner, 2026-09-17): preventDefault even when
			// nothing is bound to it — browser tab-focus is abandoned, and
			// the default action runs after dispatch, so suppressing it here
			// works from any focus.
			if (e.key === "Tab") {
				e.preventDefault();
				// Plain Tab cycles the active surface's text fields (owner,
				// keyboard round 2026-10-06) — forward-only, wrapping; each
				// composer-bearing page answers with its own chain. The quiz
				// dock's rows↔thinking claim stops propagation at document
				// level, so a claimed Tab never reaches this dispatch.
				if (!e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey)
					window.dispatchEvent(new CustomEvent("lh:kbd-cycle-fields"));
				return;
			}

			if (e.key === "Escape") {
				// Our own overlay is the topmost layer.
				if (cheatOpen) {
					setCheatOpen(false);
					e.preventDefault();
					return;
				}
				// THE ONE-ESC LAW (owner, keyboard round 2026-10-06): one
				// Esc, one action, on the topmost active layer. Field-level
				// handlers claim at their element (focus in a field: the
				// field's action); every SURFACED layer (popovers, plan,
				// overlays, dialogs) claims at the DOCUMENT level, which
				// fires before this window listener — so reaching here means
				// NOTHING is surfaced and no field is focused. This chain is
				// the fallback: abort the turn (a server-side turn has no
				// client request to abort — the abort seam in Chat decides
				// what's honestly stoppable, layered by escAbortTarget).
				window.dispatchEvent(new CustomEvent("lh:kbd-abort-turn"));
				return;
			}

			// ── Registry dispatch.
			const action = actionForBinding(eventBinding(e));
			if (!action) return;

			// The input guard: inside a typing surface only mod/alt combos
			// fire (they never type a character). Bare keys — "?" included —
			// pass through so the field keeps them. Tab already returned above.
			if (isTypingSurface(e) && !(e.metaKey || e.ctrlKey || e.altKey)) return;

			// Dispatch: global commands we own run here; surface commands
			// ride the window event for the mounted surface to catch.
			switch (action) {
				case "new-session":
					handlersRef.current.router.push("/chat/new");
					break;
				case "open-settings":
					// Settings-app wave: the dialog is the surface, the URL is
					// gone — /settings redirects to the draft shell.
					handlersRef.current.openSettings();
					break;
				case "jump-graph":
					// The study home holds the course map.
					handlersRef.current.router.push("/");
					break;
				case "cheat-sheet":
					handlersRef.current.setCheatOpen(true);
					break;
				case "practice-hint":
				case "practice-show":
				case "practice-explain":
					// The problem box owns these; claim the chord from the browser.
					e.preventDefault();
					window.dispatchEvent(new CustomEvent(kbdEventForAction(action)));
					break;
				case "find":
				case "pick-course":
					// The mounted surface owns Find (session text / graph nodes)
					// and the course picker. Claim the chord so Chromium's own
					// finder or Open File cannot open too.
					e.preventDefault();
					window.dispatchEvent(new CustomEvent(kbdEventForAction(action)));
					break;
				default:
					window.dispatchEvent(new CustomEvent(kbdEventForAction(action)));
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [cheatOpen]);

	return <CheatSheet open={cheatOpen} onClose={() => setCheatOpen(false)} />;
}

/** The sheet's sections in order: each scope's own actions under
 *  its heading (KEY_SCOPES), with Anywhere's Pages and Calendar groups
 *  after it. */
const SHEET_SECTIONS: readonly { label: string; scope: KeyScope; group?: KeyGroup }[] = [
	{ label: "Anywhere", scope: "global" },
	{ label: "Pages", scope: "global", group: "pages" },
	{ label: "Calendar", scope: "global", group: "calendar" },
	...KEY_SCOPES.filter(({ scope }) => scope !== "global"),
];

export function cheatSheetSections(): { label: string; actions: KeyActionDef[] }[] {
	return SHEET_SECTIONS.map(({ label, scope, group }) => ({
		label,
		actions: KEYBOARD_ACTIONS.filter((a) => a.scope === scope && a.group === group),
	})).filter((section) => section.actions.length > 0);
}

/** The ? overlay: the dialog anatomy (dialog.md), its sections in two
 *  balanced columns so every shortcut shows at once with nothing to
 *  scroll, each row the action, then its keys as plain glyphs (kbd.md),
 *  in the app's own words. */
function CheatSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
	if (!open) return null;
	return (
		<Dialog open onOpenChange={(next) => !next && onClose()}>
			<DialogContent aria-describedby={undefined} data-testid="cheat-sheet" className="max-w-3xl">
				<DialogHeader>
					<DialogTitle>Keyboard shortcuts</DialogTitle>
				</DialogHeader>
				<Hint label="Close" binding="escape" side="left">
					<DialogClose aria-label="Close shortcuts" />
				</Hint>
				<div data-slot="cheat-sheet-columns" className="columns-2 gap-8">
					{cheatSheetSections().map(({ label, actions }) => (
						<section key={label} aria-label={label} className="flex break-inside-avoid flex-col pb-4 last:pb-0">
							<h3 className="flex h-7 items-center text-label font-medium text-muted-foreground">{label}</h3>
							{actions.map((a) => (
								<div key={a.id} className="flex h-8 items-center justify-between gap-4 text-row">
									<span className="truncate text-foreground">{a.label}</span>
									<Kbd>{formatBinding(bindingForAction(a.id))}</Kbd>
								</div>
							))}
						</section>
					))}
				</div>
			</DialogContent>
		</Dialog>
	);
}
