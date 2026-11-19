/**
 * Round 18, M3 (3 M5; round 17's M5, not fixed): in "Review
 * Inclusion-exclusion principle" he asked to start Expectation and
 * linearity and picked it. The tutor's second plan_init gave no `goal`, so
 * nothing said the session now taught Expectation: it stayed the review,
 * its close's `tasks.expectation-lesson` was refused ("a review saves no
 * task"), Expectation's page had nothing to resume, and Home's
 * Inclusion-exclusion row reopened the session on Expectation's wheel
 * question. The live chat is replayed here as its tool calls went.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lh-takes-up-"));
process.env.LH_DATA_DIR = path.join(scratch, "data");
const { chatStore } = await import("../src/store/chats.ts");
const { newUserMessage } = await import("../src/core/native-messages.ts");
const { lessonTakenUp, reviewRecord } = await import("../src/core/session-opening.ts");
const { planTools } = await import("../src/agent/tools/plan.ts");
const { courseTools, REVIEW_TASK_REFUSED } = await import("../src/agent/tools/course.ts");
const { ownsTopic } = await import("../components/unit-inbox/units.ts");
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

const USAGE = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
let n = 0;
const call = (name: string, args: unknown, result = "{}") => {
	const id = `c${++n}`;
	return [
		{ id: `a${n}`, role: "assistant", content: [{ type: "toolCall", id, name, arguments: args }], api: "faux", provider: "test", model: "test", usage: USAGE, stopReason: "toolUse", timestamp: n },
		{ id: `r${n}`, role: "toolResult", toolCallId: id, toolName: name, content: [{ type: "text", text: result }], details: {}, isError: false, timestamp: n },
	];
};
const course = { workspace: "/s/prob", title: "Probability" };
const listed = (id: string) => chatStore.listChats().find((c) => c.id === id)!;

const IE_PLAN = "graph TD\n  triple-term[What a three-set union does with the triple overlap] --> count-once[How often the formula counts an outcome in $k$ sets]";
const EXPECTATION_PLAN = "graph TD\n  long-run-average[The average of many draws of a random variable] --> expectation-def[The expected value of a random variable]";
const TASK = { "expectation-lesson": { title: "Expectation and linearity lesson", topics: ["expectation"], goal: "Define E(X) as the long-run average", step: "Finish your half answer on the wheel question." } };

/** The live chat up to his pick of Expectation: the review's first answer
 *  (filed under the binomial theorem), the re-teach plan on its own topic,
 *  his ask, and the choice. */
function reviewToPick() {
	return [
		newUserMessage("Review Inclusion-exclusion principle"),
		...call("course_save", { changes: { observations: [{ topics: ["binomial-theorem"], text: "Found the alternating sum as (1-1)^k", result: "correct", help: "none" }] } }),
		...call("plan_init", { mermaid: IE_PLAN, goal: { title: "Inclusion-exclusion review", topic: "inclusion-exclusion" } }),
		newUserMessage("Can we start Expectation and linearity now instead?"),
		...call("ask_user_question", { question: "Which comes first today?", options: [{ label: "Expectation and linearity" }, { label: "The inclusion-exclusion review" }] }),
	];
}

const plan = (chatId: string) => planTools({ chatId, chatStore, course: { course, records: { map: async () => ({ ok: true, map: { topics: [{ handle: "expectation", title: "Expectation and linearity" }] } }) } } as never }).plan_init!;
const run = async (tool: ReturnType<typeof plan>, args: unknown) => {
	const text = (await tool.execute("p1", args as never)).content.map((c) => (c as { text: string }).text).join("");
	return { ok: (JSON.parse(text) as { ok?: boolean }).ok === true, text };
};

describe("a review's plan names the topic it teaches (round 18, M3)", () => {
	it("a plan in a review that gives no topic is refused, and says to name one", async () => {
		const created = chatStore.createChat("Review Inclusion-exclusion principle", course, ["inclusion-exclusion"]);
		chatStore.saveMessages(created.id, reviewToPick() as never);
		const refused = await run(plan(created.id), { mermaid: EXPECTATION_PLAN });
		assert.equal(refused.ok, false);
		assert.match(refused.text, /goal\.topic: this session is his review of inclusion-exclusion/);
		const goalless = await run(plan(created.id), { mermaid: EXPECTATION_PLAN, goal: { title: "Expectation and linearity" } });
		assert.equal(goalless.ok, false, "a goal with no topic says nothing of what it teaches either");
	});

	it("with the topic, the plan takes Expectation up at once: named after its lesson, no longer the review", async () => {
		const created = chatStore.createChat("Review Inclusion-exclusion principle", course, ["inclusion-exclusion"]);
		const messages = reviewToPick();
		chatStore.saveMessages(created.id, messages as never);
		const args = { mermaid: EXPECTATION_PLAN, goal: { title: "Expectation and linearity", topic: "expectation" } };
		assert.equal((await run(plan(created.id), args)).ok, true);
		assert.equal(listed(created.id).title, "Expectation and linearity lesson");
		chatStore.saveMessages(created.id, [...messages, ...call("plan_init", args)] as never);
		assert.equal(lessonTakenUp(chatStore.getChat(created.id)!), "expectation");
		assert.deepEqual(listed(created.id).ownTopics, ["expectation"], "Expectation's page resumes it");
		assert.equal(ownsTopic({ ...listed(created.id), busy: false }, "inclusion-exclusion"), false, "Home's Inclusion-exclusion row opens its own review, never Expectation's question");
	});

	it("a re-teach of the review's own topic, named, keeps the review", async () => {
		const created = chatStore.createChat("Review Inclusion-exclusion principle", course, ["inclusion-exclusion"]);
		chatStore.saveMessages(created.id, [newUserMessage("Review Inclusion-exclusion principle")] as never);
		assert.equal((await run(plan(created.id), { mermaid: IE_PLAN, goal: { title: "Inclusion-exclusion review", topic: "inclusion-exclusion" } })).ok, true);
		assert.equal(listed(created.id).title, "Review Inclusion-exclusion principle");
		assert.equal(listed(created.id).review, true);
	});
});

describe("a review's task for the lesson it took up is saved, and takes the lesson up (round 18, M3)", () => {
	const saving = (planSteps: readonly { id: string; title: string }[]) => {
		const saves: unknown[] = [];
		const ctx = {
			course,
			records: { run: async (_w: string, verb: { verb: string; changes?: unknown }) => (verb.verb === "save" && saves.push(verb.changes), { ok: true, json: { saved: [], notes: [] } }) },
			arcs: false,
			review: true,
			reviewTopics: ["inclusion-exclusion"],
			planSteps: () => planSteps,
		};
		const save = async (changes: Record<string, unknown>) => {
			try {
				await courseTools(ctx as never).course_save!.execute("t1", { changes } as never);
				return null;
			} catch (error) {
				return (error as Error).message;
			}
		};
		return { saves, save };
	};
	const steps = [{ id: "long-run-average", title: "The average of many draws of a random variable" }];

	it("the live close's save goes through: a task on Expectation, after a plan taught here", async () => {
		const { saves, save } = saving(steps);
		assert.equal(await save({ topics: { expectation: { introduced: true } }, tasks: TASK, focus: "expectation-lesson" }), null);
		assert.equal(saves.length, 1);
	});

	it("a task on the review's own topic, or one with no plan taught, is still refused", async () => {
		const own = { "ie-relearn": { title: "Re-learn inclusion-exclusion", topics: ["inclusion-exclusion"], goal: "Count unions", step: "Three sets" } };
		assert.equal(await saving(steps).save({ tasks: own }), `Nothing was saved or read. ${REVIEW_TASK_REFUSED}`);
		assert.equal(await saving([]).save({ tasks: TASK }), `Nothing was saved or read. ${REVIEW_TASK_REFUSED}`);
		assert.equal(await saving(steps).save({ tasks: { ...TASK, ...own } }), `Nothing was saved or read. ${REVIEW_TASK_REFUSED}`);
	});

	it("once saved, the session is Expectation's lesson: filed under it, its task, no longer the review", () => {
		// The live chat as it went: the second plan gave no goal, then the close saved the task.
		const created = chatStore.createChat("Review Inclusion-exclusion principle", course, ["inclusion-exclusion"]);
		chatStore.saveMessages(created.id, [...reviewToPick(), ...call("plan_init", { mermaid: EXPECTATION_PLAN }), ...call("course_save", { changes: { topics: { expectation: { introduced: true } }, tasks: TASK, focus: "expectation-lesson" } })] as never);
		const record = chatStore.getChat(created.id)!;
		assert.equal(lessonTakenUp(record), "expectation");
		assert.equal(reviewRecord(record), false);
		const item = listed(created.id);
		assert.deepEqual(item.ownTopics, ["expectation"], "Expectation's page shows Resume");
		assert.deepEqual(item.tasks, ["expectation-lesson"]);
		assert.equal(item.review, false);
		assert.equal(ownsTopic({ ...item, busy: false }, "inclusion-exclusion"), false, "Home's Inclusion-exclusion row opens an Inclusion-exclusion question");
	});
});
