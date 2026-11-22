/**
 * Round 19, M5 (1 N3): on 17 Nov, Home → Ask the tutor → "Yes", two review
 * answers (Binomial, Random variables), then Done for today with the
 * committee question open. The close said "Next you pick up your
 * Probability review at the binomial coefficients question", but the Ask
 * session was filed under no review, and Home's "Probability review" row
 * started a new session on another question. The Ask session that ran his
 * review is that review, by its topics and its name, and the review row
 * picks it up before it starts another.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lh-ask-review-"));
process.env.LH_DATA_DIR = path.join(scratch, "data");
process.env.LEARNING_TODAY = "2026-11-17";
const { chatStore } = await import("../src/store/chats.ts");
const { newUserMessage, newDoneTonightMessage } = await import("../src/core/native-messages.ts");
const { sessionState } = await import("../components/nav/session-state.ts");
const { courseMove } = await import("../components/study-home/study-facts.ts");
const { isReviewSession } = await import("../src/core/session-opening.ts");
const { topic } = await import("./fixtures/round8-home.ts");
after(() => {
	delete process.env.LEARNING_TODAY;
	fs.rmSync(scratch, { recursive: true, force: true });
});

const USAGE = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
let n = 0;
const at = () => Date.parse("2026-11-17T10:00:00Z") + ++n * 1000;
const assistant = (content: unknown[], stopReason: "stop" | "toolUse") => ({ id: `a${++n}`, role: "assistant", content, api: "faux", provider: "test", model: "test", usage: USAGE, stopReason, timestamp: at() });
const call = (name: string, args: unknown, result: unknown = { ok: true }) => {
	const id = `c${++n}`;
	const ask = assistant([{ type: "toolCall", id, name, arguments: args }], "toolUse");
	return [ask, { id: `r${n}`, role: "toolResult", toolCallId: id, toolName: name, content: [{ type: "text", text: "ok" }], details: result, isError: false, timestamp: ask.timestamp }];
};
const PROB = { workspace: "/s/prob", title: "Probability" };

/** The exam-eve Ask session as lens 1 left it. */
function askThatReviewed() {
	const created = chatStore.createChat("Fitting the exam's topics in", PROB, [], undefined, true);
	chatStore.saveMessages(created.id, [
		newUserMessage("Which of these topics can I still fit in before the exam?"),
		...call("send_to_user", { message: "Today is full with overdue reviews. Want to start today's reviews now?" }),
		assistant([], "stop"),
		newUserMessage("Yes"),
		...call("course_save", { changes: { observations: [{ topics: ["binomial"], text: "Found P(exactly 3 of 10)", result: "correct", help: "none", sure: "confident" }] } }),
		...call("course_save", { changes: { observations: [{ topics: ["random-variables"], text: "Took P(even) as 1/2; it is 1/3", result: "incorrect", help: "none", sure: "guess" }] } }),
		...call("recall", { question: "In how many ways can a committee of 3 be chosen from 8?", correctAnswer: "C(8,3) = 56.", topic: "binomial-coefficients" }, { kind: "explain", dismissed: true, reason: "tonight" }),
		newDoneTonightMessage("teacher"),
		...call("send_to_user", { message: "Next you pick up your Probability review at the binomial coefficients question." }),
		assistant([], "stop"),
	] as never);
	return { ...chatStore.listChats().find((c) => c.id === created.id)!, busy: false };
}

const COURSE = {
	map: {
		workspace: PROB.workspace,
		title: PROB.title,
		today: "2026-11-17",
		revision: 1,
		exam: null,
		current: "random-variables",
		focus: null,
		tasks: [],
		topics: [topic("binomial", "Binomial distribution"), topic("random-variables", "Random variables and distributions"), topic("binomial-coefficients", "Combinations and binomial coefficients"), topic("properties", "Properties of probability")],
		edges: [],
	},
	unready: null,
	due: [],
	newToday: [],
	lastActiveDaysAgo: 0,
} as never;

describe("an Ask session that ran his review is that review, and Home's review line picks it up (round 19, M5)", () => {
	const ask = askThatReviewed();

	it("is the review of the topics it answered, by its course's review name", () => {
		assert.equal(isReviewSession(ask), true);
		assert.equal(ask.title, "Probability review");
		assert.deepEqual([...(ask.ownTopics ?? [])].sort(), ["binomial", "random-variables"]);
		assert.equal(sessionState(ask), "left");
	});

	it("Home's review line, on the topics still due, opens it at its open question rather than a new session", () => {
		const step = { kind: "review" as const, titles: ["Combinations and binomial coefficients", "Properties of probability"], topics: ["binomial-coefficients", "properties"] as never, then: null };
		const move = courseMove(COURSE, [ask], step);
		assert.equal(move.kind, "open");
		assert.ok(move.kind === "open" && move.chat.id === ask.id, `it opens ${move.kind === "open" ? move.chat.id : "a new session"}`);
	});

	it("an Ask session that only answered his question is no review", () => {
		const created = chatStore.createChat("What is a sample space?", PROB, [], undefined, true);
		chatStore.saveMessages(created.id, [newUserMessage("What is a sample space?"), ...call("send_to_user", { message: "The set of every outcome." }), assistant([], "stop")] as never);
		const plain = chatStore.listChats().find((c) => c.id === created.id)!;
		assert.equal(isReviewSession(plain), false);
		assert.equal(plain.title, "What is a sample space?");
	});
});
