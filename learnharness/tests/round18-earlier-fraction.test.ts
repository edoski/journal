/**
 * Round 18, m21 (2 m8). Random variables' Earlier read "…normalised
 * m(k) = ck correctly to c =", then "1/10" alone on the next line: the
 * row lets a formula break at its relations, so a wide one never runs
 * past the column (round 14, m37), and the browser broke this short one
 * at the line's end too. Now a formula that fits the row moves to the
 * next line whole, and only one wider than the row breaks inside it.
 * Measured in a real Chrome, with KaTeX's sheet, at every column width
 * from a phone's to the topic page's.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startShell, type Shell } from "./helpers/browser-shell.ts";

let shell: Shell;
before(async () => {
	shell = await startShell({ entry: "tests/helpers/earlier-rows-page.tsx", ready: '[data-slot="topic-attempt-text"] .katex', sheets: ["node_modules/katex/dist/katex.min.css"] });
});
after(async () => {
	await shell?.close();
});

describe("an Earlier row's formulas (round 18, m21)", () => {
	it("keeps a formula that fits the row on one line, and keeps a wider one inside the row", async () => {
		const page = await shell.open("browser");
		await page.evaluate(() => document.fonts.ready);
		const seen = await page.evaluate(async () => {
			const column = document.querySelector<HTMLElement>('[data-place="earlier"]')!;
			const split: string[] = [];
			const past: string[] = [];
			const settle = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
			// Each formula's width on one line, measured in a column wide enough for every row.
			column.style.width = "2000px";
			await settle();
			const natural = new Map([...document.querySelectorAll<HTMLElement>('[data-slot="topic-attempt-text"] .katex')].map((f) => [f, f.getBoundingClientRect().width]));
			for (let width = 160; width <= 384; width += 4) {
				column.style.width = `${width}px`;
				await settle();
				for (const row of document.querySelectorAll<HTMLElement>('[data-slot="topic-attempt-text"]')) {
					const room = row.getBoundingClientRect();
					for (const formula of row.querySelectorAll<HTMLElement>(".katex")) {
						const pieces = [...formula.querySelectorAll<HTMLElement>(".katex-html > .katex-base, .katex-html > .katex-hold")];
						const whole = natural.get(formula)!;
						// A piece that starts left of where the one before it ended is on a new line.
						const rects = pieces.map((piece) => piece.getBoundingClientRect());
						const lines = new Set([0, ...rects.flatMap((r, i) => (i > 0 && r.left < rects[i - 1]!.right - 1 ? [i] : []))]);
						const name = formula.querySelector("annotation")?.textContent ?? "";
						if (whole <= room.width - 1 && lines.size > 1) split.push(`${name} at ${width}px (${Math.round(whole)} of ${Math.round(room.width)})`);
						if (formula.getBoundingClientRect().right > room.right + 0.5) past.push(`${name} at ${width}px`);
					}
				}
			}
			return { split, past };
		});
		await page.close();
		assert.deepEqual(seen.split, [], "a formula that fits the row never breaks across lines");
		assert.deepEqual(seen.past, [], "a formula wider than the row breaks inside it, never running past it (round 14, m37)");
	});
});
