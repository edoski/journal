/**
 * Round 15, m3 (1 m5, 2 n4; round-14 m4's remainder): a close named one
 * course's items for a day. The 10 Nov Linear maps close said "Tomorrow,
 * Wednesday 11 November, brings reviews of Linear maps…, Matrix
 * multiplication…, Rank… and Determinants…", and left out the Random
 * variables review and the Geometric start Probability had that day. The
 * close's `day_items` listed only the lesson's own course, so the voice
 * check passed the partial list. And ⌘⇧D on sheet 4 named no review day:
 * the close contract never asked for one.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToolCall } from "@earendil-works/pi-ai";
import { VoiceGuard } from "../src/agent/voice-guard.ts";
import { planTools } from "../src/agent/tools/plan.ts";
import { LESSON_PROGRESS_TOOL } from "../src/core/contracts/plan.ts";
import { newUserMessage, SEND_TO_USER_TOOL } from "../src/core/native-messages.ts";

const TODAY = "2026-11-10";
const topic = (handle: string, title: string, over: Record<string, unknown>) => ({ handle, title, level: "attempted", introduced: "2026-11-01", ...over });
const LA = {
	workspace: "/study/la",
	today: TODAY,
	topics: [
		topic("linear-maps", "Linear maps and their matrices", { review: { kind: "scheduled", date: "2026-11-11" } }),
		topic("matmul", "Matrix multiplication as composition", { review: { kind: "scheduled", date: "2026-11-11" } }),
		topic("det", "Determinants as volume scaling", { review: { kind: "scheduled", date: "2026-11-11" } }),
	],
};
const PROBABILITY = {
	workspace: "/study/probability",
	today: TODAY,
	topics: [
		topic("random-variables", "Random variables and distributions", { review: { kind: "scheduled", date: "2026-11-11" } }),
		topic("geometric", "Geometric distribution", { level: "new", introduced: null, starts: "2026-11-11", startsWhy: { kind: "next" } }),
		topic("variance", "Variance", { level: "new", introduced: null, starts: "2026-11-20", startsWhy: { kind: "next" } }),
	],
};

function closeTool(courses?: () => Promise<unknown[]>) {
	const course = { course: { workspace: LA.workspace, title: "Linear Algebra" }, records: { map: async () => ({ ok: true, map: LA }), run: async () => ({ ok: true, json: {} }) }, ...(courses ? { courses } : {}) };
	const tree = { nodes: [{ id: "cols", title: "Columns of a map's matrix" }], edges: [], version: 1 };
	return planTools({ chatId: "c1", chatStore: { getChat: () => ({ tree, messages: [], topics: ["linear-maps"] }) } as never, course: course as never })[LESSON_PROGRESS_TOOL]!;
}

describe("a close names a day whole across his courses (round 15, m3)", () => {
	it("its day_items hold every course's items for the day, and nothing past the lesson's last day", async () => {
		const res = await closeTool(async () => [LA, PROBABILITY]).execute("p1", { done: [], close: true });
		const body = JSON.parse((res.content[0] as { text: string }).text) as { day_items: Record<string, { items: string[] }> };
		assert.deepEqual(body.day_items["2026-11-11"]!.items, [
			"Linear maps and their matrices review",
			"Matrix multiplication as composition review",
			"Determinants as volume scaling review",
			"Random variables and distributions review",
			"Geometric distribution starts",
		]);
		assert.deepEqual(Object.keys(body.day_items), ["2026-11-11"], "Variance's start on 20 Nov is past the day the close names");
	});

	it("the guard refuses lens 1's close, which named Linear Algebra's items alone", async () => {
		const tool = closeTool(async () => [LA, PROBABILITY]);
		const guard = new VoiceGuard([newUserMessage("[DONE FOR TODAY]")]);
		const call: ToolCall = { type: "toolCall", id: "p2", name: LESSON_PROGRESS_TOOL, arguments: { done: [], close: true } };
		guard.screen(call);
		await guard.wrap(tool).execute(call.id, call.arguments as never);
		const words = "Tomorrow, Wednesday 11 November, brings reviews of Linear maps and their matrices, Matrix multiplication as composition and Determinants as volume scaling.";
		const send: ToolCall = { type: "toolCall", id: "s1", name: SEND_TO_USER_TOOL, arguments: { message: words } };
		guard.screen(send);
		const refused = (guard as unknown as { decisions: Map<string, { details: { rules?: string[] } } | null> }).decisions.get(send.id);
		assert.ok(refused?.details.rules?.includes("day-part"), JSON.stringify(refused?.details));
	});

	it("a course read that fails leaves the lesson's own course's items", async () => {
		const res = await closeTool(async () => {
			throw new Error("engine down");
		}).execute("p3", { done: [], close: true });
		const body = JSON.parse((res.content[0] as { text: string }).text) as { day_items: Record<string, { items: string[] }> };
		assert.equal(body.day_items["2026-11-11"]!.items.length, 3);
	});

	it("the close contract asks for the topic's next review day (2 n4: ⌘⇧D on sheet 4 named none)", () => {
		assert.match(closeTool().description, /name the day its topic's next review comes, when it has one/);
	});
});
