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
import { lessonWords, shiftsWithin, stepMarks, stepsCamera, stepsLayout, stepsShiftRange, STEP_SIZE, TAG_ROOM } from "../components/unit-inbox/topic-page/steps/steps-facts.ts";
import { WHOLE_COURSE_ZOOM, type Camera, type TopicMapLayout } from "../components/course-map/topic-map/topic-map-layout.ts";

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

	it("leave Left off here off a lesson that went through every step", () => {
		const through: SessionPlan = { ...DET_PLAN, visited: DET_PLAN.tree.nodes.map((node) => node.id).filter((id) => id !== DET_PLAN.current) };
		assert.deepEqual(stepMarks(through, false).get(DET_PLAN.current!), { status: "current", tag: null });
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

/** The topic page's map column at 1512×982 with the sidebar at its default width, and its fade. */
const COLUMN = { width: 504, height: 764 };
const FADE = { x: 24, y: 40 };

/** Each step's box on screen, its tag's room above it included. */
function boxes(layout: TopicMapLayout, camera: Camera, dy = 0) {
	return [...layout.topics.values()].map((at) => ({
		handle: at.handle,
		left: at.x * camera.zoom + camera.x,
		top: (at.y - TAG_ROOM) * camera.zoom + camera.y + dy,
		right: (at.x + STEP_SIZE.width) * camera.zoom + camera.x,
		bottom: (at.y + STEP_SIZE.height) * camera.zoom + camera.y + dy,
	}));
}
function clearOfFade(layout: TopicMapLayout, camera: Camera, dy = 0, frame = COLUMN): string[] {
	return boxes(layout, camera, dy)
		.filter((box) => box.left < FADE.x - 1e-6 || box.top < FADE.y - 1e-6 || box.right > frame.width - FADE.x + 1e-6 || box.bottom > frame.height - FADE.y + 1e-6)
		.map((box) => box.handle);
}

/** A lesson as a tutor planned it in a real session: nine steps, three wide where Sheet 4 (c) joins. */
const NINE_STEP_PLAN: SessionPlan = {
	id: "chat_nine",
	tree: {
		nodes: ["maps", "invariant", "equation", "charpoly", "eigenspace", "compute", "diagonal", "rank-review", "sheet4c"].map((id) => ({ id, title: id })),
		edges: [
			["maps", "invariant"], ["invariant", "equation"], ["equation", "charpoly"], ["equation", "eigenspace"], ["charpoly", "compute"],
			["eigenspace", "compute"], ["compute", "diagonal"], ["rank-review", "eigenspace"], ["rank-review", "sheet4c"],
		].map(([from, to]) => ({ from: from!, to: to! })),
	},
	current: "rank-review",
	visited: [],
};

describe("where a lesson's step map opens", () => {
	it("shows the whole Eigenvalues lesson at full size in the map column, every step and tag clear of the fade", () => {
		const { layout } = stepsLayout(EIGEN_PLAN);
		const camera = stepsCamera(layout, EIGEN_PLAN.current as never, COLUMN, FADE);
		assert.equal(camera.zoom, 1);
		assert.deepEqual(clearOfFade(layout, camera), []);
	});

	it("shows a lesson three steps wide whole, at a scale its titles stay legible at", () => {
		const { layout } = stepsLayout(NINE_STEP_PLAN);
		const camera = stepsCamera(layout, "rank-review" as never, COLUMN, FADE);
		assert.ok(camera.zoom >= WHOLE_COURSE_ZOOM && camera.zoom < 1, `zoom ${camera.zoom}`);
		assert.deepEqual(clearOfFade(layout, camera), []);
	});

	it("frames a lesson too long to show whole on the step it stopped on, at the legible scale", () => {
		const ids = Array.from({ length: 12 }, (_, i) => `s${i}`);
		const plan: SessionPlan = { id: "chat_long", tree: { nodes: ids.map((id) => ({ id, title: id })), edges: ids.slice(1).map((id, i) => ({ from: ids[i]!, to: id })) }, current: "s6", visited: [] };
		const { layout } = stepsLayout(plan);
		const camera = stepsCamera(layout, "s6" as never, COLUMN, FADE);
		assert.equal(camera.zoom, WHOLE_COURSE_ZOOM);
		const hidden = clearOfFade(layout, camera);
		assert.ok(hidden.length > 0 && !hidden.includes("s6" as never));
		const [least, most] = stepsShiftRange(layout, "s6" as never, camera, COLUMN, FADE);
		assert.ok(!clearOfFade(layout, camera, least).includes("s6" as never) && !clearOfFade(layout, camera, most).includes("s6" as never));
	});

	it("moves beside its row no further than keeps the whole lesson clear of the fade", () => {
		const { layout } = stepsLayout(EIGEN_PLAN);
		const tall = { width: 504, height: 900 };
		const camera = stepsCamera(layout, "compute" as never, tall, FADE);
		const [least, most] = stepsShiftRange(layout, "compute" as never, camera, tall, FADE);
		assert.ok(least < 0 && most > 0);
		assert.deepEqual([...clearOfFade(layout, camera, least, tall), ...clearOfFade(layout, camera, most, tall)], []);
		assert.ok(clearOfFade(layout, camera, most + 1, tall).length > 0, "a step further down meets the fade");
	});
});

describe("the shifts a step map tries for its line", () => {
	it("pulls a wanted shift into the range and tries the range across, least movement first", () => {
		assert.deepEqual(shiftsWithin([0, 300, -40], [-80, 80]), [0, -20, 20, -40, 40, -60, 60, 80, -80]);
	});

	it("stays put when the range is empty", () => {
		assert.deepEqual(shiftsWithin([120], [10, -10]), [0]);
	});
});
