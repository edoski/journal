/**
 * Today's row keys (Edo's notes, 15 Nov 2026, N3): ↑ ↓ walk Today's rows,
 * and ↑ on the first steps onto the map's You are here (round 20, m6); ⌘↵ opens the focused row's
 * course page (c until Home's composer took letters, Edo, 18 Nov 2026; o is
 * gone, since Enter opens a row as on every page). No key fires while he
 * types: there ⌘↵ is the composer's send.
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { courseHref } from "../components/unit-inbox/unit-href.ts";
import { lineOf, lines, mount, press, pushed, rows, unmount } from "./helpers/home-dom.tsx";

/** Which Today row holds focus, by its place; -1 for none. */
const at = () => lines().indexOf(lineOf(document.activeElement)!);

afterEach(unmount);

describe("Today's row keys (N3)", () => {
	it("↓ and ↑ walk Today's rows and the lessons Also today folds in, from the first to the last, and ↑ on the first leaves for the map (round 20, m6)", async () => {
		await mount();
		await press("ArrowDown", document.body);
		assert.equal(at(), 0, "↓ with nothing focused takes the first row, never a tab or a map card");
		await press("ArrowDown");
		assert.equal(at(), 1);
		await press("ArrowUp");
		assert.equal(at(), 0);
		await press("ArrowUp");
		assert.ok((document.activeElement as HTMLElement).matches('[data-slot="home-map-course"][data-shown] a[data-current]'), "↑ on the first row steps onto You are here");
		await press("Home");
		assert.equal(at(), 0, "Home from the map comes back to the first row");
		const every = [...document.querySelectorAll('[data-slot="study-home"] [data-line]')];
		assert.ok(every.length > lines().length, "the demo day folds lessons into Also today");
		for (let i = 0; i < every.length + 2; i++) await press("ArrowDown");
		assert.equal(every.indexOf(document.activeElement!), every.length - 1, "↓ goes on into the lessons Also today folds in, and stops at the last");
		assert.ok(document.activeElement!.closest('[data-slot="today-also"]'));
	});

	it("⌘↵ opens the focused row's course page; o and c no longer act", async () => {
		await mount();
		await press("ArrowDown", document.body);
		const first = lineOf(document.activeElement) as HTMLElement;
		let clicked = 0;
		first.addEventListener("click", (e) => {
			clicked++;
			e.preventDefault();
		});
		await press("o");
		await press("c");
		assert.equal(clicked, 0);
		assert.deepEqual(pushed, []);
		await press("Enter", document.activeElement!, { metaKey: true });
		const workspace = rows[0]!.course!.map.workspace;
		assert.deepEqual(pushed, [courseHref(workspace)]);
	});

	it("⌘↵ does nothing while he types: in a field it is the field's", async () => {
		await mount();
		const field = document.createElement("textarea");
		document.body.appendChild(field);
		field.focus();
		await press("Enter", field, { metaKey: true });
		assert.deepEqual(pushed, []);
		field.remove();
	});
});
