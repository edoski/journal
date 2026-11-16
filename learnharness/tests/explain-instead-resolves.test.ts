/**
 * Explain instead never gave the replaced problem's answer (round 11, 2
 * n8): after Explain instead on "rank C", a general paragraph on rank,
 * then a new matrix D; rank C = 2 was never given, and the problem's card
 * shows no solution once he pressed Explain instead, since the explanation
 * is meant to be its answer. The prober's doctrine for that handoff now
 * teaches on the problem he set aside and ends on its answer.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const OPENING = readFileSync(new URL("../src/agent/prompts/prober/05-opening.md", import.meta.url), "utf8");

describe("the answer to Explain instead", () => {
	it("explains on the problem he set aside and ends on its answer", () => {
		assert.match(OPENING, /Explain instead on a problem\): a focused question, answered as one teaching step[^.]*, worked on the problem he set aside, never a new one, ending on its answer in one line/);
	});
});
