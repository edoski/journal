/**
 * Round 15, 1 m8 and 4 minor 11 (m28): Home's You are here card and the
 * course page's map cut "Random variables and distri…", against Edo's rule
 * (map titles stay on one line, and You are here and its next topics are
 * whole), and a card's header cut "Right on your own, check another …".
 * Every card on a course's map now shares a box as wide as the course's
 * widest title needs on one line, and the header says the short standing.
 * Measured in a real Chrome at 1512×982.
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

describe("a course's map", () => {
	it("draws every title whole on one line, and each card's standing whole", async () => {
		const page = await shell.open("browser");
		await page.evaluate(() => document.fonts.ready);
		await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
		const cards = await page.evaluate(() =>
			[...document.querySelectorAll('[data-slot="course-map-node"]')].map((card) => {
				const title = card.querySelector('[data-slot="base-node-content"] > :last-child') as HTMLElement;
				const standing = card.querySelector('[data-slot="topic-standing"]') as HTMLElement | null;
				return {
					title: title.textContent,
					oneLine: title.getBoundingClientRect().height < 2 * parseFloat(getComputedStyle(title).lineHeight),
					uncut: title.scrollWidth <= title.clientWidth + 0.5,
					standing: standing?.textContent ?? null,
					standingUncut: standing ? standing.scrollWidth <= standing.clientWidth + 0.5 : true,
				};
			}),
		);
		await page.close();
		const here = cards.find((c) => c.title?.startsWith("Random variables"));
		assert.equal(here?.title, "Random variables and distributions", "You are here's title, whole");
		for (const card of cards) {
			assert.ok(!card.title?.includes("…") && card.uncut, `${card.title}: whole`);
			assert.ok(card.oneLine, `${card.title}: on one line`);
			assert.ok(card.standingUncut && !card.standing?.includes("…"), `${card.title}'s standing whole: ${card.standing}`);
		}
		assert.ok(cards.some((c) => c.standing === "Right on your own"), "the short standing, with no check-another-day words");
	});

});
