/**
 * A lesson left for today picks up at the question he left (round 10, 3 m1
 * and m2): Resume landed on the closed lesson, "Ask the tutor anything…"
 * and no question, and his half-typed answer, kept for that question, came
 * back only once the tutor asked it again, 55 s after he wrote anything.
 * The record now says which question Done for today left open while it is
 * his latest input; his next message rides a note that it answers that
 * question; the box says so (LESSON_WORDS.leftQuestionPlaceholder).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { inputAppends, tonightAppends } from "../src/core/input-events.ts";
import { questionLeftForToday } from "../src/core/session-end.ts";
import { newUserMessage, type LhMessage } from "../src/core/native-messages.ts";
import { LESSON_WORDS } from "../components/study-words.ts";

const QUESTION = "Find the inverse of $A = \\begin{pmatrix} 4 & 2 \\\\ 3 & 2 \\end{pmatrix}$.";
const asked: LhMessage = { ...fauxAssistantMessage(""), id: "a1", stopReason: "toolUse", content: [{ type: "toolCall", id: "q1", name: "explain", arguments: { question: QUESTION, correctAnswer: "1/2 (2 -2; -3 4)", type: "check", nodeId: "inverse-2x2" } }] } as LhMessage;

/** As the server writes it: the turn's course brief rides just before the
 *  Done marker. */
function leftForToday(): LhMessage[] {
	const lesson = [newUserMessage("Invertible matrices"), asked];
	const appends = tonightAppends({ messages: lesson });
	const brief = { id: "b1", role: "custom", customType: "course-context", content: "[Course record] Linear Algebra", display: false, details: {}, timestamp: 1 } as LhMessage;
	return [...lesson, ...appends.slice(0, -1), brief, ...appends.slice(-1)];
}

describe("a lesson left for today with a question open", () => {
	it("knows the question, while Done for today is his latest input", () => {
		assert.deepEqual(questionLeftForToday(leftForToday()), { question: QUESTION, toolCallId: "q1" });
		const close: LhMessage = { ...fauxAssistantMessage("See you tomorrow."), id: "a2" } as LhMessage;
		assert.deepEqual(questionLeftForToday([...leftForToday(), close]), { question: QUESTION, toolCallId: "q1" }, "the tutor's close changes nothing");
		assert.equal(questionLeftForToday([...leftForToday(), newUserMessage("det = 2")]), null, "once he writes, it is picked up");
		assert.equal(questionLeftForToday([newUserMessage("Invertible matrices"), ...tonightAppends({ messages: [newUserMessage("Invertible matrices")] })]), null, "no question open, nothing left");
	});

	it("rides his next message with the note that it answers that question", () => {
		const appends = inputAppends({ messages: leftForToday() }, { type: "text", text: "det = 8 - 6 = 2, so A^{-1} = 1/2 (2 -2; -3 4)" });
		const note = appends.find((m) => m.role === "custom" && m.customType === "left-question") as { content: string } | undefined;
		assert.ok(note, "the note rides his message");
		assert.match(note.content, /If his message answers it, it is his answer: grade it and save it as his attempt naming "his-message"/);
		assert.ok(note.content.includes(QUESTION));
		assert.equal(appends.at(-1)?.role, "user", "his message comes last, the turn's input");
		const later = inputAppends({ messages: [...leftForToday(), newUserMessage("det = 2")] }, { type: "text", text: "and then?" });
		assert.ok(!later.some((m) => m.role === "custom" && m.customType === "left-question"), "only the first message after it");
	});

	it("puts the question in the box's words", () => {
		assert.equal(LESSON_WORDS.leftQuestionPlaceholder, "Your answer to the question above, or ask anything");
	});
});
