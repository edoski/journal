/**
 * Round 15, M1 (1 D1): finished lessons came back as "Continue … lesson".
 *
 * The Eigen (8 Nov) and Linear maps (10 Nov) lessons ended "That finishes
 * the … lesson", then the tutor's choice "Stop here for today", which the
 * app sends as his Done for today. Each lesson's own save had already
 * removed its task (`eigen-lesson: null`, `linear-maps-lesson: null`), so
 * the engine held them as done. Yet the record's fold read the session as
 * left: the Eigen plan still named the next topic's step, and the answer
 * to the stop choice read as a reply the tutor owed. So from the next day
 * Home, the sidebar, the course page's Needs you and the topic page offered
 * to continue a lesson that was over. The records are lens 1's, cut to the
 * calls the fold reads.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sessionEndOf } from "../src/core/session-end.ts";
import { inputAppends } from "../src/core/input-events.ts";
import { newUserMessage, type LhMessage } from "../src/core/native-messages.ts";
import { sessionState } from "../components/nav/session-state.ts";
import type { ChatListItem } from "../src/core/index.ts";

const USAGE = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
let n = 0;
const assistant = (content: unknown[], stopReason: "stop" | "toolUse" = "toolUse") =>
	({ id: `a${++n}`, role: "assistant", content, api: "faux", provider: "test", model: "test", usage: USAGE, stopReason, timestamp: n }) as unknown as LhMessage;
const result = (toolCallId: string, toolName: string, details: unknown = {}) =>
	({ id: `r${++n}`, role: "toolResult", toolCallId, toolName, content: [{ type: "text", text: "ok" }], details, isError: false, timestamp: n }) as unknown as LhMessage;
const call = (id: string, name: string, args: unknown) => ({ type: "toolCall", id, name, arguments: args });
const save = (id: string, changes: unknown): LhMessage[] => [assistant([call(id, "course_save", { changes })]), result(id, "course_save", { ok: true })];

const TREE = {
	nodes: [
		{ id: "compute", title: "Eigenvalues of a 2 × 2 matrix" },
		{ id: "eigenspace", title: "Eigenvectors for each eigenvalue" },
		{ id: "eigenbasis", title: "What an eigenbasis does to the matrix" },
	],
	edges: [{ from: "compute", to: "eigenspace" }, { from: "eigenspace", to: "eigenbasis" }],
	version: 1,
};

/** A lesson through its plan's first two steps (the third, the next topic's, untaught), its task saved by
 *  `title` and then removed when `closed`, ending on the tutor's "What next?" with its stop option, which he picks. */
function finished({ closed, through = ["compute", "eigenspace"] }: { closed: boolean; through?: string[] }): LhMessage[] {
	const record: LhMessage[] = [
		newUserMessage("Eigenvalues, please."),
		assistant([call("pd", "probe_done", { strands: [{ strand: "eigen", assessment: "new" }], summary: "ready" })]),
		result("pd", "probe_done", { ok: true }),
		assistant([call("plan", "plan_init", { mermaid: "graph TD" })]),
		result("plan", "plan_init", { ok: true }),
		...save("s1", { tasks: { "eigen-lesson": { title: "Eigenvalues and eigenvectors lesson", topics: ["eigen"], step: "Answer the open eigenvector question" } }, focus: "eigen-lesson" }),
		assistant([call("q", "explain", { type: "check", nodeId: "compute", question: "Eigenvalues of C?", correctAnswer: "5 and -1" })]),
		result("q", "explain", { kind: "explain", text: "5 and -1", confidence: "confident" }),
		assistant([call("lp", "lesson_progress", { done: through })]),
		result("lp", "lesson_progress", { ok: true }),
		...(closed ? save("s2", { tasks: { "eigen-lesson": null }, focus: "sheet-4" }) : []),
		assistant([
			call("ask", "ask_user_question", {
				question: "That finishes the Eigenvalues and eigenvectors lesson. What next?",
				options: [{ label: "Practice problems on eigenvalues" }, { label: "Stop here for today", stops: true }],
			}),
		]),
	];
	// His pick of "Stop here for today", as the app records it: the answer, then his Done for today.
	const picked = inputAppends({ messages: record }, { type: "answer", toolCallId: "ask", answer: { kind: "ask", answers: [{ index: 2, label: "Stop here for today", value: "Stop here for today" }] } } as never);
	assert.ok(picked.some((m) => m.role === "custom" && m.customType === "done-tonight"), "the stop pick is his Done for today");
	// The tutor's close: its progress call with `close`, then its closing words.
	return [
		...record,
		...picked,
		assistant([call("close", "lesson_progress", { done: [], close: true })]),
		result("close", "lesson_progress", { ok: true }),
		assistant([call("send", "send_to_user", { message: "Your Eigenvalues and eigenvectors review is tomorrow, Monday 9 November." })]),
		result("send", "send_to_user", { ok: true }),
	];
}

const chat = (record: LhMessage[]): ChatListItem =>
	({ id: "c", title: "Eigenvalues and eigenvectors", createdAt: "", updatedAt: "", kind: "teach", messageCount: record.length, phase: "teach", pendingQuestion: false, pendingProblem: false, busy: false, ended: sessionEndOf(record, TREE) }) as ChatListItem;

describe("a lesson whose own save closed its task, ended with the tutor's Stop here for today (round 15, M1)", () => {
	it("is finished, not left, though its plan names the next topic's step (the Eigen lesson, 8 Nov)", () => {
		const record = finished({ closed: true });
		assert.equal(sessionEndOf(record, TREE), "closed");
		assert.equal(sessionState(chat(record)), "finished");
	});

	it("is finished with every step taught (the Linear maps lesson, 10 Nov)", () => {
		assert.equal(sessionEndOf(finished({ closed: true, through: ["compute", "eigenspace", "eigenbasis"] }), TREE), "closed");
	});

	it("ends with no task, its plan taught through, since the stop it picked owes him nothing", () => {
		const record = finished({ closed: false, through: ["compute", "eigenspace", "eigenbasis"] }).filter((m) => !(m.role === "assistant" && m.content.some((b) => b.type === "toolCall" && b.id === "s1")) && !(m.role === "toolResult" && m.toolCallId === "s1"));
		assert.equal(sessionEndOf(record, TREE), "closed");
	});
});

describe("a lesson still open when he picks Stop here for today stays left", () => {
	it("while it holds its task", () => {
		assert.equal(sessionEndOf(finished({ closed: false }), TREE), "left");
	});

	it("with no task, while its plan has a step to teach", () => {
		const record = finished({ closed: false }).filter((m) => !(m.role === "assistant" && m.content.some((b) => b.type === "toolCall" && b.id === "s1")) && !(m.role === "toolResult" && m.toolCallId === "s1"));
		assert.equal(sessionEndOf(record, TREE), "left");
	});
});
