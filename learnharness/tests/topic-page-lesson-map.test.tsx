/**
 * The hybrid topic page's lesson map: a lesson's name, the plan in the
 * topic map's geometry and the marks the lesson's own Plan list wears.
 * Seeded plans are the demo's own session records (fixtures/topic).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import type { ChatRecord } from "../src/core/contracts/chat.ts";
import { derivePlanStatusesLh } from "../src/core/contracts/plan.ts";
import type { SessionPlan } from "../src/core/contracts/topic.ts";
import { lessonWords, stepMarks, stepsLayout } from "../components/unit-inbox/topic-page/steps/steps-facts.ts";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "topic");
/** A seeded session's plan, derived from its transcript as the topic read derives it. */
function seededPlan(id: string): SessionPlan {
	const record = JSON.parse(fs.readFileSync(path.join(FIXTURES, `${id}.json`), "utf8")) as ChatRecord;
	const { current, visited } = derivePlanStatusesLh(record.tree!, record.messages);
	return { id, tree: { nodes: record.tree!.nodes, edges: record.tree!.edges }, current, visited: [...visited] };
}
const EIGEN_PLAN = seededPlan("chat_demo_eigen");
const DET_PLAN = seededPlan("chat_demo_det");

const TODAY = "2026-11-08";

describe("a lesson's name", () => {
	it("is named by its day against the engine's", () => {
		assert.equal(lessonWords("2026-11-08", TODAY), "Today's lesson");
		assert.equal(lessonWords("2026-11-07", TODAY), "Yesterday's lesson");
		assert.equal(lessonWords("2026-11-03", TODAY), "Lesson of Tue 3 Nov");
		assert.equal(lessonWords("2026-11-03", TODAY, "practice"), "Practice of Tue 3 Nov");
	});
});

describe("the plan in the topic map's geometry", () => {
	it("lays the Eigenvalues lesson out in six layers, two steps in the fourth, seven routes", () => {
		const { layout, needs } = stepsLayout(EIGEN_PLAN);
		assert.equal(layout.layers.length, 6);
		assert.deepEqual(
			layout.layers.map((layer) => layer.length),
			[1, 1, 1, 2, 1, 1],
		);
		assert.deepEqual([...layout.layers[3]!].sort(), ["charpoly", "eigenspace"]);
		assert.equal(layout.routes.length, 7);
		assert.equal(needs.length, 7);
	});

	it("leaves out an edge to a missing step, a repeated edge and one that would close a loop", () => {
		const plan: SessionPlan = {
			id: "chat_x",
			tree: {
				nodes: [
					{ id: "a", title: "A" },
					{ id: "b", title: "B" },
					{ id: "c", title: "C" },
					{ id: "a", title: "A again" },
				],
				edges: [
					{ from: "a", to: "b" },
					{ from: "b", to: "c" },
					{ from: "a", to: "b" },
					{ from: "c", to: "a" },
					{ from: "b", to: "b" },
					{ from: "ghost", to: "c" },
				],
			},
			current: null,
			visited: [],
		};
		const { layout, needs } = stepsLayout(plan);
		assert.deepEqual(
			needs.map((need) => (need.kind === "needs" ? `${need.prerequisite}>${need.topic}` : "")),
			["a>b", "b>c"],
		);
		assert.equal(layout.topics.size, 3);
		assert.equal(layout.layers.length, 3);
	});
});

describe("the marks on a lesson's steps", () => {
	it("ring the step the Eigenvalues lesson waits on, with no tag since its pick-up row says so, and dot the one asked about before", () => {
		const marks = stepMarks(EIGEN_PLAN, true);
		assert.deepEqual(marks.get("compute"), { status: "current", tag: null });
		assert.deepEqual(marks.get("equation"), { status: "visited", tag: null });
		assert.deepEqual(marks.get("maps"), { status: "upcoming", tag: null });
	});

	it("say where the finished Determinants lesson left off and nothing more", () => {
		const marks = stepMarks(DET_PLAN, false);
		assert.deepEqual(marks.get("product"), { status: "current", tag: "Left off here" });
		assert.deepEqual(
			[...marks.values()].filter((mark) => mark.status === "visited"),
			[],
		);
	});
});
