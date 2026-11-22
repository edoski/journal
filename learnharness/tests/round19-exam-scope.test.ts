/**
 * Round 19, m18 (1 n3): an Ask offered to move examined topics past the
 * exam, then took it back once it read the exam's coverage. The brief
 * carries the exam's scope.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { projectCourseBrief } from "../src/core/course-brief.ts";

describe("m18: the brief carries the exam's scope (1 n3)", () => {
	const resume = (exam: Record<string, unknown>) => ({ today: "2026-11-17", course: { title: "Probability", exam: { date: "2026-11-19", days_left: 2, ...exam } }, path: {}, due: [] });

	it("an exam with a coverage and no topic left out says every topic is examined, and never moves one past it", () => {
		const { text } = projectCourseBrief(resume({ coverage: "Section 5.1 and Sections 6.1–6.2" }), "teach");
		assert.match(text, /Exam scope: its scope, in his material's words: Section 5\.1 and Sections 6\.1–6\.2; every topic of the course is examined\./);
		assert.match(text, /Offer to move a topic to after the exam only when the exam leaves it out/);
	});

	it("an exam that leaves topics out names them", () => {
		const { text } = projectCourseBrief(resume({ leaves_out: ["martingales", "covariance"] }), "teach");
		assert.match(text, /Exam scope: it leaves out martingales, covariance\./);
	});

	it("a course with no exam has no scope line", () => {
		const { text } = projectCourseBrief({ today: "2026-11-17", course: { title: "Calculus I" }, path: {}, due: [] }, "teach");
		assert.doesNotMatch(text, /Exam scope/);
	});
});
