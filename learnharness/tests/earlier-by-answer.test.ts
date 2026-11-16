/**
 * Earlier orders by the answers, never by when a chat was last touched
 * (round 12, 1 m12 and 2 n4). On 17 Nov an Ask in the 8 Nov Eigen lesson's
 * chat put the whole lesson, its answers included, under "Today" above the
 * 9 Nov review, whose answers fell under Show the rest; and a partly right
 * row showed its icon with no words.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ChatListItem, TopicAttempt } from "../src/core/index.ts";
import { trailDays } from "../components/unit-inbox/topic-page/trail/trail-facts.ts";
import { attemptMark, type SessionEntry } from "../components/unit-inbox/topic-page/topic-facts.ts";

const entry = (id: string, updatedAt: string): SessionEntry => ({
	chat: { id, title: id, kind: "teach", createdAt: updatedAt, updatedAt, messageCount: 4, phase: "teach", pendingQuestion: false, pendingProblem: false, busy: false } as ChatListItem,
	own: true,
	state: "finished",
	day: updatedAt.slice(0, 10),
	when: updatedAt.slice(0, 10),
	plan: null,
});
const attempt = (id: string, date: string, session: string, over: Partial<TopicAttempt> = {}): TopicAttempt => ({
	id,
	date,
	recorded: `${date}T09:00:00.000Z`,
	result: "correct",
	unaided: true,
	grade: null,
	gaveUp: false,
	predicted: false,
	sure: null,
	chose: null,
	text: `Answer ${id}`,
	session,
	uncertain: false,
	...over,
});

describe("Earlier by the answers (1 m12, 2 n4)", () => {
	it("puts a session on the day of its newest answer, and orders the days by it", () => {
		const lesson = entry("chat_demo_eigen", "2026-11-17T09:30:00.000Z"); // the Ask on 17 Nov
		const review = entry("chat_review", "2026-11-09T10:00:00.000Z");
		const days = trailDays([lesson, review], [attempt("o40", "2026-11-08", "chat_demo_eigen"), attempt("o50", "2026-11-09", "chat_review")], "2026-11-17");
		assert.deepEqual(
			days.map((d) => [d.day, d.rows.map((r) => (r.kind === "session" ? r.entry.chat.id : r.attempt.id))]),
			[
				["2026-11-09", ["chat_review", "o50"]],
				["2026-11-08", ["chat_demo_eigen", "o40"]],
			],
		);
	});

	it("gives a partly right or not right answer its word, and leaves a right one on his own silent", () => {
		const titleOf = (h: string) => h;
		assert.deepEqual(attemptMark(attempt("o1", "2026-11-08", "c", { result: "partial" }), titleOf), { result: "partly", words: "Partly right" });
		assert.deepEqual(attemptMark(attempt("o2", "2026-11-08", "c", { result: "incorrect" }), titleOf), { result: "wrong", words: "Not right" });
		assert.deepEqual(attemptMark(attempt("o3", "2026-11-08", "c"), titleOf), { result: "right", words: null });
	});
});
