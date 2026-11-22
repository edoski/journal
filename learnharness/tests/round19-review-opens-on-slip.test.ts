/**
 * Round 19, m11 (4 free; 2, 3 the same opening): Home's Calculus row read
 * "Calculus I review · Not right last time: The chain rule", and the review
 * it opened was "Review Volumes of revolution: cylindrical shells, The
 * chain rule, …", which opened on shells. The topic he got wrong last time
 * leads the review, so the review opens on the slip its row names.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { courseMove, nextStepOf } from "../components/study-home/study-facts.ts";
import { whyOf } from "../components/study-home/agenda-rows/row-facts.ts";
import type { StudyCourse } from "../src/core/index.ts";
import { map, topic } from "./fixtures/round8-home.ts";

const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
const due = { kind: "due" as const, overdue: 1 };
const CALCULUS = {
	map: map({
		title: "Calculus I",
		today: "2026-11-08",
		topics: [
			topic("shells", "Volumes of revolution: cylindrical shells", { level: "retained", review: due as never }),
			topic("chain-rule", "The chain rule", { level: "retained", review: due as never, signals: { ...QUIET, lapsed: true, mistake: true } as never }),
			topic("epsilon-delta", "The precise ε–δ definition of a limit", { level: "retained", review: due as never }),
		],
	}),
	unready: null,
	due: ["shells", "chain-rule", "epsilon-delta"],
	newToday: [],
	lastActiveDaysAgo: 3,
} as unknown as StudyCourse;

describe("a review opens on the slip its line names (round 19, m11)", () => {
	it("the line names The chain rule, and the review it starts leads with it", () => {
		const step = nextStepOf(CALCULUS);
		assert.equal(step.kind, "review");
		assert.match(whyOf({ kind: "course", course: CALCULUS, step } as never)?.short ?? "", /The chain rule$/);
		const move = courseMove(CALCULUS, [], step);
		assert.equal(move.kind, "start");
		assert.ok(move.kind === "start" && move.topics[0] === "chain-rule", `it opens on ${move.kind === "start" ? move.topics[0] : "a session"}`);
		assert.ok(move.kind === "start" && /^Review The chain rule\b/.test(move.opening), move.kind === "start" ? move.opening : "");
	});
});
