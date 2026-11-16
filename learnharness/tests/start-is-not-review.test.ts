/**
 * A topic not started is never called a review (round 11, 4 minor 5): the
 * close said "Monday 9 November has your reviews of determinants,
 * eigenvalues and inner products", and Inner products had never been
 * taught; the brief's day read "review …; start Inner products". The
 * record doctrine and every close now say a topic the plan starts is
 * started, never reviewed.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { DONE_TONIGHT_TEXT } from "../src/core/contracts/chat.ts";

const RECORD = readFileSync(new URL("../src/agent/prompts/course/10-record.md", import.meta.url), "utf8");

describe("a topic the plan starts", () => {
	it("is said as starting in the record doctrine, never as a review", () => {
		assert.match(RECORD, /A topic a day lists under `start` is one he has not started: say he starts it then \("Inner products starts on Monday 9 November"\), never that it is a review/);
	});
	for (const [agent, text] of Object.entries(DONE_TONIGHT_TEXT)) {
		it(`is said as starting in the ${agent}'s close`, () => {
			assert.match(text, /a topic not started is one he starts, never a review/);
		});
	}
});
