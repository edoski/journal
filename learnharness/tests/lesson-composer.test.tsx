/** The reading lessons' composer (lesson-composer.md): static markup. */

import React from "react";
(globalThis as Record<string, unknown>).React = React; // tsx classic-JSX shim (see render-cards.test.tsx)

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ComposerIcon, LessonComposer } from "../components/lesson/lesson-composer.tsx";

const noop = () => {};
const composer = (props: Partial<React.ComponentProps<typeof LessonComposer>> = {}) =>
	renderToStaticMarkup(<LessonComposer busy={false} value="" onChange={noop} onSend={noop} onStop={noop} canSend={false} {...props} />);
describe("the lesson composer", () => {
	it("draws T3 Code's anatomy: a 16px card, a 13px field (Body) of two lines growing to 208px, a 32px round send", () => {
		const html = composer();
		assert.match(html, /data-testid="composer"/);
		assert.match(html, /rounded-\[16px\]/);
		assert.match(html, /data-slot="composer-body" class="px-4 pt-4 pb-2"/);
		assert.match(html, /min-h-\[calc\(2lh\+0\.5rem\)\]/);
		assert.match(html, /max-h-52/);
		assert.match(html, /text-body leading-relaxed/);
		assert.match(html, /data-slot="composer-send"[^>]*aria-label="Send"/);
		assert.match(html, /size-8/);
	});

	it("takes a host's placeholder, its icons beside attach and its controls before the send", () => {
		const html = composer({
			placeholder: "Your prediction, and why",
			leading: <ComposerIcon aria-label="Hint" data-testid="hint">H</ComposerIcon>,
			toolbar: <ComposerIcon pressed aria-label="How sure you are: Confident">C</ComposerIcon>,
		});
		assert.match(html, /placeholder="Your prediction, and why"/);
		assert.match(html, /data-slot="composer-leading"[^>]*>.*data-testid="hint"/);
		assert.match(html, /data-slot="composer-control"[^>]*aria-pressed="true"/);
		assert.ok(html.indexOf("composer-controls") < html.indexOf("composer-send"), "controls sit before the send");
		assert.ok(html.indexOf("composer-leading") < html.indexOf("composer-controls"), "the icons lead, on the left");
	});

	it("submits an answer in answer mode, ready or not, whatever the field holds", () => {
		const ready = composer({ answer: { onSubmit: noop, ready: true } });
		assert.match(ready, /data-mode="answer"/);
		assert.match(ready, /aria-label="Submit answer"/);
		assert.match(ready, /aria-label="Your answer"/);
		assert.doesNotMatch(ready, /aria-label="Submit answer"[^>]*disabled=""/);
		const waiting = composer({ answer: { onSubmit: noop, ready: false, label: "Check" } });
		assert.match(waiting, /disabled=""[^>]*aria-label="Check"|aria-label="Check"[^>]*disabled=""/);
	});

	it("shows the stop square while a turn runs and the work can't be submitted yet, never a dead send arrow (round 10, 4 minor 6)", () => {
		const closing = composer({ busy: true, answer: { onSubmit: noop, ready: false, label: "Submit your work" } });
		assert.match(closing, /aria-label="Stop"/);
		assert.doesNotMatch(closing, /aria-label="Stop"[^>]*disabled=""|disabled=""[^>]*aria-label="Stop"/, "the square stops the turn by a click");
		assert.match(composer({ busy: true, answer: { onSubmit: noop, ready: true } }), /aria-label="Submit answer"/, "an answer that can go, goes");
	});

	it("keeps today's moves: Stop while a turn runs on an empty field, Next problem in the practice pause", () => {
		assert.match(composer({ busy: true }), /aria-label="Stop"/);
		assert.match(composer({ busy: true, canSend: true }), /aria-label="Send"/);
		assert.match(composer({ nextProblem: true, onNext: noop }), /data-testid="next-problem-button"/);
	});

	it("as one row (collapsible), keeps send on the right in both states and grows the field from one line to three as he focuses it", () => {
		const rest = composer({ collapsible: true });
		assert.match(rest, /data-collapsed="true"/);
		assert.match(rest, /data-slot="composer-row"/);
		assert.ok(rest.indexOf('data-slot="composer-body"') < rest.indexOf('data-slot="composer-send"'), "the field, then send at the row's end");
		assert.match(rest, /min-h-\[calc\(1lh\+0\.5rem\)\]/, "one line at rest");
		assert.match(rest, /transition-\[min-height\]/, "the growth is animated");
		const typed = composer({ collapsible: true, value: "eigen" });
		assert.ok(!/data-collapsed/.test(typed), "words open it");
		assert.match(typed, /min-h-\[calc\(3lh\+0\.5rem\)\]/, "three lines open");
	});
});
