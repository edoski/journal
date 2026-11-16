/**
 * The plan's words on the course page's rows, read from the engine's own
 * map of round 12's records on 10 Nov (`fixtures/plan`): a start that comes
 * after the exam still ahead says so, never a bare day (round 12, 1 m11:
 * "Geometric · Planned 29 Nov" on the Probability page while its topic page
 * said "Not before the exam").
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { courseGroups } from "../components/course-page/course-model.ts";
import type { StudyCourse } from "../src/core/contracts/study.ts";
import { courseMapOf } from "../src/store/course-records.ts";

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "plan", "probability-lesson-begun.map.json");
const MAP = courseMapOf("/study/probability", JSON.parse(fs.readFileSync(FIXTURE, "utf-8")))!;
const COURSE: StudyCourse = { map: MAP, unready: null, due: null, newToday: [], lastActiveDaysAgo: 0 };

describe("a course page row's start", () => {
	it("says After the exam for a start the plan puts past the exam, its day kept for the hint", () => {
		const rows = courseGroups(COURSE).flatMap((group) => group.topics);
		const covariance = rows.find((row) => row.topic.handle === "covariance")!;
		assert.ok(covariance.topic.starts! > MAP.exam!.date, "the plan starts it after the exam");
		assert.equal(covariance.factWords, "After the exam");
		assert.match(covariance.fact?.words ?? "", /^Planned /, "the hint keeps its planned day");
		const variance = rows.find((row) => row.topic.handle === "variance")!;
		assert.ok(variance.topic.starts! < MAP.exam!.date);
		assert.match(variance.factWords ?? "", /^Planned /);
	});
});
