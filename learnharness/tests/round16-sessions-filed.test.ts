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

/**
 * Round 17, M5 (3 M4): in the Probability review he asked to start
 * Expectation and linearity; the tutor probed it, and he left with the
 * envelopes question open, before any plan. The session stayed the review,
 * so its close saved no task and Expectation's page had nothing to resume.
 * The probe is the first lesson's start: a save that starts the topic (its
 * receipt moves it up from "new") takes up its lesson.
 */
describe("a review whose probe starts another topic is that topic's lesson, before any plan (round 17, M5)", () => {
	const receipt = (levels: Record<string, unknown>) => (changes: unknown) => {
		const [ask, result] = save(changes);
		return [ask, { ...result!, content: [{ type: "text", text: JSON.stringify({ revision: 3, changed: true, levels }) }] }];
	};
	const created = chatStore.createChat("Review Inclusion-exclusion principle, Conditional probability", course, ["inclusion-exclusion", "conditional"]);
	const reviewed = [newUserMessage("Review Inclusion-exclusion principle, Conditional probability"), ...receipt({ conditional: { from: "attempted", to: "solid" } })({ observations: [{ topics: ["conditional"], text: "Found P(A | B) from the table", result: "correct", help: "none" }] })];
	const probed = [...reviewed, newUserMessage("Can we start Expectation and linearity now instead?"), ...receipt({ expectation: { from: "new", to: "attempted" } })({ observations: [{ topics: ["expectation"], text: "Gave E(X) for one die", result: "correct", help: "none" }] })];

	it("is the review while its answers are on topics already started", () => {
		chatStore.saveMessages(created.id, reviewed as never);
		assert.equal(lessonTakenUp(chatStore.getChat(created.id)!), null);
		assert.equal(listed(created.id).review, true);
	});

	it("once a probe answer starts Expectation: filed under it, no longer a review, its close saves the lesson's task, and it takes the lesson's name", async () => {
		chatStore.saveMessages(created.id, probed as never);
		const record = chatStore.getChat(created.id)!;
		assert.equal(lessonTakenUp(record), "expectation");
		assert.equal(reviewRecord(record), false, "its close saves the lesson's task");
		assert.deepEqual(listed(created.id).ownTopics, ["expectation"], "Expectation's page resumes it");
		assert.equal(listed(created.id).review, false);
		const { nameTakenUpLesson } = await import("../src/server/session-naming.ts");
		const courseRecords = { map: async () => ({ ok: true as const, map: { topics: [{ handle: "expectation", title: "Expectation and linearity" }] } }) };
		assert.equal(await nameTakenUpLesson({ chatStore, courseRecords: courseRecords as never }, created.id), true);
		assert.equal(listed(created.id).title, "Expectation and linearity lesson");
	});

	it("a plan that came first decides, as before", () => {
		const planned = chatStore.createChat("Review Conditional probability", course, ["conditional"]);
		chatStore.saveMessages(planned.id, [newUserMessage("Review Conditional probability"), ...call("plan_init", { mermaid: "graph TD\n  a[Bayes again]", goal: { title: "Conditional probability", topic: "conditional" } }), ...receipt({ expectation: { from: "new", to: "attempted" } })({ observations: [{ topics: ["expectation"], text: "A side question on E(X)", result: "correct", help: "none" }] })] as never);
		assert.equal(lessonTakenUp(chatStore.getChat(planned.id)!), null);
	});
});

describe("when he worked in a session (round 16, m8, m9)", () => {
	it("is his input's time and days, never a write that was not his", () => {
		const created = chatStore.createChat("Linear maps and their matrices lesson", course, ["linear-maps"]);
		const at = (iso: string) => Date.parse(iso);
		chatStore.saveMessages(created.id, [
			{ ...newUserMessage("Linear maps and their matrices"), timestamp: at("2026-11-09T10:00:00") },
			{ ...newUserMessage("the images of the basis"), timestamp: at("2026-11-10T11:00:00") },
			// The app posing his left question again when he opened it, later that day: not his.
			{ id: "again", role: "assistant", content: [{ type: "toolCall", id: "call_again_1", name: "explain", arguments: { type: "check", question: "Is T linear?" } }], api: "faux", provider: "test", model: "synthetic-repose", usage: USAGE, stopReason: "toolUse", timestamp: at("2026-11-10T16:00:00") },
		] as never);
		const item = listed(created.id);
		assert.deepEqual(item.studiedDays, ["2026-11-09", "2026-11-10"]);
		assert.equal(item.studiedAt, new Date(at("2026-11-10T11:00:00")).toISOString());
	});
});

describe("a session waiting on him from before yesterday (round 16, m7)", () => {
	it("is listed as left on its day, so every surface says Left off, never Your turn, once Home has let it go", async () => {
		const { sessionState } = await import("../components/nav/session-state.ts");
		const { sessionRowStatus } = await import("../components/unit-inbox/unit-row.tsx");
		const was = process.env.LEARNING_TODAY;
		try {
			process.env.LEARNING_TODAY = "2026-11-08";
			const rank = chatStore.createChat("Rank practice", course, ["rank"]);
			chatStore.saveMessages(rank.id, [newUserMessage("Practice rank"), ...call("problem", { statement: "Find rank A.", mode: "recall", topics: ["rank"], modelSolution: "2" })] as never);
			process.env.LEARNING_TODAY = "2026-11-09";
			assert.equal(sessionState({ ...listed(rank.id), busy: false }), "your-turn", "yesterday's is still on Home, and his turn");
			process.env.LEARNING_TODAY = "2026-11-10";
			const old = { ...listed(rank.id), busy: false };
			assert.equal(sessionState(old), "left");
			assert.deepEqual(sessionRowStatus(old, sessionState(old), "2026-11-10"), { kind: "task", words: "Left off 8 Nov" });
		} finally {
			if (was === undefined) delete process.env.LEARNING_TODAY;
			else process.env.LEARNING_TODAY = was;
		}
	});
});
