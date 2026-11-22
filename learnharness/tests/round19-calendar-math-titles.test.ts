/**
 * Round 19, m7 (1 n4, 2 N5): Sun 15's "Properties of probability:
 * P(A∪B)=P(A)+P(E" was cut at the calendar column's edge: an inline
 * formula never breaks, and this one is wider than a week's column. A
 * calendar title's formula now breaks at its relations and operators,
 * KaTeX's own break points, as the course page's row titles do, so no
 * title runs past its cell. Measured in a real Chrome, with KaTeX's sheet,
 * in Edo's 1512×982 window beside the sidebar.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startShell, type Shell } from "./helpers/browser-shell.ts";

let shell: Shell;
before(async () => {
	shell = await startShell({ entry: "tests/helpers/calendar-titles-page.tsx", ready: '[data-slot="calendar-entry-title"] .katex', sheets: ["node_modules/katex/dist/katex.min.css"] });
});
after(async () => {
	await shell?.close();
});

/** Each calendar title's text, whether its box cuts it along its lines,
 *  and how far past its day's cell anything drawn in it reaches. */
function titles() {
	return [...document.querySelectorAll<HTMLElement>('[data-slot="calendar-entry-title"]')].map((title) => {
		const cell = title.closest<HTMLElement>('[role="cell"]')!.getBoundingClientRect();
		const box = title.getBoundingClientRect();
		// Past the cell: the title's box, or anything drawn in it (a formula's glyphs), right of the cell's edge; KaTeX's
		// MathML, for a screen reader, is clipped to nothing and drawn nowhere.
		const drawn = [...title.querySelectorAll("*")].filter((el) => !el.closest(".katex-mathml"));
		const right = Math.max(box.right, ...drawn.map((el) => el.getBoundingClientRect().right));
		return { text: title.textContent, cut: title.scrollWidth > title.clientWidth + 0.5, past: right - cell.right, width: Math.round(cell.width) };
	});
}

describe("a calendar title with maths (round 19, m7)", () => {
	it("stays inside its cell, in the week and in the month", async () => {
		const page = await shell.open("browser");
		await page.evaluate(() => document.fonts.ready);
		const settle = () => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
		await settle();
		const week = await page.evaluate(titles);
		await page.click('[data-testid="calendar-view-month"]');
		await page.waitForSelector('[data-slot="calendar-entry-title"].line-clamp-2');
		await settle();
		const month = await page.evaluate(titles);
		await page.close();
		for (const [view, seen] of [["week", week], ["month", month]] as const) {
			assert.ok(seen.some((t) => t.text?.startsWith("Properties of probability")), `${view}: ${JSON.stringify(seen)}`);
			for (const title of seen) {
				assert.ok(!title.cut, `${view}: "${title.text}" is not cut in its ${title.width}px cell`);
				assert.ok(title.past <= 0.5, `${view}: "${title.text}" ends inside its cell (${title.past.toFixed(1)}px past it)`);
			}
		}
	});
});
