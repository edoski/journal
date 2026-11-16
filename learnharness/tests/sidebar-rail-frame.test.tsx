/**
 * The folded sidebar is a slim rail with its open button in the window's
 * band, where T3 Code's sidebar toggle sits, never under the band's line
 * (components/unit-inbox/unit-inbox.md, "Folded"). Round 14, in the Mac
 * app: the rail was 92px wide, as wide as the traffic lights (Edo:
 * "extremely thick"), and a 52px lights band above the button's own head
 * pushed the button under the line ("makes no sense"). The browser probe
 * that measured it: rail 92, button at y 64, the line at y 51.
 * Same tsx classic-JSX shim as the other render tests.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { SidebarRail } from "../components/unit-inbox/sidebar-rail.tsx";
import { TopBar } from "../components/top-bar.tsx";
import { TooltipProvider } from "../components/ui/tooltip.tsx";

const router = { push() {}, replace() {}, prefetch() {}, back() {}, forward() {}, refresh() {} };
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const css = read("../app/globals.css");
const classes = (el: Element | null | undefined) => (el?.getAttribute("class") ?? "").split(/\s+/);
/** The declarations of the one rule with exactly this selector. */
const rule = (selector: string) => {
	const at = css.indexOf(`${selector} {`);
	assert.ok(at >= 0, `globals.css has a rule for ${selector}`);
	return Object.fromEntries(
		css
			.slice(css.indexOf("{", at) + 1, css.indexOf("}", at))
			.split(";")
			.map((d) => d.split(":").map((s) => s.trim()))
			.filter(([k, v]) => k && v),
	) as Record<string, string>;
};
/** A length of px and rem (16px) at zoom 1, the Mac app's default. */
const px = (calc: string | undefined) =>
	[...(calc ?? "").replace(/\/ var\(--lh-zoom\)/g, "").matchAll(/([+-])?\s*([\d.]+)(px|rem)/g)].reduce((sum, [, sign, n, unit]) => sum + (sign === "-" ? -1 : 1) * Number(n) * (unit === "rem" ? 16 : 1), 0);

// electron/main.cjs: the lights start 16px in, three 12px circles 8px apart.
const lightsX = Number(read("../electron/main.cjs").match(/trafficLightPosition:\s*\{\s*x:\s*([\d.]+)/)?.[1]);
const LIGHTS_RIGHT = lightsX + 3 * 12 + 2 * 8;
const BAND = 52;
const RAIL = 48;

describe("the folded sidebar", () => {
	const { document } = parseHTML(
		`<html><body>${renderToStaticMarkup(
			<AppRouterContext.Provider value={router as never}>
				<TooltipProvider>
					<SidebarRail pathname="/" onOpen={() => {}} onNewLesson={() => {}} onSettings={() => {}} />
				</TooltipProvider>
			</AppRouterContext.Provider>,
		)}</body></html>`,
	);
	const rail = document.querySelector('[data-slot="sidebar-rail"]')!;
	const open = document.querySelector('[data-testid="sidebar-open"]')!;

	it("stays a 48px rail in the Mac app too", () => {
		const widths = [...css.matchAll(/(\.lh-electron[^{}]*)\{[^}]*\bwidth\s*:\s*([^;]+);/g)].map(([, selector, width]) => `${selector?.trim()}: ${width}`);
		assert.deepEqual(widths, [".lh-electron .lh-rail-head: calc(100% + 1px)"], "no Mac-app rule widens the rail (it was 92px); only its head covers its edge");
		assert.ok(read("../components/unit-inbox/unit-sidebar.tsx").includes('"w-12"'), "folded, the sidebar is w-12");
	});

	it("puts the open button in the band, above its line", () => {
		const head = rail.firstElementChild!;
		assert.ok(!rail.querySelector(".lh-lights-band"), "no lights band above the button's head: it pushed the button under the line");
		assert.ok(classes(head).includes("h-13"), "the head is the window's 52px band");
		assert.ok(head.contains(open), "the open button is in the head");
		const line = head.querySelector('[data-slot="sidebar-rail-rule"]')!;
		assert.ok(classes(line).includes("bottom-0"), "the line is the band's bottom edge, under the button");
		assert.ok(classes(head).includes("lh-rail-head"));
		assert.equal(rule(".lh-electron .lh-rail-head").width, "calc(100% + 1px)", "in the Mac app the head covers the rail's edge, so no line runs through the lights");
	});

	it("stands the button beside the traffic lights in the Mac app, where T3 Code puts its toggle", () => {
		assert.ok(open.closest(".lh-rail-toggle"), "the button wears the Mac app's place");
		const place = rule(".lh-electron .lh-rail-toggle");
		assert.equal(place.position, "fixed");
		assert.equal(place.top, "0");
		assert.equal(px(place.height), BAND, "centred on the band's height");
		const left = px(place.left);
		assert.equal(left, 90, "T3 Code's --desktop-window-controls-inset");
		assert.ok(left >= LIGHTS_RIGHT, `clear of the lights, which end at ${LIGHTS_RIGHT}px`);
		assert.ok(left + 28 + 12 >= RAIL, "past the rail, so it is not under the lights over the rail's head");
	});

	it("starts the page's band content past the button while folded in the Mac app", () => {
		const gutter = rule('.lh-electron main[data-sidebar="folded"] .lh-band-start');
		assert.equal(RAIL + px(gutter["padding-left"]), 90 + 28 + 12, "the toggle's right edge plus T3 Code's 12px gap");
		const bar = parseHTML(`<html><body>${renderToStaticMarkup(<TopBar size="slim" />)}</body></html>`).document.querySelector("header");
		assert.ok(classes(bar).includes("lh-band-start"), "the lesson's top bar takes the gutter");
		assert.ok(read("../components/calendar/calendar-view.tsx").includes('data-slot="calendar-toolbar" className="lh-band-start'), "the calendar's toolbar takes it");
		assert.ok(read("../components/sidebar.tsx").includes('data-sidebar={open ? "open" : "folded"}'), "the page's main says whether the sidebar is folded");
	});
});
