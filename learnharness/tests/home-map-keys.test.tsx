/**
 * Home's map keys (Edo's notes, 15 Nov 2026, N2): ← → move the map to the
 * course left or right of the chosen one, from anywhere on Home, and f
 * presses the map's enlarge button. No key fires while he types or while a
 * dialog is open.
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { lines, mount, press, tab, tabTitles, unmount } from "./helpers/home-dom.tsx";

afterEach(unmount);

describe("Home's map keys (N2)", () => {
	it("← and → move to the course left or right of the chosen one, from anywhere on Home", async () => {
		await mount();
		const titles = tabTitles();
		// The map rests on the course he last studied (round 15, 3 free); walk to the first tab.
		for (const _ of titles) await press("ArrowLeft");
		assert.equal(tab(), titles[0]);
		await press("ArrowRight");
		assert.equal(tab(), titles[1]);
		await press("ArrowRight");
		assert.equal(tab(), titles[2]);
		await press("ArrowLeft");
		assert.equal(tab(), titles[1]);
		(lines()[0] as HTMLElement).focus();
		await press("ArrowLeft");
		assert.equal(tab(), titles[0], "a focused Today row does not keep ← from the map");
	});

	it("f presses the enlarge button, and again brings the map back", async () => {
		await mount();
		await press("f");
		assert.ok(document.querySelector('[data-slot="home-map"][data-enlarged]'));
		await press("f");
		assert.ok(document.querySelector('[data-slot="home-map"][data-enlarged]') === null);
	});

	it("never fires while he types in a field or while a dialog is open", async () => {
		await mount();
		const resting = tab();
		const field = document.createElement("input");
		document.body.appendChild(field);
		field.focus();
		await press("ArrowRight", field);
		await press("f", field);
		assert.equal(tab(), resting);
		assert.ok(document.querySelector('[data-slot="home-map"][data-enlarged]') === null);
		field.remove();
		const dialog = document.createElement("div");
		dialog.setAttribute("role", "dialog");
		document.body.appendChild(dialog);
		await press("f", document.body);
		assert.ok(document.querySelector('[data-slot="home-map"][data-enlarged]') === null);
		dialog.remove();
	});
});

