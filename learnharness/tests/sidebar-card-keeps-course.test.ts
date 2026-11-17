/**
 * Round 15, 4 minor 9 (m29; round 14, m35's remainder): a sidebar card
 * whose status was "You stopped the tutor" dropped its course's name
 * ("LA · You stopped the tutor"): the name gives way whole when the two do
 * not fit, and that status left it no room at the sidebar's width. Every
 * session status is now short enough to sit beside each course's name.
 * Measured in a real Chrome at the sidebar's default width.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startShell, type Shell } from "./helpers/browser-shell.ts";

let shell: Shell;
before(async () => {
	shell = await startShell({ entry: "tests/helpers/sidebar-cards-page.tsx", ready: '[data-testid="unit-row"]' });
});
after(async () => {
	await shell?.close();
});

describe("a sidebar card at the sidebar's default width", () => {
	it("shows its course's name beside every session status", async () => {
		const page = await shell.open("browser");
		await page.evaluate(() => document.fonts.ready);
		const cards = await page.evaluate(() =>
			[...document.querySelectorAll('[data-slot="unit-card-course"]')].map((line) => {
				const name = line.lastElementChild as HTMLElement;
				const status = line.parentElement!.querySelector('[data-slot="unit-status-slot"]')!;
				return { name: name.textContent, status: status.textContent, shown: Math.abs(name.getBoundingClientRect().top - line.getBoundingClientRect().top) < 1 };
			}),
		);
		await page.close();
		assert.equal(cards.length, 32);
		const dropped = cards.filter((c) => !c.shown).map((c) => `${c.name} · ${c.status}`);
		assert.deepEqual(dropped, [], "no card drops its course's name");
	});
});
