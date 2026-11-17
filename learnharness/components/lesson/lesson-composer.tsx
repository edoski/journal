"use client";

/* The composer's anatomy and sizes are adapted from T3 Code's ChatComposer
 * and ComposerSurface (github.com/pingdotgg/t3code, apps/web/src/components/
 * chat/), MIT License, Copyright (c) 2026 T3 Tools Inc. The notice is in
 * components/lesson/T3CODE_LICENSE.txt. */

import { useCallback, useLayoutEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { ArrowRightIcon, ArrowUpIcon, SquareIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PendingPhotos, PhotoAttachButton, type PhotoDraft } from "@/components/photos";

/** What one Enter press does, in precedence order: send the message,
 *  otherwise run the empty field's go-ahead: the practice pause's next
 *  problem (owner round 16), or Try again after a reply that never came.
 *  Enter never stops a turn (round 3, 14 Nov 2026): a second Enter a
 *  second after a send landed on the empty field and killed the reply.
 *  Stopping is the square's or Esc's, through the confirm. Pure so the
 *  static-render harness can pin the decision. */
export function enterAction(state: {
	busy: boolean;
	canSend: boolean;
	/** The between-problems pause is live: practice session, nothing
	 *  active, no turn in flight (the caller's fold). */
	nextProblem?: boolean;
	/** The empty field's own go-ahead (Try again), when the host has one. */
	emptyAction?: boolean;
}): "send" | "next" | "empty-action" | "none" {
	// While a turn runs, typed text makes Enter a steer (the queued send).
	if (state.canSend) return "send";
	if (state.busy) return "none";
	if (state.nextProblem) return "next";
	if (state.emptyAction) return "empty-action";
	return "none";
}

/** Send submits an answer instead of a message (spec: lesson-composer.md):
 *  the button and Enter run `onSubmit` while `ready`, whatever the field
 *  holds (a picked option may be the whole answer). */
export interface ComposerAnswer {
	onSubmit: () => void;
	/** Whether there is an answer to submit. */
	ready: boolean;
	/** The send button's name, "Submit answer" unless the question says otherwise. */
	label?: string;
}

export interface LessonComposerProps {
	busy: boolean;
	value: string;
	onChange: (value: string) => void;
	onSend: () => void;
	onStop: () => void;
	canSend: boolean;
	autoFocus?: boolean;
	/** The field's placeholder; a host names what it wants here, such as
	 *  the answer an open question asks for. */
	placeholder?: string;
	/** Controls at the toolbar's left, after attach (Hint, Show me, Explain
	 *  instead): each a ComposerIcon, 2px apart. */
	leading?: ReactNode;
	/** Controls at the toolbar's right, before the send (how sure he is,
	 *  answering or asking), 4px apart. */
	toolbar?: ReactNode;
	/** While set, Send and Enter submit an answer (ComposerAnswer). */
	answer?: ComposerAnswer;
	/** A row inside the surface above the field. */
	head?: ReactNode;
	/** The practice pause: the empty composer's button is Next problem and
	 *  Enter on the empty field runs it. */
	nextProblem?: boolean;
	onNext?: () => void;
	/** What Enter on the empty, idle field does when no button says so (Try again). */
	onEmptyEnter?: () => void;
	/** Photos of his working: the attach button leads the toolbar,
	 *  thumbnails wait above the field, paste and drop add more. */
	photos?: PhotoDraft;
	/** The host wants the composer compact: while it is (and the field is
	 *  empty, holds no photos and is not focused) the composer is one row,
	 *  the field on one line with send at its end, its toolbar and its head
	 *  (a posed question's quote) folded away.
	 *  Focusing it, or words or photos in it, opens it to the full composer.
	 *  The course page keeps it compact; a lesson while he scrolls up its
	 *  conversation (T3 Code's collapsed composer). */
	compact?: boolean;
}

/** The surface's one outline: a 1px hairline at white 5% with a 3% inset
 *  highlight, drawn on ::after so it never takes layout (T3 Code). A field
 *  focused inside lifts it to the ring at 50%. The lesson's course-link
 *  banner draws it too, so the lesson's foot is one family. */
export const COMPOSER_SURFACE =
	"relative isolate w-full rounded-[16px] bg-card transition-[outline-color] after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:border after:border-white/5 after:inset-shadow-2xs after:inset-shadow-white/3 outline-1 -outline-offset-1 outline-transparent has-[textarea:focus]:outline-ring/50 motion-reduce:transition-none";

/** The lesson's composer (spec: lesson-composer.md): one 16px-radius card,
 *  the field on top (14px, two lines growing to 208px), the toolbar under
 *  it with attach on the left, quiet chips on the right and one 32px round
 *  send. Its host draws no shell around it. */
export function LessonComposer({
	busy,
	value,
	onChange,
	onSend,
	onStop,
	canSend,
	autoFocus,
	placeholder = "Ask the tutor anything…",
	leading,
	toolbar,
	answer,
	head,
	nextProblem = false,
	onNext,
	onEmptyEnter,
	photos,
	compact = false,
}: LessonComposerProps) {
	const [focused, setFocused] = useState(false);
	const empty = !value.trim() && !(photos?.photos.length ?? 0);
	const collapsed = compact && !focused && empty;
	const fieldRef = useRef<HTMLTextAreaElement>(null);
	// Turning compact as he reads up a lesson, an empty field lets go of focus, so the composer folds; a key
	// he types lands back in it (type-to-compose). A field holding words keeps focus and stays open.
	const wasCompact = useRef(compact);
	useLayoutEffect(() => {
		if (compact && !wasCompact.current && empty && document.activeElement === fieldRef.current) fieldRef.current?.blur();
		wasCompact.current = compact;
	}, [compact, empty]);
	const next = nextProblem && !answer ? { label: "Next problem", run: () => onNext?.(), testId: "next-problem-button" } : undefined;
	const act = () => {
		if (answer) {
			if (answer.ready) answer.onSubmit();
			return;
		}
		const action = enterAction({ busy, canSend, nextProblem: Boolean(next), emptyAction: Boolean(onEmptyEnter) });
		if (action === "send") onSend();
		else if (action === "next") next?.run();
		else if (action === "empty-action") onEmptyEnter?.();
	};
	// The square stops a turn while nothing can go: an empty message field
	// (typed text keeps the send, which steers), or an answer that waits for
	// the turn to end (round 10, 4 minor 6: a dead send arrow showed while
	// the tutor was still writing, and Enter seemed to do nothing).
	const stopping = busy && (answer ? !answer.ready : !canSend);
	const sendLabel = stopping ? "Stop" : answer ? (answer.label ?? "Submit answer") : "Send";
	const sendDisabled = stopping ? false : answer ? !answer.ready : !busy && !canSend;
	const field = (
		<textarea
			ref={fieldRef}
			value={value}
			onChange={(e) => onChange(e.target.value)}
			onKeyDown={(e) => {
				// Enter sends, Shift+Enter is a newline, ⌘/Ctrl+Enter sends.
				if (e.key === "Enter" && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
					e.preventDefault();
					act();
				}
			}}
			placeholder={placeholder}
			autoFocus={autoFocus}
			rows={1}
			aria-label={answer ? "Your answer" : "Message"}
			data-slot="composer-field"
			className={cn(
				"-m-1 block field-sizing-content max-h-52 min-h-[calc(2lh+0.5rem)] w-[calc(100%+0.5rem)] resize-none overflow-y-auto bg-transparent p-1 text-body leading-relaxed text-foreground outline-none placeholder:text-muted-foreground",
				// Collapsed, the field is one line; it eases back to its two as the composer opens.
				compact && "transition-[min-height] duration-200 ease-out motion-reduce:transition-none",
				collapsed && "min-h-[calc(1lh+0.5rem)]",
			)}
		/>
	);
	const sendControl =
		next && !busy && !canSend ? (
			<Button
				type="submit"
				size="pill"
				data-testid={next.testId}
				aria-label={next.label}
				className="ms-2 px-3 transition-opacity hover:bg-primary hover:opacity-90 has-[>svg]:px-3 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-card motion-reduce:transition-none"
			>
				{next.label}
				<ArrowRightIcon />
			</Button>
		) : (
			<Button
				// The square stops the turn by a click only (through the
				// host's confirm); Enter never reaches it.
				type={stopping ? "button" : "submit"}
				onClick={stopping ? onStop : undefined}
				size="icon-sm"
				data-slot="composer-send"
				aria-label={sendLabel}
				disabled={sendDisabled}
				className={cn(
					"ms-2 rounded-full transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-card motion-reduce:transition-none",
					stopping ? "bg-fill-selected text-foreground hover:bg-fill-selected" : "hover:bg-primary disabled:opacity-40",
				)}
			>
				{stopping ? <SquareIcon /> : <ArrowUpIcon />}
			</Button>
		);
	return (
		<form
			data-testid="composer"
			data-slot="composer"
			data-mode={answer ? "answer" : "message"}
			data-collapsed={collapsed || undefined}
			className={cn(COMPOSER_SURFACE, photos?.dragging && "outline-ring")}
			onFocus={() => setFocused(true)}
			onBlur={(e) => {
				if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
			}}
			onSubmit={(e) => {
				e.preventDefault();
				act();
			}}
			{...photos?.surface}
		>
			{!collapsed && head}
			{photos && <PendingPhotos draft={photos} />}
			<div
				data-slot="composer-body"
				className={cn(compact && "flex min-w-0 items-center transition-[padding] duration-200 ease-out motion-reduce:transition-none", collapsed ? "py-1.5 pr-2 pl-4" : "px-4 pt-4 pb-2")}
			>
				{/* One place for the field in either state, so it never remounts and drops focus as the composer folds. */}
				<div className={compact ? "min-w-0 flex-1" : "contents"}>{field}</div>
				{collapsed && sendControl}
			</div>
			{/* The toolbar folds away while the composer is compact, sliding open as it opens (grid rows 0fr to 1fr). */}
			<div
				className={cn(compact && "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none", compact && (collapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]"))}
				inert={collapsed || undefined}
			>
				<div className={cn(compact && "min-h-0 overflow-hidden")}>
					<div data-slot="composer-toolbar" className="flex min-w-0 items-center px-2 pb-2">
						<div data-slot="composer-leading" className="flex min-w-0 flex-1 items-center gap-0.5">
							{photos && <PhotoAttachButton draft={photos} />}
							{leading}
						</div>
						<div data-slot="composer-controls" className="flex shrink-0 items-center gap-1">
							{toolbar}
						</div>
						{!collapsed && sendControl}
					</div>
				</div>
			</div>
		</form>
	);
}

/** The lesson's composer with its own keystroke state: the owning lesson
 *  keeps the draft in a ref for send, so typing never rerenders the
 *  transcript; `revision` marks a draft the lesson reset. */
export function LessonSessionComposer({
	value,
	revision,
	onChange,
	sendAllowed,
	photos,
	...rest
}: Omit<LessonComposerProps, "canSend"> & {
	revision: number;
	sendAllowed: boolean;
}) {
	const [draft, setDraft] = useState(value);
	useLayoutEffect(() => {
		setDraft(value);
	}, [revision, value]);
	// A photo alone is a message.
	const canSend = sendAllowed && (draft.trim().length > 0 || (photos?.photos.length ?? 0) > 0);
	const applyDraft = useCallback(
		(next: string) => {
			setDraft(next);
			onChange(next);
		},
		[onChange],
	);
	return <LessonComposer {...rest} value={draft} onChange={applyDraft} canSend={canSend} photos={photos} />;
}

/** One quiet icon control for the toolbar (Hint, Show me, Explain
 *  instead, how sure he is): a 32px circle, the attach button's size and
 *  ink, the hover fill; `pressed` reads selected. Its words live in its
 *  Hint and its aria-label. */
export function ComposerIcon({ pressed, className, ...props }: ComponentProps<typeof Button> & { pressed?: boolean }) {
	return (
		<Button
			type="button"
			variant="quiet"
			size="icon-row"
			data-slot="composer-control"
			aria-pressed={pressed}
			className={cn("rounded-full", pressed && "bg-fill-selected text-foreground hover:bg-fill-selected", className)}
			{...props}
		/>
	);
}
