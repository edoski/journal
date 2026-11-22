/**
 * Round 19, m15 (1 n2, 3 n4): closes said "Mechanics of matrix
 * multiplication comes back on a later day on your calendar" and "you pick
 * those up next", and the Poisson close named his half answer with no day
 * for its lesson. A close names a day for every topic it names.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToolCall } from "@earendil-works/pi-ai";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { VoiceGuard } from "../src/agent/voice-guard.ts";
import { newUserMessage } from "../src/core/native-messages.ts";
import { DONE_TONIGHT_TEXT } from "../src/core/contracts/chat.ts";
import { LEFT_DRAFT_TEXT } from "../src/core/question-core.ts";
import { answered, assistant, doneTonight, explain, nextId, rules, send } from "./helpers/round19-turns.ts";

/** A close after Done for today, the lesson's progress closed with its days. */
async function closingWithDays(): Promise<VoiceGuard> {
	const ask = explain("Which line does $C$ fix?");
	const guard = new VoiceGuard([newUserMessage("Eigenvalues and eigenvectors"), assistant([ask]), answered(ask, "Dismissed.", { dismissed: true, reason: "tonight", draftKept: LEFT_DRAFT_TEXT }), doneTonight()], undefined, false, true);
	const call: ToolCall = { type: "toolCall", id: `c-${nextId()}`, name: "lesson_progress", arguments: { done: [], close: true } };
	guard.screen(call);
	const receipt = JSON.stringify({ ok: true, days: { eigen: { continues: "2026-11-09", continues_words: "tomorrow, Monday 9 November" } }, day_items: { "2026-11-09": { day_words: "tomorrow, Monday 9 November", items: ["Eigenvalues and eigenvectors lesson continues"], lesson: ["Eigenvalues and eigenvectors"] } } });
	const tool = { name: "lesson_progress", label: "lesson_progress", description: "", parameters: {} as never, execute: async () => ({ content: [{ type: "text" as const, text: receipt }], details: null }) } as unknown as AgentTool<never>;
	await guard.wrap(tool).execute(call.id, call.arguments as never, undefined, undefined);
	return guard;
}

describe("m15: a close names a day for every topic it names (1 n2, 3 n4)", () => {
	it("lens 1's close is refused for its day-less return", async () => {
		const broke = rules(await closingWithDays(), send("The last step of your Eigenvalues and eigenvectors lesson continues tomorrow, Monday 9 November. Mechanics of matrix multiplication comes back on a later day on your calendar."));
		assert.ok(broke.includes("vague-day"), broke.join());
	});

	it("lens 3's Calculus close, \"you pick those up next\", is refused", async () => {
		assert.ok(rules(await closingWithDays(), send("The chain rule and shells questions are still due, and you pick those up next.")).includes("vague-day"));
	});

	it("lens 3's Poisson close names the half answer with no day for its lesson", async () => {
		const broke = rules(await closingWithDays(), send("Your half answer to the ratio question waits in your Poisson distribution lesson."));
		assert.ok(broke.includes("half-answer-day"), broke.join());
	});

	it("a close with its days passes", async () => {
		assert.deepEqual(rules(await closingWithDays(), send("Your half answer to the eigenline question waits in your Eigenvalues and eigenvectors lesson, which continues tomorrow, Monday 9 November.")), []);
		assert.deepEqual(rules(await closingWithDays(), send("Your Mechanics review is on Wednesday 11 November, and the rest are on your calendar.")), []);
	});

	it("the close's instructions ask for every named topic's day, this sitting's topics only, and the half answer's lesson day", () => {
		assert.match(DONE_TONIGHT_TEXT.teacher, /since he last pressed Done for today/);
		assert.match(DONE_TONIGHT_TEXT.teacher, /never "a later day" or "next"/);
		assert.match(DONE_TONIGHT_TEXT.teacher, /with the day that lesson continues/);
		assert.match(DONE_TONIGHT_TEXT.teacher, /never that he wrote nothing/);
	});
});
