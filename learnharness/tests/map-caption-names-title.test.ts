/**
 * Round 15, 2 free (m36): with arc 4 shown, the course map's screen-reader
 * caption read "…You are at eigen.", a handle: it looked up where he is
 * among the shown arc's topics only. It names the topic by its title from
 * the whole course. Measured in a real Chrome.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startShell, type Shell } from "./helpers/browser-shell.ts";

let shell: Shell;
before(async () => {
	shell = await startShell({ entry: "tests/helpers/map-titles-page.tsx", ready: '[data-slot="course-map-node"]' });
});
after(async () => {
	await shell?.close();
});

describe("the map's caption", () => {
	it("names where he is by its title for a screen reader, whichever arc it draws", async () => {
		const page = await shell.open("browser", { search: "&arc=a3" });
		const caption = await page.evaluate(() => [...document.querySelectorAll("[id]")].map((el) => el.textContent ?? "").find((t) => t.includes("You are at")) ?? "");
		await page.close();
		assert.match(caption, /You are at Random variables and distributions\./);
	});
});
