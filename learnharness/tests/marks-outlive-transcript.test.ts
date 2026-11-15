/**
 * Round 8 (4 #2): an answer saved just before a restart keeps its mark.
 * The tutor's save reached the engine (o34) but the server died before the
 * save reached the transcript, so nothing linked the answer to its attempt
 * and the card showed no mark in either window, even after a reload. The
 * save's links are now kept with the lesson the moment the engine takes
 * them (`ChatRecord.answerSaves`): the marks read them beside the
 * transcript, and the resumed turn knows the answer is already saved.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AssistantMessage, ToolResultMessage, UserMessage } from "@earendil-works/pi-ai";

import { markLinks } from "../src/core/answer-marks.ts";
import { answeredQuestionsOf, recordedBySaves, HIS_MESSAGE, type LhMessage } from "../src/core/native-messages.ts";
import { courseTools, type CourseToolContext } from "../src/agent/tools/course.ts";

const STAMPS = {
	api: "faux",
	provider: "test",
	model: "test-model",
	usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
	stopReason: "toolUse",
} as const;

function asked(id: string, question: string): LhMessage[] {
	const assistant: LhMessage & AssistantMessage = { id: `a_${id}`, role: "assistant", content: [{ type: "toolCall", id, name: "explain", arguments: { type: "check", nodeId: "n", question, correctAnswer: "(1, −2)" } as never }], timestamp: 1, ...STAMPS };
	const answer: LhMessage & ToolResultMessage = {
		id: `r_${id}`,
		role: "toolResult",
		toolCallId: id,
		toolName: "explain",
		content: [{ type: "text", text: "{}" }],
		details: { kind: "explain", tool: "explain", questionText: question, answers: [], text: "v = (1, 2)", confidence: "guess", answeredAt: "" } as never,
		isError: false,
		timestamp: 2,
	};
	return [assistant, answer];
}

const said = (id: string, text: string): LhMessage => ({ id, role: "user", content: [{ type: "text", text }], timestamp: 3 }) as LhMessage & UserMessage;

describe("a save the transcript never got", () => {
	it("the lesson's kept links mark the answer (the transcript holds no course_save for it)", () => {
		const messages = asked("q34", "An eigenvector for λ = 4?");
		assert.deepEqual(markLinks(messages), {});
		assert.deepEqual(markLinks(messages, { q34: ["o34"] }), { q34: ["o34"] });
	});

	it("a kept link to an answer the lesson does not hold marks nothing", () => {
		assert.deepEqual(markLinks(asked("q1", "Rank?"), { elsewhere: ["o9"] }), {});
	});

	it("the links keep the transcript's order of answers", () => {
		const messages = [...asked("q1", "First?"), ...asked("q2", "Second?")];
		assert.deepEqual(Object.keys(markLinks(messages, { q2: ["o2"], q1: ["o1"] })), ["q1", "q2"]);
	});

	it("the course tool hands the engine's ids to the lesson as soon as the save went through", async () => {
		const messages = [...asked("q34", "An eigenvector for λ = 4?"), said("u1", "and this one")];
		const kept: { question: string; observation: string }[][] = [];
		const ctx: CourseToolContext = {
			course: { workspace: "/study/la", title: "Linear Algebra" },
			records: { run: async () => ({ ok: true, json: { observations: ["o34", "o35"], saved: ["o34", "o35"], notes: [] } }) } as unknown as CourseToolContext["records"],
			arcs: false,
			answers: answeredQuestionsOf(messages),
			onSaved: (links) => kept.push(links),
		};
		const attempt = (question: string) => ({ topics: ["eigen"], text: "q", response: "a", help: "none", result: "partial", question });
		await courseTools(ctx).course_save!.execute("t1", { changes: { observations: [attempt("q34"), attempt(HIS_MESSAGE)] } } as never);
		assert.deepEqual(kept, [[{ question: "q34", observation: "o34" }, { question: HIS_MESSAGE, observation: "o35" }]]);
	});

	it("the resumed turn reads the kept answer as saved, so the tutor cannot save it twice", async () => {
		const messages = asked("q34", "An eigenvector for λ = 4?");
		const answers = recordedBySaves(answeredQuestionsOf(messages), { q34: ["o34"] }, null);
		assert.equal(answers.get("q34")?.recorded, true);
		const ctx: CourseToolContext = {
			course: { workspace: "/study/la", title: "Linear Algebra" },
			records: { run: async () => ({ ok: true, json: { saved: ["o99"] } }) } as unknown as CourseToolContext["records"],
			arcs: false,
			answers,
		};
		await assert.rejects(
			courseTools(ctx).course_save!.execute("t2", { changes: { observations: [{ topics: ["eigen"], text: "q", response: "a", help: "none", result: "partial", question: "q34" }] } } as never),
			/already saved/,
		);
	});

	it("his message's kept link counts it as saved", () => {
		const messages = [said("u7", "the kernel is span (1, -1)")];
		const answers = recordedBySaves(answeredQuestionsOf(messages), { u7: ["o12"] }, "u7");
		assert.equal(answers.get(HIS_MESSAGE)?.recorded, true);
	});
});
