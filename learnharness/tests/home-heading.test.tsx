/**
 * Home's heading names an exam in the coming week by its day (round 8, 1 §2)
 * and never asks above an empty list (round 8, 4 §2).
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { dayQuestion, nearExam, nothingTodayWords } from "../components/study-home/day-record.ts";
import { Today } from "../components/study-home/today.tsx";

describe("Home's heading (1 §2, 4 §2)", () => {
	const render = (node: React.ReactNode) => parseHTML(`<html><body>${renderToStaticMarkup(node)}</body></html>`).document;

	it("names an exam in the coming week by its day, and only then", () => {
		const exam = nearExam([
			{ course: "Linear Algebra", date: "2026-12-03", daysLeft: 24 },
			{ course: "Probability", date: "2026-11-19", daysLeft: 2 },
		]);
		assert.deepEqual(exam, { course: "Probability", date: "2026-11-19", daysLeft: 2 });
		assert.equal(dayQuestion(10, false, exam), "What are we studying for Thursday's Probability exam?");
		assert.equal(dayQuestion(10, true, exam), "What else are we studying for Thursday's Probability exam?");
		assert.equal(dayQuestion(10, false, { ...exam!, daysLeft: 1 }), "What are we studying for tomorrow's Probability exam?");
		assert.equal(dayQuestion(10, false, { ...exam!, daysLeft: 0 }), "What are we studying before today's Probability exam?");
		assert.equal(nearExam([{ course: "Probability", date: "2026-11-19", daysLeft: 10 }]), null);
		assert.equal(dayQuestion(10, false, null), "What are we studying this morning?");
	});

	it("says nothing is left instead of asking above an empty list", () => {
		const empty = render(<Today rows={[]} done={["Rank practice"]} busy={false} onContinue={() => {}} />);
		assert.equal(empty.querySelector("[data-slot=day-heading]")?.textContent, nothingTodayWords(true));
		assert.equal(nothingTodayWords(true), "Nothing else is planned today");
		assert.equal(nothingTodayWords(false), "Nothing is planned today");
		assert.doesNotMatch(empty.querySelector("[data-slot=day-heading]")?.textContent ?? "", /\?/);
	});

	// Round 17, M2 (1 M2): two days before the exam nine of its topics fell after it, and Home read only "What
	// are we studying for Thursday's Probability exam?". Under the question it names them, by name and never by count,
	// as the course head does, with the one act that helps: Ask the tutor.
	it("names, under the exam's question, the topics with no room before it, with Ask the tutor", () => {
		const exam = { course: "Probability", date: "2026-11-19", daysLeft: 2, workspace: "/s/prob", wontFit: ["Poisson distribution", "Geometric distribution", "Variance"] };
		const page = render(<Today rows={[]} done={[]} exam={exam} busy={false} onContinue={() => {}} />);
		const line = page.querySelector("[data-slot=today-exam-misfit]");
		assert.ok(line, "the line under the heading");
		assert.match(line.textContent ?? "", /^No room before the exam to start Poisson distribution, Geometric distribution and Variance/);
		assert.doesNotMatch(line.textContent ?? "", /\d/, "no count");
		assert.equal(line.querySelector("button")?.textContent, "Ask the tutor");
		const fits = render(<Today rows={[]} done={[]} exam={{ ...exam, wontFit: [] }} busy={false} onContinue={() => {}} />);
		assert.ok(fits.querySelector("[data-slot=today-exam-misfit]") === null, "nothing while every topic fits");
	});
});
