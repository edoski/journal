/**
 * A step of the lesson's plan never becomes a course topic (round 10,
 * 3 m8): the Poisson lesson saved its steps "The limit (1 + x/n)^n → e^x"
 * and "The exponential series" as course topics, which then had reviews,
 * slip words and cards on Home's map. course_save refuses a topic it
 * would create from a step, by the step's id or its title; a topic the
 * course has, named with no title, still saves.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { courseTools, type CourseToolContext } from "../src/agent/tools/course.ts";
import { courseRecordPrompt } from "../src/agent/prompt-segments.ts";

const STEPS = [
	{ id: "slots", title: "Splitting the hour into slots" },
	{ id: "limit-e", title: "The limit $(1+\\frac{x}{n})^n \\to e^x$" },
	{ id: "exp-series", title: "The exponential series" },
];

function saving() {
	const saves: unknown[] = [];
	const ctx: CourseToolContext = {
		course: { workspace: "/study/prob", title: "Probability" },
		records: { run: async (_w, verb) => (verb.verb === "save" && saves.push(verb.changes), { ok: true, json: { saved: [], notes: [] } }) } as CourseToolContext["records"],
		arcs: false,
		planSteps: () => STEPS,
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

describe("a step of the lesson's plan", () => {
	it("is refused as a new course topic, by its id or its title", async () => {
		const { saves, save } = saving();
		assert.match((await save({ topics: { "limit-e": { title: "The limit $(1+\\frac{x}{n})^n \\to e^x$", needs: ["poisson"] } } }))!, /limit-e is a step of this lesson's plan, not a course topic/);
		assert.match((await save({ topics: { "exponential-series": { title: "The exponential series", needs: [] } } }))!, /exponential-series is a step/);
		assert.deepEqual(saves, [], "nothing reached the record");
	});

	it("leaves a topic the course has, and a new topic that is no step, to save", async () => {
		const { saves, save } = saving();
		assert.equal(await save({ topics: { poisson: { gap: "Takes the slots as dependent" } } }), null);
		assert.equal(await save({ topics: { "geometric": { title: "Geometric distribution", needs: ["poisson"] } } }), null);
		assert.equal(saves.length, 2);
	});

	it("is never a course topic in the doctrine every agent reads", () => {
		for (const agent of ["prober", "teacher", "practice"] as const) assert.match(courseRecordPrompt(agent, { arcs: false }), /a step of your lesson plan is never one/, agent);
	});
});
