/**
 * Round 16, m27 (4 minor 3): the Ask box opened holding a kept message
 * ("hello? did that go through? ") with the caret at its start, so the side
 * question he typed went out as "…even for 3x3?hello? did that go
 * through?". The one composer puts the caret after the words it opens
 * with, as the answer box does.
 */
import "./helpers/radix-dom.ts";
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createRoot, type Root } from "./helpers/app-render.tsx";
import { dom } from "./helpers/radix-dom.ts";
import { LessonSessionComposer } from "../components/lesson/lesson-composer.tsx";

let root: Root | null = null;
afterEach(async () => {
	await act(async () => root?.unmount());
	root = null;
	dom.document.body.innerHTML = "";
});

async function mount(value: string) {
	const host = dom.document.createElement("div");
	dom.document.body.appendChild(host);
	root = createRoot(host);
	await act(async () => root!.render(<LessonSessionComposer value={value} revision={0} onChange={() => {}} onSend={() => {}} onStop={() => {}} busy={false} sendAllowed />));
	return dom.document.querySelector("textarea")!;
}

describe("the composer opens with the caret after its words (round 16, m27)", () => {
	it("puts the caret at the end of a kept message", async () => {
		const kept = "hello? did that go through? ";
		const field = await mount(kept);
		assert.equal(field.selectionStart, kept.length);
		assert.equal(field.selectionEnd, kept.length);
	});

	it("leaves an empty field alone", async () => {
		const field = await mount("");
		assert.ok(!field.selectionStart, "nothing to step past");
	});
});
