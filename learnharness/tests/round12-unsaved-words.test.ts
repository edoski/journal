/**
 * Round 12, 4 minor 2: once the unreadable record came back he asked
 * "can you save my answers now?", and the tutor said "The first answer of
 * the session, on ∑(1/n²), can't be matched to its problem anymore, so it
 * stays unsaved." That answer was o6, saved on 4 Nov and listed on the
 * topic page. Every answer in the record stays saved, and the app itself
 * says when the record can't be read, so the tutor never tells him an
 * answer is not saved.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { voiceBreaks } from "../src/core/voice-check.ts";
import { courseRecordPrompt } from "../src/agent/prompt-segments.ts";

const rules = (text: string) => voiceBreaks(text, "direct").map((b) => b.rule);

describe("the tutor never calls a saved answer unsaved", () => {
	it("the recorded reply is refused", () => {
		const said = "Yes, your answers on the alternating series and on $\\sum \\frac{3^n n!}{n^n}$ are saved now, with the marks shown on their cards. The first answer of the session, on $\\sum \\frac{1}{n^2}$, can't be matched to its problem anymore, so it stays unsaved.";
		assert.ok(rules(said).includes("unsaved"), String(rules(said)));
	});

	it("every way of saying an answer was not kept is refused", () => {
		for (const said of ["That answer isn't saved yet.", "Your first answer was not recorded.", "It couldn't be saved.", "Those answers remain unsaved."]) assert.ok(rules(said).includes("unsaved"), said);
	});

	it("words about saving that claim nothing missing pass", () => {
		for (const said of ["The record works again.", "A saved vector stays on its line."]) assert.ok(!rules(said).includes("unsaved"), said);
	});

	it("the record reference says an earlier day's answer is already in the record", () => {
		for (const agent of ["prober", "teacher", "practice"] as const) assert.match(courseRecordPrompt(agent, { arcs: false }), /earlier day[^.]*already in the record/i);
	});
});
