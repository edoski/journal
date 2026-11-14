import { test } from "node:test";
import assert from "node:assert/strict";
import { needsContinuation, type LhMessage } from "../src/core/native-messages.ts";
import { replyNeverCame } from "../src/core/turn-cut.ts";

const ask = { id: "a1", role: "assistant", content: [{ type: "toolCall", id: "q1", name: "explain", arguments: { question: "Which directions stay on their line?", correctAnswer: "(1,1) and (1,-1)" } }], stopReason: "toolUse", timestamp: 1 } as unknown as LhMessage;
const answer = { id: "r1", role: "toolResult", toolCallId: "q1", toolName: "explain", isError: false, timestamp: 2,
	content: [{ type: "text", text: "{\"kind\":\"explain\"}" }],
	details: { kind: "explain", questionText: "Which directions stay on their line?", answers: [], text: "(1,1) by 3", answeredAt: "2026-11-08T10:00:00Z" } } as unknown as LhMessage;
const courseNote = { id: "c1", role: "custom", customType: "course-context", content: "[Course record] Linear Algebra", display: false, timestamp: 3 } as unknown as LhMessage;
const message = { id: "u1", role: "user", content: "Why does the determinant vanish?", timestamp: 4 } as unknown as LhMessage;
const thinking = { id: "t1", role: "custom", customType: "practice-thinking", content: "rank 2", display: true, timestamp: 4 } as unknown as LhMessage;
const reply = { id: "a2", role: "assistant", content: [{ type: "text", text: "Because A − λI has a kernel." }], stopReason: "stop", timestamp: 5 } as unknown as LhMessage;
const stoppedEmpty = { id: "a3", role: "assistant", content: [{ type: "thinking", thinking: "…" }], stopReason: "aborted", timestamp: 5 } as unknown as LhMessage;

test("a turn the restart cut right after his answer is owed, past the course note written after it", () => {
	// Round 2: the record ended answer, course note; the reload never resumed it.
	assert.equal(needsContinuation([ask, answer, courseNote]), true);
	assert.equal(needsContinuation([ask, answer, courseNote, reply]), false);
});

test("his message or dock card with no reply after it says the reply never came", () => {
	assert.equal(replyNeverCame([reply, courseNote, message]), true);
	assert.equal(replyNeverCame([reply, courseNote, thinking]), true);
	assert.equal(replyNeverCame([reply, message, courseNote]), true);
});

test("a reply stopped before its first word says so too", () => {
	assert.equal(replyNeverCame([reply, message, stoppedEmpty]), true);
});

test("a reply, or an answer the continuation resumes, is not a cut reply", () => {
	assert.equal(replyNeverCame([message, reply]), false);
	assert.equal(replyNeverCame([ask, answer, courseNote]), false);
	assert.equal(replyNeverCame([]), false);
});
