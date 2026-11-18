"use client";

import { Button } from "@/components/ui/button";
import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDialogSubject } from "@/components/ui/overlay";
import { SHOW_WORDS, STOP_WORDS } from "@/components/study-words";

/**
 * The ESC-abort guard (owner, 2026-10-02): the global Esc → abort chain
 * opens this confirm popup EVERYWHERE — mid-stream aborts and pending-
 * question dismissals alike. Esc on the popup itself cancels (claimed —
 * it must never chain into another abort), which is also why Chat's
 * abort handler ignores events while this dialog is open: two window
 * listeners fire per Esc and stopPropagation alone cannot order them.
 * The alert dialog claims that Esc itself.
 *
 * MINIMAL, the delete-node dialog's tone: title, one line, Cancel +
 * action. No busy state — both actions are local (a fetch that fires
 * and forgets, an answer submit whose own machinery shows progress).
 *
 * What "abort" means is mode-dependent: from a running turn it kills
 * the turn (partial stays); from a pending question there is no turn to
 * kill — abort IS dismissal (A2, 2026-10-03): the silent route writes
 * the skipped toolResult and wakes NOTHING; the session pauses until
 * the user's next plain message, which carries the dismissal to the
 * model in its context.
 */

/** What Esc is aborting — drives copy and the confirm action. */
export type AbortMode = "turn" | "question" | "problem";

/** The dialog's words per mode, in his words (study-words.ts). */
const COPY: Record<AbortMode, { title: string; line: string; action: string }> = STOP_WORDS;

/** The dialog's body in the shared dialog anatomy (components/ui/dialog.md) —
 * exported for render pins. */
export function AbortTurnBody({
	open,
	mode,
	onClose,
	onConfirm,
	busy = false,
}: {
	open: boolean;
	mode: AbortMode;
	onClose: () => void;
	onConfirm: () => void;
	/** The dismiss doubles as the abort when a turn is still running
	 * (owner, 2026-10-04): the line says so. */
	busy?: boolean;
}) {
	const copy = COPY[mode];
	// Tab is dead, so the footer is an arrow pair: ← Cancel, → the action,
	// Enter presses the focused one, and ⌘↵ confirms from anywhere in it
	// (the shared alert dialog's keys, alert-dialog.tsx).
	return (
		<AlertDialog open={open} onOpenChange={(next) => !next && onClose()}>
			<AlertDialogContent data-testid="abort-turn-dialog" className="max-w-sm">
				<AlertDialogHeader>
					<AlertDialogTitle data-testid="abort-turn-title">{copy.title}</AlertDialogTitle>
					<AlertDialogDescription data-testid="abort-turn-line">
						{copy.line}
						{busy && mode !== "turn" ? ` ${STOP_WORDS.alsoStops}` : ""}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter className="pt-2">
					<AlertDialogCancel data-testid="abort-turn-cancel">Cancel</AlertDialogCancel>
					<Button variant="destructive" data-testid="abort-turn-confirm" onClick={onConfirm}>
						{copy.action}
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

/** Show me's confirm, in the same anatomy: Cancel, and Show me. Null
 *  `what` = closed; while it fades out, Show me does nothing. */
export function ShowMeConfirm({ what, onClose, onConfirm }: { what: keyof typeof SHOW_WORDS | null; onClose: () => void; onConfirm: () => void }) {
	const { open, shown } = useDialogSubject(what);
	if (shown === null) return null;
	const copy = SHOW_WORDS[shown];
	return (
		<AlertDialog open={open} onOpenChange={(next) => !next && onClose()}>
			<AlertDialogContent data-testid="show-me-dialog" className="max-w-sm">
				<AlertDialogHeader>
					<AlertDialogTitle>{copy.title}</AlertDialogTitle>
					<AlertDialogDescription>{copy.line}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter className="pt-2">
					<AlertDialogCancel data-testid="show-me-cancel">Cancel</AlertDialogCancel>
					<Button data-testid="show-me-confirm" onClick={() => open && onConfirm()}>
						{copy.action}
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

export function AbortTurnDialog({
	mode,
	onClose,
	onConfirm,
	busy = false,
}: {
	/** What Esc is aborting; null = closed. */
	mode: AbortMode | null;
	onClose: () => void;
	onConfirm: (mode: AbortMode) => void;
	busy?: boolean;
}) {
	const { open, shown } = useDialogSubject(mode);
	if (shown === null || typeof document === "undefined") return null;
	// A closing dialog still takes a press until it fades out; only an open one acts.
	return <AbortTurnBody open={open} mode={shown} onClose={onClose} onConfirm={() => mode && onConfirm(mode)} busy={busy} />;
}
