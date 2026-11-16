import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import type { ToolCall } from "@earendil-works/pi-ai";
import { LESSON_PROGRESS_TOOL, lessonProgressOf } from "../core/contracts/plan.ts";
import { MODE_HANDOFF_TOOLS, PRACTICE_PROBLEM_TOOL, type LhMessage } from "../core/native-messages.ts";
import { QUESTION_TOOLS } from "../core/pending.ts";
import { doneTonightAtEnd } from "../core/session-end.ts";

/** The calls that start something he must answer or that runs on: a
 *  question, a problem, a lesson plan, a probe's end (it starts the
 *  lesson) and a mode handoff. */
const STARTS_WORK: ReadonlySet<string> = new Set([...QUESTION_TOOLS, PRACTICE_PROBLEM_TOOL, "plan_init", "probe_done", ...Object.keys(MODE_HANDOFF_TOOLS)]);

const CLOSED: AgentToolResult<null> = {
	content: [{ type: "text", text: "Refused: the session is closed for today, so nothing more is asked, posed or started in it. End your turn now, with no more words." }],
	details: null,
	isError: true,
};

/**
 * One turn's stop after the session closed for today: once the turn
 * answers his Done for today, or the tutor's own `lesson_progress` with
 * `close` has streamed, every call that starts new work is refused
 * (round 14, M1 and M6: after the closing words the tutor asked the left
 * question again, or opened Problem sheet 4 in the Eigen lesson and posed
 * part (c), so a session he had stopped read "Your turn" everywhere).
 */
export class ClosedTurn {
	private closed: boolean;

	constructor(messages: readonly LhMessage[]) {
		this.closed = doneTonightAtEnd(messages);
	}

	/** Read a call as it finishes streaming: the close counts from there,
	 *  so a question in the same reply is refused too. */
	screen(call: ToolCall): void {
		if (call.name === LESSON_PROGRESS_TOOL && lessonProgressOf(call.arguments)?.close === true) this.closed = true;
	}

	wrap<T extends AgentTool<any>>(tool: T): T {
		if (!STARTS_WORK.has(tool.name)) return tool;
		return { ...tool, execute: async (toolCallId, params, signal, onUpdate) => (this.closed ? CLOSED : tool.execute(toolCallId, params, signal, onUpdate)) };
	}
}
