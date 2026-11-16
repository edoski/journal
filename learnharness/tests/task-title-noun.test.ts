/**
 * A task's title is a noun (round 12, 1 m4 and 3 D9): the tutor titled the
 * Poisson lesson's task "Start the Poisson distribution", so Home read
 * "Continue Start the Poisson distribution", and another lesson's
 * "Lesson: Invertible matrices" beside "Poisson distribution lesson". The
 * rule sits where the title is written, and every agent that saves reads it.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import { describe, it } from "node:test";
import { courseRecordPrompt } from "../src/agent/prompt-segments.ts";
import { continueWords } from "../components/study-home/study-facts.ts";

const RULE = /a lesson's task is its topic's title and "lesson" \("Poisson distribution lesson"\), never a verb \("Start the Poisson distribution"\) or a label \("Lesson: Invertible matrices"\)/;

describe("a task's title", () => {
	it("is a noun the app puts its own verb before, a lesson's task named as the topic's lesson", () => {
		const record = fs.readFileSync(new URL("../src/agent/prompts/course/10-record.md", import.meta.url), "utf8");
		assert.match(record, RULE);
		for (const agent of ["prober", "teacher", "practice"] as const) assert.match(courseRecordPrompt(agent, { arcs: false }), RULE, `the ${agent} reads it`);
		assert.equal(continueWords("Poisson distribution lesson"), "Continue Poisson distribution lesson");
	});
});
