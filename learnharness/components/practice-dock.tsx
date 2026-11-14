"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDownIcon, BookOpenIcon, EyeIcon, LightbulbIcon, type LucideIcon } from "lucide-react";
import { ToolContentResponse } from "@/components/ai-elements/message";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useEnterSubmits } from "@/components/enter-submits";
import { ConfidenceChoice } from "@/components/confidence-choice";
import { Hint } from "@/components/ui/hint";
import { DEFAULT_CONFIDENCE, kbdEventForAction, type Confidence, type KeyAction, type PracticeRequest } from "@/src/core";

/** The three requests, in the order the row shows them. */
const REQUESTS: readonly { request: PracticeRequest; label: string; hint: string; icon: LucideIcon; action: KeyAction }[] = [
	{ request: "hint", label: "Hint", hint: "Get a nudge, not the answer", icon: LightbulbIcon, action: "practice-hint" },
	{ request: "show", label: "Show me", hint: "Stop here and see the solution", icon: EyeIcon, action: "practice-show" },
	{ request: "explain", label: "Explain instead", hint: "Leave this problem and be taught the idea", icon: BookOpenIcon, action: "practice-explain" },
];

/**
 * The practice dock (practice sessions, owner design 2026-10-04): an
 * ACTIVE problem replaces the chat composer — the persistent bottom blob
 * morphs into the problem. The agent's statement above; the learner's
 * half below — "Your thinking", one field with one Submit button beside
 * the three requests (owner round 2, 2026-10-05): Enter sends,
 * Shift+Enter makes a newline.
 * There are no lanes — whether a submission claims an answer is apparent
 * from the thinking itself; the agent reads it. One problem may carry
 * many submissions; each starts a turn and carries one of three
 * confidence states, neutral unless the learner taps another.
 *
 * Collapse (scroll-up → slim bar) is owned by the DockOverlay; this
 * component is content only, for the dock surface (lesson/dock-surface.md),
 * and the expanded form stays MOUNTED while
 * collapsed (hidden) so a half-written trace survives scrolling.
 *
 * The commitment (modelSolution, decisionPoints, …) rides the tool call's
 * arguments and is NOT rendered here — only the statement is the
 * learner's. Esc dismisses the problem (the layered-Esc chain; the
 * confirm dialog then the silent route) — claimed by the page, not here.
 */

export interface PracticeDockProps {
	/** The active problem's tool-call id (submissions target it). */
	problemCallId: string;
	/** The pose's arguments — only the statement is the learner's (the
	 *  mode badge would edge toward announcing the target; dropped). */
	input: { statement: string };
	/** Collapse state, owned by the DockOverlay. */
	expanded: boolean;
	onExpand: () => void;
	/** text + confidence — POST {type:"thinking"} (one lane; the register is read from the text). */
	onSubmit: (text: string, confidence: Confidence) => void;
	/** A request button (Hint, Show me, Explain instead), with the work in
	 *  the field so far: POST {type:"request"}, never an answer. */
	onRequest: (request: PracticeRequest, text: string) => void;
	/** Compaction is running for this chat (owner round 14): the thinking
	 *  POST would block on the server's compaction gate — disable submit
	 *  and say so in the hint row. The server registry is the real gate;
	 *  this is the affordance. */
	compactionRunning?: boolean;
	/** The tutor is answering him: the submit and the requests wait, so a
	 *  second press cannot stack a second request on the first. */
	busy?: boolean;
	/** What he has typed so far, on every change (stranded-draft.ts). */
	onDraftChange?: (text: string) => void;
}

export function PracticeDock({ problemCallId, input, expanded, onExpand, onSubmit, onRequest, compactionRunning = false, busy = false, onDraftChange }: PracticeDockProps) {
	const waiting = compactionRunning || busy;
	const [thinking, setThinking] = useState("");
	const [confidence, setConfidence] = useState<Confidence>(DEFAULT_CONFIDENCE);
	const draftChangeRef = useRef(onDraftChange);
	draftChangeRef.current = onDraftChange;
	useEffect(() => {
		draftChangeRef.current?.(thinking);
	}, [thinking]);

	const submit = () => {
		if (waiting) return;
		const text = thinking.trim();
		if (text.length === 0) return;
		setThinking("");
		setConfidence(DEFAULT_CONFIDENCE);
		onSubmit(text, confidence);
	};

	// A request carries the work so far and leaves it in the field: after
	// a hint he carries on from it, and nothing he typed seems to vanish.
	const request = (kind: PracticeRequest) => {
		if (waiting) return;
		onRequest(kind, thinking.trim());
	};
	const requestRef = useRef(request);
	requestRef.current = request;
	useEffect(() => {
		const listeners = REQUESTS.map(({ request: kind, action }) => {
			const listener = () => requestRef.current(kind);
			window.addEventListener(kbdEventForAction(action), listener);
			return () => window.removeEventListener(kbdEventForAction(action), listener);
		});
		return () => listeners.forEach((off) => off());
	}, []);

	const requestButtons = () =>
		REQUESTS.map(({ request: kind, label, hint, icon: Icon, action }) => (
			<Hint key={kind} label={hint} action={action}>
				<Button
					type="button"
					variant="quiet"
					size="pill"
					data-testid={`practice-request-${kind}`}
					disabled={waiting}
					onClick={() => request(kind)}
				>
					<Icon />
					{label}
				</Button>
			</Hint>
		));

	/* ENTER SUBMITS FROM ANYWHERE (owner round 6, 2026-10-05): the
	 * window-level Enter (typing surfaces and buttons excluded) submits
	 * the trace. Mounted
	 * while the dock is — collapsed bar included (the trace survives). */
	useEnterSubmits(submit);

	if (!expanded) {
		return (
			<Button
				variant="list"
				size="row"
				data-testid="practice-dock-bar"
				onClick={onExpand}
				className="h-12 gap-3 rounded-none px-4 focus-visible:ring-inset"
			>
				<span className="shrink-0 text-muted-foreground">Problem</span>
				<span className="min-w-0 flex-1 truncate text-muted-foreground">{input.statement}</span>
				<span className="flex shrink-0 items-center gap-1 text-foreground">
					Answer
					<ArrowDownIcon className="size-4" />
				</span>
			</Button>
		);
	}
	return (
		<div data-testid="practice-dock" data-problem={problemCallId}>
			<div data-dock-scroll-area="" className="max-h-[var(--dock-max-h,40vh)] overflow-y-auto px-4 pt-4">
				<ToolContentResponse>{input.statement}</ToolContentResponse>
			</div>
			<div className="mx-4 mt-3 border-t" />
			<Textarea
				data-testid="practice-thinking-field"
				aria-label="Your thinking"
				value={thinking}
				onChange={(e) => setThinking(e.target.value)}
				onKeyDown={(e) => {
					// The field claims Esc so the window chain doesn't open
					// the problem's dismiss confirm under the cursor.
					if (e.key === "Escape") {
						e.preventDefault();
						e.stopPropagation();
						return;
					}
					// Enter sends; Shift+Enter is the newline, ⌘/Ctrl+Enter the chord too.
					if (e.key === "Enter" && (!e.shiftKey || e.metaKey || e.ctrlKey)) {
						e.preventDefault();
						submit();
					}
				}}
				placeholder="Work here, think out loud."
				rows={3}
				className="block max-h-64 min-h-20 resize-none rounded-none border-0 px-4 pb-1 pt-3 text-control focus-visible:ring-0"
			/>
			<div className="flex items-center gap-3 p-2 pl-3">
				<ConfidenceChoice value={confidence} onChange={setConfidence} />
				{compactionRunning ? (
					<span aria-hidden className="min-w-0 truncate text-label text-muted-foreground">Compacting the conversation…</span>
				) : (
					<div data-testid="practice-requests" className="flex min-w-0 items-center gap-0.5">{requestButtons()}</div>
				)}
				<Button
					type="button"
					data-testid="practice-send"
					disabled={thinking.trim().length === 0 || waiting}
					onClick={() => submit()}
					size="pill"
						className="ml-auto focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
				>
					Submit
				</Button>
			</div>
		</div>
	);
}
