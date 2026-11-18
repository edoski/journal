/**
 * Home's "Studied today" names only sessions he studied in (round 10, 1 m2,
 * shot 70): opening Problem sheet 4 and asking the tutor a plan question
 * were listed as study, "Studied today: My exam plan has no room for
 * Poisson distribution, Geometric…, Eigenvalues and eigenvectors, Problem
 * sheet 4".
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ChatListItem } from "../src/core/index.ts";
import { newUserMessage, studiedIn, type LhMessage } from "../src/core/native-messages.ts";
import { doneToday } from "../components/study-home/day-record.ts";

let n = 0;
const id = () => `m${++n}`;
const USAGE = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
const said = (text: string): LhMessage => ({ id: id(), role: "assistant", content: [{ type: "text", text }], api: "anthropic-messages", provider: "anthropic", model: "claude", usage: USAGE, stopReason: "stop", timestamp: 0 }) as LhMessage;
const call = (callId: string, name: string, args: unknown): LhMessage => ({ id: id(), role: "assistant", content: [{ type: "toolCall", id: callId, name, arguments: args }], api: "anthropic-messages", provider: "anthropic", model: "claude", usage: USAGE, stopReason: "toolUse", timestamp: 0 }) as LhMessage;
const result = (callId: string, toolName: string, details: unknown): LhMessage => ({ id: id(), role: "toolResult", toolCallId: callId, toolName, content: [{ type: "text", text: "{}" }], details, isError: false, timestamp: 0 }) as LhMessage;

/** "Continue Problem sheet 4" and the tutor's first question, unanswered. */
const opened = [newUserMessage("Continue Problem sheet 4"), call("q1", "explain", { question: "Show that dim ker A = 2.", correctAnswer: "rank-nullity" })];
/** A plan question asked of the tutor, and its reply. */
const planQuestion = [newUserMessage("My exam plan has no room for Poisson distribution, Geometric distribution and Expectation. Why?"), said("Your plan fills every day before the exam…")];

describe("a session he studied in (studiedIn)", () => {
	it("is not one holding only its opening and the tutor's reply or question", () => {
		assert.equal(studiedIn(opened), false);
		assert.equal(studiedIn(planQuestion), false);
		assert.equal(studiedIn([]), false);
	});

	it("is one where he answered a question, or wrote after its opening", () => {
		const answered = [...opened, result("q1", "explain", { kind: "explain", text: "By rank-nullity, 5 - 3 = 2", confidence: "confident" })];
		assert.equal(studiedIn(answered), true);
		assert.equal(studiedIn([...planQuestion, newUserMessage("So should I start Poisson today?")]), true);
		const hint = [...opened, result("q1", "explain", { kind: "explain", hintRequested: true })];
		assert.equal(studiedIn(hint), false, "a Hint press is no answer");
	});
});

function chat(over: Partial<ChatListItem>): ChatListItem {
	return { id: "c", title: "Lesson", createdAt: "2026-11-17T08:00:00", updatedAt: "2026-11-17T09:00:00", kind: "teach", messageCount: 4, phase: "teach", pendingQuestion: false, pendingProblem: false, ended: "closed", busy: false, studied: true, ...over } as ChatListItem;
}

describe("Studied today (round 10, 1 m2)", () => {
	it("names the lesson he worked in, never a plan question or a session he only opened", () => {
		const chats = [
			chat({ id: "plan", title: "My exam plan has no room for Poisson distribution, Geometric…", messageCount: 2, studied: false, updatedAt: "2026-11-17T08:30:00" }),
			chat({ id: "eigen", title: "Eigenvalues and eigenvectors", ended: "left", updatedAt: "2026-11-17T09:30:00" }),
			chat({ id: "sheet4", title: "Problem sheet 4", pendingQuestion: true, messageCount: 2, studied: false, updatedAt: "2026-11-17T10:00:00" }),
		];
		assert.deepEqual(doneToday(chats, new Date("2026-11-17T11:00:00")), ["Eigenvalues and eigenvectors"]);
	});
});
