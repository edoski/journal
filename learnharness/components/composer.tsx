"use client";

import { useCallback, useLayoutEffect, useState, type ReactNode } from "react";
import { ArrowRightIcon, ArrowUpIcon, SquareIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DOCK_SURFACE } from "@/components/lesson/dock-surface";

/** What one Enter press does, in precedence order: stop a busy stream,
 *  otherwise send the message, otherwise — practice sessions only — fire
 *  the next-problem signal while the between-problems pause is live
 *  (owner round 16: Enter on an EMPTY composer is the go-ahead; typing
 *  anything makes Enter a send again). Pure so the static-render harness
 *  can pin the decision (key events can't be simulated in
 *  renderToStaticMarkup). */
export function enterAction(state: {
	busy: boolean;
	canSend: boolean;
	/** The between-problems pause is live: practice session, nothing
	 *  active, no turn/compaction in flight (the caller's fold). */
	nextProblem?: boolean;
}): "stop" | "send" | "next" | "none" {
	// Composer steering (owner arc 2026-10-03): while a turn runs, typed
	// text makes Enter a STEER (the queue-and-redirect send); Enter with
	// an empty composer stays the stop shortcut. The button itself keeps
	// the square — Stop stays one click away at all times.
	if (state.busy) return state.canSend ? "send" : "stop";
	if (state.canSend) return "send";
	if (state.nextProblem) return "next";
	return "none";
}

/**
 * Session composer with local keystroke state. The owning Chat keeps the
 * current draft in a ref for send, so typing doesn't rerender the
 * transcript; revision signals explicit parent-driven draft resets.
 */
export function ChatSessionComposer({
	busy,
	value,
	revision,
	onChange,
	onSend,
	onStop,
	sendAllowed,
	placeholder,
	nextProblem,
	onNext,
}: {
	busy: boolean;
	value: string;
	revision: number;
	onChange: (value: string) => void;
	onSend: () => void;
	onStop: () => void;
	sendAllowed: boolean;
	placeholder?: string;
	nextProblem?: boolean;
	onNext?: () => void;
}) {
	const [draft, setDraft] = useState(value);
	useLayoutEffect(() => { setDraft(value); }, [revision, value]);
	const canSend = sendAllowed && draft.trim().length > 0;
	const applyDraft = useCallback((next: string) => {
		setDraft(next);
		onChange(next);
	}, [onChange]);

	return (
		<Composer
			busy={busy}
			value={draft}
			onChange={applyDraft}
			onSend={onSend}
			onStop={onStop}
			canSend={canSend}
			placeholder={placeholder}
			nextProblem={nextProblem}
			onNext={onNext}
		/>
	);
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
	placeholder = "Ask, answer, or steer the lesson…",
	nextProblem = false,
	onNext,
	toolbar,
	head,
	emptyAction,
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
	/** The controls on the toolbar's left (course, mode). */
	toolbar?: ReactNode;
	/** The textarea's placeholder (owner refinement round, 2026-09-24):
	 *  active sessions read "Ask, answer, or steer the lesson…"; a fresh
	 *  start asks its opening question instead. */
	placeholder?: string;
	/** The practice pause is live (owner round 16): Enter on the empty
	 *  composer fires the next-problem signal instead of doing nothing —
	 *  the keyboard-first move-on. */
	nextProblem?: boolean;
	/** The signal's dispatcher (send({type:"next"})) — the button and the
	 *  empty-Enter share it. */
	onNext?: () => void;
}) {
	// The label the empty composer's button wears instead of the send.
	const next = nextProblem
		? { label: "Next problem", run: () => onNext?.(), testId: "next-problem-button" }
		: emptyAction
			? { ...emptyAction, testId: "composer-action" }
			: undefined;
	const act = () => {
		const action = enterAction({ busy, canSend, nextProblem: Boolean(next) });
		if (action === "stop") onStop();
		else if (action === "send") onSend();
		else if (action === "next") next?.run();
	};
	// The button follows the text (owner report 2026-10-03): while a turn
	// runs WITH text typed it stays the send (click = steer); only an empty
	// composer morphs it to Stop.
	const stopping = busy && !canSend;
	return (
		<form
			data-testid="composer"
			data-slot="composer"
			className={`flex flex-col ${DOCK_SURFACE}`}
			onSubmit={(e) => {
				e.preventDefault();
				act();
			}}
		>
			{head}
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
				className="max-h-48 min-h-12 resize-none rounded-none border-0 px-4 pb-2 pt-3.5 text-control focus-visible:ring-0"
			/>
			<div data-slot="composer-toolbar" className="flex min-w-0 items-center gap-1 p-2">
				<div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">{toolbar}</div>
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
						type="submit"
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
