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
 */

import { Type } from "typebox";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { invalidInputResult } from "../tool-execute.ts";
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
});

export const teachHandoffInput = Type.Object({
	topic: Type.String({
		description: "REQUIRED — what to teach: his words, or the course topic handle that lapsed.",
	}),
	reason: Type.String({ description: "REQUIRED — one line: why teaching now (he asked, or the topic lapsed again)." }),
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

/** `practice`, for the prober and the teacher. */
export function practiceHandoffTool(ctx: HandoffContext): Record<string, AgentTool<any>> {
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
			if (record && danglingQuestionOf(record.messages) !== null) {
				return invalidInputResult("practice", ["a question is still open — let him answer it before handing off"]);
			}
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
