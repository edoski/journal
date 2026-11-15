/**
 * A callout holds what its message has not said (round 10, 3 m9): the
 * Invertible lesson boxed "A square matrix A is invertible exactly when
 * det A ≠ 0." under the paragraph that had just said it.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { restatingCallout } from "../src/core/voice-check.ts";

const PARAGRAPH = "When $\\det A = 0$ the map squashes the plane onto a line, so nothing can undo it. A square matrix is invertible exactly when its determinant is not zero.";

describe("a callout", () => {
	it("is refused when it says again what the paragraph above it said", () => {
		const boxed = restatingCallout(`${PARAGRAPH}\n\n> A square matrix $A$ is invertible exactly when $\\det A \\neq 0$.`);
		assert.ok(boxed, "the restatement is caught");
		assert.match(boxed.said, /invertible exactly when/);
	});

	it("passes when it adds something, or stands alone", () => {
		assert.equal(restatingCallout(`${PARAGRAPH}\n\n> The trace is the sum of the eigenvalues, a fast check on any answer.`), null);
		assert.equal(restatingCallout("> A square matrix is invertible exactly when its determinant is not zero."), null);
	});
});
