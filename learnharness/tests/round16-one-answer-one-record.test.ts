/**
 * Round 16, M2 (4 major 1): in the seeded Rank practice his only message
 * on the problem was a working note ("…I want to say rank 3, but row 3
 * looks like row 1 + row 2?"). He pressed Hint, then answered right at
 * Guessing. The tutor's conclude sent a `firstTry` whose response was that
 * final answer, right and unaided, and the record took two observations
 * for one message: o42 (right, on his own) and o43 (right, with help). The
 * marks read "First try · Right · On your own · Guessing / Then · Right ·
 * With help · Guessing".
 *
 * A first try is his first answer that did not solve the problem: a right
 * one would have solved it. And it is an answer of his the app holds
 * before the final one, never the tutor's claim alone.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { newPracticeRequestMessage, newThinkingMessage, newUserMessage, type LhMessage } from "../src/core/native-messages.ts";
import { concludeInputObject, concludeTool, createPracticeGate } from "../src/agent/tools/practice.ts";
import { practiceObservations, RUNG_HELP } from "../src/core/practice-attempts.ts";
import type { CourseToolContext } from "../src/agent/tools/course.ts";

const POSE = "toolu_rank_problem";
const statement = "Let $A$ be the $3 \\times 5$ matrix … **(a)** Find $\\operatorname{rank} A$ … **(b)** … $\\dim \\ker A$.";
const pose = { id: "a_pose", role: "assistant", content: [{ type: "toolCall", id: POSE, name: "problem", arguments: { statement, mode: "recall", topics: ["rank"], modelSolution: "rank 2, dim ker 3" } }], stopReason: "toolUse", timestamp: 1 } as unknown as LhMessage;
const posed = { id: "r_pose", role: "toolResult", toolCallId: POSE, toolName: "problem", content: [{ type: "text", text: "Problem posed" }], isError: false, timestamp: 2 } as unknown as LhMessage;
const reply = (id: string, text: string) => ({ id, role: "assistant", content: [{ type: "text", text }], stopReason: "stop", timestamp: 3 }) as unknown as LhMessage;
const note = newThinkingMessage(POSE, "Every row has nonzero entries so I want to say rank 3, but row 3 looks like row 1 + row 2?", "guessing") as LhMessage;
const hint = newPracticeRequestMessage(POSE, "hint") as LhMessage;
const answer = newThinkingMessage(POSE, "R3 - R1 - R2 = 0, rank A = 2, pivot columns 1 and 3. (b) dim ker A = 5 - 2 = 3", "guessing") as LhMessage;

const final = { result: "correct" as const, response: "rank $A = 2$, pivot columns 1 and 3, $\\dim\\ker A = 3$" };
const conclusion = {
	outcome: "solvedWithHints" as const,
	verdict: "Right: rank 2, pivots in columns 1 and 3, and nullity 3.",
	rung: "R1" as const,
	missClass: null,
	retest: false,
	...final,
};

async function concluded(messages: LhMessage[], input: Record<string, unknown>): Promise<Record<string, unknown>[]> {
	const written: { observations: Record<string, unknown>[] }[] = [];
	const course: CourseToolContext = {
		course: { workspace: "/la", title: "Linear Algebra" },
		records: { run: async (_w: string, verb: { changes?: unknown }) => { written.push(verb.changes as never); return { ok: true, json: { saved: ["o42"] } }; } } as unknown as CourseToolContext["records"],
		arcs: false,
	};
	const store = { chatId: "c", chatStore: { getChat: () => ({ messages }) } };
	const tool = concludeTool(createPracticeGate(store), { ctx: store, course });
	const result = await tool.execute("c_rank", input as never);
	assert.ok(!(result.details as { invalid?: unknown } | null)?.invalid, JSON.stringify(result.content));
	assert.equal(written.length, 1, "one save");
	return written[0]!.observations;
}

describe("one answer is saved once, with no first try it never had (round 16, M2)", () => {
	it("a right first try after a working note and a hint is dropped: one observation, right with help, at Guessing", async () => {
		const messages = [newUserMessage("Practice rank") as LhMessage, pose, posed, note, reply("a_nudge", "What does $R_3 - R_1 - R_2$ give you?"), hint, reply("a_hint", "Compare row 3 with the sum, column by column."), answer];
		const observations = await concluded(messages, { ...conclusion, firstTry: { ...final, sure: "guessing" } });
		assert.equal(observations.length, 1, JSON.stringify(observations));
		assert.equal(observations[0]!.result, "correct");
		assert.equal(observations[0]!.help, RUNG_HELP.R1);
		assert.equal(observations[0]!.sure, "guess");
	});

	it("a first try on a problem whose only answer is the final one is dropped", async () => {
		const messages = [newUserMessage("Practice rank") as LhMessage, pose, posed, hint, reply("a_hint", "Compare row 3 with the sum."), answer];
		const observations = await concluded(messages, { ...conclusion, firstTry: { result: "incorrect", response: "rank 3", sure: "guessing" } });
		assert.equal(observations.length, 1, JSON.stringify(observations));
		assert.equal(observations[0]!.help, RUNG_HELP.R1);
	});

	it("a real first try that missed, then a fix after the hint, keeps both rows", async () => {
		const wrong = newThinkingMessage(POSE, "rank 3, every row is nonzero", "confident") as LhMessage;
		const messages = [newUserMessage("Practice rank") as LhMessage, pose, posed, wrong, hint, reply("a_hint", "Compare row 3 with the sum."), answer];
		const observations = await concluded(messages, { ...conclusion, firstTry: { result: "incorrect", response: "rank 3", sure: "confident" } });
		assert.deepEqual(observations.map((o) => [o.result, o.help]), [["incorrect", "none"], ["correct", RUNG_HELP.R1]]);
	});

	it("the pure rule: a right first try never stands beside the final answer", () => {
		const rows = practiceObservations({ statement, topics: ["rank"] }, { ...conclusion, firstTry: { ...final, sure: "guessing" } }, "guessing");
		assert.equal(rows.length, 1);
	});

	it("the tool's contract: a first try is partial or incorrect", () => {
		const first = (concludeInputObject.properties.firstTry as unknown as { properties: { result: { anyOf: { const: string }[] } } }).properties.result;
		assert.deepEqual(first.anyOf.map((o) => o.const), ["partial", "incorrect"]);
	});
});
