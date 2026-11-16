/**
 * "Studied today" names a session one way all day (round 13, 1 n9): after
 * the first Done it read "Eigenvalues and eigenvectors lesson", the title
 * of the lesson's task; once the close ended that task it read
 * "Eigenvalues and eigenvectors", the chat's title. A session is named by
 * the title it gave its task, kept after the task closes.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sessionTaskTitleOf, sessionTasksOf, type LhMessage } from "../src/core/native-messages.ts";
import { doneToday } from "../components/study-home/day-record.ts";
import type { CourseMapTask, StudyCourse } from "../src/core/index.ts";
import { chat, map, topic } from "./fixtures/round8-home.ts";

const STAMPS = { api: "faux", provider: "test", model: "test", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, stopReason: "toolUse" } as const;
let n = 0;
function saved(changes: unknown): LhMessage[] {
	const id = `save${++n}`;
	return [
		{ id: `a${n}`, role: "assistant", content: [{ type: "toolCall", id, name: "course_save", arguments: { changes } }], ...STAMPS, timestamp: n } as unknown as LhMessage,
		{ id: `r${n}`, role: "toolResult", toolCallId: id, toolName: "course_save", content: [{ type: "text", text: "{}" }], details: null, isError: false, timestamp: n } as unknown as LhMessage,
	];
}

const TASK: CourseMapTask = { key: "eigen-lesson", title: "Eigenvalues and eigenvectors lesson", step: "Find the eigenspace", updated: "2026-11-08" };
const opened = saved({ tasks: { "eigen-lesson": { title: TASK.title, topics: ["eigen"], step: TASK.step } }, focus: "eigen-lesson" });
const closed = [...opened, ...saved({ tasks: { "eigen-lesson": null }, focus: "sheet-4" })];
const course = (tasks: CourseMapTask[]): StudyCourse => ({ map: map({ today: "2026-11-08", topics: [topic("eigen", "Eigenvalues and eigenvectors")], tasks }), unready: null, due: [], newToday: [], lastActiveDaysAgo: 0 });
const NOW = new Date("2026-11-08T12:00:00");
const lesson = (messages: LhMessage[]) => chat({ id: "chat_demo_eigen", studied: true, updatedAt: "2026-11-08T10:22:00.000Z", tasks: sessionTasksOf(messages), ...((t) => (t ? { taskTitle: t } : {}))(sessionTaskTitleOf(messages)) });

describe("Studied today names a session one way all day (1 n9)", () => {
	it("reads the lesson's task title while the task is open and after it closed", () => {
		assert.deepEqual(doneToday([lesson(opened)], NOW, [course([TASK])]), ["Eigenvalues and eigenvectors lesson"]);
		assert.equal(sessionTaskTitleOf(closed), TASK.title, "kept once the task closes");
		assert.deepEqual(doneToday([lesson(closed)], NOW, [course([])]), ["Eigenvalues and eigenvectors lesson"]);
	});
});
