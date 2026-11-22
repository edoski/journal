/**
 * Round 19, m12 (4 free): after another window deleted Calculus I, the
 * session of its open review still read "Your turn" in the sidebar and in
 * search, on a question he can no longer answer. A deleted course's
 * session is history: it reads when he last studied in it.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sessionState } from "../components/nav/session-state.ts";
import { sessionRowStatus } from "../components/unit-inbox/unit-row.tsx";
import type { ChatListItem } from "../src/core/index.ts";

const review = {
	id: "chat_calc",
	title: "Calculus I review",
	createdAt: "2026-11-08T09:00:00.000Z",
	updatedAt: "2026-11-08T09:30:00.000Z",
	kind: "teach",
	messageCount: 6,
	phase: "probe",
	pendingQuestion: true,
	pendingProblem: false,
	busy: false,
	course: { workspace: "/s/calc", title: "Calculus I" },
	topics: ["chain-rule"],
	ownTopics: ["chain-rule"],
} as unknown as ChatListItem;

describe("a deleted course's session reads as history (round 19, m12)", () => {
	it("its open question waits on him while the course stands", () => {
		assert.equal(sessionState(review), "your-turn");
	});

	it("once the course is deleted, it is history, with the day he studied in it", () => {
		const gone = { ...review, courseDeleted: true };
		assert.equal(sessionState(gone), "finished");
		const status = sessionRowStatus(gone, sessionState(gone), "2026-11-10");
		assert.equal(status.kind, "studied");
		assert.match((status as { words: string }).words, /8 Nov/);
	});
});
