/**
 * A Mistakes row takes up the lesson that waits on its topic (round 10,
 * 2 m1, shot 44b): with the Eigen lesson closed with Done for today and
 * its task "Continue Eigenvalues: the full 2×2 computation" waiting, the
 * Eigen row in Linear Algebra's Mistakes opened a new session with a fresh
 * problem, and the calendar then showed two Eigen sessions. The row's
 * press is the topic page's own action (`topicAction`).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mistakeRows } from "../components/course-page/standing/standing-model.ts";
import type { CourseStanding } from "../src/core/contracts/course-standing.ts";
import type { StudyCourse, TopicHandle } from "../src/core/index.ts";
import { chat, map, topic } from "./fixtures/round8-home.ts";

const TODAY = "2026-11-09";
const TASK = { key: "eigen-2x2", title: "Continue Eigenvalues: the full 2×2 computation", step: "Part (b)", updated: "2026-11-08", topics: ["eigen" as TopicHandle] };
const course: StudyCourse = {
	map: map({ today: TODAY, tasks: [TASK], focus: TASK.key, topics: [topic("eigen", "Eigenvalues and eigenvectors", { tasks: [TASK.key], signals: { gap: "Sign slip", lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false, mistake: true } })] }),
	unready: null,
	due: [],
	newToday: [],
	lastActiveDaysAgo: 1,
};
const STANDING: CourseStanding = {
	readiness: null,
	mistakes: [{ topic: "eigen" as TopicHandle, gap: "Sign slip in the characteristic polynomial", latest: "2026-11-08", answers: [] }],
};

describe("a Mistakes row (round 10, 2 m1)", () => {
	it("continues the open task in the lesson that holds it, closed or not, never a fresh session on the topic", () => {
		const closed = chat({ id: "lesson", ended: "closed", tasks: [TASK.key], createdAt: "2026-11-08T08:00:00.000Z", updatedAt: "2026-11-08T10:00:00.000Z" });
		const [row] = mistakeRows(STANDING, course, [closed]);
		assert.equal(row?.resume?.id, "lesson", "Continue reopens the lesson, as the topic page's does");
	});

	it("continues the open task as the topic page does when no session holds it", () => {
		const [row] = mistakeRows(STANDING, course, []);
		assert.equal(row?.resume, null);
		assert.deepEqual(row?.creation, { title: TASK.title, course: { workspace: course.map.workspace }, topics: ["eigen"] }, "never \"Continue Continue …\"");
	});

	it("opens the lesson left for next time that holds the task", () => {
		const left = chat({ id: "lesson", ended: "left", tasks: [TASK.key], createdAt: "2026-11-08T08:00:00.000Z", updatedAt: "2026-11-08T10:00:00.000Z" });
		const [row] = mistakeRows(STANDING, course, [left]);
		assert.equal(row?.resume?.id, "lesson");
	});

	it("starts the topic page's session on the topic when nothing waits on it", () => {
		const bare: StudyCourse = { ...course, map: { ...course.map, tasks: [], focus: null, topics: course.map.topics.map((t) => ({ ...t, tasks: [] })) } };
		const [row] = mistakeRows(STANDING, bare, []);
		assert.equal(row?.resume, null);
		assert.equal(row?.creation.title, "Continue Eigenvalues and eigenvectors", "a topic still being learned, as its page's Continue");
		assert.deepEqual(row?.creation.topics, ["eigen"]);
	});
});
