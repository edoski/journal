/**
 * A close that names what a day holds names all of it (round 14, m4): the
 * 9 Nov close said "On Wednesday 11 November you have your Matrix
 * multiplication as composition review and you start Linear maps", and
 * left out the Determinants review planned that day too. The close's
 * result lists every item of each day from today to the lesson's last
 * named day (`day_items`), and the voice check refuses a partial list.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { ToolCall } from "@earendil-works/pi-ai";
import { VoiceGuard } from "../src/agent/voice-guard.ts";
import { planTools } from "../src/agent/tools/plan.ts";
import { LESSON_PROGRESS_TOOL } from "../src/core/contracts/plan.ts";
import { partialDay } from "../src/core/voice-check.ts";
import { newUserMessage, SEND_TO_USER_TOOL } from "../src/core/native-messages.ts";

const TODAY = "2026-11-09";
const topic = (handle: string, title: string, over: Record<string, unknown>) => ({ handle, title, level: "attempted", introduced: "2026-11-01", ...over });
const MAP = {
	today: TODAY,
	topics: [
		topic("eigen", "Eigenvalues and eigenvectors", { review: { kind: "scheduled", date: "2026-11-12" } }),
		topic("matmul", "Matrix multiplication as composition", { review: { kind: "scheduled", date: "2026-11-11" } }),
		topic("det", "Determinants as volume scaling", { review: { kind: "scheduled", date: "2026-11-11" } }),
		topic("maps", "Linear maps and their matrices", { level: "new", introduced: null, starts: "2026-11-11", startsWhy: { kind: "next" } }),
		topic("kernel", "Kernel and rank-nullity", { review: { kind: "scheduled", date: "2026-11-20" } }),
	],
};

async function close(): Promise<{ text: string; tool: AgentTool<any> }> {
	const course = { course: { workspace: "/study/la", title: "Linear Algebra" }, records: { map: async () => ({ ok: true, map: MAP }), run: async () => ({ ok: true, json: {} }) } };
	const tree = { nodes: [{ id: "eig", title: "Finding the eigenvalues" }], edges: [], version: 1 };
	const tool = planTools({ chatId: "c1", chatStore: { getChat: () => ({ tree, messages: [], topics: ["eigen"] }) } as never, course: course as never })[LESSON_PROGRESS_TOOL]!;
	const res = await tool.execute("p1", { done: [], close: true });
	return { text: (res.content[0] as { text: string }).text, tool };
}

describe("a close names a day whole (round 14, m4)", () => {
	it("the close's result lists every item of each day up to the lesson's last named day", async () => {
		const body = JSON.parse((await close()).text) as { day_items: Record<string, unknown> };
		assert.deepEqual(body.day_items, {
			"2026-11-11": {
				day_words: "Wednesday 11 November",
				items: ["Matrix multiplication as composition review", "Determinants as volume scaling review", "Linear maps and their matrices starts"],
				lesson: ["Eigenvalues and eigenvectors"],
			},
			"2026-11-12": { day_words: "Thursday 12 November", items: ["Eigenvalues and eigenvectors review"], lesson: ["Eigenvalues and eigenvectors"] },
		});
	});

	it("refuses a day named with part of what it holds, and passes the day whole or alone", () => {
		const days = {
			"2026-11-11": { day_words: "Wednesday 11 November", items: ["Matrix multiplication as composition review", "Determinants as volume scaling review", "Linear maps and their matrices starts"], lesson: [] },
			"2026-11-12": { day_words: "Thursday 12 November", items: ["Eigenvalues and eigenvectors review", "Rank and the column space review"], lesson: ["Eigenvalues and eigenvectors"] },
		};
		const lens = "Your Eigenvalues and eigenvectors review comes back on Thursday 12 November. On Wednesday 11 November you have your Matrix multiplication as composition review and you start Linear maps and their matrices.";
		assert.equal(partialDay(lens, days), "Wednesday 11 November: Determinants as volume scaling review");
		assert.equal(partialDay("On Wednesday 11 November you review Matrix multiplication as composition and Determinants as volume scaling, and start Linear maps and their matrices.", days), null);
		assert.equal(partialDay("Your Eigenvalues and eigenvectors review comes back on Thursday 12 November.", days), null, "the lesson's own topic on its day is not a list of the day");
	});

	it("the guard reads the close's day_items and refuses the partial close", async () => {
		const guard = new VoiceGuard([newUserMessage("[DONE FOR TODAY]")]);
		const { tool } = await close();
		const call: ToolCall = { type: "toolCall", id: "p2", name: LESSON_PROGRESS_TOOL, arguments: { done: [], close: true } };
		guard.screen(call);
		await guard.wrap(tool).execute(call.id, call.arguments as never);
		const words = "Your Eigenvalues and eigenvectors review comes back on Thursday 12 November. On Wednesday 11 November you have your Matrix multiplication as composition review and you start Linear maps and their matrices.";
		const send: ToolCall = { type: "toolCall", id: "s1", name: SEND_TO_USER_TOOL, arguments: { message: words } };
		guard.screen(send);
		const refused = (guard as unknown as { decisions: Map<string, { details: { rules?: string[] } } | null> }).decisions.get(send.id);
		assert.ok(refused?.details.rules?.includes("day-part"), JSON.stringify(refused?.details));
	});
});
