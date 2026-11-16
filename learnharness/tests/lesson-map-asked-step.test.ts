/**
 * The lesson map's "Your turn" is the step his open question asks about
 * (round 14, m40, lens 3's aspect 11): Invertible's map said "Your turn on
 * Undoing and the image" with Next on One-to-one against onto, while the
 * open question (F: do any two inputs collide) was about the kernel step,
 * done earlier in the lesson. The strip keeps its forward-only position (a
 * check back on a done step moves nothing there, round 12, 2 n6); the map
 * rings the asked step while the lesson waits on him, and the tutor tags a
 * question with the step whose idea it asks about.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { ChatRecord } from "../src/core/contracts/chat.ts";
import { sessionPlanOf } from "../src/server/topic.ts";
import { stepMarks, ringedStep } from "../components/unit-inbox/topic-page/steps/steps-facts.ts";

const call = (name: string, args: Record<string, unknown>, id: string) => ({ role: "assistant", content: [{ type: "toolCall", id, name, arguments: args }] });

/** Lens 3's Invertible lesson up to question F, as its tutor should have tagged F: on the kernel step it asks about. */
const RECORD = {
	id: "chat_inv",
	tree: {
		nodes: [
			{ id: "undo", title: "What undoing a map asks for" },
			{ id: "collisions", title: "Undoing and the kernel" },
			{ id: "reach", title: "Undoing and the image" },
			{ id: "square-case", title: "One-to-one against onto for square matrices" },
		],
		edges: [
			{ from: "undo", to: "collisions" },
			{ from: "undo", to: "reach" },
			{ from: "collisions", to: "square-case" },
			{ from: "reach", to: "square-case" },
		],
	},
	messages: [
		call("explain", { nodeId: "undo", type: "check", question: "Could any map G make D(G(b)) equal b?" }, "t1"),
		call("lesson_progress", { done: ["undo"] }, "t2"),
		call("explain", { nodeId: "collisions", type: "check", question: "What can you say about x - x'?" }, "t3"),
		call("lesson_progress", { done: ["collisions"] }, "t4"),
		call("explain", { nodeId: "reach", type: "check", question: "Which of the two demands does E fail?" }, "t5"),
		call("explain", { nodeId: "collisions", type: "check", question: "Do any two inputs collide under F, and why?" }, "t6"),
	],
} as unknown as ChatRecord;

describe("the lesson map's Your turn (m40)", () => {
	const plan = sessionPlanOf(RECORD)!;

	it("keeps the strip's position on the step being taught, and knows the step the open question asks about", () => {
		assert.equal(plan.current, "reach", "a check back on a done step moves nothing on the strip");
		assert.equal(plan.asked, "collisions");
	});

	it("rings the asked step while the lesson waits on him", () => {
		assert.equal(ringedStep(plan, true), "collisions");
		const marks = stepMarks(plan, true);
		assert.deepEqual(marks.get("collisions"), { status: "current", tag: null });
		assert.equal(marks.get("reach")?.status, "visited", "the step being taught was asked about too");
	});

	it("rings where the lesson stands once he has answered and nothing waits", () => {
		assert.equal(ringedStep(plan, false), "reach");
		assert.equal(stepMarks(plan, false).get("reach")?.status, "current");
	});

	it("tells the tutor to tag a question with the step it asks about, a done step included", () => {
		const prompt = readFileSync(join(import.meta.dirname, "..", "src", "agent", "prompts", "teacher", "10-planning.md"), "utf8");
		assert.match(prompt, /names the step whose idea the question asks him to use, a step already done included/);
		assert.match(prompt, /never the step you are teaching when the question is about another/);
	});
});
