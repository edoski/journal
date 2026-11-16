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

// ─── The working line (round 11, 3 n9) ────────────────────────────────────

/**
 * The lesson's working line says what he waits for, or nothing more than
 * "Thinking…" (round 11, lesson reading n9: "Searching file contents…",
 * "Moving to teaching…" and "Moving to practice…" named the tutor's
 * machinery). A tool part sits in `input-streaming` for its whole
 * execution (the bridge defers `tool-input-available` to
 * tool_execution_end), so the live card carries the line while it runs;
 * chat.tsx gates the placeholder on `!pending`.
 */
export const THINKING_LINE = "Thinking…";
/** From the probe's end until the lesson's first step reaches him: the
 *  assessment, the hand-off, the plan's reasoning and its map. */
export const PLANNING_LINE = "Planning the lesson…";

/** Tools whose work is itself what he waits for: he will see it. */
const WAIT_LINES: Record<string, string> = {
	probe_done: PLANNING_LINE,
	plan_init: PLANNING_LINE,
	demo: "Building a demo…",
	visual: "Making a visual…",
};

/** Whether the probe is ending or has ended and the lesson's first step
 *  has not yet reached him: no words of the tutor's and no question after
 *  a `probe_done` that was not refused (one still settling counts, so the
 *  line does not blink to Thinking… as the probe's turn closes). Pure. */
export function planningLesson(messages: readonly UIMessage[]): boolean {
	for (let m = messages.length - 1; m >= 0; m--) {
		const parts = messages[m]!.parts;
		for (let p = parts.length - 1; p >= 0; p--) {
			const part = parts[p]!;
			if (part.type === "tool-probe_done") return part.state !== "output-error";
			if (part.type === "text" && typeof part.text === "string" && part.text.trim()) return false;
			if (isToolUIPart(part) && (QUESTION_TOOLS as readonly string[]).includes(part.type.slice("tool-".length))) return false;
		}
	}
	return false;
}

/** The line while nothing he will see is being written. Pure. */
export function workingLine(messages: readonly UIMessage[]): string {
	return planningLesson(messages) ? PLANNING_LINE : THINKING_LINE;
}

/** The line for ONE running tool: the live tool-input card carries it
 *  inline. A question being written is what he waits for; a tool whose work
 *  he will see names it; every other tool shows the turn's own line
 *  (`idle`, `workingLine`). */
export function toolActivityLabel(tool: string, idle: string = THINKING_LINE): string {
	if ((QUESTION_TOOLS as readonly string[]).includes(tool)) return "Writing a question…";
	return WAIT_LINES[tool] ?? idle;
}

export function streamingToolActivity(messages: UIMessage[]): string | null {
	const last = messages.at(-1);
	if (!last || last.role !== "assistant") return null;
	for (const part of last.parts) {
		if (isToolUIPart(part) && part.state === "input-streaming") {
			return toolActivityLabel(part.type.slice("tool-".length), workingLine(messages));
		}
	}
	return null;
}
