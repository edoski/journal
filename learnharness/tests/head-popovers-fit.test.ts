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

/**
 * Round 17, M3 (1 M3, 1 m6 in part; 2 m1): on the 17 Nov Probability page,
 * nine topics with no room ran the head off the window, "Properties of
 * probability: P(A∪B)=P(A)+P(B)−P(A∩B)" was drawn under its "Back Tue 17
 * Nov", and the readiness answer's pick split into three columns around
 * "k-permutations". The head wraps inside its column, a formula in a row's
 * title breaks at its own break points before the fact, and a press's
 * words with maths are one run of text.
 */
describe("the exam eve at the new world's size (round 17, M3)", () => {
	it("keeps the head inside its column, a maths title clear of its fact, and the pick's words one run", async () => {
		const page = await shell.open("browser", { sidebar: "open", search: "&case=eve" });
		await page.waitForSelector('[data-slot="course-topic-row"]');
		const before = await page.evaluate(() => {
			const drawnRight = (el: Element) => {
				const range = document.createRange();
				range.selectNodeContents(el);
				return Math.max(...[...range.getClientRects()].map((r) => r.right));
			};
			const head = document.querySelector('[data-slot="page-head"]')!.getBoundingClientRect();
			const chip = document.querySelector('[data-slot="course-topic-fact"]')!.getBoundingClientRect();
			return { headRight: head.right, factRight: drawnRight(document.querySelector('[data-slot="course-ready-fact"]')!), window: innerWidth, titleRight: drawnRight(document.querySelector('[data-slot="course-topic-title"]')!), chipLeft: chip.left };
		});
		assert.ok(before.factRight <= before.headRight + 0.5 && before.factRight <= before.window, `the readiness line's words stay inside the head (${before.factRight} against ${before.headRight}, window ${before.window})`);
		assert.ok(before.titleRight <= before.chipLeft, `the maths title ends before its fact (${before.titleRight} against ${before.chipLeft})`);
		await page.click('[data-slot="course-ready-fact"]');
		await page.waitForSelector('[data-slot="exam-gaps-pick"]');
		const pick = await page.evaluate(() => {
			const press = document.querySelector('[data-slot="exam-gaps-pick"]')!;
			// Each piece of its words in reading order: a run of words outside a formula, rect by rect, and each
			// formula whole. Pieces in columns read back up a line; one run of words never does.
			const pieces: DOMRect[] = [];
			const walk = (node: Node) => {
				if (node instanceof Element && node.classList.contains("katex")) pieces.push(node.getBoundingClientRect());
				else if (node.nodeType === Node.TEXT_NODE) {
					const range = document.createRange();
					range.selectNodeContents(node);
					pieces.push(...[...range.getClientRects()].filter((r) => r.width > 0));
				} else node.childNodes.forEach(walk);
			};
			walk(press);
			const centres = pieces.map((r) => r.top + r.height / 2);
			const lines = [...centres].sort((a, b) => a - b).reduce<number[]>((at, c) => (at.length && c - at[at.length - 1]! < 8 ? at : [...at, c]), []);
			const lineOf = (c: number) => lines.findLastIndex((l) => c >= l - 0.5);
			return { words: press.textContent, order: centres.map(lineOf) };
		});
		assert.match(pick.words ?? "", /^Review Permutations, .*-permutations and factorials today$/);
		// Round 17, m6 (1 m6): the answer states the one consequence, naming no topic; the topics are behind Which topics.
		const why = await page.evaluate(() => document.querySelector('[data-slot="exam-gaps-why"]')?.textContent ?? "");
		assert.ok(why.split(/\s+/).length <= 30, `the why is short: "${why}"`);
		assert.doesNotMatch(why, /Variance|Martingales|Geometric/, "it lists no topic");
		// Round 18, m7 (1 n5): Which topics repeated the head's line word for word. The head's line names every topic
		// with no room here, so the answer has nothing behind Which topics and says no sentence of the line.
		const answer = await page.evaluate(() => ({
			head: document.querySelector('[data-slot="course-ready-fact"]')?.textContent ?? "",
			popover: document.querySelector('[data-slot="course-ready-detail"]')?.textContent ?? "",
			whichPress: document.querySelector('[data-slot="exam-gaps-which-press"]') !== null,
		}));
		assert.equal(answer.whichPress, false, "no Which topics with nothing the head's line does not say");
		assert.ok(!answer.popover.includes(answer.head), "no sentence of the head's line in its answer");
		assert.doesNotMatch(answer.popover, /\bOne starts\b|\bsome start\b/i, "no topic left unnamed");
		await page.close();
		assert.ok(pick.order.every((line, i) => i === 0 || line >= pick.order[i - 1]!), `the pick's words read in order, line by line, never in columns: ${pick.order.join(" ")}`);
	});
});

/**
 * Round 18, m9 (1 n7, `41`, `75`): when the 17 Nov head wrapped, "Studied
 * 10 Nov" went to a line of its own with the facts' divider still in front
 * of it. The facts are apart by the line's gap, never a divider, so a fact
 * that wraps starts on the line's left edge.
 */
describe("the head's facts when they wrap (round 18, m9)", () => {
	it("puts Studied on its own line at the line's left edge, with no divider before it", async () => {
		const page = await shell.open("browser", { sidebar: "open", search: "&case=eve" });
		await page.waitForSelector('[data-slot="course-studied"]');
		const m = await page.evaluate(() => {
			// The head's lines' left edge, where every line starts.
			const lineLeft = document.querySelector('[data-slot="page-lines"]')!.getBoundingClientRect().left;
			const clip = document.querySelector('[data-slot="page-standing"]')!.getBoundingClientRect();
			const ready = document.querySelector('[data-slot="course-ready-fact"]')!.getBoundingClientRect();
			const studied = document.querySelector('[data-slot="course-studied"]')!;
			const box = studied.getBoundingClientRect();
			const before = getComputedStyle(studied, "::before");
			const drawn = before.content !== "none" && before.content !== "normal" && parseFloat(before.width) > 0;
			// A hairline placed inside the fact's flow is drawn; one placed left of the clip is cut away.
			const shown = drawn && (before.position !== "absolute" || box.left + parseFloat(before.left) + parseFloat(before.width) > clip.left);
			return { lineLeft, iconLeft: studied.querySelector("svg")!.getBoundingClientRect().left, wrapped: box.top >= ready.bottom - 0.5, divider: shown };
		});
		await page.close();
		assert.ok(m.wrapped, "Studied wraps under the readiness line at 1512 px");
		assert.equal(m.divider, false, "no divider drawn before a fact");
		assert.ok(Math.abs(m.iconLeft - m.lineLeft) < 0.5, `Studied's mark starts on the line's left edge (${m.iconLeft} against ${m.lineLeft})`);
	});
});
