import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { examText } from "../components/start/course-facts.ts";

describe("course facts", () => {
	it("words the exam day and the day before, and drops a past exam", () => {
		assert.equal(examText({ date: "d", daysLeft: 21 }), "Exam in 21 days");
		assert.equal(examText({ date: "d", daysLeft: 0 }), "Exam today");
		assert.equal(examText({ date: "d", daysLeft: 1 }), "Exam tomorrow");
		assert.equal(examText({ date: "d", daysLeft: -2 }), null);
		assert.equal(examText(null), null);
	});
});
