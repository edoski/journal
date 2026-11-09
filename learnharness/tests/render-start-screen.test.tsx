/**
 * The Proposed start surface (polish pass phase 2): Today's course lines
 * read the engine's facts and start sessions through the shared path; the
 * shared composer's proposed variant. Same tsx classic-JSX shim as the
 * other render tests.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { courseLine } from "../components/start/course-facts.ts";
import { CourseLines } from "../components/start/course-lines.tsx";
import { startHeading } from "../components/start/start-screen.tsx";
import { Composer } from "../components/composer.tsx";
import type { CourseSummary } from "../src/core/index.ts";

function course(over: Partial<CourseSummary>): CourseSummary {
	return { workspace: "/study/linalg", title: "Linear Algebra", due: 0, current: null, task: null, step: null, exam: null, mostOverdue: null, ...over };
}

const LINALG = course({
	due: 6,
	mostOverdue: "Linear independence",
	exam: { date: "2026-11-29", daysLeft: 21 },
	task: "Problem sheet 4",
	step: "Part (c)",
	current: "rank",
});

function documentFor(node: React.ReactNode) {
	return parseHTML(`<html><body>${renderToStaticMarkup(node)}</body></html>`).document;
}

describe("Today course line", () => {
	it("states the exam countdown, the reviews due with the most overdue topic, and the open task's step", () => {
		const line = courseLine(LINALG);
		assert.equal(line.exam, "Exam in 21 days");
		assert.equal(line.reviews, "6 reviews due, most overdue: Linear independence");
		assert.equal(line.next, "Part (c)");
	});

	it("words the exam day and the day before, and drops a past exam", () => {
		assert.equal(courseLine(course({ exam: { date: "d", daysLeft: 0 } })).exam, "Exam today");
		assert.equal(courseLine(course({ exam: { date: "d", daysLeft: 1 } })).exam, "Exam tomorrow");
		assert.equal(courseLine(course({ exam: { date: "d", daysLeft: -2 } })).exam, null);
	});

	it("offers Review only when something is due and Continue only with a task or a current topic", () => {
		const idle = courseLine(course({}));
		assert.equal(idle.review, null);
		assert.equal(idle.continue, null);
		assert.equal(idle.reviews, null);
		assert.deepEqual(courseLine(course({ current: "bayes" })).continue, { opening: "Continue where I left off", hint: "Continue Linear Algebra" });
		assert.equal(courseLine(course({ due: 1, mostOverdue: "Span" })).reviews, "1 review due: Span");
	});

	it("opens Review as a practice of what's due and Continue at the open task", () => {
		const line = courseLine(LINALG);
		assert.deepEqual(line.review, { opening: "Review what's due" });
		assert.deepEqual(line.continue, { opening: "Continue Problem sheet 4", hint: "Problem sheet 4: Part (c)" });
	});

	it("renders one entry per course with its actions, and a New course entry when there are none", () => {
		const doc = documentFor(
			<CourseLines courses={[LINALG, course({ workspace: "/study/prob", title: "Probability" })]} disabled={false} onReview={() => {}} onContinue={() => {}} onNewCourse={() => {}} />,
		);
		const lines = [...doc.querySelectorAll('[data-slot="course-line"]')];
		assert.equal(lines.length, 2);
		assert.deepEqual([...lines[0]!.querySelectorAll("button")].map((b) => b.getAttribute("aria-label")), ["Review Linear Algebra", "Continue Linear Algebra"]);
		assert.equal(lines[1]!.querySelectorAll("button").length, 0);
		assert.match(lines[0]!.textContent ?? "", /Exam in 21 days · 6 reviews due/);
		assert.doesNotMatch(doc.body.textContent ?? "", /%|streak|level/i);
		const empty = documentFor(<CourseLines courses={[]} disabled={false} onReview={() => {}} onContinue={() => {}} onNewCourse={() => {}} />);
		assert.match(empty.body.textContent ?? "", /No courses yet\..*New course/);
	});

	it("asks the day's question on Today and the session's on the draft", () => {
		assert.equal(startHeading(true, "teach"), "What are we learning today?");
		assert.equal(startHeading(false, "practice"), "What do you want to practise?");
	});
});

describe("Composer proposed variant", () => {
	const props = { busy: false, value: "", onChange: () => {}, onSend: () => {}, onStop: () => {}, canSend: false };

	it("draws one surface with the toolbar's controls and a round send", () => {
		const doc = documentFor(<Composer {...props} variant="proposed" toolbar={<button type="button">Course</button>} />);
		const surface = doc.querySelector('[data-slot="composer"]');
		assert.ok(surface);
		assert.equal(surface.querySelector('[data-slot="composer-toolbar"] button')?.textContent, "Course");
		const send = surface.querySelector('[data-slot="composer-send"]');
		assert.equal(send?.getAttribute("aria-label"), "Send");
		assert.ok(send?.hasAttribute("disabled"));
	});

	it("keeps the current composer when no variant is given", () => {
		const doc = documentFor(<Composer {...props} />);
		assert.equal(doc.querySelector('[data-slot="composer"]'), null);
		assert.ok(doc.querySelector('[data-testid="composer"]'));
	});
});
