/**
 * A lesson in a course whose record can't be read says so
 * (components/lesson/course-unreadable.tsx; round 4: it taught on with no
 * notice while every save failed).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CourseListing } from "../src/core/index.ts";
import { unreadableProblem } from "../components/lesson/course-unreadable.tsx";
import { unreadableLine } from "../components/study-home/unreadable-course.tsx";

const listing = (unreadable: { workspace: string; problem: "denied" | "damaged" | "unreadable" }[]): CourseListing => ({
	available: true,
	courses: [],
	unreadable: unreadable.map((c) => ({ ...c, title: "Calculus I" })),
	roots: [],
});

describe("a lesson in an unreadable course", () => {
	it("finds why its own course can't be read, and nothing for a course that reads", () => {
		assert.equal(unreadableProblem(listing([{ workspace: "/c/calc", problem: "denied" }]), "/c/calc"), "denied");
		assert.equal(unreadableProblem(listing([{ workspace: "/c/calc", problem: "denied" }]), "/c/la"), null);
		assert.equal(unreadableProblem({ available: false, reason: "no engine" }, "/c/calc"), null);
		assert.equal(unreadableProblem(null, "/c/calc"), null);
	});

	it("says it in Home's words for that course", () => {
		assert.equal(unreadableLine("denied"), "Couldn't read this course's record. The app isn't allowed to open its files.");
	});
});
