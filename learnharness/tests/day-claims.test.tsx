/**
 * The cross-surface journey's readers of a drawn day (helpers/day-claims.ts),
 * on the words that misled them. On 18 Nov a demo world where the 8 Nov
 * review also answered Homomorphisms and Mechanics of matrix multiplication,
 * which the plan had moved to 9 Nov, failed five journey steps: the journey
 * read both topic pages as "Scheduled Sun 8 Nov" and the course brief as
 * starting Linear maps on 11 Nov, while every surface drew 10 Nov. The
 * Scheduled row's words run together ("ReviewTue 10 NovMoved from 9 Nov after
 * your answer today"), so the day was taken from the note's "today"; and a
 * brief note naming a title with parentheses ("since Homomorphisms (linear
 * maps) is not solid yet") left its tail behind the start it followed.
 */
import React from "react";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseHTML } from "linkedom";
import { renderToStaticMarkup } from "./helpers/app-render.tsx";
import { ScheduledEntry } from "../components/unit-inbox/topic-page/pickup/pickup-parts.tsx";
import { briefDays, daysIn, scheduledDay } from "./helpers/day-claims.ts";

const TODAY = "2026-11-08";

describe("the journey's day readers", () => {
	it("read a day with no year as the one nearest today, across the new year (round 17: Mon 4 Jan read as 2026, a Sunday)", () => {
		assert.deepEqual(daysIn("Planned Mon 4 Jan", "2026-11-17"), ["2027-01-04"]);
		assert.deepEqual(daysIn("Due Mon 28 Dec", "2027-01-03"), ["2026-12-28"]);
		assert.deepEqual(daysIn("Planned Tue 10 Nov", "2026-11-08"), ["2026-11-10"]);
	});

	it("read a Scheduled row's day from its date, not from a day its note names", () => {
		const { document } = parseHTML(`<html><body>${renderToStaticMarkup(<ScheduledEntry kind="review" day="Tue 10 Nov" waits="Moved from 9 Nov after your answer today" />)}</body></html>`);
		assert.equal(scheduledDay(document.querySelector('[data-slot="pickup-scheduled"]'), TODAY), "2026-11-10");
	});

	it("read a brief's plan line whole, whatever parentheses its titles and notes hold", () => {
		const brief = [
			"Linear Algebra (this course) · exam Thu 3 Dec",
			"- Tue 10 Nov: review Determinants: definition and properties (moved from Mon 9 Nov, yesterday's plan was not finished), Gauss-Jordan reduction and reduced echelon form, Homomorphisms (linear maps) (moved from Mon 9 Nov after your answer today), Mechanics of matrix multiplication (moved from Mon 9 Nov after your answer today); start Linear maps and their matrices (moved from Mon 9 Nov, since Homomorphisms (linear maps) is not solid yet)",
			"- Wed 11 Nov: review Linear maps and their matrices, Subspaces and spanning sets (earlier days are full)",
			"Probability · exam Thu 19 Nov",
			"- Tue 17 Nov: review Odds (moved from Mon 16 Nov, yesterday's plan was not finished), Properties of probability: $P(A \\cup B) = P(A) + P(B) - P(A \\cap B)$ (moved from Sun 15 Nov, yesterday's plan was not finished), Inclusion-exclusion principle",
		].join("\n");
		const courses = new Set(["Linear Algebra", "Probability"]);
		const la = ["Homomorphisms (linear maps)", "Mechanics of matrix multiplication", "Linear maps and their matrices", "Determinants: definition and properties", "Subspaces and spanning sets"];
		assert.deepEqual(Object.fromEntries(briefDays(brief, courses, "Linear Algebra", la, TODAY)), {
			"Determinants: definition and properties": "2026-11-10",
			"Homomorphisms (linear maps)": "2026-11-10",
			"Mechanics of matrix multiplication": "2026-11-10",
			"Linear maps and their matrices": "2026-11-10",
			"Subspaces and spanning sets": "2026-11-11",
		});
		const pr = ["Odds", "Properties of probability: $P(A \\cup B) = P(A) + P(B) - P(A \\cap B)$", "Inclusion-exclusion principle"];
		assert.deepEqual(Object.fromEntries(briefDays(brief, courses, "Probability", pr, TODAY)), Object.fromEntries(pr.map((title) => [title, "2026-11-17"])));
	});
});
