/**
 * Round 14, m16 (3 n6): the last probe answer read "Partly right" with no
 * words (26c). The probe ends with no words after `probe_done`, so its last
 * answer gets only its mark, and the teaching then built on without saying
 * what was missing (the model behind e⁻³). The wake that opens the lesson
 * now has the first step's first sentence name the part it missed.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildProbeHandoffSteer } from "../src/core/contracts.ts";

describe("the teaching names what the last probe answer missed (round 14, m16)", () => {
	it("the lesson's wake asks the first step's first sentence to name the missing part", () => {
		for (const review of [false, true]) {
			const steer = buildProbeHandoffSteer("chat_1", review, false);
			assert.match(String(steer.content), /My last probe answer got only its mark, with no words: when it was not right, the first step's first sentence names the part it missed/);
		}
	});
});
