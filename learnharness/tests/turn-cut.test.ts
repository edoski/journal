import { test } from "node:test";
import assert from "node:assert/strict";
import { needsContinuation, type LhMessage } from "../src/core/native-messages.ts";
import { replyCutOf, replyNeverCame, stoppedReplyIds } from "../src/core/turn-cut.ts";

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

test("a compaction run in his pause, between the question and his answer, still leaves the reply owed", () => {
	// Round 6: the compaction marker landed after the question call; the app
	// restarted after his answer, and the lesson read finished, with no
	// reply and no Try again. The session keeps its own summary, so the
	// record's marker is nothing the tutor reads.
	const compacted = { id: "k1", role: "custom", customType: "compaction", content: "[Compacted history]", display: true, details: { firstKeptMessageId: "", tokensBefore: 43507, at: "2026-11-08T10:00:00Z" }, timestamp: 2 } as unknown as LhMessage;
	assert.equal(needsContinuation([ask, compacted, answer, courseNote]), true);
	assert.equal(needsContinuation([ask, compacted, answer, courseNote, reply]), false);
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

test("a reply he stopped reads as his stop, a reply the app lost as the tutor's", () => {
	// Round 3: his own stop read "The tutor stopped before replying."
	assert.equal(replyCutOf([reply, message, stoppedEmpty]), "stopped");
	assert.equal(replyCutOf([reply, courseNote, message]), "lost");
	assert.equal(replyCutOf([message, reply]), null);
});

test("a reply stopped while its first tool call was still empty is a stop before its first word", () => {
	// Round 4: the stop landed as send_to_user began, with no arguments yet;
	// the sidebar said Stopped mid-reply and the lesson offered no Try again.
	const cutCall = { id: "a4", role: "assistant", content: [{ type: "toolCall", id: "c1", name: "send_to_user", arguments: {} }], stopReason: "aborted", timestamp: 6 } as unknown as LhMessage;
	assert.equal(replyCutOf([ask, answer, cutCall]), "stopped");
	assert.deepEqual([...stoppedReplyIds([ask, answer, cutCall])], ["a4"]);
	const shownCall = { ...cutCall, content: [{ type: "toolCall", id: "c1", name: "send_to_user", arguments: { text: "Half a sen" } }] } as unknown as LhMessage;
	assert.equal(replyCutOf([ask, answer, shownCall]), null, "a call that had begun to show something is a reply");
});

test("a stop after the tutor had already written to him reads as a stop mid-reply, not before it", () => {
	// Round 7 (robustness minor 5): "You stopped the tutor before it
	// replied." stood under a full paragraph he could read.
	const said = { id: "a5", role: "assistant", content: [{ type: "toolCall", id: "s1", name: "send_to_user", arguments: { text: "The trace is the sum of the eigenvalues, so…" } }], stopReason: "toolUse", timestamp: 6 } as unknown as LhMessage;
	const shown = { id: "r5", role: "toolResult", toolCallId: "s1", toolName: "send_to_user", isError: false, timestamp: 7, content: [{ type: "text", text: "Message received for display." }] } as unknown as LhMessage;
	assert.equal(replyCutOf([reply, message, said, shown, stoppedEmpty]), "stopped-mid");
	assert.equal(replyCutOf([reply, message, stoppedEmpty]), "stopped", "nothing written since his message: before it replied");
	assert.deepEqual([...stoppedReplyIds([reply, message, said, shown, stoppedEmpty])], ["a3"], "Try again resumes past the empty stop");
});

test("a stop after the tutor only saved progress, or wrote plain text the voice guard took out, is a stop before it replied", () => {
	// Round 7, on top of the voice guard: plain text no longer shows, and a
	// save shows nothing, so neither is a reply he read.
	const saved = { id: "a6", role: "assistant", content: [{ type: "toolCall", id: "p1", name: "lesson_progress", arguments: { step: "maps", status: "done" } }], stopReason: "toolUse", timestamp: 6 } as unknown as LhMessage;
	const ack = { id: "r6", role: "toolResult", toolCallId: "p1", toolName: "lesson_progress", isError: false, timestamp: 7, content: [{ type: "text", text: "ok" }] } as unknown as LhMessage;
	const guarded = { id: "a7", role: "assistant", content: [{ type: "text", text: "" }], stopReason: "stop", timestamp: 8 } as unknown as LhMessage;
	assert.equal(replyCutOf([reply, message, saved, ack, stoppedEmpty]), "stopped");
	assert.equal(replyCutOf([reply, message, saved, ack, guarded, stoppedEmpty]), "stopped");
});
