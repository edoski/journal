/**
 * The Proposed start surface (polish pass phase 2): Today's course chips
 * read the engine's facts and start sessions through the shared path; the
 * screen asks without naming a mode; the shared composer's proposed variant. Same tsx classic-JSX shim as the
 * other render tests.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { courseChip, examText } from "../components/start/course-facts.ts";
import { CourseChips } from "../components/start/course-chips.tsx";
import { StartScreen } from "../components/start/start-screen.tsx";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
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

describe("Today course chips", () => {
	it("names the course and the reviews due, and says in the tooltip what the session takes up", () => {
		const chip = courseChip(LINALG);
		assert.equal(chip.title, "Linear Algebra");
		assert.equal(chip.due, "6 due");
		assert.equal(chip.hint, "6 reviews due, then Problem sheet 4: Part (c)");
	});

	it("drops the count with nothing due and the tooltip with nothing to take up", () => {
		const idle = courseChip(course({}));
		assert.equal(idle.due, null);
		assert.equal(idle.hint, null);
		assert.equal(courseChip(course({ due: 1 })).hint, "1 review due");
		assert.equal(courseChip(course({ task: "Sheet 2" })).hint, "Sheet 2");
	});

	it("words the exam day and the day before, and drops a past exam", () => {
		assert.equal(examText({ date: "d", daysLeft: 21 }), "Exam in 21 days");
		assert.equal(examText({ date: "d", daysLeft: 0 }), "Exam today");
		assert.equal(examText({ date: "d", daysLeft: 1 }), "Exam tomorrow");
		assert.equal(examText({ date: "d", daysLeft: -2 }), null);
		assert.equal(examText(null), null);
	});

	it("renders one chip per course, and a New course chip when there are none", () => {
		const doc = documentFor(
			<CourseChips courses={[LINALG, course({ workspace: "/study/prob", title: "Probability" })]} disabled={false} onStart={() => {}} onNewCourse={() => {}} />,
		);
		const chips = [...doc.querySelectorAll('[data-slot="course-chip"]')];
		assert.deepEqual(chips.map((c) => c.textContent), ["Linear Algebra· 6 due", "Probability"]);
		assert.equal(chips[0]!.getAttribute("aria-label"), "Linear Algebra: 6 reviews due, then Problem sheet 4: Part (c)");
		assert.doesNotMatch(doc.body.textContent ?? "", /%|streak|level/i);
		const empty = documentFor(<CourseChips courses={[]} disabled={false} onStart={() => {}} onNewCourse={() => {}} />);
		assert.match(empty.body.textContent ?? "", /New course/);
	});

});

describe("the start screen (Proposed)", () => {
	const router = { push: () => {}, replace: () => {}, refresh: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} };
	const screen = (today: boolean) =>
		documentFor(
			<AppRouterContext.Provider value={router as never}>
				<StartScreen initialConfigured today={today} />
			</AppRouterContext.Provider>,
		);

	it("offers no Teach/Practice switch and no proposition picker: the tutor routes the request", () => {
		for (const today of [true, false]) {
			const doc = screen(today);
			assert.equal(doc.querySelector('[data-testid="home-mode-switch"]'), null);
			assert.equal(doc.querySelector('[role="radiogroup"]'), null);
			assert.equal(doc.querySelector('[data-testid="practice-props-chip"]'), null);
			assert.doesNotMatch(doc.body.textContent ?? "", /\bTeach\b|\bPractice\b/);
		}
	});

	it("asks one neutral question and prompt, whichever entry opened the draft", () => {
		assert.equal(screen(true).querySelector("h1")?.textContent, "What are we learning today?");
		const draft = screen(false);
		assert.equal(draft.querySelector("h1")?.textContent, "What do you want to work on?");
		assert.equal(draft.querySelector("textarea")?.getAttribute("placeholder"), "Name a topic, ask a question or paste a problem");
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
