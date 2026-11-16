"use client";

import { type ReactNode } from "react";
import { ArrowRightIcon, ArrowUpIcon, SquareIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DOCK_SURFACE } from "@/components/lesson/dock-surface";
import { PendingPhotos, PhotoAttachButton, type PhotoDraft } from "@/components/photos";

/** What one Enter press does, in precedence order: send the message,
 *  otherwise run the empty field's go-ahead: the practice pause's next
 *  problem (owner round 16), or Try again after a reply that never came.
 *  Enter never stops a turn (round 3, 14 Nov 2026): a second Enter a
 *  second after a send landed on the empty field and killed the reply.
 *  Stopping is the square's or Esc's, through the confirm. Pure so the
 *  static-render harness can pin the decision (key events can't be
 *  simulated in renderToStaticMarkup). */
export function enterAction(state: {
	busy: boolean;
	canSend: boolean;
	/** The between-problems pause is live: practice session, nothing
	 *  active, no turn in flight (the caller's fold). */
	nextProblem?: boolean;
	/** The empty field's own go-ahead (Try again), when the host has one. */
	emptyAction?: boolean;
}): "send" | "next" | "empty-action" | "none" {
	// Composer steering (owner arc 2026-10-03): while a turn runs, typed
	// text makes Enter a STEER (the queue-and-redirect send).
	if (state.canSend) return "send";
	if (state.busy) return "none";
	if (state.nextProblem) return "next";
	if (state.emptyAction) return "empty-action";
	return "none";
}

/** The composer (spec: composer.md): one rounded surface, the text on top,
 *  a toolbar row under it with muted controls on the left and one round
 *  send on the right. Its host adds no shell around it. */
export function Composer({
	busy,
	value,
	onChange,
	onSend,
	onStop,
	canSend,
	autoFocus,
	placeholder = "Ask the tutor anything…",
	nextProblem = false,
	onNext,
	toolbar,
	head,
	emptyAction,
	onEmptyEnter,
	photos,
}: {
	busy: boolean;
	value: string;
	onChange: (v: string) => void;
	onSend: () => void;
	onStop: () => void;
	canSend: boolean;
	autoFocus?: boolean;
	/** A row docked on the composer's top edge, inside its surface, above
	 *  the text (the topic page's resume line). */
	head?: ReactNode;
	/** What the empty composer's button does instead of sending, as the
	 *  practice pause's Next problem does: its label on the button, and
	 *  Enter on the empty field runs it. */
	emptyAction?: { label: string; run: () => void };
	/** What Enter on the empty, idle field does when no button says so:
	 *  Try again after a reply that never came (the placeholder names it). */
	onEmptyEnter?: () => void;
	/** The controls on the toolbar's left (course, mode). */
	toolbar?: ReactNode;
	/** The textarea's placeholder (owner refinement round, 2026-09-24):
	 *  active sessions read "Ask the tutor anything…"; a fresh
	 *  start asks its opening question instead. */
	placeholder?: string;
	/** The practice pause is live (owner round 16): Enter on the empty
	 *  composer fires the next-problem signal instead of doing nothing —
	 *  the keyboard-first move-on. */
	nextProblem?: boolean;
	/** The signal's dispatcher (send({type:"next"})) — the button and the
	 *  empty-Enter share it. */
	onNext?: () => void;
	/** Photos of his working (photos.tsx): the attach button leads the
	 *  toolbar, thumbnails wait above the text, paste and drop add more. */
	photos?: PhotoDraft;
}) {
	// The label the empty composer's button wears instead of the send.
	const next = nextProblem
		? { label: "Next problem", run: () => onNext?.(), testId: "next-problem-button" }
		: emptyAction
			? { ...emptyAction, testId: "composer-action" }
			: undefined;
	const act = () => {
		const action = enterAction({ busy, canSend, nextProblem, emptyAction: Boolean(next ?? onEmptyEnter) });
		if (action === "send") onSend();
		else if (action === "next" || action === "empty-action") (next ? next.run : onEmptyEnter)?.();
	};
	// The button follows the text (owner report 2026-10-03): while a turn
	// runs WITH text typed it stays the send (click = steer); only an empty
	// composer morphs it to Stop.
	const stopping = busy && !canSend;
	return (
		<form
			data-testid="composer"
			data-slot="composer"
			className={cn("flex flex-col", DOCK_SURFACE, photos?.dragging && "outline-1 outline-ring")}
			onSubmit={(e) => {
				e.preventDefault();
				act();
			}}
			{...photos?.surface}
		>
			{head}
			{photos && <PendingPhotos draft={photos} />}
			<Textarea
				value={value}
				onChange={(e) => onChange(e.target.value)}
				onKeyDown={(e) => {
					// Enter sends, Shift+Enter is a newline; ⌘/Ctrl+Enter also
					// sends, the universal submit shortcut across the app.
					if (e.key === "Enter" && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
						e.preventDefault();
						act();
					}
				}}
				placeholder={placeholder}
				autoFocus={autoFocus}
				rows={1}
				className="max-h-48 min-h-12 resize-none rounded-none border-0 px-4 pb-2 pt-3.5 text-body focus-visible:ring-0"
			/>
			<div data-slot="composer-toolbar" className="flex min-w-0 items-center gap-1 p-2">
				<div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
					{photos && <PhotoAttachButton draft={photos} />}
					{toolbar}
				</div>
				{next && !busy && !canSend ? (
					<Button
						type="submit"
						size="pill"
						data-testid={next.testId}
						aria-label={next.label}
						className="px-3 transition-opacity hover:bg-primary hover:opacity-90 has-[>svg]:px-3 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-card motion-reduce:transition-none"
					>
						{next.label}
						<ArrowRightIcon />
					</Button>
				) : (
					<Button
						// The square stops the turn by a click only (through
						// the host's confirm); Enter never reaches it.
						type={stopping ? "button" : "submit"}
						onClick={stopping ? onStop : undefined}
						size="icon-sm"
						data-slot="composer-send"
						aria-label={stopping ? "Stop" : "Send"}
						disabled={!busy && !canSend}
						className={cn(
							"rounded-full transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-card motion-reduce:transition-none",
							stopping ? "bg-fill-selected text-foreground hover:bg-fill-selected" : "hover:bg-primary disabled:opacity-40",
						)}
					>
						{stopping ? <SquareIcon /> : <ArrowUpIcon />}
					</Button>
				)}
			</div>
		</form>
	);
}
