/**
 * Round 17, m3 (4 minor 4): in the Linear maps lesson he asked "why do
 * similar matrices have the same eigenvalues?" and answered the tutor's
 * check at Guessing. Similar matrices, never started, then read "Right,
 * but a guess · Nothing due today" with no Start, and Diagonalization
 * moved "since Similar matrices is not solid yet". course_save marks an
 * answer on none of the lesson's topics `aside`, which the engine keeps
 * but never lets start a topic. A review is no lesson: a probe answered
 * inside it still starts the topic he asked for (round 17, M5).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { courseTools, type CourseToolContext } from "../src/agent/tools/course.ts";
import { lessonTopicsOf } from "../src/core/session-opening.ts";
import { newUserMessage } from "../src/core/native-messages.ts";

const LESSON = { title: "Linear maps and their matrices lesson", topics: ["linear-maps"], messages: [newUserMessage("Start Linear maps and their matrices")] };
const REVIEW = { title: "Review Inclusion-exclusion principle, Conditional probability", topics: ["incl-excl", "conditional"], messages: [newUserMessage("Review Inclusion-exclusion principle, Conditional probability")] };

function saving(record: typeof LESSON) {
	const saves: { observations?: Record<string, unknown>[] }[] = [];
	const ctx: CourseToolContext = {
		course: { workspace: "/study/la", title: "Linear Algebra" },
		records: { run: async (_w, verb) => (verb.verb === "save" && saves.push(verb.changes as never), { ok: true, json: { saved: [], notes: [] } }) } as CourseToolContext["records"],
		arcs: false,
		lessonTopics: () => lessonTopicsOf(record),
		answers: new Map([["q1", { tool: "explain", seenBefore: false, predicted: false, recorded: false }]]),
	};
	const save = async (topics: string[]) => {
		// Each save its own turn's context, so the one answer may be named again.
		await courseTools({ ...ctx }).course_save!.execute("t1", { changes: { observations: [{ topics, text: "Told why similar matrices share eigenvalues", result: "correct", help: "none", sure: "guess", question: "q1" }] } } as never);
		return saves.at(-1)!.observations![0]!;
	};
	return save;
}

describe("a check in a side question (round 17, m3)", () => {
	it("is saved aside when it is on none of the lesson's topics", async () => {
		const save = saving(LESSON);
		assert.equal((await save(["similarity"])).aside, true);
	});

	it("is the lesson's own answer when one of its topics is the lesson's", async () => {
		const save = saving(LESSON);
		assert.equal((await save(["linear-maps"])).aside, undefined);
		assert.equal((await save(["linear-maps", "similarity"])).aside, undefined);
	});

	it("is never aside in a review, whose probe may start the topic he asked for (M5)", async () => {
		assert.deepEqual(lessonTopicsOf(REVIEW), []);
		const save = saving(REVIEW);
		assert.equal((await save(["expectation"])).aside, undefined);
	});
});
