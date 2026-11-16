/**
 * A check answered by the sentence above it (round 11, 3 n1): "Shrinking
 * is harmless, since a map that halves every vector is undone by doubling",
 * then "Let E = 1/2I, the matrix that halves every vector. Is every y an
 * output of E?". The question principles now say a check never asks about
 * the case the step used as its example, nor anything its sentences state
 * outright.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const PRINCIPLES = readFileSync(new URL("../src/agent/prompts/teacher/30-question-principles.md", import.meta.url), "utf8");

describe("a teaching check", () => {
	it("never asks the case the step used as its example, nor what its sentences state", () => {
		assert.match(PRINCIPLES, /\*\*Never answered by the step above it\.\*\* A check never asks about the case the step used as its example, nor anything its sentences state outright/);
	});
});
