/**
 * A review that turns into teaching stays a review (round 9, 2 m4). Its
 * course brief says the session was opened as the topic's review, so the
 * tutor is never told it is a lesson, and a save there keeps no task:
 * round 9's live check saw "Review Independent events" re-teach and then
 * save the task "Re-learn checking independence" through course_save. The
 * teacher's wake after the probe asks a review for its one-line switch, and
 * a message calling the session a lesson is rewritten. The engine is the
 * fake CLI; the data dir is temporary.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { useFakeEngine } from "./fixtures/fake-engine-env.ts";

const TMP = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lh-review-stays-")));
const PROB = path.join(TMP, "study", "prob");
fs.mkdirSync(PROB, { recursive: true });
useFakeEngine(TMP, [{ workspace: PROB, title: "Probability" }]);
process.env.LH_DATA_DIR = path.join(TMP, "data");
process.env.FAKE_ENGINE_RESUME = JSON.stringify({ today: "2026-11-08", due: [], task: null });

const { POST: createChatRoute } = await import("../app/api/chats/route.ts");
const { chatStore } = await import("../src/store/chats.ts");
const { fetchCourseBrief } = await import("../src/server/course-brief.ts");
const { courseTools, REVIEW_TASK_REFUSED } = await import("../src/agent/tools/course.ts");
type CourseToolContext = import("../src/agent/tools/course.ts").CourseToolContext;
const { probeDoneTool } = await import("../src/agent/tools/probe.ts");
const { topicCreation } = await import("../components/unit-inbox/start-unit.ts");
const { reviewRecord } = await import("../src/core/session-opening.ts");
const { REVIEW_HANDOFF_TEXT, HANDOFF_TEXT } = await import("../src/core/contracts/chat.ts");
const { VoiceGuard } = await import("../src/agent/voice-guard.ts");
const { SEND_TO_USER_TOOL, newDoneTonightMessage, newUserMessage } = await import("../src/core/native-messages.ts");
type LhMessage = import("../src/core/native-messages.ts").LhMessage;

after(() => fs.rmSync(TMP, { recursive: true, force: true }));

async function startFrom(body: unknown): Promise<string> {
	const res = await createChatRoute(new Request("http://test/api/chats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
	assert.equal(res.status, 200);
	return ((await res.json()) as { id: string }).id;
}

function saving(review: boolean) {
	const saves: unknown[] = [];
	const ctx: CourseToolContext = {
		course: { workspace: PROB, title: "Probability" },
		records: {
			run: async (_w, verb) => {
				if (verb.verb === "save") saves.push(verb.changes);
				return { ok: true, json: { saved: [], notes: [] } };
			},
		} as CourseToolContext["records"],
		arcs: false,
		review,
	};
	const save = async (changes: Record<string, unknown>) => {
		try {
			await courseTools(ctx).course_save!.execute("t1", { changes } as never);
			return null;
		} catch (error) {
			return (error as Error).message;
		}
	};
	return { saves, save };
}

const TASK = { "independence-review": { title: "Re-learn checking independence", topics: ["independence"], goal: "Decide independence", step: "The sum-8 check" } };

describe("a review that turns into teaching", () => {
	it("is a review in its course brief, never a lesson", async () => {
		const review = await startFrom({ title: "Review Independent events", course: { workspace: PROB }, topics: ["independence"] });
		assert.match((await fetchCourseBrief(chatStore.getChat(review)!))!.text, /^Opened on: independence, as its review\. .*The session is his review, whatever it re-teaches\.$/m);
		const lesson = await startFrom({ title: "Independent events", course: { workspace: PROB }, topics: ["independence"] });
		assert.doesNotMatch((await fetchCourseBrief(chatStore.getChat(lesson)!))!.text, /as its review/);
	});

	// Round 10, 2 M1: the sidebar's Study, a Mistakes row and the exam's
	// gaps posted the topic's bare title even when memory asked for its
	// review, so the review became a lesson that saved a lesson task.
	it("is what every Study press on one topic opens when memory asks for the review", async () => {
		const binomial = { title: "Binomial distribution", handle: "binomial" as Parameters<typeof topicCreation>[1]["handle"] };
		const opened = async (review: Parameters<typeof topicCreation>[1]["review"]) => {
			const id = await startFrom(topicCreation(PROB, { ...binomial, review }, "2026-11-08"));
			return chatStore.getChat(id)!;
		};
		const due = await opened({ kind: "due", date: "2026-11-08", overdue: 2 });
		assert.ok(reviewRecord(due), "a due review opens as the review");
		assert.match((await fetchCourseBrief(due))!.text, /^Opened on: binomial, as its review\./m);
		const held = await opened({ kind: "scheduled", date: "2026-11-11", held: { exam: null, since: "2026-11-06" } });
		assert.ok(reviewRecord(held), "a review the plan holds past memory's day opens as the review");
		assert.equal(held.title, "Review Binomial distribution");
		assert.ok(!reviewRecord(await opened({ kind: "scheduled", date: "2026-11-13" })), "a review set for later: a lesson");
		assert.ok(!reviewRecord(await opened(null)), "no review: a lesson");
	});

	it("saves no task, and the rest of a save waits for it to be sent without one", async () => {
		const { saves, save } = saving(true);
		assert.equal(await save({ tasks: TASK, focus: "independence-review" }), `Nothing was saved or read. ${REVIEW_TASK_REFUSED}`);
		assert.match((await save({ tasks: TASK, topics: { independence: { gap: "Multiplied without checking" } } }))!, /a review saves no task/);
		assert.deepEqual(saves, [], "nothing reached the record");
		assert.equal(await save({ topics: { independence: { gap: "Multiplied without checking" } } }), null);
		assert.equal(await save({ tasks: { "old-task": null } }), null, "a task removed is not a task kept");
		assert.equal(saves.length, 2);
	});

	it("leaves a lesson's tasks alone", async () => {
		const { saves, save } = saving(false);
		assert.equal(await save({ tasks: TASK, focus: "independence-review" }), null);
		assert.equal(saves.length, 1);
	});

	it("is asked, when the teacher takes over, to say it re-teaches and to stay his review", async () => {
		const woken = async (title: string) => {
			const chatId = await startFrom({ title, course: { workspace: PROB }, topics: ["independence"] });
			const delivered: { content?: unknown }[] = [];
			await probeDoneTool({ chatId, chatStore, deliver: (s) => void delivered.push(s as never) }).probe_done!.execute("t", { assessment: { strands: [{ strand: "independence", assessment: "Floor: the definition. Ceiling: the product test." }], summary: "Re-teach the product test." } } as never);
			return String(delivered[0]?.content);
		};
		assert.equal(await woken("Review Independent events"), `${HANDOFF_TEXT} ${REVIEW_HANDOFF_TEXT}`);
		assert.equal(await woken("Independent events"), HANDOFF_TEXT, "a lesson's wake is as before");
	});

	it("is never called a lesson in what he reads", () => {
		const close = "That closes the binomial lesson for today. It comes back on Wednesday 11 November.";
		const refusedIn = (review: boolean) => {
			const guard = new VoiceGuard([newUserMessage("Review Binomial distribution"), newDoneTonightMessage("teacher") as LhMessage], undefined, review);
			const call = { type: "toolCall" as const, id: `send-${review}`, name: SEND_TO_USER_TOOL, arguments: { message: close } };
			guard.screen(call);
			const refused = (guard as unknown as { decisions: Map<string, { details: { rules?: string[] } } | null> }).decisions.get(call.id);
			return refused?.details.rules ?? [];
		};
		assert.deepEqual(refusedIn(true), ["review-lesson"]);
		assert.deepEqual(refusedIn(false), [], "a lesson may say so");
	});
});
