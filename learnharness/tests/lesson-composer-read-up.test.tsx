/**
 * A lesson's composer as he reads up the conversation (components/lesson/
 * lesson-composer.tsx, `compact`): the field keeps one place in the tree, so
 * folding never remounts it and drops its focus unseen (17 Nov 2026: a
 * focused field stayed open while he read up, its focus lost); an empty
 * field lets go of focus and the composer folds to one row, while a field
 * holding words keeps focus and stays open.
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;

import "./helpers/radix-dom.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createRoot, type Root } from "./helpers/app-render.tsx";
import { LessonComposer } from "../components/lesson/lesson-composer.tsx";

const noop = () => {};
let root: Root | null = null;
afterEach(async () => {
	await act(async () => root?.unmount());
	root = null;
	document.body.innerHTML = "";
});

async function lesson(value: string) {
	const host = document.createElement("div");
	document.body.appendChild(host);
	root = createRoot(host);
	const draw = (compact: boolean) => act(async () => root!.render(<LessonComposer busy={false} value={value} onChange={noop} onSend={noop} onStop={noop} canSend compact={compact} />));
	await draw(false);
	const field = document.querySelector("textarea")!;
	await act(async () => field.focus());
	assert.ok(document.activeElement === field, "he is in the field");
	return { field, readUp: () => draw(true) };
}

const composer = () => document.querySelector('[data-slot="composer"]')!;

describe("a lesson's composer as he reads up", () => {
	it("folds to one row from an empty focused field, the field the same one", async () => {
		const { field, readUp } = await lesson("");
		await readUp();
		assert.ok(document.querySelector("textarea") === field, "the field never remounts");
		assert.ok(document.activeElement !== field, "the empty field let go of focus");
		assert.ok(composer().hasAttribute("data-collapsed"), "the composer is one row");
	});

	it("stays open with his words, the field keeping focus", async () => {
		const { field, readUp } = await lesson("Eigenvalues are");
		await readUp();
		assert.ok(document.querySelector("textarea") === field);
		assert.ok(document.activeElement === field, "his words keep the field focused");
		assert.ok(!composer().hasAttribute("data-collapsed"));
	});
});
