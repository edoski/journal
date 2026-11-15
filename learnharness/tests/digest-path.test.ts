/**
 * "You are here" moves only when he moves on in the course: a problem
 * sheet's or a review's digest never moves the path, and a lesson's moves it
 * only onto its own topic or a new one (round 8, 2 §2).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { digestChanges } from "../src/core/lesson-digest.ts";

describe("You are here (2 §2)", () => {
	const view = {
		topics: [
			{ handle: "eigen", title: "Eigen", introduced: true, gap: null, note: null },
			{ handle: "rank", title: "Rank", introduced: true, gap: null, note: null },
			{ handle: "diag", title: "Diagonalization", introduced: false, gap: null, note: null },
		],
		current: "eigen",
		tasks: [],
		planFinished: false,
		knowledge: [],
		reached: null,
	};
	const moveTo = (current: string, over: Partial<typeof view> & { movesPath?: boolean; own?: readonly string[] }) => digestChanges({ topics: [], knowledge: [], current }, { ...view, ...over })?.changes.path;

	it("stays put after a problem sheet's or a review's session", () => {
		assert.equal(moveTo("rank", { movesPath: false, own: ["rank"] }), undefined);
	});

	it("moves with a lesson onto its own topic or a topic not introduced yet, never back onto an older one it touched", () => {
		assert.equal(moveTo("rank", { own: ["eigen"] }), undefined);
		assert.deepEqual(moveTo("diag", { own: ["eigen"] }), { current: "diag" });
		assert.deepEqual(moveTo("rank", { own: ["rank"] }), { current: "rank" });
	});
});
