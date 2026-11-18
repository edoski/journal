/**
 * One piece of work, one name (round 10, 1 m5, shots 33, 40, 41, 52, 55):
 * "Continue Eigenvalues and eigenvectors lesson" on the morning's row
 * became "Eigenvalues and eigenvectors" once the lesson left on that task
 * took the row; "Also today: Continuity" had no verb; and Eigen's Next
 * listed the lesson and its task, "Eigenvalues and eigenvectors" beside
 * "Eigenvalues and eigenvectors lesson".
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { lessonTitle } from "../components/study-home/agenda-rows/row-facts.ts";
import { needsYouNow } from "../components/study-home/needs-you.ts";
import { openSessions, todayRows, type TodayRow } from "../components/study-home/study-facts.ts";
import { topicFacts } from "../components/unit-inbox/topic-page/topic-facts.ts";
import { nextItems, nowItem } from "../components/unit-inbox/topic-page/pickup/pickup-facts.ts";
import type { StudyCourse, TopicHandle } from "../src/core/index.ts";
import { chat, map, topic } from "./fixtures/round8-home.ts";

const TODAY = "2026-11-09";
const TASK = { key: "eigen-lesson", title: "Eigenvalues and eigenvectors lesson", step: "The 2×2 computation", updated: "2026-11-08", topics: ["eigen" as TopicHandle] };
const course: StudyCourse = {
	map: map({ today: TODAY, tasks: [TASK], focus: TASK.key, topics: [topic("eigen", "Eigenvalues and eigenvectors", { tasks: [TASK.key] }), topic("continuity", "Continuity")] }),
	unready: null,
	due: [],
	newToday: [],
	lastActiveDaysAgo: 1,
};
/** The Eigen lesson, left for next time yesterday, holding its task. */
const lesson = chat({ id: "lesson", ended: "left", tasks: [TASK.key], updatedAt: "2026-11-08T10:00:00.000Z" });
const label = (row: TodayRow) => lessonTitle(row);

describe("a lesson left for next time keeps its one name, its status saying it was left (round 15, m5)", () => {
	it("reads its task's title, as its sidebar card and its chat do; the course's own step for the task reads Continue", () => {
		const morning = todayRows([course], [], TODAY);
		assert.deepEqual(morning.map(label), ["Continue Eigenvalues and eigenvectors lesson"], "the task's own line, when no session holds it, is a step");
		const rows = todayRows([course], openSessions([lesson]), TODAY);
		assert.equal(rows[0]?.kind, "session", "the lesson takes the task's row");
		assert.deepEqual(rows.map(label), ["Continue Eigenvalues and eigenvectors lesson"], "the session's one name after its verb (round 16, m4)");
		assert.deepEqual(needsYouNow([course], [lesson], TODAY).lines.map((l) => l.title), ["Continue Eigenvalues and eigenvectors lesson"], "the sidebar's card the same");
	});

	it("reads its own title when it holds no task", () => {
		const continuity = chat({ id: "cont", title: "Continuity", ended: "left", topics: ["continuity"], ownTopics: ["continuity"], updatedAt: "2026-11-07T10:00:00.000Z" });
		const rows = todayRows([{ ...course, map: { ...course.map, tasks: [], focus: null } }], openSessions([continuity]), TODAY);
		assert.ok(rows.map(label).includes("Continue Continuity"), rows.map(label).join(" | "));
	});

	it("never doubles the verb of a task titled with it", () => {
		const titled = { ...TASK, title: "Continue Eigenvalues: the full 2×2 computation" };
		const c = { ...course, map: { ...course.map, tasks: [titled] } };
		assert.deepEqual(todayRows([c], [], TODAY).map(label), ["Continue Eigenvalues: the full 2×2 computation"]);
		assert.deepEqual(todayRows([c], openSessions([lesson]), TODAY).map(label), ["Continue Eigenvalues: the full 2×2 computation"]);
	});
});

describe("the topic page's Next lists a lesson once (round 10, 1 m5)", () => {
	it("leaves out a task a listed session holds", () => {
		const waiting = chat({ id: "waiting", title: "Eigen check-in", pendingQuestion: true, updatedAt: "2026-11-09T08:00:00.000Z" });
		const facts = topicFacts({ course, topic: course.map.topics[0]!, chats: [waiting, lesson], read: null });
		const next = nextItems(facts, nowItem(facts));
		assert.deepEqual(
			next.map((item) => (item.kind === "session" ? `session ${item.entry.chat.id}` : item.kind === "task" ? `task ${item.key}` : item.kind)),
			["session lesson"],
			"the lesson, never its task beside it",
		);
	});
});
