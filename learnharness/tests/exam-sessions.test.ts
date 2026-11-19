/**
 * An exam with several sessions (Edo, 19 Nov 2026: "be aware of the multiple
 * dates and be ready in the event student fails a date and it gets moved to
 * the next"). The record keeps every session in `exam.sessions` and aims at
 * one; every agent that saves reads how his word on a session moves it.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { courseRecordPrompt } from "../src/agent/prompt-segments.ts";
import { projectCourseBrief } from "../src/core/course-brief.ts";

describe("an exam with several sessions", () => {
	it("is saved with every session and the one he aims at, and his word on one moves it", () => {
		for (const agent of ["prober", "teacher", "practice"] as const) {
			const prompt = courseRecordPrompt(agent, { arcs: false });
			assert.match(prompt, /every session in `exam\.sessions` when he names several and `date` the one he aims at/, `the ${agent} reads it`);
			assert.match(prompt, /"I failed the 19 Jan one", "I'll take the February one", set `date` to the session he now aims at/, `the ${agent} reads it`);
		}
	});

	it("tells the tutor every session and the one gone by he has not answered, so it saves his word on it", () => {
		const resume = (exam: Record<string, unknown>) => ({ today: "2026-12-22", course: { title: "Artificial Intelligence", exam }, path: {}, due: [] });
		const sessions = ["2026-12-21", "2027-01-19", "2027-02-03"];
		const { text } = projectCourseBrief(resume({ date: "2027-01-19", sessions, past: "2026-12-21" }), "teach");
		assert.match(text, /· exam on Tuesday 19 January, the session he aims at \(sessions: Monday 21 December, Tuesday 19 January and Wednesday 3 February; Monday 21 December has gone by and he has not said how it went\)/);
		assert.match(projectCourseBrief(resume({ date: "2027-01-19" }), "teach").text, /· exam on Tuesday 19 January$/m, "an exam held once reads as before");
	});
});
