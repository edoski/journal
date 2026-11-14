/** The reading lessons' composer (lesson-composer.md): static markup. */

import React from "react";
(globalThis as Record<string, unknown>).React = React; // tsx classic-JSX shim (see render-cards.test.tsx)

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ComposerChip, LessonComposer } from "../components/lesson/lesson-composer.tsx";

const noop = () => {};
const composer = (props: Partial<React.ComponentProps<typeof LessonComposer>> = {}) =>
	renderToStaticMarkup(<LessonComposer busy={false} value="" onChange={noop} onSend={noop} onStop={noop} canSend={false} {...props} />);
describe("the lesson composer", () => {
	it("draws T3 Code's anatomy: a 16px card, a 14px field of two lines growing to 208px, a 32px round send", () => {
		const html = composer();
		assert.match(html, /data-testid="composer"/);
		assert.match(html, /rounded-\[16px\]/);
		assert.match(html, /data-slot="composer-body" class="px-4 pt-4 pb-2"/);
		assert.match(html, /min-h-\[calc\(2lh\+0\.5rem\)\]/);
		assert.match(html, /max-h-52/);
		assert.match(html, /text-control leading-relaxed/);
		assert.match(html, /data-slot="composer-send"[^>]*aria-label="Send"/);
		assert.match(html, /size-8/);
	});

	it("takes a host's placeholder and its quiet chips before the send", () => {
		const html = composer({ placeholder: "Your prediction, and why", toolbar: <ComposerChip pressed>Confident</ComposerChip> });
		assert.match(html, /placeholder="Your prediction, and why"/);
		assert.match(html, /data-slot="composer-chip"[^>]*aria-pressed="true"/);
		assert.ok(html.indexOf("composer-chip") < html.indexOf("composer-send"), "chips sit before the send");
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

	it("keeps today's moves: Stop while a turn runs on an empty field, Next problem in the practice pause", () => {
		assert.match(composer({ busy: true }), /aria-label="Stop"/);
		assert.match(composer({ busy: true, canSend: true }), /aria-label="Send"/);
		assert.match(composer({ nextProblem: true, onNext: noop }), /data-testid="next-problem-button"/);
	});
});
