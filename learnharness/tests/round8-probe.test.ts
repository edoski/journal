/**
 * Round 8, the probe (lesson reading M2, m3): the Invertible probe asked a
 * goal question with helper lines and a "Both" option, then 8 questions
 * before any teaching.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import { describe, it } from "node:test";

describe("the probe asks what the plan needs, and no goal question on a topic's own lesson", () => {
	it("asks no goal question on a session opened from a topic's page, and keeps a probe to the strands the first steps need", () => {
		const probe = fs.readFileSync(new URL("../src/agent/prompts/prober/10-probe-doctrine.md", import.meta.url), "utf8");
		assert.match(probe, /A lesson in a course already has its goal.* Ask nothing about it/);
		assert.doesNotMatch(probe, /however many questions that takes/);
		assert.match(probe, /a bracketed strand gets no further question/);
	});
});
