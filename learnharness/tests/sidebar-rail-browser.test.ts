/**
 * The folded sidebar measured in a real Chrome at Edo's 1512×982, in the
 * three windows the app runs in (tests/helpers/browser-shell.ts). Round 14:
 * T3 Code's preview, where Edo reviews the app, is an Electron browser, and
 * the app took it for the Mac app from its user agent. It drew the Mac app's
 * chrome with no traffic lights: the open button fell to the window's
 * bottom-left (x 90, y 968) and the rail kept an empty 52px band above its
 * first icon (Edo: "totally broken … this weird empty gap at the top").
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { Page } from "puppeteer-core";
import { LIGHTS_CENTRE, startShell, type Shell } from "./helpers/browser-shell.ts";

/** The rail is 48px with a 1px edge; its head is the window's 52px band. */
const RAIL = 48;
const HEAD = 52;

let shell: Shell;
before(async () => {
	shell = await startShell();
});
after(async () => {
	await shell?.close();
});

type Box = { left: number; right: number; top: number; bottom: number };
const measure = (page: Page) =>
	page.evaluate(() => {
		const box = (el: Element): Box => {
			const { left, right, top, bottom } = el.getBoundingClientRect();
			return { left, right, top, bottom };
		};
		const open = document.querySelector('[data-testid="sidebar-open"]')!;
		const rail = document.querySelector('[data-slot="sidebar-rail"]')!;
		const icons = [...rail.querySelectorAll("a, button")].map(box);
		const b = box(open);
		return {
			macApp: document.documentElement.classList.contains("lh-electron"),
			rail: box(rail),
			open: b,
			firstIcon: Math.min(...icons.map((i) => i.top)),
			iconLeft: icons[0]?.left ?? NaN,
			hit: document.elementFromPoint((b.left + b.right) / 2, (b.top + b.bottom) / 2)?.closest('[data-testid="sidebar-open"]') === open,
			afterPage: (document.querySelector("main")!.compareDocumentPosition(open) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
		};
	});

describe("the folded rail in a browser", () => {
	for (const window of ["t3-preview", "browser"] as const) {
		it(`puts the open button at the top of the rail, with no empty band above the rail's icons (${window})`, async () => {
			const page = await shell.open(window);
			const m = await measure(page);
			await page.close();
			assert.equal(m.rail.right - m.rail.left, RAIL, "the rail is 48px");
			assert.ok(m.open.left >= m.rail.left && m.open.right <= m.rail.right - 1, `the button is inside the rail, x ${m.open.left}–${m.open.right}`);
			assert.equal(m.open.left, m.iconLeft, "level with the rail's icons");
			assert.equal(m.open.top, (HEAD - (m.open.bottom - m.open.top)) / 2, `centred in the rail's head, at y ${m.open.top}`);
			assert.ok(m.open.top <= m.firstIcon, `the first thing in the rail, its icons starting at y ${m.firstIcon}`);
			assert.ok(m.hit, "nothing covers it");
			assert.equal(m.macApp, false, "a browser, T3 Code's preview included, is never taken for the Mac app");
		});
	}
});

describe("the folded rail in the Mac app", () => {
	it("stands the open button beside the traffic lights, level with them, after the page so its drag band cannot take the click", async () => {
		const page = await shell.open("mac-app");
		const m = await measure(page);
		await page.close();
		assert.equal(m.macApp, true, "the preload's bridge marks the Mac app");
		assert.equal(m.rail.right - m.rail.left, RAIL, "the rail stays 48px");
		assert.equal(m.open.left, 90, "T3 Code's --desktop-window-controls-inset");
		assert.equal((m.open.top + m.open.bottom) / 2, LIGHTS_CENTRE, "centred on the lights' centre");
		assert.ok(m.hit, "nothing covers it");
		assert.ok(m.afterPage, "drawn after the page: Electron resolves drag regions in page order");
		assert.equal(m.firstIcon, HEAD + 8, `the rail's icons start 8px under the window's 52px band, clear of the lights (Edo, 23 Nov 2026: "sidebar busted in collapsed state"), at y ${m.firstIcon}`);
	});
});

/** Folds or unfolds with the sidebar's own button and samples every frame
 *  for at least 300ms and until the sidebar has switched state and every
 *  transition has ended: what the sidebar mounts and drops, what animates in
 *  it, where the rail's Home icon and the page's left edge stand. A fixed
 *  300ms let CI's slow runner stop mid-slide (x 59.7 for 48, 19 Nov 2026). */
const press = (page: Page, button: "Close sidebar" | "Open sidebar") =>
	page.evaluate(async (label: string) => {
		const aside = document.querySelector('[data-testid="sidebar"]')!;
		const main = document.querySelector("main")!;
		let changed = 0;
		const watch = new MutationObserver((records) => records.forEach((r) => (changed += r.addedNodes.length + r.removedNodes.length)));
		watch.observe(aside, { childList: true, subtree: true });
		const railHome: number[] = [];
		const pageLeft: number[] = [];
		const panelHome: number[] = [];
		const edges: number[] = [];
		const animated = new Set<string>();
		const from = aside.getAttribute("data-state");
		const t0 = performance.now();
		document.querySelector<HTMLElement>(`button[aria-label="${label}"]`)!.click();
		await new Promise<void>((done) => {
			const frame = (t: number) => {
				const home = document.querySelector('[data-slot="sidebar-rail"] a[href="/"]');
				if (home && getComputedStyle(home).visibility === "visible") railHome.push(home.getBoundingClientRect().left);
				pageLeft.push(main.getBoundingClientRect().left);
				const panel = document.querySelector('[data-slot="sidebar-panel"]')!;
				if (getComputedStyle(panel).visibility === "visible") {
					panelHome.push(Math.round(document.querySelector('[data-slot="sidebar-home"]')!.getBoundingClientRect().left));
					edges.push(Math.round(panel.getBoundingClientRect().right));
				}
				for (const a of document.getAnimations()) if (a instanceof CSSTransition && aside.contains((a.effect as KeyframeEffect).target)) animated.add(a.transitionProperty);
				const sliding = document.getAnimations().some((a) => a instanceof CSSTransition && a.playState === "running");
				if (t - t0 < 300 || (t - t0 < 3000 && (aside.getAttribute("data-state") === from || sliding))) requestAnimationFrame(frame);
				else done();
			};
			requestAnimationFrame(frame);
		});
		watch.disconnect();
		return { changed, railHome: [...new Set(railHome)], pageLeft: [...new Set(pageLeft)], panelHome: [...new Set(panelHome)], edges: [...new Set(edges)], animated: [...animated].sort(), state: aside.getAttribute("data-state") };
	}, button);

describe("the fold", () => {
	it("rebuilds nothing and folds in one motion: the panel's edge sweeps while everything in it holds still, nothing fades, the rail's icons stay put and the page glides with it", async () => {
		const page = await shell.open("browser", { sidebar: "open" });
		const fold = await press(page, "Close sidebar");
		await new Promise((done) => setTimeout(done, 100));
		const unfold = await press(page, "Open sidebar");
		await page.close();
		for (const [name, run, settled, left] of [["fold", fold, "folded", RAIL], ["unfold", unfold, "open", 256]] as const) {
			assert.equal(run.state, settled, `${name} settles ${settled}`);
			assert.equal(run.changed, 0, `${name}: the panel and the rail stay mounted (round 14 swapped them, rebuilding the panel on every unfold)`);
			assert.ok(run.animated.length > 0, `${name} animates`);
			assert.deepEqual(run.animated.filter((p) => !["translate", "visibility", "width"].includes(p)), [], `${name}: nothing fades (Edo, 16 Nov 2026: the fade made the rail and the panel "two separate entities"; ${run.animated})`);
			assert.equal(run.panelHome.length, 1, `${name}: the panel's rows hold still while its edge sweeps (x ${run.panelHome.join(", ")})`);
			// A slow machine draws few frames of the sweep (CI's runner: 164, 256), so it is enough that one lands mid-way.
			assert.ok(run.edges.length > 1, `${name}: the panel's edge travels frame by frame, never in one jump (${run.edges.join(", ")})`);
			assert.equal(run.pageLeft.at(-1), left, `${name}: the page settles beside the sidebar`);
			assert.ok(run.pageLeft.length > 2, `${name}: the page glides there with the sidebar's edge, never in one jump (Edo, 16 Nov 2026: "this weird static layout shift that jumps from one frame to the next"; ${run.pageLeft.join(", ")})`);
		}
		assert.deepEqual(fold.railHome, [(RAIL - 1 - 28) / 2], `the rail's icons stay where they settle while it folds (round 14: they slid in from the middle, x ${fold.railHome.join(", ")})`);
	});

	it("happens at once under reduced motion", async () => {
		const page = await shell.open("browser", { sidebar: "open", reducedMotion: true });
		const fold = await press(page, "Close sidebar");
		await page.close();
		assert.equal(fold.state, "folded");
		assert.deepEqual(fold.animated, [], "nothing animates");
		assert.deepEqual(fold.pageLeft, [RAIL], "the page is in place on the first frame");
	});
});
