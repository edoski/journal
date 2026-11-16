import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { conclusionProblem, practiceObservations, type PracticeConclusion } from "../src/core/practice-attempts.ts";

const POSE = { statement: "Is $x \\mapsto 2x$ linear?", topics: ["linearity"] };
const base: PracticeConclusion = { outcome: "solved", rung: null, result: "correct", response: "Yes, additive and homogeneous" };

describe("a concluded practice problem as engine observations", () => {
	it("solved without hints is one unaided attempt", () => {
		assert.deepEqual(practiceObservations(POSE, base, undefined), [
			{ topics: ["linearity"], text: POSE.statement, response: "Yes, additive and homogeneous", help: "none", result: "correct" },
		]);
	});

	it("a hinted success records the hint in words, after his first unaided try", () => {
		const observations = practiceObservations(
			POSE,
			{ ...base, outcome: "solvedWithHints", rung: "R3", firstTry: { result: "incorrect", response: "No", sure: "confident" } },
			"neutral",
		);
		assert.deepEqual(observations.map((o) => [o.help, o.result, o.response, o.sure]), [
			["none", "incorrect", "No", "confident"],
			["Hint R3: named the idea to use", "correct", "Yes, additive and homogeneous", undefined],
		]);
	});

	it("the first try's confidence is the one he gave that claim, not his first working note", () => {
		const [first] = practiceObservations(
			POSE,
			{ ...base, outcome: "solvedWithHints", rung: "R1", firstTry: { result: "incorrect", response: "10! = 3628800", sure: "confident" } },
			"neutral",
		);
		assert.equal(first!.sure, "confident");
		const [unmarked] = practiceObservations(
			POSE,
			{ ...base, outcome: "solvedWithHints", rung: "R1", firstTry: { result: "incorrect", response: "No", sure: null } },
			"neutral",
		);
		assert.equal("sure" in unmarked!, false);
	});

	it("a first try equal to the final unaided result adds nothing", () => {
		assert.equal(practiceObservations(POSE, { ...base, firstTry: { result: "correct", response: "Yes", sure: "neutral" } }, undefined).length, 1);
	});

	it("a wrongly chosen method rides on the attempt", () => {
		const [o] = practiceObservations(POSE, { ...base, outcome: "surrendered", result: "incorrect", chose: "affinity" }, undefined);
		assert.equal(o!.chose, "affinity");
	});

	it("a wrong method fixed after a nudge is recorded on the first try", () => {
		const fixed: PracticeConclusion = {
			...base,
			outcome: "solvedWithHints",
			rung: "R2",
			firstTry: { result: "incorrect", response: "used affinity", sure: "neutral", chose: "affinity" },
		};
		assert.equal(conclusionProblem(fixed, POSE.topics), null);
		const [first, final] = practiceObservations(POSE, fixed, "neutral");
		assert.equal(first!.chose, "affinity");
		assert.equal("chose" in final!, false);
	});

	it("one answer is one observation with one result, a part right beside a part wrong saved partial (round 14, M2)", () => {
		const pose = { statement: "(a) hypergeometric, (b) binomial", topics: ["hypergeometric", "binomial"] };
		const mixed: PracticeConclusion = { outcome: "movedOn", rung: null, result: "partial", response: "(a) 0.5, (b) 0.2" };
		assert.equal(conclusionProblem(mixed, pose.topics), null);
		assert.deepEqual(practiceObservations(pose, mixed, "confident").map((o) => [o.topics, o.result]), [[["hypergeometric", "binomial"], "partial"]]);
		const nudged: PracticeConclusion = { ...mixed, outcome: "solvedWithHints", rung: "R1", result: "correct", firstTry: { result: "partial", response: "(a) 0.5, (b) 0.2", sure: "confident" } };
		assert.deepEqual(practiceObservations(pose, nudged, "neutral").map((o) => [o.topics, o.result, o.help]), [
			[["hypergeometric", "binomial"], "partial", "none"],
			[["hypergeometric", "binomial"], "correct", "Hint R1: re-described the pattern class"],
		]);
	});

	it("the recorded double save: a first try that broke at rank is one observation on rank, never a second on kernel (round 14, M2)", () => {
		const pose = { statement: "For which t is rank A = 2?", topics: ["rank", "kernel"] };
		const recorded = {
			outcome: "solvedWithHints", rung: "R2", result: "correct", response: "t = 5",
			firstTry: { result: "incorrect", response: "t = 4", sure: "confident", brokeAt: "rank", byTopic: { kernel: "correct" } },
		} as unknown as PracticeConclusion;
		assert.match(conclusionProblem(recorded, pose.topics)!, /^firstTry\.byTopic gives one answer a second result/);
		const { firstTry, ...rest } = recorded;
		const { byTopic: _second, ...first } = firstTry as unknown as Record<string, unknown>;
		const fixed = { ...rest, firstTry: first } as unknown as PracticeConclusion;
		assert.equal(conclusionProblem(fixed, pose.topics), null);
		const observations = practiceObservations(pose, fixed, "confident");
		assert.deepEqual(observations.map((o) => [o.topics, o.result, o.response]), [
			[["rank"], "incorrect", "t = 4"],
			[["rank", "kernel"], "correct", "t = 5"],
		]);
		assert.equal(new Set(observations.map((o) => o.response)).size, observations.length, "each response is saved once");
	});

	it("a wrong method rides on the observation, on the topic that should have been chosen", () => {
		const pose = { statement: "two parts", topics: ["hypergeometric", "binomial"] };
		const observations = practiceObservations(pose, { outcome: "movedOn", rung: null, result: "partial", response: "binomial for both", chose: "binomial" }, undefined);
		assert.deepEqual(observations.map((o) => [o.topics, o.chose, o.result]), [[["hypergeometric"], "binomial", "partial"]]);
	});

	it("a wrong method is charged to the topic that should have been chosen, not the method chosen", () => {
		const pose = { statement: "which model fits?", topics: ["hypergeometric", "binomial"] };
		const [o] = practiceObservations(pose, { outcome: "movedOn", rung: null, result: "incorrect", response: "binomial", chose: "binomial" }, undefined);
		assert.deepEqual([o!.topics, o!.chose], [["hypergeometric"], "binomial"]);
	});

	it("a given-up problem is marked given up, and the solution revealed after it is not help", () => {
		const [o] = practiceObservations(POSE, { ...base, outcome: "surrendered", result: "incorrect", response: "no idea" }, "guessing");
		assert.deepEqual([o!.help, o!.result, o!.gave_up, "shown" in o!], ["none", "incorrect", true, false]);
		const [nudged] = practiceObservations(POSE, { ...base, outcome: "surrendered", rung: "R1", result: "incorrect", response: "stuck" }, undefined);
		assert.deepEqual([nudged!.help, nudged!.gave_up], ["Hint R1: re-described the pattern class", true]);
	});

	it("an answer after the step was worked for him is marked shown; a lesser hint is not", () => {
		const [shown] = practiceObservations(POSE, { ...base, outcome: "solvedWithHints", rung: "R5" }, undefined);
		assert.deepEqual([shown!.help, shown!.shown], ["Hint R5: worked the step", true]);
		const [hinted] = practiceObservations(POSE, { ...base, outcome: "solvedWithHints", rung: "R4" }, undefined);
		assert.equal("shown" in hinted!, false);
		assert.equal("gave_up" in hinted!, false);
	});

	it("a problem he claimed no answer to records nothing", () => {
		assert.deepEqual(practiceObservations(POSE, { ...base, outcome: "movedOn", result: null, response: "asked to be taught instead" }, "neutral"), []);
		assert.equal(conclusionProblem({ ...base, outcome: "movedOn", result: null }, POSE.topics), null);
		assert.match(conclusionProblem({ ...base, outcome: "surrendered", result: null }, POSE.topics)!, /incorrect/);
		assert.match(conclusionProblem({ ...base, result: null }, POSE.topics)!, /correct or partial/);
	});

	it("refuses conclusions that contradict their outcome or the pose", () => {
		const topics = POSE.topics;
		assert.match(conclusionProblem({ ...base, outcome: "surrendered" }, topics)!, /incorrect/);
		assert.match(conclusionProblem({ ...base, result: "incorrect" }, topics)!, /correct or partial/);
		assert.match(conclusionProblem({ ...base, outcome: "solvedWithHints" }, topics)!, /rung/);
		assert.match(conclusionProblem({ ...base, rung: "R0" }, topics)!, /solvedWithHints/);
		assert.match(conclusionProblem({ ...base, chose: "affinity" }, topics)!, /not correct/);
		assert.match(
			conclusionProblem({ ...base, firstTry: { result: "correct", response: "Yes", sure: null, chose: "affinity" } }, topics)!,
			/^firstTry\.chose/,
		);
		assert.match(conclusionProblem({ ...base, byTopic: { linearity: "incorrect" } } as PracticeConclusion, topics)!, /^byTopic gives one answer a second result/);
		assert.equal(conclusionProblem({ ...base, result: "partial" }, topics), null, "a guessed right answer is partial");
		assert.equal(conclusionProblem({ ...base, outcome: "movedOn", result: "incorrect" }, topics), null);
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

	it("a pose whose topics arrived as a JSON string is still recorded under those topics", async () => {
		const stringPose = { ...pose, topics: '["independence","conditional"]' };
		const stringMessages = [{ ...messages[0], content: [{ type: "toolCall", id: "p1", name: "problem", arguments: stringPose }] }, messages[1]];
		const saves: unknown[] = [];
		const records = { list: async () => ({ available: true, courses: [], roots: [] }), run: async (_w: string, req: unknown) => (saves.push(req), { ok: true, json: {} }) };
		const tools = practiceTools({ chatId: "c", chatStore: { getChat: () => ({ messages: stringMessages }) } as never }, { course: { workspace: "/w", title: "T" }, records } as never);
		const result = await tools.conclude!.execute("c1", { ...conclusion, result: "partial" }, undefined);
		assert.notEqual(result.isError, true);
		assert.deepEqual(
			(saves[0] as { changes: { observations: { topics: string[]; result: string }[] } }).changes.observations.map((o) => [o.topics, o.result]),
			[[["independence", "conditional"], "partial"]],
		);
	});

	it("asking to be taught before any answer saves nothing and frees the problem", async () => {
		const saves: unknown[] = [];
		const records = { list: async () => ({ available: true, courses: [], roots: [] }), run: async (_w: string, req: unknown) => (saves.push(req), { ok: true, json: {} }) };
		const tools = practiceTools({ chatId: "c", chatStore }, { course: { workspace: "/w", title: "T" }, records } as never);
		const result = await tools.conclude!.execute("c1", { ...conclusion, outcome: "movedOn", result: null, response: "asked to be taught instead" }, undefined);
		assert.notEqual(result.isError, true);
		assert.deepEqual(saves, []);
		assert.match((result.content[0] as { text: string }).text, /No attempt recorded/);
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
