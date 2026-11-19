/**
 * Round 18, M3 (3 M5), the `course_save` half: "Review Inclusion-exclusion
 * principle" began Expectation's lesson when he asked for it, with a plan
 * that named no goal. At Done for today the close saved
 * `tasks.expectation-lesson`, and the save was refused, "this session is
 * his review, and a review saves no task", so only `expectation:
 * introduced` was kept and Expectation's page had no Resume. A review still
 * keeps no task on its own topics (round 9, 2 m4); a task on topics outside
 * them, once the session has written a lesson plan, is the lesson it took
 * up, and is saved.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { courseTools, REVIEW_TASK_REFUSED, type CourseToolContext } from "../src/agent/tools/course.ts";

function saving(opts: { plan: boolean; opened?: readonly string[] }) {
	const saves: unknown[] = [];
	const ctx: CourseToolContext = {
		course: { workspace: "/study/prob", title: "Probability" },
		records: {
			run: async (_w, verb) => {
				if (verb.verb === "save") saves.push(verb.changes);
				return { ok: true, json: { saved: [], notes: [] } };
			},
		} as CourseToolContext["records"],
		arcs: false,
		review: true,
		...(opts.opened ? { opened: opts.opened } : {}),
		planSteps: () => (opts.plan ? [{ id: "wheel", title: "What a wheel's sectors pay on average" }] : []),
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

const EXPECTATION = { "expectation-lesson": { title: "Expectation and linearity lesson", topics: ["expectation"], goal: "Find expected values by linearity", step: "The wheel's expected payout" } };
const OWN = { "ie-relearn": { title: "Re-learn inclusion-exclusion", topics: ["inclusion-exclusion"], goal: "Count unions", step: "The four-set count" } };

describe("a review that took up another topic's lesson (round 18, M3)", () => {
	it("saves the taken-up lesson's task, with its focus", async () => {
		const { saves, save } = saving({ plan: true, opened: ["inclusion-exclusion"] });
		assert.equal(await save({ tasks: EXPECTATION, focus: "expectation-lesson", topics: { expectation: { introduced: true } } }), null);
		assert.equal(saves.length, 1);
	});

	it("still keeps no task on the review's own topics, nor one beside the taken-up lesson's", async () => {
		const { saves, save } = saving({ plan: true, opened: ["inclusion-exclusion"] });
		assert.equal(await save({ tasks: OWN }), `Nothing was saved or read. ${REVIEW_TASK_REFUSED}`);
		assert.equal(await save({ tasks: { ...EXPECTATION, ...OWN } }), `Nothing was saved or read. ${REVIEW_TASK_REFUSED}`);
		assert.equal(await save({ tasks: EXPECTATION, focus: "ie-relearn" }), `Nothing was saved or read. ${REVIEW_TASK_REFUSED}`);
		assert.deepEqual(saves, []);
	});

	it("keeps no task in a review that wrote no lesson plan", async () => {
		const { saves, save } = saving({ plan: false, opened: ["inclusion-exclusion"] });
		assert.equal(await save({ tasks: EXPECTATION }), `Nothing was saved or read. ${REVIEW_TASK_REFUSED}`);
		assert.deepEqual(saves, []);
	});
});
