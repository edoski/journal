/**
 * A self-study (the engine's course preference `kind`), where a course
 * would show its exam or its reviews: the map and the course list carry it
 * from the engine, and every list says "Self-study", then "Learned" once
 * every topic is.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { courseMapOf } from "../src/store/course-records.ts";
import { selfStudyOf } from "../src/core/contracts/course.ts";
import { courseFactText } from "../components/start/course-facts.ts";
import { SELF_STUDY_WORDS } from "../components/study-words.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(fs.readFileSync(path.resolve(HERE, "..", "..", "tests", "learning", "golden", "linear-algebra.map.json"), "utf-8")) as Record<string, unknown>;

describe("a self-study's facts", () => {
	it("the map carries the engine's kind and whether its goal is reached; a course carries none", () => {
		assert.equal(courseMapOf("/s/la", golden)?.selfStudy, undefined);
		assert.deepEqual(courseMapOf("/s/git", { ...golden, kind: "self-study", goal_reached: false })?.selfStudy, { goalReached: false });
		assert.deepEqual(courseMapOf("/s/git", { ...golden, kind: "self-study", goal_reached: true })?.selfStudy, { goalReached: true });
		assert.deepEqual(selfStudyOf({ kind: "course" }), {});
	});

	it("a list names a self-study, then its goal reached, never an exam day", () => {
		assert.equal(courseFactText({ exam: null, selfStudy: { goalReached: false } }), "Self-study");
		assert.equal(courseFactText({ exam: null, selfStudy: { goalReached: true } }), "Learned");
		assert.equal(courseFactText({ exam: { date: "2026-11-29", daysLeft: 21 } }), "Exam 29 Nov");
		assert.match(SELF_STUDY_WORDS.hint, /no exam and no reviews/);
	});
});
