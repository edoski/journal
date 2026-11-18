/**
 * Round 16, M3 (1 M2) and M4 (3 N1): a session's topics and task follow
 * what it did, not what his question named or where it started.
 *
 * M3: Ask the tutor from the exam's gaps opened a session on Geometric,
 * Variance and Poisson, the topics his question named; it reviewed
 * Independent events and Random variables, and each gap topic then read
 * "Left off today". M4: "Review Binomial distribution", whose first message
 * was "Poisson", taught a Poisson lesson; it stayed the review, so its
 * close could save no task and Poisson's page had nothing to resume.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lh-filed-"));
process.env.LH_DATA_DIR = path.join(scratch, "data");
const { chatStore } = await import("../src/store/chats.ts");
const { newUserMessage } = await import("../src/core/native-messages.ts");
const { reviewRecord, lessonTakenUp } = await import("../src/core/session-opening.ts");
const { projectCourseBrief } = await import("../src/core/course-brief.ts");
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

const USAGE = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
let n = 0;
const call = (name: string, args: unknown) => {
	const id = `c${++n}`;
	return [
		{ id: `a${n}`, role: "assistant", content: [{ type: "toolCall", id, name, arguments: args }], api: "faux", provider: "test", model: "test", usage: USAGE, stopReason: "toolUse", timestamp: n },
		{ id: `r${n}`, role: "toolResult", toolCallId: id, toolName: name, content: [{ type: "text", text: "{}" }], details: {}, isError: false, timestamp: n },
	];
};
const save = (changes: unknown) => call("course_save", { changes });
const course = { workspace: "/s/prob", title: "Probability" };
const listed = (id: string) => chatStore.listChats().find((c) => c.id === id)!;

describe("Ask the tutor belongs to the topics its answers were on (round 16, M3)", () => {
	const created = chatStore.createChat("Fitting the exam's topics in", course, [], undefined, true);
	chatStore.saveMessages(created.id, [
		newUserMessage("My exam plan has no room for Geometric distribution, Variance and Poisson distribution. How can I still fit them in?"),
		...save({ observations: [{ topics: ["independence"], text: "Told disjoint from independent events", result: "correct", help: "none" }] }),
		...save({ observations: [{ topics: ["random-variables"], text: "Found P(max = 5) for three rolls", result: "correct", help: "none", sure: "guess" }] }),
	] as never);

	it("is opened on no topic and named once, by the app", () => {
		const record = chatStore.getChat(created.id)!;
		assert.deepEqual(record.topics ?? [], []);
		assert.equal(record.named, true);
	});

	it("is filed under the topics it saved answers on, never the gap topics his question named", () => {
		assert.deepEqual(listed(created.id).ownTopics, ["independence", "random-variables"]);
		assert.ok(!(listed(created.id).topics ?? []).some((t) => ["geometric", "variance", "poisson"].includes(t)), `${listed(created.id).topics}`);
	});
});

describe("a review whose plan teaches another topic is that topic's lesson (round 16, M4)", () => {
	const created = chatStore.createChat("Review Binomial distribution", course, ["binomial"]);
	const opening = [newUserMessage("Poisson"), ...save({ observations: [{ topics: ["binomial"], text: "Counted bulbs as Bin(4, 0.3)", result: "incorrect", help: "none" }] })];
	chatStore.saveMessages(created.id, opening as never);

	it("is the review until a plan teaches another topic", () => {
		const record = chatStore.getChat(created.id)!;
		assert.equal(reviewRecord(record), true);
		assert.equal(lessonTakenUp(record), null);
	});

	it("after a plan on Poisson: no longer a review, filed under Poisson, and the brief says it is the Poisson lesson", () => {
		chatStore.saveMessages(created.id, [...opening, ...call("plan_init", { mermaid: "graph TD\n  a[Why the base tends to one] --> b[Counting the slots]", goal: { title: "Poisson as a limit", topic: "poisson" } })] as never);
		const record = chatStore.getChat(created.id)!;
		assert.equal(lessonTakenUp(record), "poisson");
		assert.equal(reviewRecord(record), false, "its close may save the lesson's task");
		assert.deepEqual(listed(created.id).ownTopics, ["poisson"]);
		assert.equal(listed(created.id).review, false);
		const brief = projectCourseBrief({ course: { title: "Probability" }, today: "2026-11-08" }, "teach", { opened: ["binomial"], review: reviewRecord(record), takenUp: lessonTakenUp(record) }).text;
		assert.match(brief, /now the poisson lesson/);
		assert.doesNotMatch(brief, /The session is his review/);
	});

	it("takes the lesson's name, unless he renamed it", () => {
		chatStore.takeUpLesson(created.id, "Poisson distribution lesson");
		assert.equal(listed(created.id).title, "Poisson distribution lesson");
		chatStore.renameChat(created.id, "My Poisson");
		chatStore.takeUpLesson(created.id, "Poisson distribution lesson");
		assert.equal(listed(created.id).title, "My Poisson");
	});

	it("a lesson opened on a topic whose plan teaches it stays that topic's", () => {
		const lesson = chatStore.createChat("Poisson distribution", course, ["poisson"]);
		chatStore.saveMessages(lesson.id, [newUserMessage("Poisson distribution"), ...call("plan_init", { mermaid: "graph TD\n  a[Why the base tends to one]", goal: { title: "Poisson", topic: "poisson" } })] as never);
		assert.equal(lessonTakenUp(chatStore.getChat(lesson.id)!), null);
		assert.deepEqual(listed(lesson.id).ownTopics, ["poisson"]);
	});
});
