/**
 * A review that turns into teaching stays a review (round 9, 2 m4). Its
 * course brief says the session was opened as the topic's review, so the
 * tutor is never told it is a lesson, and a save there keeps no task:
 * round 9's live check saw "Review Independent events" re-teach and then
 * save the task "Re-learn checking independence" through course_save. The
 * engine is the fake CLI; the data dir is temporary.
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
});
