/**
 * The engine's `standing` as the course page reads it: readiness by part
 * and the open mistakes, parsed into the contract.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { courseStandingOf } from "../src/server/course-standing.ts";

describe("courseStandingOf", () => {
	it("reads each part's lists, the empty ones included, and each open mistake with what it was on", () => {
		const standing = courseStandingOf({
			today: "2026-11-14",
			readiness: {
				date: "2026-11-30",
				days_left: 16,
				parts: [
					{ arc: "spaces", title: "Vector spaces", solid: ["span"], not_yet: ["basis"] },
					{ arc: "maps", title: "Linear maps", to_start: ["kernel"], wont_fit: ["image"] },
				],
			},
			mistakes: [
				{
					topic: "rank",
					gap: "You count the vectors, not the dimension of their span",
					latest: "2026-11-14",
					answers: [
						{
							id: "o5",
							date: "2026-11-13",
							text: "Gave rank 3",
							response: "rank = 3",
							result: "partial",
							helped: true,
							task: "Sheet 3",
							where: [{ source: "Notes", locator: "Exercise 5(b)" }, { source: "Book" }],
						},
					],
				},
				{ topic: "basis", latest: "2026-11-11", answers: [{ id: "o4", date: "2026-11-11", text: "Called three vectors a basis", result: "incorrect", helped: false, confident: true, chose: "span" }] },
			],
		});
		assert.deepEqual(standing?.readiness, {
			date: "2026-11-30",
			daysLeft: 16,
			parts: [
				{ arc: "spaces", solid: ["span"], notYet: ["basis"], toStart: [], wontFit: [] },
				{ arc: "maps", solid: [], notYet: [], toStart: ["kernel"], wontFit: ["image"] },
			],
		});
		assert.deepEqual(standing?.mistakes[0], {
			topic: "rank",
			gap: "You count the vectors, not the dimension of their span",
			latest: "2026-11-14",
			answers: [{ id: "o5", date: "2026-11-13", text: "Gave rank 3", response: "rank = 3", result: "partial", helped: true, confident: false, chose: null, on: "Sheet 3; Exercise 5(b), Notes; Book" }],
		});
		assert.deepEqual(standing?.mistakes[1]?.answers[0], { id: "o4", date: "2026-11-11", text: "Called three vectors a basis", response: null, result: "incorrect", helped: false, confident: true, chose: "span", on: null });
	});

	it("has no readiness without an exam ahead, and leaves out what the contract cannot hold", () => {
		const standing = courseStandingOf({ today: "2026-11-14", mistakes: [{ topic: "x", answers: [{ id: "o1", date: "2026-11-01", text: "Right", result: "correct" }] }, { answers: [] }] });
		assert.deepEqual(standing, { readiness: null, mistakes: [] });
		assert.equal(courseStandingOf({ error: "nope" }), null);
	});
});
