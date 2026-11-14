/**
 * A session's one state (components/nav/session-state.ts), which every
 * sidebar row, Home and the topic page read.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sessionState } from "../components/nav/session-state.ts";
import type { ChatListItem } from "../src/core/index.ts";

function item(overrides: Partial<ChatListItem>): ChatListItem {
	return {
		id: "c1",
		title: "Test session",
		kind: "teach",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-02T00:00:00.000Z",
		messageCount: 4,
		phase: "teach",
		pendingQuestion: false,
		pendingProblem: false,
		busy: false,
		compacting: false,
		...overrides,
	};
}

describe("sessionState", () => {
	it("a question and a posed practice problem are the same state: the learner's turn", () => {
		assert.equal(sessionState(item({ pendingQuestion: true })), "your-turn");
		assert.equal(sessionState(item({ kind: "practice", pendingProblem: true })), "your-turn");
	});

	it("a running turn outranks the learner's turn; a compaction in his pause does not (round 6, report 6 minor 4)", () => {
		assert.equal(sessionState(item({ busy: true, pendingQuestion: true })), "working");
		assert.equal(sessionState(item({ compacting: true, pendingQuestion: true })), "your-turn", "he can answer while it compacts, so it is not the tutor writing");
		assert.equal(sessionState(item({ compacting: true, ended: "left" })), "left", "a lesson closed for today stays closed while it compacts");
	});

	it("a lesson waiting on his words mid-lesson is his turn; a cut turn is paused; else finished", () => {
		assert.equal(sessionState(item({ ended: "mid-lesson" })), "your-turn");
		assert.equal(sessionState(item({ ended: "cut" })), "paused");
		assert.equal(sessionState(item({ ended: "closed" })), "finished");
		assert.equal(sessionState(item({})), "finished", "a summary without the fold reads as closed");
	});
});
