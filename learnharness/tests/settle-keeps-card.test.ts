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
import { settleSnapshot, turnStatePatch } from "../components/sidebar-state.ts";
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

/** Round 12, 4 minor 4: offline, two Enters said "Still can't reach the
 *  app…" while the card said "Tutor writing", and after the server died
 *  mid-turn it kept saying so until the restart. The settle's fresh
 *  snapshot never landed, so the start's patch stood. */
describe("a turn settling while the app cannot be reached", () => {
	const idle = { ...midTurn, busy: false, ended: "closed" as const, pendingQuestion: true };

	it("stops saying the tutor writes after a send that never arrived", async () => {
		let chats: ChatListItem[] | null = turnStatePatch([idle], "c1", true);
		await settleSnapshot(async () => false, (patch) => (chats = patch(chats)), "c1");
		assert.equal(sessionState(chats![0]!), "your-turn");
	});

	it("reads the reply as cut off when the app went down mid-turn", async () => {
		let chats: ChatListItem[] | null = [midTurn];
		await settleSnapshot(async () => false, (patch) => (chats = patch(chats)), "c1");
		assert.equal(sessionState(chats![0]!), "paused");
	});

	it("leaves the fresh snapshot alone when the app answered", async () => {
		let chats: ChatListItem[] | null = [midTurn];
		const fresh = { ...midTurn, busy: false, ended: "mid-lesson" as const };
		await settleSnapshot(async () => { chats = [fresh]; return true; }, (patch) => (chats = patch(chats)), "c1");
		assert.ok(chats![0] === fresh, "the server's snapshot stands");
	});
});
