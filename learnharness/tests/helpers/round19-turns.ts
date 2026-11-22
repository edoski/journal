/** Turns of a tutor session for the round-19 voice tests: calls, his
 *  answers, and the guard's verdict on a call. */
import { fauxAssistantMessage, type ToolCall } from "@earendil-works/pi-ai";
import { VoiceGuard } from "../../src/agent/voice-guard.ts";
import { SEND_TO_USER_TOOL, type LhMessage } from "../../src/core/native-messages.ts";
import { DONE_TONIGHT_TEXT } from "../../src/core/contracts/chat.ts";

let n = 0;
export const nextId = (): number => ++n;
export const send = (message: string): ToolCall => ({ type: "toolCall", id: `s-${++n}`, name: SEND_TO_USER_TOOL, arguments: { message } });
export const explain = (question: string, type = "check", nodeId = "eigen-equation"): ToolCall => ({ type: "toolCall", id: `q-${++n}`, name: "explain", arguments: { question, type, nodeId, correctAnswer: "…" } });
export const recall = (question: string): ToolCall => ({ type: "toolCall", id: `q-${++n}`, name: "recall", arguments: { question, correctAnswer: "…" } });
export const save = (question: string, result: string, topics = ["eigen"], extra: Record<string, unknown> = {}): ToolCall => ({
	type: "toolCall",
	id: `v-${++n}`,
	name: "course_save",
	arguments: { changes: { observations: [{ question, topics, text: "Took both axes as stretched", response: "…", help: "none", result, ...extra }] } },
});
export const progress = (done: string[]): ToolCall => ({ type: "toolCall", id: `p-${++n}`, name: "lesson_progress", arguments: { done } });
export const assistant = (content: unknown[]): LhMessage => ({ ...fauxAssistantMessage(""), content, id: `a-${++n}` }) as LhMessage;
export const answered = (call: ToolCall, text: string, details: Record<string, unknown> = {}): LhMessage =>
	({ id: `r-${++n}`, role: "toolResult", toolCallId: call.id, toolName: call.name, content: [{ type: "text", text }], details: { kind: call.name, text, answeredAt: "2026-11-08T10:00:00Z", ...details }, isError: false, timestamp: 1 }) as LhMessage;
export const brief = (text: string): LhMessage => ({ id: `b-${++n}`, role: "custom", customType: "course-context", content: text, display: false, details: {}, timestamp: 1 }) as LhMessage;
export const doneTonight = (): LhMessage => ({ id: `d-${++n}`, role: "custom", customType: "done-tonight", content: DONE_TONIGHT_TEXT.teacher, display: false, details: {}, timestamp: 2 }) as LhMessage;
export const verdict = (guard: VoiceGuard, call: ToolCall): { withheld: string; rules?: string[] } | null => {
	guard.screen(call);
	const refused = (guard as unknown as { decisions: Map<string, { details: { withheld: string; rules?: string[] } } | null> }).decisions.get(call.id);
	return refused ? refused.details : null;
};
export const rules = (guard: VoiceGuard, call: ToolCall): string[] => {
	const v = verdict(guard, call);
	return v ? (v.rules ?? [v.withheld]) : [];
};

