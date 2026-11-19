/**
 * The folded sidebar is a slim rail with its open button in the window's
 * band, where T3 Code's sidebar toggle sits, never under the band's line
 * (components/unit-inbox/unit-inbox.md, "Folded"). Round 14, in the Mac
 * app: the rail was 92px wide, as wide as the traffic lights (Edo:
 * "extremely thick"), and a 52px lights band above the button's own head
 * pushed the button under the line ("makes no sense"). The browser probe
 * that measured it: rail 92, button at y 64, the line at y 51. Then the
 * button sat centred on the band, 4pt above the lights' centre at zoom 1
 * and 2.5pt below it at 1.25 (window shots: lights at y 30, the button at
 * 26 and 32.5); Edo wants it "lined up".
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
import { RailOpenButton, SidebarRail } from "../components/unit-inbox/sidebar-rail.tsx";
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

// electron/main.cjs: the lights' corner and size, three 14pt lights 9pt
// apart (measured in the running app), and the zoom ladder.
const main = read("../electron/main.cjs");
const lights = main.match(/const TRAFFIC_LIGHTS = \{ x: ([\d.]+), y: ([\d.]+) \};/);
const lightSize = Number(main.match(/const LIGHT_SIZE = ([\d.]+);/)?.[1]);
const [lightsX, lightsY] = [Number(lights?.[1]), Number(lights?.[2])];
const LIGHTS_RIGHT = lightsX + 3 * lightSize + 2 * 9;
const LIGHTS_CENTRE = lightsY + lightSize / 2;
/** The band's centre line (`--lh-band-centre`): a browser's, then the Mac app's. */
const [BROWSER_CENTRE, MAC_CENTRE] = [...css.matchAll(/--lh-band-centre:\s*([^;]+);/g)].map(([, value]) => value!);
const ZOOMS = JSON.parse(main.match(/const ZOOM_LADDER = (\[[^\]]+\]);/)?.[1] ?? "[]") as number[];
/** A length in CSS px, the renderer's custom properties put in: + - * / and
 *  parentheses over px and rem (16px). */
const cssPx = (calc: string | undefined, vars: Record<string, number>) => {
	const tokens = (calc ?? "")
		.replace(/^calc/, "")
		.replace(/var\((--[\w-]+)\)/g, (_, name: string) => String(vars[name] ?? NaN))
		.replace(/([\d.]+)rem/g, (_, n: string) => String(Number(n) * 16))
		.replace(/([\d.]+)px/g, "$1")
		.match(/[\d.]+|NaN|[-+*/()]/g) ?? [];
	let at = 0;
	const atom = (): number => {
		const token = tokens[at++];
		if (token !== "(") return Number(token);
		const value = sum();
		at++;
		return value;
	};
	const product = () => {
		let value = atom();
		while (tokens[at] === "*" || tokens[at] === "/") value = tokens[at++] === "*" ? value * atom() : value / atom();
		return value;
	};
	const sum = () => {
		let value = product();
		while (tokens[at] === "+" || tokens[at] === "-") value = tokens[at++] === "+" ? value + product() : value - product();
		return value;
	};
	return sum();
};
const RAIL = 48;

describe("the folded sidebar", () => {
	const { document } = parseHTML(
		`<html><body>${renderToStaticMarkup(
			<AppRouterContext.Provider value={router as never}>
				<TooltipProvider>
					<SidebarRail pathname="/" onNewLesson={() => {}} onSettings={() => {}} />
					<RailOpenButton shown onOpen={() => {}} />
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
		const centre = cssPx(BROWSER_CENTRE, {});
		assert.equal(centre, 52 / 2, "a browser's centre line halves the window's 52px band");
		assert.equal(cssPx(rule(".lh-rail-head").height, { "--lh-band-centre": centre }), centre + 32 / 2, "the head ends half a 32px row under the centre line, on Home's tab underline (Edo, 16 Nov 2026: the rule was off the underline, with extra space under the button)");
		// In a browser the button is centred in the head, inside the rail's
		// 1px edge (tests/sidebar-rail-browser.test.ts measures it in Chrome).
		const place = rule(".lh-rail-toggle");
		assert.equal(place.position, "fixed");
		assert.equal(place.transform, "translate(-50%, -50%)");
		assert.equal(cssPx(place.top, { "--lh-band-centre": cssPx(BROWSER_CENTRE, {}) }), 52 / 2, "centred on the band's centre line, level with Home's course tabs");
		assert.equal(cssPx(place.left, {}), (RAIL - 1) / 2, "centred on the rail's width, inside its edge");
		const line = head.querySelector('[data-slot="sidebar-rail-rule"]')!;
		assert.ok(classes(line).includes("bottom-0"), "the line is the band's bottom edge, under the button");
		assert.ok(classes(head).includes("lh-rail-head"));
		assert.equal(rule(".lh-electron .lh-rail-head").width, "calc(100% + 1px)", "in the Mac app the head covers the rail's edge, so no line runs through the lights");
	});

	it("stands the button beside the traffic lights in the Mac app, where T3 Code puts its toggle", () => {
		assert.ok(open.closest(".lh-rail-toggle"), "the button wears the Mac app's place");
		const place = { ...rule(".lh-rail-toggle"), ...rule(".lh-electron .lh-rail-toggle") };
		assert.equal(place.position, "fixed");
		// The button's centre in window points, at every zoom: its top, less
		// half its height when it is translated up by half.
		const centre = (zoom: number) => {
			const vars = { "--lh-lights-centre": LIGHTS_CENTRE, "--lh-zoom": zoom };
			const top = cssPx(place.top, { ...vars, "--lh-band-centre": cssPx(MAC_CENTRE, vars) });
			const centred = place.transform === "translateY(-50%)";
			const height = centred ? 0 : cssPx(place.height, vars);
			return (top + height / 2) * zoom;
		};
		assert.ok(ZOOMS.length > 1 && ZOOMS.includes(1), "main.cjs has its zoom ladder");
		for (const zoom of ZOOMS) assert.ok(Math.abs(centre(zoom) - LIGHTS_CENTRE) < 1e-9, `level with the lights' centre (${LIGHTS_CENTRE}pt) at zoom ${zoom}, not ${centre(zoom)}`);
		assert.ok(main.includes("additionalArguments: [`--lh-lights-centre=${TRAFFIC_LIGHTS.y + LIGHT_SIZE / 2}`]"), "main.cjs hands the renderer the lights' centre");
		assert.ok(main.includes("trafficLightPosition: TRAFFIC_LIGHTS"), "from the same corner the lights are placed at");
		assert.ok(read("../electron/preload.cjs").includes('lightsCentre: Number(process.argv.find((arg) => arg.startsWith("--lh-lights-centre="))'), "the preload reads it");
		assert.ok(read("../components/sidebar.tsx").includes('setProperty("--lh-lights-centre", `${window.lh?.lightsCentre}px`)'), "the renderer publishes it");
		const left = px(place.left);
		assert.equal(left, 90, "T3 Code's --desktop-window-controls-inset");
		assert.ok(left >= LIGHTS_RIGHT, `clear of the lights, which end at ${LIGHTS_RIGHT}px`);
		assert.ok(left + 28 + 12 >= RAIL, "past the rail, so it is not under the lights over the rail's head");
	});

	it("starts the page's band content past the button while folded in the Mac app", () => {
		const gutter = rule('.lh-electron main[data-sidebar="folded"]')["--lh-band-gutter"];
		assert.equal(RAIL + px(gutter), 90 + 28 + 12, "the toggle's right edge plus T3 Code's 12px gap");
		assert.equal(rule('.lh-electron main[data-sidebar="folded"] .lh-band-start')["padding-left"], "var(--lh-band-gutter)", "the band's content takes the gutter");
		const bar = parseHTML(`<html><body>${renderToStaticMarkup(<TopBar size="slim" />)}</body></html>`).document.querySelector("header");
		assert.ok(classes(bar).includes("lh-band-start"), "the lesson's top bar takes the gutter");
		assert.ok(read("../components/calendar/calendar-view.tsx").includes('data-slot="calendar-toolbar" className="lh-band-start'), "the calendar's toolbar takes it");
		assert.ok(read("../components/sidebar.tsx").includes('data-sidebar={open ? "open" : "folded"}'), "the page's main says whether the sidebar is folded");
	});
});
