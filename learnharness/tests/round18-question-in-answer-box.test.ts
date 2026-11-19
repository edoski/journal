/**
 * A question typed into the answer box is no answer (fix round 18, found
 * live by its integrator). Under "What is h(5,1), and why?" he typed "wait,
 * what does homomorphism mean exactly?" and sent it from the answer box.
 * The tutor answered it, kept no attempt, and asked the same question
 * again; but the app had taken his question as an answer that revealed the
 * question's solution, so his real answer to the re-ask, saved as his own,
 * was rewritten "Its solution was shown just before this answer": helped,
 * which could move a start he had been told. Only an answer the record
 * keeps as an attempt shows its question's solution.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AssistantMessage, ToolResultMessage } from "@earendil-works/pi-ai";

import { answeredQuestionsOf, type LhMessage } from "../src/core/native-messages.ts";
import { SHOWN_HELP } from "../src/core/shown-help.ts";
import { courseTools, type CourseToolContext } from "../src/agent/tools/course.ts";

const STAMPS = {
	api: "faux",
	provider: "test",
	model: "test-model",
	usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
	stopReason: "toolUse",
} as const;

const QUESTION = "A homomorphism $h:\\mathbb{R}^2\\to\\mathbb{R}^3$ satisfies $h(1,1) = (1,0,2)$ and $h(1,-1) = (3,2,0)$. What is $h(5,1)$, and why?";

let n = 0;
function call(name: string, args: Record<string, unknown>, details: unknown = null): { id: string; messages: LhMessage[] } {
	n += 1;
	const id = `call_${n}`;
	const assistant: LhMessage & AssistantMessage = { id: `msg_a${n}`, role: "assistant", content: [{ type: "toolCall", id, name, arguments: args as never }], timestamp: n, ...STAMPS };
	const result: LhMessage & ToolResultMessage = { id: `msg_r${n}`, role: "toolResult", toolCallId: id, toolName: name, content: [{ type: "text", text: "ok" }], details: details as never, isError: false, timestamp: n };
	return { id, messages: [assistant, result] };
}

/** The review question asked, and what he sent from its answer box. */
const asked = (text: string) => call("recall", { question: QUESTION, correctAnswer: "$(9,4,6)$" }, { kind: "explain", tool: "recall", questionText: QUESTION, answers: [], text, answeredAt: "" });
const saved = (question: string) => call("course_save", { changes: { observations: [{ kind: "attempt", topics: ["homomorphism"], question, text: "t", response: "r", help: "none", result: "incorrect" }] } }).messages;

function savingCourse(messages: LhMessage[]) {
	const saves: { observations?: Record<string, unknown>[] }[] = [];
	const ctx: CourseToolContext = {
		course: { workspace: "/study/la", title: "Linear Algebra" },
		records: {
			run: async (_w, verb) => {
				if (verb.verb === "save") saves.push(verb.changes as never);
				return { ok: true, json: { observations: ["o41"], notes: [] } };
			},
		} as CourseToolContext["records"],
		arcs: false,
		answers: answeredQuestionsOf(messages),
	};
	return { saves, tools: courseTools(ctx) };
}

describe("a question he typed into the answer box", () => {
	it("shows the question's solution to nobody: the same question asked again is his own to answer", () => {
		const question = asked("wait, what does homomorphism mean exactly?");
		const again = asked("(5,1) = 3(1,1) + 2(1,-1), so h(5,1) = (9,4,6)");
		assert.equal(answeredQuestionsOf([...question.messages, ...again.messages]).get(again.id)?.seenBefore, false);
	});

	it("leaves his answer to the question asked again saved as his own, never as solution shown", async () => {
		const question = asked("wait, what does homomorphism mean exactly?");
		const again = asked("(5,1) = 3(1,1) + 2(1,-1), so h(5,1) = (9,4,6)");
		const { saves, tools } = savingCourse([...question.messages, ...again.messages]);
		await tools.course_save!.execute("t1", { changes: { observations: [{ kind: "attempt", topics: ["homomorphism"], question: again.id, text: "Found $h(5,1)$", response: "(9,4,6)", help: "none", result: "correct" }] } } as never);
		assert.notEqual(saves[0]!.observations![0]!.help, SHOWN_HELP);
		assert.equal(saves[0]!.observations![0]!.help, "none");
		assert.equal(saves[0]!.observations![0]!.shown, undefined);
	});

	it("an answer the record kept as his attempt still shows its solution to the same question asked again", () => {
		const first = asked("(9,4,7)");
		const again = asked("(9,4,6)");
		assert.equal(answeredQuestionsOf([...first.messages, ...saved(first.id), ...again.messages]).get(again.id)?.seenBefore, true);
	});
});
