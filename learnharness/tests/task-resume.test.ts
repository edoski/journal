/**
 * Round 9 (1 D9, 2 m9): Continue Problem sheet 4 asked him for the matrix,
 * since the sheet's file holds only headings, though its saved step (show
 * dim ker A = 2 for the 3×5 matrix A of rank 3) follows from rank-nullity,
 * which the record holds. A task resumes at its saved step from the record.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import { describe, it } from "node:test";
import { courseRecordPrompt } from "../src/agent/prompt-segments.ts";

describe("a task continued", () => {
	it("starts at its saved step from what the record holds, and asks him for material only when that step needs it", () => {
		const record = fs.readFileSync(new URL("../src/agent/prompts/course/10-record.md", import.meta.url), "utf8");
		assert.match(record, /\*\*A task continued\.\*\* Read it whole with `course_show`/);
		assert.match(record, /A ref you cannot open, or one that holds only headings, never stops a step that follows from what the record holds/);
		assert.match(record, /Ask him for material only when the step itself needs data you do not have/);
		for (const agent of ["prober", "teacher", "practice"] as const) assert.match(courseRecordPrompt(agent, { arcs: false }), /\*\*A task continued\.\*\*/, `the ${agent} reads it`);
	});
});
