/**
 * Round 18, m11 (1 n8, `57`, `72`; round-17 m26's remainder): Home still
 * cut text with room to spare. "Also today: … The precise ε–δ definition
 * of …, Continue Problem sheet 4: rank and null…, Continue Rank practi…"
 * and the map's arc list, "Discrete probability and the unifor…". Also
 * today wraps onto a second line, and the arc list gives a name two lines,
 * as the course page's road does. Measured in a real Chrome at the widths
 * the app gives them at 1512×982.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startShell, type Shell } from "./helpers/browser-shell.ts";

let shell: Shell;
before(async () => {
	shell = await startShell({ entry: "tests/helpers/round18-room-page.tsx", ready: '[data-place="arcs"] [data-slot="arc-label"]' });
});
after(async () => {
	await shell?.close();
});

describe("Home's text with room to spare (round 18, m11)", () => {
	it("is whole: each lesson Also today folds in, and every arc's name beside the map", async () => {
		// Reduced motion, so the bar is where it goes, not on its way there.
		const page = await shell.open("browser", { reducedMotion: true });
		await page.evaluate(() => document.fonts.ready);
		await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
		const seen = await page.evaluate(() => {
			// Cut: a box narrower or shorter than its text, as an ellipsis or a clamp draws it, or a lesson ended on "…".
			const cut = (el: Element) => (el as HTMLElement).scrollWidth > (el as HTMLElement).clientWidth + 0.5 || (el as HTMLElement).scrollHeight > (el as HTMLElement).clientHeight + 0.5 || /…$/.test(el.textContent ?? "");
			// A lesson is one line: cut along it, never by a formula's glyphs standing a pixel over its line's height.
			const cutAlong = (el: Element) => (el as HTMLElement).scrollWidth > (el as HTMLElement).clientWidth + 0.5 || /…$/.test(el.textContent ?? "");
			const also = document.querySelector('[data-place="also"] [data-slot="today-also"]')!;
			const lessons = [...also.querySelectorAll("[data-line]")].map((button) => {
				const box = button.getBoundingClientRect();
				const line = button.querySelector('[data-slot="math-line"], span')!;
				return { text: button.textContent, top: Math.round(box.top), cut: cutAlong(line) || cutAlong(button) };
			});
			const index = document.querySelector('[data-place="arcs"] [data-slot="arc-index"]')!;
			const names = [...index.querySelectorAll('[data-slot="arc-name"]')].map((name) => ({ text: name.textContent, cut: cut(name) }));
			const shown = index.querySelector('[data-slot="arc-index-row"][data-shown]')!.getBoundingClientRect();
			const bar = index.querySelector('[data-slot="arc-index-bar"]')!.getBoundingClientRect();
			return { lessons, names, bar: { top: bar.top - shown.top, height: bar.height - shown.height } };
		});
		await page.close();
		assert.equal(seen.lessons.length, 4);
		for (const lesson of seen.lessons) assert.ok(!lesson.cut, `"${lesson.text}" whole`);
		assert.ok(new Set(seen.lessons.map((l) => l.top)).size > 1, `Also today takes a second line: ${JSON.stringify(seen.lessons)}`);
		assert.equal(seen.names.length, 12);
		for (const name of seen.names) assert.ok(!name.cut, `arc "${name.text}" whole`);
		assert.ok(Math.abs(seen.bar.top) < 0.5 && Math.abs(seen.bar.height) < 0.5, `the bar sits on the arc shown, whatever its rows' heights (${JSON.stringify(seen.bar)})`);
	});
});
