/**
 * Round 21, m11 (1 m8): on the calendar, "Permutations, $k$-permutations
 * and factorials" broke between its formula and the word it joins:
 * "Permutations, k" then "-permutations and factorials" (Mon 16 and Wed 18,
 * lens 1 `03b`, `73`). A calendar title's formula may wrap at its own break
 * points (round 19, m7), and Chrome let the line break after its box too.
 * A formula and the letters touching it now stay on one line there, as
 * everywhere. Measured in a real Chrome, with KaTeX's sheet, in Edo's
 * 1512×982 window beside the sidebar.
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

/** Each calendar title holding "-permutations": the line its formula ends
 *  on and the line its "-permutations" starts on. */
function suffixes() {
	return [...document.querySelectorAll<HTMLElement>('[data-slot="calendar-entry-title"]')]
		.filter((title) => title.textContent?.includes("-permutations"))
		.map((title) => {
			const katex = title.querySelector(".katex-html")!;
			const walker = document.createTreeWalker(title, NodeFilter.SHOW_TEXT);
			let node: Text | null = null;
			while ((node = walker.nextNode() as Text | null)) if (node.data.includes("-permutations") && !node.parentElement?.closest(".katex")) break;
			const range = document.createRange();
			const at = node!.data.indexOf("-permutations");
			range.setStart(node!, at);
			range.setEnd(node!, at + 1);
			const boxes = [...katex.getClientRects()];
			return { text: title.textContent, formulaBottom: Math.round(boxes.at(-1)!.bottom), hyphenBottom: Math.round(range.getBoundingClientRect().bottom), width: Math.round(title.getBoundingClientRect().width) };
		});
}

describe("a calendar title's formula and the word it joins (round 21, m11)", () => {
	for (const width of [1512, 1180]) {
		it(`stay on one line, in the week and the month, at ${width} points`, async () => {
			const page = await shell.open("browser", { width });
			await page.evaluate(() => document.fonts.ready);
			const settle = () => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
			await settle();
			const week = await page.evaluate(suffixes);
			await page.click('[data-testid="calendar-view-month"]');
			await page.waitForSelector('[data-slot="calendar-entry-title"].line-clamp-2');
			await settle();
			const month = await page.evaluate(suffixes);
			await page.close();
			for (const [view, seen] of [["week", week], ["month", month]] as const) {
				assert.ok(seen.length > 0, `${view}: the title is drawn`);
				for (const title of seen) assert.ok(Math.abs(title.formulaBottom - title.hyphenBottom) <= 2, `${view}: "${title.text}" breaks between k and -permutations in its ${title.width}px title (${JSON.stringify(title)})`);
			}
		});
	}
});
