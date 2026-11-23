/**
 * Round 18, M1, Home's half (1 M2): overnight to 9 Nov, Negative binomial,
 * Poisson and Hypergeometric fell past the 19 Nov Probability exam (the
 * plan had them on 16, 17 and 18 Nov as 8 Nov ended), and Home on 9 and 10
 * Nov said nothing: its "No room before the exam to start …" line showed
 * only in the exam's last week. It shows on the day a topic falls past
 * the exam.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { homeExams, misfitExam, nearExam, type NearExam } from "../components/study-home/day-record.ts";
import type { StudyCourse } from "../src/core/index.ts";
import { map, topic } from "./fixtures/round8-home.ts";
import { Today } from "../components/study-home/today.tsx";

const NINTH: NearExam = {
	course: "Probability",
	date: "2026-11-19",
	daysLeft: 10,
	workspace: "/s/prob",
	wontFit: ["Martingales", "Variance of sums", "Negative binomial distribution", "Poisson distribution", "Hypergeometric distribution"],
	fellToday: ["Negative binomial distribution", "Poisson distribution", "Hypergeometric distribution"],
};

describe("Home names the exam's topics with no room before it on the day one falls (round 18, M1)", () => {
	it("on 9 Nov, ten days out, the topics that fell overnight bring the line, with every topic that does not fit", () => {
		assert.equal(nearExam([NINTH]), null, "the heading still asks about the morning: the exam is not this week");
		assert.equal(misfitExam([NINTH]), NINTH);
	});

	it("reads the topics that fell from the plan: a misfit whose start, as yesterday ended, was before the exam", () => {
		const left = (from: string) => ({ from, by: "left" as const });
		const course = {
			map: map({
				title: "Probability",
				today: "2026-11-09",
				exam: { date: "2026-11-19", daysLeft: 10, doesNotFit: ["martingales", "poisson", "variance"] as never },
				topics: [
					topic("martingales", "Martingales", { level: "new" }),
					topic("poisson", "Poisson distribution", { level: "new", starts: "2026-12-06", moved: left("2026-11-17") }),
					topic("variance", "Variance", { level: "new", starts: "2026-12-15", moved: left("2026-12-10") }),
				],
			}),
			unready: null,
			due: [],
			newToday: [],
			lastActiveDaysAgo: 1,
		} as StudyCourse;
		const [exam] = homeExams([course]);
		assert.deepEqual(exam?.wontFit, ["Martingales", "Poisson distribution", "Variance"]);
		assert.deepEqual(exam?.fellToday, ["Poisson distribution"], "Variance was past the exam already, and Martingales never moved");
		assert.equal(misfitExam([exam!])?.course, "Probability");
	});

	it("on a day nothing fell, a far exam's old misfits stay on the course head, off Home", () => {
		assert.equal(misfitExam([{ ...NINTH, fellToday: [] }]), null);
	});

	it("in the exam's last week the line stays, fallen today or not", () => {
		const eve = { ...NINTH, daysLeft: 2, fellToday: [] };
		assert.equal(misfitExam([eve]), eve);
	});

	it("draws the line under the heading with Ask the tutor, though the heading names no exam", () => {
		const page = parseHTML(`<html><body>${renderToStaticMarkup(<Today rows={[]} done={[]} exam={null} misfit={misfitExam([NINTH])} busy={false} onContinue={() => {}} />)}</body></html>`).document;
		const line = page.querySelector("[data-slot=today-exam-misfit]");
		assert.ok(line, "the line under the heading");
		assert.match(line.textContent ?? "", /^Not every exam topic fits before 19 Nov\./);
		assert.equal(line.querySelector("button")?.textContent, "Ask the tutor");
	});
});
