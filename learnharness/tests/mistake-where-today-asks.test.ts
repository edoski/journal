/**
 * "Mistake to fix" shows where Today asks for it (round 13, 3 N4). He
 * closed the Invertible matrices lesson with Done for today after a
 * confident wrong answer: the close said he picks up there and reviews it
 * tomorrow, and Home's Today had no line for it, since he said he is done
 * with it for today, yet its sidebar card read "Mistake to fix". A lesson
 * left with its mistake for the next session says it is left off; the
 * mistake outranks it only while Today reviews the topic, as round 8's
 * Eigen (due that day) needed.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shelfStatus } from "../components/unit-inbox/now-inbox.ts";
import type { Unit } from "../components/unit-inbox/units.ts";
import { chat, TODAY, topic } from "./fixtures/now-demo.ts";

const signals = { gap: "Called a 3 × 2 matrix with independent columns invertible", lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 1, repaired: false, mistake: true };
const lesson = chat("inv", { title: "Invertible matrices", topics: ["inv"], ownTopics: ["inv"], ended: "left", updatedAt: `${TODAY}T11:00:00.000Z` });
const INV: Unit = {
	key: "/s/la#inv",
	course: { workspace: "/s/la", title: "Linear Algebra", today: TODAY },
	topic: topic("inv", "Invertible matrices", "assisted", { weak: true, signals, review: { kind: "scheduled", date: "2026-11-09" } as never }),
	shelf: "learning",
	sessions: [lesson],
	now: "left",
	task: null,
	slip: "Mistake to fix",
};

describe("Mistake to fix where Today asks for it (3 N4)", () => {
	it("a lesson he left today with its mistake for next time reads Left off today", () => {
		assert.deepEqual(shelfStatus(INV, TODAY), { kind: "task", words: "Left off today" });
	});
	it("the mistake leads while Today reviews the topic", () => {
		assert.equal(shelfStatus(INV, TODAY, new Set([INV.key])).kind, "slip");
	});
});
