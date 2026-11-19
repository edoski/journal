/**
 * Round 18, m3 (2 m3): on part (c) of Problem sheet 4, with the meter on
 * Confident, he wrote "Honestly not sure, gut feeling." The card and
 * `sure: confident` were right (the meter wins), but o132's `response`
 * dropped the sentence; round 17's had kept it. His words of doubt beside a
 * Confident meter stay in the saved response, and a save that drops them
 * is refused.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { courseTools, type CourseToolContext } from "../src/agent/tools/course.ts";
import { answeredQuestionsOf, type LhMessage } from "../src/core/native-messages.ts";

const HIS = "dim ker A = 2, since rank A = 2 and A has 4 columns. Honestly not sure, gut feeling.";

/** The part's question and his answer, as the session holds them. */
const messages = [
	{ id: "a1", role: "assistant", content: [{ type: "toolCall", id: "q1", name: "explain", arguments: { question: "Show that $\\dim \\ker A = 2$.", nodeId: "c" } }], stopReason: "toolUse", timestamp: 1 },
	{ id: "r1", role: "toolResult", toolCallId: "q1", toolName: "explain", content: [{ type: "text", text: HIS }], details: { text: HIS, confidence: "confident" }, isError: false, timestamp: 2 },
] as unknown as LhMessage[];

function saving() {
	const saves: unknown[] = [];
	const ctx: CourseToolContext = {
		course: { workspace: "/study/la", title: "Linear Algebra" },
		records: { run: async (_w, verb) => (verb.verb === "save" && saves.push(verb.changes), { ok: true, json: { saved: ["o132"], notes: [] } }) } as CourseToolContext["records"],
		arcs: false,
		answers: answeredQuestionsOf(messages),
	};
	const save = async (response: string) => {
		const observation = { topics: ["kernel"], text: "Read $\\dim \\ker A$ from the rank and the column count", response, help: "none", result: "correct", sure: "confident", question: "q1" };
		try {
			await courseTools(ctx).course_save!.execute("t1", { changes: { observations: [observation] } } as never);
			return null;
		} catch (error) {
			return (error as Error).message;
		}
	};
	return { saves, save };
}

describe("his words of doubt beside a Confident meter (round 18, m3)", () => {
	it("are what the session keeps of his answer", () => {
		assert.equal(answeredQuestionsOf(messages).get("q1")?.words, HIS);
	});

	it("refuse a response that drops them, and keep one that holds them", async () => {
		const { saves, save } = saving();
		assert.match((await save("dim ker A = 2, since rank A = 2 and A has 4 columns")) ?? "", /he wrote "Honestly not sure, gut feeling\." with his meter on Confident/);
		assert.equal(saves.length, 0);
		assert.equal(await save("dim ker A = 2, since rank A = 2 and A has 4 columns. Honestly not sure, gut feeling."), null);
		assert.equal(saves.length, 1);
	});
});
