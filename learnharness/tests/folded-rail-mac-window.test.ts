/**
 * The folded sidebar in the Mac app, at any window width and zoom (Edo, 19
 * Nov 2026: "it is broken in collapsed state on desktop app view in
 * macOS"). Folded, the rail's open button stands in the window's band
 * beside the traffic lights, 90pt in (`.lh-rail-toggle`), but the pages'
 * column (`PAGE_COLUMN`: Home, the course page, a topic page) kept its own
 * centred edge. Below about 1440pt wide, or zoomed in, the column's first
 * row slid under the button: at 1280pt Home's first course tab started at
 * x 72 under the button's 90 to 118, and at ⌘+ (1.25) the course page's
 * title ran under it. Measured in a real Chrome as the Mac app, the lights
 * where AppKit draws them (electron/main.cjs), with the page the course
 * page and a topic page draw (`WindowPage`, `PageFrame`, `PageHead`).
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { LIGHTS, startShell, type Shell } from "./helpers/browser-shell.ts";

/** T3 Code's `--workspace-titlebar-control-gap`: the band's content starts this far past the open button. */
const GAP = 12;

let shell: Shell;
before(async () => {
	shell = await startShell({ entry: "tests/helpers/window-page-page.tsx", ready: '[data-slot="page-title"]' });
});
after(async () => {
	await shell?.close();
});

type Box = { left: number; right: number; top: number; bottom: number };

/** Every control in the window's band, the open button and the page's title, in points (CSS px times the zoom). */
const measure = (page: import("puppeteer-core").Page, zoom: number) =>
	page.evaluate((zoom: number) => {
		const pt = (b: DOMRect): Box => ({ left: b.left * zoom, right: b.right * zoom, top: b.top * zoom, bottom: b.bottom * zoom });
		const band = document.querySelector('[data-slot="window-band"]')!.getBoundingClientRect();
		const controls = [...document.querySelectorAll("button, a, input")]
			.filter((el) => !el.closest("[inert]"))
			.map((el) => ({ el, b: el.getBoundingClientRect() }))
			.filter(({ b }) => b.width > 0 && b.top < band.bottom)
			.map(({ el, b }) => {
				const hit = document.elementFromPoint((b.left + b.right) / 2, (b.top + b.bottom) / 2);
				return {
					name: el.getAttribute("aria-label") ?? el.textContent!.trim(),
					box: pt(b),
					hit: !!hit && (hit === el || el.contains(hit)),
					region: getComputedStyle(el).getPropertyValue("-webkit-app-region") || getComputedStyle(el).getPropertyValue("app-region"),
				};
			});
		return {
			macApp: document.documentElement.classList.contains("lh-electron"),
			folded: document.querySelector("main")!.dataset.sidebar === "folded",
			open: pt(document.querySelector('[data-testid="sidebar-open"]')!.getBoundingClientRect()),
			title: pt(document.querySelector('[data-slot="page-title"]')!.getBoundingClientRect()),
			controls,
		};
	}, zoom);

const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

describe("the folded sidebar in the Mac app keeps the window's band clear", () => {
	const windows = [
		{ width: 1512, zoom: 1 },
		{ width: 1440, zoom: 1 },
		{ width: 1280, zoom: 1 },
		{ width: 1000, zoom: 1 },
		{ width: 1512, zoom: 1.25 },
		{ width: 1512, zoom: 1.5 },
	];
	for (const { width, zoom } of windows) {
		it(`at ${width}pt wide, zoom ${zoom}: every control clear of the lights and of each other, the page's first row past the open button, each clickable`, async () => {
			const page = await shell.open("mac-app", { sidebar: "folded", width, zoom });
			const m = await measure(page, zoom);
			await page.close();
			assert.ok(m.macApp && m.folded, "the Mac app, sidebar folded");
			assert.ok(m.title.left >= m.open.right + GAP - 0.5, `the page's title starts ${GAP}pt past the open button (title at x ${m.title.left}, button ends at ${m.open.right})`);
			assert.ok(m.controls.length >= 3, `the band holds the open button and the head's presses (${m.controls.map((c) => c.name)})`);
			for (const c of m.controls) {
				assert.ok(!overlaps(c.box, LIGHTS), `${c.name} is clear of the traffic lights (x ${c.box.left}–${c.box.right}, y ${c.box.top}–${c.box.bottom})`);
				assert.ok(c.hit, `${c.name} is what a click at its centre reaches`);
				assert.equal(c.region, "no-drag", `${c.name} takes the click, not the window's drag`);
				for (const d of m.controls) if (d !== c) assert.ok(!overlaps(c.box, d.box), `${c.name} and ${d.name} do not overlap`);
			}
		});
	}
});
