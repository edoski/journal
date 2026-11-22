/**
 * Round 19, P2's visual slips, measured in a real Chrome (tests/helpers/round19-layout-page.tsx). Fonts differ
 * from the Mac here, so each check is a relation between boxes (overlap, containment), never a pixel figure.
 * - Carry-in 4: at browser zoom 1.25 and up Home's map ran over Today's heading. Edo's window is 1512×982 points; at
 *   zoom 1.25 the page has about 1210×786 CSS px, at 1.5 about 1008×655. The arc list beside the map kept its full
 *   height whatever room the map had, and the map held a fixed least height that pushed the composer out of the window.
 * - m13 (a): after a full day, Calculus I's map showed one card under a wide empty field crossed by lines that led
 *   nowhere (2 `42-home-after`). A line is drawn only while a card at each of its ends is in view.
 * - m13 (b): the course head's focus ring cut its last word (2 `43b-course-page-clean`).
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { Page } from "puppeteer-core";
import { startShell, type Shell } from "./helpers/browser-shell.ts";

let shell: Shell;
before(async () => {
	shell = await startShell({ entry: "tests/helpers/round19-layout-page.tsx", sheets: ["node_modules/katex/dist/katex.min.css", "node_modules/@xyflow/react/dist/base.css"] });
});
after(async () => {
	await shell?.close();
});

/** The page settled: fonts in, two frames drawn. */
async function settled(page: Page) {
	await page.evaluate(() => document.fonts.ready);
	await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
}

type Box = { top: number; bottom: number; left: number; right: number };

describe("Home's map at browser zoom 1.25 and up (round 19, carry-in 4)", () => {
	for (const zoom of [1, 1.25, 1.5]) {
		it(`at zoom ${zoom}, the map, its arc list and its drawing stay above Today's heading and rows, and Home fits the window`, async () => {
			const page = await shell.open("browser", { reducedMotion: true, sidebar: "open", search: "&case=home", zoom });
			await page.waitForSelector('[data-slot="day-heading"]');
			await page.waitForSelector('[data-slot="arc-index"]');
			await settled(page);
			const seen = await page.evaluate(() => {
				const box = (el: Element | null) => {
					if (!el) return null;
					const r = el.getBoundingClientRect();
					return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
				};
				const map = document.querySelector('[data-slot="home-map"]');
				return {
					window: { width: innerWidth, height: innerHeight },
					parts: {
						map: box(map),
						arcs: box(document.querySelector('[data-slot="arc-index"]')),
						drawing: box(document.querySelector('[data-slot="map-frame-vignette"]')),
					},
					shown: box(document.querySelector('[data-slot="arc-index-row"][data-shown]')),
					heading: box(document.querySelector('[data-slot="day-heading"]')),
					rows: [...document.querySelectorAll('[data-slot="today-line"]')].map(box),
					composer: box(document.querySelector('[data-slot="course-composer"]')),
				};
			});
			await page.close();
			const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
			assert.ok(seen.heading && seen.composer && seen.parts.map && seen.parts.arcs && seen.parts.drawing && seen.shown, `every part drawn: ${JSON.stringify(seen)}`);
			assert.ok(seen.rows.length > 0, "Today has rows");
			for (const [name, part] of Object.entries(seen.parts)) {
				assert.ok(part!.bottom <= seen.heading.top, `the map's ${name} (bottom ${part!.bottom}) ends above the heading (top ${seen.heading.top}) at ${JSON.stringify(seen.window)}`);
				for (const row of seen.rows) assert.ok(!overlaps(part!, row!), `the map's ${name} ${JSON.stringify(part)} clear of the Today row ${JSON.stringify(row)}`);
			}
			const arcs = seen.parts.arcs!;
			assert.ok(seen.shown.top >= arcs.top - 0.5 && seen.shown.bottom <= arcs.bottom + 0.5, `the arc shown ${JSON.stringify(seen.shown)} in view in its list ${JSON.stringify(arcs)}`);
			assert.ok(seen.composer.bottom <= seen.window.height, `the composer (bottom ${seen.composer.bottom}) inside the window (${seen.window.height})`);
		});
	}
});

describe("A map's lines with a card out of view (round 19, m13 a)", () => {
	/** The lines drawn, and the cards clear of the frame's fade (`MAP_FADE.page`, as the page's frame passes it). */
	const drawn = (page: Page) =>
		page.evaluate(() => {
			const frame = document.querySelector('[data-slot="lines-frame"]')!.getBoundingClientRect();
			const fade = { x: 64, y: 40 };
			const clear = { top: frame.top + fade.y, bottom: frame.bottom - fade.y, left: frame.left + fade.x, right: frame.right - fade.x };
			const cards = [...document.querySelectorAll('[data-slot="course-map-node"]')].filter((card) => {
				const r = card.getBoundingClientRect();
				return r.left < clear.right && clear.left < r.right && r.top < clear.bottom && clear.top < r.bottom;
			});
			const lines = [...document.querySelectorAll('[data-slot="course-map-line"]')].map((path) => path.getAttribute("d") ?? "").filter(Boolean);
			return { cards: cards.map((c) => c.textContent), lines };
		});

	it("draws no line while only one card is in view, so none leads nowhere", async () => {
		const page = await shell.open("browser", { reducedMotion: true, search: "&case=lines" });
		await page.waitForSelector('[data-slot="course-map-node"][data-current]');
		await settled(page);
		const seen = await drawn(page);
		await page.close();
		assert.equal(seen.cards.length, 1, `one card in view: ${JSON.stringify(seen.cards)}`);
		assert.deepEqual(seen.lines, [], "no line drawn");
	});

	it("draws the lines between cards in view once the frame shows them", async () => {
		const page = await shell.open("browser", { reducedMotion: true, search: "&case=lines&tall=1" });
		await page.waitForSelector('[data-slot="course-map-node"][data-current]');
		await settled(page);
		const seen = await drawn(page);
		await page.close();
		assert.ok(seen.cards.length > 1, `more than one card in view: ${JSON.stringify(seen.cards)}`);
		assert.ok(seen.lines.length > 0, "their lines drawn");
	});
});

describe("The course head's focus ring (round 19, m13 b)", () => {
	it("stands off the whole fact: its words clear of the ring's inner edge, and the ring clipped by nothing", async () => {
		const page = await shell.open("browser", { reducedMotion: true, sidebar: "open", search: "&case=head" });
		await page.waitForSelector('[data-slot="course-ready-fact"]');
		await settled(page);
		const seen = await page.evaluate(() => {
			const press = document.querySelector<HTMLElement>('[data-slot="course-ready-fact"]')!;
			press.focus({ focusVisible: true } as FocusOptions);
			const r = press.getBoundingClientRect();
			// The ring is box shadows around the press: the widest spread is its outer edge, the next its inner edge (an
			// offset's spread; none, the press's own edge).
			const spreads = [...getComputedStyle(press).boxShadow.matchAll(/(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px/g)].map((m) => Number(m[4]));
			const outer = Math.max(0, ...spreads);
			const inner = Math.max(0, ...spreads.filter((s) => s < outer));
			const grown = (by: number) => ({ top: r.top - by, bottom: r.bottom + by, left: r.left - by, right: r.right + by });
			// Every box that clips the press: an ancestor whose overflow is not visible.
			const clips = [];
			for (let el = press.parentElement; el; el = el.parentElement) {
				const style = getComputedStyle(el);
				if (style.overflowX !== "visible" || style.overflowY !== "visible") {
					const c = el.getBoundingClientRect();
					clips.push({ slot: el.dataset.slot ?? el.tagName, top: c.top, bottom: c.bottom, left: c.left, right: c.right });
				}
			}
			const words = document.createRange();
			words.selectNodeContents(press);
			const text = [...words.getClientRects()].filter((t) => t.width > 0);
			return {
				focused: press.matches(":focus-visible"),
				outer,
				ring: { outer: grown(outer), inner: grown(inner) },
				clips,
				text: text.map((t) => ({ top: t.top, bottom: t.bottom, left: t.left, right: t.right })),
			};
		});
		await page.close();
		assert.ok(seen.focused, "the fact has the keyboard's focus");
		assert.ok(seen.outer > 0, "a ring is drawn");
		assert.ok(seen.text.length > 0, "its words are drawn");
		const inside = (a: Box, b: Box) => a.top >= b.top - 0.5 && a.bottom <= b.bottom + 0.5 && a.left >= b.left - 0.5 && a.right <= b.right + 0.5;
		// Clear of the ring by at least a pixel on every side, so a glyph a fraction past its box is never under the ring.
		const clear = (a: Box, b: Box) => a.top >= b.top + 1 && a.bottom <= b.bottom - 1 && a.left >= b.left + 1 && a.right <= b.right - 1;
		for (const t of seen.text) assert.ok(clear(t, seen.ring.inner), `the words ${JSON.stringify(t)} clear of the ring's inner edge ${JSON.stringify(seen.ring.inner)}`);
		for (const clip of seen.clips) assert.ok(inside(seen.ring.outer, clip), `the ring ${JSON.stringify(seen.ring.outer)} whole inside ${clip.slot}'s clip ${JSON.stringify(clip)}`);
	});
});
