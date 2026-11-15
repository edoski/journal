/**
 * A turn settling in this window leaves the sidebar's snapshot alone until
 * the server's fresh one lands (round 10, 2 m5): the settle cleared `busy`
 * on a snapshot read mid-turn, whose reply read as cut off, so the card
 * flashed "Reply cut off" for a few seconds at the end of the opener before
 * "Your turn".
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ChatListItem } from "../src/core/contracts/chat.ts";
import { turnStatePatch } from "../components/sidebar-state.ts";
import { sessionState } from "../components/nav/session-state.ts";

const midTurn = { id: "c1", title: "Binomial distribution", kind: "teach", createdAt: "2026-11-08T09:00:00Z", updatedAt: "2026-11-08T09:00:30Z", messageCount: 3, phase: "probe", pendingQuestion: false, pendingProblem: false, ended: "cut", busy: true } as ChatListItem;

describe("a turn settling in this window", () => {
	it("keeps the card as it was until the fresh snapshot lands, never reading the reply as cut off", () => {
		const after = turnStatePatch([midTurn], "c1", false)!;
		assert.equal(sessionState(after[0]!), "working");
	});

	it("marks a starting turn busy at once", () => {
		const idle = { ...midTurn, busy: false, ended: "closed" as const };
		assert.equal(turnStatePatch([idle], "c1", true)![0]!.busy, true);
		assert.ok(turnStatePatch(null, "c1", true) === null, "no snapshot yet, nothing to patch");
	});
});
