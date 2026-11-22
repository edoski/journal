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
			topic("epsilon-delta", "The precise ε–δ definition of a limit", { level: "retained", review: due as never }),
			topic("chain-rule", "The chain rule", { level: "retained", review: due as never, signals: { ...QUIET, lapsed: true, mistake: true } as never }),
			topic("shells", "Volumes of revolution: cylindrical shells", { level: "retained", review: due as never, signals: { ...QUIET, lapsed: true, mistake: true } as never }),
		],
	}),
	unready: null,
	due: ["epsilon-delta", "shells", "chain-rule"],
	newToday: [],
	lastActiveDaysAgo: 3,
} as unknown as StudyCourse;

describe("a review opens on the slip its line names (round 19, m11)", () => {
	// As the seed holds it: the map lists the chain rule first, the plan's review shells first, and both lapsed.
	it("the line names the slip the review it starts leads with", () => {
		const step = nextStepOf(CALCULUS);
		assert.equal(step.kind, "review");
		const move = courseMove(CALCULUS, [], step);
		assert.equal(move.kind, "start");
		const first = move.kind === "start" ? move.topics[0] : null;
		assert.equal(first, "shells", "a lapse leads the review, in the plan's order");
		assert.match(whyOf({ kind: "course", course: CALCULUS, step } as never)?.short ?? "", /cylindrical shells$/);
		assert.ok(move.kind === "start" && /^Review Volumes of revolution/.test(move.opening), move.kind === "start" ? move.opening : "");
	});
});
