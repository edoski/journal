/**
 * An exam with several sessions (Edo, 19 Nov 2026: "be aware of the multiple
 * dates and be ready in the event student fails a date and it gets moved to
 * the next"). The record keeps every session in `exam.sessions` and aims at
 * one; every agent that saves reads how his word on a session moves it.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { courseRecordPrompt } from "../src/agent/prompt-segments.ts";

describe("an exam with several sessions", () => {
	it("is saved with every session and the one he aims at, and his word on one moves it", () => {
		for (const agent of ["prober", "teacher", "practice"] as const) {
			const prompt = courseRecordPrompt(agent, { arcs: false });
			assert.match(prompt, /every session in `exam\.sessions` when he names several and `date` the one he aims at/, `the ${agent} reads it`);
			assert.match(prompt, /"I failed the 19 Jan one", "I'll take the February one", set `date` to the session he now aims at/, `the ${agent} reads it`);
		}
	});
});
