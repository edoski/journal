/**
 * One lesson, one chat (round 11, 1 N5): on 8 Nov the Eigen topic page's
 * Continue started a new chat for the lesson's task, and on 17 Nov Home's
 * "Continue Eigenvalues lesson" reopened the first chat at a question he
 * had already answered in the second. Continue on a task opens the task's
 * latest chat from every surface: Home's line, its press and the topic
 * page's action.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { courseMove, openSessions, todayRows } from "../components/study-home/study-facts.ts";
import { topicAction } from "../components/unit-inbox/topic-page/topic-facts.ts";
import type { CourseMapTask, StudyCourse } from "../src/core/index.ts";
import { chat, map, topic } from "./fixtures/round8-home.ts";

const TASK: CourseMapTask = { key: "eigen-lesson", title: "Eigenvalues lesson: eigenvectors step", step: "Finish the eigenvectors step", updated: "2026-11-08" };
const EIGEN = topic("eigen", "Eigenvalues and eigenvectors", { level: "assisted", tasks: [TASK.key], review: { kind: "scheduled", date: "2026-11-23" } });
const course = (today: string): StudyCourse => ({
	map: map({ today, topics: [EIGEN], tasks: [TASK], focus: TASK.key }),
	unready: null,
	due: [],
	newToday: [],
	lastActiveDaysAgo: 0,
});

/** What a surface's press opens: a session, or a new one. */
const opened = (move: { kind: "open"; chat: { id: string } } | { kind: string }) => ("chat" in move ? move.chat.id : "new chat");

describe("one lesson, one chat (1 N5)", () => {
	it("the topic page resumes the lesson left with Done for today, even when the seed dated its start later than his clock", () => {
		// The seeded lesson began at 08:05; the evaluator's study clock read 00:22 when he pressed Done for today.
		const lesson = chat({ id: "chat_demo_eigen", createdAt: "2026-11-08T08:05:00.000Z", updatedAt: "2026-11-08T00:22:00.000Z", ended: "left", tasks: [TASK.key] });
		const action = topicAction(EIGEN, course("2026-11-08").map, [lesson]);
		assert.equal("chat" in action ? action.chat.id : "new chat", "chat_demo_eigen");
	});

	it("Home's line and the topic page open the task's newest chat, never an older one left on it", () => {
		const first = chat({ id: "chat_demo_eigen", createdAt: "2026-11-08T08:05:00.000Z", updatedAt: "2026-11-08T10:22:00.000Z", ended: "left", tasks: [TASK.key] });
		const second = chat({ id: "chat_second", title: TASK.title, createdAt: "2026-11-08T10:25:00.000Z", updatedAt: "2026-11-08T10:40:00.000Z", ended: "closed", tasks: [TASK.key] });
		const chats = [second, first];
		const la = course("2026-11-17");
		const page = topicAction(EIGEN, la.map, chats);
		assert.equal("chat" in page ? page.chat.id : "new chat", "chat_second", "the topic page");
		const rows = todayRows([la], openSessions(chats), "2026-11-17");
		assert.equal(rows.length, 1, `one line for the lesson: ${JSON.stringify(rows.map((r) => (r.kind === "session" ? r.chat.id : r.kind)))}`);
		const [row] = rows;
		const home = row!.kind === "session" ? row!.chat.id : opened(courseMove(la, chats, row!.step));
		assert.equal(home, "chat_second", "Home's line");
	});
});
