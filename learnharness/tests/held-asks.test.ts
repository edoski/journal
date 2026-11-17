/**
 * Round 15, 4 free (m33): ⌘N, then ⌘O at once, and the course menu did not
 * open; the second ⌘O did. The new lesson page is rendered by the server,
 * so the first ⌘O reached no course picker. A surface's key pressed while
 * the page a shortcut asked for is on its way now waits for that page's
 * surface, and is dropped if another page shows.
 */
import "./helpers/radix-dom.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { askSurface, navigatingTo, pageShown, takeHeld } from "../components/held-asks.ts";
import { kbdEventForAction } from "../src/core/index.ts";

describe("a key for the page on its way", () => {
	it("⌘O right after ⌘N opens the new lesson's course menu as it mounts, once", () => {
		navigatingTo("/chat/new");
		askSurface("pick-course");
		pageShown("/chat/new");
		assert.equal(takeHeld("pick-course", "/chat/new"), true);
		assert.equal(takeHeld("pick-course", "/chat/new"), false, "taken once");
	});

	it("a picker on the page takes it at once, and nothing waits", () => {
		const name = kbdEventForAction("pick-course");
		let opened = 0;
		const onPick = (e: Event) => {
			e.preventDefault();
			opened++;
		};
		window.addEventListener(name, onPick);
		try {
			navigatingTo("/chat/new");
			askSurface("pick-course");
		} finally {
			window.removeEventListener(name, onPick);
		}
		assert.equal(opened, 1);
		pageShown("/chat/new");
		assert.equal(takeHeld("pick-course", "/chat/new"), false);
	});

	it("never fires on another page, or with no page on its way", () => {
		navigatingTo("/chat/new");
		askSurface("pick-course");
		pageShown("/");
		assert.equal(takeHeld("pick-course", "/chat/new"), false, "he went somewhere else");
		askSurface("pick-course");
		assert.equal(takeHeld("pick-course", "/"), false, "nothing on its way: a ⌘O with no picker does nothing");
	});
});
