/**
 * The sidebar's arrow keys (components/unit-inbox/sidebar-tree.ts): Up and
 * Down walk the rows, Right on a row with an action (Resume, Review) moves
 * to the action and Left goes back, and from the action the walk goes on
 * from its row.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseHTML } from "linkedom";
import type * as React from "react";
import { onSidebarTreeKeyDown } from "../components/unit-inbox/sidebar-tree.ts";

function list() {
	const { document } = parseHTML(`<html><body><ul id="list">
		<li><a href="/a" data-sidebar-row="a">A</a><button type="button" data-slot="row-action">Review</button></li>
		<li><a href="/b" data-sidebar-row="b">B</a><button type="button" data-slot="row-action" disabled>Start</button></li>
		<li><a href="/c" data-sidebar-row="c">C</a></li>
	</ul></body></html>`);
	const focused: string[] = [];
	for (const el of document.querySelectorAll("a, button")) {
		Object.assign(el, { focus: () => focused.push(el.getAttribute("data-sidebar-row") ?? `action:${el.previousElementSibling?.getAttribute("data-sidebar-row")}`) });
	}
	const ul = document.getElementById("list")!;
	const press = (key: string, target: Element) => {
		let prevented = false;
		onSidebarTreeKeyDown({ key, target, currentTarget: ul, metaKey: false, ctrlKey: false, altKey: false, preventDefault: () => (prevented = true) } as unknown as React.KeyboardEvent<HTMLElement>);
		return prevented;
	};
	const row = (k: string) => document.querySelector(`[data-sidebar-row="${k}"]`)!;
	const action = (k: string) => row(k).nextElementSibling!;
	return { focused, press, row, action };
}

describe("onSidebarTreeKeyDown", () => {
	it("moves from a row to its action on Right and back on Left", () => {
		const { focused, press, row, action } = list();
		assert.ok(press("ArrowRight", row("a")));
		assert.ok(press("ArrowLeft", action("a")));
		assert.deepEqual(focused, ["action:a", "a"]);
	});

	it("walks on from an action's row with Up and Down", () => {
		const { focused, press, action } = list();
		press("ArrowDown", action("a"));
		press("ArrowUp", action("a"));
		assert.deepEqual(focused, ["b"]);
	});

	it("leaves Right alone on a row with no action, or a disabled one", () => {
		const { focused, press, row } = list();
		assert.equal(press("ArrowRight", row("b")), false);
		assert.equal(press("ArrowRight", row("c")), false);
		assert.deepEqual(focused, []);
	});
});
