/**
 * Wave D: these scans read VIEW messages (core/view.ts LhViewMessage — the
 * client's grouped transcript). The part shapes are the same vocabulary the
 * pre-Wave-D client dialect used; a tool part is structural: `tool-` prefix +
 * toolCallId. The server-side record scans (danglingQuestionOf over native
 * LhMessage[]) live in native-messages.ts.
 */
interface UIMessage {
	role?: string;
	parts: Array<Record<string, unknown> & { type: string }>;
}

function isToolUIPart(part: UIMessage["parts"][number]): boolean {
	return part.type.startsWith("tool-") && typeof part.toolCallId === "string";
}

/**
 * The pending-question gate: an unanswered QUESTION tool part (explain/recall/ask)
 * blocks the composer — one question at a time, mirroring the teacher's
 * prompt contract. Derived client state; the server enforces nothing.
 *
 * Scan order: MESSAGES newest-first (a later turn's live question supersedes
 * an older dangling one), but PARTS forward within a message — the model's
 * FIRST unanswered question is the dock subject. Parallel question calls
 * (pi executes them in one batch) are thus answered in the same order they
 * were asked, saved, and rendered as cards; a backward part scan reversed
 * that order (the live modal-realism observation).
 *
 * Job tool parts (research/demo/visual) never pend client-side — the async
 * protocol resolves them server-side with an immediate ack (see
 * contracts/jobs.ts "THE ASYNC PROTOCOL"), so job tools are NOT returned
 * here. This file carries only the question gate and the shared scan helper.
 */
export interface PendingToolCall {
	toolCallId: string;
	tool: string;
	/** Tool input (question args) — lets the composer pick note vs answer mode. */
	input: unknown;
}

/** Client-only identity: projection may group several native assistants.
 * Never persisted or sent as part of an answer event. */
export interface PendingQuestion extends PendingToolCall {
	messageId: string;
	contentIndex: number;
	/** Unique call ids stay stable across live → persisted message stamps.
	 * Reused ids include their native occurrence instead. */
	key: string;
}

/** Tools that render in the question dock and gate the composer. The
 *  probe-phase name (recall, owner 2026-10-09) joins its teach twin. The
 *  removed multiple-choice tools (quiz, probe — 7 Nov 2026) are absent:
 *  an old transcript's unanswered one never pends, and its answered ones
 *  render as plain read-only cards. */
export const QUESTION_TOOLS = ["ask_user_question", "explain", "recall"] as const;

/** The tool→kind map (the dock's own fold, named once — the dismissal
 *  path and the dock must never disagree on what a tool is). The probe
 *  name folds onto its teach kind — the dock is kind-driven. */
export function toolQuestionKind(tool: string): "ask" | "explain" {
	return tool === "explain" || tool === "recall" ? "explain" : "ask";
}

/** Tools fulfilled by background sub-agent jobs (W2/W6). */
export const JOB_TOOLS = ["research", "demo", "visual"] as const;

/** Grouped view messages lose native assistant boundaries. Native callers
 * supply the exact occurrence, not just an id: its OWN part must have cleared
 * validation. Never fall back to an older available question.
 * null means no native pending question. */
export function findPendingToolCall(messages: UIMessage[], authority: PendingQuestion | null): PendingQuestion | null {
	if (authority === null) return null;
	for (let m = messages.length - 1; m >= 0; m--) {
		for (const part of messages[m]!.parts) {
			if (part.state === "input-available" && part.type === `tool-${authority.tool}` &&
				part.toolCallId === authority.toolCallId && part.sourceMessageId === authority.messageId &&
				part.sourceContentIndex === authority.contentIndex) return authority;
		}
	}
	return null;
}

// ─── Turn activity label (2026-09-19, the “Writing a question…” fix) ──────

/**
 * The transcript's turn-activity shimmer text: what the teacher is
 * doing RIGHT NOW. A tool part sits in `input-streaming` for its whole
 * execution (the bridge defers `tool-input-available` to
 * tool_execution_end — the invalid-input gate for the question dock), so
 * keying the old “Writing a question…” shimmer on ANY streaming tool
 * part mislabeled minutes-long local greps as question-writing. The label
 * now names the actual activity; chat.tsx gates it on `!pending` and
 * renders it as the quiet transcript shimmer.
 */
const ACTIVITY_LABELS: Record<string, string> = {
	Read: "Reading a file…",
	Glob: "Finding files…",
	Grep: "Searching file contents…",
	research: "Dispatching research…",
	demo: "Building a demo…",
	visual: "Making a visual…",
	pdf: "Reading a PDF…",
	plan_init: "Drawing up the plan…",
	lesson_progress: "Marking your progress…",
	probe_done: "Concluding the assessment…",
	practice: "Moving to practice…",
	teach: "Moving to teaching…",
};

/** The activity label for ONE running tool (owner, streaming round
 *  2026-10-01): the live tool-input card carries it inline — spinner +
 *  shimmered label on the card itself, replacing the retired transcript
 *  bottom line. Question tools are excluded here: their input-streaming
 *  part renders in the dock, never a live card. */
export function toolActivityLabel(tool: string): string {
	if ((QUESTION_TOOLS as readonly string[]).includes(tool)) return "Writing a question…";
	return ACTIVITY_LABELS[tool] ?? "Working…";
}

export function streamingToolActivity(messages: UIMessage[]): string | null {
	const last = messages.at(-1);
	if (!last || last.role !== "assistant") return null;
	for (const part of last.parts) {
		if (isToolUIPart(part) && part.state === "input-streaming") {
			return toolActivityLabel(part.type.slice("tool-".length));
		}
	}
	return null;
}


