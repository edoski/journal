"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { ChatListItem } from "@/src/core";

/** A refused delete, by the route's code, in the learner's words. */
const FAILURE_WORDS: Record<string, string> = {
	turn_in_flight: "The tutor is still replying. Delete it once the reply ends.",
	jobs_running: "The tutor is still working in this lesson. Delete it once that ends.",
	digest_winding_down: "This lesson is still being saved. Try again in a moment.",
	network: "Couldn't reach the app. Check it's running, then try again.",
};

/**
 * Lesson deletion (wave 6 chunk A; owner flow rework 2026-09-24) — THE
 * destructive-confirmation surface, in the shared alert dialog anatomy
 * (components/ui/dialog.md): the title, the lesson's name, one line on
 * what goes and what stays, then Cancel + destructive Delete. The alert
 * dialog claims Esc and ignores it while a delete is in flight.
 *
 * Retryable failures render honestly with a Try-again: 409 turn_in_flight /
 * jobs_running ("wait for running work") and 503 digest_winding_down
 * ("in a moment") both clear on their own. Try-again is just Delete
 * pressed again.
 */
export function DeleteSessionDialog({
	chat,
	onClose,
	onDeleted,
}: {
	/** The session up for deletion; null = closed. */
	chat: Pick<ChatListItem, "id" | "title"> | null;
	onClose: () => void;
	/** Success path — the sidebar owns navigation + list patching. */
	onDeleted: (id: string) => void;
}) {
	const [busy, setBusy] = useState(false);
	const [failure, setFailure] = useState<{ code: string; error: string } | null>(null);

	// Fresh state per session: closing resets, opening a new chat starts clean.
	useEffect(() => {
		if (!chat) {
			setBusy(false);
			setFailure(null);
		}
	}, [chat]);

	const run = async () => {
		if (!chat || busy) return;
		setBusy(true);
		setFailure(null);
		try {
			const res = await fetch(`/api/chats/${chat.id}`, { method: "DELETE" });
			const body = (await res.json()) as {
				ok?: boolean;
				error?: string;
				code?: string;
			};
			if (!res.ok) {
				// 409 (turn/jobs running) and 503 (digest winding down) are
				// both retryable — keep the dialog open, show the server's line.
				setFailure({ code: body.code ?? "error", error: body.error ?? `Delete failed (${res.status})` });
				setBusy(false);
				return;
			}
			onDeleted(chat.id);
		} catch {
			setFailure({ code: "network", error: "Delete failed — network error. Try again." });
			setBusy(false);
		}
	};

	if (!chat) return null;

	return (
		<AlertDialog open onOpenChange={(open) => !open && !busy && onClose()}>
			<DeleteSessionBody
				chat={chat}
				busy={busy}
				failure={failure}
				onClose={onClose}
				onRun={() => void run()}
			/>
		</AlertDialog>
	);
}

/** The dialog's body — exported for render pins. The wrapper owns state,
 *  effects and the AlertDialog root. */
export function DeleteSessionBody({
	chat,
	busy,
	failure,
	onClose,
	onRun,
}: {
	chat: Pick<ChatListItem, "id" | "title">;
	busy: boolean;
	failure: { code: string; error: string } | null;
	onClose: () => void;
	onRun: () => void;
}) {
	return (
		<AlertDialogContent data-testid="delete-session-dialog">
			<AlertDialogHeader>
				<AlertDialogTitle>Delete this lesson?</AlertDialogTitle>
				<p data-testid="session-name-code" className="text-control font-medium text-foreground">
					{chat.title}
				</p>
				<AlertDialogDescription>Its messages are deleted for good. What you learned in it stays in your course.</AlertDialogDescription>
			</AlertDialogHeader>
			{failure && (
				<p role="alert" data-testid="delete-failure" className="text-row text-danger">
					{FAILURE_WORDS[failure.code] ?? failure.error}{" "}
					<button type="button" data-testid="delete-retry" onClick={onRun} disabled={busy} className="text-foreground underline-offset-2 hover:underline disabled:opacity-50">
						Try again
					</button>
				</p>
			)}
			<AlertDialogFooter className="pt-2">
				<Button variant="quiet" data-testid="delete-cancel" onClick={onClose} disabled={busy}>
					Cancel
				</Button>
				<Button variant="destructive" data-testid="delete-confirm" onClick={onRun} disabled={busy}>
					{busy ? "Deleting…" : "Delete"}
				</Button>
			</AlertDialogFooter>
		</AlertDialogContent>
	);
}
