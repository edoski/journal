/**
 * Round 15, m5 (1 n8, 3 free, 4 free; round-14 m29's remainder): one
 * session, several names. "Problem sheet 4" in Sessions and on the
 * calendar against "Problem sheet 4: rank and nullity" on Home; "Linear
 * maps and their matrices lesson · Your turn" on its card against
 * "Continue Linear maps and their matrices lesson" on Home; "Invertible
 * matrices lesson" on the live card against "Invertible matrices" in
 * Sessions, on Home and in the chat's head. Each session now has one title,
 * taken from its task, on every surface: the session list and the chat's
 * page read it from one function, and a line's status, not its title, says
 * the session was left.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sessionTitleOf } from "../src/core/session-naming.ts";
import { newUserMessage, type LhMessage } from "../src/core/native-messages.ts";
import { lessonTitle } from "../components/study-home/agenda-rows/row-facts.ts";
import type { StudyCourse } from "../src/core/index.ts";
import { chat, LINALG } from "./fixtures/now-demo.ts";

const USAGE = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
const save = (id: string, changes: unknown): LhMessage[] => [
	{ id: `a_${id}`, role: "assistant", content: [{ type: "toolCall", id, name: "course_save", arguments: { changes } }], api: "faux", provider: "test", model: "test", usage: USAGE, stopReason: "toolUse", timestamp: 1 } as unknown as LhMessage,
	{ id: `r_${id}`, role: "toolResult", toolCallId: id, toolName: "course_save", content: [{ type: "text", text: "{}" }], details: {}, isError: false, timestamp: 2 } as unknown as LhMessage,
];

describe("one session, one name (round 15, m5)", () => {
	// Lens 3: the lesson started from Invertible's page, created as "Invertible matrices", whose save opened its task.
	const messages = [newUserMessage("Invertible matrices"), ...save("s1", { tasks: { "invertible-lesson": { title: "Invertible matrices lesson", topics: ["invertibility"] } } })];

	it("is the title its saves gave the task it took up, kept once the task closes", () => {
		assert.equal(sessionTitleOf({ title: "Invertible matrices", messages }), "Invertible matrices lesson");
		assert.equal(sessionTitleOf({ title: "Invertible matrices", messages: [...messages, ...save("s2", { tasks: { "invertible-lesson": null } })] }), "Invertible matrices lesson");
	});

	it("is its own name with no task, and the name he gave it whatever its task", () => {
		assert.equal(sessionTitleOf({ title: "Rank practice", messages: [newUserMessage("Practice rank")] }), "Rank practice");
		assert.equal(sessionTitleOf({ title: "My matrices", renamed: true, messages }), "My matrices");
	});

	it("is the same on Home's line whatever its state: its status says it was left", () => {
		const course = LINALG as StudyCourse;
		const lesson = (ended: "left" | "mid-lesson") => chat("lm", { title: "Linear maps and their matrices lesson", ended, pendingQuestion: ended === "mid-lesson", course: { workspace: course.map.workspace, title: course.map.title } });
		assert.equal(lessonTitle({ kind: "session", chat: lesson("left"), course }), lessonTitle({ kind: "session", chat: lesson("mid-lesson"), course }));
		assert.equal(lessonTitle({ kind: "session", chat: lesson("left"), course }), "Linear maps and their matrices lesson");
	});
});
