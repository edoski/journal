/**
 * Round 15, 2 D1 (M6): in a browser, Mistakes and Context on the course
 * page could not be clicked. Each page drew the window's drag band as an
 * absolutely placed first child, and the head row after it was not
 * positioned, so the band painted over the head and took every click
 * (`elementFromPoint` at either press returned the band). Every page that
 * fills the window now draws the band through one part (`WindowPage`),
 * which paints it under the page, and the head's actions mark themselves
 * no-drag for the Mac app, where the band is the window's drag region.
 * Measured in a real Chrome at 1512×982, in a browser and in the Mac app.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, describe, it } from "node:test";
import { startShell, type Shell } from "./helpers/browser-shell.ts";

let shell: Shell;
before(async () => {
	shell = await startShell({ entry: "tests/helpers/window-page-page.tsx", ready: '[data-slot="course-mistakes"]' });
});
after(async () => {
	await shell?.close();
});

const PRESSES = ['[data-slot="course-mistakes"]', '[data-slot="course-context"]'];

describe("the presses in the window's band take the click", () => {
	for (const window of ["browser", "mac-app"] as const) {
		it(`Mistakes and Context are what a click at their centre reaches, and Mistakes opens on a click (${window})`, async () => {
			const page = await shell.open(window, { sidebar: "open" });
			const found = await page.evaluate((selectors: string[]) => {
				const band = document.querySelector('[data-slot="window-band"]')!.getBoundingClientRect();
				return selectors.map((selector) => {
					const press = document.querySelector(selector)!;
					const box = press.getBoundingClientRect();
					const x = (box.left + box.right) / 2;
					const y = (box.top + box.bottom) / 2;
					return {
						selector,
						inBand: y >= band.top && y <= band.bottom,
						hit: document.elementFromPoint(x, y)?.closest(selector) === press,
						region: getComputedStyle(press).getPropertyValue("-webkit-app-region") || getComputedStyle(press).getPropertyValue("app-region"),
						macApp: document.documentElement.classList.contains("lh-electron"),
					};
				});
			}, PRESSES);
			for (const f of found) {
				assert.ok(f.inBand, `${f.selector} sits in the window's band`);
				assert.ok(f.hit, `${f.selector} is what a click at its centre reaches`);
				assert.equal(f.macApp, window === "mac-app");
				if (window === "mac-app") assert.equal(f.region, "no-drag", `${f.selector} is a no-drag island in the Mac app's drag band`);
			}
			await page.click(PRESSES[0]!);
			const expanded = await page.$eval(PRESSES[0]!, (el) => el.getAttribute("aria-expanded"));
			await page.close();
			assert.equal(expanded, "true", "a mouse click opens Mistakes");
		});
	}
});

describe("every page draws the window's band through one part", () => {
	it("no file but WindowPage draws an lh-drag band of its own", () => {
		const root = fileURLToPath(new URL("../", import.meta.url));
		const offenders: string[] = [];
		const walk = (dir: string) => {
			for (const name of readdirSync(dir)) {
				const path = join(dir, name);
				if (statSync(path).isDirectory()) walk(path);
				else if (/\.tsx$/.test(name) && /lh-drag absolute/.test(readFileSync(path, "utf8")) && !path.endsWith("page-frame/window-page.tsx")) offenders.push(path.slice(root.length));
			}
		};
		walk(join(root, "components"));
		walk(join(root, "app"));
		assert.deepEqual(offenders, []);
	});
});
