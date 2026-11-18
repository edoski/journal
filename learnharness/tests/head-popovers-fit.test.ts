/**
 * The course head's popovers, measured in a real Chrome at 1512×982.
 *
 * Round 15, 2 n2 (m26): Mistakes cut every topic to about ten letters
 * ("Eigenvalue…", "Matrix mul…"), since the arc's whole name took three
 * fifths of the line, and each gap stopped at two lines. The topic's name
 * now takes the row whole, the arc shows its number alone, and the gap
 * runs to three lines.
 *
 * Round 15, 1 m7 (m27): in the readiness answer, the first way in
 * ("Review Random variables and distributions today") ran past the
 * popover's edge, and the presses sat 8px right of the line above them.
 * They now start on the why's left edge and wrap inside the popover.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startShell, type Shell } from "./helpers/browser-shell.ts";

let shell: Shell;
before(async () => {
	shell = await startShell({ entry: "tests/helpers/head-popovers-page.tsx", ready: '[data-slot="page-head"]' });
});
after(async () => {
	await shell?.close();
});

describe("Mistakes", () => {
	it("names every topic whole, names no arc, and lets each gap run whole inside the popover (round 16, m18)", async () => {
		const page = await shell.open("browser", { sidebar: "open", search: "&case=mistakes" });
		await page.click('[data-slot="course-mistakes"]');
		await page.waitForSelector('[data-slot="mistake-row"]');
		const rows = await page.evaluate(() => {
			const popover = document.querySelector('[data-slot="course-mistakes-list"]')!.getBoundingClientRect();
			return [...document.querySelectorAll('[data-slot="mistake-row"]')].map((row) => {
				const name = row.querySelector('[data-slot="mistake-topic"]') as HTMLElement | null;
				const words = row.querySelector('[data-slot="mistake-words"]') as HTMLElement;
				const said = words.getBoundingClientRect();
				const box = name?.getBoundingClientRect();
				return {
					name: name?.textContent ?? null,
					whole: !!name && name.scrollWidth <= name.clientWidth + 0.5 && name.scrollHeight <= name.clientHeight + 0.5,
					inside: !!box && box.right <= popover.right + 0.5,
					arc: row.querySelector('[data-slot="arc-label"]') !== null,
					clamp: getComputedStyle(words).webkitLineClamp,
					wordsInside: said.right <= popover.right + 0.5 && said.bottom <= popover.bottom + 0.5,
				};
			});
		});
		await page.close();
		assert.deepEqual(
			rows.map((r) => r.name),
			["Rank and the column space", "Eigenvalues and eigenvectors", "Matrix multiplication", "Gaussian elimination"],
			"every topic's whole name",
		);
		for (const row of rows) {
			assert.ok(row.whole && row.inside, `${row.name} shows whole inside the popover`);
			assert.equal(row.arc, false, `${row.name}: no arc number`);
			assert.equal(row.clamp, "none", `${row.name}: the gap is never cut`);
			assert.ok(row.wordsInside, `${row.name}: the whole gap sits inside the popover`);
		}
	});
});

describe("the readiness answer's ways in", () => {
	it("start on the popover's left edge, where its lines start, and stay inside it", async () => {
		const page = await shell.open("browser", { sidebar: "open", search: "&case=gaps" });
		await page.click('[data-slot="course-ready-fact"]');
		await page.waitForSelector('[data-slot="course-exam-gaps"]');
		const m = await page.evaluate(() => {
			const textLeft = (el: Element) => {
				const range = document.createRange();
				range.selectNodeContents(el);
				return range.getClientRects()[0]!.left;
			};
			const popover = document.querySelector('[data-slot="course-ready-detail"]')!;
			const inner = popover.getBoundingClientRect().right - parseFloat(getComputedStyle(popover).paddingRight);
			const left = popover.getBoundingClientRect().left + parseFloat(getComputedStyle(popover).paddingLeft);
			const presses = [...document.querySelectorAll('[data-slot="course-exam-gaps"] button')];
			return {
				left,
				first: textLeft(presses[0]!),
				words: presses.map((p) => p.textContent),
				over: presses.filter((p) => p.getBoundingClientRect().right > inner + 0.5).map((p) => p.textContent),
			};
		});
		await page.close();
		assert.equal(m.words[0], "Review Random variables and distributions today");
		assert.ok(Math.abs(m.first - m.left) < 1, `the first press's words start where the popover's lines do (${m.first} against ${m.left})`);
		assert.deepEqual(m.over, [], "no press runs past the popover's edge");
	});
});
