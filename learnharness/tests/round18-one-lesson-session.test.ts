/**
 * Round 18, m5 (1 n3): on 17 Nov he asked the tutor from Home's exam
 * heading and said "Yes" to "Want to pick up your Expectation lesson where
 * it stopped?". The Ask session carried the lesson on (its saves wrote
 * `expectation-lesson`'s step), while the 10 Nov lesson's lottery question
 * stayed open: Expectation's page listed two "Expectation and linearity
 * lesson" sessions, and Earlier and Sessions named the Ask one "Fitting the
 * exam's topics in". One open session per lesson, one name per session.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lh-one-lesson-"));
process.env.LH_DATA_DIR = path.join(scratch, "data");
const { chatStore } = await import("../src/store/chats.ts");
const { newUserMessage, newDoneTonightMessage } = await import("../src/core/native-messages.ts");
const { nameAfterHeldTask } = await import("../src/server/session-naming.ts");
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

const USAGE = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
let n = 0;
const at = (iso: string) => Date.parse(iso);
const call = (time: number, name: string, args: unknown, result = "{}", details: unknown = {}) => {
	const id = `c${++n}`;
	return [
		{ id: `a${n}`, role: "assistant", content: [{ type: "toolCall", id, name, arguments: args }], api: "faux", provider: "test", model: "test", usage: USAGE, stopReason: "toolUse", timestamp: time },
		{ id: `r${n}`, role: "toolResult", toolCallId: id, toolName: name, content: [{ type: "text", text: result }], details, isError: false, timestamp: time },
	];
};
const said = (time: number, text: string) => ({ ...newUserMessage(text), timestamp: time });
const PROB = { workspace: "/s/prob", title: "Probability" };
/** A question he left with Done for today, and the close after it, as the lesson's last turn left it. */
const leftOn = (time: number, question: string, nodeId?: string) => [
	...call(time, "explain", { type: "check", ...(nodeId ? { nodeId } : {}), question, correctAnswer: "1" }, JSON.stringify({ kind: "explain", dismissed: true }), { dismissed: true, reason: "tonight" }),
	{ ...newDoneTonightMessage("teacher"), timestamp: time + 1 },
	...call(time + 1, "send_to_user", { message: "Your lesson continues tomorrow." }),
	{ id: `close${++n}`, role: "assistant", content: [], api: "faux", provider: "test", model: "test", usage: USAGE, stopReason: "stop", timestamp: time + 2 },
];
const listed = (id: string) => chatStore.listChats().find((c) => c.id === id)!;
const TITLE = "Expectation and linearity lesson";
const courseRecords = { map: async () => ({ ok: true as const, map: { topics: [{ handle: "expectation", title: "Expectation and linearity" }], tasks: [{ key: "expectation-lesson", title: TITLE }] } }) };

describe("a lesson carried on in a newer session (round 18, m5)", () => {
	// 10 Nov: the Expectation lesson, left with the lottery question open.
	const lesson = chatStore.createChat("Expectation and linearity lesson", PROB, ["expectation"]);
	const tenth = at("2026-11-10T10:00:00");
	chatStore.saveMessages(lesson.id, [
		said(tenth, "Start Expectation and linearity"),
		...call(tenth + 1, "plan_init", { mermaid: "graph TD\n  a[Weighting values by their probabilities]", goal: { title: "Expectation and linearity", topic: "expectation" } }),
		...call(tenth + 2, "course_save", { changes: { tasks: { "expectation-lesson": { title: TITLE, topics: ["expectation"], goal: "E(X)", step: "The lottery question" } } } }),
		...leftOn(tenth + 3, "What is the expected gain of one lottery ticket?", "a"),
	] as never);

	it("before anything newer, the 10 Nov lesson waits on its lottery question", () => {
		assert.equal(listed(lesson.id).pendingQuestion, true);
		assert.deepEqual(listed(lesson.id).tasks, ["expectation-lesson"]);
	});

	// 17 Nov: Ask the tutor, "Yes", and the Ask session writes the lesson's step.
	const ask = chatStore.createChat("Fitting the exam's topics in", PROB, [], undefined, true);
	const seventeenth = at("2026-11-17T10:00:00");

	it("the older lesson's open question closes in every list: one open session per lesson", () => {
		chatStore.saveMessages(ask.id, [
			said(seventeenth, "My exam plan has no room for Poisson distribution. How can I still fit it in?"),
			said(seventeenth + 1, "Yes"),
			...call(seventeenth + 2, "course_save", { changes: { observations: [{ topics: ["expectation"], text: "Found the raffle's expected gain", result: "correct", help: "none" }], tasks: { "expectation-lesson": { step: "The spinner question" } } } }),
		] as never);
		const older = listed(lesson.id);
		assert.equal(older.pendingQuestion, false);
		assert.equal(older.ended, "closed");
		const open = chatStore.listChats().filter((c) => (c.tasks ?? []).includes("expectation-lesson") && c.pendingQuestion);
		assert.ok(open.every((c) => c.id !== lesson.id), "the 10 Nov lesson is no longer open");
	});

	it("the session that carries the lesson on is named after it in every list", async () => {
		assert.equal(listed(ask.id).title, "Fitting the exam's topics in", "before its turn settles");
		assert.equal(await nameAfterHeldTask({ chatStore, courseRecords: courseRecords as never }, ask.id), true);
		assert.equal(listed(ask.id).title, TITLE);
		assert.equal(chatStore.getChat(ask.id)!.title, TITLE, "the record's name, which Earlier and Sessions read");
	});

	it("a session he renamed, or one opened on a topic, keeps its name", async () => {
		chatStore.renameChat(ask.id, "My exam fit");
		assert.equal(await nameAfterHeldTask({ chatStore, courseRecords: courseRecords as never }, ask.id), false);
		assert.equal(listed(ask.id).title, "My exam fit");
		const practice = chatStore.createChat("Rank practice", PROB, ["rank"]);
		chatStore.saveMessages(practice.id, [said(seventeenth, "Practice rank"), ...call(seventeenth + 5, "course_save", { changes: { tasks: { "expectation-lesson": { step: "x" } } } })] as never);
		assert.equal(await nameAfterHeldTask({ chatStore, courseRecords: courseRecords as never }, practice.id), false);
	});

	it("a lesson whose task no newer session wrote stays open", () => {
		const other = chatStore.createChat("Poisson distribution lesson", PROB, ["poisson"]);
		chatStore.saveMessages(other.id, [
			said(tenth, "Start Poisson distribution"),
			...call(tenth + 1, "course_save", { changes: { tasks: { "poisson-lesson": { title: "Poisson distribution lesson", topics: ["poisson"], goal: "Poisson", step: "Slots" } } } }),
			...leftOn(tenth + 2, "How many slots?"),
		] as never);
		assert.equal(listed(other.id).pendingQuestion, true);
	});
});
