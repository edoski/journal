"use client";
/**
 * The sign-in dialog. Every agent runs CLAUDE_MODEL on one Claude account
 * (owner, 2026-11-14), so there is nothing to set up but that account's
 * sign-in: the dialog shows the Claude rows (sign-in state, Refresh, Use
 * this account) and closes itself once the account in use is signed in.
 * The composer pill, a refused send and a refused job card open it; the
 * caller's draft waits in the composer — signing in never sends it (owner
 * ruling 2026-10-09).
 *
 * Closable without signing in (Esc/backdrop/✕) — browsing the app stays
 * possible; the GATE is the server, not the dialog. It draws in the
 * settings kit (components/settings/settings.md) inside the shared Dialog.
 *
 * Keys (round 21, m16: focus opened on ✕ and no arrow left it): it opens
 * on Refresh, and the shared list walk (list-walk.md) steps from Refresh
 * through each Use this account; ↑ on Refresh reaches ✕ and ↓ comes back.
 */

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { CLAUDE_MODEL } from "@/src/core";
import { useModelStatus } from "@/components/model-status";
import { signedInCloseFocus } from "@/components/setup-dialog-focus";
import { useListWalk } from "@/components/list-walk/use-list-walk";
import { Hint } from "@/components/ui/hint";
import { SettingsGroup } from "@/components/settings/controls";
import { ClaudeConnectionRow } from "@/components/settings/claude-connection";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const SETUP_LINE = `Lessons run on ${CLAUDE_MODEL.name} through your Claude plan.`;

/** The walk's stops, top to bottom: Refresh, then each account's Use this account. */
const SIGN_IN_STOPS = '[data-testid="claude-refresh"], [data-testid="claude-use-account"]';

interface SetupDialogProps {
	open: boolean;
	onClose: () => void;
}

export function SetupDialog({ open, onClose }: SetupDialogProps) {
	const { status, read, refresh } = useModelStatus();
	// Opening re-checks the sign-in, and only a reading taken since then
	// closes the dialog (round 10, 4 minor 1: a stale "connected" closed it
	// as it opened, so Sign in did nothing).
	const [openedAt, setOpenedAt] = useState<number | null>(null);
	const readRef = useRef(read);
	readRef.current = read;
	useEffect(() => {
		setOpenedAt(open ? readRef.current : null);
		if (open) refresh(true);
	}, [open, refresh]);
	const connected = status?.connected === true && openedAt !== null && read > openedAt;
	const signedInRef = useRef(false);
	signedInRef.current = connected;
	// The caller's close, read at call time: an inline one is new on each
	// render, and the close fires once per open (round 15, M2: an effect
	// keyed on it re-ran on every render of the lesson).
	const onCloseRef = useRef(onClose);
	onCloseRef.current = onClose;
	const closedRef = useRef(false);
	useEffect(() => {
		if (!open) {
			closedRef.current = false;
			return;
		}
		if (!connected || closedRef.current) return;
		closedRef.current = true;
		onCloseRef.current();
	}, [open, connected]);

	const panel = useRef<HTMLDivElement>(null);
	const { onKeyDown, onHeadKeyDown } = useListWalk({
		stops: () => [...(panel.current?.querySelectorAll<HTMLButtonElement>(SIGN_IN_STOPS) ?? [])].filter((stop) => !stop.disabled),
		head: () => panel.current?.querySelector<HTMLElement>('[data-testid="setup-close"]') ?? null,
	});
	// Esc closes the dialog (the one-Esc law below), never only leaves the walk.
	const walk = (handler: typeof onKeyDown) => (e: ReactKeyboardEvent<HTMLElement>) => {
		if (e.key !== "Escape") handler(e);
	};

	// THE ONE-ESC LAW (owner, keyboard round 2026-10-06): claim Esc at the
	// document level so the window chain (abort) never also fires.
	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== "Escape") return;
			e.preventDefault();
			e.stopPropagation();
			onCloseRef.current();
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [open]);

	return (
		<Dialog open={open && !connected} onOpenChange={(next) => !next && onClose()}>
			<DialogContent
				ref={panel}
				data-testid="setup-dialog"
				className="max-h-[85vh] max-w-xl gap-6 overflow-y-auto"
				onOpenAutoFocus={(e) => {
					const refresh = panel.current?.querySelector<HTMLElement>('[data-testid="claude-refresh"]');
					if (!refresh) return;
					e.preventDefault();
					refresh.focus({ preventScroll: true });
				}}
				onCloseAutoFocus={(e) => signedInCloseFocus(signedInRef.current)(e)}
			>
				<DialogHeader>
					<DialogTitle>Sign in to Claude</DialogTitle>
					<DialogDescription>{SETUP_LINE}</DialogDescription>
				</DialogHeader>
				<Hint label="Close" binding="escape" side="left">
					<DialogClose aria-label="Close setup" data-testid="setup-close" onKeyDown={walk(onHeadKeyDown)} />
				</Hint>
				<div className="flex flex-col gap-6" data-testid="setup-stage-keys" onKeyDown={walk(onKeyDown)}>
					<SettingsGroup>
						<ClaudeConnectionRow notice={false} />
					</SettingsGroup>
				</div>
			</DialogContent>
		</Dialog>
	);
}
