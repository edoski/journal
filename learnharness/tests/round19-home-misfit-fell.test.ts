/**
 * Round 19, M1, Home's half (1 M1): overnight to 10 Nov a review pace that
 * fell moved Hypergeometric, Conditional expectation, Martingales, Variance
 * and Variance of sums past the 19 Nov exam, with no move his study caused
 * (the map's `moved` named none of them), and Home on 10 Nov said nothing.
 * The engine names the topics that fell past the exam since his last study
 * day ended (`fell_past`), whatever moved them, and Home's line shows.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { homeExams, misfitExam } from "../components/study-home/day-record.ts";
import type { StudyCourse } from "../src/core/index.ts";
import { map, topic } from "./fixtures/round8-home.ts";

const TENTH = {
	map: map({
		title: "Probability",
		today: "2026-11-10",
		exam: { date: "2026-11-19", daysLeft: 9, doesNotFit: ["hypergeometric", "martingales", "variance"] as never, fellPast: ["hypergeometric", "martingales", "variance"] as never },
		topics: [
			topic("hypergeometric", "Hypergeometric distribution", { level: "new", starts: "2026-11-20" }),
			topic("martingales", "Martingales", { level: "new", starts: "2026-12-09" }),
			topic("variance", "Variance", { level: "new", starts: "2026-11-23" }),
		],
	}),
	unready: null,
	due: [],
	newToday: [],
	lastActiveDaysAgo: 1,
} as StudyCourse;

describe("Home names the exam topics that fell past it overnight, whatever moved them (round 19, M1)", () => {
	it("on 10 Nov, nine days out, with no move his study caused, the line shows", () => {
		const [exam] = homeExams([TENTH]);
		assert.deepEqual(exam?.fellToday, ["Hypergeometric distribution", "Martingales", "Variance"]);
		assert.equal(misfitExam([exam!])?.course, "Probability");
	});

	it("a day nothing fell keeps a far exam off Home", () => {
		const quiet = { ...TENTH, map: { ...TENTH.map, exam: { ...TENTH.map.exam!, fellPast: undefined } } } as StudyCourse;
		assert.equal(misfitExam(homeExams([quiet])), null);
	});
});
