/**
 * A session holds only the tasks it saved (round 12, 1 D1). On 8 Nov the
 * Eigen lesson's Done for today closed its task and, in the same save,
 * moved the course's focus back to Problem sheet 4. The focus counted as
 * the lesson holding the sheet, so "Continue Problem sheet 4" on Home and
 * in the sidebar opened the Eigen lesson's chat, and "Studied today" named
 * the Eigen lesson "Problem sheet 4". The focus is the course's pointer,
 * never evidence of what a session worked on.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { doneToday } from "../components/study-home/day-record.ts";
import { courseMove } from "../components/study-home/study-facts.ts";
import { sessionTasksOf, type LhMessage } from "../src/core/native-messages.ts";
import type { CourseMapTask, StudyCourse } from "../src/core/index.ts";
import { chat, map, topic } from "./fixtures/round8-home.ts";

const USAGE = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
let n = 0;
/** A course_save that went through, with these changes. */
function saved(changes: unknown): LhMessage[] {
	const id = `save${++n}`;
	return [
		{ id: `a${n}`, role: "assistant", content: [{ type: "toolCall", id, name: "course_save", arguments: { changes } }], api: "faux", provider: "test", model: "test", usage: USAGE, stopReason: "toolUse", timestamp: n } as unknown as LhMessage,
		{ id: `r${n}`, role: "toolResult", toolCallId: id, toolName: "course_save", content: [{ type: "text", text: "{}" }], details: null, isError: false, timestamp: n } as unknown as LhMessage,
	];
}

const EIGEN_TASK = { title: "Eigenvalues and eigenvectors lesson", topics: ["eigen"], step: "Find the eigenspace $E_5$" };
/** The Eigen lesson's saves on 8 Nov, as the round-12 record holds them. */
const eigenLesson = [...saved({ observations: [] }), ...saved({ tasks: { "eigen-lesson": EIGEN_TASK }, focus: "eigen-lesson" }), ...saved({ tasks: { "eigen-lesson": null }, focus: "sheet-4" })];
/** Sheet 4's session on 6 Nov: it opened the task. */
const sheetSession = saved({ tasks: { "sheet-4": { title: "Problem sheet 4: rank and nullity", step: "Part (c)" } }, focus: "sheet-4" });

const SHEET: CourseMapTask = { key: "sheet-4", title: "Problem sheet 4: rank and nullity", step: "Part (c): show dim ker A = 2", updated: "2026-11-06" };

describe("a session holds only the tasks it saved (1 D1)", () => {
	it("a save that closes the lesson's task and moves the focus leaves the lesson holding nothing", () => {
		assert.deepEqual(sessionTasksOf(eigenLesson), []);
		assert.deepEqual(sessionTasksOf(sheetSession), ["sheet-4"]);
	});

	it("a focus alone, with no task patch, holds no task", () => {
		assert.deepEqual(sessionTasksOf(saved({ focus: "sheet-4" })), []);
	});

	it("Continue Problem sheet 4 opens the sheet's chat, and Studied today names the Eigen lesson by its own title", () => {
		const eigen = chat({ id: "chat_demo_eigen", title: "Eigenvalues and eigenvectors", ended: "closed", studied: true, updatedAt: "2026-11-08T10:22:00.000Z", tasks: sessionTasksOf(eigenLesson) });
		const sheet = chat({ id: "chat_demo_la_1106_1945", title: "Problem sheet 4", ownTopics: ["kernel"], ended: "left", studied: true, createdAt: "2026-11-06T19:45:00.000Z", updatedAt: "2026-11-06T20:30:00.000Z", tasks: sessionTasksOf(sheetSession) });
		const course: StudyCourse = { map: map({ today: "2026-11-08", topics: [topic("eigen", "Eigenvalues and eigenvectors"), topic("kernel", "Kernel", { tasks: [SHEET.key] })], tasks: [SHEET], focus: SHEET.key }), unready: null, due: [], newToday: [], lastActiveDaysAgo: 0 };
		const move = courseMove(course, [eigen, sheet], { kind: "task", key: SHEET.key, title: SHEET.title, topics: ["kernel"] } as never);
		assert.equal(move.kind === "open" ? move.chat.id : "new chat", "chat_demo_la_1106_1945");
		assert.deepEqual(doneToday([eigen, sheet], new Date("2026-11-08T12:00:00"), [course]), ["Eigenvalues and eigenvectors"]);
	});
});
