/**
 * The Proposed start surface (polish pass phase 2): the screen asks without
 * naming a mode and holds only the composer; the shared composer's proposed
 * variant. Same tsx classic-JSX shim as the other render tests.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { StartScreen } from "../components/start/start-screen.tsx";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { Composer } from "../components/composer.tsx";
import { ServerEventsProvider } from "../components/server-events.tsx";
function documentFor(node: React.ReactNode) {
	return parseHTML(`<html><body>${renderToStaticMarkup(node)}</body></html>`).document;
}

describe("the start screen (Proposed)", () => {
	const router = { push: () => {}, replace: () => {}, refresh: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} };
	const screen = (today: boolean) =>
		documentFor(
			<ServerEventsProvider>
				<AppRouterContext.Provider value={router as never}>
					<StartScreen initialConfigured today={today} />
				</AppRouterContext.Provider>
			</ServerEventsProvider>,
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

	it("holds the heading and the composer and nothing else", () => {
		for (const today of [true, false]) {
			const main = screen(today).querySelector('[data-slot="start-screen"]');
			assert.ok(main?.querySelector('[data-slot="composer"]'));
			assert.equal(main?.querySelectorAll("h1, h2, h3").length, 1);
			assert.doesNotMatch(main?.textContent ?? "", /Continue|Other courses|Exam in/);
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
