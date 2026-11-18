/**
 * Silent reviews inside a lesson (round 11, 3 n7): the Poisson probe
 * opened with the due Binomial review (three binomial questions) without
 * saying so, and the third, a binomial question that added up a PMF, was
 * saved on Random variables too, so it counted as that topic's review and
 * its row left Home. The record doctrine now has a folded-in review said in
 * one line, and an attempt's topics the ones its question was asked on.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { voiceBreaks } from "../src/core/voice-check.ts";

const RECORD = readFileSync(new URL("../src/agent/prompts/course/10-record.md", import.meta.url), "utf8");

describe("a due review taken inside another session", () => {
	it("opens with one plain line naming it, which the voice lets through", () => {
		assert.match(RECORD, /A due review you take before the session's own topic opens with one plain line naming it \("First, your Binomial review\."\)/);
		assert.equal(voiceBreaks("First, your Binomial review.", "teach").length, 0);
	});

	it("counts only for the topics its question was asked on, never a need it used", () => {
		assert.match(RECORD, /`topics` are the topics its question was asked on, never a topic it only used along the way \(a binomial question that adds up a PMF is on `binomial`, not on random variables too\), since an answer on a due topic counts as its review/);
	});
});
