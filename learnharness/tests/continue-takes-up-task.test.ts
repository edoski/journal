/**
 * Continue on a task takes the task up (round 13, 2 M1; round 11's 2 N2
 * back). "Continue Problem sheet 4" opened the sheet's 6 Nov chat, which
 * ends "Good place to stop", with an empty box and no turn; his "ok, let us
 * continue the sheet" was then planned as a lesson from the basics, and
 * part (c) was put off to next time. Round 12's 4df95020 (a session holds
 * only the tasks it patched) with the seed's fabd4d1 made Continue open
 * the sheet's own chat, where rounds 11 and 12 had started a new session
 * whose opening ran the turn. Continue on a session holding an open task,
 * with nothing in it waiting on him, now shows the task's step as it
 * opens, and the tutor takes it up with his first message (round 21, m7);
 * opening it to read asks for nothing.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { continueHref } from "../components/nav/session-state.ts";
import { courseMove } from "../components/study-home/study-facts.ts";
import { taskContinueAppends } from "../src/core/input-events.ts";
import { nativeInputCause, newUserMessage, sessionTasksOf, type LhMessage } from "../src/core/native-messages.ts";
import { closedTonight } from "../src/core/session-end.ts";
import { projectView } from "../src/core/view.ts";
import { courseRecordPrompt } from "../src/agent/prompt-segments.ts";
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
const said = (text: string): LhMessage => ({ id: `t${++n}`, role: "assistant", content: [{ type: "text", text }], ...STAMPS, stopReason: "stop", timestamp: n }) as unknown as LhMessage;

/** Sheet 4's 6 Nov session, as the seed holds it: it opened the task and stopped. */
const SHEET_SESSION: LhMessage[] = [newUserMessage("Help me start problem sheet 4."), ...saved({ tasks: { "sheet-4": { title: "Problem sheet 4: rank and nullity", step: "Part (c): show dim ker A = 2" } }, focus: "sheet-4" }), said("Good place to stop. Practice comes next, in a day or two.")];
const SHEET: CourseMapTask = { key: "sheet-4", title: "Problem sheet 4: rank and nullity", step: "Part (c): show dim ker A = 2", updated: "2026-11-06" };

describe("Continue on a task takes it up (2 M1)", () => {
	const sheet = chat({ id: "chat_demo_la_1106_1945", title: "Problem sheet 4", ownTopics: ["kernel"], topics: ["kernel"], createdAt: "2026-11-06T19:45:00.000Z", updatedAt: "2026-11-06T20:30:00.000Z", tasks: sessionTasksOf(SHEET_SESSION) });

	it("Home's Continue Problem sheet 4 goes to the sheet's chat asking for the task's step", () => {
		const course: StudyCourse = { map: map({ today: "2026-11-08", topics: [topic("kernel", "Kernel", { tasks: [SHEET.key] })], tasks: [SHEET], focus: SHEET.key }), unready: null, due: [], newToday: [], lastActiveDaysAgo: 0 };
		const move = courseMove(course, [sheet], { kind: "task", key: SHEET.key, title: SHEET.title, topics: ["kernel"] } as never);
		assert.equal(move.kind, "open");
		assert.equal(move.kind === "open" ? continueHref(move.chat) : "", "/chat/chat_demo_la_1106_1945?continue=task");
	});

	it("asks for nothing when the session waits on him, the tutor writes in it, or it holds no task", () => {
		assert.equal(continueHref({ ...sheet, pendingQuestion: true }), `/chat/${sheet.id}`);
		assert.equal(continueHref({ ...sheet, busy: true }), `/chat/${sheet.id}`);
		assert.equal(continueHref({ ...sheet, ended: "cut" }), `/chat/${sheet.id}`);
		assert.equal(continueHref({ ...sheet, tasks: [] }), `/chat/${sheet.id}`);
	});

	it("Continue shows the task's step and asks the tutor nothing until he writes, never his bubble", () => {
		const appends = taskContinueAppends({ messages: SHEET_SESSION }, { title: SHEET.title, step: SHEET.step });
		const marker = appends.at(-1)!;
		assert.equal(marker.role === "custom" ? marker.customType : marker.role, "task-continue");
		const words = marker.role === "custom" ? marker.content : "";
		assert.match(words, /`sheet-4`/);
		assert.match(words, /never a lesson on the topic from its basics/);
		const record = [...SHEET_SESSION, ...appends];
		assert.equal(nativeInputCause(marker as never, SHEET_SESSION as never), "neutral", "no turn of its own (round 21, m7)");
		assert.equal(closedTonight(record), closedTonight(SHEET_SESSION));
		const view = projectView(record).at(-1)!;
		assert.ok(view.role === "user" && view.parts.every((p) => p.type === "data-task-continue"), "a seam, never his bubble");
	});

	it("shows nothing with a question open or no task held", () => {
		const posed: LhMessage[] = [...SHEET_SESSION, { id: "q", role: "assistant", content: [{ type: "toolCall", id: "q1", name: "recall", arguments: { question: "What is dim ker A?", correctAnswer: "2" } }], ...STAMPS, timestamp: 99 } as unknown as LhMessage];
		const task = { title: SHEET.title, step: SHEET.step };
		assert.deepEqual(taskContinueAppends({ messages: posed }, task), []);
		assert.deepEqual(taskContinueAppends({ messages: [newUserMessage("Kernel")] }, task), []);
	});

	it("every agent reads that a task he goes on with is never a lesson from its basics", () => {
		for (const agent of ["prober", "teacher", "practice"] as const) assert.match(courseRecordPrompt(agent, { arcs: false }), /A task is his work, not a lesson/);
	});
});
