import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { conclusionProblem, practiceObservations, type PracticeConclusion } from "../src/core/practice-attempts.ts";

const POSE = { statement: "Is $x \\mapsto 2x$ linear?", topics: ["linearity"] };
const base: PracticeConclusion = { outcome: "solved", rung: null, result: "correct", response: "Yes, additive and homogeneous" };

describe("a concluded practice problem as engine observations", () => {
	it("solved without hints is one unaided attempt", () => {
		assert.deepEqual(practiceObservations(POSE, base, {}), [
			{ topics: ["linearity"], text: POSE.statement, response: "Yes, additive and homogeneous", help: "none", result: "correct" },
		]);
	});

	it("a hinted success records the hint in words, after his first unaided try", () => {
		const observations = practiceObservations(
			POSE,
			{ ...base, outcome: "solvedWithHints", rung: "R3", firstTry: { result: "incorrect", response: "No" } },
			{ first: "confident", last: "neutral" },
		);
		assert.deepEqual(observations.map((o) => [o.help, o.result, o.response]), [
			["none", "incorrect", "No"],
			["Hint R3: named the idea to use", "correct", "Yes, additive and homogeneous"],
		]);
	});

	it("a first try equal to the final unaided result adds nothing", () => {
		assert.equal(practiceObservations(POSE, { ...base, firstTry: { result: "correct", response: "Yes" } }, {}).length, 1);
	});

	it("a wrongly chosen method rides on the attempt", () => {
		const [o] = practiceObservations(POSE, { ...base, outcome: "surrendered", result: "incorrect", chose: "affinity" }, {});
		assert.equal(o!.chose, "affinity");
	});

	it("refuses conclusions that contradict their outcome", () => {
		assert.match(conclusionProblem({ ...base, outcome: "surrendered" })!, /incorrect/);
		assert.match(conclusionProblem({ ...base, result: "incorrect" })!, /correct or partial/);
		assert.match(conclusionProblem({ ...base, outcome: "solvedWithHints" })!, /rung/);
		assert.match(conclusionProblem({ ...base, rung: "R0" })!, /solvedWithHints/);
		assert.match(conclusionProblem({ ...base, chose: "affinity" })!, /not correct/);
		assert.equal(conclusionProblem({ ...base, result: "partial" }), null, "a guessed right answer is partial");
		assert.equal(conclusionProblem({ ...base, outcome: "movedOn", result: "incorrect" }), null);
	});
});

describe("conclude records the attempt, and never locks the session", async () => {
	const { practiceTools } = await import("../src/agent/tools/practice.ts");
	const pose = { statement: "Find the rank.", mode: "recall", topics: ["fresh-topic"], modelSolution: "1" };
	const messages = [
		{ id: "a1", role: "assistant", content: [{ type: "toolCall", id: "p1", name: "problem", arguments: pose }], stopReason: "toolUse", timestamp: 1 },
		{ id: "r1", role: "toolResult", toolCallId: "p1", toolName: "problem", content: [{ type: "text", text: "posed" }], isError: false, timestamp: 2 },
	];
	const chatStore = { getChat: () => ({ messages }) } as never;
	const conclusion = { outcome: "solved", verdict: "ok", rung: null, missClass: null, retest: false, result: "correct", response: "1" };

	it("a refused save still concludes, and hands the observations back for course_save", async () => {
		const records = { list: async () => ({ available: true, courses: [], roots: [] }), run: async () => ({ ok: false, kind: "validation", message: 'unknown topic "fresh-topic"' }) };
		const tools = practiceTools({ chatId: "c", chatStore }, { course: { workspace: "/w", title: "T" }, records } as never);
		const result = await tools.conclude!.execute("c1", conclusion, undefined);
		assert.notEqual(result.isError, true);
		const text = (result.content[0] as { text: string }).text;
		assert.match(text, /The attempt was not saved \(unknown topic "fresh-topic"\)\. Repair it with course_save/);
		assert.match(text, /"topics":\["fresh-topic"\]/);
		const next = await tools.problem!.execute("p2", pose, undefined);
		assert.notEqual(next.isError, true, "the problem slot is free again");
	});

	it("a conclusion that contradicts its outcome is refused and the problem stays active", async () => {
		const records = { list: async () => ({ available: true, courses: [], roots: [] }), run: async () => ({ ok: true, json: {} }) };
		const tools = practiceTools({ chatId: "c", chatStore }, { course: { workspace: "/w", title: "T" }, records } as never);
		const refused = await tools.conclude!.execute("c1", { ...conclusion, outcome: "surrendered" }, undefined);
		assert.equal(refused.isError, true);
	});
});
