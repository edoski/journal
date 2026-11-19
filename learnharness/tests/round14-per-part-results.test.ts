/**
 * Round 14 integration: O3's M2 fix ("one answer, one result") made a
 * multi-part answer with one wrong part "partly right" on every topic it
 * touches, which dropped round 8's per-part charging. A problem's labelled
 * parts split the answer again: each topic takes the result of the part
 * that tests it. M2's guard stays: one answer never gives a topic two
 * results, and a problem with no labelled parts ("t = 4") never splits.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { practiceTools } from "../src/agent/tools/practice.ts";
import { conclusionProblem, practiceObservations, type PracticeConclusion } from "../src/core/practice-attempts.ts";

const POSE = { statement: "Let $A$ be the 3×3 matrix above. (a) Find rank $A$. (b) Find a basis of $\\ker A$.", topics: ["rank", "kernel"] };
const split: PracticeConclusion = {
	outcome: "movedOn",
	rung: null,
	result: "partial",
	response: "(a) 2 (b) {(1,0,0)}",
	parts: [
		{ part: "(a)", topics: ["rank"], result: "correct" },
		{ part: "(b)", topics: ["kernel"], result: "incorrect" },
	],
};

describe("per-part results (round 14 integration)", () => {
	it("each topic takes the result of the part that tests it", () => {
		assert.equal(conclusionProblem(split, POSE.topics, POSE.statement), null);
		assert.deepEqual(
			practiceObservations(POSE, split, "confident").map((o) => [o.topics, o.result]),
			[
				[["rank"], "correct"],
				[["kernel"], "incorrect"],
			],
		);
	});

	it("a topic in two parts is refused: one answer, one result on each topic", () => {
		const twice: PracticeConclusion = { ...split, parts: [{ part: "(a)", topics: ["rank"], result: "correct" }, { part: "(b)", topics: ["rank", "kernel"], result: "incorrect" }] };
		assert.match(conclusionProblem(twice, POSE.topics, POSE.statement) ?? "", /gives rank a second result/);
	});

	it("a problem with no labelled parts never splits", () => {
		const statement = "For which t is rank A = 2?";
		const unlabelled: PracticeConclusion = { ...split, response: "t = 4", parts: [{ part: "(a)", topics: ["rank"], result: "incorrect" }, { part: "(b)", topics: ["kernel"], result: "correct" }] };
		assert.match(conclusionProblem(unlabelled, POSE.topics, statement) ?? "", /does not label/);
	});

	it("the whole answer's result follows its parts", () => {
		assert.match(conclusionProblem({ ...split, result: "correct" }, POSE.topics, POSE.statement) ?? "", /result is the whole answer's: partial/);
	});

	it("the conclude tool saves one observation per part result through the record", async () => {
		const pose = { ...POSE, mode: "recall", modelSolution: "(a) 2 (b) {(1,-1,1)}" };
		const messages = [
			{ id: "a1", role: "assistant", content: [{ type: "toolCall", id: "p1", name: "problem", arguments: pose }], stopReason: "toolUse", timestamp: 1 },
			{ id: "r1", role: "toolResult", toolCallId: "p1", toolName: "problem", content: [{ type: "text", text: "ok" }], isError: false, timestamp: 2 },
		];
		const saves: { observations: { topics: string[]; result: string }[] }[] = [];
		const records = { run: async (_w: string, req: { verb: string; changes?: unknown }) => (req.verb === "save" && saves.push(req.changes as never), { ok: true, json: { saved: (req.changes as { observations: unknown[] }).observations.map((_o, i) => `o${60 + i}`) } }) };
		const tools = practiceTools({ chatId: "c", chatStore: { getChat: () => ({ messages }) } as never }, { course: { workspace: "/w", title: "LA" }, records } as never);
		const result = await tools.conclude!.execute(
			"c1",
			{ outcome: "movedOn", verdict: "(a) is right; (b)'s vector is not in the kernel.", rung: null, missClass: "execution", retest: true, result: "partial", response: "(a) 2 (b) {(1,0,0)}", record: "Rank 2 right; gave $(1,0,0)$, which is not in the kernel", parts: split.parts } as never,
			undefined,
		);
		assert.notEqual(result.isError, true);
		assert.deepEqual(
			saves[0]!.observations.map((o) => [o.topics, o.result]),
			[
				[["rank"], "correct"],
				[["kernel"], "incorrect"],
			],
		);
	});
});
