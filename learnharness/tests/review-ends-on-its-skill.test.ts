/**
 * A review ends on the skill it tested (round 13, 3 N7): the Binomial
 * review's chip question missed the C(20, 2) factor, the repair asked one
 * head in four fair tosses, an easier case, and the review was done with
 * C(20, 2) never applied, so the topic read "Right on your own, check
 * another day". The engine's review doctrine, which every tutor agent
 * composes, says what the next question after a miss must need.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { PATHS } from "../config.ts";
import { courseRecordPrompt } from "../src/agent/prompt-segments.ts";

const REVIEWS = fs.readFileSync(path.join(PATHS.tutorReferences, "reviews.md"), "utf8");

describe("a review's question after a miss needs what the answer missed (3 N7)", () => {
	it("at the first question's difficulty, never an easier case of it", () => {
		assert.match(REVIEWS, /one that needs what the answer missed, at the first question's difficulty, never an easier case of it/);
	});

	it("reaches every agent that takes a review", () => {
		for (const agent of ["prober", "teacher", "practice"] as const) {
			assert.ok(courseRecordPrompt(agent, { arcs: false }).replace(/\s+/g, " ").includes("never an easier case of it"), `${agent} reads it`);
		}
	});
});
