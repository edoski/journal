/**
 * Round 17, m26 (1 m5, 1 m12, 3 m7): text cut where there was room. Every
 * week day head read "Study 9:00 to 13:00, 14:00", Builds on read
 * "Gauss-Jordan reduction and…", and the course page's road read
 * "Discrete probability and the uniform distri…". Each now wraps where its
 * row can grow. Measured in a real Chrome at the widths the app gives them
 * at 1512×982.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startShell, type Shell } from "./helpers/browser-shell.ts";

let shell: Shell;
before(async () => {
	shell = await startShell({ entry: "tests/helpers/room-clamps-page.tsx", ready: '[data-place="road"] [data-slot="arc-label"]' });
});
after(async () => {
	await shell?.close();
});

describe("text with room to spare (round 17, m26)", () => {
	it("is whole: the day's hours, a Builds on title, an arc's name", async () => {
		const page = await shell.open("browser");
		await page.evaluate(() => document.fonts.ready);
		await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
		const seen = await page.evaluate(() => {
			// Cut: a box narrower or shorter than its text, as an ellipsis or a clamp draws it.
			const cut = (el: Element) => (el as HTMLElement).scrollWidth > (el as HTMLElement).clientWidth + 0.5 || (el as HTMLElement).scrollHeight > (el as HTMLElement).clientHeight + 0.5;
			const place = (name: string, selector: string) => {
				const el = document.querySelector(`[data-place="${name}"] ${selector}`)!;
				const boxes = [el, ...el.querySelectorAll("*")] as HTMLElement[];
				// Or drawn past its place, where the app's column clips it.
				const room = document.querySelector(`[data-place="${name}"]`)!.getBoundingClientRect();
				const past = boxes.some((b) => b.getBoundingClientRect().right > room.right + 0.5);
				return { text: el.textContent, cut: past || boxes.some(cut), sizes: boxes.map((b) => `${(b.getAttribute("class") ?? "").slice(0, 40)} ${b.scrollWidth}/${b.clientWidth} ${b.scrollHeight}/${b.clientHeight}`).join("; ") };
			};
			return {
				hours: place("day-head", '[data-slot="calendar-day-hours"]'),
				builds: place("builds-on", '[data-slot="pickup-builds-on-title"]'),
				arc: place("road", '[data-slot="arc-label"]'),
			};
		});
		await page.close();
		assert.equal(seen.hours.text, "Study 9:00 to 13:00, 14:00 to 18:00");
		assert.ok(!seen.hours.cut, `the day's hours, whole (${seen.hours.sizes})`);
		assert.equal(seen.builds.text, "Gauss-Jordan reduction and reduced echelon form");
		assert.ok(!seen.builds.cut, `the Builds on title, whole (${seen.builds.sizes})`);
		assert.match(seen.arc.text ?? "", /Discrete probability and the uniform distribution/);
		assert.ok(!seen.arc.cut, `the arc's name, whole (${seen.arc.sizes})`);
	});
});
