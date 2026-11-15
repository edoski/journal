/**
 * Round 9 (lesson reading M3): the probe-to-teaching turn showed about 70 s
 * of "Thinking…". Part of it was the prober writing closing words after
 * probe_done (7 s), which the voice guard then withheld. A clean probe_done
 * now ends the prober's turn, so the teacher's first turn starts at once.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { endsTurnFor } from "../src/agent/teacher-agent.ts";

describe("probe_done ends the prober's turn (round 9 M3)", () => {
	it("a clean probe_done is the prober's last call, as a question is", () => {
		assert.equal(endsTurnFor("prober")("probe_done"), true);
		assert.equal(endsTurnFor("prober")("recall"), true);
		assert.equal(endsTurnFor("prober")("course_save"), false, "a save goes on to the next call");
	});

	it("only the prober concludes a probe", () => {
		assert.equal(endsTurnFor("teacher")("probe_done"), false);
		assert.equal(endsTurnFor("practice")("probe_done"), false);
	});
});
