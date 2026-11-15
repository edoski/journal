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
 */

import { useEffect, useRef, useState } from "react";
import { CLAUDE_MODEL } from "@/src/core";
import { useModelStatus } from "@/components/model-status";
import { signedInCloseFocus } from "@/components/setup-dialog-focus";
import { Hint } from "@/components/ui/hint";
import { SettingsGroup } from "@/components/settings/controls";
import { ClaudeConnectionRow } from "@/components/settings/claude-connection";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const SETUP_LINE = `Lessons run on ${CLAUDE_MODEL.name} through your Claude plan.`;

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
	useEffect(() => {
		if (open && connected) onClose();
	}, [open, connected, onClose]);

	// THE ONE-ESC LAW (owner, keyboard round 2026-10-06): claim Esc at the
	// document level so the window chain (abort) never also fires.
	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== "Escape") return;
			e.preventDefault();
			e.stopPropagation();
			onClose();
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [open, onClose]);

	return (
		<Dialog open={open && !connected} onOpenChange={(next) => !next && onClose()}>
			<DialogContent data-testid="setup-dialog" className="max-h-[85vh] max-w-xl gap-6 overflow-y-auto" onCloseAutoFocus={(e) => signedInCloseFocus(signedInRef.current)(e)}>
				<DialogHeader>
					<DialogTitle>Sign in to Claude</DialogTitle>
					<DialogDescription>{SETUP_LINE}</DialogDescription>
				</DialogHeader>
				<Hint label="Close" binding="escape" side="left">
					<DialogClose aria-label="Close setup" data-testid="setup-close" />
				</Hint>
				<div className="flex flex-col gap-6" data-testid="setup-stage-keys">
					<SettingsGroup>
						<ClaudeConnectionRow />
					</SettingsGroup>
				</div>
			</DialogContent>
		</Dialog>
	);
}
