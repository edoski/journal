/**
 * Round 12, 1 m7: in Probability on 17 Nov the tutor said "you haven't
 * studied since Monday 9 November", after study on 10 and 17 Nov. It read
 * a moved day's note ("moved from Sat 14 Nov, no study since Mon 9 Nov")
 * as his history. The brief now gives the day he last studied the course,
 * the engine's `last_studied`, as the one day to tell him.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { lastStudiedOf, projectCourseBrief } from "../src/core/course-brief.ts";

const RESUME = { today: "2026-11-17", course: { title: "Probability", exam: { days_left: 2 } }, path: { topics: [] }, due: [] };
const PLAN = { today: "2026-11-17", courses: [{ last_studied: { date: "2026-11-17", days_ago: 0 } }] };

describe("the brief says when he last studied the course", () => {
	it("reads the engine's last study day from the course's plan", () => {
		assert.deepEqual(lastStudiedOf(PLAN), { date: "2026-11-17", daysAgo: 0 });
		assert.equal(lastStudiedOf({ courses: [{}] }), null);
	});

	it("names it as the one day to tell him", () => {
		const today = projectCourseBrief(RESUME, "teacher", { studied: { date: "2026-11-17", daysAgo: 0 } }).text;
		assert.match(today, /He last studied this course today\b[^\n]*never a moved day's note/);
		const earlier = projectCourseBrief(RESUME, "teacher", { studied: { date: "2026-11-09", daysAgo: 8 } }).text;
		assert.match(earlier, /He last studied this course on 2026-11-09 \(Monday\), 8 days ago/);
	});
});
