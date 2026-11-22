/**
 * The start surface (polish pass phase 2): the screen asks without naming a
 * mode and holds only the composer, the lesson's own (audit 17 Nov 2026,
 * finding 1: New lesson drew a second composer). Same tsx classic-JSX shim
 * as the other render tests.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "./helpers/app-render.tsx";
import { parseHTML } from "linkedom";
import { StartScreen } from "../components/start/start-screen.tsx";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { LessonComposer } from "../components/lesson/lesson-composer.tsx";
import { usePhotoDraft } from "../components/photos.tsx";
import { ServerEventsProvider } from "../components/server-events.tsx";
function documentFor(node: React.ReactNode) {
	return parseHTML(`<html><body>${renderToStaticMarkup(node)}</body></html>`).document;
}

describe("the start screen", () => {
	const router = { push: () => {}, replace: () => {}, refresh: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} };
	const screen = () =>
		documentFor(
			<ServerEventsProvider>
				<AppRouterContext.Provider value={router as never}>
					<StartScreen />
				</AppRouterContext.Provider>
			</ServerEventsProvider>,
		);

	it("offers no Teach/Practice switch and no proposition picker: the tutor routes the request", () => {
		const doc = screen();
		assert.ok(doc.querySelector('[data-testid="home-mode-switch"]') === null);
		assert.ok(doc.querySelector('[role="radiogroup"]') === null);
		assert.ok(doc.querySelector('[data-testid="practice-props-chip"]') === null);
		assert.doesNotMatch(doc.body.textContent ?? "", /\bTeach\b|\bPractice\b/);
	});

	it("holds the heading and the composer and nothing else", () => {
		const main = screen().querySelector('[data-slot="start-screen"]');
		assert.ok(main?.querySelector('[data-slot="composer"]'));
		assert.equal(main?.querySelectorAll("h1, h2, h3").length, 1);
		assert.doesNotMatch(main?.textContent ?? "", /Continue|Other courses|Exam in/);
	});

	it("asks one neutral question and, with no course picked, prompts for something new to learn", () => {
		const draft = screen();
		assert.equal(draft.querySelector("h1")?.textContent, "What do you want to work on?");
		assert.equal(draft.querySelector("textarea")?.getAttribute("placeholder"), "Name a course you're taking, or something you want to learn");
	});
});

/** Every part of a composer, as its slot and its classes, so two boxes
 *  that differ in any drawn part differ here. */
function anatomy(composer: Element | null | undefined): string[] {
	assert.ok(composer, "a composer is drawn");
	return [composer, ...composer.querySelectorAll("[data-slot]")].map((el) => `${el.getAttribute("data-slot")} ${el.getAttribute("class")}`);
}

describe("New lesson's composer", () => {
	it("is the lesson's composer, part for part", () => {
		const router = { push: () => {}, replace: () => {}, refresh: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} };
		const start = documentFor(
			<ServerEventsProvider>
				<AppRouterContext.Provider value={router as never}>
					<StartScreen />
				</AppRouterContext.Provider>
			</ServerEventsProvider>,
		).querySelector('[data-slot="composer"]');
		function Lesson() {
			const photos = usePhotoDraft();
			return <LessonComposer busy={false} value="" onChange={() => {}} onSend={() => {}} onStop={() => {}} canSend={false} photos={photos} />;
		}
		const lesson = documentFor(<Lesson />).querySelector('[data-slot="composer"]');
		assert.deepEqual(anatomy(start), anatomy(lesson));
	});
});
