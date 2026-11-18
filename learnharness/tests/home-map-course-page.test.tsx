/**
 * The way from Home's map to a course page (Edo's notes, 15 Nov 2026, N4:
 * "honestly i just dont like this", of the header's "Course page →"
 * link): the link is gone; pressing the course tab already chosen opens
 * its course page, pressing another only shows its map, and ⌘↵ with no
 * Today row focused opens the shown course's page.
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { dom } from "./helpers/radix-dom.ts";
import { act } from "react";
import { courseHref } from "../components/unit-inbox/unit-href.ts";
import { mount, press, pushed, tab, tabTitles, unmount } from "./helpers/home-dom.tsx";
import { COURSES } from "./fixtures/now-demo.ts";

afterEach(unmount);

const workspaceOf = (title: string) => COURSES.find((c) => c.map.title === title)!.map.workspace;
const trigger = (title: string) => [...document.querySelectorAll<HTMLElement>('[data-slot="home-map-tabs"] [data-slot="tabs-trigger"]')].find((t) => t.textContent === title)!;

/** A press with the mouse, as the browser sends it: pointer down, mouse down, click. */
async function pressWithPointer(el: HTMLElement) {
	for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
		const event = new dom.window.Event(type, { bubbles: true, cancelable: true });
		Object.assign(event, { button: 0, buttons: 1, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, detail: 1, pointerType: "mouse" });
		await act(async () => {
			el.dispatchEvent(event as unknown as Event);
		});
	}
}

describe("Home's map header and the course page (N4)", () => {
	it("draws no Course page link: the tabs, then the enlarge control", async () => {
		await mount();
		assert.equal(document.querySelectorAll('[data-slot="home-map-course-page"]').length, 0);
		assert.equal([...document.querySelectorAll("[data-slot=home-map] a")].some((a) => /Course page/.test(a.textContent ?? "")), false);
	});

	it("pressing another tab only shows its map; pressing the chosen tab opens its course page", async () => {
		await mount();
		const first = tab()!;
		const second = (tabTitles() as string[]).find((title) => title !== first);
		await pressWithPointer(trigger(second!));
		assert.equal(tab(), second);
		assert.deepEqual(pushed, [], "a tab not yet chosen only shows its map");
		await pressWithPointer(trigger(second!));
		assert.deepEqual(pushed, [courseHref(workspaceOf(second!))]);
		assert.notEqual(first, second);
	});

	it("⌘↵ with no Today row focused opens the shown course's page (c until 18 Nov 2026)", async () => {
		await mount();
		await press("ArrowRight", document.body);
		await press("Enter", document.body, { metaKey: true });
		assert.deepEqual(pushed, [courseHref(workspaceOf(tab()!))]);
	});
});
