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

const COPY: Record<AbortMode, { title: string; line: string; action: string }> = {
	turn: {
		title: "Abort this turn?",
		line: "The partial answer stays in the transcript.",
		action: "Abort",
	},
	question: {
		title: "Dismiss this question?",
		line: "Skipped — the teacher moves on without it.",
		action: "Dismiss",
	},
	problem: {
		title: "Discard this problem?",
		line: "The problem is dropped — no solution is revealed.",
		action: "Discard",
	},
};

/** The dialog's body in the shared dialog anatomy (components/ui/dialog.md) —
 * exported for render pins. */
export function AbortTurnBody({
	mode,
	onClose,
	onConfirm,
	busy = false,
}: {
	mode: AbortMode;
	onClose: () => void;
	onConfirm: () => void;
	/** The dismiss doubles as the abort when a turn is still running
	 * (owner, 2026-10-04): the line says so. */
	busy?: boolean;
}) {
	const copy = COPY[mode];
	return (
		<AlertDialog open onOpenChange={(open) => !open && onClose()}>
			<AlertDialogContent data-testid="abort-turn-dialog" className="max-w-sm">
				<AlertDialogHeader>
					<AlertDialogTitle data-testid="abort-turn-title">{copy.title}</AlertDialogTitle>
					<AlertDialogDescription data-testid="abort-turn-line">
						{copy.line}
						{busy && mode !== "turn" ? " The working turn stops too." : ""}
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

export function AbortTurnDialog({
	mode,
	onClose,
	onConfirm,
	busy = false,
}: {
	/** What Esc is aborting; null = closed (nothing rendered). */
	mode: AbortMode | null;
	onClose: () => void;
	onConfirm: (mode: AbortMode) => void;
	busy?: boolean;
}) {
	if (mode === null || typeof document === "undefined") return null;
	return <AbortTurnBody mode={mode} onClose={onClose} onConfirm={() => onConfirm(mode)} busy={busy} />;
}
