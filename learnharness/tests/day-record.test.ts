/**
 * Home acknowledging a day of study (today.md, "A day of study"): what he
 * finished today from the session records, the heading's question, and the
 * words that name what he did without counting it.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ChatListItem } from "../src/core/index.ts";
import { dayQuestion, doneToday, doneWords } from "../components/study-home/day-record.ts";

function chat(over: Partial<ChatListItem>): ChatListItem {
	return {
		id: "c",
		title: "Lesson",
		createdAt: "2026-11-08T08:00:00",
		updatedAt: "2026-11-08T09:00:00",
		kind: "teach",
		messageCount: 6,
		phase: "teach",
		pendingQuestion: false,
		pendingProblem: false,
		ended: "closed",
		busy: false,
		compacting: false,
		...over,
	} as ChatListItem;
}

const NOW = new Date("2026-11-08T15:00:00");

describe("what he finished today", () => {
	it("names each session the tutor closed today, oldest first", () => {
		const chats = [
			chat({ id: "b", title: "Rank practice", kind: "practice", updatedAt: "2026-11-08T11:00:00" }),
			chat({ id: "a", title: "Eigenvalues and eigenvectors", updatedAt: "2026-11-08T09:30:00" }),
		];
		assert.deepEqual(doneToday(chats, NOW), ["Eigenvalues and eigenvectors", "Rank practice"]);
	});

	it("leaves out a session closed before today's midnight, one still waiting on him, one stopped mid-reply, the tutor writing, and an empty one", () => {
		const chats = [
			chat({ title: "Yesterday", updatedAt: "2026-11-07T23:59:00" }),
			chat({ title: "Waiting", pendingQuestion: true, ended: "mid-lesson" }),
			chat({ title: "Problem posed", kind: "practice", pendingProblem: true }),
			chat({ title: "Stopped", ended: "cut" }),
			chat({ title: "Writing", busy: true }),
			chat({ title: "Empty", messageCount: 0 }),
		];
		assert.deepEqual(doneToday(chats, NOW), []);
	});

	it("starts afresh after midnight", () => {
		const chats = [chat({ title: "Late", updatedAt: "2026-11-08T23:30:00" })];
		assert.deepEqual(doneToday(chats, new Date("2026-11-08T23:45:00")), ["Late"]);
		assert.deepEqual(doneToday(chats, new Date("2026-11-09T00:05:00")), []);
	});
});

describe("Home's heading and its done line", () => {
	it("asks for the part of his day, and what else once he has studied, never tonight", () => {
		assert.deepEqual(
			[4, 5, 11, 12, 17, 18, 21, 22].map((hour) => dayQuestion(hour, false)),
			[
				"What are we studying today?",
				"What are we studying this morning?",
				"What are we studying this morning?",
				"What are we studying this afternoon?",
				"What are we studying this afternoon?",
				"What are we studying this evening?",
				"What are we studying this evening?",
				"What are we studying today?",
			],
		);
		assert.equal(dayQuestion(10, true), "What else are we studying this morning?");
	});

	it("names what he did and never counts it", () => {
		assert.equal(doneWords([]), null);
		assert.equal(doneWords(["Eigenvalues and eigenvectors", "Rank practice"]), "Done today: Eigenvalues and eigenvectors, Rank practice");
		assert.doesNotMatch(doneWords(["A", "B", "C"])!, /\d|two|three|lessons/i);
	});
});
