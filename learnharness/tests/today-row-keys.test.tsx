/**
 * Today's row keys (Edo's notes, 15 Nov 2026, N3): ↑ ↓ walk only Today's
 * rows, never the tabs or the map above them; o opens the focused row as a
 * click does, and c opens its course page. No key fires while he types.
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { courseHref } from "../components/unit-inbox/unit-href.ts";
import { lineOf, lines, mount, press, pushed, rows, unmount } from "./helpers/home-dom.tsx";

/** Which Today row holds focus, by its place; -1 for none. */
const at = () => lines().indexOf(lineOf(document.activeElement)!);

afterEach(unmount);

describe("Today's row keys (N3)", () => {
	it("↓ and ↑ walk only Today's rows and the lessons Also today folds in, from the first to the last and no further", async () => {
		await mount();
		await press("ArrowDown", document.body);
		assert.equal(at(), 0, "↓ with nothing focused takes the first row, never a tab or a map card");
		await press("ArrowDown");
		assert.equal(at(), 1);
		await press("ArrowUp");
		await press("ArrowUp");
		assert.equal(at(), 0, "↑ on the first row stays on it");
		const every = [...document.querySelectorAll('[data-slot="study-home"] [data-line]')];
		assert.ok(every.length > lines().length, "the demo day folds lessons into Also today");
		for (let i = 0; i < every.length + 2; i++) await press("ArrowDown");
		assert.equal(every.indexOf(document.activeElement!), every.length - 1, "↓ goes on into the lessons Also today folds in, and stops at the last");
		assert.ok(document.activeElement!.closest('[data-slot="today-also"]'));
	});

	it("o opens the focused row as a click does, and c opens its course page", async () => {
		await mount();
		await press("ArrowDown", document.body);
		const first = lineOf(document.activeElement) as HTMLElement;
		let clicked = 0;
		first.addEventListener("click", (e) => {
			clicked++;
			e.preventDefault();
		});
		await press("o");
		assert.equal(clicked, 1);
		await press("c");
		const workspace = rows[0]!.course!.map.workspace;
		assert.deepEqual(pushed, [courseHref(workspace)]);
	});

	it("o and c do nothing while he types", async () => {
		await mount();
		const field = document.createElement("textarea");
		document.body.appendChild(field);
		field.focus();
		await press("o", field);
		await press("c", field);
		assert.deepEqual(pushed, []);
		field.remove();
	});
});
