/**
 * The mode handoffs: how a session moves between teaching and practice
 * without the learner picking a mode. The prober and the teacher hold
 * `practice`; the practice agent holds `teach`. A successful call is the
 * transcript fact the mode fold reads (core/native-messages.ts
 * sessionModeOf), ends the turn, and queues the wake that starts the other
 * agent's run (the probe_done handoff's pipeline, src/server/jobs.ts).
 *
 * A handoff is refused while the learner owes an answer: an open question
 * (prober, teacher) or an active problem (practice). The refusal is an
 * error result, so the agent repairs and retries and the mode stays put.
 * The stored record only shows this turn's calls once the turn ends, so
 * each side also reads its turn's own state: practice's problem gate, and
 * for the prober and teacher the guard `withPracticeHandoff` adds. A batch
 * holding a handoff runs in call order (the tool is sequential), so the
 * guard sees every earlier call of the batch.
 */

import { Type } from "typebox";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { invalidInputResult } from "../tool-execute.ts";
import { QUESTION_TOOLS } from "../../core/pending.ts";
import { MODE_HANDOFF_ACK_TEXT, type SessionMode } from "../../core/contracts/chat.ts";
import { buildModeHandoffSteer, type SteerMessage } from "../../core/contracts/jobs.ts";
import { danglingQuestionOf, type LhMessage } from "../../core/native-messages.ts";

export interface HandoffContext {
	chatId: string;
	chatStore: { getChat(id: string): { messages: LhMessage[] } | null };
	/** Queue the wake (the server's pipeline, injected). */
	deliver: (steer: SteerMessage) => void;
}

export const practiceHandoffInput = Type.Object({
	scope: Type.String({
		description:
			"REQUIRED — what to practise, in the learner's own words (a topic, a problem, a file), or \"open\" when he named nothing.",
	}),
	reason: Type.String({ description: "REQUIRED — one line: why practice now." }),
	topics: Type.Optional(
		Type.Array(Type.String({ minLength: 1 }), {
			minItems: 1,
			description:
				"When practising a whole lesson: the course topic handles the lesson taught, in the order it taught them. Practice then covers every one, interleaved, and ends on one problem that runs the whole chain.",
		}),
	),
});

export const teachHandoffInput = Type.Object({
	topic: Type.String({
		description: "REQUIRED — what to teach: his words, or the course topic handle that lapsed.",
	}),
	reason: Type.String({ description: "REQUIRED — one line: why teaching now (he asked for an explanation, he asked to be taught, or the topic lapsed again)." }),
});

function handedOff(ctx: HandoffContext, toolCallId: string, mode: SessionMode): AgentToolResult<{ ok: true; mode: SessionMode }> {
	try {
		ctx.deliver(buildModeHandoffSteer(ctx.chatId, toolCallId, mode));
	} catch (err) {
		// The handoff itself is the transcript fact: the learner's next
		// message runs the new agent even when the wake never fires.
		console.error(`[chat ${ctx.chatId}] mode handoff queueing failed:`, err);
	}
	return { content: [{ type: "text", text: MODE_HANDOFF_ACK_TEXT }], details: { ok: true, mode }, terminate: true };
}

/** What this turn has done so far: posed a question or concluded the
 *  probe (the learner now owes an answer, or the teacher is due), or
 *  handed off. */
interface TurnState {
	owed: boolean;
	handedOff: boolean;
}

/** Calls that leave something owed when they succeed. */
const OWING_TOOLS: readonly string[] = [...QUESTION_TOOLS, "probe_done"];

/** The prober's or teacher's registry plus `practice`, with the turn guard:
 *  a handoff after a question or a concluded probe in the same turn is
 *  refused, and so are those calls after a handoff. */
export function withPracticeHandoff(tools: Record<string, AgentTool<any>>, ctx: HandoffContext): Record<string, AgentTool<any>> {
	const turn: TurnState = { owed: false, handedOff: false };
	const guarded = Object.fromEntries(
		Object.entries(tools).map(([name, tool]) => [name, OWING_TOOLS.includes(name) ? guardedByHandoff(name, tool, turn) : tool]),
	);
	return { ...guarded, ...practiceHandoffTool(ctx, turn) };
}

function guardedByHandoff(name: string, tool: AgentTool<any>, turn: TurnState): AgentTool<any> {
	return {
		...tool,
		execute: async (...args: Parameters<AgentTool<any>["execute"]>) => {
			if (turn.handedOff) return invalidInputResult(name, ["the session was just handed to practice: end your turn"]);
			const result = await tool.execute(...args);
			if (!result.isError && (result.details as { ok?: unknown } | null)?.ok !== false) turn.owed = true;
			return result;
		},
	};
}

/** `practice`, for the prober and the teacher. */
export function practiceHandoffTool(ctx: HandoffContext, turn: TurnState = { owed: false, handedOff: false }): Record<string, AgentTool<any>> {
	const tool: AgentTool<typeof practiceHandoffInput> = {
		name: "practice",
		label: "practice",
		description:
			"Hand the session to practice: the practice agent takes over and poses problems on the scope. " +
			"Refused while a question is open. After it succeeds, end your turn.",
		parameters: practiceHandoffInput,
		executionMode: "sequential",
		execute: async (toolCallId) => {
			const record = ctx.chatStore.getChat(ctx.chatId);
			if (turn.owed || (record && danglingQuestionOf(record.messages) !== null)) {
				return invalidInputResult("practice", ["a question is open or the probe just concluded — hand off on a later turn"]);
			}
			turn.handedOff = true;
			return handedOff(ctx, toolCallId, "practice");
		},
	};
	return { practice: tool };
}

/** `teach`, for the practice agent. `problemActive` is the turn's own gate
 *  (tools/practice.ts): the stored record lags a conclude made this turn. */
export function teachHandoffTool(ctx: HandoffContext, gate: { problemActive: boolean }): Record<string, AgentTool<any>> {
	const tool: AgentTool<typeof teachHandoffInput> = {
		name: "teach",
		label: "teach",
		description:
			"Hand the session to teaching: the tutor takes over and teaches the topic. " +
			"Refused while a problem is active — conclude it first. After it succeeds, end your turn.",
		parameters: teachHandoffInput,
		executionMode: "sequential",
		execute: async (toolCallId) => {
			if (gate.problemActive) {
				return invalidInputResult("teach", ["a problem is still active — conclude it before handing off"]);
			}
			return handedOff(ctx, toolCallId, "teach");
		},
	};
	return { teach: tool };
}
