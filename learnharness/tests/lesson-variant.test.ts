/** The Lesson switch (lesson-variant.ts) and the reading column. */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { READING_COLUMN, LESSON_COLUMN } from "../components/lesson/lesson-column.ts";
import { LESSON_OPTIONS, POLISH_GROUPS } from "../components/lesson-variant.ts";

describe("the lesson switch", () => {
	it("offers Current and the two reading candidates as one group", () => {
		assert.deepEqual([...LESSON_OPTIONS], ["prose", "slot"]);
		assert.deepEqual(POLISH_GROUPS.map((g) => [g.id, g.options]), [["lesson", LESSON_OPTIONS]]);
	});

	it("gives the reading candidates a narrower column than today's", () => {
		assert.match(READING_COLUMN, /max-w-\[35rem\]/);
		assert.match(LESSON_COLUMN, /max-w-\[47\.5rem\]/);
	});
});
